/**
 * [실습 0] LangGraph 로 만드는 가장 작은 Agent 루프 (1일차 · 40분)
 *
 * Agent = "모델이 부른 도구를 내 코드가 실행하고, 결과를 다시 모델에게 보여주기" 의 반복.
 * 이 반복을 while 문 대신 LangGraph 의 State · Node · Edge 로 표현합니다.
 *
 *   START ─▶ agent ─┬─ 도구 호출 요청 ─▶ tools ─▶ agent … (반복)
 *                   ├─ 요청 없음      ─▶ END  (최종 답변)
 *                   └─ MAX_STEPS 초과 ─▶ stop ─▶ END  (Harness 가 강제 중단)
 *
 * 관찰 포인트
 *   · State  : 노드들이 함께 읽고 쓰는 칠판 (messages · steps)
 *   · Node   : 한 가지 일만 하는 함수 (agent = 모델 호출, tools = 도구 실행)
 *   · Edge   : 다음에 어디로 갈지. 조건부 엣지(route) 가 while 루프의 if 문 역할
 *   · 모델은 "이 도구를 불러 달라" 고 말할 뿐, 실제 실행은 tools 노드(내 코드)가 한다
 *   · 언제 멈출지(MAX_STEPS)도 모델이 아니라 route 함수(내 코드)가 정한다 = Harness
 *
 * 실행:  pnpm loop:run      정상 종료
 *        pnpm loop:limit    MAX_STEPS=1 로 강제 중단 → 중단 사유가 코드에서 나오는지 확인
 *        pnpm loop:run "UNK-0413 항적과 현재 기상을 확인해줘"   질문 바꿔 보기
 *        pnpm loop:run --watch   단계마다 들어간 값·나온 값을 보여 주며 실행 (--watch=full 이면 전부)
 */
import { readFileSync } from "node:fs";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { chat, type Msg, type Tool } from "../../src/lib/llm.js";
import { showDebug } from "../../src/lib/show.js";

const MAX_STEPS = Number(process.env.MAX_STEPS ?? 8);

// ── 1. 도구: 설명(모델이 보는 것) + 실행 함수(내 코드가 돌리는 것) ──
const readJson = (file: string) => JSON.parse(readFileSync(new URL(`../../data/api/${file}`, import.meta.url), "utf8"));
const tracks: { track_id: string }[] = readJson("tracks.json");

const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_track",
      description: "항적 ID 로 현재 위치·고도·속도·IFF 응답을 조회한다. (교육용 합성 자료)",
      parameters: { type: "object", properties: { track_id: { type: "string", description: "예: UNK-0412" } }, required: ["track_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "감시 구역(ADIZ-E) 의 현재 기상(시정·운저·바람·비행 가능 여부)을 조회한다. (교육용 합성 자료)",
      parameters: { type: "object", properties: {} },
    },
  },
];

function runTool(name: string, args: Record<string, unknown>): string {
  if (name === "get_track") return JSON.stringify(tracks.find((t) => t.track_id === args.track_id) ?? { error: `항적 없음: ${args.track_id}` });
  if (name === "get_weather") return JSON.stringify(readJson("weather.json"));
  return JSON.stringify({ error: `모르는 도구: ${name}` });
}

// ── 2. State: 대화 기록은 '이어 붙이기', 스텝 수는 '더하기' ──
const LoopState = Annotation.Root({
  messages: Annotation<Msg[]>({ reducer: (prev, next) => [...prev, ...next], default: () => [] }),
  steps: Annotation<number>({ reducer: (prev, next) => prev + next, default: () => 0 }),
  answer: Annotation<string>(),
});
type S = typeof LoopState.State;

// ── 3. Node ──

/** agent: 모델을 한 번 부른다. 답변이든 도구 요청이든 assistant 메시지로 기록 */
async function agentNode(state: S): Promise<Partial<S>> {
  const step = state.steps + 1;
  console.log(`\n── step ${step} ──`);
  const reply = await chat(state.messages, tools, { label: `loop.step${step}` });

  const assistant: Msg = reply.toolCalls.length
    ? {
        role: "assistant",
        content: reply.content || null,
        tool_calls: reply.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      }
    : { role: "assistant", content: reply.content };

  return { messages: [assistant], steps: 1, answer: reply.content };
}

/** tools: 직전 assistant 메시지가 요청한 도구를 실행하고, 결과를 tool 메시지로 돌려준다 */
async function toolsNode(state: S): Promise<Partial<S>> {
  const last = state.messages.at(-1);
  const calls = last?.role === "assistant" ? (last.tool_calls ?? []) : [];

  // ===== TODO 0-2: 도구를 실행하고 결과를 tool 메시지로 돌려주기 =====
  // calls 를 하나씩 runTool(name, args) 로 실행하고,
  // 결과를 { role: "tool", tool_call_id: call.id, content: 결과 } 메시지 배열로 만들어 { messages } 로 반환하세요.
  //   · call.function.arguments 는 JSON "문자열" → JSON.parse 해서 넘깁니다
  //   · 반환한 messages 는 State 의 reducer 가 기존 기록 뒤에 이어 붙여 줍니다
  // ----- SOLUTION -----
  //! return { messages: [] };
  const results: Msg[] = calls.map((call) => {
    const args = JSON.parse(call.function.arguments || "{}");
    const result = runTool(call.function.name, args);
    console.log(`  [도구] ${call.function.name}(${JSON.stringify(args)}) → ${result.slice(0, 120)}`);
    return { role: "tool", tool_call_id: call.id, content: result };
  });
  return { messages: results };
  // ----- END SOLUTION -----
}

/** stop: Harness 가 루프를 끊을 때 들르는 노드 */
async function stopNode(): Promise<Partial<S>> {
  const stopped = `[중단] 최대 스텝(${MAX_STEPS}) 초과 — 모델이 아니라 코드가 루프를 멈췄습니다.`;
  console.log(stopped);
  return { answer: stopped };
}

// ── 4. Edge: agent 다음에 어디로 갈까 ──
function route(state: S): "tools" | "stop" | typeof END {
  const last = state.messages.at(-1);
  const wantsTool = last?.role === "assistant" && (last.tool_calls?.length ?? 0) > 0;

  // ===== TODO 0-3: 강제 중단은 모델이 아니라 Harness(내 코드)가 한다 =====
  // · 도구 요청이 없으면 → END (최종 답변)
  // · 도구 요청이 있는데 이미 MAX_STEPS 만큼 모델을 불렀으면(state.steps >= MAX_STEPS) → "stop"
  // · 그 외 → "tools"
  // ----- SOLUTION -----
  //! return wantsTool ? "tools" : END; // ← 이대로면 모델이 도구를 계속 부르는 한 끝나지 않습니다
  if (!wantsTool) return END;
  if (state.steps >= MAX_STEPS) return "stop";
  return "tools";
  // ----- END SOLUTION -----
}

// ── 5. 그래프 조립 ── (export: pnpm graph 가 그림을 그릴 때 가져다 쓴다)
export const graph = new StateGraph(LoopState)
  .addNode("agent", agentNode)
  .addNode("tools", toolsNode)
  .addNode("stop", stopNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", route, ["tools", "stop", END])
  .addEdge("tools", "agent")
  .addEdge("stop", END)
  .compile();

// 이 파일을 직접 실행할 때만 질문을 던진다 (pnpm graph 가 import 할 때는 그림만 그린다)
if (process.argv[1]?.endsWith("agent.ts")) {
  // 명령줄의 첫 번째 일반 인자가 질문 (--watch 같은 옵션은 제외)
  const question = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "항적 UNK-0412 의 현재 상태를 확인하고 특이사항을 보고해줘.";
  const input = {
    messages: [
      { role: "system", content: "너는 공역 감시 보조 에이전트다. 도구로 사실을 확인한 뒤 한국어로 간결히 보고하라." },
      { role: "user", content: question },
    ] as Msg[],
  };

  let result = { steps: 0, answer: "" };
  try {
    // values: 단계가 끝날 때마다 칠판(State) 전체 / debug: 단계마다 들어간 값·나온 값 (--watch 일 때만 화면에 찍힌다)
    // recursionLimit 은 LangGraph 자체 안전장치 (route 의 MAX_STEPS 가 먼저 걸린다)
    for await (const [mode, chunk] of await graph.stream(input, { recursionLimit: MAX_STEPS * 2 + 5, streamMode: ["values", "debug"] })) {
      if (mode === "debug") showDebug(chunk as never);
      else result = chunk;
    }
  } catch (e: any) {
    if (e?.lc_error_code !== "GRAPH_RECURSION_LIMIT") throw e;
    // 여기까지 왔다 = route 가 루프를 끊지 못해 LangGraph 의 최후 안전장치가 걸렸다는 뜻
    console.error("\n[중단] LangGraph recursionLimit 도달 — route 가 루프를 끊지 못했습니다. TODO 0-2 · 0-3 을 확인하세요.");
    process.exit(1);
  }
  console.log(`\n[최종 답변] (steps=${result.steps}):\n${result.answer}`);
}
