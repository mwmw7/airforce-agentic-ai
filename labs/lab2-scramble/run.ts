/**
 * labs/lab2-scramble/run.ts — 스크램블 판단 보조 Agent 실행
 *
 *   pnpm scramble:run --scenario 1        시나리오 1 실행, 담당자 확인에서 y/n
 *   pnpm scramble:run --scenario 1 --yes  자동 승인 (반복 테스트용)
 *   pnpm scramble:run --resume <번호>      담당자 확인 중에 껐던 실행 이어가기
 *   pnpm scramble:run --scenario 1 --watch   단계마다 들어간 값·나온 값을 보여 주며 실행 (--watch=full 이면 전부)
 *
 * 흐름: 실행 → askHuman 에서 멈춤 → 담당자에게 묻기 → Command({ resume: 답 }) 로 이어가기
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { Command } from "@langchain/langgraph";
import { trace } from "../../src/lib/trace.js";
import { showDebug, WATCH } from "../../src/lib/show.js";
import { buildGraph } from "./graph.js";
import type { Question } from "./ask-human.js";
import type { Alert, HumanAnswer } from "./state.js";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const graph = buildGraph();
const resumeId = option("--resume");
const alert: Alert | undefined = resumeId ? undefined : JSON.parse(fs.readFileSync(path.resolve("data/alerts", `scenario-${option("--scenario") ?? 1}.json`), "utf8"));
const threadId = resumeId ?? `${alert!.alert_id}-${Date.now()}`; // 실행 번호 하나 = 실행 하나
const config = { configurable: { thread_id: threadId } };

/** 그래프를 돌리면서 끝난 단계를 한 줄씩 보여 주고 trace 에도 남긴다 */
async function runAndShow(input: unknown) {
  let last = Date.now();
  // updates: 단계가 끝날 때 바뀐 칸 / debug: 단계마다 들어간 값·나온 값 (--watch 일 때만 화면에 찍는다)
  for await (const [mode, chunk] of await graph.stream(input as never, { ...config, streamMode: ["updates", "debug"] })) {
    if (mode === "debug") { showDebug(chunk as never); continue; }
    for (const [step, value] of Object.entries(chunk)) {
      if (step === "__interrupt__") continue;
      const ms = Date.now() - last;
      last = Date.now();
      trace.event(`step.${step}`, { thread_id: threadId, ms, value: value as Record<string, unknown> });
      if (WATCH === "off") console.log(`  [완료] ${step.padEnd(12)} ${String(ms).padStart(5)}ms`); // --watch 면 ◀ 줄이 대신한다
    }
  }
}

// 1) 처음 실행 → askHuman 에서 멈춘다 (--resume 이면 건너뛰고 저장된 곳에서 시작)
if (alert) {
  console.log(`[알림] ${alert.alert_id} · ${alert.title}\n       ${alert.summary}\n`);
  console.log(`  실행 번호: ${threadId}  (담당자 확인 중에 끄면: pnpm scramble:run --resume ${threadId})\n`);
  await runAndShow({ alert });
}

// 2) 멈춘 이유(담당자에게 보낼 질문)를 꺼내 보여 준다
const saved = await graph.getState(config);
const question = saved.tasks.flatMap((t) => t.interrupts ?? [])[0]?.value as Question | undefined;

if (question) {
  const d = question.decision;
  console.log("\n+----------- 담당자 확인 요청 -----------");
  console.log(`| 알림     : ${question.alert_id}`);
  console.log(`| 권고     : ${d.choice.toUpperCase()}  (확신도 ${d.confidence})`);
  console.log(`| 확률     : ${Object.entries(d.probabilities).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  for (const m of d.past) console.log(`| [기억] ${m.slice(0, 90)}`);
  for (const c of question.clues) for (const l of c.lines) console.log(`| [${c.from}] ${l.slice(0, 90)}`);
  for (const b of question.blocked) console.log(`| [차단] ${b.slice(0, 90)}`);
  console.log("+----------------------------------------");

  let answer: HumanAnswer = { approved: true, note: "--yes 자동 승인" };
  if (!args.includes("--yes")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const input = (await rl.question(`권고(${d.choice}) 를 승인하시겠습니까? [y/N, 메모는 'y 메모내용']: `)).trim();
    rl.close();
    answer = { approved: /^y/i.test(input), note: input.replace(/^[yn]\S*\s*/i, "") || undefined };
  }

  // ===== TODO 2-8: Command({ resume }) 로 멈춘 그래프 이어가기 =====
  // runAndShow(new Command({ resume: answer })) 를 await 로 호출하세요.
  // 같은 config(thread_id) 로 돌기 때문에, 저장된 진행 상황을 찾아 askHuman 부터 이어갑니다.
  // ----- SOLUTION -----
  await runAndShow(new Command({ resume: answer }));
  // ----- END SOLUTION -----
}

const final = (await graph.getState(config)).values;
console.log(`\n[종료] 권고=${final.decision?.choice ?? "-"} 담당자=${final.human ? (final.human.approved ? "승인" : "반려") : "-"} 보고서=${final.reportFile ? path.relative(process.cwd(), final.reportFile) : "없음"}`);
