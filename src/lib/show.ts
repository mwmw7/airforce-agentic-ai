/**
 * src/lib/show.ts — 각 단계(노드)에 들어간 값과 나온 값을 콘솔에 보기 좋게 찍기
 *
 * LangGraph 는 streamMode: "debug" 로 돌리면 노드마다 두 이벤트를 준다.
 *   task        : 노드 시작 — 이름, 노드가 받는 칠판(state) 전체, 누가 깨웠는지(triggers)
 *   task_result : 노드 끝   — 노드가 돌려준 칸만, interrupt() 로 멈췄으면 그 내용
 * 노드 함수 안에 console.log 를 심지 않고도 이 이벤트만 받으면 입출력을 전부 볼 수 있다.
 * (Langfuse 같은 관측 도구가 화면에 그려 주는 것도 결국 이 이벤트다)
 *
 * 켜는 법:  --watch       값을 요약해서 (배열 3개 · 글자 80자까지)
 *           --watch=full  값을 전부
 */
import { inspect } from "node:util";
import { send } from "./live.js";

const flag = process.argv.find((a) => a.startsWith("--watch"));
export const WATCH: "off" | "summary" | "full" = !flag ? "off" : flag.endsWith("full") ? "full" : "summary";

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => paint(1, s);
const dim = (s: string) => paint(2, s);
const cyan = (s: string) => paint(36, s);
const yellow = (s: string) => paint(33, s);
const magenta = (s: string) => paint(35, s);
const red = (s: string) => paint(31, s);
const green = (s: string) => paint(32, s);

/** 값의 '형태' 를 한 줄로. 예) { alert: {scenario,title,…}, clues: {from,ok,lines}[3], blocked: string[0] } */
export function shape(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return "없음";
  if (Array.isArray(v)) return v.length ? `${shape(v[0], depth + 1)}[${v.length}]` : "[]";
  if (typeof v !== "object") return typeof v;
  const keys = Object.keys(v as object);
  if (depth >= 1) return `{${keys.slice(0, 4).join(",")}${keys.length > 4 ? ",…" : ""}}`;
  return `{ ${keys.map((k) => `${k}: ${shape((v as Record<string, unknown>)[k], depth + 1)}`).join(", ")} }`;
}

/** 값 자체를 색 입혀서. summary 면 길면 자르고, full 이면 전부 */
function pretty(v: unknown): string {
  const full = WATCH === "full";
  return inspect(v, {
    colors: color,
    depth: full ? null : 3,
    maxArrayLength: full ? null : 3,
    maxStringLength: full ? null : 80,
    breakLength: 110,
    compact: 3,
  }).replace(/\n/g, "\n    ");
}

const startedAt = new Map<string, number>(); // task id → 시작 시각 (걸린 시간 계산용)

/** debug 이벤트 하나를 받아 그린다. --watch 가 없으면 아무것도 하지 않는다. */
export function showDebug(ev: { type: string; payload: Record<string, unknown> }) {
  const p = ev.payload;
  if (ev.type === "task") {
    startedAt.set(String(p.id), Date.now());
    send("node_start", { name: p.name, from: (p.triggers as string[])?.join(", "), input: p.input });
  }
  if (ev.type === "task_result") {
    const out = Object.fromEntries((p.result as [string, unknown][]) ?? []);
    const stopped = ((p.interrupts as unknown[]) ?? []).length > 0;
    send("node_end", { name: p.name, ms: Date.now() - (startedAt.get(String(p.id)) ?? Date.now()), output: out, interrupt: stopped });
  }
  if (WATCH === "off") return;

  if (ev.type === "task") {
    const input = p.input as Record<string, unknown>;
    const from = (p.triggers as string[])?.join(", ");
    console.log(`\n${bold(cyan("▶ " + String(p.name)))}  ${dim("← " + from)}`);
    console.log(`  ${dim("입력 형태")} ${shape(input)}`);
    for (const [k, v] of Object.entries(input)) console.log(`  ${yellow(k)} ${pretty(v)}`);
  }

  if (ev.type === "task_result") {
    const ms = Date.now() - (startedAt.get(String(p.id)) ?? Date.now());
    const result = (p.result as [string, unknown][]) ?? [];
    const interrupts = (p.interrupts as { value: unknown }[]) ?? [];
    console.log(`${bold(cyan("◀ " + String(p.name)))}  ${dim(ms + "ms")}`);
    console.log(`  ${dim("출력 형태")} ${shape(Object.fromEntries(result))}`);
    for (const [k, v] of result) console.log(`  ${yellow(k)} ${pretty(v)}`);
    for (const i of interrupts) console.log(`  ${yellow("여기서 멈춤 — 사람에게 보낼 질문")} ${pretty(i.value)}`);
  }
}

/** LLM 호출 하나: 모델에게 보낸 것(메시지·도구 목록)과 받은 것(답·도구 요청·토큰). 노드 안에서 일어나므로 한 칸 들여 쓴다 */
export function showLLM(label: string, sent: unknown, received: unknown, ms: number) {
  send("llm", { label, sent, received, ms });
  if (WATCH === "off") return;
  console.log(`\n  ${bold(magenta("⇢ LLM " + label))}  ${dim("모델에게 보냄")}`);
  console.log(`    ${pretty(sent).replace(/\n    /g, "\n      ")}`);
  console.log(`  ${bold(magenta("⇠ LLM " + label))}  ${dim("모델이 답함 · " + ms + "ms")}`);
  console.log(`    ${pretty(received).replace(/\n    /g, "\n      ")}`);
}

/** LLM 호출이 실패했을 때 (시간 초과 등). --watch 가 없어도 한 줄은 보여 준다 */
export function showError(label: string, message: string, ms: number) {
  send("llm_error", { label, message, ms });
  console.log(`  ${bold(red("⇠ LLM " + label))}  ${red("실패 · " + ms + "ms")}`);
  console.log(`    ${red(message)}`);
}

/** 도구 하나의 실행 결과를 보기 좋게. JSON 이면 줄마다 "키: 값" 으로, 아니면 글자 그대로. --watch 가 없어도 보여 준다 */
export function showTool(name: string, args: Record<string, unknown>, resultText: string) {
  send("tool", { name, args, result: resultText });
  const argText = Object.keys(args).length ? Object.entries(args).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
  console.log(`  ${bold(green("[도구] " + name))}${dim("(" + argText + ")")}`);
  let data: unknown;
  try { data = JSON.parse(resultText); } catch { console.log(`    ${resultText}`); return; }
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows as Record<string, unknown>[]) {
    const cells = Object.entries(row).filter(([k]) => k !== "_notice").map(([k, v]) => `${cyan(k)} ${String(v)}`);
    console.log(`    ${dim("·")} ${cells.join(dim("  |  "))}`);
  }
}
