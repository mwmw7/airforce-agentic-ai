/**
 * labs/lab2-scramble/graph.ts — 단계들을 선으로 잇기
 *
 *            ┌─▶ searchDocs ─┐
 *   START ───┼─▶ searchWeb  ─┼─▶ checkSafety ─▶ decide ─▶ askHuman ─▶ writeReport ─▶ END
 *            └─▶ askRadar   ─┘   (수상한 지시    (기억 +    (사람이     (LLM 보고서 +
 *                                 걸러내기)      Jev 판정)   결정)       기억 남기기)
 *
 *   · START 에서 세 단계로 선을 그으면 → 셋이 동시에 실행된다
 *   · 세 단계에서 checkSafety 로 한 번에 선을 그으면 → 셋이 모두 끝나야 checkSafety 가 실행된다
 *   · askHuman 에서 멈췄다가 이어가려면 진행 상황을 저장할 곳(checkpointer)이 필요하다 → checkpoints.sqlite 파일
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ScrambleState } from "./state.js";
import { searchDocs } from "./search-docs.js";
import { searchWeb } from "./search-web.js";
import { askRadar } from "./ask-radar.js";
import { checkSafety } from "./check-safety.js";
import { decide } from "./decide.js";
import { askHuman } from "./ask-human.js";
import { writeReport } from "./write-report.js";

export function buildGraph() {
  const graph = new StateGraph(ScrambleState)
    .addNode("searchDocs", searchDocs)
    .addNode("searchWeb", searchWeb)
    .addNode("askRadar", askRadar)
    .addNode("checkSafety", checkSafety)
    .addNode("decide", decide)
    .addNode("askHuman", askHuman)
    .addNode("writeReport", writeReport);

  // ===== TODO 2-3: 선 잇기 (동시에 수집 → 안전 검사 → 판정 → 사람 → 보고서) =====
  // · START 에서 searchDocs · searchWeb · askRadar 로 각각 addEdge  → 세 단계가 동시에 실행됩니다
  // · addEdge(["searchDocs", "searchWeb", "askRadar"], "checkSafety")  → 셋 다 끝나야 한 번 실행됩니다
  // · checkSafety → decide → askHuman → writeReport → END 는 한 줄로 이어집니다
  // [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일
  // 시작 뼈대: 모든 단계를 '한 줄로 차례차례' 실행합니다. 수집 3단계를 동시에 돌도록 바꿔 보세요
  graph.addEdge(START, "searchDocs").addEdge("searchDocs", "searchWeb").addEdge("searchWeb", "askRadar").addEdge("askRadar", "checkSafety")
    .addEdge("checkSafety", "decide").addEdge("decide", "askHuman").addEdge("askHuman", "writeReport").addEdge("writeReport", END);

  // 진행 상황을 파일에 저장 → 프로그램을 껐다 켜도 같은 번호(thread_id)로 이어갈 수 있다
  return graph.compile({ checkpointer: SqliteSaver.fromConnString("checkpoints.sqlite") });
}
