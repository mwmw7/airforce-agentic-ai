/**
 * labs/lab2-scramble/run.ts — 스크램블 판단 보조 Agent 실행기
 *
 *   pnpm scramble:run                   시나리오 1 (명백한 위협) 실행, 승인 프롬프트에서 y/n
 *   pnpm scramble:run --scenario 2      시나리오 2 (IFF 정상 민항기)
 *   pnpm scramble:run --scenario 3      시나리오 3 (정보 부족)
 *   pnpm scramble:run --yes             승인 자동 (테스트용)
 *
 * 흐름: invoke → approve 노드의 interrupt 에서 멈춤 → 사람에게 묻기 → Command({ resume }) 로 이어가기
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { Command } from "@langchain/langgraph";
import { buildGraph } from "./graph.js";
import type { ApprovalRequest } from "./nodes.js";
import type { Alert, Approval } from "./state.js";

const args = process.argv.slice(2);
const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const scenario = Number(get("--scenario") ?? 1);

const alert: Alert = JSON.parse(fs.readFileSync(path.resolve("data/alerts", `scenario-${scenario}.json`), "utf8"));
const graph = buildGraph();
const config = { configurable: { thread_id: `${alert.alert_id}-${Date.now()}` } }; // thread_id 하나 = 실행 하나

console.log(`🚨 알림 ${alert.alert_id} · ${alert.title}\n   ${alert.summary}\n`);

// 1) 처음 실행 → approve 노드의 interrupt 에서 멈춘다
await graph.invoke({ alert }, config);

// 2) 멈춘 이유(interrupt 값) 를 꺼내 담당자에게 보여준다
const state = await graph.getState(config);
const req = state.tasks.flatMap((t) => t.interrupts ?? [])[0]?.value as ApprovalRequest | undefined;

if (req) {
  const j = req.judgement;
  console.log("\n┌──────────── 담당자 승인 요청 ────────────");
  console.log(`│ 알림   : ${req.alert_id}`);
  console.log(`│ 권고   : ${j.recommendation.toUpperCase()}  (confidence ${j.confidence})`);
  console.log(`│ 확률   : ${Object.entries(j.probabilities).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  for (const e of req.evidence) for (const l of e.lines) console.log(`│ [${e.source}] ${l.slice(0, 90)}`);
  console.log("└──────────────────────────────────────────");

  let answer: Approval = { approved: true, note: "--yes 자동 승인" };
  if (!args.includes("--yes")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const input = (await rl.question(`권고(${j.recommendation}) 를 승인하시겠습니까? [y/N, 메모는 'y 메모내용']: `)).trim();
    rl.close();
    answer = { approved: /^y/i.test(input), note: input.replace(/^[yn]\S*\s*/i, "") || undefined };
  }

  // ===== TODO 2-7: Command({ resume }) 로 멈춘 그래프 이어가기 =====
  // graph.invoke(new Command({ resume: answer }), config) 를 호출하세요.
  // 같은 config(thread_id) 를 넘겨야 checkpointer 가 멈췄던 상태를 찾아 approve 노드부터 이어갑니다.
  // ----- SOLUTION -----
  await graph.invoke(new Command({ resume: answer }), config);
  // ----- END SOLUTION -----
}

const final = (await graph.getState(config)).values;
console.log(`\n■ 종료: 권고=${final.judgement?.recommendation} 승인=${final.approval?.approved ?? "-"} 보고서=${final.report_path ? path.relative(process.cwd(), final.report_path) : "없음"}`);
