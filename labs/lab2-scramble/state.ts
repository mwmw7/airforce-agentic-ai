/**
 * labs/lab2-scramble/state.ts — 그래프 전체가 공유하는 State 정의
 *
 * LangGraph 의 State 는 "노드들이 읽고 쓰는 공용 칠판" 입니다.
 *   · 각 필드는 reducer 를 가질 수 있습니다. reducer 가 없으면 '덮어쓰기', 있으면 '합치기'.
 *   · 병렬 Worker(Send) 가 같은 필드에 동시에 쓰면 reducer 로 합쳐집니다 → findings 가 그 예.
 */
import { Annotation } from "@langchain/langgraph";

export interface Alert {
  scenario: number;
  title: string;
  alert_id: string;
  received_at: string;
  track_ids: string[];
  source: string;
  summary: string;
}

/** Jev 1차 트리아지 결과 */
export interface Triage {
  investigate_now: number;          // noul: 즉시 조사 필요 확률
  threat_score: number;             // score: 위협 등급 (0~3)
  first_source: string;             // choice: 먼저 볼 소스
  raw: Record<string, unknown>;
}

/** 조사 Worker 하나가 돌려주는 결과 */
export interface Finding {
  source: "radar" | "doctrine" | "past_incidents" | "weather_assets";
  ok: boolean;
  content: string;                  // 사람이 읽을 수 있는 요약 텍스트 ("- " 로 시작하는 줄들)
  meta?: Record<string, unknown>;   // 예: 적용 지침 버전, 검색 건수
}

/** LLM 이 구조화한 통합 결과 */
export interface Synthesis {
  summary: string;
  facts: string[];
  uncertainties: string[];
  recommended_focus: string;
}

/** Jev 최종 판정 */
export interface Decision {
  recommendation: "scramble" | "hold" | "monitor";
  probabilities: Record<string, number>;
  confidence: number;
  needs_more_info: boolean;
  risky_to_autosave: number;        // 가드레일 noul
}

export const ScrambleState = Annotation.Root({
  alert: Annotation<Alert>(),
  triage_result: Annotation<Triage | undefined>(),  // 노드 이름(triage) 과 겹치면 안 되므로 _result

  // ===== TODO 2-2b: 병렬 Worker 결과를 '누적' 하는 reducer =====
  // Worker 4개가 각자 findings 에 1건씩 쓰면 4건이 모두 남아야 합니다.
  // Annotation<Finding[]>({ reducer: (prev, next) => ..., default: () => [] }) 형태로
  // '이전 배열 + 새 배열' 을 이어 붙이는 reducer 를 정의하세요. (덮어쓰기면 마지막 Worker 결과만 남습니다)
  // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
  findings: Annotation<Finding[]>({
    reducer: (prev, next) => { throw new Error("TODO 2-2b 미구현: 이전 배열과 새 배열을 이어 붙이세요"); },
    default: () => [],
  }),

  memories: Annotation<string[]>({ reducer: (_p, n) => n, default: () => [] }),
  synthesis: Annotation<Synthesis | undefined>(),
  decision: Annotation<Decision | undefined>(),
  approved: Annotation<boolean | undefined>(),
  approver_note: Annotation<string | undefined>(),
  report_path: Annotation<string | undefined>(),
  blocked_reason: Annotation<string | undefined>(),
  step_count: Annotation<number>({ reducer: (p, n) => p + n, default: () => 0 }),
});

export type ScrambleStateT = typeof ScrambleState.State;
