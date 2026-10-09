#!/usr/bin/env node
/**
 * tools/make-handson.mjs — main(완성본) 코드에서 hands-on(빈칸) 코드를 자동 생성
 *
 * 마커 규칙 (TS 파일 안)
 *   // ===== TODO 2-1: 제목 =====        ← 이 줄부터 설명 주석은 두 브랜치 모두 유지. 번호 = 단계 (TODO 4-2 는 4단계)
 *   // 설명…
 *   // ----- SOLUTION -----              ← 여기부터
 *   //! 대체 코드 (hands-on 에만 남길 자리표시자, 없으면 throw 로 대체)
 *   정답 코드
 *   // ----- END SOLUTION -----          ← 여기까지가 정답 (hands-on 에서 제거)
 *
 * 사용
 *   node tools/make-handson.mjs            현재 트리를 제자리에서 hands-on 으로 변환 (git 브랜치에서 실행)
 *   node tools/make-handson.mjs --check    변환 대상 TODO 목록만 출력
 *   (교육생 따라잡기는 tools/step.mjs — 같은 변환을 keep 번호까지만 정답으로)
 *
 * 강사용 워크플로
 *   git checkout main && (코드 수정) && git commit
 *   git checkout hands-on && git checkout main -- . && node tools/make-handson.mjs && git commit
 */
import fs from "node:fs";
import path from "node:path";
import { makeBlanks } from "./blanks.mjs";

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

let total = 0;
for (const file of DIRS.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []))) {
  const { text, blanks } = makeBlanks(fs.readFileSync(file, "utf8"), 0, file);
  if (!blanks.length) continue;
  total += blanks.length;
  if (CHECK) blanks.forEach((t) => console.log(`${path.relative(ROOT, file)}: ${t}`));
  else fs.writeFileSync(file, text);
}
console.log(CHECK ? `\n총 ${total}개 빈칸` : `hands-on 변환 완료: 빈칸 ${total}개`);
