/**
 * labs/agent/state.ts — 부모 그래프의 칠판(State)
 *   부모에 남는 것: 보고 · 사실 · 근거 · 기억 · 판정 · 부하가 모델을 부른 횟수
 *   부하(ask-radar.ts)는 이 칠판에 자기 칸(모델과 주고받은 대화 등)을 더해 쓴다.
 *   LangGraph 는 부모·부하 칠판에서 "이름이 겹치는 칸"만 부모로 돌려준다 → 부하의 긴 대화는 부모에 안 남는다 (Context 분리)
 */
import { Annotation } from "@langchain/langgraph";

export interface Judgment { action: string; probabilities: Record<string, number>; confidence: number; danger: number; unknown: number; decision: string }
export interface Memory { report: string; time: string; score: number }

// 칸마다 규칙이 있다: 더하기(steps) · 이름별로 이어 붙이기(evidence) · 나머지는 덮어쓰기
export const MainState = Annotation.Root({
  report: Annotation<string>(),                                                             // 들어온 보고 한 줄
  steps: Annotation<number>({ reducer: (prev, next) => prev + next, default: () => 0 }),  // 부하가 모델을 부른 횟수 (부모는 숫자만 안다)
  facts: Annotation<string>(),                                                              // 부하가 도구로 확인해 정리한 사실 2~3줄
  judgment: Annotation<Judgment>(),                                                         // judge 의 결과
  memory: Annotation<Memory | null>(),                                                      // remember 가 찾은 같은 사례 (없으면 null → judge 로)
  past: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),         // judge 가 떠올린 비슷한 기억 (Jev 참고용)
  // 수집한 근거를 출처 이름별로 모아 둔다 (approve 에서 사람에게 한눈에 보여 주려고). 규정집 Worker 와 레이더 부하가 동시에 써도 섞이지 않고 이어 붙는다
  evidence: Annotation<Record<string, string[]>>({
    reducer: (prev, next) => { const out = { ...prev }; for (const [k, v] of Object.entries(next)) out[k] = [...(out[k] ?? []), ...v]; return out; },
    default: () => ({}),
  }),
});
export type Main = typeof MainState.State;
