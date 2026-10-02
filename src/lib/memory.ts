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

const hindsight = MEMORY_MODE === "hindsight" ? new HindsightClient({ baseUrl: process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888" }) : null;

// ── file 모드: 기억 한 줄 = { time, text } ──
const FILE = `.hindsight/${BANK}.json`;
const readFile = (): { time: string; text: string }[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);
const words = (t: string) => t.split(/[\s·,.!?()"':→]+/).filter((w) => w.length >= 2);

/** 기억 공간 만들기. 이미 있으면 그대로 둔다 (Hindsight 는 createBank 가 그렇게 동작한다) */
export async function createBank(): Promise<void> {
  if (hindsight) await hindsight.createBank(BANK, { reflectMission: MISSION });
  else if (!existsSync(FILE)) { mkdirSync(".hindsight", { recursive: true }); writeFileSync(FILE, "[]"); }
}

/** 기억 맡기기: "보고 … → 결정 …" 같은 한 줄을 넣는다 */
export const retain = traceable(async function retain(text: string): Promise<void> {
  // async: true → 서버가 뒤에서 정리하게 두고 바로 돌아온다 (기억 정리에 서버 LLM 이 몇 초 걸리므로 판단을 기다리게 하지 않는다)
  if (hindsight) await hindsight.retain(BANK, text, { context: "관제실 판단 기록", async: true });
  else writeFileSync(FILE, JSON.stringify([...readFile(), { time: new Date().toISOString(), text }], null, 2));
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

/** 기억을 바탕으로 한 문단 답하기 (시연용). file 모드는 LLM 이 없으니 기억 목록을 그대로 돌려준다 */
export async function reflect(query: string): Promise<string> {
  if (hindsight) return (await hindsight.reflect(BANK, query)).text;
  const found = await recall(query, 5);
  return found.length ? `기억 ${found.length}건:\n${found.join("\n")}` : "관련 기억 없음";
}
