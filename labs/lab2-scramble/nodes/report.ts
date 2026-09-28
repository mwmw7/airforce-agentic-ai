/**
 * nodes/report.ts — [실습 2-5] 승인된 결과만 보고서로 저장 + Hindsight retain
 *
 * 이 노드는 approved === true 일 때만 도달합니다 (routeAfterApprove).
 * 그래도 한 번 더 코드로 확인합니다 — "모델은 판단하고, 코드가 통제한다".
 */
import fs from "node:fs";
import path from "node:path";
import { getMemory } from "../../../src/lib/memory.js";
import { trace } from "../../../src/lib/trace.js";
import { ALLOWED_ACTIONS, REPORT_DIR, assertInsideReports } from "./guardrail.js";
import type { ScrambleStateT } from "../state.js";

export async function reportNode(state: ScrambleStateT): Promise<Partial<ScrambleStateT>> {
  trace.event("node.report");
  const action = "save_report";
  if (!ALLOWED_ACTIONS.has(action)) throw new Error(`[가드레일] 허용되지 않은 행동: ${action}`);
  if (state.approved !== true) throw new Error("[가드레일] 승인되지 않은 결과는 저장할 수 없습니다");

  const d = state.decision!, s = state.synthesis!;
  const file = path.join(REPORT_DIR, `${state.alert.alert_id}_${d.recommendation}.md`);
  assertInsideReports(file);

  const label = { scramble: "출격", hold: "대기", monitor: "감시 강화" }[d.recommendation];
  const md = `# 상황 판단 보조 보고서 · ${state.alert.alert_id}
> 교육용 합성 자료 — 가상 시나리오 ${state.alert.scenario}: ${state.alert.title}

- 생성: ${new Date().toISOString()}
- 권고: **${label}** (${d.recommendation}) · confidence ${d.confidence}
- 확률: ${Object.entries(d.probabilities).map(([k, v]) => `${k} ${v}`).join(" · ")}
- 담당자 승인: ${state.approved ? "O" : "X"}${state.approver_note ? ` — ${state.approver_note}` : ""}
${state.blocked_reason ? `- 가드레일 메모: ${state.blocked_reason}\n` : ""}
## 요약
${s.summary}

## 확인된 사실
${s.facts.map((f) => `- ${f}`).join("\n") || "- (없음)"}

## 불확실한 점
${s.uncertainties.map((u) => `- ${u}`).join("\n") || "- (없음)"}

## 조사 원본
${state.findings.map((f) => `### ${f.source}${f.ok ? "" : " (실패)"}\n${f.content}`).join("\n\n")}

## 과거 실행 메모리
${state.memories.map((m) => `- ${m}`).join("\n") || "- (없음)"}
`;
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(file, md);
  console.log(`💾 보고서 저장: ${path.relative(process.cwd(), file)}`);

  // ===== TODO 2-5b: Hindsight retain — 이번 실행에서 확인한 사실을 장기 메모리에 남기기 =====
  // getMemory().retain(text, { context, metadata }) 로 한 줄 요약을 저장하세요.
  //   text 예: "알림 ALT-… 항적 UNK-0412: IFF 무응답·ADIZ 진입 → 권고 scramble (승인됨). 적용 지침 v2"
  //   metadata: { alert_id, scenario, recommendation }
  // 프로세스를 재시작하고 같은 시나리오를 돌리면 synthesize 노드의 recall 이 이 기록을 되찾아야 합니다.
  // ----- SOLUTION -----
  const applied = state.findings.find((f) => f.source === "doctrine")?.meta?.applied_version ?? "?";
  await getMemory().retain(
    `알림 ${state.alert.alert_id} 항적 ${state.alert.track_ids.join(",")}: ${s.recommended_focus || s.summary.slice(0, 80)} → 권고 ${d.recommendation} (담당자 승인). 적용 지침 ${applied}`,
    { context: `scenario-${state.alert.scenario}`, metadata: { alert_id: state.alert.alert_id, scenario: state.alert.scenario, recommendation: d.recommendation } },
  );
  console.log("🧠 retain 완료");
  // ----- END SOLUTION -----

  return { report_path: file, step_count: 1 };
}
