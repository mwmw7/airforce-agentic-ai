/**
 * [실습 0] 프레임워크 없는 순수 Agent 루프 (1일차 · 40분)
 *
 * Agent = while 루프 + "모델이 부른 도구를 내 코드가 실행하고, 결과를 다시 모델에게 보여주기"
 *
 *   질문 ─▶ 모델 ─┬─ 도구 호출 요청 ─▶ 내 코드가 도구 실행 ─▶ 결과를 messages 에 추가 ─▶ 다시 모델 …
 *                └─ 요청 없음      ─▶ 최종 답변, 끝
 *
 * 관찰 포인트
 *   · 모델은 "이 도구를 불러 달라" 고 말할 뿐, 실제 실행은 내 코드(runTool)가 한다.
 *   · 언제 멈출지(MAX_STEPS)도 모델이 아니라 내 코드가 정한다 = Harness.
 *
 * 실행:  pnpm loop:run      정상 종료
 *        pnpm loop:limit    MAX_STEPS=1 로 강제 중단 → 중단 사유가 코드에서 나오는지 확인
 */
import { readFileSync } from "node:fs";
import { chat, type Msg, type Tool } from "../../src/lib/llm.js";

const MAX_STEPS = Number(process.env.MAX_STEPS ?? 8);

// ── 1. 도구 설명: 모델은 이 설명만 보고 "어떤 도구를 부를지" 결정한다 ──
const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_track",
      description: "항적 ID 로 현재 위치·속도·IFF 응답을 조회한다. (교육용 합성 자료)",
      parameters: {
        type: "object",
        properties: { track_id: { type: "string", description: "예: UNK-0412" } },
        required: ["track_id"],
      },
    },
  },
];

// ── 2. 도구 실행: 실제 일은 모델이 아니라 여기(내 코드)서 한다 ──
const tracks: { track_id: string }[] = JSON.parse(
  readFileSync(new URL("../../data/api/tracks.json", import.meta.url), "utf8"),
);

function runTool(name: string, args: Record<string, unknown>): string {
  if (name !== "get_track") return JSON.stringify({ error: `모르는 도구: ${name}` });
  const track = tracks.find((t) => t.track_id === args.track_id);
  return JSON.stringify(track ?? { error: `항적 없음: ${args.track_id}` });
}

// ── 3. Agent 루프 ──
async function runAgent(question: string): Promise<string> {
  const messages: Msg[] = [
    { role: "system", content: "너는 공역 감시 보조 에이전트다. 도구로 사실을 확인한 뒤 한국어로 간결히 보고하라." },
    { role: "user", content: question },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n── step ${step} ──`);
    const reply = await chat(messages, tools, { label: `lab0.step${step}` });

    // 도구 호출 요청이 없으면 = 최종 답변 → 끝
    if (reply.toolCalls.length === 0) {
      console.log("✅ 최종 답변:", reply.content);
      return reply.content;
    }

    // ===== TODO 0-2: 도구를 실행하고 결과를 messages 에 되돌려 넣기 =====
    // ① 모델의 "도구를 불러 달라" 는 요청을 assistant 메시지로 messages 에 추가
    //    (tool_calls[i].function.arguments 는 JSON "문자열" — JSON.stringify(call.args))
    // ② reply.toolCalls 를 하나씩 runTool 로 실행하고,
    //    결과를 { role: "tool", tool_call_id: call.id, content: 결과 } 로 messages 에 추가
    // → 그래야 다음 step 에서 모델이 도구 결과를 볼 수 있습니다.
    // ----- SOLUTION -----
    // ① 모델의 요청을 대화 기록에 남긴다
    messages.push({
      role: "assistant",
      content: reply.content || null,
      tool_calls: reply.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      })),
    });

    // ② 도구를 실제로 실행하고, 결과를 대화 기록에 붙인다
    for (const call of reply.toolCalls) {
      const result = runTool(call.name, call.args);
      console.log(`🔧 ${call.name}(${JSON.stringify(call.args)}) → ${result.slice(0, 120)}`);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    // ----- END SOLUTION -----
  }

  // ===== TODO 0-3: 강제 중단은 모델이 아니라 Harness(내 코드)가 한다 =====
  // 여기까지 왔다 = 모델이 답을 못 낸 채 MAX_STEPS 를 다 썼다는 뜻입니다.
  // 중단 사유를 콘솔에 출력하고, 구분 가능한 문자열(예: "[중단] 최대 스텝 초과")을 return 하세요.
  // ----- SOLUTION -----
  const stopped = `[중단] 최대 스텝(${MAX_STEPS}) 초과 — 모델이 아니라 코드가 루프를 멈췄습니다.`;
  console.log("⛔", stopped);
  return stopped;
  // ----- END SOLUTION -----
}

const question = process.argv[2] ?? "항적 UNK-0412 의 현재 상태를 확인하고 특이사항을 보고해줘.";
runAgent(question).catch((e) => {
  console.error(e);
  process.exit(1);
});
