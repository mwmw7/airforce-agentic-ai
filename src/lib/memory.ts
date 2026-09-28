/**
 * src/lib/memory.ts — 장기 메모리 (Hindsight)
 *
 * 단기 메모리 = 컨텍스트 윈도우(이번 실행 안의 messages/state)
 * 장기 메모리 = 프로세스가 죽어도 남는 기록. Hindsight 는 3개 동작으로 다룹니다.
 *   retain  : 사실을 저장            ("항적 UNK-0412 는 IFF 무응답, 감시 강화로 결론")
 *   recall  : 질문으로 검색          ("IFF 무응답 항적을 과거에 어떻게 처리했나?")
 *   reflect : 검색 결과를 종합해 답변 (LLM 이 개입)
 *
 * 폐쇄망 이관 포인트 ③
 *   MEMORY_MODE=hindsight → docker 로 띄운 Hindsight 서버 (@vectorize-io/hindsight-client)
 *   MEMORY_MODE=file      → .hindsight/<bank>.json 에 저장, 단어 겹침으로 검색 (교육용 대체품)
 *   두 구현 모두 같은 Memory 인터페이스를 만족합니다.
 *
 * SDK 문서: https://hindsight.vectorize.io/sdks/nodejs
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { trace } from "./trace.js";

export interface MemoryHit {
  text: string;
  score?: number;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface Memory {
  retain(text: string, opts?: { context?: string; metadata?: Record<string, unknown> }): Promise<void>;
  recall(query: string, opts?: { limit?: number }): Promise<MemoryHit[]>;
}

export const MEMORY_MODE = (process.env.MEMORY_MODE ?? "file") as "hindsight" | "file";

export function getMemory(): Memory {
  const bank = process.env.HINDSIGHT_BANK ?? "scramble"; // 부를 때마다 읽는다 — 채점은 별도 기억 공간을 쓴다
  return MEMORY_MODE === "hindsight" ? new HindsightMemory(bank) : new FileMemory(bank);
}

/** 기억 남기기 (Hindsight retain) */
export async function saveMemory(text: string): Promise<void> {
  await getMemory().retain(text);
}

/** 기억 떠올리기 (Hindsight recall) — 찾은 기억의 문장만 돌려준다 */
export async function findMemories(query: string, limit = 3): Promise<string[]> {
  const hits = await getMemory().recall(query, { limit });
  return hits.map((h) => h.text);
}

// ── Hindsight 서버 ────────────────────────────────────────────
class HindsightMemory implements Memory {
  private clientPromise: Promise<any>;
  constructor(private bank: string) {
    this.clientPromise = import("@vectorize-io/hindsight-client").then(
      (m: any) => new m.HindsightClient({ baseUrl: process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888" }),
    );
  }
  async retain(text: string, opts: { context?: string; metadata?: Record<string, unknown> } = {}) {
    const t = trace.start("memory.retain", { mode: "hindsight", text: text.slice(0, 120) });
    const c = await this.clientPromise;
    await c.retain(this.bank, text, { context: opts.context, metadata: opts.metadata, async: false });
    t.end();
  }
  async recall(query: string, opts: { limit?: number } = {}) {
    const t = trace.start("memory.recall", { mode: "hindsight", query });
    const c = await this.clientPromise;
    const res = await c.recall(this.bank, query, { maxTokens: 2048 });
    const hits: MemoryHit[] = (res?.results ?? res?.memories ?? []).slice(0, opts.limit ?? 5).map((r: any) => ({
      text: r.text ?? r.content ?? JSON.stringify(r),
      score: r.score,
      timestamp: r.timestamp,
      metadata: r.metadata,
    }));
    t.end({ hits: hits.length });
    return hits;
  }
}

// ── 파일 기반 대체품 ─────────────────────────────────────────
class FileMemory implements Memory {
  private file: string;
  constructor(bank: string) {
    this.file = path.resolve(process.cwd(), ".hindsight", `${bank}.json`);
  }
  private load(): (MemoryHit & { tokens: string[] })[] {
    if (!fs.existsSync(this.file)) return [];
    return JSON.parse(fs.readFileSync(this.file, "utf8"));
  }
  async retain(text: string, opts: { context?: string; metadata?: Record<string, unknown> } = {}) {
    const t = trace.start("memory.retain", { mode: "file", text: text.slice(0, 120) });
    const all = this.load();
    all.push({ text, timestamp: new Date().toISOString(), metadata: { ...opts.metadata, context: opts.context }, tokens: tokenize(text) });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(all, null, 2));
    t.end({ total: all.length });
  }
  async recall(query: string, opts: { limit?: number } = {}) {
    const t = trace.start("memory.recall", { mode: "file", query });
    const q = new Set(tokenize(query));
    const hits = this.load()
      .map((m) => ({ ...m, score: m.tokens.filter((w) => q.has(w)).length / Math.max(1, q.size) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score! - a.score!)
      .slice(0, opts.limit ?? 5)
      .map(({ tokens: _t, ...rest }) => rest);
    t.end({ hits: hits.length });
    return hits;
  }
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9가-힣-]+/).filter((w) => w.length >= 2);
}
