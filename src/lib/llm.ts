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

export type Msg = ChatCompletionMessageParam;
export type Tool = ChatCompletionTool;

export const LLM_MODE = (process.env.LLM_MODE ?? "mock") as "relay" | "ollama" | "cloud" | "mock";
export const LLM_MODEL = process.env.LLM_MODEL ?? "qwen3-32b";

let client: OpenAI | null = null;
const getClient = () => (client ??= new OpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY ?? "no-key" }));

export interface ChatResult {
  content: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
}

/** 모델을 한 번 부른다. 모델이 도구를 쓰고 싶어 하면 toolCalls 로 돌려준다. */
export async function chat(messages: Msg[], tools?: Tool[], opts: { label?: string } = {}): Promise<ChatResult> {
  const t = trace.start("llm.chat", { mode: LLM_MODE, model: LLM_MODEL, label: opts.label, n_messages: messages.length });
  try {
    const result = LLM_MODE === "mock" ? mockChat(messages, tools) : await realChat(messages, tools);
    t.end({ content_preview: result.content.slice(0, 120), tool_calls: result.toolCalls.map((c) => c.name) });
    return result;
  } catch (e) {
    t.error(e);
    throw e;
  }
}

/** 모델에게 글을 쓰게 한다. mock 모드면 mockText 를 그대로 돌려준다. */
export async function askLLM(input: { system: string; user: string; mockText: string }): Promise<string> {
  const t = trace.start("llm.write", { mode: LLM_MODE, model: LLM_MODEL });
  try {
    const messages: Msg[] = [{ role: "system", content: input.system }, { role: "user", content: input.user }];
    const text = LLM_MODE === "mock" ? input.mockText : (await realChat(messages)).content;
    t.end({ preview: text.slice(0, 120) });
    return text;
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
  return {
    // qwen3 계열은 답 앞에 <think>…</think> 를 붙이므로 떼어 낸다
    content: (m.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
    toolCalls: (m.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })),
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
//   · 도구가 주어지고 아직 도구 결과가 없으면 → 첫 번째 도구를 부른다
//   · 도구 결과가 있으면 → 결과를 요약해 답한다
// ──────────────────────────────────────────────────────────────
function mockChat(messages: Msg[], tools?: Tool[]): ChatResult {
  const hasToolResult = messages.some((m) => m.role === "tool");
  const userText = String(messages.find((m) => m.role === "user")?.content ?? "");

  if (tools?.length && !hasToolResult) {
    const idMatch = userText.match(/[A-Z]{2,3}-\d{3,4}/);
    return {
      content: "",
      toolCalls: [{ id: "call_mock_1", name: tools[0].function.name, args: idMatch ? { track_id: idMatch[0] } : {} }],
    };
  }

  const toolMsg = [...messages].reverse().find((m) => m.role === "tool");
  return { content: `[mock] 도구 결과를 확인했습니다: ${String(toolMsg?.content ?? "").slice(0, 200)}`, toolCalls: [] };
}
