/**
 * src/lib/memory.ts — 장기 기억 (Hindsight)
 *   Hindsight 공식 흐름 네 가지를 같은 이름으로 둔다:
 *     createBank  기억 공간 만들기 (한 번)      retain  기억 맡기기
 *     recall      관련 기억 꺼내기               reflect 기억을 바탕으로 한 문단 답하기 (시연용)
 *
 * MEMORY_MODE=hindsight → Hindsight 서버 (pnpm memory:up 으로 내 노트북에 띄우거나, 강사 서버 주소)
 * MEMORY_MODE=file      → .hindsight/<bank>.json 에 저장 (서버 없이, 교육생 기본값). 부르는 법은 같다
 *
 * 비유: 기억 보관소가 따로 있고, 우리 코드는 맡기기(retain)와 꺼내기(recall)만 한다.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import { traceable } from "langsmith/traceable";

export const MEMORY_MODE = (process.env.MEMORY_MODE ?? "file") as "hindsight" | "file";
const BANK = process.env.HINDSIGHT_BANK ?? "control-room";
const MISSION = "관제실 보조. 들어온 보고와 그때 내린 결정을 기억해 두었다가, 비슷한 보고가 다시 오면 떠올린다.";
// 무엇을 뽑아 기억할지 (retain 때 Hindsight 의 LLM 에게 주는 지시). 막연하면 기억도 막연해진다
const RETAIN_MISSION = "관제실 보고의 위치, 물체 종류, 움직임, 무전 여부와 그때의 판정·확신도·사람의 최종 결정을 뽑아라. 진행 안내 문구는 버려라.";

/** 판단 한 건: 보고 원문 + 그때의 판정. Hindsight 에는 metadata 로 붙여 두어, 꺼낼 때 문장을 해석할 필요가 없다 */
export interface Case { id: string; report: string; facts: string; action: string; confidence: number; decision: string }

const hindsight = MEMORY_MODE === "hindsight" ? new HindsightClient({ baseUrl: process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888" }) : null;

// ── file 모드: 기억 한 줄 = { time, text } (+ 판단 기록이면 case) ──
type Row = { time: string; text: string; case?: Case };
const FILE = `.hindsight/${BANK}.json`;
const readFile = (): Row[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);
const words = (t: string) => t.split(/[\s·,.!?()"':→]+/).filter((w) => w.length >= 2);

/** 기억 공간 만들기. 이미 있으면 그대로 둔다 (Hindsight 는 createBank 가 그렇게 동작한다) */
export async function createBank(): Promise<void> {
  if (hindsight) await hindsight.createBank(BANK, { reflectMission: MISSION, retainMission: RETAIN_MISSION });
  else if (!existsSync(FILE)) { mkdirSync(".hindsight", { recursive: true }); writeFileSync(FILE, "[]"); }
}

/** 기억 맡기기: 판단 한 건을 넣는다. 같은 id(실행번호)로 다시 넣으면 덮어쓴다 (사람이 승인한 뒤 결과를 고쳐 쓸 때) */
export const retain = traceable(async function retain(c: Case): Promise<void> {
  // 요약하지 않고 원문 그대로 넣는다. Hindsight 가 여기서 사실·엔티티·관계(그래프)를 뽑는다
  const text = `보고: ${c.report}\n확인한 사실: ${c.facts}\n판정: ${c.action} (확신 ${Math.round(c.confidence * 100)}%). 결정: ${c.decision}`;
  if (hindsight) {
    // async: true → 서버가 뒤에서 정리하게 두고 바로 돌아온다 (기억 정리에 서버 LLM 이 몇 초 걸리므로 판단을 기다리게 하지 않는다)
    await hindsight.retain(BANK, text, {
      context: "관제실에 들어온 미식별 항적 보고와 그때의 판정 기록. 화자는 관제 보조 Agent",
      timestamp: new Date().toISOString(),
      documentId: c.id,                                                       // 같은 실행번호 = 같은 문서 → 덮어쓰기
      metadata: { report: c.report, action: c.action, confidence: String(c.confidence), decision: c.decision }, // 꺼낼 때 그대로 돌아온다
      tags: [`판정:${c.action}`],
      async: true,
    });
  } else {
    const rows = readFile().filter((r) => r.case?.id !== c.id); // 같은 실행번호는 지우고 다시 쓴다
    writeFileSync(FILE, JSON.stringify([...rows, { time: new Date().toISOString(), text, case: c }], null, 2));
  }
}, { name: "memory.retain", run_type: "tool" });

/** 관련 기억 꺼내기: 질문과 관련 있는 기억을 몇 줄 돌려준다. 없으면 빈 배열 */
export const recall = traceable(async function recall(query: string, topN = 3): Promise<string[]> {
  if (hindsight) return (await hindsight.recall(BANK, query, { maxTokens: 600 })).results.map((r) => r.text).slice(0, topN);
  // file 모드는 겹치는 단어 수로 고른다 (search-docs.ts 와 같은 방법)
  return readFile()
    .map((m) => ({ ...m, score: words(m.text).filter((w) => query.includes(w)).length }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((m) => `${m.time.slice(0, 16).replace("T", " ")} ${m.text}`);
}, { name: "memory.recall", run_type: "tool" });

/** 전에 똑같은 보고가 있었나? 가장 비슷한 판단 한 건과 일치도(0~1)를 돌려준다. 판단 기록이 없으면 null */
export const findSameCase = traceable(async function findSameCase(report: string): Promise<{ case: Case; time: string; score: number } | null> {
  if (hindsight) {
    // budget "low" = 빠른 검색 (50~100ms). 원래 사실만(observation 제외) — metadata 가 붙어 있는 건 원래 사실이다
    const { results } = await hindsight.recall(BANK, report, { budget: "low", types: ["world", "experience"], maxTokens: 600 });
    const top = results.find((r) => r.metadata?.action);
    if (!top?.metadata) return null;
    const m = top.metadata;
    const score = (top as { scores?: { reranker?: number } }).scores?.reranker ?? 0; // 질문과 기억을 같이 읽고 매긴 일치도
    const kase = { id: top.document_id ?? "", report: m.report, facts: "", action: m.action, confidence: Number(m.confidence), decision: m.decision };
    return { case: kase, time: top.mentioned_at ?? "", score };
  }
  // file 모드: 두 보고의 단어가 얼마나 겹치나 (겹친 단어 수 ÷ 두 보고의 전체 단어 수). 똑같은 보고면 1
  const mine = new Set(words(report));
  const scored = readFile().filter((r) => r.case).map((r) => {
    const theirs = new Set(words(r.case!.report));
    const same = [...mine].filter((w) => theirs.has(w)).length;
    return { case: r.case!, time: r.time, score: same / new Set([...mine, ...theirs]).size };
  });
  return scored.sort((a, b) => b.score - a.score)[0] ?? null;
}, { name: "memory.findSameCase", run_type: "tool" });

/** 기억을 바탕으로 한 문단 답하기 (시연용). file 모드는 LLM 이 없으니 기억 목록을 그대로 돌려준다 */
export async function reflect(query: string): Promise<string> {
  if (hindsight) return (await hindsight.reflect(BANK, query)).text;
  const found = await recall(query, 5);
  return found.length ? `기억 ${found.length}건:\n${found.join("\n")}` : "관련 기억 없음";
}
