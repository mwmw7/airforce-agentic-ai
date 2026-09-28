/**
 * [실습 0] 프레임워크 없는 순수 Agent 루프 (1일차 · 40분)
 *
 * 목표: "Agent = while 루프 + 도구 호출 결과를 다시 모델에 되돌려 넣기" 를 손으로 확인한다.
 *
 *   사용자 목표 ─▶ 모델 ─▶ (도구 호출?) ─▶ 내 코드가 도구 실행 ─▶ 결과를 messages 에 추가 ─▶ 다시 모델 …
 *                                   └─ (호출 없음) ─▶ 최종 답변, 루프 종료
 *
 * 핵심 관찰 포인트
 *   · 모델은 "부르겠다" 고 말할 뿐, 실행은 내 코드(executeTool)가 한다.
 *   · 루프를 언제 멈출지(MAX_STEPS)도 모델이 아니라 내 코드가 정한다 = Harness.
 *
 * 실행:  npm run lab0            (정상 종료)
 *        npm run lab0:limit      (MAX_STEPS=2 로 강제 중단 → 중단 이유가 코드에서 나오는지 확인)
 */
import { chat, type Msg, type Tool } from "../../src/lib/llm.js";
import { readFileSync } from "node:fs";

// ── 1. 도구 정의: 모델에게는 "이런 도구가 있다" 는 설명(JSON Schema)만 보여준다 ──
const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_track",
      description: "가상 항적 DB 에서 항적 ID 로 현재 위치·속도·IFF 응답을 조회한다. (교육용 합성 자료)",
      parameters: {
        type: "object",
        properties: { track_id: { type: "string", description: "예: UNK-0412" } },
        required: ["track_id"],
      },
    },
  },
];

// ── 2. 도구 실행: 실제 일은 여기서, 모델이 아니라 내 코드가 한다 ──
function executeTool(name: string, args: Record<string, unknown>): string {
  if (name === "get_track") {
    const db = JSON.parse(readFileSync(new URL("../../data/api/tracks.json", import.meta.url), "utf8")) as Record<string, unknown>[];
    const hit = db.find((t) => t.track_id === args.track_id);
    return hit ? JSON.stringify(hit) : JSON.stringify({ error: "not_found", track_id: args.track_id });
  }
  return JSON.stringify({ error: "unknown_tool", name });
}

// ── 3. Agent 루프 ──
async function runAgent(goal: string) {
  const MAX_STEPS = Number(process.env.MAX_STEPS ?? 8);
  const messages: Msg[] = [
    { role: "system", content: "너는 공역 감시 보조 에이전트다. 필요한 도구를 호출해 사실을 확인한 뒤 한국어로 간결히 보고하라." },
    { role: "user", content: goal },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n── step ${step} ──`);
    const res = await chat(messages, tools, { label: `lab0.step${step}` });

    // 도구 호출이 없으면 = 최종 답변
    if (res.toolCalls.length === 0) {
      console.log("✅ 최종 답변:", res.content);
      return res.content;
    }

    // ===== TODO 0-2: 도구 결과를 messages 에 되돌려 넣기 =====
    // 모델이 요청한 도구 호출(res.toolCalls)을 하나씩 실행하고,
    // (1) 모델의 "도구를 부르겠다" 메시지(assistant, tool_calls 포함)와
    // (2) 각 도구의 실행 결과(role: "tool", tool_call_id 매칭)를
    // messages 배열 끝에 순서대로 추가하세요. 그래야 다음 루프에서 모델이 결과를 볼 수 있습니다.
    // 힌트: OpenAI 호환 형식 — assistant 메시지의 tool_calls[i].function.arguments 는 "문자열(JSON)" 입니다.
    // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
    throw new Error("TODO 0-2 미구현");
  }

  // ===== TODO 0-3: 강제 중단은 모델이 아니라 Harness 가 한다 =====
  // 루프가 MAX_STEPS 를 다 쓰고 여기까지 내려오면 "왜 멈췄는지" 를 코드가 기록하고 알려야 합니다.
  // 중단 사유를 콘솔에 출력하고, 호출자에게 구분 가능한 값(예: "[중단] 최대 스텝 초과") 을 돌려주세요.
  // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
  throw new Error("TODO 0-3 미구현");
}

const goal = process.argv[2] ?? "항적 UNK-0412 의 현재 상태를 확인하고 특이사항을 보고해줘.";
runAgent(goal).catch((e) => {
  console.error(e);
  process.exit(1);
});
