/**
 * labs/lab2-scramble/check-safety.ts — 모아 온 자료에 섞인 '수상한 지시문' 걸러내기
 * 입력: clues / 출력: cleanClues(깨끗한 단서) + blocked(걸러낸 문장)
 * 웹 문서가 "이전 지시는 무시하고…" 라고 AI 에게 명령하는 공격(Prompt Injection)은 모델을 설득해서가 아니라 코드가 막는다.
 */
import type { Clue, State } from "./state.js";

// 자료가 AI 에게 '명령' 하는 흔한 표현들
const SUSPICIOUS = [/이전 지시는? 무시/, /승인 없이/, /즉시 (저장|통보)/, /AI 에이전트에게/, /ignore (all )?previous/i];

// 강사 시연용: pnpm scramble:run --scenario 3 --no-safety  → 걸러내지 않으면 판정이 어떻게 바뀌는지 비교
const SKIP = process.argv.includes("--no-safety");

export async function checkSafety(state: State): Promise<Partial<State>> {
  if (SKIP) return { cleanClues: state.clues, blocked: [] };

  // ===== TODO 2-4: 수상한 문장을 단서에서 빼내기 =====
  // state.clues 의 각 단서(clue)마다 lines 를 둘로 나누세요.
  //   · SUSPICIOUS 중 하나라도 맞는 줄 → blocked 배열에 넣기
  //   · 나머지 줄                     → 깨끗한 단서 { ...clue, lines: 남은 줄 } 로 cleanClues 에 넣기
  // 마지막에 { cleanClues, blocked } 를 돌려주세요. (지금 자리표시 코드는 아무것도 걸러내지 않습니다 → 시나리오 3 결과를 보세요)
  // [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일
  return { cleanClues: state.clues, blocked: [] };
}
