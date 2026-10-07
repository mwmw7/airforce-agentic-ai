/**
 * labs/agent/search-docs.ts — 규정집에서 관련 줄 찾기 (RAG 의 "찾기" 부분)
 *   입력: 질문 한 줄  →  처리: 규정집 각 줄에 점수 매기기  →  출력: 점수 높은 줄 몇 개
 *   아래 searchDocsNode 가 이 함수를 그래프 노드(Worker)로 감싼다 — 모델 없이 함수 하나가 노드 하나
 *   라이브러리 없음. 파일 읽기(node:fs)와 문자열 함수만 쓴다.
 *
 * RAG = 모델이 답하기 전에 자료를 "찾아서 넣어 쓰게" 하는 구조.
 * 어떻게 찾느냐는 자유다. 오늘은 구조가 보이게 가장 단순한 방법(겹치는 단어 수)을 쓴다.
 * 의미로 찾고 싶으면 이 파일의 점수 매기기만 임베딩 검색으로 바꾸면 된다. 바깥(그래프)은 그대로.
 */
import { readFileSync } from "node:fs";
import { bold, dim, log } from "../../src/lib/show.js";

// 규정집을 줄 단위로 읽는다. 제목(#)과 빈 줄은 뺀다
const RULEBOOK = new URL("../../data/docs/rulebook.md", import.meta.url);
const rules: string[] = readFileSync(RULEBOOK, "utf8").split("\n").filter((line) => line.trim() && !line.startsWith("#"));

// 문장을 단어로 쪼갠다. 띄어쓰기·문장부호 기준, 한 글자짜리는 버린다 ("연", "새" 같은 건 아무 데나 걸려서)
const words = (text: string): string[] => text.split(/[\s·,.!?()"']+/).filter((w) => w.length >= 2);

/** 질문과 관련 있는 규정을 점수 높은 순으로 topN 줄 돌려준다. 하나도 안 겹치면 빈 배열 */
export function searchDocs(question: string, topN = 3): string[] {
  // ===== TODO 3: 규정 한 줄에 점수 매기기 =====
  // 규정의 단어(words(rule))가 질문(question) 안에 들어 있으면 1점씩. 겹치는 단어가 많을수록 관련 있는 규정이다.
  //   · question.includes(word) 로 "들어 있는지" 만 본다 (조사 때문에 단어가 정확히 같지 않아도 걸리게)
  //   · 점수가 0 인 줄은 버리고, 점수 높은 순으로 정렬한 뒤 앞에서 topN 개만 돌려준다
  // ----- SOLUTION -----
  //! const scored = rules.map((rule) => ({ rule, score: 0 }));
  const scored = rules.map((rule) => ({
    rule,
    score: words(rule).filter((word) => question.includes(word)).length,
  }));
  // ----- END SOLUTION -----
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.rule);
}

/** searchDocs 노드 (Worker): 보고 한 줄로 규정집을 찾아 근거(evidence)에 넣는다. 모델 호출 없음 — 함수 하나가 곧 노드다
 *  부모 그래프에서 레이더 부하(ask-radar.ts)와 같은 단계에 동시에 출발한다 */
export async function searchDocsNode(state: { report: string }): Promise<{ evidence: Record<string, string[]> }> {
  const found = searchDocs(state.report);
  log("tool", `${bold("search_docs")}${dim("(보고 그대로)")}`, found.length ? found : ["관련 규정 없음"]);
  return { evidence: { search_docs: found.length ? found : ["관련 규정 없음"] } };
}
