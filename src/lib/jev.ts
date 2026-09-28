/**
 * src/lib/jev.ts — Jev (TypeSafe System One 판정 모델) 클라이언트
 *
 * LLM 은 "설명·조사" 를, Jev 는 "판정" 을 담당합니다.
 *   noul   : 예/아니오 → 확률 (0~1)
 *   choice : 여러 선택지 중 하나 → 선택 + 각 선택지 확률 + confidence
 *   score  : 순서가 있는 등급 → 실수 점수
 * 질문을 여러 개 묶어 한 번에 보내도 지연이 거의 늘지 않는 것이 특징입니다 (실습 2-1 에서 확인).
 *
 * 폐쇄망 이관 포인트 ②
 *   JEV_MODE=openrouter → OpenRouter Decisions API (POST /api/alpha/decisions)
 *   JEV_MODE=local      → 아래 규칙 기반 판정기 (네트워크 불필요, 교육용)
 *   실제 폐쇄망에서는 local 자리에 자체 분류 모델을 꽂으면 됩니다. 인터페이스(decide)는 동일합니다.
 *
 * API 형식 출처: https://openrouter.ai/docs/guides/community/jev-tutorial
 */
import "dotenv/config";
import { trace } from "./trace.js";

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
  provider: "openrouter" | "local";
  ms: number;
}

export const JEV_MODE = (process.env.JEV_MODE ?? "local") as "openrouter" | "local";

/**
 * state(판정 근거 데이터) 와 questions(질문 묶음) 을 보내 답을 받습니다.
 * state 는 JSON 직렬화 가능한 무엇이든 OK — 알림 원문, 조사 결과, LLM 요약 등.
 */
export async function decide(state: Record<string, unknown>, questions: Record<string, JevQuestion>): Promise<JevResult> {
  const t = trace.start("jev.decide", { mode: JEV_MODE, questions: Object.keys(questions) });
  const started = Date.now();
  try {
    const answers = JEV_MODE === "openrouter" ? await viaOpenRouter(state, questions) : localJudge(state, questions);
    const result: JevResult = { answers, provider: JEV_MODE, ms: Date.now() - started };
    t.end({ answers, ms: result.ms });
    return result;
  } catch (e) {
    t.error(e);
    throw e;
  }
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
  const synthesis = (state.synthesis ?? {}) as { uncertainties?: string[] };
  const findings = (state.findings ?? []) as { ok?: boolean; content?: string }[];
  const everything = JSON.stringify(state).toLowerCase();

  const risk = riskScore(primary);
  const uncertain = /불명|unknown|정보 부족|추가 조회/.test(primary) || (synthesis.uncertainties?.length ?? 0) > 0 || findings.some((f) => f.ok === false);
  const injected = /승인 없이|즉시 (저장|통보)|이전 지시는 무시|ignore previous|bypass approval/.test(everything);

  const answers: Record<string, JevAnswer> = {};
  for (const [key, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      let p: number;
      if (/추가 조회|more info|충분/.test(q.instructions)) p = uncertain ? 0.78 : 0.18;                 // "더 조회해야 하나?"
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
    else if (/hold|대기|standby|wait/.test(kk)) raw[k] = 1 - risk;
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
