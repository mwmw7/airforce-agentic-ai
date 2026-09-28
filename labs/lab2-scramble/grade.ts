/**
 * labs/lab2-scramble/grade.ts — 채점: 시나리오 6개를 여러 번 돌려 정답표와 얼마나 맞는지 보기
 *
 *   pnpm scramble:grade                 6개 × 3회
 *   pnpm scramble:grade --times 1       빠르게 1회씩
 *   pnpm scramble:grade --tag before    결과를 reports/grade-before.json 에 저장 (고치기 전·후 비교용)
 *
 * 매 회차는 빈 기억에서 시작해 1 → 6 순서로 돈다. 시나리오 6 은 1 을 기억해야 맞힐 수 있다.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Command } from "@langchain/langgraph";
import { buildGraph } from "./graph.js";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const TIMES = Number(option("--times") ?? 3);
const TAG = option("--tag") ?? "latest";
const SCENARIOS = [1, 2, 3, 4, 5, 6];

const answers = JSON.parse(fs.readFileSync(path.resolve("data/alerts/answers.json"), "utf8"));
const graph = buildGraph();
const results: Record<number, string[]> = {};

for (let round = 1; round <= TIMES; round++) {
  process.env.HINDSIGHT_BANK = `grade-${Date.now()}`; // 회차마다 새 기억 공간
  for (const n of SCENARIOS) {
    const alert = JSON.parse(fs.readFileSync(path.resolve("data/alerts", `scenario-${n}.json`), "utf8"));
    const config = { configurable: { thread_id: `grade-${n}-${round}-${Date.now()}` } };
    await graph.invoke({ alert }, config);                                     // askHuman 에서 멈춤
    await graph.invoke(new Command({ resume: { approved: true, note: "채점 자동 승인" } }), config); // 자동 승인
    const choice = (await graph.getState(config)).values.decision?.choice ?? "-";
    (results[n] ??= []).push(choice);
    process.stdout.write(".");
  }
  fs.rmSync(path.resolve(".hindsight", `${process.env.HINDSIGHT_BANK}.json`), { force: true }); // 채점용 기억 정리
}

console.log(`\n\n시나리오 | 정답      | ${Array.from({ length: TIMES }, (_, i) => `${i + 1}회`.padEnd(9)).join("| ")}| 일치`);
let hit = 0;
for (const n of SCENARIOS) {
  const expected = answers[n].recommendation;
  const same = results[n].filter((c) => c === expected).length;
  hit += same;
  console.log(`${String(n).padEnd(8)} | ${expected.padEnd(9)} | ${results[n].map((c) => c.padEnd(9)).join("| ")}| ${same}/${TIMES}`);
}
const rate = Math.round((hit / (SCENARIOS.length * TIMES)) * 100);
console.log(`\n전체 일치율 ${rate}%`);

const file = path.resolve("reports", `grade-${TAG}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ tag: TAG, times: TIMES, rate, results }, null, 2));
console.log(`저장: ${path.relative(process.cwd(), file)}`);
