/**
 * tools/memory-reset.ts — 기억을 전부 지우고 처음부터 (강의 시작 전, 실험 뒤)
 *   pnpm memory:reset
 *   · MEMORY_MODE=hindsight : 서버의 bank(HINDSIGHT_BANK, 기본 control-room)를 지운다. 다음 실행 때 createBank 가 새로 만든다
 *   · MEMORY_MODE=file      : .hindsight/<bank>.json 을 지운다
 *   · MEMORY_MODE=off       : 지울 것이 없다
 *   · 둘 다 지우려면 pnpm memory:reset --all
 *   checkpoints.sqlite(멈춘 실행 저장)도 같이 지운다. 옛 실행번호로 --resume 할 일이 없게
 */
import "dotenv/config";
import { existsSync, rmSync } from "node:fs";

const MODE = process.env.MEMORY_MODE ?? "file";
const BANK = process.env.HINDSIGHT_BANK ?? "control-room";
const BASE_URL = process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888";
const ALL = process.argv.includes("--all");

async function resetHindsight() {
  const url = `${BASE_URL}/v1/default/banks/${BANK}`;
  try {
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) console.log(`[Hindsight] bank '${BANK}' 삭제 (${BASE_URL})`);
    else if (res.status === 404) console.log(`[Hindsight] bank '${BANK}' 는 이미 없음`);
    else console.log(`[Hindsight] 삭제 실패 ${res.status}: ${await res.text()}`);
  } catch {
    console.log(`[Hindsight] 서버에 연결할 수 없음 (${BASE_URL}) — pnpm memory:up 이 켜져 있나요?`);
  }
}

function resetFile() {
  const file = `.hindsight/${BANK}.json`;
  if (existsSync(file)) { rmSync(file); console.log(`[file] ${file} 삭제`); }
  else console.log(`[file] ${file} 는 이미 없음`);
}

if (ALL || MODE === "hindsight") await resetHindsight();
if (ALL || MODE === "file") resetFile();
for (const f of ["checkpoints.sqlite", "checkpoints.sqlite-shm", "checkpoints.sqlite-wal"]) if (existsSync(f)) rmSync(f);
console.log("[checkpoint] checkpoints.sqlite 삭제 — 다음 pnpm agent 부터 새로 시작");
