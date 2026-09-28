/**
 * labs/lab2-scramble/write-report.ts — LLM 이 보고서를 쓰고, 이번 판단을 기억으로 남기기
 * 입력: alert + decision + human + 단서 / 출력: reports/<알림ID>.md 파일 경로
 * 판정·결정 같은 '사실' 은 코드가 채우고, LLM 은 그 사실을 읽기 좋은 문장으로 정리만 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { askLLM, LLM_MODE, LLM_MODEL } from "../../src/lib/llm.js";
import { saveMemory } from "../../src/lib/memory.js";
import type { State } from "./state.js";

const KOREAN = { scramble: "출격", monitor: "감시 강화", hold: "대기" } as const;
const REPORT_FOLDER = path.resolve(process.cwd(), "reports");

export async function writeReport(state: State): Promise<Partial<State>> {
  const { alert, decision, human } = state;
  // 안전 규칙: 사람의 결정 없이 보고서를 남기지 않는다
  if (!human) throw new Error("담당자 결정 없이 보고서를 저장할 수 없습니다");

  const humanLine = `${human.approved ? "승인" : "반려"}${human.note ? ` — ${human.note}` : ""}`;
  const decisionLine = `Jev 권고: ${KOREAN[decision.choice]} (확신도 ${decision.confidence}) / 담당자: ${humanLine}`;
  const clueText = state.cleanClues.map((c) => `[${c.from}${c.ok ? "" : " · 실패"}]\n${c.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n");
  const pastText = decision.past.length ? decision.past.map((m) => `- ${m}`).join("\n") : "- 없음";

  // ===== TODO 2-7: LLM 에게 보고서 본문 쓰게 하기 =====
  // askLLM({ system, user, mockText }) 를 불러 body 를 만드세요.
  //   system   : 역할과 형식 (예: "공군 상황 보고서 작성 보조. 주어진 자료만 사용, 한국어 마크다운, 섹션: 상황 요약 / 근거 / 권고 및 조치")
  //   user     : 알림 요약 + decisionLine + clueText + pastText
  //   mockText : LLM_MODE=mock 일 때 그대로 쓰일 본문 (아래 mockText 를 넘기면 됩니다)
  const mockText = `## 상황 요약\n${alert.summary}\n\n## 근거\n${clueText}\n\n## 과거 기억\n${pastText}\n\n## 권고 및 조치\n- ${decisionLine}`;
  // [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일
  const body = mockText;

  const report = `# 상황 판단 보고서 · ${alert.alert_id}
> 교육용 합성 자료 — 가상 시나리오 ${alert.scenario}: ${alert.title}

| 항목 | 내용 |
|---|---|
| 수신 | ${alert.received_at} · ${alert.source} |
| Jev 권고 | **${KOREAN[decision.choice]}** (확신도 ${decision.confidence}) |
| 확률 | ${Object.entries(decision.probabilities).map(([k, v]) => `${k} ${v}`).join(" · ")} |
| 담당자 | ${humanLine} |
| 걸러낸 문장 | ${state.blocked.length}건 |
| 작성 | ${LLM_MODE === "mock" ? "mock (템플릿)" : `${LLM_MODE} · ${LLM_MODEL}`} · ${new Date().toISOString()} |

${body}
`;

  // 저장 위치는 reports/ 폴더 안으로만 (알림 ID 에 ../ 같은 글자가 섞여도 밖으로 나가지 못하게)
  const file = path.join(REPORT_FOLDER, `${path.basename(alert.alert_id)}.md`);
  fs.mkdirSync(REPORT_FOLDER, { recursive: true });
  fs.writeFileSync(file, report);

  // 이번 판단을 기억으로 남긴다 → 같은 기체가 다시 나타나면 decide 단계에서 떠올린다
  await saveMemory(`${alert.track_ids.join(", ")} · ${alert.received_at.slice(0, 10)} · 권고 ${KOREAN[decision.choice]}(${decision.choice}) · 담당자 ${humanLine} · 상황: ${alert.summary}`);

  return { reportFile: file };
}
