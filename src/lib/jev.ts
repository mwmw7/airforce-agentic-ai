/**
 * src/lib/jev.ts — Jev (TypeSafe System One 판정 모델) 클라이언트
 *
 * LLM 은 "설명·조사" 를, Jev 는 "판정" 을 담당합니다.
 *   noul   : 예/아니오 → 확률 (0~1)
 *   choice : 여러 선택지 중 하나 → 선택 + 각 선택지 확률 + confidence
 *   score  : 순서가 있는 등급 → 실수 점수
 * 질문을 여러 개 묶어 한 번에 보내도 지연이 거의 늘지 않는 것이 특징입니다.
 *
 * 폐쇄망 이관 포인트 ②
 *   JEV_MODE=typesafe   → TypeSafe 공식 SDK (@typesafe-ai/sdk, TYPESAFE_API_KEY) — 기본 권장
 *   JEV_MODE=openrouter → OpenRouter Decisions API (POST /api/alpha/decisions, OPENROUTER_API_KEY)
 *   JEV_MODE=local      → 아래 규칙 기반 판정기 (네트워크 불필요, 교육용)
 *   실제 폐쇄망에서는 local 자리에 자체 분류 모델을 꽂으면 됩니다. 부르는 법(askJev)은 같습니다.
 *
 * API 형식 출처: https://openrouter.ai/docs/guides/community/jev-tutorial
 *
 * 콘솔의 JEV 줄: 어디로 보냈나(typesafe/openrouter/local) · 보낸 근거(state) · 질문마다 유형과 답(확률 막대)
 */
import "dotenv/config";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { traceable } from "langsmith/traceable";
import { trace } from "./trace.js";
import { bold, dim, log } from "./show.js";

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export interface JevAnswer {
  type: "noul" | "choice" | "score";
  noul?: number;                       // noul: true 일 확률
  choice?: string;                     // choice: 선택된 key
  probabilities?: Record<string, number>;
  confidence?: number;                 // choice: 1위와 2위 확률 차이에 가까운 값
  score?: number;                      // score: criteria 인덱스 기준 실수
}

export interface JevResult {
  answers: Record<string, JevAnswer>;
  provider: "typesafe" | "openrouter" | "local";
  ms: number;
}

export const JEV_MODE = (process.env.JEV_MODE ?? "local") as "typesafe" | "openrouter" | "local";

/**
 * state(판정 근거 데이터) 와 questions(질문 묶음) 을 보내 답을 받습니다.
 * state 는 JSON 직렬화 가능한 무엇이든 OK — 알림 원문, 조사 결과, LLM 요약 등.
 * LangSmith 가 켜져 있으면 "jev.ask" 라는 tool 기록으로 남는다 (state·questions 가 입력, answers 가 출력).
 */
export const askJev = traceable(async function askJev(state: Record<string, unknown>, questions: Record<string, JevQuestion>): Promise<JevResult> {
  const t = trace.start("jev.ask", { mode: JEV_MODE, questions: Object.keys(questions) });
  const started = Date.now();
  try {
    const answers = JEV_MODE === "typesafe" ? await viaTypeSafe(state, questions)
      : JEV_MODE === "openrouter" ? await viaOpenRouter(state, questions)
      : localJudge(state, questions);
    const result: JevResult = { answers, provider: JEV_MODE, ms: Date.now() - started };
    t.end({ answers, ms: result.ms });
    showJev(state, questions, answers, result.ms);
    return result;
  } catch (e) {
    t.error(e);
    throw e;
  }
}, { name: "jev.ask", run_type: "tool" });

/** Jev 가 한 일을 한눈에: 보낸 근거 → 질문 하나마다 유형 · 질문 · 답(확률 막대) */
function showJev(state: Record<string, unknown>, questions: Record<string, JevQuestion>, answers: Record<string, JevAnswer>, ms: number) {
  const bar = (p = 0) => `${"█".repeat(Math.round(p * 10))}${dim("░".repeat(10 - Math.round(p * 10)))} ${String(Math.round(p * 100)).padStart(3)}%`;
  const where = JEV_MODE === "local" ? "local 규칙 판정기" : `${JEV_MODE} · ${process.env.JEV_MODEL ?? "jev-latest"}`;
  const sent = Object.entries(state).map(([k, v]) => (Array.isArray(v) ? `${k}(${v.length}건)` : `${k}(${String(v ?? "").length}자)`)).join(" · ");
  const lines = [`${dim("보낸 근거 state")} ${sent}`];
  Object.entries(questions).forEach(([key, q], i) => {
    const a = answers[key] ?? {};
    lines.push(`${"①②③④⑤"[i] ?? "-"} ${bold(key.padEnd(8))} ${dim(q.type.padEnd(6))} ${q.instructions}`);
    if (q.type === "choice") {
      for (const [k, p] of Object.entries(a.probabilities ?? {}).sort((x, y) => y[1] - x[1]))
        lines.push(`     ${k === a.choice ? bold("▶ " + k.padEnd(9)) : "  " + k.padEnd(9)} ${bar(p)}${k === a.choice ? `  ${dim("확신")} ${Math.round((a.confidence ?? 0) * 100)}%` : ""}`);
    } else if (q.type === "score") {
      const max = q.criteria.length - 1, lv = Math.round(a.score ?? 0);
      lines.push(`     → ${(a.score ?? 0).toFixed(2)} / ${max}  ${"■".repeat(lv + 1)}${dim("□".repeat(max - lv))}  ${q.criteria[lv] ?? ""}`);
    } else {
      lines.push(`     → ${(a.noul ?? 0) >= 0.5 ? bold("예") : "아니오"} ${dim("(예일 확률)")} ${bar(a.noul)}`);
    }
  });
  log("jev", `${dim(`[${JEV_MODE}]`)} ${bold("System One 판정")} · ${where} · 질문 ${Object.keys(questions).length}개 한 번에 · ${ms}ms`, lines);
}

/** TypeSafe 공식 SDK: 질문 모양이 우리 JevQuestion 과 같아서 그대로 넘긴다. 키는 SDK 가 TYPESAFE_API_KEY 에서 읽는다 */
async function viaTypeSafe(state: Record<string, unknown>, questions: Record<string, JevQuestion>) {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY 가 없습니다. .env 를 확인하거나 JEV_MODE=local 로 실행하세요.");
  const client = new TypeSafeClient({ defaultModel: process.env.JEV_MODEL ?? "jev-latest" });
  // SDK 의 타입은 더 엄격하지만(질문·state 모양이 고정) 실제 JSON 모양은 같으므로 모양만 맞춰 넘긴다
  const { answers } = await client.systemOne({ state, questions } as unknown as Parameters<typeof client.systemOne>[0]);
  return answers as unknown as Record<string, JevAnswer>;
}

async function viaOpenRouter(state: Record<string, unknown>, questions: Record<string, JevQuestion>) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY 가 없습니다. .env 를 확인하거나 JEV_MODE=local 로 실행하세요.");
  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.JEV_MODEL ?? "typesafe/jev-1.13", state, questions }),
  });
  if (!res.ok) throw new Error(`Jev API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { answers: Record<string, JevAnswer> };
  return json.answers;
}

// ──────────────────────────────────────────────────────────────
// 로컬 판정기 (교육용 규칙 기반)
//   실제 Jev 를 흉내내는 것이 아니라, "판정기 인터페이스 뒤에 무엇이든 꽂을 수 있다" 를 보여주는 자리입니다.
//   state 안의 문자열을 훑어 위험 신호를 세고, 질문 유형별로 확률을 만들어 냅니다.
// ──────────────────────────────────────────────────────────────
function localJudge(state: Record<string, unknown>, questions: Record<string, JevQuestion>): Record<string, JevAnswer> {
  // 판정 근거를 '알림 원문' 중심으로 좁힌다 — 지침 문서 본문까지 훑으면 모든 시나리오가 위험으로 보인다
  const alert = (state.alert ?? state) as Record<string, unknown>;
  const primary = JSON.stringify(alert).toLowerCase();
  const clues = (state.clues ?? []) as { ok?: boolean }[];
  const everything = JSON.stringify(state).toLowerCase();

  let risk = riskScore(primary);
  // 과거 기억: 같은 기체를 예전에 '출격' 으로 판단한 기록이 있으면 위험도를 올린다
  if (/scramble|출격/.test(JSON.stringify(state.past ?? []))) risk = clamp(risk + 0.2);
  const uncertain = /불명|unknown|정보 부족|추가 조회|모르겠/.test(primary) || clues.some((c) => c.ok === false);
  const injected = /승인 없이|즉시 (저장|통보)|이전 지시는 무시|ignore previous|bypass approval/.test(everything);
  // 자료에 섞인 수상한 지시문에 '속아 넘어가는' 모습을 흉내 낸다 — 걸러내지 않으면 무조건 출격으로 기운다
  if (injected) risk = 0.95;

  const answers: Record<string, JevAnswer> = {};
  for (const [key, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      let p: number;
      if (/추가 조회|more info|충분/.test(q.instructions)) p = uncertain ? 0.78 : 0.18;                 // "더 조회해야 하나?"
      else if (/정체|짐작/.test(q.instructions)) p = uncertain ? 0.75 : 0.25;                          // "정체를 모르겠나?"
      else if (/승인 없이|위험|risky|autosave/.test(q.instructions)) p = injected ? 0.92 : risk >= 0.6 ? 0.7 : uncertain ? 0.55 : 0.2; // 가드레일
      else if (/안전|safe|정상|normal/.test(q.instructions)) p = 1 - risk;
      else p = risk;                                                                                    // "즉시 조사?"
      answers[key] = { type: "noul", noul: round(clamp(p)) };
    } else if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      const probs = spread(keys, risk);
      const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
      answers[key] = { type: "choice", choice: sorted[0][0], probabilities: probs, confidence: round(sorted[0][1] - (sorted[1]?.[1] ?? 0)) };
    } else {
      const n = q.criteria.length;
      answers[key] = { type: "score", score: round(risk * (n - 1)) };
    }
  }
  return answers;
}

function riskScore(text: string): number {
  let s = 0.3;
  const signals: [RegExp, number][] = [
    [/iff[^a-z가-힣]{0,6}(none|no_response|무응답)/, 0.3],
    [/(adiz|식별구역).{0,24}(진입|inside|entered)/, 0.2],
    [/(진로|heading).{0,20}(내륙|inland|inbound)/, 0.15],
    [/편대|formation|2건/, 0.1],
    [/항로.{0,24}이탈/, 0.25],
    [/(민항|civil|airline|비행계획)/, -0.1],
    [/iff[^a-z가-힣]{0,6}(mode ?3|정상|normal|valid)/, -0.1],
    [/(불명|unknown|정보 부족)/, 0.25],
    // 아래는 쉬운 말로 쓴 보고(실습 0)용 신호
    [/(대답|응답|무전).{0,8}(없|안 )/, 0.3],
    [/(풍선|새떼|드론|작은 점)/, 0.2],
    [/(훈련기|예정된|미리 연락|여객기)/, -0.2],
  ];
  for (const [re, w] of signals) if (re.test(text)) s += w;
  return clamp(s);
}

/** 선택지 key 이름에 따라 위험도를 분배 — 출격/대기/감시 3지선다를 염두에 둔 휴리스틱 */
function spread(keys: string[], risk: number): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const k of keys) {
    const kk = k.toLowerCase();
    if (/scramble|출격|launch/.test(kk)) raw[k] = risk;
    else if (/monitor|감시|watch/.test(kk)) raw[k] = 1 - Math.abs(risk - 0.5) * 2;
    else if (/hold|대기|standby|wait|ignore|무시/.test(kk)) raw[k] = 1 - risk;
    else if (/radar|항적|track/.test(kk)) raw[k] = 0.6;
    else if (/doctrine|지침/.test(kk)) raw[k] = 0.4 + risk * 0.3;
    else raw[k] = 0.3;
    raw[k] = Math.max(raw[k], 0.02);
  }
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  for (const k of keys) raw[k] = round(raw[k] / sum);
  return raw;
}

const clamp = (x: number) => Math.min(0.98, Math.max(0.02, x));
const round = (x: number) => Math.round(x * 1000) / 1000;
