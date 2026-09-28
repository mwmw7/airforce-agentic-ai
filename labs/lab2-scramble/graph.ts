/**
 * labs/lab2-scramble/graph.ts — 스크램블 판단 보조 Agent 그래프 조립
 *
 *   START ─▶ triage ─▶ [fanOut: Send×4] ─▶ worker ─▶ synthesize ─▶ decide ─┬─▶ guardrail ─▶ approve ─┬─▶ report ─▶ END
 *                                            ▲                              │                       └─▶ END (반려)
 *                                            └──── worker_retry (추가 조회 1회) ◀─┘
 *
 * 어제(1일차) 의 while 루프가 어떻게 State · Node · Edge 로 바뀌었는지 비교해 보세요.
 *   while 루프의 "다음 행동 결정"  → 조건부 엣지 (routeAfterDecide, routeAfterApprove)
 *   messages 배열                 → ScrambleState (필드별 reducer)
 *   MAX_STEPS 검사                → step_count + recursionLimit
 *   (없던 것) 중단·재개            → Checkpointer + interrupt()
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ScrambleState } from "./state.js";
import { triageNode } from "./nodes/triage.js";
import { fanOut, workerNode } from "./nodes/investigate.js";
import { synthesizeNode } from "./nodes/synthesize.js";
import { decideNode, routeAfterDecide } from "./nodes/decide.js";
import { guardrailNode } from "./nodes/guardrail.js";
import { approveNode, routeAfterApprove } from "./nodes/approve.js";
import { reportNode } from "./nodes/report.js";
import { Send } from "@langchain/langgraph";

/** 추가 조회: 과거 사건을 한 번 더 넓게 검색 (Agentic Retrieval 의 '재검색') */
function retryFanOut(state: typeof ScrambleState.State): Send[] {
  return [new Send("worker", { alert: state.alert, source: "past_incidents" })];
}

export function buildGraph(opts: { checkpointer?: SqliteSaver } = {}) {
  // ===== TODO 2-2d: 그래프 조립 =====
  // StateGraph(ScrambleState) 에 노드 7개를 addNode 로 등록하고, 위 그림대로 엣지를 연결하세요.
  //   · triage → worker 는 addConditionalEdges(triage, fanOut, ["worker"])  ← Send 배열을 돌려주는 함수
  //   · worker → synthesize 는 일반 addEdge (Send 로 병렬 실행된 Worker 가 모두 끝나야 synthesize 가 한 번 실행됩니다)
  //   · decide 뒤는 routeAfterDecide 로 "guardrail" | "worker_retry" 분기, worker_retry 는 retryFanOut 로 다시 worker 로
  //   · approve 뒤는 routeAfterApprove 로 "report" | END 분기
  // 마지막에 graph.compile({ checkpointer: opts.checkpointer }) 를 반환하세요.
  // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
  // 시작 뼈대: triage 만 도는 그래프. 나머지 노드·엣지를 그림대로 이어 붙이세요.
  const graph = new StateGraph(ScrambleState)
    .addNode("triage", triageNode)
    .addEdge(START, "triage")
    .addEdge("triage", END);
  return graph.compile({ checkpointer: opts.checkpointer });
}
