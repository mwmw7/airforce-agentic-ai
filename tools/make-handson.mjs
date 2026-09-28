#!/usr/bin/env node
/**
 * tools/make-handson.mjs — solution 코드에서 hands-on(빈칸) 코드를 자동 생성
 *
 * 마커 규칙 (TS 파일 안)
 *   // ===== TODO 2-1: 제목 =====        ← 이 줄부터 설명 주석은 두 브랜치 모두 유지
 *   // 설명…
 *   // ----- SOLUTION -----              ← 여기부터
 *   //! 대체 코드 (hands-on 에만 남길 자리표시자, 없으면 throw 로 대체)
 *   정답 코드
 *   // ----- END SOLUTION -----          ← 여기까지가 정답 (hands-on 에서 제거)
 *
 * 사용
 *   node tools/make-handson.mjs            현재 트리를 제자리에서 hands-on 으로 변환 (git 브랜치에서 실행)
 *   node tools/make-handson.mjs --check    변환 대상 TODO 목록만 출력
 *
 * 강사용 워크플로
 *   git checkout solution && (코드 수정) && git commit
 *   git checkout main && git checkout solution -- . && node tools/make-handson.mjs && git commit
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CHECK = process.argv.includes("--check");
const DIRS = ["src", "labs", "mcp-servers"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const RE_TODO = /^\s*\/\/ ===== (TODO [^:]+): (.*) =====\s*$/;
const RE_START = /^\s*\/\/ ----- SOLUTION -----\s*$/;
const RE_END = /^\s*\/\/ ----- END SOLUTION -----\s*$/;

let total = 0;
for (const file of DIRS.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []))) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let i = 0, changed = false, currentTodo = "TODO";
  while (i < lines.length) {
    const line = lines[i];
    const todo = line.match(RE_TODO);
    if (todo) currentTodo = todo[1];
    if (RE_START.test(line)) {
      const indent = line.match(/^\s*/)[0];
      const placeholder = [];
      let j = i + 1;
      while (j < lines.length && !RE_END.test(lines[j])) {
        const m = lines[j].match(/^\s*\/\/! ?(.*)$/);
        if (m) placeholder.push(indent + m[1]);
        j++;
      }
      if (j >= lines.length) throw new Error(`${file}: END SOLUTION 마커 없음 (${currentTodo})`);
      total++;
      changed = true;
      if (CHECK) console.log(`${path.relative(ROOT, file)}: ${currentTodo}${placeholder.length ? " (자리표시자)" : ""}`);
      out.push(`${indent}// ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일`);
      if (placeholder.length) out.push(...placeholder);
      else out.push(`${indent}throw new Error("${currentTodo} 미구현");`);
      i = j + 1;
      continue;
    }
    out.push(line);
    i++;
  }
  if (changed && !CHECK) fs.writeFileSync(file, out.join("\n"));
}
console.log(CHECK ? `\n총 ${total}개 빈칸` : `hands-on 변환 완료: 빈칸 ${total}개`);
