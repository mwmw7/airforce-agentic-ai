/**
 * labs/agent/main.ts — 관제실 Agent 의 부모 그래프. 보고 한 줄 → 자료 수집(동시) → 기억 → 판정 → 사람 결정 → 보고서
 *
 * 관제실에 짧은 보고 한 줄이 들어온다. "서울 상공에 정체불명 비행체가 떠 있어요"
 * 규정집 Worker 와 레이더 Subagent 가 동시에 자료를 모으고, 판정 모델이 의견을 내고, 최종 결정은 사람이 한다.
 *
 *            ┌─▶ searchDocs (Worker: 함수 하나, 규정집 찾기)              ─┐
 *   START ───┤                                                           ├─▶ remember ─┬─ 같은 사례 기억 있음 ──────┐ (Jev 생략)
 *            └─▶ askRadar   (Subagent: ask-radar.ts 의 agent ⇄ tools 루프) ─┘            └─ 없음 ─▶ judge (Jev) ───┴─▶ approve ─▶ writeReport ─▶ END
 *                                                                                              approve = 레이더 · 규정 · 날씨 · 기억 · Jev 를 한눈에 모아 보여 주고
 *                                                                                                        사람이 출격 / 감시 / 무시 를 고른다 (언제나 마지막은 사람)
 *                                                                                              writeReport = 사람의 결정 뒤 LLM 이 브리핑 문장을 써서 reports/ 에만 저장 (write-report.ts)
 *
 * 꼭 볼 것
 *   · Worker 와 Subagent 는 LangGraph 에겐 똑같이 "노드 하나" 다. 안에 모델 루프가 있으면 우리가 Subagent라고 부를 뿐 (TODO 1)
 *   · 같은 출발점에 선을 두 개 걸면 LangGraph 가 같은 단계에서 동시에 돌리고, 출발점을 배열로 묶은 선이 "둘 다 끝나면" 합류다 (TODO 5)
 *   · Subagent 의 긴 대화(messages)는 Subagent 칠판에만 남고, 부모 칠판에는 facts · evidence · steps 만 돌아온다 — 팀장 칠판은 결론만 (state.ts)
 *   · LLM 은 사실을 모으고(Subagent), Jev 는 판정하고, 결정은 코드가 하고, 마지막 버튼은 사람이 누른다 — 역할이 다르다
 *   · Jev 는 의견(출격 / 감시 / 무시 + 확신도)만 준다. 결정은 그 아래 코드 규칙이 한다 (TODO 6)
 *   · 똑같은 보고를 전에 판단한 적이 있으면 기억(Hindsight)이 답한다 — Jev 를 다시 부르지 않는다 (remember, TODO 8)
 *   · 보고서는 writeReport 가 쓴다. 사실과 결정은 코드가 채우고 LLM 은 문장만 다듬는다 (write-report.ts)
 *   · 실행 전체가 RUN_TIMEOUT_SEC 를 넘으면 끊는다. Subagent 안에서 모델이 늦으면 Subagent 가 사람에게 묻는다 (ask-radar.ts)
 *
 * 실행:  pnpm agent                           보고 1번
 *        pnpm agent 3                         보고 3번
 *        pnpm agent "한강에 오리 풍선이 떠요"    내가 쓴 보고
 *        pnpm agent:limit                     MAX_STEPS=1 로 Subagent 를 강제 중단 → Subagent 만 멈추고 부모는 규정집만으로 판정까지 간다
 *        pnpm agent --watch                   단계마다 들어간 값·나온 값 보기 (--watch=full 이면 전부). Subagent 안의 단계는 askRadar › agent 처럼 찍힌다
 *        LLM_MOCK_SLOW=1 pnpm agent           모델이 늦는 상황 시연 → Subagent 안에서 사람에게 묻는 화면이 뜬다
 *        pnpm see:run                         브라우저(http://localhost:3030)에서 실시간으로 보기. 보고를 무작위로 계속 돌린다 (Ctrl+C 로 끝)
 *        pnpm agent --resume <실행번호>       담당자 확인 중 Ctrl+C 로 껐던 실행을 멈춘 곳부터 이어가기 (checkpoints.sqlite)
 *        pnpm agent --all                     보고 4종을 차례로 돌리고 표로 정리. 건마다 사람이 답한다 (--answer w 를 주면 자동). JEV_MODE 바꿔 두 번 돌려 비교
 *        pnpm see:studio                      LangGraph Studio 에서 보기 (입력: { "report": "보고 한 줄" }). Subagent 는 접힌 노드로 보인다
 */
import readline from "node:readline/promises";
import { Command, END, interrupt, type LangGraphRunnableConfig, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { LLM_MODE, LLM_MODEL, LLM_TIMEOUT_SEC } from "../../src/lib/llm.js";
import { JEV_MODE, askJev, type JevQuestion, type JevResult } from "../../src/lib/jev.js";
import { blue, bold, cyan, dim, green, log, magenta, red, showDebug, yellow } from "../../src/lib/show.js";
import { LIVE, send, startLive, waitAnswerFromPage } from "../../src/lib/live.js";
import { type Case, createBank, findSameCase, MEMORY_MODE, recall, retain, showMemoryWork } from "../../src/lib/memory.js";
import { type Main as S, MainState } from "./state.js";
import { searchDocsNode } from "./search-docs.js";
import { MAX_STEPS, radarAgent, resetRadar } from "./ask-radar.js";
import { writeReportNode } from "./write-report.js";

// 실행 전체가 이 시간을 넘으면 끊는다 (호출 하나는 빨라도 여러 번 돌면 길어진다)
const RUN_TIMEOUT_SEC = Number(process.env.RUN_TIMEOUT_SEC ?? 180);
// 기억 속 보고와 이만큼(0~1) 같으면 "같은 사례" 로 보고 Jev 를 다시 부르지 않는다
const SAME_CASE = 0.9;

// 관제실에 들어온 보고들 (전부 가짜, 그냥 재미로)
const REPORTS = [
  "서울 상공에 정체불명의 둥근 비행체가 떠 있어요. 움직이지도 않고 무전에 대답도 없어요. 시민 제보가 쏟아지고 있어요!",
  "한강 위로 거대한 오리 모양 풍선이 떠내려가고 있어요. 낮고 느린데 바람 따라 김포공항 쪽으로 가는 것 같아요.",
  "잠실 상공에 밤중에 드론 수십 대가 떼로 날고 있어요. 허가받은 드론 쇼인지 아닌지 모르겠어요.",
  "옆 부대 훈련기예요. 아침에 미리 연락 온 대로 예정된 코스를 잘 날고 있고, 무전도 정상이에요.",
];

// ── 1. 단계: 수집은 search-docs.ts(Worker) · ask-radar.ts(Subagent) 에 있다. 여기엔 수집 뒤의 세 단계만 ──

/** remember: 전에 똑같은 보고가 있었나? 있으면 그때의 판정을 그대로 쓰고 Jev 를 건너뛴다 (장기 기억으로 판단하기) */
async function rememberNode(state: S): Promise<Partial<S>> {
  await createBank();
  // ===== TODO 8-1: 기억에서 같은 사례 찾기 =====
  // findSameCase(보고) 로 기억 속에서 가장 비슷한 사례를 꺼내세요. 일치도(score)가 SAME_CASE 이상이면 그때 판정을 그대로 쓴다.
  //   · 비워 두면 "기억 없음" → 늘 Jev 에게 묻는다. 같은 보고를 두 번 넣어 보면 차이가 보인다
  // ----- SOLUTION -----
  //! const found = null as { case: Case; time: string; score: number } | null; // 기억 없음
  const found = await findSameCase(state.report);
  // ----- END SOLUTION -----
  if (!found || found.score < SAME_CASE) {
    log("memory", `${dim(`[${MEMORY_MODE}]`)} 같은 사례 없음 ${dim(`(가장 비슷한 것 일치도 ${(found?.score ?? 0).toFixed(2)} < ${SAME_CASE})`)} → Jev 에게 묻는다`);
    return { memory: null };
  }
  const c = found.case;
  const when = new Date(found.time).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  log("memory", `${dim(`[${MEMORY_MODE}]`)} ${bold("같은 사례 찾음")} ${dim(`(일치도 ${found.score.toFixed(2)})`)} → ${bold(c.action)} · Jev 생략`,
    [`${dim("그때")} ${when}  ${dim("보고")} ${c.report}`, `${dim("그때 결정")} ${c.decision} ${dim(`(확신 ${Math.round(c.confidence * 100)}%)`)}`]);
  return {
    memory: { report: c.report, time: when, score: found.score },
    judgment: { action: c.action, probabilities: { [c.action]: c.confidence }, confidence: c.confidence, danger: 0, unknown: 0, decision: `${c.decision} (기억: ${when} 같은 사례)` },
  };
}

// remember 다음: 같은 사례 기억이 있으면 Jev 를 건너뛰고 바로 사람에게(approve), 없으면 judge(Jev)로
const afterRemember = (state: S): "judge" | "approve" => (state.memory ? "approve" : "judge");

/** 판단 한 건을 기억에 맡긴다. 실행번호(thread_id)가 같으면 덮어쓴다 → 사람이 승인하면 그 결과로 고쳐 쓴다 */
const saveCase = (state: S, config: LangGraphRunnableConfig, decision: string, extra: Partial<Case> = {}): Promise<void> => retain({
  id: String(config.configurable?.thread_id ?? Date.now()), report: state.report, facts: state.facts,
  action: state.judgment.action, confidence: state.judgment.confidence, decision, ...extra,
} satisfies Case);

const DANGER = ["전혀 안 위험함, 심심한 하루", "조금 신경 쓰임", "꽤 수상함", "비상! 당장 뭔가 해야 함"];
// Jev 에게 한 번에 묻는 세 질문. 고르기(choice) · 점수(score) · 예/아니오 확률(noul)
const QUESTIONS: Record<string, JevQuestion> = {
  action: { type: "choice", instructions: "report 와 facts 를 보고 관제실이 지금 뭘 해야 할까?", criteria: {
    scramble: "위험해 보인다. 전투기를 띄워서 직접 확인해야 한다",
    watch: "좀 수상하지만 아직은 지켜보면서 정보를 더 모으면 된다",
    ignore: "별일 아니다. 평소처럼 두면 된다",
  } },
  danger: { type: "score", instructions: "얼마나 위험해 보이나?", criteria: DANGER },
  unknown: { type: "noul", instructions: "정체가 무엇인지 전혀 짐작이 안 가서 정체부터 알아내야 한다", criteria: { true: "정체를 모른다", false: "무엇인지 대략 안다" } },
};
/** judge: 비슷한 기억을 떠올리고(recall), Jev 에게 세 가지를 한 번에 묻고, 코드 규칙으로 권고를 만든다. 기억에 남기는 건 approve 가 한다 */
async function judgeNode(state: S): Promise<Partial<S>> {
  // 장기 기억: 비슷한 보고가 전에 있었나? 있으면 Jev 에게 past 로 같이 보여 준다 (어제 판단을 오늘 기억한다)
  const past = await recall(state.report);

  // ===== TODO 6: Jev 에게 묻기 =====
  // askJev(근거, QUESTIONS) 한 줄로 Jev 에게 세 질문(할 일 · 위험도 · 정체불명)을 한 번에 묻습니다. 근거 = { report, facts, past }
  //   · 비워 두면 "Jev 없음" → 확신 0 의 감시 의견만 있어서, 아래 코드 규칙이 "Jev 도 헷갈려함 → 사람이 한 번 더 확인" 으로 간다
  //   · 채운 뒤에는 QUESTIONS 의 문장을 바꿔 보세요. 질문 한 줄이 결과를 바꾼다
  // ----- SOLUTION -----
  //! const res: JevResult = { answers: { action: { type: "choice", choice: "watch", confidence: 0 }, danger: { type: "score" }, unknown: { type: "noul" } }, provider: "local", ms: 0 }; // Jev 없음
  const res = await askJev({ report: state.report, facts: state.facts, past }, QUESTIONS);
  // ----- END SOLUTION -----
  const { action, danger, unknown } = res.answers;
  const confidence = action.confidence ?? 0;
  const noul = unknown.noul ?? 0;

  // 여기부터는 코드가 결정한다. Jev 는 의견만 주고, 규칙은 우리가 정한다
  let decision: string, rule: string;
  if (confidence < 0.2) [decision, rule] = ["Jev 도 헷갈려함 → 사람이 한 번 더 확인", "확신 < 20%"];
  else if (action.choice === "scramble") [decision, rule] = ["출격 준비! (최종 버튼은 지휘관이)", "scramble"];
  else if (action.choice === "watch" && noul > 0.5) [decision, rule] = ["정체부터 알아보기 (레이더 확대, 무전 재시도)", "watch + 정체불명 > 50%"];
  else if (action.choice === "watch") [decision, rule] = ["일단 지켜보기", "watch"];
  else [decision, rule] = ["별일 아님. 커피나 한 잔", "ignore"];
  log("rule", `${dim("Jev 는 의견, 결정은 코드 규칙")} · 조건 ${bold(rule)} → ${decision}`);

  const judgment = { action: action.choice ?? "?", probabilities: action.probabilities ?? {}, confidence, danger: Math.round(danger.score ?? 0), unknown: noul, decision };
  // 기억에 남기는 건 여기서 하지 않는다. 언제나 다음 단계(approve)에서 사람의 결정까지 합쳐 한 번만 retain 한다 (서버 일을 절반으로)
  return { judgment, past };
}

/** approve: 언제나 마지막은 사람. 지금까지 모은 근거(레이더 · 확대 · 비행 계획 · 날씨 · 규정 · 기억 · Jev)를 한눈에 보여 주고
 *  출격 / 감시 / 무시 를 고르게 한다. Agent 는 권고까지, 버튼은 사람이 누른다 (Human-in-the-Loop) */
async function approveNode(state: S, config: LangGraphRunnableConfig): Promise<Partial<S>> {
  const j = state.judgment;
  // 요약은 "## 제목" 과 "- 항목" 두 종류 줄로만 만든다 → 터미널(askPerson)·브라우저(live)·기억(retain) 어디서나 같은 글
  const section = (title: string, items: string[]) => (items.length ? [`## ${title}`, ...items.map((i) => `- ${i}`)] : []);
  const ev = (name: string) => state.evidence[name] ?? [];
  const 요약 = [
    ...section("보고", [state.report]),
    ...section("레이더", ev("look_radar")),
    ...section("확대해서 본 것", ev("look_closer")),
    ...section("비행 계획", ev("look_flight_plan")),
    ...section("날씨", ev("look_weather")),
    ...section("관련 규정", ev("search_docs")),
    ...section("기억", state.memory
      ? [`같은 사례 (${state.memory.time}) → 그때 ${j.action}: ${j.decision}`]
      : state.past.length ? state.past.map((p) => p.replace(/\n/g, " / ").slice(0, 160)) : ["비슷한 보고 없음"]),
    ...section("Jev 판정", [state.memory
      ? "생략 (같은 사례 기억으로 판정)"
      : `${j.action} · 확신 ${Math.round(j.confidence * 100)}% · 위험도 ${j.danger}단계 (${DANGER[j.danger]}) · 정체불명 ${Math.round(j.unknown * 100)}%`]),
    ...section("코드 권고", [j.decision]),
    ...section("모델이 정리한 사실", [state.facts ?? "(없음)"]),
  ];
  const answer = interrupt({ 문제: "종합 — 담당자가 결정합니다", 요약, 고르기: "y(출격) / w(감시 강화) / n(무시)" }) as string;
  const picked = /^(y|yes|출격)/.test(answer) ? "scramble" : /^(w|watch|감시)/.test(answer) ? "watch" : /^(n|no|무시)/.test(answer) ? "ignore" : "watch";
  const label = { scramble: "출격", watch: "감시 강화", ignore: "무시" }[picked];
  const decision = `${label} — 사람이 결정${/^(y|yes|출격|w|watch|감시|n|no|무시)/.test(answer) ? "" : " (답 없음 → 감시)"}`;
  // 사람의 결정으로 기억을 고쳐 쓴다 (같은 실행번호 → 덮어쓰기). 사람이 본 종합 근거(요약)와 최종 선택까지 같이 남긴다
  // → 다음에 같은 보고가 오면 사람이 고른 쪽으로 떠오르고, "그때 무엇을 보고 그렇게 정했나" 도 기억에 있다 — 사람이 가르친 셈
  // ===== TODO 8-2: 오늘 판단을 기억에 남기기 =====
  // saveCase(칠판, config, 결정, { summary, human }) 한 줄. 사람이 고른 쪽(picked)으로 판정을 바꿔 남긴다
  //   · summary = 사람이 본 종합 근거(요약에서 "## 모델이 정리한 사실" 앞까지), human = 사람의 선택(label)
  // ----- SOLUTION -----
  //! // 기억에 남기지 않는다 → 다음에 같은 보고가 와도 처음 보는 일
  await saveCase({ ...state, judgment: { ...j, action: picked } }, config, decision, { summary: 요약.slice(0, 요약.indexOf("## 모델이 정리한 사실")), human: label });
  // ----- END SOLUTION -----
  return { judgment: { ...j, decision }, summary: 요약 };
}

// ── 2. 조립: 단계들을 선으로 잇는다 ── (export: pnpm see:graph · Studio 가 가져다 쓴다)
export const graph = new StateGraph(MainState)
  .addNode("searchDocs", searchDocsNode)               // Worker: 함수 하나
  // ===== TODO 1: 레이더 Subagent(서브그래프)를 노드로 꽂기 =====
  // ask-radar.ts 의 radarAgent(compile 된 그래프)를 "askRadar" 라는 이름의 노드로 넣으세요. 함수 대신 그래프를 넣어도 LangGraph 에겐 똑같은 노드입니다.
  //   · 비워 두면 아래 자리표시(레이더 없는 가짜 Subagent)로 돌아간다 → approve 화면에 레이더 · 확대 · 날씨 줄이 없다. Subagent 가 없으면 눈이 없다
  // ----- SOLUTION -----
  //! .addNode("askRadar", async () => ({ facts: "(TODO 1: 레이더 Subagent 가 아직 없어서 확인한 사실이 없습니다)" }))
  .addNode("askRadar", radarAgent)                     // Subagent: 안에 agent ⇄ tools 루프가 있는 그래프
  // ----- END SOLUTION -----
  .addNode("remember", rememberNode)
  .addNode("judge", judgeNode)
  .addNode("approve", approveNode)
  .addNode("writeReport", writeReportNode)            // 사람이 결정한 뒤에만 LLM 이 보고서 문장을 쓴다
  // ===== TODO 5: 동시에 수집하고 합류하기 =====
  // 자리표시는 순차다: START → searchDocs → askRadar → remember (규정집이 끝나야 레이더가 출발한다)
  // 같은 출발점(START)에 선 두 개를 걸면 LangGraph 가 같은 단계에서 둘을 동시에 돌린다.
  // 합류는 출발점을 배열로 묶은 선 하나: .addEdge(["searchDocs", "askRadar"], "remember") — "둘 다 끝나면 한 번" 다음으로
  //   · --watch 로 보면 자리표시는 searchDocs 가 끝난 뒤에야 askRadar 가 시작하고, 채우면 둘이 같이 시작한다 (실제 모델이면 시간도 준다)
  //   · LangGraph 는 한 단계의 노드가 전부 끝나야 다음 단계로 간다. 그래서 선을 따로 그어도 합류되지만, 배열로 묶으면 "둘 다 끝나야" 가 코드에 보이고 가지 길이가 달라도 안전하다
  // ----- SOLUTION -----
  //! .addEdge(START, "searchDocs")
  //! .addEdge("searchDocs", "askRadar")
  //! .addEdge("askRadar", "remember")
  .addEdge(START, "searchDocs")
  .addEdge(START, "askRadar")
  .addEdge(["searchDocs", "askRadar"], "remember")
  // ----- END SOLUTION -----
  .addConditionalEdges("remember", afterRemember, ["judge", "approve"])
  .addEdge("judge", "approve")   // Jev 가 뭐라 하든 마지막은 사람
  .addEdge("approve", "writeReport")   // 출격이든 무시든 보고서는 남긴다
  .addEdge("writeReport", END)
  // 멈췄다 이어가려면 진행 상황(checkpoint)을 저장할 곳이 필요하다. LangGraph 가 주는 SqliteSaver 를 꽂으면
  // 단계마다 checkpoints.sqlite 파일에 저장된다 → 프로그램을 껐다 켜도 --resume 으로 멈춘 곳부터 이어간다 (직접 SQL 은 한 줄도 없다)
  // Subagent(askRadar) 안의 단계도 같은 파일에, 같은 실행번호 아래 저장된다
  .compile({ checkpointer: SqliteSaver.fromConnString("checkpoints.sqlite") });

// ── 3. 실행: 보고 하나를 넣고 돌린다 ──
// 이 파일을 직접 실행할 때만 돈다 (pnpm see:graph 가 import 할 때는 그림만 그린다)
if (process.argv[1]?.endsWith("main.ts")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  /** 사람에게 묻는다. 터미널 입력과 브라우저 버튼(--live) 중 먼저 온 답을 쓴다 */
  /** "## 제목" 은 출처별 색으로 굵게(도구는 초록, MCP 는 하늘색, 기억은 파랑, Jev 는 노랑, 모델은 보라), "- 항목" 은 들여쓴 점, 긴 줄은 접는다.
   *  판정 낱말(scramble · watch · ignore)은 빨강 · 노랑 · 초록 */
  function pretty(lines: string[]): string[] {
    const width = 100;
    const titleColor: Record<string, (s: string) => string> = {
      "보고": (t) => bold(t), "레이더": green, "확대해서 본 것": green, "비행 계획": green, "날씨": cyan, "관련 규정": green,
      "기억": blue, "Jev 판정": yellow, "코드 권고": (t) => bold(t), "모델이 정리한 사실": magenta,
    };
    const verdict = (t: string) => t.replace(/\bscramble\b|출격/g, (m) => red(bold(m))).replace(/\bwatch\b|감시 강화|감시/g, (m) => yellow(m)).replace(/\bignore\b|무시/g, (m) => green(m));
    // 먼저 글자 수로 접고(색 코드가 잘리지 않게), 그 다음에 색을 입힌다
    const wrap = (text: string): string[] => { const out: string[] = []; for (let rest = text; rest.length; rest = rest.slice(width)) out.push(rest.slice(0, width)); return out; };
    let current = "";
    return lines.flatMap((l) => {
      if (l.startsWith("## ")) { current = l.slice(3); return [(titleColor[current] ?? bold)(bold(current))]; }
      const item = l.startsWith("- ") ? l.slice(2) : l;
      const colorize = current === "Jev 판정" || current === "코드 권고" || current === "기억";
      return wrap(item).map((piece, i) => (i ? "    " : `  ${dim("·")} `) + (colorize ? verdict(piece) : piece));
    });
  }

  // --answer w 처럼 답을 미리 정해 두면 묻지 않고 바로 그 답을 쓴다. 안 주면 --all 이라도 건마다 사람에게 묻는다
  const AUTO = process.argv.includes("--answer") ? process.argv[process.argv.indexOf("--answer") + 1] : "";

  async function askPerson(question: { 문제: string; 요약?: string[]; 고르기: string }): Promise<string> {
    log("human", bold(question.문제), pretty(question.요약 ?? []));
    send("waiting", { question: [question.문제, ...(question.요약 ?? [])].join("\n"), choices: question.고르기 });
    if (AUTO) { log("human", `답: ${bold(AUTO)} ${dim("(--answer 로 미리 정함)")}`); send("answered", { answer: AUTO }); return AUTO; }
    const ac = new AbortController();
    const fromTerminal = rl.question(`         ${dim("│")} ${question.고르기} > `, { signal: ac.signal }).catch(() => new Promise<string>(() => {})); // 취소되면 그냥 조용히
    const fromPage = LIVE ? waitAnswerFromPage() : new Promise<string>(() => {});
    const answer = (await Promise.race([fromTerminal, fromPage])).trim().toLowerCase() || "skip";
    ac.abort();
    log("human", `답: ${bold(answer)}`);
    send("answered", { answer });
    return answer;
  }

  /** 보고 하나를 끝까지 돌린다: 처음 돌리고, 멈추면(askHuman·approve) 사람에게 물어 Command({ resume }) 로 이어간다
   *  resumeId 가 있으면 새로 시작하지 않고, 그 실행번호로 저장된 곳(checkpoints.sqlite)부터 이어간다 */
  async function runOnce(report: string, round: number, resumeId?: string): Promise<S> {
    // thread_id = 이 실행의 번호 (멈췄다 이어갈 때 같은 번호로 찾는다) / recursionLimit = LangGraph 자체 안전장치 / runName = LangSmith 에 올라갈 때 기록 이름
    const threadId = resumeId ?? `loop-${round}-${Date.now()}`;
    const config = { configurable: { thread_id: threadId }, recursionLimit: MAX_STEPS * 2 + 5, runName: `loop.round-${round}` };
    if (resumeId) {
      report = (await graph.getState(config)).values.report ?? "";
      if (!report) { log("stop", `실행번호 ${resumeId} 의 저장 기록이 없습니다 (checkpoints.sqlite)`); process.exit(1); }
      log("setup", `이어가기 — 실행번호 ${resumeId} 의 멈춘 곳부터`);
    }
    console.log(dim("\n" + "─".repeat(72)));
    log("report", bold(report));
    log("setup", `모델 ${LLM_MODE === "mock" ? "mock" : `${LLM_MODEL} (${LLM_MODE})`} · Jev ${JEV_MODE} · 기억 ${MEMORY_MODE}`, [
      dim(`모델 한 번 ${LLM_TIMEOUT_SEC}초 · 실행 전체 ${RUN_TIMEOUT_SEC}초 · 최대 ${MAX_STEPS}회 · 실행번호 ${threadId} (멈추면 pnpm agent --resume ${threadId})`),
    ]);
    send("run_start", { round, report });
    resetRadar(); // 보고마다 레이더 화면을 새로 짓는다

    const input = { report };  // 대화의 첫 줄(역할 설명 + 보고)은 agent 노드가 스스로 연다
    let result = {} as S;

    /** 그래프를 돌린다. values: 단계마다 칠판 전체 / debug: 들어간 값·나온 값 (--watch 터미널, --live 브라우저)
     *  subgraphs: true → Subagent(askRadar) 안의 단계도 흘러나온다. 그때는 맨 앞에 "어느 Subagent 안인지"(namespace)가 붙는다 */
    async function run(what: unknown) {
      for await (const [ns, mode, chunk] of await graph.stream(what as never, { ...config, streamMode: ["values", "debug"], subgraphs: true })) {
        if (mode === "debug") showDebug(chunk as never, ns.length ? "askRadar" : "");
        else if (ns.length === 0 && !("__interrupt__" in (chunk as object))) result = chunk; // 칠판은 부모 것만 받는다 (Subagent 칠판은 Subagent 안에). 멈춤 알림 조각은 칠판이 아니라 건너뛴다
      }
    }
    async function runWithHuman() {
      if (!resumeId) await run(input); // 이어가기면 처음부터 돌리지 않는다. 저장된 멈춘 곳(아래 interrupt)부터
      for (;;) {
        // 그래프가 interrupt() 에서 멈춰 있으면 그 질문이 state.tasks 에 들어 있다. 없으면 끝까지 돈 것
        const question = (await graph.getState(config)).tasks.flatMap((t) => t.interrupts ?? [])[0]?.value as { 문제: string; 요약?: string[]; 고르기: string } | undefined;
        if (!question) break;
        // ===== TODO 7: 사람의 답으로 멈춘 곳부터 이어가기 =====
        // askPerson(question) 으로 답을 받고, run(new Command({ resume: 답 })) 으로 그래프를 다시 돌리세요.
        //   · 같은 config(thread_id) 로 돌리면 LangGraph 가 checkpoints.sqlite 에서 멈춘 곳을 찾아 그 답을 interrupt() 의 반환값으로 넣어 준다
        //   · 그래서 Ctrl+C 로 껐다가 pnpm agent --resume <실행번호> 로 켜도 같은 줄에서 이어진다
        // ----- SOLUTION -----
        //! const answer = await askPerson(question);
        //! log("stop", `답(${answer})을 받았지만 그래프를 이어가지 않았습니다 — TODO 7`);
        //! break; // ← 이대로면 답을 받고도 이어가지 않습니다
        await run(new Command({ resume: await askPerson(question) }));
        // ----- END SOLUTION -----
      }
    }

    // 실행 전체 시간 제한: 둘 중 먼저 끝나는 쪽. 모델이 아무리 늦어도 RUN_TIMEOUT_SEC 가 지나면 내 코드가 끊는다
    const tooLong = new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error(`실행 전체가 ${RUN_TIMEOUT_SEC}초를 넘었습니다`), { name: "RunTimeout" })), RUN_TIMEOUT_SEC * 1000).unref());
    try {
      await Promise.race([runWithHuman(), tooLong]);
    } catch (e: any) {
      if (e?.name === "RunTimeout") {
        const msg = `[중단] ${e.message}. 내 코드가 끊었습니다 (모델 호출 ${result.steps ?? 0}회까지 진행).`;
        log("stop", msg);
        send("stopped", { message: msg });
        return result;
      }
      if (e?.lc_error_code !== "GRAPH_RECURSION_LIMIT") throw e;
      // 여기까지 왔다 = route 가 반복을 끊지 못했다는 뜻 (ask-radar.ts 의 route 를 고쳤다면 거기를 확인)
      log("stop", "반복이 멈추지 않아 LangGraph 가 강제로 끊었습니다. ask-radar.ts 의 route(MAX_STEPS) 를 확인하세요.");
      process.exit(1);
    }

    const j = result.judgment;
    const who = LLM_MODE === "mock" ? "가짜 모델(mock)" : LLM_MODEL;
    const by = !j ? "" : result.memory ? "기억으로 판단 · Jev 생략" : `Jev ${j.action} ${Math.round(j.confidence * 100)}% + 코드 규칙`;
    log("decide", bold(j?.decision ?? "없음 — 사실 확인이 끝나기 전에 멈췄습니다") + (by ? `  ${dim("← " + by)}` : ""),
      [`${dim(`사실 (${who} ${result.steps}회 호출)`)} ${result.facts}`]);
    await showMemoryWork(); // Hindsight 가 뒤에서 한 일(사실 추출 · 링크 · consolidation)을 숫자로
    send("run_end", { decision: j?.decision ?? "없음 — 사실 확인이 끝나기 전에 멈췄습니다", facts: result.facts });
    return result;
  }

  if (LIVE) {
    // 브라우저 시연: 보고를 무작위로 계속 돌린다. 4번에 1번쯤은 모델이 "늦은 척" 해서 사람에게 묻는 장면도 나온다
    await startLive(graph);
    for (let round = 1; ; round++) {
      process.env.LLM_MOCK_SLOW = Math.random() < 0.25 ? "once" : "";
      await runOnce(REPORTS[Math.floor(Math.random() * REPORTS.length)], round);
      log("setup", dim("5초 뒤 다음 보고"));
      send("round_wait", { sec: 5 });
      await new Promise((r) => setTimeout(r, 5000));
    }
  } else if (process.argv.includes("--all")) {
    // 보고 4종을 차례로 돌리고 표 하나로 정리한다. 건마다 담당자(사람)에게 묻는다. --answer w 를 주면 자동 답. JEV_MODE 만 바꿔 두 번 돌려 비교하는 용도
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < REPORTS.length; i++) {
      const r = await runOnce(REPORTS[i], i + 1);
      const j = r.judgment;
      rows.push({
        보고: `${i + 1}. ${REPORTS[i].slice(0, 22)}…`,
        판정: j ? (r.memory ? "기억" : JEV_MODE) : "-",
        의견: j?.action ?? "-",
        확신: j ? `${Math.round(j.confidence * 100)}%` : "-",
        위험도: j ? `${j.danger}단계` : "-",
        결정: j?.decision.replace(" — 사람이 결정", "") ?? "없음",
      });
    }
    log("decide", `${bold("보고 4종 결과")} ${dim(`(모델 ${LLM_MODE} · 판정 ${JEV_MODE} · 기억 ${MEMORY_MODE} · 담당자 답 ${AUTO || "사람이 직접"})`)}`);
    console.table(rows);
    rl.close();
  } else if (process.argv.includes("--resume")) {
    // 멈춘 실행 이어가기: pnpm agent --resume <실행번호>
    const id = process.argv[process.argv.indexOf("--resume") + 1];
    if (!id) { console.error("실행번호가 필요합니다: pnpm agent --resume loop-1-1234567890"); process.exit(1); }
    await runOnce("", 1, id);
    rl.close();
  } else {
    // 첫 번째 일반 인자가 보고. 숫자면 REPORTS 에서 고르고, 문장이면 그대로 쓴다 (--watch 같은 옵션은 제외)
    const arg = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "1";
    await runOnce(/^\d+$/.test(arg) ? REPORTS[Number(arg) - 1] ?? REPORTS[0] : arg, 1);
    rl.close();
  }
}
