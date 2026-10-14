#!/usr/bin/env node
/**
 * tools/draw-steps.mjs — 단계별 그래프 그림 뽑기 (수업에서 단계끼리 비교용)
 *   완성본 코드를 pnpm step N 과 같은 변환(blanks.mjs)으로 임시 폴더에 만들고, 거기서 draw-graph.ts 를 돌린다
 *   내 파일은 건드리지 않는다
 *   그래프 모양이 바뀌는 건 TODO 1(Subagent 를 서브그래프로) · TODO 5(동시 실행 · 합류) 두 번뿐 → 단계 2 · 6 에서 그림이 바뀐다
 *   출력: docs/graphs/step-1.md ~ step-8.md, step-done.md
 *
 * 사용:  pnpm see:steps      (main 브랜치에서. 정답이 있어야 단계를 만들 수 있다)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeBlanks } from "./blanks.mjs";

const LAST = 8;
const ROOT = process.cwd();
const COPY = ["labs", "src", "mcp-servers", "tools", "data", "package.json", "tsconfig.json", "langgraph.json"];
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
};
const marked = ["labs", "src", "mcp-servers"].filter((d) => fs.existsSync(d)).flatMap((d) => walk(d))
  .filter((f) => fs.readFileSync(f, "utf8").includes("// ----- SOLUTION -----"));
if (!marked.length) {
  console.error("정답(SOLUTION 마커)이 든 파일이 없습니다. main 브랜치에서 실행하세요.");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "draw-steps-"));
fs.mkdirSync("docs/graphs", { recursive: true });
try {
  for (let step = 1; step <= LAST + 1; step++) {
    const name = step > LAST ? "done" : String(step);
    const dir = path.join(tmp, name);
    for (const p of COPY) if (fs.existsSync(p)) fs.cpSync(p, path.join(dir, p), { recursive: true });
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    for (const f of marked) fs.writeFileSync(path.join(dir, f), makeBlanks(fs.readFileSync(f, "utf8"), step - 1, f).text);

    execFileSync(tsx, ["tools/draw-graph.ts"], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
    const drawing = fs.readFileSync(path.join(dir, "docs/graphs/agent.md"), "utf8");
    const mermaid = drawing.slice(drawing.indexOf("```mermaid"));
    const title = step > LAST ? "전부 정답 (pnpm step done)" : step === 1 ? "처음 상태 — 전부 빈칸 (pnpm step 1)" : `${step}번을 풀 차례 — ${step === 2 ? "1" : `1 ~ ${step - 1}`} 정답 (pnpm step ${step})`;
    fs.writeFileSync(`docs/graphs/step-${name}.md`, `# 단계 ${name}: ${title}\n\n${mermaid}`);
    console.log(`[그림] docs/graphs/step-${name}.md`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
