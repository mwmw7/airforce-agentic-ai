/**
 * nodes/triage.ts — [실습 2-1] 알림 수신 직후 Jev 1차 트리아지
 *
 * LLM 을 부르기 전에, 빠른 판정 모델로 "지금 당장 조사할 일인가 / 위협 등급은 / 무엇부터 볼까" 를 한 번에 묻습니다.
 * 질문 3개를 한 요청에 묶어도 지연이 거의 늘지 않는 것을 트레이스(ms)로 확인하세요.
 */
import { decide, type JevQuestion } from "../../../src/lib/jev.js";
import { trace } from "../../../src/lib/trace.js";
import type { ScrambleStateT } from "../state.js";

export async function triageNode(state: ScrambleStateT): Promise<Partial<ScrambleStateT>> {
  trace.event("node.triage", { alert_id: state.alert.alert_id });

  // ===== TODO 2-1: Jev 에게 보낼 질문 3개 정의 =====
  // questions 객체에 아래 3개를 채우세요. (형식은 src/lib/jev.ts 의 JevQuestion 참고)
  //   investigate_now : noul   — "즉시 조사가 필요한가?"  criteria: { true: …, false: … }
  //   threat_score    : score  — 위협 등급 4단계 (예: ["무시 가능","낮음","중간","높음"])
  //   first_source    : choice — 먼저 볼 소스 { radar: …, doctrine: …, past_incidents: …, weather_assets: … }
  // instructions 는 판정 기준을 '한 문장' 으로. 모델이 아니라 판정기라는 점을 기억하세요 (장황한 프롬프트 불필요).
  // ----- SOLUTION -----
  //! const questions: Record<string, JevQuestion> = {
  //!   // investigate_now: { type: "noul", instructions: "…", criteria: { true: "…", false: "…" } },
  //!   // threat_score:    { type: "score", instructions: "…", criteria: ["…", "…", "…", "…"] },
  //!   // first_source:    { type: "choice", instructions: "…", criteria: { radar: "…", doctrine: "…", past_incidents: "…", weather_assets: "…" } },
  //! };
  const questions: Record<string, JevQuestion> = {
    investigate_now: {
      type: "noul",
      instructions: "이 알림은 즉시 조사에 착수해야 하는가?",
      criteria: { true: "IFF 무응답·식별구역 진입/접근·내륙 진로 등 위협 신호가 있다", false: "IFF 정상이고 항로 이탈이 경미하거나 정기 훈련이다" },
    },
    threat_score: {
      type: "score",
      instructions: "알림 요약만으로 본 초기 위협 등급",
      criteria: ["무시 가능", "낮음 (감시)", "중간 (추가 조회)", "높음 (즉응 검토)"],
    },
    first_source: {
      type: "choice",
      instructions: "가장 먼저 조회해야 할 정보원",
      criteria: {
        radar: "항적 상세(IFF·속도·진로) 확인이 급하다",
        doctrine: "적용 지침 버전 확인이 먼저다",
        past_incidents: "유사 사건 전례가 판단을 좌우한다",
        weather_assets: "기상·가용 전력이 제약이다",
      },
    },
  };
  // ----- END SOLUTION -----

  if (Object.keys(questions).length === 0) console.warn("⚠️  TODO 2-1: questions 가 비어 있습니다 — Jev 에게 물어볼 질문 3개를 채우세요");
  const res = await decide({ alert: state.alert }, questions);
  const a = res.answers;
  const triage = {
    investigate_now: a.investigate_now?.noul ?? 0,
    threat_score: a.threat_score?.score ?? 0,
    first_source: a.first_source?.choice ?? "radar",
    raw: a as unknown as Record<string, unknown>,
  };
  console.log(`🧭 triage (${res.provider}, ${res.ms}ms): 즉시조사=${triage.investigate_now} 위협=${triage.threat_score} 우선소스=${triage.first_source}`);
  return { triage_result: triage, step_count: 1 };
}
