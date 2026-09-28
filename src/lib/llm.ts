/**
 * src/lib/llm.ts — LLM 호출 (OpenAI 호환 API 한 곳으로 통일)
 *
 * 두 종류의 LLM 을 씁니다.
 *   chat()      메인 LLM  — 도구 호출·조사 (Bedrock 중계 / 클라우드 / Ollama / mock)
 *   localChat() 로컬 LLM  — 보고서 작성 (내 PC 의 Ollama. 데이터가 밖으로 나가지 않음)
 *
 * 폐쇄망 이관 포인트 ①
 *   둘 다 "OpenAI 호환 chat/completions" 로 호출합니다.
 *   교체할 것은 .env 의 BASE_URL / API_KEY / MODEL 세 줄뿐입니다.
 *
 * *_MODE=mock 이면 네트워크 없이 규칙 기반으로 응답합니다.
 *   → 키가 없는 교육생도 그래프 흐름을 끝까지 따라올 수 있게 하기 위한 장치입니다.
 */
import "dotenv/config";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { trace } from "./trace.js";

export type Msg = ChatCompletionMessageParam;
export type Tool = ChatCompletionTool;

export const LLM_MODE = (process.env.LLM_MODE ?? "mock") as "relay" | "ollama" | "cloud" | "mock";
export const LLM_MODEL = process.env.LLM_MODEL ?? "qwen3-32b";

export const LOCAL_LLM_MODE = (process.env.LOCAL_LLM_MODE ?? "mock") as "ollama" | "mock";
export const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL ?? "qwen3:8b";

const mainClient = lazyClient(process.env.LLM_BASE_URL, process.env.LLM_API_KEY);
const localClient = lazyClient(process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:11434/v1", "ollama");

function lazyClient(baseURL: string | undefined, apiKey: string | undefined) {
  let c: OpenAI | null = null;
  return () => (c ??= new OpenAI({ baseURL, apiKey: apiKey ?? "no-key" }));
}

export interface ChatResult {
  content: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
}

/** 메인 LLM 한 번 호출. 도구 호출이 있으면 toolCalls 로 돌려줍니다. */
export async function chat(messages: Msg[], tools?: Tool[], opts: { label?: string } = {}): Promise<ChatResult> {
  const t = trace.start("llm.chat", { mode: LLM_MODE, model: LLM_MODEL, label: opts.label, n_messages: messages.length });
  try {
    const result = LLM_MODE === "mock" ? mockChat(messages, tools) : await realChat(mainClient(), LLM_MODEL, messages, tools);
    t.end({ content_preview: result.content.slice(0, 120), tool_calls: result.toolCalls.map((c) => c.name) });
    return result;
  } catch (e) {
    t.error(e);
    throw e;
  }
}

/** 로컬 LLM(Ollama) 으로 글을 쓰게 합니다. mock 이면 fallback 을 그대로 돌려줍니다. */
export async function localChat(messages: Msg[], opts: { label?: string; fallback: string }): Promise<string> {
  const t = trace.start("llm.local", { mode: LOCAL_LLM_MODE, model: LOCAL_LLM_MODEL, label: opts.label });
  try {
    const text = LOCAL_LLM_MODE === "mock" ? opts.fallback : (await realChat(localClient(), LOCAL_LLM_MODEL, messages)).content;
    t.end({ preview: text.slice(0, 120) });
    return text;
  } catch (e) {
    t.error(e);
    throw e;
  }
}

async function realChat(client: OpenAI, model: string, messages: Msg[], tools?: Tool[]): Promise<ChatResult> {
  const res = await client.chat.completions.create({
    model,
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
    // 로컬 모델이 JSON 앞뒤에 설명을 붙이는 경우가 잦아 첫 { … 마지막 } 만 잘라 재시도
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fallthrough */ }
    }
    return { _raw: s };
  }
}

// ──────────────────────────────────────────────────────────────
// mock 모드: 실습 흐름을 재현하는 규칙 기반 응답기
//   · 도구가 주어지고 아직 도구 결과가 없으면 → 첫 번째 도구를 호출한다
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
