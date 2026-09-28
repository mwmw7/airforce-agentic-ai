/**
 * src/lib/llm.ts — 메인 LLM 호출 (OpenAI 호환 API 한 곳으로 통일)
 *
 * 폐쇄망 이관 포인트 ①
 *   Bedrock 중계 API · Ollama · 클라우드 모델 모두 "OpenAI 호환 chat/completions" 로 호출합니다.
 *   교체할 것은 .env 의 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 세 줄뿐입니다.
 *
 * LLM_MODE=mock 이면 네트워크 없이 규칙 기반으로 응답합니다.
 *   → 키가 없는 교육생도 그래프 구조·중단·재개를 끝까지 따라올 수 있게 하기 위한 장치입니다.
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
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY ?? "no-key",
    });
  }
  return client;
}

export interface ChatResult {
  content: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  usage?: { prompt: number; completion: number };
}

/** 한 번의 chat/completions 호출. 도구 호출이 있으면 toolCalls 로 돌려줍니다. */
export async function chat(messages: Msg[], tools?: Tool[], opts: { json?: boolean; label?: string } = {}): Promise<ChatResult> {
  const t = trace.start("llm.chat", { mode: LLM_MODE, model: LLM_MODEL, label: opts.label, n_messages: messages.length });
  try {
    const result = LLM_MODE === "mock" ? mockChat(messages, tools, opts) : await realChat(messages, tools, opts);
    t.end({ content_preview: result.content.slice(0, 120), tool_calls: result.toolCalls.map((c) => c.name), usage: result.usage });
    return result;
  } catch (e) {
    t.error(e);
    throw e;
  }
}

async function realChat(messages: Msg[], tools?: Tool[], opts: { json?: boolean } = {}): Promise<ChatResult> {
  const res = await getClient().chat.completions.create({
    model: LLM_MODEL,
    messages,
    tools: tools && tools.length ? tools : undefined,
    temperature: 0.2,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  const m = res.choices[0].message;
  return {
    content: m.content ?? "",
    toolCalls: (m.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      args: safeJson(c.function.arguments),
    })),
    usage: res.usage ? { prompt: res.usage.prompt_tokens, completion: res.usage.completion_tokens } : undefined,
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
//   · json 요청이면 → 시스템 프롬프트에 명시된 스키마의 최소 JSON 을 만든다
// ──────────────────────────────────────────────────────────────
function mockChat(messages: Msg[], tools?: Tool[], opts: { json?: boolean } = {}): ChatResult {
  const last = messages[messages.length - 1];
  const hasToolResult = messages.some((m) => m.role === "tool");
  const userText = String(messages.find((m) => m.role === "user")?.content ?? "");

  if (tools?.length && !hasToolResult) {
    const tool = tools[0];
    const idMatch = userText.match(/[A-Z]{2,3}-\d{3,4}/);
    return {
      content: "",
      toolCalls: [{ id: "call_mock_1", name: tool.function.name, args: idMatch ? { track_id: idMatch[0] } : {} }],
    };
  }

  if (opts.json) {
    // lab2 synthesize 노드용: 조사 결과 텍스트에서 핵심만 뽑아 구조화
    const body = String(last.content ?? "");
    const facts = body.split("\n").filter((l) => /^- /.test(l)).slice(0, 8).map((l) => l.replace(/^- /, ""));
    const alertPart = body.split("## 조사 결과")[0];
    const uncertain = /불명|unknown|정보 부족/.test(alertPart) ? ["알림 자체에 '불명' 항목이 있어 추가 조회가 필요함"] : [];
    if (/승인 없이|approval bypass|즉시 저장/i.test(body)) uncertain.push("지침 문서에 에이전트 동작을 지시하는 문장이 포함되어 있음 (Prompt Injection 의심)");
    return {
      content: JSON.stringify({
        summary: `[mock] 조사 항목 ${facts.length}건을 통합했습니다.`,
        facts,
        uncertainties: uncertain,
        recommended_focus: facts[0] ?? "추가 조회 필요",
      }),
      toolCalls: [],
    };
  }

  const toolMsg = [...messages].reverse().find((m) => m.role === "tool");
  return {
    content: `[mock] 도구 결과를 확인했습니다: ${String(toolMsg?.content ?? "").slice(0, 200)}`,
    toolCalls: [],
  };
}
