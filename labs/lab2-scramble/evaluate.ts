/**
 * labs/lab2-scramble/evaluate.ts — [실습 2-6 · 2-9] 시나리오 5개 × N회 실행 → 정답표 대비 일치율
 *
 *   pnpm scramble:eval                 5 시나리오 × 3회
 *   pnpm scramble:eval --runs 1     빠르게 1회씩
 *   pnpm scramble:eval --tag before 결과 파일에 태그 (개선 전/후 비교용: reports/eval-before.json)
 *
 * Evaluation = "같은 사례에서 기대한 결과가 나오는지" 를 반복 확인하는 검사.
 * 정답표(data/alerts/answers.json) 는 권고 · 반드시 언급할 키워드 · 추가 조회 필요 여부 세 가지를 봅니다.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { runScenario } from "./run.js";

interface Answer { recommendation: string; must_mention: string[]; needs_more_info: boolean; rationale: string }

const args = process.argv.slice(2);
const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const RUNS = Number(get("--runs") ?? 3);
const TAG = get("--tag") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const SCENARIOS = (get("--scenarios") ?? "1,2,3,4,5").split(",").map(Number);

const answers = JSON.parse(fs.readFileSync(path.resolve("data/alerts/answers.json"), "utf8")) as Record<string, Answer>;

interface Row { scenario: number; run: number; recommendation?: string; rec_ok: boolean; mention_ok: boolean; more_info_ok: boolean; blocked?: string; confidence?: number }

const rows: Row[] = [];
for (const s of SCENARIOS) {
  const key = answers[String(s)];
  for (let r = 1; r <= RUNS; r++) {
    process.env.RUN_ID = `eval-${TAG}-s${s}-r${r}`;
    const { result } = await runScenario({ scenario: s, yes: true });
    const d = result.decision;

    // ===== TODO 2-6: 채점 규칙 =====
    // 아래 세 항목을 계산하세요.
    //   rec_ok       : d.recommendation === key.recommendation
    //   mention_ok   : key.must_mention 의 모든 키워드가 (synthesis.facts + summary + findings.content) 안에 등장
    //   more_info_ok : d.needs_more_info === key.needs_more_info
    // ✏️  여기에 코드를 작성하세요 — 정답은 main 브랜치의 같은 파일
    const rec_ok = false, mention_ok = false, more_info_ok = false;

    rows.push({ scenario: s, run: r, recommendation: d?.recommendation, rec_ok, mention_ok, more_info_ok, blocked: result.blocked_reason, confidence: d?.confidence });
  }
}

// ── 표 출력 ──
console.log(`\n=== 평가 결과 (${TAG}) · LLM_MODE=${process.env.LLM_MODE} JEV_MODE=${process.env.JEV_MODE} ===`);
console.log("시나리오 | 회차 | 권고      | 정답      | 권고 | 근거 | 추가조회 | 사람회부 사유");
for (const r of rows) {
  const key = answers[String(r.scenario)];
  console.log(`   ${r.scenario}     |  ${r.run}   | ${pad(r.recommendation ?? "-", 9)} | ${pad(key.recommendation, 9)} |  ${mark(r.rec_ok)}  |  ${mark(r.mention_ok)}  |    ${mark(r.more_info_ok)}    | ${r.blocked ? r.blocked.split(" / ")[0].slice(0, 28) : "-"}`);
}
const rate = (f: (r: Row) => boolean) => `${Math.round((rows.filter(f).length / rows.length) * 100)}%`;
console.log(`\n권고 일치율 ${rate((r) => r.rec_ok)} · 근거 키워드 ${rate((r) => r.mention_ok)} · 추가조회 판단 ${rate((r) => r.more_info_ok)}  (${rows.length}회)`);

const out = path.resolve("reports", `eval-${TAG}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ tag: TAG, env: { LLM_MODE: process.env.LLM_MODE, JEV_MODE: process.env.JEV_MODE }, rows }, null, 2));
console.log(`저장: ${path.relative(process.cwd(), out)}  → 개선 후 다시 돌려 --tag 로 전후 비교하세요`);

function pad(s: string, n: number) { return s.padEnd(n); }
function mark(b: boolean) { return b ? "O" : "X"; }
