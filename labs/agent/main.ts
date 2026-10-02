/**
 * labs/agent/main.ts — LangGraph 로 만드는 가장 작은 Agent. 여기서 출발해 한 단계씩 기능을 붙여 나간다
 *
 * 관제실에 짧은 보고 한 줄이 들어온다. "서울 상공에 정체불명 비행체가 떠 있어요"
 * Agent 는 도구로 사실을 확인하고(LLM), 판정 모델이 의견을 내고(Jev), 최종 결정은 코드가 한다.
 *
 *   START ─▶ agent ─┬─ 도구 쓰고 싶다   ─▶ tools ─▶ agent … (반복)
 *                   ├─ 다 확인했다     ─▶ judge ─┬─ 출격 아님 ─▶ END          (Jev 판정 + 코드가 결정)
 *                   │                           └─ 출격!   ─▶ approve ─▶ END  (멈추고 사람이 승인/반려)
 *                   ├─ 너무 많이 돌았다 ─▶ stop  ─▶ END   (내 코드가 강제로 멈춤)
 *                   └─ 모델이 늦다     ─▶ askHuman ─▶ 사람이 고름: retry → agent / skip → judge / stop → stop
 *
 * 꼭 볼 것
 *   · 모델은 "이 도구를 써 달라" 고 말할 뿐, 실제로 실행하는 건 tools 단계(내 코드)다
 *   · 언제 멈출지(MAX_STEPS)도 모델이 아니라 route 함수(내 코드)가 정한다
 *   · LLM 은 사실을 모으고, Jev 는 판정하고, 결정은 코드가 한다 — 역할이 다르다
 *   · 출격처럼 큰 결정은 코드도 모델도 아닌 사람이 한다 (approve 에서 멈추고 묻는다)
 *   · 모델이 늦으면(LLM_TIMEOUT_SEC) 끊고 사람에게 묻는다. 실행 전체도 RUN_TIMEOUT_SEC 를 넘으면 끊는다
 *
 * 실행:  pnpm agent                           보고 1번
 *        pnpm agent 3                         보고 3번
 *        pnpm agent "한강에 오리 풍선이 떠요"    내가 쓴 보고
 *        pnpm agent:limit                     MAX_STEPS=1 로 강제 중단 → 멈춘 이유가 내 코드에서 나오는지 확인
 *        pnpm agent --watch                   단계마다 들어간 값·나온 값 보기 (--watch=full 이면 전부)
 *        LLM_MOCK_SLOW=1 pnpm agent           모델이 늦는 상황 시연 → 사람에게 묻는 화면이 뜬다
 *        pnpm agent:live                      브라우저(http://localhost:3030)에서 실시간으로 보기. 보고를 무작위로 계속 돌린다 (Ctrl+C 로 끝)
 *        pnpm studio                          LangGraph Studio 에서 보기 (입력: { "report": "보고 한 줄" })
 */
import { readFileSync } from "node:fs";
import readline from "node:readline/promises";
import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { chat, isTimeout, LLM_MODE, LLM_MODEL, LLM_TIMEOUT_SEC, type Msg, type Tool } from "../../src/lib/llm.js";
import { askJev } from "../../src/lib/jev.js";
import { showDebug, showTool } from "../../src/lib/show.js";
import { LIVE, send, startLive, waitAnswerFromPage } from "../../src/lib/live.js";

// 모델을 최대 몇 번까지 부를지. 이 숫자를 넘으면 내 코드가 멈춘다
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 8);
// 실행 전체가 이 시간을 넘으면 끊는다 (호출 하나는 빨라도 여러 번 돌면 길어진다)
const RUN_TIMEOUT_SEC = Number(process.env.RUN_TIMEOUT_SEC ?? 180);

// 관제실에 들어온 보고들 (전부 가짜, 그냥 재미로)
const REPORTS = [
  "서울 상공에 정체불명의 둥근 비행체가 떠 있어요. 움직이지도 않고 무전에 대답도 없어요. 시민 제보가 쏟아지고 있어요!",
  "한강 위로 거대한 오리 모양 풍선이 떠내려가고 있어요. 낮고 느린데 바람 따라 김포공항 쪽으로 가는 것 같아요.",
  "잠실 상공에 밤중에 드론 수십 대가 떼로 날고 있어요. 허가받은 드론 쇼인지 아닌지 모르겠어요.",
  "옆 부대 훈련기예요. 아침에 미리 연락 온 대로 예정된 코스를 잘 날고 있고, 무전도 정상이에요.",
];

// ── 1. 도구: 설명(모델이 읽는 것) + 실행 함수(내 코드가 돌리는 것) ──
const readJson = (file: string) => JSON.parse(readFileSync(new URL(`../../data/api/${file}`, import.meta.url), "utf8"));
type RadarRow = Record<string, string>;

const tools: Tool[] = [
  { type: "function", function: { name: "look_radar", description: "레이더 화면을 한 번 본다. 한 번에 하나만 잡히므로 찾는 게 안 보이면 다시 봐야 한다. 자세한 건 안 보인다. (교육용 합성 자료)", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "look_weather", description: "지금 날씨(하늘·구름·바람·시야·비행 가능 여부)를 한 번 본다. (교육용 합성 자료)", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "look_closer", description: "레이더 화면에서 한 자리만 확대해 자세히 본다. 수상한 게 있으면 꼭 써 보라. (교육용 합성 자료)",
      parameters: { type: "object", properties: { 어디: { type: "string", description: "look_radar 목록의 '어디' 값. 예: 잠실 위" } }, required: ["어디"] } } },
];

// 모델이 고른 도구 이름과 입력값을 받아 실제로 실행한다
const pickOne = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]; // 관측은 볼 때마다 하나씩, 무작위로
function runTool(name: string, args: Record<string, unknown>): string {
  const rows: RadarRow[] = readJson("radar-screen.json");
  if (name === "look_radar") { const { 자세히, _notice, ...row } = pickOne(rows); return JSON.stringify(row); }   // '자세히' 는 숨긴다 → 확대해야 보인다
  if (name === "look_weather") { const { _notice, ...w } = pickOne(readJson("weather.json") as RadarRow[]); return JSON.stringify(w); }
  if (name === "look_closer") {
    const where = String(args.어디 ?? "");
    const row = rows.find((r) => where.includes(r.어디.split(" ")[0]));                       // "잠실 위" → "잠실" 로 찾는다
    return row ? JSON.stringify({ 어디: row.어디, 뭐가: row.뭐가, 자세히: row.자세히 }) : JSON.stringify({ 결과: `레이더에 '${where}' 자리는 없음` });
  }
  return JSON.stringify({ error: `모르는 도구: ${name}` });
}

// ── 2. 공유 기록(칠판): 대화는 뒤에 '이어 붙이기', 호출 횟수는 '더하기', 나머지는 덮어쓰기 ──
const LoopState = Annotation.Root({
  report: Annotation<string>(),                                                                       // 들어온 보고 한 줄
  messages: Annotation<Msg[]>({ reducer: (prev, next) => [...prev, ...next], default: () => [] }),  // 모델과 주고받은 대화
  steps: Annotation<number>({ reducer: (prev, next) => prev + next, default: () => 0 }),            // 모델을 부른 횟수
  facts: Annotation<string>(),                                                                        // agent 가 도구로 확인해 정리한 사실
  judgment: Annotation<Judgment>(),                                                                   // judge 의 결과
  stuck: Annotation<string>(),                                                                        // 모델이 늦었을 때 그 이유 (비어 있으면 정상)
  humanChoice: Annotation<string>(),                                                                  // 사람이 고른 것: retry / skip / stop
});
type S = typeof LoopState.State;
interface Judgment { action: string; probabilities: Record<string, number>; confidence: number; danger: number; unknown: number; decision: string }

// ── 3. 단계 ──

/** agent: 모델을 한 번 부른다. 답변이든 도구 요청이든 모델의 말로 기록에 남긴다 */
// 모델에게 주는 역할 설명 (대화의 첫 줄). 그래프 안에서 넣어야 터미널·Studio 어디서 돌려도 같다
const SYSTEM = "너는 관제실 보조다. 보고를 받으면 레이더를 봐라. 한 번에 하나만 잡히니 보고와 관련된 게 나올 때까지 몇 번 더 봐도 된다. 관련된 자리는 look_closer 로 확대해 자세히 확인하라. 필요하면 날씨도 본다. 확인된 사실만 한국어 2~3줄로 정리하고, 판단은 하지 마라.";

async function agentNode(state: S): Promise<Partial<S>> {
  const step = state.steps + 1;
  // 첫 호출이면 대화를 연다: 역할 설명 + 보고 한 줄. (입력에 report 만 있어도 돌아간다 — Studio 에서 { "report": "..." } 만 넣으면 됨)
  const opening: Msg[] = state.messages.length ? [] : [{ role: "system", content: SYSTEM }, { role: "user", content: state.report }];
  const history = [...state.messages, ...opening];
  // 매번 묻는 건 같다: "도구를 더 쓸래, 아니면 지금까지 본 걸로 사실을 정리할래?" — 둘 중 하나를 모델이 고른다
  console.log(`\n── 모델 호출 ${step}회째 (${LLM_MODE === "mock" ? "가짜 모델 mock" : LLM_MODEL}) · 도구를 더 쓸지, 사실을 정리할지 묻는다 ──`);
  let reply;
  try {
    reply = await chat(history, tools, { label: `loop.step${step}` });
  } catch (e) {
    if (!isTimeout(e)) throw e;
    // 늦었다 → 여기서 정하지 않고 이유만 적는다. 다음에 뭘 할지는 사람에게 묻는다 (askHuman)
    return { steps: 1, stuck: `${LLM_MODE === "mock" ? "가짜 모델" : LLM_MODEL} 이 ${LLM_TIMEOUT_SEC}초 안에 답하지 않았습니다 (${step}회째 호출)` };
  }
  console.log(reply.toolCalls.length
    ? `   모델의 선택: 도구 쓰기 → ${reply.toolCalls.map((c) => c.name).join(", ")}`
    : `   모델의 선택: 사실 정리 (도구 안 씀, 답을 썼다)`);

  const assistant: Msg = reply.toolCalls.length
    ? {
        role: "assistant",
        content: reply.content || null,
        tool_calls: reply.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      }
    : { role: "assistant", content: reply.content };
  return { messages: [...opening, assistant], steps: 1, facts: reply.content };
}

/** tools: 모델이 바로 앞에서 쓰고 싶다고 한 도구를 실행하고, 결과를 기록에 남긴다 */
async function toolsNode(state: S): Promise<Partial<S>> {
  const last = state.messages.at(-1);
  const calls = last?.role === "assistant" ? (last.tool_calls ?? []) : [];

  // ===== TODO 1: 도구를 실행하고 결과를 모델에게 돌려주기 =====
  // calls 를 하나씩 runTool(이름, 입력값) 으로 실행하고,
  // 결과를 { role: "tool", tool_call_id: call.id, content: 결과 } 모양으로 만들어 { messages } 로 반환하세요.
  //   · call.function.arguments 는 JSON "글자" 이므로 JSON.parse 로 풀어서 넘깁니다 (예: {"어디":"잠실 위"})
  //   · 반환한 messages 는 공유 기록 뒤에 자동으로 이어 붙여집니다
  // [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일
  return { messages: [] };
}

/** judge: Jev 에게 세 가지를 한 번에 묻고, 최종 결정은 코드 규칙으로 */
const DANGER = ["전혀 안 위험함, 심심한 하루", "조금 신경 쓰임", "꽤 수상함", "비상! 당장 뭔가 해야 함"];
async function judgeNode(state: S): Promise<Partial<S>> {
  const res = await askJev({ report: state.report, facts: state.facts }, {
    action: { type: "choice", instructions: "report 와 facts 를 보고 관제실이 지금 뭘 해야 할까?", criteria: {
      scramble: "위험해 보인다. 전투기를 띄워서 직접 확인해야 한다",
      watch: "좀 수상하지만 아직은 지켜보면서 정보를 더 모으면 된다",
      ignore: "별일 아니다. 평소처럼 두면 된다",
    } },
    danger: { type: "score", instructions: "얼마나 위험해 보이나?", criteria: DANGER },
    unknown: { type: "noul", instructions: "정체가 무엇인지 전혀 짐작이 안 가서 정체부터 알아내야 한다", criteria: { true: "정체를 모른다", false: "무엇인지 대략 안다" } },
  });
  const { action, danger, unknown } = res.answers;
  const confidence = action.confidence ?? 0;
  const noul = unknown.noul ?? 0;

  // 여기부터는 코드가 결정한다. Jev 는 의견만 주고, 규칙은 우리가 정한다
  let decision: string;
  if (confidence < 0.2) decision = "Jev 도 헷갈려함 → 사람이 한 번 더 확인";
  else if (action.choice === "scramble") decision = "출격 준비! (최종 버튼은 지휘관이)";
  else if (action.choice === "watch" && noul > 0.5) decision = "정체부터 알아보기 (레이더 확대, 무전 재시도)";
  else if (action.choice === "watch") decision = "일단 지켜보기";
  else decision = "별일 아님. 커피나 한 잔";

  return { judgment: { action: action.choice ?? "?", probabilities: action.probabilities ?? {}, confidence, danger: Math.round(danger.score ?? 0), unknown: noul, decision } };
}

/** askHuman: 모델이 늦었을 때 그래프를 멈추고 사람에게 묻는다 (Human-in-the-Loop) */
async function askHumanNode(state: S): Promise<Partial<S>> {
  // interrupt(질문) 에서 그래프가 멈추고 질문이 실행부(6번)로 전달된다. 사람이 답하면 이 함수가 다시 돌고, 이번엔 interrupt 가 그 답을 돌려준다
  const answer = interrupt({ 문제: state.stuck, 고르기: "retry(다시 부르기) / skip(사실 없이 판정으로) / stop(그만)" }) as string;
  const facts = answer === "skip" ? `(모델 답 없음 — 담당자가 건너뛰어 사실 없이 판정. 이유: ${state.stuck})` : state.facts;
  return { humanChoice: answer, stuck: "", facts };
}

/** approve: Jev 가 출격이라고 하면 멈추고 사람에게 승인을 받는다. Agent 는 권고까지, 출격 버튼은 사람이 누른다 */
async function approveNode(state: S): Promise<Partial<S>> {
  const j = state.judgment;
  const answer = interrupt({
    문제: `Jev 가 출격을 권고했습니다 (확신 ${Math.round(j.confidence * 100)}% · 위험도 ${j.danger}단계). 사실: ${state.facts}`,
    고르기: "y(출격 승인) / n(반려, 감시 유지)",
  }) as string;
  const approved = /^(y|yes|승인)/.test(answer);
  return { judgment: { ...j, decision: approved ? "출격 승인 — 사람이 결정" : "출격 반려, 감시 유지 — 사람이 결정" } };
}

// judge 다음: 출격이면 사람에게, 아니면 끝
const afterJudge = (state: S): "approve" | typeof END => (state.judgment.action === "scramble" ? "approve" : END);

/** stop: 내 코드가 반복을 끊을 때 들르는 단계 */
async function stopNode(state: S): Promise<Partial<S>> {
  const why = state.humanChoice === "stop" ? "담당자가 그만하라고 했습니다" : `모델을 이미 ${MAX_STEPS}번 불렀습니다. 더 부르지 않고 내 코드가 멈췄습니다`;
  const stopped = `[중단] ${why}.`;
  console.log(stopped);
  return { facts: stopped };
}

// ── 4. 다음 단계 정하기: agent 다음에 어디로 갈까 ──
function route(state: S): "tools" | "judge" | "stop" | "askHuman" {
  if (state.stuck) return "askHuman"; // 모델이 늦었다 → 사람에게
  const last = state.messages.at(-1);
  const wantsTool = last?.role === "assistant" && (last.tool_calls?.length ?? 0) > 0;

  // ===== TODO 2: 강제로 멈추는 건 모델이 아니라 내 코드다 =====
  // · 모델이 도구를 원하지 않으면 → "judge" (사실 확인 끝, 판정으로)
  // · 도구를 원하는데 이미 MAX_STEPS 만큼 모델을 불렀으면(state.steps >= MAX_STEPS) → "stop"
  // · 그 외 → "tools"
  // [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일
  return wantsTool ? "tools" : "judge"; // ← 이대로면 모델이 도구를 계속 원하는 한 끝나지 않습니다
}

// 사람의 답에 따라: retry → agent 다시 / skip → judge / stop → stop
function afterHuman(state: S): "agent" | "judge" | "stop" {
  if (state.humanChoice === "retry") return "agent";
  if (state.humanChoice === "stop") return "stop";
  return "judge";
}

// ── 5. 조립: 단계들을 선으로 잇는다 ── (export: pnpm graph 가 그림을 그릴 때 가져다 쓴다)
export const graph = new StateGraph(LoopState)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("askHuman", askHumanNode)
  .addNode("judge", judgeNode)
  .addNode("approve", approveNode)
  .addNode("stop", stopNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", route, ["tools", "judge", "stop", "askHuman"])
  .addEdge("tools", "agent")
  .addConditionalEdges("askHuman", afterHuman, ["agent", "judge", "stop"])
  .addConditionalEdges("judge", afterJudge, ["approve", END])
  .addEdge("approve", END)
  .addEdge("stop", END)
  // 멈췄다 이어가려면 진행 상황을 저장할 곳이 필요하다. 여기선 메모리(프로그램 끄면 사라짐), 실습 2 는 sqlite 파일
  .compile({ checkpointer: new MemorySaver() });

// ── 6. 실행: 보고 하나를 넣고 돌린다 ──
// 이 파일을 직접 실행할 때만 돈다 (pnpm graph 가 import 할 때는 그림만 그린다)
if (process.argv[1]?.endsWith("main.ts")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  /** 사람에게 묻는다. 터미널 입력과 브라우저 버튼(--live) 중 먼저 온 답을 쓴다 */
  async function askPerson(question: { 문제: string; 고르기: string }): Promise<string> {
    console.log(`\n[담당자 확인] ${question.문제}`);
    send("waiting", { question: question.문제, choices: question.고르기 });
    const ac = new AbortController();
    const fromTerminal = rl.question(`${question.고르기} > `, { signal: ac.signal }).catch(() => new Promise<string>(() => {})); // 취소되면 그냥 조용히
    const fromPage = LIVE ? waitAnswerFromPage() : new Promise<string>(() => {});
    const answer = (await Promise.race([fromTerminal, fromPage])).trim().toLowerCase() || "skip";
    ac.abort();
    console.log(`   → ${answer}`);
    send("answered", { answer });
    return answer;
  }

  /** 보고 하나를 끝까지 돌린다: 처음 돌리고, 멈추면(askHuman·approve) 사람에게 물어 Command({ resume }) 로 이어간다 */
  async function runOnce(report: string, round: number): Promise<S> {
    console.log(`\n[보고] ${report}`);
    console.log(`[설정] 모델 호출 한 번 ${LLM_TIMEOUT_SEC}초 · 실행 전체 ${RUN_TIMEOUT_SEC}초 · 최대 ${MAX_STEPS}회 호출`);
    send("run_start", { round, report });

    // thread_id = 이 실행의 번호 (멈췄다 이어갈 때 같은 번호로 찾는다) / recursionLimit = LangGraph 자체 안전장치 / runName = LangSmith 에 올라갈 때 기록 이름
    const config = { configurable: { thread_id: `loop-${round}-${Date.now()}` }, recursionLimit: MAX_STEPS * 2 + 5, runName: `loop.round-${round}` };
    const input = { report };  // 대화의 첫 줄(역할 설명 + 보고)은 agent 노드가 스스로 연다
    let result = {} as S;

    /** 그래프를 돌린다. values: 단계마다 칠판 전체 / debug: 들어간 값·나온 값 (--watch 터미널, --live 브라우저) */
    async function run(what: unknown) {
      for await (const [mode, chunk] of await graph.stream(what as never, { ...config, streamMode: ["values", "debug"] })) {
        if (mode === "debug") showDebug(chunk as never);
        else result = chunk;
      }
    }
    async function runWithHuman() {
      await run(input);
      for (;;) {
        const question = (await graph.getState(config)).tasks.flatMap((t) => t.interrupts ?? [])[0]?.value as { 문제: string; 고르기: string } | undefined;
        if (!question) break;
        await run(new Command({ resume: await askPerson(question) }));
      }
    }

    // 실행 전체 시간 제한: 둘 중 먼저 끝나는 쪽. 모델이 아무리 늦어도 RUN_TIMEOUT_SEC 가 지나면 내 코드가 끊는다
    const tooLong = new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error(`실행 전체가 ${RUN_TIMEOUT_SEC}초를 넘었습니다`), { name: "RunTimeout" })), RUN_TIMEOUT_SEC * 1000).unref());
    try {
      await Promise.race([runWithHuman(), tooLong]);
    } catch (e: any) {
      if (e?.name === "RunTimeout") {
        const msg = `[중단] ${e.message}. 내 코드가 끊었습니다 (모델 호출 ${result.steps ?? 0}회까지 진행).`;
        console.error(`\n${msg}`);
        send("stopped", { message: msg });
        return result;
      }
      if (e?.lc_error_code !== "GRAPH_RECURSION_LIMIT") throw e;
      // 여기까지 왔다 = route 가 반복을 끊지 못했다는 뜻 (TODO 1 · 2 이 비어 있으면 이렇게 된다)
      console.error("\n[중단] 반복이 멈추지 않아 LangGraph 가 강제로 끊었습니다. TODO 1 · 2 을 확인하세요.");
      process.exit(1);
    }

    const j = result.judgment;
    const who = LLM_MODE === "mock" ? "가짜 모델(mock)" : `${LLM_MODEL} (${LLM_MODE})`;
    console.log(`\n[확인] ${who} 을 총 ${result.steps}회 불러서 정리한 사실:\n${result.facts}`);
    if (j) {
      console.log(`[Jev]  의견 ${j.action} (확신 ${Math.round(j.confidence * 100)}%) · 위험도 ${j.danger}단계 - ${DANGER[j.danger]} · 정체불명 ${Math.round(j.unknown * 100)}%`);
      console.log(`[결정] ${j.decision}`);
    } else console.log("[결정] 없음 — 사실 확인이 끝나기 전에 멈췄습니다");
    send("run_end", { decision: j?.decision ?? "없음 — 사실 확인이 끝나기 전에 멈췄습니다", facts: result.facts });
    return result;
  }

  if (LIVE) {
    // 브라우저 시연: 보고를 무작위로 계속 돌린다. 4번에 1번쯤은 모델이 "늦은 척" 해서 사람에게 묻는 장면도 나온다
    await startLive(graph);
    for (let round = 1; ; round++) {
      process.env.LLM_MOCK_SLOW = Math.random() < 0.25 ? "once" : "";
      await runOnce(REPORTS[Math.floor(Math.random() * REPORTS.length)], round);
      console.log("\n   … 5초 뒤 다음 보고 …");
      send("round_wait", { sec: 5 });
      await new Promise((r) => setTimeout(r, 5000));
    }
  } else {
    // 첫 번째 일반 인자가 보고. 숫자면 REPORTS 에서 고르고, 문장이면 그대로 쓴다 (--watch 같은 옵션은 제외)
    const arg = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "1";
    await runOnce(/^\d+$/.test(arg) ? REPORTS[Number(arg) - 1] ?? REPORTS[0] : arg, 1);
    rl.close();
  }
}
