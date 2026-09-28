/**
 * labs/lab2-scramble/decide.ts — 과거 기억을 떠올리고, Jev 에게 출격 여부를 묻기
 * 입력: alert + cleanClues / 출력: decision (출격·감시 강화·대기 + 확률 + 확신도)
 * LLM 은 글을 쓰고, 판정은 Jev 가 한다. Jev 는 정해진 선택지 중 하나로만 답하므로 결과를 바로 코드에서 쓸 수 있다.
 */
import { askJev, type JevQuestion } from "../../src/lib/jev.js";
import { findMemories } from "../../src/lib/memory.js";
import type { Decision, State } from "./state.js";

export async function decide(state: State): Promise<Partial<State>> {
  // 1) 과거 기억 떠올리기 — 알림과 레이더 단서에 나온 항적 ID 로 찾고, 같은 ID 가 적힌 기억만 남긴다
  const radarText = state.cleanClues.filter((c) => c.from === "radar").flatMap((c) => c.lines).join(" ");
  const ids = [...new Set([...state.alert.track_ids, ...(radarText.match(/[A-Z]{3}-\d{4}/g) ?? [])])];
  const past = (await findMemories(ids.join(" "))).filter((m) => ids.some((id) => m.includes(id)));

  // ===== TODO 2-5: Jev 에게 물어볼 질문 =====
  // recommendation 이라는 choice 질문 하나를 만드세요.
  //   instructions : 판정 기준 한 문장 (예: "수집한 자료와 지침에 따라 대응을 권고한다")
  //   criteria     : { scramble: "…", monitor: "…", hold: "…" } — 각 선택지가 언제 맞는지 한 문장씩
  // Jev 는 대화 모델이 아니라 판정기입니다. 긴 프롬프트 대신 '기준' 을 짧고 분명하게 쓰세요.
  // ----- SOLUTION -----
  //! const questions: Record<string, JevQuestion> = {};
  const questions: Record<string, JevQuestion> = {
    recommendation: {
      type: "choice",
      instructions: "수집한 자료, 적용 지침, 과거 기억에 따라 대응을 권고한다",
      criteria: {
        scramble: "IFF 무응답이고 ADIZ 진입 또는 진입 임박, 내륙 진로, 과거 출격 이력 등 즉시 출격 조건을 충족한다",
        monitor: "위협 신호는 있으나 출격 조건은 미충족이거나, 정보가 부족해 감시 강화가 적절하다",
        hold: "IFF 정상·항로 유지 등으로 평소 감시 유지가 적절하다",
      },
    },
  };
  // ----- END SOLUTION -----
  if (!questions.recommendation) throw new Error("TODO 2-5: recommendation 질문을 먼저 만드세요");

  // 2) Jev 에게 묻기 — 걸러낸 단서(cleanClues)만 보낸다
  const res = await askJev({ alert: state.alert, clues: state.cleanClues, past }, questions);
  const answer = res.answers.recommendation;

  const decision: Decision = {
    choice: (answer.choice ?? "monitor") as Decision["choice"],
    probabilities: answer.probabilities ?? {},
    confidence: answer.confidence ?? 0,
    past,
  };
  return { decision };
}
