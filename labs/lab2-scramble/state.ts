/**
 * labs/lab2-scramble/state.ts — 그래프 전체가 공유하는 State
 *
 * LangGraph 의 State 는 "노드들이 읽고 쓰는 공용 칠판" 입니다.
 *   · reducer 가 없는 필드 → 새 값으로 덮어쓰기
 *   · reducer 가 있는 필드 → 이전 값과 합치기
 * 조사 노드 3개(rag · web · mcp)가 동시에 evidence 에 쓰므로, evidence 에는 '이어 붙이기' reducer 가 필요합니다.
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

/** 조사 노드 하나가 모아 온 자료 */
export interface Evidence {
  source: "rag" | "web" | "mcp";
  ok: boolean;
  lines: string[]; // 사람이 읽을 수 있는 한 줄 요약들
}

/** Jev 판정 결과 */
export interface Judgement {
  recommendation: "scramble" | "monitor" | "hold";
  probabilities: Record<string, number>;
  confidence: number;
}

/** 담당자 응답 (Human-in-the-Loop) */
export interface Approval {
  approved: boolean;
  note?: string;
}

export const ScrambleState = Annotation.Root({
  alert: Annotation<Alert>(),

  // ===== TODO 2-1: 병렬 조사 결과를 '누적' 하는 reducer =====
  // rag · web · mcp 노드가 각자 evidence 에 1건씩 쓰면 3건이 모두 남아야 합니다.
  // Annotation<Evidence[]>({ reducer: (prev, next) => ..., default: () => [] }) 형태로
  // '이전 배열 + 새 배열' 을 이어 붙이세요. (덮어쓰면 마지막 노드 결과만 남습니다)
  // ----- SOLUTION -----
  //! evidence: Annotation<Evidence[]>({
  //!   reducer: (prev, next) => { throw new Error("TODO 2-1 미구현: 이전 배열과 새 배열을 이어 붙이세요"); },
  //!   default: () => [],
  //! }),
  evidence: Annotation<Evidence[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // ----- END SOLUTION -----

  judgement: Annotation<Judgement | undefined>(),
  approval: Annotation<Approval | undefined>(),
  report_path: Annotation<string | undefined>(),
});

export type ScrambleStateT = typeof ScrambleState.State;
