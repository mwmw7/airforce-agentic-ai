/**
 * labs/lab2-scramble/nodes.ts — 그래프의 노드들
 *
 *   rag / web / mcp : 자료 수집 (병렬)      → evidence 에 1건씩 추가
 *   judge           : Jev 가 출격 여부 판정   → judgement
 *   approve         : 담당자 승인 대기 (HITL) → approval
 *   report          : 로컬 LLM 이 보고서 작성 → reports/<alert_id>.md
 *
 * 노드는 "State 를 받아서, 바꿀 필드만 돌려주는 함수" 입니다.
 */
import fs from "node:fs";
import path from "node:path";
import { interrupt } from "@langchain/langgraph";
import { decide, type JevQuestion } from "../../src/lib/jev.js";
import { LOCAL_LLM_MODE, LOCAL_LLM_MODEL, localChat } from "../../src/lib/llm.js";
import { queryRadarMcp, searchRag, searchWeb } from "./sources.js";
import type { Approval, Evidence, Judgement, ScrambleStateT } from "./state.js";

type Update = Partial<ScrambleStateT>;

// ── 1. 자료 수집 (3개가 동시에 실행됨) ──
// 하나가 실패해도 전체를 멈추지 않는다 — 실패도 '결과' 로 기록해 판정기와 담당자가 보게 한다.
function collector(source: Evidence["source"], fn: (s: ScrambleStateT) => Promise<Evidence>) {
  return async (state: ScrambleStateT): Promise<Update> => {
    const ev = await fn(state).catch((e): Evidence => ({ source, ok: false, lines: [`조회 실패: ${String(e)}`] }));
    console.log(`🔎 ${source.padEnd(3)} ${ev.ok ? "✓" : "✗"} ${ev.lines.length}건`);
    return { evidence: [ev] };
  };
}
export const ragNode = collector("rag", (s) => searchRag(s.alert));
export const webNode = collector("web", (s) => searchWeb(s.alert));
export const mcpNode = collector("mcp", (s) => queryRadarMcp(s.alert));

// ── 2. Jev 판정 ──
// LLM 은 글을 쓰고, 판정은 Jev 가 한다. Jev 는 질문 형식(noul/choice/score) 대로만 답하므로
// 결과를 문장에서 뽑아낼 필요 없이 바로 코드에서 쓸 수 있다 (= Type-Safe).
export async function judgeNode(state: ScrambleStateT): Promise<Update> {
  // ===== TODO 2-4: Jev 에게 물어볼 질문 =====
  // recommendation 이라는 choice 질문 하나를 만드세요.
  //   instructions : 판정 기준 한 문장 (예: "수집한 자료와 지침에 따라 대응을 권고한다")
  //   criteria     : { scramble: "…", monitor: "…", hold: "…" } — 각 선택지가 언제 맞는지 한 문장씩
  // Jev 는 모델이 아니라 판정기입니다. 장황한 프롬프트 대신 '기준' 을 짧고 분명하게 쓰세요.
  // ----- SOLUTION -----
  //! const questions: Record<string, JevQuestion> = {};
  const questions: Record<string, JevQuestion> = {
    recommendation: {
      type: "choice",
      instructions: "수집한 자료와 적용 지침에 따라 대응을 권고한다",
      criteria: {
        scramble: "IFF 무응답이고 ADIZ 진입 또는 진입 임박, 내륙 진로 등 즉응 출격 조건을 충족한다",
        monitor: "위협 신호는 있으나 출격 조건은 미충족이거나, 정보가 부족해 감시 강화가 적절하다",
        hold: "IFF 정상·항로 유지 등으로 정상 감시 유지가 적절하다",
      },
    },
  };
  // ----- END SOLUTION -----
  if (!questions.recommendation) throw new Error("TODO 2-4: recommendation 질문을 먼저 만드세요");

  const res = await decide({ alert: state.alert, evidence: state.evidence }, questions);
  const a = res.answers.recommendation;
  const judgement: Judgement = {
    recommendation: (a.choice ?? "monitor") as Judgement["recommendation"],
    probabilities: a.probabilities ?? {},
    confidence: a.confidence ?? 0,
  };
  console.log(`⚖️  Jev(${res.provider}, ${res.ms}ms): ${judgement.recommendation}  confidence ${judgement.confidence}`);
  return { judgement };
}

// ── 3. Human-in-the-Loop ──
// interrupt(질문) 을 부르면 그래프가 여기서 멈추고 '질문' 이 run.ts 로 전달됩니다.
// run.ts 가 Command({ resume: 답 }) 으로 다시 실행하면 이 노드가 처음부터 다시 돌고,
// 이번에는 interrupt() 가 멈추지 않고 그 '답' 을 돌려줍니다.
export interface ApprovalRequest {
  alert_id: string;
  summary: string;
  judgement: Judgement;
  evidence: Evidence[];
}

export async function approveNode(state: ScrambleStateT): Promise<Update> {
  const request: ApprovalRequest = {
    alert_id: state.alert.alert_id,
    summary: state.alert.summary,
    judgement: state.judgement!,
    evidence: state.evidence,
  };

  // ===== TODO 2-5: interrupt() 로 담당자 승인 받기 =====
  // const answer = interrupt(request) as Approval;  한 줄로 멈추고, 돌아온 answer 를 { approval: answer } 로 반환하세요.
  // Agent 는 '권고' 까지만. 출격 결정은 이 한 줄을 통해 반드시 사람이 합니다.
  // ----- SOLUTION -----
  //! return { approval: { approved: false, note: "TODO 2-5 미구현 — 사람에게 묻지 않았습니다" } };
  const answer = interrupt(request) as Approval;
  console.log(`👤 담당자: ${answer.approved ? "승인" : "반려"}${answer.note ? ` (${answer.note})` : ""}`);
  return { approval: answer };
  // ----- END SOLUTION -----
}

// ── 4. 로컬 LLM 보고서 ──
// 판정·승인 같은 '사실' 은 코드가 채우고, LLM 은 그 사실을 읽기 좋은 문장으로 정리만 한다.
// 로컬 LLM(Ollama) 을 쓰므로 보고서 작성 중에 자료가 외부로 나가지 않는다.
const LABEL = { scramble: "출격", monitor: "감시 강화", hold: "대기" } as const;

export async function reportNode(state: ScrambleStateT): Promise<Update> {
  const { alert, judgement: j, approval: ap, evidence } = state;
  const evidenceText = evidence.map((e) => `[${e.source}${e.ok ? "" : " · 실패"}]\n${e.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n");
  const decisionLine = `Jev 권고: ${LABEL[j!.recommendation]} (${j!.recommendation}, confidence ${j!.confidence}) / 담당자: ${ap!.approved ? "승인" : "반려"}${ap!.note ? ` — ${ap!.note}` : ""}`;

  // ===== TODO 2-6: 로컬 LLM 에게 보고서 본문 쓰게 하기 =====
  // localChat([{ role: "system", … }, { role: "user", … }], { label: "report", fallback }) 을 호출해 body 를 만드세요.
  //   system : 역할과 형식 (예: "공군 상황 보고서 작성 보조. 주어진 자료만 사용, 한국어 마크다운, 섹션: 상황 요약 / 근거 / 권고 및 조치")
  //   user   : 알림 요약 + decisionLine + evidenceText
  // fallback 은 LOCAL_LLM_MODE=mock 일 때 그대로 쓰일 본문입니다 (아래에 이미 만들어 두었습니다).
  const fallback = `## 상황 요약\n${alert.summary}\n\n## 근거\n${evidenceText}\n\n## 권고 및 조치\n- ${decisionLine}`;
  // ----- SOLUTION -----
  //! const body = fallback;
  const body = await localChat(
    [
      {
        role: "system",
        content:
          "너는 공군 상황 보고서 작성 보조다. 주어진 자료에 있는 내용만 사용하고 추측하지 마라. " +
          "한국어 마크다운으로 '## 상황 요약', '## 근거', '## 권고 및 조치' 세 섹션만 작성하라. 근거에는 출처(rag/web/mcp)를 표기하라.",
      },
      { role: "user", content: `## 알림\n${alert.alert_id} · ${alert.summary}\n\n## 판정·승인\n${decisionLine}\n\n## 수집 자료\n${evidenceText}` },
    ],
    { label: "report", fallback },
  );
  // ----- END SOLUTION -----

  const md = `# 상황 판단 보고서 · ${alert.alert_id}
> 교육용 합성 자료 — 가상 시나리오 ${alert.scenario}: ${alert.title}

| 항목 | 내용 |
|---|---|
| 수신 | ${alert.received_at} · ${alert.source} |
| Jev 권고 | **${LABEL[j!.recommendation]}** (confidence ${j!.confidence}) |
| 확률 | ${Object.entries(j!.probabilities).map(([k, v]) => `${k} ${v}`).join(" · ")} |
| 담당자 | ${ap!.approved ? "✅ 승인" : "❌ 반려"}${ap!.note ? ` — ${ap!.note}` : ""} |
| 작성 | ${LOCAL_LLM_MODE === "mock" ? "mock (템플릿)" : `로컬 LLM ${LOCAL_LLM_MODEL}`} · ${new Date().toISOString()} |

${body}
`;
  const file = path.resolve(process.cwd(), "reports", `${alert.alert_id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, md);
  console.log(`📄 보고서: ${path.relative(process.cwd(), file)}`);
  return { report_path: file };
}
