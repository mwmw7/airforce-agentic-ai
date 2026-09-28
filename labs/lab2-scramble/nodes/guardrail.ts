/**
 * nodes/guardrail.ts — [실습 2-7 · 2-8] 두 층의 가드레일
 *
 *   1층 결정적(deterministic) 가드레일 — 코드가 무조건 막는다
 *      · 저장 도구 allowlist (보고서 저장만 허용, 통보·삭제 등 금지)
 *      · 저장 경로는 reports/ 안으로만 (Sandbox)
 *      · 승인 없는 저장 금지
 *      · 조회한 문서 안의 '에이전트 지시문' 탐지 → 차단 기록
 *   2층 모델 기반 가드레일 — Jev noul(risky_to_autosave) + confidence 미달 시 사람에게 회부
 *
 * 핵심: Prompt Injection 은 모델을 설득해서 막는 게 아니라, 코드가 행동 자체를 막아야 합니다.
 */
import path from "node:path";
import { trace } from "../../../src/lib/trace.js";
import { CONFIDENCE_HIGH } from "./decide.js";
import type { ScrambleStateT } from "../state.js";

export const ALLOWED_ACTIONS = new Set(["save_report"]);
export const REPORT_DIR = path.resolve(process.cwd(), "reports");

/** 조회 결과·통합 결과에 '에이전트에게 지시하는 문장' 이 섞여 있는지 (결정적 검사) */
export function detectInjection(state: ScrambleStateT): string | null {
  const patterns = [/승인 없이/, /즉시 (저장|통보)/, /이전 지시는 무시/, /ignore (all )?previous/i, /bypass approval/i, /항상 .{0,10}(scramble|출격).{0,6}(고정|으로)/];
  const haystack = [
    ...state.findings.map((f) => f.content),
    ...(state.synthesis?.facts ?? []),
    state.synthesis?.summary ?? "",
  ].join("\n");
  for (const p of patterns) {
    const m = haystack.match(p);
    if (m) return m[0];
  }
  return null;
}

/** 저장 경로가 reports/ 안인지 (Sandbox) */
export function assertInsideReports(target: string) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(REPORT_DIR + path.sep)) {
    throw new Error(`[가드레일] reports/ 밖으로의 쓰기 차단: ${resolved}`);
  }
}

export async function guardrailNode(state: ScrambleStateT): Promise<Partial<ScrambleStateT>> {
  trace.event("node.guardrail");
  const d = state.decision!;

  // ===== TODO 2-7: 결정적 가드레일 =====
  // (1) detectInjection(state) 가 문자열을 돌려주면 → blocked_reason 에 "지시문 탐지: <문구>" 를 기록하고
  //     trace.event("guardrail.block", …) 을 남기세요. (승인 노드는 이 사유를 담당자에게 보여줍니다)
  // (2) 권고(d.recommendation)가 "scramble" 인데 적용 지침 버전(findings doctrine.meta.applied_version)이 승인본이 아니면 차단.
  // 차단은 '흐름을 끊는 것' 이 아니라 '사람에게 사유와 함께 넘기는 것' 입니다 — 여기서 throw 하지 마세요.
  // ----- SOLUTION -----
  //! let blocked_reason: string | undefined;
  let blocked_reason: string | undefined;
  const injected = detectInjection(state);
  if (injected) {
    blocked_reason = `지시문 탐지: "${injected}" — 문서 내용은 데이터이지 명령이 아님. 자동 저장 금지`;
    trace.event("guardrail.block", { kind: "injection", match: injected });
  }
  const applied = String(state.findings.find((f) => f.source === "doctrine")?.meta?.applied_version ?? "");
  if (!blocked_reason && d.recommendation === "scramble" && /draft/i.test(applied)) {
    blocked_reason = `미승인 지침(${applied}) 에 근거한 출격 권고 — 승인본으로 재조사 필요`;
    trace.event("guardrail.block", { kind: "unapproved_doctrine", applied });
  }
  // ----- END SOLUTION -----

  // 2층: 모델 기반 (Jev) — 낮은 확신 또는 자동 저장 위험 → 사람 회부 사유 추가
  const notes: string[] = [];
  if (d.confidence < CONFIDENCE_HIGH) notes.push(`낮은 확신 (confidence ${d.confidence} < ${CONFIDENCE_HIGH})`);
  if (d.risky_to_autosave >= 0.5) notes.push(`Jev 판정: 자동 저장 위험 ${d.risky_to_autosave}`);
  if (notes.length) trace.event("guardrail.refer_to_human", { notes });

  const merged = [blocked_reason, ...notes].filter(Boolean).join(" / ") || undefined;
  if (merged) console.log(`🛡️  guardrail: ${merged}`);
  else console.log("🛡️  guardrail: 이상 없음 (그래도 승인은 필수)");
  return { blocked_reason: merged, step_count: 1 };
}
