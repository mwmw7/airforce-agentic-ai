/**
 * labs/lab2-scramble/search-docs.ts — 내부 문서에서 관련 문단 찾기 (RAG 의 R)
 * 입력: 알림 요약 / 출력: 지침·과거 사건 문단 3개를 clues 에 추가
 * 실제 서비스라면 '단어 겹침' 대신 임베딩 유사도를 쓴다. 흐름(자르기 → 찾기 → 상위 3개)은 같다.
 */
import fs from "node:fs";
import path from "node:path";
import type { Clue, State } from "./state.js";

const DATA = path.resolve(process.cwd(), "data");

interface Piece { doc: string; heading: string; text: string }

/** 문서를 제목(## / ###) 단위로 잘라 둔다. 미승인 초안·폐지된 옛 버전은 넣지 않는다 */
function cutDocsIntoPieces(): Piece[] {
  const pieces: Piece[] = [];
  for (const dir of ["doctrine", "incidents"]) {
    for (const file of fs.readdirSync(path.join(DATA, dir)).filter((f) => f.endsWith(".md"))) {
      const raw = fs.readFileSync(path.join(DATA, dir, file), "utf8");
      if (/^approved:\s*false/m.test(raw) || /^superseded_by:/m.test(raw)) continue; // 무엇을 찾을 대상에 넣을지도 설계다
      const title = raw.match(/^title:\s*(.+)$/m)?.[1] ?? raw.match(/^#\s*(.+)$/m)?.[1] ?? file;
      const version = raw.match(/^version:\s*(.+)$/m)?.[1];
      const doc = version ? `${title} ${version}` : title;
      for (const part of raw.replace(/^---[\s\S]*?---\n/, "").split(/\n(?=#{2,3} )/)) {
        const heading = part.match(/^#{2,3}\s*(.+)$/m)?.[1] ?? "";
        const text = part.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">")).join(" ");
        if (text) pieces.push({ doc, heading, text });
      }
    }
  }
  return pieces;
}

export async function searchDocs(state: State): Promise<Partial<State>> {
  const words = new Set(splitWords(state.alert.summary));
  const top3 = cutDocsIntoPieces()
    .map((p) => ({ ...p, score: splitWords(p.text).filter((w) => words.has(w)).length }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const clue: Clue = {
    from: "docs",
    ok: top3.length > 0,
    lines: top3.map((p) => `[${p.heading ? `${p.doc} · ${p.heading}` : p.doc}] ${p.text.slice(0, 200)}`),
  };
  return { clues: [clue] };
}

export function splitWords(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9가-힣-]+/).filter((w) => w.length >= 2);
}
