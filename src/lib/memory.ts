/**
 * src/lib/memory.ts — 장기 기억 (Hindsight)
 *   Hindsight 공식 흐름 네 가지를 같은 이름으로 둔다:
 *     createBank  기억 공간 만들기 (한 번)      retain  기억 맡기기
 *     recall      관련 기억 꺼내기               reflect 기억을 바탕으로 한 문단 답하기 (시연용)
 *   + findSameCase  "전에 똑같은 보고가 있었나?" — 있으면 그때의 판정을 그대로 돌려준다 (Jev 를 다시 부를 필요가 없게)
 *   + showMemoryWork 실행 끝에 Hindsight 가 뒤에서 한 일(사실 추출 · 링크 · consolidation)을 숫자로 보여 준다
 *
 * 콘솔의 MEMORY 줄은 Hindsight 공식 용어 그대로 찍는다: createBank · recall · retain · consolidation
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
import { bold, dim, log } from "./show.js";

export const MEMORY_MODE = (process.env.MEMORY_MODE ?? "file") as "hindsight" | "file";
const BANK = process.env.HINDSIGHT_BANK ?? "control-room";
const MISSION = "관제실 보조. 들어온 보고와 그때 내린 결정을 기억해 두었다가, 비슷한 보고가 다시 오면 떠올린다.";
// 무엇을 뽑아 기억할지 (retain 때 Hindsight 의 LLM 에게 주는 지시). 막연하면 기억도 막연해진다
const RETAIN_MISSION = "관제실 보고의 위치, 물체 종류, 움직임, 무전 여부와 그때의 판정·확신도·사람의 최종 결정을 뽑아라. 진행 안내 문구는 버려라.";

/** 판단 한 건: 보고 원문 + 그때의 판정. Hindsight 에는 metadata 로 붙여 두어, 꺼낼 때 문장을 해석할 필요가 없다 */
export interface Case {
  id: string; report: string; facts: string; action: string; confidence: number; decision: string;
  summary?: string[]; // approve 에서 사람이 본 종합 근거 (레이더 · 확대 · 날씨 · 규정 · 기억 · Jev)
  human?: string;     // 사람의 최종 선택 (출격 / 감시 강화 / 무시)
}

const BASE_URL = process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888";
const hindsight = MEMORY_MODE === "hindsight" ? new HindsightClient({ baseUrl: BASE_URL }) : null;

// ── 콘솔에 보여 주기 위한 것들 (판단에는 쓰지 않는다) ──
const mode = dim(`[${MEMORY_MODE}]`);
const cut = (t: string, n = 70) => (t.length > n ? t.slice(0, n) + "…" : t).replace(/\n/g, " / ");
type Stats = { total_documents: number; total_nodes: number; total_links: number; pending_operations: number; pending_consolidation: number;
  nodes_by_fact_type: Record<string, number>; links_by_link_type: Record<string, number> };
/** 기억 공간의 현재 숫자 (문서 · 기억 · 링크 · 대기 중인 작업). 공식 API GET /banks/{id}/stats */
const getStats = async (): Promise<Stats> => (await fetch(`${BASE_URL}/v1/default/banks/${BANK}/stats`)).json() as Promise<Stats>;
type Operation = { operation_type: string; status: string; created_at: string; updated_at: string };
type Unit = { id: string; text: string; fact_type: string; document_id: string | null; entities: string; source_memory_ids: string[] | null };
/** 기억 공간의 기억(사실 · 요약) 목록. 공식 API GET /banks/{id}/memories/list */
const getUnits = async (): Promise<Unit[]> => ((await (await fetch(`${BASE_URL}/v1/default/banks/${BANK}/memories/list?limit=500`)).json()) as { items: Unit[] }).items ?? [];
/** 서버가 뒤에서 하는 작업 목록 (retain · consolidation …). 공식 API GET /banks/{id}/operations */
const getOperations = async (): Promise<Operation[]> => ((await (await fetch(`${BASE_URL}/v1/default/banks/${BANK}/operations?limit=30`)).json()) as { operations: Operation[] }).operations ?? [];
let before: Stats | null = null; // 이번 실행 시작 때의 숫자 → 끝에 늘어난 만큼 보여 준다
let startedAt = "";              // 이번 실행 시작 시각 → 그 뒤에 생긴 작업만 보여 준다
let retainedDocs: string[] = [];  // 이번 실행에서 retain 한 문서(실행번호)

// ── file 모드: 기억 한 줄 = { time, text } (+ 판단 기록이면 case) ──
type Row = { time: string; text: string; case?: Case };
const FILE = `.hindsight/${BANK}.json`;
const readFile = (): Row[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);
const words = (t: string) => t.split(/[\s·,.!?()"':→]+/).filter((w) => w.length >= 2);
/** 두 문장이 얼마나 같은가 (0~1): 겹친 단어 수 ÷ 두 문장의 전체 단어 수. 똑같은 문장이면 1, 전혀 다르면 0 */
function overlap(a: string, b: string): number {
  const mine = new Set(words(a)), theirs = new Set(words(b));
  const same = [...mine].filter((w) => theirs.has(w)).length;
  return same / Math.max(1, new Set([...mine, ...theirs]).size);
}

/** 기억 공간 만들기. 이미 있으면 그대로 둔다 (Hindsight 는 createBank 가 그렇게 동작한다) */
export async function createBank(): Promise<void> {
  if (hindsight) {
    await hindsight.createBank(BANK, { reflectMission: MISSION, retainMission: RETAIN_MISSION });
    if (before) return; // 숫자는 실행마다 한 번만 보여 준다
    before = await getStats();
    startedAt = new Date().toISOString();
    const f = before.nodes_by_fact_type ?? {};
    log("memory", `${mode} ${bold("createBank")} ${BANK} ${dim("(있으면 그대로 씀)")}`, [
      `${dim("지금 기억 공간")} 문서 ${before.total_documents} · 기억 ${before.total_nodes} ${dim(`(사실 world ${f.world ?? 0} · 요약 observation ${f.observation ?? 0})`)} · 링크 ${before.total_links}`,
    ]);
  } else if (!existsSync(FILE)) { mkdirSync(".hindsight", { recursive: true }); writeFileSync(FILE, "[]"); }
}

/** 기억 맡기기: 판단 한 건을 넣는다. 같은 id(실행번호)로 다시 넣으면 덮어쓴다 (사람이 승인한 뒤 결과를 고쳐 쓸 때) */
export const retain = traceable(async function retain(c: Case): Promise<void> {
  // 요약하지 않고 원문 그대로 넣는다. Hindsight 가 여기서 사실·엔티티·관계(그래프)를 뽑는다
  // 사람이 결정한 뒤(approve)라면 그때 본 종합 근거와 사람의 선택까지 함께 남긴다 → 다음에 "왜 그렇게 했나" 까지 떠오른다
  const text = [
    `보고: ${c.report}`,
    `확인한 사실: ${c.facts}`,
    ...(c.summary ? [`종합 근거:`, ...c.summary.map((l) => `- ${l}`)] : []),
    `판정: ${c.action} (확신 ${Math.round(c.confidence * 100)}%). 결정: ${c.decision}`,
    ...(c.human ? [`사람(담당자)의 최종 선택: ${c.human}`] : []),
  ].join("\n");
  retainedDocs.push(c.id);
  const meta = { report: c.report, action: c.action, confidence: String(c.confidence), decision: c.decision, ...(c.human ? { human: c.human } : {}) };
  if (hindsight) {
    // async: true → 서버가 뒤에서 정리하게 두고 바로 돌아온다 (기억 정리에 서버 LLM 이 몇 초 걸리므로 판단을 기다리게 하지 않는다)
    const res = await hindsight.retain(BANK, text, {
      context: "관제실에 들어온 미식별 항적 보고와 그때의 판정 기록. 화자는 관제 보조 Agent",
      timestamp: new Date().toISOString(),
      documentId: c.id,                                                       // 같은 실행번호 = 같은 문서 → 덮어쓰기
      metadata: meta,                                                         // 꺼낼 때 그대로 돌아온다
      tags: [`판정:${c.action}`],
      async: true,
    });
    log("memory", `${mode} ${bold("retain")} → 문서 ${c.id} ${dim(`(async · operation ${String(res.operation_id ?? "").slice(0, 8)})`)}`, [
      `${dim("원문")} ${cut(text, 90)}`,
      `${dim("tags")} 판정:${c.action}  ${dim("metadata")} action=${c.action} confidence=${meta.confidence} decision=${c.decision}`,
      dim("서버가 뒤에서: 사실 추출(fact extraction) → 엔티티 연결(entity resolution) → 링크 → consolidation(observation 요약)"),
    ]);
  } else {
    const rows = readFile().filter((r) => r.case?.id !== c.id); // 같은 실행번호는 지우고 다시 쓴다
    writeFileSync(FILE, JSON.stringify([...rows, { time: new Date().toISOString(), text, case: c }], null, 2));
    log("memory", `${mode} ${bold("retain")} → ${FILE} 에 1건 ${dim(`(실행번호 ${c.id} · 같은 번호는 덮어씀)`)}`, [`${dim("원문")} ${cut(text, 90)}`]);
  }
}, { name: "memory.retain", run_type: "tool" });

/** 관련 기억 꺼내기: 질문과 관련 있는 기억을 몇 줄 돌려준다. 없으면 빈 배열 */
export const recall = traceable(async function recall(query: string, topN = 3): Promise<string[]> {
  const started = Date.now();
  if (hindsight) {
    // budget 기본(mid) · 사실과 요약(observation) 모두. 네 갈래(의미 · 단어 · 그래프 · 시간)로 찾아 합친다
    const results = (await hindsight.recall(BANK, query, { maxTokens: 600 })).results.slice(0, topN);
    log("memory", `${mode} ${bold("recall")} · Jev 참고용 비슷한 기억 ${dim(`(budget mid · ${Date.now() - started}ms)`)} → ${results.length}건`,
      results.map((r) => `${bar((r as { scores?: { reranker?: number } }).scores?.reranker)} ${dim(`[${r.type}]`)} ${cut(r.text)}`));
    return results.map((r) => r.text);
  }
  // file 모드는 겹치는 단어 수로 고른다 (search-docs.ts 와 같은 방법)
  const found = readFile()
    .map((m) => ({ ...m, score: words(m.text).filter((w) => query.includes(w)).length }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  log("memory", `${mode} ${bold("recall")} · Jev 참고용 비슷한 기억 ${dim("(겹치는 단어 수)")} → ${found.length}건`, found.map((m) => `${dim(`단어 ${m.score}개`)} ${cut(m.text)}`));
  return found.map((m) => `${m.time.slice(0, 16).replace("T", " ")} ${m.text}`);
}, { name: "memory.recall", run_type: "tool" });

/** 전에 똑같은 보고가 있었나? 가장 비슷한 판단 한 건과 일치도(0~1)를 돌려준다. 판단 기록이 없으면 null
 *  "같은 사례" 는 모델 점수가 아니라 코드 규칙으로 정한다: 기억에 붙여 둔 원문 보고(metadata.report)와 지금 보고의 단어 겹침(overlap).
 *  Hindsight 는 후보를 찾아 주는 역할, 같은지 아닌지는 우리가 센다 → 모델이 한국어에 약해도 엉뚱한 사례를 "같다" 고 하지 않는다 */
export const findSameCase = traceable(async function findSameCase(report: string): Promise<{ case: Case; time: string; score: number } | null> {
  if (hindsight) {
    // budget "low" = 빠른 검색 (50~100ms). 원래 사실만(observation 제외) — metadata 가 붙어 있는 건 원래 사실이다
    const started = Date.now();
    const { results } = await hindsight.recall(BANK, report, { budget: "low", types: ["world", "experience"], maxTokens: 600 });
    // 후보마다 원문 보고와의 겹침을 센다 (판단 기록이 붙은 것만)
    const scored = results
      .filter((r) => r.metadata?.action && r.metadata.report)
      .map((r) => ({ r, score: overlap(report, r.metadata!.report) }))
      .sort((a, b) => b.score - a.score);
    log("memory", `${mode} ${bold("recall")} · 같은 사례 찾기 ${dim(`(budget low · world/experience · ${Date.now() - started}ms)`)} → 후보 ${results.length}건`,
      scored.slice(0, 3).map(({ r, score }) => `${bar(score)} ${dim("보고 겹침")} ${cut(r.metadata!.report, 60)} ${dim(`판정 ${r.metadata!.action}`)}`));
    const top = scored[0];
    if (!top) return null;
    const m = top.r.metadata!;
    const kase = { id: top.r.document_id ?? "", report: m.report, facts: "", action: m.action, confidence: Number(m.confidence), decision: m.decision };
    return { case: kase, time: top.r.mentioned_at ?? "", score: top.score };
  }
  // file 모드도 같은 규칙: 저장된 판단 기록의 원문 보고와 겹침
  const scored = readFile().filter((r) => r.case).map((r) => ({ case: r.case!, time: r.time, score: overlap(report, r.case!.report) }));
  return scored.sort((a, b) => b.score - a.score)[0] ?? null;
}, { name: "memory.findSameCase", run_type: "tool" });

/** 점수(0~1)를 막대와 숫자로. 같은 사례 찾기는 보고 겹침, Jev 참고용 recall 은 Hindsight 리랭커 점수. 0.9 이상이면 "같은 사례" */
function bar(x = 0): string {
  const n = Math.round(x * 10);
  return `${"█".repeat(n)}${dim("░".repeat(10 - n))} ${x.toFixed(2)}`;
}

/** 실행 끝: 이번에 retain 한 것을 Hindsight 가 뒤에서 어떻게 처리했는지 보여 준다 (hindsight 모드만, 최대 40초 기다림)
 *  ① 서버 작업 목록(retain → consolidation)  ② fact extraction 으로 뽑힌 사실 + 엔티티  ③ consolidation 이 만들거나 고친 요약(observation) */
export async function showMemoryWork(): Promise<void> {
  if (!hindsight || retainedDocs.length === 0) return;
  const waitFrom = Date.now();
  const done = (o: Operation) => o.status === "completed" || o.status === "failed";
  let ops: Operation[] = [];
  while (Date.now() - waitFrom < 40_000) {
    ops = (await getOperations()).filter((o) => Date.parse(o.created_at) >= Date.parse(startedAt));
    if (ops.every(done) && ops.some((o) => o.operation_type === "consolidation")) break; // retain 끝 + consolidation 까지 끝
    await new Promise((r) => setTimeout(r, 1000));
  }
  const units = await getUnits();
  const facts = units.filter((u) => u.document_id && retainedDocs.includes(u.document_id));
  const factIds = new Set(facts.map((f) => f.id));
  const summaries = units.filter((u) => u.fact_type === "observation" && (u.source_memory_ids ?? []).some((id) => factIds.has(id)));
  const secs = (o: Operation) => ((Date.parse(o.updated_at) - Date.parse(o.created_at)) / 1000).toFixed(1);
  log("memory", `${mode} ${bold(ops.every(done) ? "서버 작업 끝" : "서버 작업 중")} ${dim(`(${((Date.now() - waitFrom) / 1000).toFixed(1)}s 기다림)`)} — retain 뒤 Hindsight 가 한 일`, [
    ...ops.reverse().map((o) => `${bold(o.operation_type.padEnd(14))} ${o.status} ${dim(secs(o) + "s")}`),
    `${bold("fact extraction")} 사실 ${facts.length}개 ${dim("← LLM 이 원문을 사실로 쪼개고, 엔티티를 찾아 knowledge graph 에 잇는다")}`,
    ...facts.map((f) => `  · ${dim(`[${f.fact_type}]`)} ${cut(f.text, 60)} ${dim(`엔티티: ${f.entities}`)}`),
    `${bold("consolidation")}   요약 ${summaries.length}개 ${dim("← 비슷한 사실을 묶어 observation 을 새로 만들거나 고친다")}`,
    ...summaries.map((o) => `  · ${dim(`[observation · 근거 ${o.source_memory_ids?.length ?? 0}개]`)} ${cut(o.text, 60)}`),
    ops.every(done) ? dim(`지금 기억 공간: 기억 ${units.length}개`) : dim("아직 끝나지 않은 작업은 서버가 마저 처리한다 (다음 실행 때 반영)"),
  ]);
  retainedDocs = []; startedAt = new Date().toISOString(); // live 모드처럼 계속 돌 때 다음 회차는 여기서부터 센다
}

/** 기억을 바탕으로 한 문단 답하기 (시연용). file 모드는 LLM 이 없으니 기억 목록을 그대로 돌려준다 */
export async function reflect(query: string): Promise<string> {
  if (hindsight) return (await hindsight.reflect(BANK, query)).text;
  const found = await recall(query, 5);
  return found.length ? `기억 ${found.length}건:\n${found.join("\n")}` : "관련 기억 없음";
}
