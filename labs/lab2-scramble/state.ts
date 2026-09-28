/**
 * labs/lab2-scramble/state.ts — 모든 단계가 함께 쓰는 칠판(State)
 *
 * 각 단계(노드)는 칠판을 읽고, 바꿀 칸만 돌려줍니다.
 *   · 합치는 규칙(reducer)이 없는 칸 → 새 값으로 덮어쓰기
 *   · 합치는 규칙이 있는 칸       → 이전 값과 합치기
 * 자료 수집 3단계(문서 · 웹 · 레이더)가 동시에 clues 칸에 쓰므로, clues 에는 '이어 붙이기' 규칙이 필요합니다.
 */
import { Annotation } from "@langchain/langgraph";

/** 레이더가 올려 보낸 알림 (data/alerts/scenario-N.json) */
export interface Alert {
  scenario: number;
  title: string;
  alert_id: string;
  received_at: string;
  track_ids: string[];
  source: string;
  summary: string;
}

/** 수집 단계 하나가 모아 온 단서 */
export interface Clue {
  from: "docs" | "web" | "radar";
  ok: boolean;
  lines: string[]; // 사람이 읽을 수 있는 한 줄 요약들
}

/** Jev 의 판정 */
export interface Decision {
  choice: "scramble" | "monitor" | "hold"; // 출격 / 감시 강화 / 대기
  probabilities: Record<string, number>;
  confidence: number;
  past: string[]; // 판정할 때 떠올린 과거 기억
}

/** 담당자(사람)의 결정 */
export interface HumanAnswer {
  approved: boolean;
  note?: string;
}

export const ScrambleState = Annotation.Root({
  alert: Annotation<Alert>(),

  // ===== TODO 2-1: 동시에 들어오는 단서를 '이어 붙이는' 규칙 =====
  // 문서 · 웹 · 레이더 단계가 각자 clues 에 1건씩 쓰면 3건이 모두 남아야 합니다.
  // Annotation<Clue[]>({ reducer: (prev, next) => ..., default: () => [] }) 모양으로
  // '이전 배열 + 새 배열' 을 이어 붙이세요. (덮어쓰면 마지막에 끝난 단계의 단서만 남습니다)
  // ----- SOLUTION -----
  //! clues: Annotation<Clue[]>({
  //!   reducer: (prev, next) => { throw new Error("TODO 2-1: 이전 배열과 새 배열을 이어 붙이세요"); },
  //!   default: () => [],
  //! }),
  clues: Annotation<Clue[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // ----- END SOLUTION -----

  cleanClues: Annotation<Clue[]>(), // 안전 검사를 통과한 단서 (판정에는 이것만 쓴다)
  blocked: Annotation<string[]>(),  // 안전 검사에서 걸러낸 문장
  decision: Annotation<Decision>(),
  human: Annotation<HumanAnswer>(),
  reportFile: Annotation<string>(),
});

export type State = typeof ScrambleState.State;
