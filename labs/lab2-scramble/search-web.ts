/**
 * labs/lab2-scramble/search-web.ts — 웹에서 공개 정보 찾기
 * 입력: 알림 요약 / 출력: 검색 결과 2건을 clues 에 추가
 * SEARCH_MODE=mock(기본) 이면 data/web/ 의 가상 결과, SEARCH_MODE=tavily 면 실제 웹 검색. 결과 모양은 같다.
 */
import fs from "node:fs";
import path from "node:path";
import { traceable } from "langsmith/traceable";
import { splitWords } from "./search-docs.js";
import type { Clue, State } from "./state.js";

interface WebResult { title: string; url: string; snippet: string }

const SEARCH_MODE = process.env.SEARCH_MODE ?? "mock";

export async function searchWeb(state: State): Promise<Partial<State>> {
  const query = state.alert.summary;
  try {
    const results = SEARCH_MODE === "tavily" ? await searchTavily(query) : searchSampleFile(query);
    const clue: Clue = { from: "web", ok: results.length > 0, lines: results.map((r) => `${r.title} — ${r.snippet} (${r.url})`) };
    return { clues: [clue] };
  } catch (e) {
    // 검색이 실패해도 전체를 멈추지 않는다 — 실패도 단서로 남겨 판정기와 사람이 보게 한다
    return { clues: [{ from: "web", ok: false, lines: [`웹 검색 실패: ${String(e)}`] }] };
  }
}

/** 가상 검색: 알림 요약과 겹치는 단어가 많은 결과 2건 */
function searchSampleFile(query: string): WebResult[] {
  const all: WebResult[] = JSON.parse(fs.readFileSync(path.resolve("data/web/search-results.json"), "utf8"));
  const words = new Set(splitWords(query));
  return all
    .map((r) => ({ ...r, score: splitWords(`${r.title} ${r.snippet}`).filter((w) => words.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

/** 실제 검색: Tavily API (키는 강사가 배포). LangSmith 가 켜져 있으면 "web.search" tool 기록으로 남는다 */
const searchTavily = traceable(async function searchTavily(query: string): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, max_results: 2 }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const json = (await res.json()) as { results: { title: string; url: string; content: string }[] };
  return json.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 200) }));
}, { name: "web.search", run_type: "tool" });
