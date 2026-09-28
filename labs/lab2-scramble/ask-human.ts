/**
 * labs/lab2-scramble/ask-human.ts — 멈추고 담당자에게 출격 결정을 받기 (Human-in-the-Loop)
 * 입력: alert + decision + 단서 / 출력: human (승인 또는 반려 + 메모)
 * interrupt(질문) 을 부르면 그래프가 여기서 멈추고 '질문' 이 run.ts 로 전달된다.
 */
import { interrupt } from "@langchain/langgraph";
import type { Clue, Decision, HumanAnswer, State } from "./state.js";

/** 담당자 화면에 보여 줄 내용 */
export interface Question {
  alert_id: string;
  summary: string;
  decision: Decision;
  clues: Clue[];
  blocked: string[];
}

export async function askHuman(state: State): Promise<Partial<State>> {
  const question: Question = {
    alert_id: state.alert.alert_id,
    summary: state.alert.summary,
    decision: state.decision,
    clues: state.cleanClues,
    blocked: state.blocked,
  };

  // ===== TODO 2-6: interrupt() 로 멈추고 담당자 답 받기 =====
  // const answer = interrupt(question) as HumanAnswer;  한 줄로 멈추고, 돌아온 answer 를 { human: answer } 로 돌려주세요.
  // run.ts 가 Command({ resume: 답 }) 으로 다시 실행하면 이 함수가 처음부터 다시 돌고,
  // 이번에는 interrupt() 가 멈추지 않고 그 '답' 을 돌려줍니다.
  // Agent 는 '권고' 까지만. 출격 결정은 이 한 줄을 통해 반드시 사람이 합니다.
  // ----- SOLUTION -----
  //! return { human: { approved: false, note: "TODO 2-6 미구현 — 사람에게 묻지 않았습니다" } };
  const answer = interrupt(question) as HumanAnswer;
  return { human: answer };
  // ----- END SOLUTION -----
}
