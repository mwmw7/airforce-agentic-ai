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
 *
 * 콘솔 한 줄은 모두 같은 모양이다:  [꼬리표] 내용  — 꼬리표 색만 보면 누가 한 일인지 안다
 *   REPORT 보고 · SETUP 설정 · LLM 모델 · TOOL 내 도구 · MCP MCP 도구 · MEMORY 기억(Hindsight/file)
 *   JEV 판정 모델 · RULE 코드 규칙 · HUMAN 사람 · DECIDE 결정 · STOP 중단 · NODE 단계 입출력(--watch)
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
const red = (s: string) => paint(31, s);
const green = (s: string) => paint(32, s);
const blue = (s: string) => paint(34, s);
const magenta = (s: string) => paint(35, s);
export { bold, dim, cyan, yellow, red, green, blue, magenta };

// 꼬리표: [글자, 색 코드(배경;글자)]. 밝은 배경 + 검은 글자, 어두운 배경 + 흰 글자
const TAGS = {
  report: ["REPORT", "107;30"], setup: ["SETUP", "100;97"], llm: ["LLM", "105;30"], tool: ["TOOL", "102;30"],
  mcp: ["MCP", "106;30"], memory: ["MEMORY", "104;30"], jev: ["JEV", "103;30"], human: ["HUMAN", "101;30"],
  rule: ["RULE", "47;30"], decide: ["DECIDE", "42;97;1"], stop: ["STOP", "41;97;1"], node: ["NODE", "100;97"], live: ["LIVE", "100;97"],
} as const;
export type Kind = keyof typeof TAGS;

/** 꼬리표 한 칸 (폭 고정). 색이 없는 환경이면 [LLM   ] 처럼 괄호로 */
export const tag = (kind: Kind) => {
  const [label, code] = TAGS[kind];
  return color ? `\x1b[${code}m ${label.padEnd(6)} \x1b[0m` : `[${label.padEnd(6)}]`;
};

/** 콘솔 한 줄 + (있으면) 이어지는 줄들. 이어지는 줄은 꼬리표 폭만큼 들여 쓰고 │ 로 묶는다 */
export function log(kind: Kind, text: string, more: string[] = []) {
  console.log(`${tag(kind)} ${text}`);
  for (const m of more) console.log(`         ${dim("│")} ${m}`);
}

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
  }).replace(/\n/g, `\n         ${dim("│")}   `);
}

const startedAt = new Map<string, number>(); // task id → 시작 시각 (걸린 시간 계산용)

/** 노드가 돌려준 칸. LangGraph 0.3 은 [["칸", 값]] 쌍 배열, 1.x 는 { 칸: 값 } 객체로 준다 — 둘 다 받는다 */
const asObject = (r: unknown): Record<string, unknown> => (Array.isArray(r) ? Object.fromEntries(r as [string, unknown][]) : ((r as Record<string, unknown>) ?? {}));

/** debug 이벤트 하나를 받아 그린다. --watch 가 없으면 아무것도 하지 않는다.
 *  inside: 부하(서브그래프) 안의 단계면 그 부하 이름 ("askRadar") — 터미널엔 "askRadar › agent" 로 찍고, 브라우저엔 노드 이름만 보낸다 */
export function showDebug(ev: { type: string; payload: Record<string, unknown> }, inside = "") {
  const p = ev.payload;
  const shown = inside ? `${inside} › ${String(p.name)}` : String(p.name);
  if (ev.type === "task") {
    startedAt.set(String(p.id), Date.now());
    send("node_start", { name: p.name, from: (p.triggers as string[])?.join(", "), input: p.input });
  }
  if (ev.type === "task_result") {
    const out = asObject(p.result);
    const stopped = ((p.interrupts as unknown[]) ?? []).length > 0;
    send("node_end", { name: p.name, ms: Date.now() - (startedAt.get(String(p.id)) ?? Date.now()), output: out, interrupt: stopped });
  }
  if (WATCH === "off") return;

  if (ev.type === "task") {
    const input = p.input as Record<string, unknown>;
    const from = (p.triggers as string[])?.join(", ");
    log("node", `${bold("▶ " + shown)} ${dim("시작 · ← " + from)}`,
      [`${dim("입력 형태")} ${shape(input)}`, ...Object.entries(input).map(([k, v]) => `${yellow(k)} ${pretty(v)}`)]);
  }

  if (ev.type === "task_result") {
    const ms = Date.now() - (startedAt.get(String(p.id)) ?? Date.now());
    const result = asObject(p.result);
    const interrupts = (p.interrupts as { value: unknown }[]) ?? [];
    log("node", `${bold("◀ " + shown)} ${dim("끝 · " + ms + "ms")}`, [
      `${dim("출력 형태")} ${shape(result)}`,
      ...Object.entries(result).map(([k, v]) => `${yellow(k)} ${pretty(v)}`),
      ...interrupts.map((i) => `${yellow("여기서 멈춤 — 사람에게 보낼 질문")} ${pretty(i.value)}`),
    ]);
  }
}

/** LLM 호출 하나: 모델에게 보낸 것(메시지·도구 목록)과 받은 것(답·도구 요청·토큰). 노드 안에서 일어나므로 한 칸 들여 쓴다 */
export function showLLM(label: string, sent: unknown, received: unknown, ms: number) {
  send("llm", { label, sent, received, ms });
  if (WATCH === "off") return;
  log("llm", `${dim("[watch]")} ${label} ${dim("모델에게 보냄")}`, [pretty(sent)]);
  log("llm", `${dim("[watch]")} ${label} ${dim("모델이 답함 · " + ms + "ms")}`, [pretty(received)]);
}

/** LLM 호출이 실패했을 때 (시간 초과 등). --watch 가 없어도 한 줄은 보여 준다 */
export function showError(label: string, message: string, ms: number) {
  send("llm_error", { label, message, ms });
  log("llm", `${red("실패")} ${label} ${dim(ms + "ms")}`, [red(message)]);
}

/** 도구 하나의 실행 결과를 보기 좋게. JSON 이면 "키 값 | 키 값" 으로, 아니면 글자 그대로. --watch 가 없어도 보여 준다
 *  via: 내 코드 안의 도구면 "tool", MCP 서버가 실행했으면 "mcp" (꼬리표 색이 달라진다) */
export function showTool(name: string, args: Record<string, unknown>, resultText: string, via: "tool" | "mcp" = "tool") {
  send("tool", { name, args, result: resultText });
  const argText = Object.entries(args).map(([k, v]) => `${k}: ${v}`).join(", ");
  let data: unknown;
  try { data = JSON.parse(resultText); } catch { log(via, `${bold(name)}${dim("(" + argText + ")")}`, [resultText]); return; }
  // 값이 객체 배열이면(예: look_radar 의 잡힌것) 한 줄에 하나씩 풀어서 보여 준다
  const flat = (v: unknown): string => (Array.isArray(v) && v.some((x) => typeof x === "object") ? "" : typeof v === "object" && v ? JSON.stringify(v) : String(v));
  const rows = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const lines = rows.flatMap((row) => {
    const head = Object.entries(row).filter(([k, v]) => k !== "_notice" && flat(v) !== "").map(([k, v]) => `${cyan(k)} ${flat(v)}`).join(dim("  |  "));
    const nested = Object.entries(row).filter(([, v]) => Array.isArray(v) && v.some((x) => typeof x === "object")) as [string, Record<string, unknown>[]][];
    return [head, ...nested.flatMap(([, list]) => list.map((item) => "  · " + Object.entries(item).map(([k, v]) => `${cyan(k)} ${String(v)}`).join(dim("  |  "))))].filter(Boolean);
  });
  log(via, `${bold(name)}${dim("(" + argText + ")")}`, lines);
}
