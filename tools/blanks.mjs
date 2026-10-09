/**
 * tools/blanks.mjs — 완성본 코드에서 빈칸을 만드는 변환 하나. make-handson.mjs 와 step.mjs 가 같이 쓴다
 *   keep = 0  → 모든 빈칸을 비운다 (hands-on)
 *   keep = 4  → TODO 1 ~ 4 (4-1 · 4-2 포함) 는 정답을 남기고, 5 부터 비운다 (pnpm step 4)
 * 마커 규칙은 make-handson.mjs 상단 설명 참고
 */
const RE_TODO = /^\s*\/\/ ===== (TODO [^:]+): (.*) =====\s*$/;
const RE_START = /^\s*\/\/ ----- SOLUTION -----\s*$/;
const RE_END = /^\s*\/\/ ----- END SOLUTION -----\s*$/;
const RE_PLACEHOLDER = /^\s*\/\/! ?(.*)$/;

/** text(파일 내용)를 바꿔 { text, blanks: [비운 TODO 이름들], kept: [남긴 TODO 이름들] } 를 돌려준다 */
export function makeBlanks(text, keep = 0, where = "") {
  const lines = text.split("\n");
  const out = [], blanks = [], kept = [];
  let currentTodo = "TODO";
  for (let i = 0; i < lines.length; i++) {
    const todo = lines[i].match(RE_TODO);
    if (todo) currentTodo = todo[1];
    if (!RE_START.test(lines[i])) { out.push(lines[i]); continue; }

    const indent = lines[i].match(/^\s*/)[0];
    const placeholder = [], solution = [];
    let j = i + 1;
    for (; j < lines.length && !RE_END.test(lines[j]); j++) {
      const m = lines[j].match(RE_PLACEHOLDER);
      if (m) placeholder.push(indent + m[1]);
      else solution.push(lines[j]);
    }
    if (j >= lines.length) throw new Error(`${where}: END SOLUTION 마커 없음 (${currentTodo})`);

    const number = parseInt(currentTodo.replace("TODO ", ""), 10); // "TODO 4-2" → 4
    if (number <= keep) {
      kept.push(currentTodo);
      out.push(...solution);                                      // 정답만 남긴다
    } else {
      blanks.push(currentTodo);
      out.push(`${indent}// [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일 (따라잡기: pnpm step ${number})`);
      out.push(...(placeholder.length ? placeholder : [`${indent}throw new Error("${currentTodo} 미구현");`]));
    }
    i = j; // END SOLUTION 줄까지 건너뛴다
  }
  return { text: out.join("\n"), blanks, kept };
}
