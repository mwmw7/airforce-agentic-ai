/**
 * labs/agent/write-report.ts — 사람이 결정한 뒤 브리핑 보고서를 써서 reports/ 에 남긴다
 *   입력: approve 가 사람에게 보여 준 종합 근거(summary) + 사람의 결정(judgment.decision)
 *   처리: 사실·결정은 코드가 머리말에 박고, LLM 은 그 사실로 브리핑 문장만 쓴다  →  출력: reports/<실행번호>.md
 *
 * 꼭 볼 것
 *   · LLM 이 그래프에서 "글을 쓰는" 곳은 여기 한 곳이다. 판정은 Jev, 결정은 사람, 문장만 LLM
 *   · 결정 줄은 LLM 이 아니라 코드가 쓴다 → 모델이 결정을 바꿔 적을 수 없다
 *   · 저장은 reports/ 폴더 안에만 (Sandbox). 파일 이름에 ../ 가 섞여도 바깥으로 못 나간다
 *   · 모델이 실패하거나(mock · 키 없음 · 시간 초과) 해도 코드가 만든 틀 글로 저장한다 — 보고서가 빠지는 일은 없다
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { askLLM, LLM_MODE, LLM_MODEL } from "../../src/lib/llm.js";
import { bold, dim, log } from "../../src/lib/show.js";
import type { Main as S } from "./state.js";

// 보고서를 둘 수 있는 유일한 폴더 (저장소 맨 위의 reports/)
const REPORTS_DIR = fileURLToPath(new URL("../../reports/", import.meta.url));

// 모델에게 주는 규칙. "사실에 없는 건 쓰지 마라" 와 "결정을 바꾸지 마라" 가 핵심
const RULES = [
  "너는 공군 관제실의 당직 보고서를 쓰는 사람이다. 한국어로, 짧은 브리핑 문체(~함, ~임)로 쓴다.",
  "아래 사실 목록에 있는 내용만 쓴다. 목록에 없는 숫자·이름·추측은 쓰지 않는다.",
  "담당자의 결정은 바꾸거나 평가하지 않는다. 이모지는 쓰지 않는다.",
  "형식: '## 상황' 2~3줄, '## 근거' 3~5줄(- 로 시작), '## 조치' 1~2줄.",
].join("\n");

/** reports/ 안에만 저장한다. 경로가 폴더 밖을 가리키면 거부 (격리 경계) */
export function saveReport(fileName: string, text: string): string {
  const target = path.resolve(REPORTS_DIR, fileName);
  if (!target.startsWith(REPORTS_DIR)) throw new Error(`reports/ 밖에는 저장할 수 없습니다: ${fileName}`);
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(target, text);
  return path.relative(process.cwd(), target);
}

/** writeReport 노드: 사람이 결정한 뒤 한 번. 사실은 코드가, 문장은 LLM 이 */
export async function writeReportNode(state: S, config: LangGraphRunnableConfig): Promise<Partial<S>> {
  const id = String(config.configurable?.thread_id ?? Date.now());
  const facts = state.summary.join("\n"); // approve 가 사람에게 보여 준 그 목록 그대로

  // 1. 머리말: 바뀌면 안 되는 것(결정 · 시각 · 실행번호)은 코드가 쓴다
  const head = [`# 당직 브리핑 — ${id}`, "", `- 결정: ${state.judgment.decision}`, `- 작성: ${new Date().toLocaleString("ko-KR")}`, `- 문장: ${LLM_MODE === "mock" ? "코드 틀 글 (mock)" : LLM_MODEL}`, ""];

  // 2. 본문: LLM 이 사실 목록으로 문장을 쓴다. 실패하면 사실 목록을 그대로 쓴다
  let body: string;
  try {
    body = await askLLM({ system: RULES, user: `사실 목록:\n${facts}\n\n담당자 결정: ${state.judgment.decision}`, mockText: facts });
  } catch (e) {
    log("stop", `보고서 문장을 못 받았습니다 (${(e as Error).message}) → 사실 목록을 그대로 남깁니다`);
    body = facts;
  }

  // 3. 저장: reports/ 안에만
  const saved = saveReport(`${id}.md`, [...head, body, ""].join("\n"));
  log("write", `${bold("보고서 저장")} ${saved} ${dim(`(${LLM_MODE === "mock" ? "mock" : LLM_MODEL})`)}`, body.split("\n").filter((l) => l.trim()).slice(0, 8));
  return { briefing: body };
}
