/**
 * labs/agent/main.ts — LangGraph 로 만드는 가장 작은 Agent. 여기서 출발해 한 단계씩 기능을 붙여 나간다
 *
 * 관제실에 짧은 보고 한 줄이 들어온다. "서울 상공에 정체불명 비행체가 떠 있어요"
 * Agent 는 도구로 사실을 확인하고(LLM), 판정 모델이 의견을 내고(Jev), 최종 결정은 코드가 한다.
 *
 *   START ─▶ agent ─┬─ 도구 쓰고 싶다   ─▶ tools ─▶ agent … (반복)
 *                   ├─ 다 확인했다     ─▶ remember ─┬─ 같은 사례 기억 있음 ──────────┐  (Jev 생략)
 *                   │                              └─ 없음 ─▶ judge (Jev 판정) ─────┴─▶ approve ─▶ END
 *                   │                                  approve = 레이더 · 규정 · 날씨 · 기억 · Jev 를 한눈에 모아 보여 주고
 *                   │                                            사람이 출격 / 감시 / 무시 를 고른다 (언제나 마지막은 사람)
 *                   ├─ 너무 많이 돌았다 ─▶ stop  ─▶ END   (내 코드가 강제로 멈춤)
 *                   └─ 모델이 늦다     ─▶ askHuman ─▶ 사람이 고름: retry → agent / skip → remember / stop → stop
 *
 * 꼭 볼 것
 *   · 모델은 "이 도구를 써 달라" 고 말할 뿐, 실제로 실행하는 건 tools 단계(내 코드)다
 *   · 언제 멈출지(MAX_STEPS)도 모델이 아니라 route 함수(내 코드)가 정한다
 *   · LLM 은 사실을 모으고, Jev 는 판정하고, 결정은 코드가 한다 — 역할이 다르다
 *   · 마지막 결정은 코드도 모델도 아닌 사람이 한다 — approve 가 모든 근거를 한 화면에 모아 보여 주고 묻는다 (HITL)
 *   · 똑같은 보고를 전에 판단한 적이 있으면 기억(Hindsight)이 답한다 — Jev 를 다시 부르지 않는다 (remember)
 *   · 모델이 늦으면(LLM_TIMEOUT_SEC) 끊고 사람에게 묻는다. 실행 전체도 RUN_TIMEOUT_SEC 를 넘으면 끊는다
 *
 * 실행:  pnpm agent                           보고 1번
 *        pnpm agent 3                         보고 3번
 *        pnpm agent "한강에 오리 풍선이 떠요"    내가 쓴 보고
 *        pnpm agent:limit                     MAX_STEPS=1 로 강제 중단 → 멈춘 이유가 내 코드에서 나오는지 확인
 *        pnpm agent --watch                   단계마다 들어간 값·나온 값 보기 (--watch=full 이면 전부)
 *        LLM_MOCK_SLOW=1 pnpm agent           모델이 늦는 상황 시연 → 사람에게 묻는 화면이 뜬다
 *        pnpm agent:live                      브라우저(http://localhost:3030)에서 실시간으로 보기. 보고를 무작위로 계속 돌린다 (Ctrl+C 로 끝)
 *        pnpm agent --resume <실행번호>       담당자 확인 중 Ctrl+C 로 껐던 실행을 멈춘 곳부터 이어가기 (checkpoints.sqlite)
 *        pnpm studio                          LangGraph Studio 에서 보기 (입력: { "report": "보고 한 줄" })
 */
import { readFileSync } from "node:fs";
import readline from "node:readline/promises";
import { Annotation, Command, END, interrupt, type LangGraphRunnableConfig, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { chat, isTimeout, LLM_MODE, LLM_MODEL, LLM_TIMEOUT_SEC, type Msg, type Tool } from "../../src/lib/llm.js";
import { askJev, JEV_MODE } from "../../src/lib/jev.js";
import { blue, bold, cyan, dim, green, log, magenta, red, showDebug, showTool, yellow } from "../../src/lib/show.js";
import { LIVE, send, startLive, waitAnswerFromPage } from "../../src/lib/live.js";
import { searchDocs } from "./search-docs.js";
import { callMcpTool, isMcpTool, listMcpTools } from "./mcp.js";
import { type Case, createBank, findSameCase, MEMORY_MODE, recall, retain, showMemoryWork } from "../../src/lib/memory.js";

// 모델을 최대 몇 번까지 부를지. 이 숫자를 넘으면 내 코드가 멈춘다
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 8);
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

// ── 1. 도구: 설명(모델이 읽는 것) + 실행 함수(내 코드가 돌리는 것) ──
// 레이더·규정집은 이 파일 안의 로컬 도구. 날씨는 MCP 서버(mcp-servers/weather)에서 받아 온다 → mcp.ts
const readJson = (file: string) => JSON.parse(readFileSync(new URL(`../../data/api/${file}`, import.meta.url), "utf8"));
type RadarRow = Record<string, string> & { 지역: string[] };
// 보고 속 장소와 레이더 줄을 맞춰 본다: 줄의 '지역' 열쇠말(서울, 남산 …) 중 하나라도 문장에 들어 있으면 그 지역이다
const inRegion = (row: RadarRow, text: string): boolean => row.지역.some((k) => text.includes(k));
const brief = ({ 자세히, _notice, 지역, ...row }: RadarRow) => row; // '자세히' 는 숨긴다 → 확대해야 보인다

const localTools: Tool[] = [
  { type: "function", function: { name: "look_radar", description: "레이더에서 한 지역을 본다. 보고에 나온 장소(서울, 한강, 잠실, 김포, 인천, 동해 …)를 넣으면 그 지역에 잡힌 것들만 보여 준다. 장소를 모르면 비워 두면 전체 목록이 나온다. 자세한 건 안 보인다. (교육용 합성 자료)",
      parameters: { type: "object", properties: { 어디: { type: "string", description: "보고에 나온 장소 또는 보고 문장 그대로. 예: 서울 / 한강 위 풍선" } } } } },
  { type: "function", function: { name: "look_closer", description: "레이더 화면에서 한 자리만 확대해 자세히 본다. 수상한 게 있으면 꼭 써 보라. (교육용 합성 자료)",
      parameters: { type: "object", properties: { 어디: { type: "string", description: "look_radar 목록의 '어디' 값. 예: 잠실 위" } }, required: ["어디"] } } },
  // RAG: 규정집은 모델이 외우고 있지 않다. 필요할 때 찾아서(search-docs.ts) 대화에 넣어 준다
  { type: "function", function: { name: "look_rulebook", description: "관제실 규정집에서 지금 상황과 관련된 규정을 찾아본다. 판단 전에 꼭 한 번 보라. (교육용 합성 자료)",
      parameters: { type: "object", properties: { 질문: { type: "string", description: "지금 상황을 한 문장으로. 예: 무전 응답 없는 풍선이 공항 쪽으로 간다" } }, required: ["질문"] } } },
];

// 모델이 고른 도구 이름과 입력값을 받아 실제로 실행한다
function runTool(name: string, args: Record<string, unknown>): string {
  const rows: RadarRow[] = readJson("radar-screen.json");
  if (name === "look_radar") {
    const where = String(args.어디 ?? "");
    const found = rows.filter((r) => inRegion(r, where));
    const matched = [...new Set(found.flatMap((r) => r.지역).filter((k) => where.includes(k)))]; // 문장에서 걸린 장소 열쇠말만
    if (found.length) return JSON.stringify({ 지역: matched.join("·"), 잡힌것: found.map(brief) });
    // 그 장소엔 아무것도 없거나 장소를 모르겠다 → 지금 레이더에 잡힌 것 전부를 짧게 (어디 · 뭐가) 보여 준다
    return JSON.stringify({ 결과: where ? `'${where.slice(0, 20)}' 에 잡힌 것 없음 → 전체 목록` : "장소 없음 → 전체 목록", 지금_잡힌_것들: rows.map((r) => `${r.어디}: ${r.뭐가}`) });
  }
  if (name === "look_closer") {
    const where = String(args.어디 ?? "");
    const row = rows.find((r) => inRegion(r, where));                                        // "잠실 위" → 지역 열쇠말 "잠실" 로 찾는다
    return row ? JSON.stringify({ 어디: row.어디, 뭐가: row.뭐가, 자세히: row.자세히 }) : JSON.stringify({ 결과: `레이더에 '${where}' 자리는 없음` });
  }
  if (name === "look_rulebook") {
    const found = searchDocs(String(args.질문 ?? ""));
    return JSON.stringify({ 규정: found.length ? found : ["관련 규정 없음"] });
  }
  return JSON.stringify({ error: `모르는 도구: ${name}` });
}

// 모델에게 줄 도구 목록 = 로컬 도구 + MCP 서버에서 받은 도구. 첫 호출 때 한 번만 서버에 묻는다
let tools: Tool[] | null = null;
async function allTools(): Promise<Tool[]> {
  if (!tools) tools = [...localTools, ...(await listMcpTools())];
  return tools;
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
  memory: Annotation<Memory | null>(),                                                                // remember 가 찾은 같은 사례 (없으면 null → judge 로)
  past: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),                   // judge 가 떠올린 비슷한 기억 (Jev 참고용)
  // 도구가 돌려준 결과를 이름별로 모아 둔다 (approve 에서 사람에게 한눈에 보여 주려고). 같은 도구를 여러 번 쓰면 뒤에 이어 붙인다
  evidence: Annotation<Record<string, string[]>>({
    reducer: (prev, next) => { const out = { ...prev }; for (const [k, v] of Object.entries(next)) out[k] = [...(out[k] ?? []), ...v]; return out; },
    default: () => ({}),
  }),
});
type S = typeof LoopState.State;
interface Judgment { action: string; probabilities: Record<string, number>; confidence: number; danger: number; unknown: number; decision: string }
interface Memory { report: string; time: string; score: number }

// ── 3. 단계 ──

/** agent: 모델을 한 번 부른다. 답변이든 도구 요청이든 모델의 말로 기록에 남긴다 */
// 모델에게 주는 역할 설명 (대화의 첫 줄). 그래프 안에서 넣어야 터미널·Studio 어디서 돌려도 같다
const SYSTEM = "너는 관제실 보조다. 보고를 받으면 보고에 나온 장소로 look_radar 를 봐라 (장소를 모르면 비워서 전체 목록을 본다). 관련된 자리는 look_closer 로 확대해 자세히 확인하라. 필요하면 날씨도 본다. 판단 전에 look_rulebook 으로 관련 규정을 한 번 찾아보라. 확인된 사실과 관련 규정만 한국어 2~3줄로 정리하고, 판단은 하지 마라.";

async function agentNode(state: S): Promise<Partial<S>> {
  const step = state.steps + 1;
  // 첫 호출이면 대화를 연다: 역할 설명 + 보고 한 줄. (입력에 report 만 있어도 돌아간다 — Studio 에서 { "report": "..." } 만 넣으면 됨)
  const opening: Msg[] = state.messages.length ? [] : [{ role: "system", content: SYSTEM }, { role: "user", content: state.report }];
  const history = [...state.messages, ...opening];
  // 매번 묻는 건 같다: "도구를 더 쓸래, 아니면 지금까지 본 걸로 사실을 정리할래?" — 둘 중 하나를 모델이 고른다
  const started = Date.now();
  let reply;
  try {
    reply = await chat(history, await allTools(), { label: `loop.step${step}` });
  } catch (e) {
    if (!isTimeout(e)) throw e;
    // 늦었다 → 여기서 정하지 않고 이유만 적는다. 다음에 뭘 할지는 사람에게 묻는다 (askHuman)
    return { steps: 1, stuck: `${LLM_MODE === "mock" ? "가짜 모델" : LLM_MODEL} 이 ${LLM_TIMEOUT_SEC}초 안에 답하지 않았습니다 (${step}회째 호출)` };
  }
  const took = dim(`${Date.now() - started}ms${reply.usage ? ` · ${reply.usage.prompt_tokens + reply.usage.completion_tokens} 토큰` : ""}`);
  log("llm", reply.toolCalls.length
    ? `${step}회째 → 도구 쓰기: ${bold(reply.toolCalls.map((c) => c.name).join(", "))}  ${took}`
    : `${step}회째 → 사실 정리 (도구 안 씀)  ${took}`);

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
  //   · MCP 에서 받은 도구(isMcpTool)면 callMcpTool, 아니면 runTool
  //   · 반환한 messages 는 공유 기록 뒤에 자동으로 이어 붙여집니다
  const results: Msg[] = [];
  // ----- SOLUTION -----
  //! // 여기서 calls 를 돌며 results 에 { role: "tool", tool_call_id, content } 를 넣으세요
  for (const call of calls) {
    const args = JSON.parse(call.function.arguments || "{}");
    // MCP 에서 받은 도구면 서버에 실행을 부탁하고, 아니면 이 파일의 runTool 로 직접 실행한다
    const viaMcp = isMcpTool(call.function.name);
    const result = viaMcp ? await callMcpTool(call.function.name, args) : runTool(call.function.name, args);
    showTool(call.function.name, args, result, viaMcp ? "mcp" : "tool"); // 결과를 색 입혀 보여 준다 (TOOL / MCP 꼬리표)
    results.push({ role: "tool", tool_call_id: call.id, content: result });
  }
  // ----- END SOLUTION -----
  // 도구 결과를 짧은 글로 바꿔 이름별로 모아 둔다 → 마지막 approve 에서 사람이 한눈에 본다
  const evidence: Record<string, string[]> = {};
  results.forEach((m, i) => { (evidence[calls[i].function.name] ??= []).push(...oneLine(String(m.content))); });
  return { messages: results, evidence };
}

/** 도구 결과(JSON 글자)를 사람이 읽기 좋은 짧은 줄로. 목록이 있으면 항목마다 한 줄 */
function oneLine(text: string): string[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return [text.slice(0, 120)]; }
  if (typeof data !== "object" || !data) return [String(data)];
  const lines: string[] = [], plain: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k === "_notice") continue;
    if (Array.isArray(v)) v.forEach((item) => lines.push(typeof item === "object" && item ? Object.values(item as object).join(" · ") : String(item)));
    else plain.push(`${k} ${v}`);
  }
  if (plain.length) lines.unshift(plain.join(" · "));
  return lines.map((l) => l.slice(0, 120));
}

/** remember: 전에 똑같은 보고가 있었나? 있으면 그때의 판정을 그대로 쓰고 Jev 를 건너뛴다 (장기 기억으로 판단하기) */
async function rememberNode(state: S): Promise<Partial<S>> {
  await createBank();
  const found = await findSameCase(state.report);
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

/** judge: 비슷한 기억을 떠올리고(recall), Jev 에게 세 가지를 한 번에 묻고, 코드 규칙으로 권고를 만든다. 기억에 남기는 건 approve 가 한다 */
const DANGER = ["전혀 안 위험함, 심심한 하루", "조금 신경 쓰임", "꽤 수상함", "비상! 당장 뭔가 해야 함"];
async function judgeNode(state: S): Promise<Partial<S>> {
  // 장기 기억: 비슷한 보고가 전에 있었나? 있으면 Jev 에게 past 로 같이 보여 준다 (어제 판단을 오늘 기억한다)
  const past = await recall(state.report);

  const res = await askJev({ report: state.report, facts: state.facts, past }, {
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

/** askHuman: 모델이 늦었을 때 그래프를 멈추고 사람에게 묻는다 (Human-in-the-Loop) */
async function askHumanNode(state: S): Promise<Partial<S>> {
  // interrupt(질문) 에서 그래프가 멈추고 질문이 실행부(6번)로 전달된다. 사람이 답하면 이 함수가 다시 돌고, 이번엔 interrupt 가 그 답을 돌려준다
  const answer = interrupt({ 문제: state.stuck, 고르기: "retry(다시 부르기) / skip(사실 없이 판정으로) / stop(그만)" }) as string;
  const facts = answer === "skip" ? `(모델 답 없음 — 담당자가 건너뛰어 사실 없이 판정. 이유: ${state.stuck})` : state.facts;
  return { humanChoice: answer, stuck: "", facts };
}

/** approve: 언제나 마지막은 사람. 지금까지 모은 근거(레이더 · 확대 · 날씨 · 규정 · 기억 · Jev)를 한눈에 보여 주고
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
    ...section("날씨", ev("look_weather")),
    ...section("관련 규정", ev("look_rulebook")),
    ...section("기억", state.memory
      ? [`같은 사례 (${state.memory.time}) → 그때 ${j.action}: ${j.decision}`]
      : state.past.length ? state.past.map((p) => p.replace(/\n/g, " / ").slice(0, 160)) : ["비슷한 보고 없음"]),
    ...section("Jev 판정", [state.memory
      ? "생략 (같은 사례 기억으로 판정)"
      : `${j.action} · 확신 ${Math.round(j.confidence * 100)}% · 위험도 ${j.danger}단계 (${DANGER[j.danger]}) · 정체불명 ${Math.round(j.unknown * 100)}%`]),
    ...section("코드 권고", [j.decision]),
    ...section("모델이 정리한 사실", [state.facts]),
  ];
  const answer = interrupt({ 문제: "종합 — 담당자가 결정합니다", 요약, 고르기: "y(출격) / w(감시 강화) / n(무시)" }) as string;
  const picked = /^(y|yes|출격)/.test(answer) ? "scramble" : /^(w|watch|감시)/.test(answer) ? "watch" : /^(n|no|무시)/.test(answer) ? "ignore" : "watch";
  const label = { scramble: "출격", watch: "감시 강화", ignore: "무시" }[picked];
  const decision = `${label} — 사람이 결정${/^(y|yes|출격|w|watch|감시|n|no|무시)/.test(answer) ? "" : " (답 없음 → 감시)"}`;
  // 사람의 결정으로 기억을 고쳐 쓴다 (같은 실행번호 → 덮어쓰기). 사람이 본 종합 근거(요약)와 최종 선택까지 같이 남긴다
  // → 다음에 같은 보고가 오면 사람이 고른 쪽으로 떠오르고, "그때 무엇을 보고 그렇게 정했나" 도 기억에 있다 — 사람이 가르친 셈
  await saveCase({ ...state, judgment: { ...j, action: picked } }, config, decision, { summary: 요약.slice(0, 요약.indexOf("## 모델이 정리한 사실")), human: label });
  return { judgment: { ...j, decision } };
}

/** stop: 내 코드가 반복을 끊을 때 들르는 단계 */
async function stopNode(state: S): Promise<Partial<S>> {
  const why = state.humanChoice === "stop" ? "담당자가 그만하라고 했습니다" : `모델을 이미 ${MAX_STEPS}번 불렀습니다. 더 부르지 않고 내 코드가 멈췄습니다`;
  const stopped = `[중단] ${why}.`;
  log("stop", why);
  return { facts: stopped };
}

// ── 4. 다음 단계 정하기: agent 다음에 어디로 갈까 ──
function route(state: S): "tools" | "remember" | "stop" | "askHuman" {
  if (state.stuck) return "askHuman"; // 모델이 늦었다 → 사람에게
  const last = state.messages.at(-1);
  const wantsTool = last?.role === "assistant" && (last.tool_calls?.length ?? 0) > 0;

  // ===== TODO 2: 강제로 멈추는 건 모델이 아니라 내 코드다 =====
  // · 모델이 도구를 원하지 않으면 → "remember" (사실 확인 끝, 기억부터 보고 판정으로)
  // · 도구를 원하는데 이미 MAX_STEPS 만큼 모델을 불렀으면(state.steps >= MAX_STEPS) → "stop"
  // · 그 외 → "tools"
  // ----- SOLUTION -----
  //! return wantsTool ? "tools" : "remember"; // ← 이대로면 모델이 도구를 계속 원하는 한 끝나지 않습니다
  if (!wantsTool) return "remember";
  if (state.steps >= MAX_STEPS) return "stop";
  return "tools";
  // ----- END SOLUTION -----
}

// 사람의 답에 따라: retry → agent 다시 / skip → remember / stop → stop
function afterHuman(state: S): "agent" | "remember" | "stop" {
  if (state.humanChoice === "retry") return "agent";
  if (state.humanChoice === "stop") return "stop";
  return "remember";
}

// ── 5. 조립: 단계들을 선으로 잇는다 ── (export: pnpm graph 가 그림을 그릴 때 가져다 쓴다)
export const graph = new StateGraph(LoopState)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("askHuman", askHumanNode)
  .addNode("remember", rememberNode)
  .addNode("judge", judgeNode)
  .addNode("approve", approveNode)
  .addNode("stop", stopNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", route, ["tools", "remember", "stop", "askHuman"])
  .addEdge("tools", "agent")
  .addConditionalEdges("askHuman", afterHuman, ["agent", "remember", "stop"])
  .addConditionalEdges("remember", afterRemember, ["judge", "approve"])
  .addEdge("judge", "approve")   // Jev 가 뭐라 하든 마지막은 사람
  .addEdge("approve", END)
  .addEdge("stop", END)
  // 멈췄다 이어가려면 진행 상황(checkpoint)을 저장할 곳이 필요하다. LangGraph 가 주는 SqliteSaver 를 꽂으면
  // 단계마다 checkpoints.sqlite 파일에 저장된다 → 프로그램을 껐다 켜도 --resume 으로 멈춘 곳부터 이어간다 (직접 SQL 은 한 줄도 없다)
  .compile({ checkpointer: SqliteSaver.fromConnString("checkpoints.sqlite") });

// ── 6. 실행: 보고 하나를 넣고 돌린다 ──
// 이 파일을 직접 실행할 때만 돈다 (pnpm graph 가 import 할 때는 그림만 그린다)
if (process.argv[1]?.endsWith("main.ts")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  /** 사람에게 묻는다. 터미널 입력과 브라우저 버튼(--live) 중 먼저 온 답을 쓴다 */
  /** "## 제목" 은 출처별 색으로 굵게(도구는 초록, MCP 는 하늘색, 기억은 파랑, Jev 는 노랑, 모델은 보라), "- 항목" 은 들여쓴 점, 긴 줄은 접는다.
   *  판정 낱말(scramble · watch · ignore)은 빨강 · 노랑 · 초록 */
  function pretty(lines: string[]): string[] {
    const width = 100;
    const titleColor: Record<string, (s: string) => string> = {
      "보고": (t) => bold(t), "레이더": green, "확대해서 본 것": green, "날씨": cyan, "관련 규정": green,
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

  async function askPerson(question: { 문제: string; 요약?: string[]; 고르기: string }): Promise<string> {
    log("human", bold(question.문제), pretty(question.요약 ?? []));
    send("waiting", { question: [question.문제, ...(question.요약 ?? [])].join("\n"), choices: question.고르기 });
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
      if (!resumeId) await run(input); // 이어가기면 처음부터 돌리지 않는다. 저장된 멈춘 곳(아래 interrupt)부터
      for (;;) {
        // 그래프가 interrupt() 에서 멈춰 있으면 그 질문이 state.tasks 에 들어 있다. 없으면 끝까지 돈 것
        const question = (await graph.getState(config)).tasks.flatMap((t) => t.interrupts ?? [])[0]?.value as { 문제: string; 요약?: string[]; 고르기: string } | undefined;
        if (!question) break;
        // ===== TODO 6: 사람의 답으로 멈춘 곳부터 이어가기 =====
        // askPerson(question) 으로 답을 받고, run(new Command({ resume: 답 })) 으로 그래프를 다시 돌리세요.
        //   · 같은 config(thread_id) 로 돌리면 LangGraph 가 checkpoints.sqlite 에서 멈춘 곳을 찾아 그 답을 interrupt() 의 반환값으로 넣어 준다
        //   · 그래서 Ctrl+C 로 껐다가 pnpm agent --resume <실행번호> 로 켜도 같은 줄에서 이어진다
        // ----- SOLUTION -----
        //! const answer = await askPerson(question);
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
      // 여기까지 왔다 = route 가 반복을 끊지 못했다는 뜻 (TODO 1 · 2 이 비어 있으면 이렇게 된다)
      log("stop", "반복이 멈추지 않아 LangGraph 가 강제로 끊었습니다. TODO 1 · 2 을 확인하세요.");
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
