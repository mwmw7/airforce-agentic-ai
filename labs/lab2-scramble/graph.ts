/**
 * labs/lab2-scramble/graph.ts — 스크램블 판단 보조 Agent 그래프
 *
 *            ┌─▶ rag ─┐
 *   START ───┼─▶ web ─┼─▶ judge ─▶ approve ─▶ report ─▶ END
 *            └─▶ mcp ─┘   (Jev)     (사람)     (로컬 LLM)
 *
 *   · START 에서 세 노드로 엣지를 그으면 → 셋이 동시에 실행된다 (fan-out)
 *   · 세 노드에서 judge 로 한 번에 엣지를 그으면 → 셋이 모두 끝나야 judge 가 실행된다 (fan-in)
 *   · approve 에서 멈췄다가 다시 이어가려면 상태를 저장할 곳(checkpointer) 이 필요하다
 */
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ScrambleState } from "./state.js";
import { approveNode, judgeNode, mcpNode, ragNode, reportNode, webNode } from "./nodes.js";

export function buildGraph() {
  const graph = new StateGraph(ScrambleState)
    .addNode("rag", ragNode)
    .addNode("web", webNode)
    .addNode("mcp", mcpNode)
    .addNode("judge", judgeNode)
    .addNode("approve", approveNode)
    .addNode("report", reportNode);

  // ===== TODO 2-3: 엣지 연결 (병렬 수집 → 판정 → 승인 → 보고서) =====
  // · START 에서 rag · web · mcp 로 각각 addEdge  → 세 노드가 동시에 실행됩니다
  // · addEdge(["rag", "web", "mcp"], "judge")    → 셋 다 끝나야 judge 가 한 번 실행됩니다
  // · judge → approve → report → END 는 한 줄로 이어집니다
  // ----- SOLUTION -----
  //! // 시작 뼈대: 모든 노드를 '한 줄로 차례차례' 실행합니다. 수집 3개를 병렬로 바꿔 보세요
  //! graph.addEdge(START, "rag").addEdge("rag", "web").addEdge("web", "mcp").addEdge("mcp", "judge")
  //!   .addEdge("judge", "approve").addEdge("approve", "report").addEdge("report", END);
  graph
    .addEdge(START, "rag")
    .addEdge(START, "web")
    .addEdge(START, "mcp")
    .addEdge(["rag", "web", "mcp"], "judge")
    .addEdge("judge", "approve")
    .addEdge("approve", "report")
    .addEdge("report", END);
  // ----- END SOLUTION -----

  // MemorySaver: 멈춘 지점의 상태를 메모리에 저장 → interrupt 후 같은 thread_id 로 이어갈 수 있다
  return graph.compile({ checkpointer: new MemorySaver() });
}
