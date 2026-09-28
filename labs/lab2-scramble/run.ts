/**
 * labs/lab2-scramble/run.ts — 스크램블 판단 보조 Agent 실행기
 *
 *   npm run lab2 -- --scenario 1              시나리오 1 실행, 승인 프롬프트에서 y/n 입력
 *   npm run lab2 -- --scenario 1 --exit       승인 대기 지점에서 프로세스를 그냥 끝낸다 (중단 시연)
 *   npm run lab2:resume -- --thread <id>      SQLite 체크포인트에서 승인 대기 지점부터 재개
 *   npm run lab2 -- --scenario 1 --yes        승인 자동 (평가 스크립트용)
 *
 * thread_id 하나 = 실행 하나. 같은 thread_id 로 다시 invoke 하면 저장된 상태에서 이어갑니다.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { Command } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { buildGraph } from "./graph.js";
import type { Alert } from "./state.js";
import type { ApprovalRequest } from "./nodes/approve.js";
import { trace } from "../../src/lib/trace.js";

export function loadAlert(scenario: number): Alert {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data/alerts", `scenario-${scenario}.json`), "utf8"));
}

export function makeCheckpointer(): SqliteSaver {
  // ===== TODO 2-5c: SQLite Checkpointer =====
  // SqliteSaver.fromConnString("checkpoints.sqlite") 를 반환하세요.
  // 메모리 저장(MemorySaver) 과 달리 프로세스가 죽어도 상태가 남습니다.
  // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
  return SqliteSaver.fromConnString(":memory:"); // ← 메모리 DB: 프로세스가 죽으면 사라집니다. 파일로 바꾸세요
}

function printApproval(req: ApprovalRequest) {
  console.log("\n┌──────────── 담당자 승인 요청 ────────────");
  console.log(`│ 알림     : ${req.alert_id}`);
  console.log(`│ 권고     : ${req.recommendation.toUpperCase()}  (confidence ${req.confidence})`);
  console.log(`│ 확률     : ${Object.entries(req.probabilities).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`│ 요약     : ${req.summary}`);
  for (const f of req.facts) console.log(`│  ✓ ${f}`);
  for (const u of req.uncertainties) console.log(`│  ? ${u}`);
  if (req.blocked_reason) console.log(`│ ⚠ 가드레일: ${req.blocked_reason}`);
  console.log("└──────────────────────────────────────────");
}

export async function runScenario(opts: { scenario: number; thread?: string; resume?: boolean; yes?: boolean; exitAtInterrupt?: boolean }) {
  const threadId = opts.thread ?? `s${opts.scenario}-${Date.now().toString(36)}`;
  const config = { configurable: { thread_id: threadId }, recursionLimit: Number(process.env.MAX_STEPS ?? 8) * 4 };
  const graph = buildGraph({ checkpointer: makeCheckpointer() });

  console.log(`▶ thread_id = ${threadId}   (trace: ${path.relative(process.cwd(), trace.file)})`);

  // 1) 처음 실행 또는 재개
  let result = opts.resume
    ? await graph.invoke(null, config)                      // null 입력 = 저장된 상태에서 이어가기
    : await graph.invoke({ alert: loadAlert(opts.scenario) }, config);

  // 2) interrupt 로 멈췄는가?
  const state = await graph.getState(config);
  const pending = state.tasks.flatMap((t) => t.interrupts ?? []);
  if (pending.length) {
    const req = pending[0].value as ApprovalRequest;
    printApproval(req);

    if (opts.exitAtInterrupt) {
      console.log(`\n⏸  승인 대기 상태로 종료합니다. 재개:  npm run lab2:resume -- --thread ${threadId}`);
      return { threadId, result, interrupted: true };
    }

    let approved = opts.yes ?? false, note: string | undefined;
    if (!opts.yes) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ans = (await rl.question("승인하시겠습니까? [y/N, 메모는 'y 메모내용']: ")).trim();
      rl.close();
      approved = /^y/i.test(ans);
      note = ans.replace(/^[yn]\s*/i, "") || undefined;
    }

    // ===== TODO 2-5d: Command({ resume }) 로 재개 =====
    // graph.invoke(new Command({ resume: { approved, note } }), config) 를 호출해 approve 노드를 이어가세요.
    // 같은 config(thread_id) 를 넘겨야 저장된 상태를 찾습니다.
    // ✏️  여기에 코드를 작성하세요 — 정답은 solution 브랜치의 같은 파일
    throw new Error("TODO 2-5d 미구현");
  }

  console.log(`\n■ 종료: 권고=${result.decision?.recommendation} 승인=${result.approved ?? "-"} 보고서=${result.report_path ? path.relative(process.cwd(), result.report_path) : "없음"} steps=${result.step_count}`);
  return { threadId, result, interrupted: false };
}

// ── CLI ──
if (process.argv[1] && /run\.ts$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  runScenario({
    scenario: Number(get("--scenario") ?? 1),
    thread: get("--thread"),
    resume: args.includes("--resume"),
    yes: args.includes("--yes"),
    exitAtInterrupt: args.includes("--exit"),
  }).catch((e) => { console.error(e); process.exit(1); });
}
