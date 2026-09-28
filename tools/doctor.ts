/**
 * tools/doctor.ts — [실습 0-1] 환경 점검
 *   npm run doctor
 * Node 버전, .env, 모드별 연결(LLM / Jev / Hindsight) 을 확인하고 어떤 실습이 바로 가능한지 알려줍니다.
 */
import "dotenv/config";
import fs from "node:fs";

const ok = (m: string) => console.log(`  ✅ ${m}`);
const warn = (m: string) => console.log(`  ⚠️  ${m}`);
const bad = (m: string) => console.log(`  ❌ ${m}`);

console.log("\n공군 Agentic AI 교육 · 환경 점검\n");

// Node
const major = Number(process.versions.node.split(".")[0]);
major >= 22 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} — 22 이상 필요 (https://nodejs.org)`);

// .env
fs.existsSync(".env") ? ok(".env 있음") : warn(".env 없음 — `cp .env.example .env` 하세요 (없어도 mock/local 모드로 실행됩니다)");

// LLM
const llmMode = process.env.LLM_MODE ?? "mock";
if (llmMode === "mock") warn("LLM_MODE=mock — 규칙 기반 응답. 실제 모델을 쓰려면 .env 에서 relay/ollama/cloud 로 바꾸세요");
else {
  try {
    const r = await fetch(`${process.env.LLM_BASE_URL}/models`, { headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` } });
    r.ok ? ok(`LLM ${llmMode} 연결 OK (${process.env.LLM_BASE_URL}, model=${process.env.LLM_MODEL})`) : bad(`LLM 응답 ${r.status} — BASE_URL/API_KEY 확인`);
  } catch (e) { bad(`LLM 연결 실패: ${String(e).slice(0, 80)}`); }
}

// Jev
const jevMode = process.env.JEV_MODE ?? "local";
if (jevMode === "local") warn("JEV_MODE=local — 규칙 기반 로컬 판정기. 실제 Jev 는 강사 측 OPENROUTER_API_KEY 필요");
else process.env.OPENROUTER_API_KEY ? ok("JEV_MODE=openrouter, 키 있음") : bad("JEV_MODE=openrouter 인데 OPENROUTER_API_KEY 없음");

// Hindsight
const memMode = process.env.MEMORY_MODE ?? "file";
if (memMode === "file") warn("MEMORY_MODE=file — .hindsight/*.json 저장. Hindsight 서버는 docker 로 실행 후 hindsight 로 변경");
else {
  try {
    const r = await fetch(process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888");
    ok(`Hindsight 응답 ${r.status} (${process.env.HINDSIGHT_BASE_URL})`);
  } catch { bad("Hindsight 서버에 연결할 수 없음 — docker 실행 여부 확인 또는 MEMORY_MODE=file"); }
}

// 데이터
["data/api/tracks.json", "data/alerts/scenario-1.json", "data/doctrine/v2-2026-rules.md"].forEach((f) => fs.existsSync(f) ? ok(f) : bad(`${f} 없음`));

console.log(`
다음 단계
  npm run lab0            # [실습 0] 순수 루프
  npm run mcp:radar:inspect  # [실습 2-2] MCP 서버를 Inspector 로 열어보기
  npm run lab2 -- --scenario 1   # [실습 2] 스크램블 판단 보조 Agent
`);
