/**
 * labs/lab2-scramble/sources.ts — 자료를 모으는 3가지 방법
 *
 *   rag : 내부 문서(지침·과거 사건) 검색 → 관련 문단만 꺼내 온다 (Retrieval-Augmented Generation 의 R)
 *   web : 웹 검색 (기본은 가상 결과 파일, TAVILY_API_KEY 가 있으면 실제 검색)
 *   mcp : MCP 서버(mcp-servers/scramble-radar) 에 도구 호출 → 더미 항적 데이터
 *
 * 세 함수 모두 같은 모양(Evidence) 을 돌려주므로, 그래프 입장에서는 어떤 방법으로 모았는지 몰라도 됩니다.
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Alert, Evidence } from "./state.js";

const DATA = path.resolve(process.cwd(), "data");

// ──────────────────────────────────────────────────────────────
// RAG — 문서를 문단(chunk)으로 잘라 두고, 질문과 겹치는 단어가 많은 문단을 고른다.
//   실제 서비스라면 단어 겹침 대신 임베딩 벡터 유사도를 쓴다. 흐름(자르기 → 검색 → 상위 k개) 은 같다.
//   미승인 초안(approved: false)·폐지된 구버전(superseded_by) 은 색인하지 않는다 — 무엇을 검색 대상에 넣을지도 RAG 설계의 일부.
// ──────────────────────────────────────────────────────────────
interface Chunk { doc: string; heading: string; text: string }

function buildIndex(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const dir of ["doctrine", "incidents"]) {
    for (const file of fs.readdirSync(path.join(DATA, dir)).filter((f) => f.endsWith(".md"))) {
      const raw = fs.readFileSync(path.join(DATA, dir, file), "utf8");
      if (/^approved:\s*false/m.test(raw) || /^superseded_by:/m.test(raw)) continue;
      const title = raw.match(/^title:\s*(.+)$/m)?.[1] ?? raw.match(/^#\s*(.+)$/m)?.[1] ?? file;
      const version = raw.match(/^version:\s*(.+)$/m)?.[1];
      const doc = version ? `${title} ${version}` : title;
      // "## " / "### " 제목 단위로 자른다
      for (const part of raw.replace(/^---[\s\S]*?---\n/, "").split(/\n(?=#{2,3} )/)) {
        const heading = part.match(/^#{2,3}\s*(.+)$/m)?.[1] ?? "";
        const text = part.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">")).join(" ");
        if (text) chunks.push({ doc, heading, text });
      }
    }
  }
  return chunks;
}

export async function searchRag(alert: Alert, k = 3): Promise<Evidence> {
  const q = new Set(tokenize(alert.summary));
  const hits = buildIndex()
    .map((c) => ({ ...c, score: tokenize(c.text).filter((w) => q.has(w)).length }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return { source: "rag", ok: hits.length > 0, lines: hits.map((h) => `[${h.heading ? `${h.doc} · ${h.heading}` : h.doc}] ${h.text.slice(0, 200)}`) };
}

// ──────────────────────────────────────────────────────────────
// Web 검색 — 교육장은 인터넷이 없을 수 있으므로 기본은 가상 결과(data/web/search-results.json).
//   TAVILY_API_KEY 가 있으면 실제 웹 검색 API 를 부른다. 어느 쪽이든 결과 모양은 같다.
// ──────────────────────────────────────────────────────────────
interface WebHit { title: string; url: string; snippet: string }

export async function searchWeb(alert: Alert, k = 2): Promise<Evidence> {
  const query = `${alert.summary} ADIZ`;
  const hits = process.env.TAVILY_API_KEY ? await tavily(query, k) : mockWeb(query, k);
  return { source: "web", ok: hits.length > 0, lines: hits.map((h) => `${h.title} — ${h.snippet} (${h.url})`) };
}

function mockWeb(query: string, k: number): WebHit[] {
  const all: WebHit[] = JSON.parse(fs.readFileSync(path.join(DATA, "web", "search-results.json"), "utf8"));
  const q = new Set(tokenize(query));
  return all
    .map((h) => ({ ...h, score: tokenize(`${h.title} ${h.snippet}`).filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

async function tavily(query: string, k: number): Promise<WebHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, max_results: k }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { results: { title: string; url: string; content: string }[] };
  return json.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 200) }));
}

// ──────────────────────────────────────────────────────────────
// MCP — 레이더 MCP 서버를 자식 프로세스(stdio) 로 띄우고 get_track 도구를 호출한다.
//   Host(이 Agent) → Client → stdio → Server 구조가 코드에 그대로 드러납니다.
// ──────────────────────────────────────────────────────────────
export async function queryRadarMcp(alert: Alert): Promise<Evidence> {
  const transport = new StdioClientTransport({ command: "pnpm", args: ["exec", "tsx", "mcp-servers/scramble-radar/server.ts"], stderr: "ignore" });
  const client = new Client({ name: "scramble-agent", version: "0.1.0" });
  await client.connect(transport);
  try {
    const lines: string[] = [];
    for (const track_id of alert.track_ids) {
      const res = await client.callTool({ name: "get_track", arguments: { track_id } });
      const text = (res.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "{}";
      const t = JSON.parse(text);
      lines.push(t.error ? `${track_id}: 항적 DB 에 없음` : `${track_id}: 고도 ${t.altitude_ft}ft · 속도 ${t.speed_kts}kts · 진로 ${t.heading_deg}° · IFF ${t.iff} · ${t.note}`);
    }
    return { source: "mcp", ok: true, lines };
  } finally {
    await client.close();
  }
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9가-힣-]+/).filter((w) => w.length >= 2);
}
