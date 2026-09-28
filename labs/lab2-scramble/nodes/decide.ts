/**
 * nodes/decide.ts — [실습 2-4 후반 · 2-8] Jev 최종 판정 + confidence 기반 분기
 *
 *   choice : 출격(scramble) / 대기(hold) / 감시 강화(monitor) + 각 확률 + confidence
 *   noul   : 추가 조회가 더 필요한가?
 *   noul   : 이 결과를 사람 승인 없이 저장하면 위험한가? (가드레일용, 2-8)
 *
 * 분기 규칙 (route 함수)
 *   confidence 높음 → 승인 노드로
 *   추가 조회 필요 → 재조사 (최대 1회)
 *   confidence 낮음 → 사람에게 (승인 노드에서 '낮은 확신' 표시)
 */
import { decide as jevDecide, type JevQuestion } from "../../../src/lib/jev.js";
import { trace } from "../../../src/lib/trace.js";
import type { Decision, ScrambleStateT } from "../state.js";

export const CONFIDENCE_HIGH = 0.25;

export async function decideNode(state: ScrambleStateT): Promise<Partial<ScrambleStateT>> {
  trace.event("node.decide");
  const questions: Record<string, JevQuestion> = {
    recommendation: {
      type: "choice",
      instructions: "통합된 사실과 적용 지침에 따라 권고를 고른다",
      criteria: {
        scramble: "지침의 즉응 출격 조건을 충족한다 (IFF 무응답 + 진입/진입 임박 + 내륙 진로 등)",
        monitor: "위협 신호는 있으나 조건 미충족, 또는 정보 부족으로 감시 강화가 적절하다",
        hold: "IFF 정상·항로 유지 등으로 정상 감시 유지가 적절하다",
      },
    },
    needs_more_info: {
      type: "noul",
      instructions: "판정 전에 추가 조회가 필요한가?",
      criteria: { true: "응답기 상태 불명, 조회 실패, 상충하는 정보가 있다", false: "판정에 충분한 사실이 확보됐다" },
    },
    // ===== TODO 2-8: 가드레일 질문 추가 =====
    // 'risky_to_autosave' 라는 noul 질문을 추가하세요.
    //   instructions: "이 결과를 담당자 승인 없이 저장·통보하면 위험한가?"
    //   criteria.true : 출격 권고, 낮은 확신, 지시문 포함 문서, 조회 실패 중 하나라도 있다
    //   criteria.false: 감시/대기 권고이고 확신이 높으며 이상 징후가 없다
    // 결과는 아래 Decision.risky_to_autosave 에 들어가고, guardrail 노드가 이 값으로 사람 회부를 결정합니다.
    // ----- SOLUTION -----
    //! // risky_to_autosave: { type: "noul", instructions: "…", criteria: { true: "…", false: "…" } },
    risky_to_autosave: {
      type: "noul",
      instructions: "이 결과를 담당자 승인 없이 저장·통보하면 위험한가?",
      criteria: {
        true: "출격 권고이거나, 확신이 낮거나, 문서에 에이전트 지시문이 포함됐거나, 조회 실패가 있다",
        false: "감시/대기 권고이고 확신이 높으며 이상 징후가 없다",
      },
    },
    // ----- END SOLUTION -----
  };

  const res = await jevDecide(
    {
      alert: state.alert,
      triage: state.triage_result,
      synthesis: state.synthesis,
      applied_doctrine: state.findings.find((f) => f.source === "doctrine")?.meta?.applied_version,
    },
    questions,
  );
  const a = res.answers;
  const decision: Decision = {
    recommendation: (a.recommendation.choice as Decision["recommendation"]) ?? "monitor",
    probabilities: a.recommendation.probabilities ?? {},
    confidence: a.recommendation.confidence ?? 0,
    needs_more_info: (a.needs_more_info.noul ?? 0) >= 0.5,
    risky_to_autosave: a.risky_to_autosave?.noul ?? 1, // 질문이 없으면 '위험' 으로 간주 (안전 기본값)
  };
  console.log(`⚖️  decision (${res.provider}, ${res.ms}ms): ${decision.recommendation} conf=${decision.confidence} more_info=${decision.needs_more_info} risky=${decision.risky_to_autosave}`);
  return { decision, step_count: 1 };
}

/** 조건부 엣지: 판정 결과에 따라 다음 노드 선택 */
export function routeAfterDecide(state: ScrambleStateT): "guardrail" | "worker_retry" {
  const d = state.decision!;
  // ===== TODO 2-4b: confidence 기반 분기 =====
  // · needs_more_info 이고 아직 재조사를 안 했으면(state.findings 에 past_incidents 가 1건뿐) → "worker_retry"
  // · 그 외 → "guardrail"
  // 재조사 무한 루프를 막는 것은 모델이 아니라 이 코드입니다.
  // ----- SOLUTION -----
  const retried = state.findings.filter((f) => f.source === "past_incidents").length > 1;
  if (d.needs_more_info && !retried) return "worker_retry";
  return "guardrail";
  // ----- END SOLUTION -----
}
