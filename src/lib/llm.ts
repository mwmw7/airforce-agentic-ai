/**
 * src/lib/llm.ts — LLM 호출 (OpenAI 호환 API 한 곳으로 통일)
 *
 *   chat()    도구를 쓰는 대화 한 번   — [실습 0] 루프에서 사용
 *   askLLM()  글 한 편 쓰기            — [실습 2] 보고서 작성에서 사용
 *
 * 어떤 모델을 쓸지는 .env 의 LLM_MODE 한 줄로 바꿉니다.
 *   relay  : 강사가 AWS Bedrock 에 올려 둔 모델 (기본. 주소와 조별 토큰만 붙이면 됨)
 *   ollama : 내 노트북의 Ollama (ollama pull qwen3:8b)
 *   cloud  : 워크숍 당일 배포되는 클라우드 키
 *   mock   : 네트워크 없이 흐름만 확인 (정해진 답을 돌려줌)
 * 폐쇄망으로 옮길 때도 .env 의 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 세 줄만 바꾸면 됩니다.
 */
import "dotenv/config";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { trace } from "./trace.js";
import { showError, showLLM } from "./show.js";

export type Msg = ChatCompletionMessageParam;
export type Tool = ChatCompletionTool;

export const LLM_MODE = (process.env.LLM_MODE ?? "mock") as "relay" | "ollama" | "cloud" | "mock";
export const LLM_MODEL = process.env.LLM_MODEL ?? "qwen3-32b";
export const LLM_TIMEOUT_SEC = Number(process.env.LLM_TIMEOUT_SEC ?? 60); // 한 번 호출에 이만큼 기다리고 끊는다

let client: OpenAI | null = null;
// maxRetries: 0 → 늦으면 SDK 가 몰래 다시 부르지 않는다. 다시 부를지는 내 코드(또는 사람)가 정한다
const getClient = () => (client ??= new OpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY ?? "no-key", timeout: LLM_TIMEOUT_SEC * 1000, maxRetries: 0 }));

/** 시간 초과 에러인가? (실제 SDK 에러 또는 mock 의 가짜 에러) */
export const isTimeout = (e: unknown) => e instanceof OpenAI.APIConnectionTimeoutError || (e as Error)?.name === "MockTimeout";

export interface ChatResult {
  content: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  usage?: { prompt_tokens: number; completion_tokens: number }; // 쓴 토큰 수 (실제 모델일 때만)
}

/** 모델을 한 번 부른다. 모델이 도구를 쓰고 싶어 하면 toolCalls 로 돌려준다. */
export async function chat(messages: Msg[], tools?: Tool[], opts: { label?: string } = {}): Promise<ChatResult> {
  const t = trace.start("llm.chat", { mode: LLM_MODE, model: LLM_MODEL, label: opts.label, n_messages: messages.length });
  const started = Date.now();
  try {
    // 시간 초과 시연용 "늦은 척": LLM_MOCK_SLOW=1 이면 매번, once 면 한 번만 가짜 시간 초과를 낸다 (어느 모드든)
    if (process.env.LLM_MOCK_SLOW === "1" || process.env.LLM_MOCK_SLOW === "once") {
      if (process.env.LLM_MOCK_SLOW === "once") process.env.LLM_MOCK_SLOW = "";
      throw Object.assign(new Error(`[늦은 척] ${LLM_TIMEOUT_SEC}초가 지나도 답이 없음`), { name: "MockTimeout" });
    }
    const result = LLM_MODE === "mock" ? mockChat(messages, tools) : await realChat(messages, tools);
    t.end({ content_preview: result.content.slice(0, 120), tool_calls: result.toolCalls.map((c) => c.name), usage: result.usage });
    // --watch 일 때만 찍힌다: 보낸 메시지 전부 + 도구 이름 / 받은 답 + 도구 요청 + 토큰
    showLLM(opts.label ?? "chat", { mode: LLM_MODE, model: LLM_MODEL, timeout_sec: LLM_TIMEOUT_SEC, messages, tools: tools?.map((x) => x.function.name) }, result, Date.now() - started);
    return result;
  } catch (e) {
    t.error(e);
    showError(opts.label ?? "chat", isTimeout(e) ? `시간 초과: ${LLM_TIMEOUT_SEC}초 안에 답이 없음 (${LLM_MODE === "mock" ? "mock" : LLM_MODEL}) — ${(e as Error).message}` : String(e), Date.now() - started);
    throw e;
  }
}

/** 모델에게 글을 쓰게 한다. mock 모드면 mockText 를 그대로 돌려준다. */
export async function askLLM(input: { system: string; user: string; mockText: string }): Promise<string> {
  const t = trace.start("llm.write", { mode: LLM_MODE, model: LLM_MODEL });
  try {
    const started = Date.now();
    const messages: Msg[] = [{ role: "system", content: input.system }, { role: "user", content: input.user }];
    const reply = LLM_MODE === "mock" ? { content: input.mockText, toolCalls: [] } : await realChat(messages);
    t.end({ preview: reply.content.slice(0, 120), usage: reply.usage });
    showLLM("글 쓰기 (도구 없음, 문장만)", { mode: LLM_MODE, model: LLM_MODEL, messages }, { content: reply.content, usage: reply.usage }, Date.now() - started);
    return reply.content;
  } catch (e) {
    t.error(e);
    throw e;
  }
}

async function realChat(messages: Msg[], tools?: Tool[]): Promise<ChatResult> {
  const res = await getClient().chat.completions.create({
    model: LLM_MODEL,
    messages,
    tools: tools?.length ? tools : undefined,
    temperature: 0.2,
  });
  const m = res.choices[0].message;
  // qwen3 계열은 답 앞에 <think>…</think> 를 붙이므로 떼어 낸다. 가끔 생각만 하고 본문을 비우기도 해서, 그때는 생각 글이라도 쓴다
  const raw = m.content ?? "";
  const reasoning = String((m as { reasoning?: string }).reasoning ?? "");
  return {
    content: raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || raw.trim() || reasoning.trim(),
    toolCalls: (m.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })),
    usage: res.usage ? { prompt_tokens: res.usage.prompt_tokens, completion_tokens: res.usage.completion_tokens } : undefined,
  };
}

export function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    // 작은 모델이 JSON 앞뒤에 설명을 붙이는 경우가 잦아 첫 { … 마지막 } 만 잘라 재시도
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch { /* 아래로 */ }
    }
    return { _raw: s };
  }
}

// ──────────────────────────────────────────────────────────────
// mock 모드: 실습 흐름을 재현하는 정해진 응답
//   · 도구가 주어지면 → 아직 안 써 본 도구를 순서대로 하나씩 부른다 (글자 입력이 필요한 도구엔 사용자 글을 그대로 넣는다)
//   · 도구를 다 써 봤으면 → 마지막 도구 결과를 요약해 답한다
// ──────────────────────────────────────────────────────────────
function mockChat(messages: Msg[], tools?: Tool[]): ChatResult {
  const used = messages.filter((m) => m.role === "tool").length;
  const userText = String(messages.find((m) => m.role === "user")?.content ?? "");

  const next = tools?.[used];
  if (next) {
    const params = (next.function.parameters?.properties ?? {}) as Record<string, { type?: string }>;
    const args: Record<string, unknown> = {};
    for (const [key, p] of Object.entries(params)) if (p.type === "string") args[key] = userText.match(/[A-Z]{2,3}-\d{3,4}/)?.[0] ?? userText;
    return { content: "", toolCalls: [{ id: `call_mock_${used + 1}`, name: next.function.name, args }] };
  }

  const toolMsg = [...messages].reverse().find((m) => m.role === "tool");
  return { content: `[mock] 도구 결과를 확인했습니다: ${String(toolMsg?.content ?? "").slice(0, 200)}`, toolCalls: [] };
}
