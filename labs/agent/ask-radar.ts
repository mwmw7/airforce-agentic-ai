/**
 * labs/agent/ask-radar.ts — 레이더 담당 부하 Agent (Subagent). 부모 그래프(main.ts)의 노드 하나로 꽂힌다
 *   입력: 보고 한 줄  →  처리: 모델이 도구(레이더 · 확대 · 날씨)를 골라 가며 확인 (agent ⇄ tools 반복)  →  출력: 사실 2~3줄 + 근거
 *
 *   START ─▶ agent ─┬─ 도구 쓰고 싶다   ─▶ tools ─▶ agent … (반복)
 *                   ├─ 다 확인했다     ─▶ END   (facts 를 들고 부모에게 돌아간다)
 *                   ├─ 너무 많이 돌았다 ─▶ stop  ─▶ END   (내 코드가 강제로 멈춤)
 *                   └─ 모델이 늦다     ─▶ askHuman ─▶ 사람이 고름: retry → agent / skip → END / stop → stop
 *
 * 왜 따로 떼는가 (Subagent)
 *   · 이 안에서 모델과 주고받은 긴 대화(messages)는 부하의 칠판에만 남는다. 부모에게는 facts · evidence · steps 만 돌아간다 — 팀장 칠판은 결론만
 *   · LangGraph 입장에선 그냥 노드 하나다. 안에 모델 루프가 있으면 우리가 "부하 Agent" 라고 부를 뿐이다
 *   · Worker(search-docs.ts, 함수 하나)와 나란히 놓고 --watch 로 보면 차이가 보인다: Worker 는 한 줄, 부하는 여러 줄
 *
 * 꼭 볼 것
 *   · 모델은 "이 도구를 써 달라" 고 말할 뿐, 실제로 실행하는 건 tools 단계(내 코드)다           (TODO 1)
 *   · 언제 멈출지(MAX_STEPS)도 모델이 아니라 route 함수(내 코드)가 정한다                       (TODO 2)
 *   · 모델이 늦으면(LLM_TIMEOUT_SEC) 끊고 사람에게 묻는다. 부하 안의 interrupt 도 부모 실행번호로 이어진다
 */
import { readFileSync } from "node:fs";
import { Annotation, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import { askLLM, chat, isTimeout, LLM_MODE, LLM_MODEL, LLM_TIMEOUT_SEC, type Msg, type Tool } from "../../src/lib/llm.js";
import { bold, dim, log, showTool } from "../../src/lib/show.js";
import { callMcpTool, isMcpTool, listMcpTools } from "./mcp.js";
import { MainState } from "./state.js";

// 모델을 최대 몇 번까지 부를지. 이 숫자를 넘으면 내 코드가 멈춘다
export const MAX_STEPS = Number(process.env.MAX_STEPS ?? 8);

// ── 1. 부하의 칠판: 부모 칠판(MainState) + 부하만 쓰는 칸. 겹치는 칸(facts · evidence · steps)만 부모로 돌아간다 ──
const RadarState = Annotation.Root({
  ...MainState.spec,
  messages: Annotation<Msg[]>({ reducer: (prev, next) => [...prev, ...next], default: () => [] }),  // 모델과 주고받은 대화 — 부하 안에만 남는다
  stuck: Annotation<string>(),                                                                        // 모델이 늦었을 때 그 이유 (비어 있으면 정상)
  humanChoice: Annotation<string>(),                                                                  // 사람이 고른 것: retry / skip / stop
});
type S = typeof RadarState.State;

// ── 2. 도구: 설명(모델이 읽는 것) + 실행 함수(내 코드가 돌리는 것) ──
// 레이더 둘은 이 파일 안의 로컬 도구. 날씨는 MCP 서버(mcp-servers/weather)에서 받아 온다 → mcp.ts
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
];

// ── 레이더 화면 만들기: 파일(radar-screen.json)은 mock 모드나 LLM 실패 때의 대체본. 실제 모드에서는 LLM 이 보고에 맞춰 그 자리에서 지어낸다 ──
//   한 번 지은 화면은 이번 실행 동안 기억해 둔다 → look_closer 가 같은 물체를 확대할 수 있다 (매번 새로 지으면 앞뒤가 안 맞는다)
let radarScreen: RadarRow[] | null = null;   // 이번 보고에 대해 지은 레이더 화면 (runOnce 시작 때 비운다)
export const resetRadar = () => { radarScreen = null; };
async function radarFor(report: string): Promise<RadarRow[]> {
  if (radarScreen) return radarScreen;
  const file: RadarRow[] = readJson("radar-screen.json");
  if (LLM_MODE === "mock") return (radarScreen = file);
  try {
    const text = await askLLM({
      system: "너는 가상 레이더 관측 시스템이다. 받은 보고에 어울리는 '지금 레이더에 잡힌 것들' 을 2~4개 지어내라. 보고의 대상은 반드시 포함하고, 무관한 평범한 항적(여객기·훈련기 등)도 하나쯤 섞어라. " +
        "답은 설명 없이 JSON 배열 한 줄만. 각 항목 모양: {\"지역\":[\"서울\",\"남산\"],\"어디\":\"서울 남산 위\",\"뭐가\":\"둥근 물체 1개\",\"높이\":\"…\",\"속도\":\"…\",\"무전\":\"…\",\"메모\":\"…\",\"자세히\":\"확대해야 보이는 상세\"}. " +
        "지역은 보고 속 장소 열쇠말(서울·한강·잠실·김포·인천·동해·부산 … 또는 보고에 나온 지명) 두어 개. 값은 짧은 한국어. (교육용 합성 자료)",
      user: `보고: ${report}\n이런 모양으로: ${JSON.stringify(file.slice(0, 2).map(({ _notice, ...r }) => r))}`,
      mockText: "[]",
    });
    const rows = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as RadarRow[];
    const ok = rows.filter((r) => Array.isArray(r.지역) && r.어디 && r.뭐가);
    return (radarScreen = ok.length ? ok : file);   // 모양이 틀리면 파일로
  } catch {
    return (radarScreen = file);                      // 늦거나 실패해도 파일로 — 도구는 멈추지 않는다
  }
}

// 모델이 고른 도구 이름과 입력값을 받아 실제로 실행한다 (report = 이번 보고, 레이더 화면을 지을 때 쓴다)
async function runTool(name: string, args: Record<string, unknown>, report: string): Promise<string> {
  const rows = await radarFor(report);
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
  return JSON.stringify({ error: `모르는 도구: ${name}` });
}

// 모델에게 줄 도구 목록 = 로컬 도구 + MCP 서버에서 받은 도구. 첫 호출 때 한 번만 서버에 묻는다
let tools: Tool[] | null = null;
async function allTools(): Promise<Tool[]> {
  if (!tools) tools = [...localTools, ...(await listMcpTools())];
  return tools;
}

// ── 3. 단계 ──

// 모델에게 주는 역할 설명 (대화의 첫 줄). 그래프 안에서 넣어야 터미널·Studio 어디서 돌려도 같다
const SYSTEM = "너는 관제실의 레이더 담당이다. 보고를 받으면 보고에 나온 장소로 look_radar 를 봐라 (장소를 모르면 비워서 전체 목록을 본다). 관련된 자리는 look_closer 로 확대해 자세히 확인하라. 필요하면 날씨도 본다. 확인된 사실만 한국어 2~3줄로 정리하고, 판단은 하지 마라.";

/** agent: 모델을 한 번 부른다. 답변이든 도구 요청이든 모델의 말로 기록에 남긴다 */
async function agentNode(state: S): Promise<Partial<S>> {
  const step = state.steps + 1;
  // 첫 호출이면 대화를 연다: 역할 설명 + 보고 한 줄. (입력에 report 만 있어도 돌아간다 — Studio 에서 { "report": "..." } 만 넣으면 됨)
  const opening: Msg[] = state.messages.length ? [] : [{ role: "system", content: SYSTEM }, { role: "user", content: state.report }];
  const history = [...state.messages, ...opening];
  // 매번 묻는 건 같다: "도구를 더 쓸래, 아니면 지금까지 본 걸로 사실을 정리할래?" — 둘 중 하나를 모델이 고른다
  const started = Date.now();
  let reply;
  try {
    reply = await chat(history, await allTools(), { label: `radar.step${step}` });
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
    const result = viaMcp ? await callMcpTool(call.function.name, args) : await runTool(call.function.name, args, state.report);
    showTool(call.function.name, args, result, viaMcp ? "mcp" : "tool"); // 결과를 색 입혀 보여 준다 (TOOL / MCP 꼬리표)
    results.push({ role: "tool", tool_call_id: call.id, content: result });
  }
  // ----- END SOLUTION -----
  // 도구 결과를 짧은 글로 바꿔 이름별로 모아 둔다 → 부모의 approve 에서 사람이 한눈에 본다
  const evidence: Record<string, string[]> = {};
  results.forEach((m, i) => { (evidence[calls[i].function.name] ??= []).push(...oneLine(String(m.content))); });
  return { messages: results, evidence };
}

/** 도구 결과(JSON 글자)를 사람이 읽기 좋은 짧은 줄로. 목록이 있으면 항목마다 한 줄 */
export function oneLine(text: string): string[] {
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

/** askHuman: 모델이 늦었을 때 그래프를 멈추고 사람에게 묻는다 (Human-in-the-Loop). 부하 안의 interrupt 도 부모의 실행번호로 저장·재개된다 */
async function askHumanNode(state: S): Promise<Partial<S>> {
  // interrupt(질문) 에서 그래프가 멈추고 질문이 실행부(main.ts)로 전달된다. 사람이 답하면 이 함수가 다시 돌고, 이번엔 interrupt 가 그 답을 돌려준다
  const answer = interrupt({ 문제: state.stuck, 고르기: "retry(다시 부르기) / skip(사실 없이 판정으로) / stop(그만)" }) as string;
  const facts = answer === "skip" ? `(모델 답 없음 — 담당자가 건너뛰어 사실 없이 판정. 이유: ${state.stuck})` : state.facts;
  return { humanChoice: answer, stuck: "", facts };
}

/** stop: 내 코드가 반복을 끊을 때 들르는 단계. 부하만 끝나고 부모는 계속 간다 (규정집 결과만으로 판정) */
async function stopNode(state: S): Promise<Partial<S>> {
  const why = state.humanChoice === "stop" ? "담당자가 그만하라고 했습니다" : `모델을 이미 ${MAX_STEPS}번 불렀습니다. 더 부르지 않고 내 코드가 멈췄습니다`;
  log("stop", `${why}. 레이더 부하만 끝내고 부모는 계속 갑니다`);
  return { facts: `[중단] ${why}.` };
}

// ── 4. 다음 단계 정하기: agent 다음에 어디로 갈까 ──
function route(state: S): "tools" | typeof END | "stop" | "askHuman" {
  if (state.stuck) return "askHuman"; // 모델이 늦었다 → 사람에게
  const last = state.messages.at(-1);
  const wantsTool = last?.role === "assistant" && (last.tool_calls?.length ?? 0) > 0;

  // ===== TODO 2: 강제로 멈추는 건 모델이 아니라 내 코드다 =====
  // · 모델이 도구를 원하지 않으면 → END (사실 확인 끝, facts 를 들고 부모에게 돌아간다)
  // · 도구를 원하는데 이미 MAX_STEPS 만큼 모델을 불렀으면(state.steps >= MAX_STEPS) → "stop"
  // · 그 외 → "tools"
  // ----- SOLUTION -----
  //! return wantsTool ? "tools" : END; // ← 이대로면 모델이 도구를 계속 원하는 한 끝나지 않습니다
  if (!wantsTool) return END;
  if (state.steps >= MAX_STEPS) return "stop";
  return "tools";
  // ----- END SOLUTION -----
}

// 사람의 답에 따라: retry → agent 다시 / skip → END (사실 없이 부모에게) / stop → stop
function afterHuman(state: S): "agent" | typeof END | "stop" {
  if (state.humanChoice === "retry") return "agent";
  if (state.humanChoice === "stop") return "stop";
  return END;
}

// ── 5. 조립: 부하 그래프. compile() 한 것을 부모가 addNode("askRadar", radarAgent) 로 꽂는다 ──
//   checkpointer 는 넣지 않는다 — 부모의 것이 그대로 내려온다 (부하 안에서 멈춰도 부모 실행번호로 이어진다)
export const radarAgent = new StateGraph(RadarState)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("askHuman", askHumanNode)
  .addNode("stop", stopNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", route, ["tools", END, "stop", "askHuman"])
  .addEdge("tools", "agent")
  .addConditionalEdges("askHuman", afterHuman, ["agent", END, "stop"])
  .addEdge("stop", END)
  .compile();
