#!/usr/bin/env node
/**
 * tools/step.mjs — 따라잡기. pnpm step 4 = "4단계까지 채워진 상태" 로 바로 넘어간다
 *   main 브랜치(완성본)의 빈칸 파일을 읽어, TODO 1 ~ 4 는 정답을 남기고 5 부터는 다시 비워서 내 파일에 덮어쓴다
 *   빈칸이 든 파일만 바꾼다. 그 파일에 내가 고친 내용은 사라지므로 먼저 묻는다 (--yes 면 묻지 않음)
 *
 * 사용:  pnpm step 4          4단계까지 채우기
 *        pnpm step 0          처음 상태(전부 빈칸)로 되돌리기
 *        pnpm step 8 --yes    묻지 않고 전부 채우기
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline/promises";
import { makeBlanks } from "./blanks.mjs";

const LAST = 8;
const step = Number(process.argv.slice(2).find((a) => !a.startsWith("--")));
if (!Number.isInteger(step) || step < 0 || step > LAST) {
  console.error(`단계 번호(0~${LAST})가 필요합니다. 예: pnpm step 4`);
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();
if (branch === "main") {
  console.error("지금 main(완성본) 브랜치입니다. pnpm step 은 hands-on 브랜치에서 씁니다: git checkout hands-on");
  process.exit(1);
}

// 정답은 main 에서 가져온다. 강사가 고친 최신 정답이 있으면 먼저 받아 온다 (인터넷이 없으면 갖고 있는 것으로)
try { git("fetch", "origin", "main", "--quiet"); } catch { /* 오프라인이면 그냥 진행 */ }
const source = (() => { try { git("rev-parse", "--verify", "origin/main"); return "origin/main"; } catch { return "main"; } })();

// main 에서 빈칸 마커가 든 파일만 고른다
const files = git("ls-tree", "-r", "--name-only", source, "--", "labs", "mcp-servers", "src")
  .split("\n").filter((f) => /\.(ts|mjs)$/.test(f))
  .map((f) => ({ path: f, answer: git("show", `${source}:${f}`) }))
  .filter((f) => f.answer.includes("// ----- SOLUTION -----"));

console.log(`${step}단계까지 채웁니다 (정답 출처: ${source}). 아래 파일을 덮어씁니다 — 이 파일들에 직접 고친 내용은 사라집니다:`);
files.forEach((f) => console.log(`  ${f.path}`));
if (!process.argv.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ok = (await rl.question("계속할까요? (y/N) ")).trim().toLowerCase();
  rl.close();
  if (ok !== "y") { console.log("그만둡니다."); process.exit(0); }
}

const kept = new Set(), blanks = new Set();
for (const f of files) {
  const r = makeBlanks(f.answer, step, f.path);
  fs.writeFileSync(f.path, r.text);
  r.kept.forEach((t) => kept.add(t));
  r.blanks.forEach((t) => blanks.add(t));
}
const sort = (s) => [...s].sort((a, b) => parseFloat(a.slice(5).replace("-", ".")) - parseFloat(b.slice(5).replace("-", ".")));
console.log(`채움: ${sort(kept).join(", ") || "없음"}`);
console.log(`남은 빈칸: ${sort(blanks).join(", ") || "없음"}`);
console.log("이제 pnpm agent 로 돌려 보세요.");
