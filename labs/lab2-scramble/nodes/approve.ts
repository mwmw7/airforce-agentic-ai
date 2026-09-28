/**
 * nodes/approve.ts — [실습 2-5] Human-in-the-Loop: interrupt() 로 담당자 승인 대기
 *
 * interrupt(payload) 를 호출하면
 *   1) 그래프가 이 노드에서 멈추고, payload 가 호출자(run.ts)에게 전달됩니다.
 *   2) 상태는 Checkpointer(SQLite) 에 저장됩니다 → 프로세스를 죽여도 됩니다.
 *   3) 나중에 Command({ resume: 값 }) 으로 다시 invoke 하면, 이 노드가 '처음부터' 다시 실행되고
 *      interrupt() 는 이번엔 멈추지 않고 resume 값을 돌려줍니다.
 *   → 그래서 interrupt() 앞에는 부작용(파일 쓰기 등)을 두면 안 됩니다. 두 번 실행되니까요.
 */
import { interrupt } from "@langchain/langgraph";
import { trace } from "../../../src/lib/trace.js";
import type { ScrambleStateT } from "../state.js";

export interface ApprovalRequest {
  alert_id: string;
  recommendation: string;
  confidence: number;
  probabilities: Record<string, number>;
  summary: string;
  facts: string[];
  uncertainties: string[];
  blocked_reason?: string;
}
export interface ApprovalResponse {
  approved: boolean;
  note?: string;
}

export async function approveNode(state: ScrambleStateT): Promise<Partial<ScrambleStateT>> {
  trace.event("node.approve.enter");
  const d = state.decision!;
  const s = state.synthesis!;

  const request: ApprovalRequest = {
    alert_id: state.alert.alert_id,
    recommendation: d.recommendation,
    confidence: d.confidence,
    probabilities: d.probabilities,
    summary: s.summary,
    facts: s.facts,
    uncertainties: s.uncertainties,
    blocked_reason: state.blocked_reason,
  };

  // ===== TODO 2-5a: interrupt() 로 승인 요청 =====
  // const answer = interrupt(request) as ApprovalResponse;
  // 한 줄이지만, 이 한 줄이 "장기 실행 Agent 제어" 의 핵심입니다.
  // 돌아온 answer 로 approved / approver_note 를 반환하세요.
  // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
  throw new Error("TODO 2-5a 미구현");
}

export function routeAfterApprove(state: ScrambleStateT): "report" | "__end__" {
  return state.approved ? "report" : "__end__";
}
