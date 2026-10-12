/**
 * tools/doctor.ts — [실습 0-1] 환경 점검
 *   pnpm setup:check
 * .env 가 없으면 .env.example 을 복사해 만들어 주고, Node 버전·모드별 연결(LLM / Jev / LangSmith) 을 확인합니다.
 */
import fs from "node:fs";
import { config as loadEnv } from "dotenv";

const ok = (m: string) => console.log(`  [OK]   ${m}`);
const warn = (m: string) => console.log(`  [참고] ${m}`);
const bad = (m: string) => console.log(`  [문제] ${m}`);

console.log("\n공군 Agentic AI 교육 · 환경 점검\n");

// Node
const major = Number(process.versions.node.split(".")[0]);
major >= 22 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} — 22 이상 필요 (https://nodejs.org)`);

// .env — 없으면 견본(.env.example)을 복사해 만든다. 당일 토큰은 이 파일에 적는다
if (fs.existsSync(".env")) ok(".env 있음");
else { fs.copyFileSync(".env.example", ".env"); ok(".env 없어서 .env.example 을 복사해 만들었음 (키 없이 mock/local 모드)"); }
loadEnv(); // 복사한 뒤에 읽어야 아래 점검이 .env 값을 본다

// LLM
const llmMode = process.env.LLM_MODE ?? "mock";
if (llmMode === "mock") warn("LLM_MODE=mock — 정해진 답으로 흐름만 확인. 실제 모델은 .env 에서 relay(강사 Bedrock)/ollama/cloud 로");
else {
  try {
    const r = await fetch(`${process.env.LLM_BASE_URL}/models`, { headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` } });
    r.ok ? ok(`LLM ${llmMode} 연결 OK (${process.env.LLM_BASE_URL}, model=${process.env.LLM_MODEL})`) : bad(`LLM 응답 ${r.status} — BASE_URL/API_KEY 확인`);
  } catch (e) { bad(`LLM 연결 실패: ${String(e).slice(0, 80)}`); }
}

// Jev
const jevMode = process.env.JEV_MODE ?? "local";
if (jevMode === "local") warn("JEV_MODE=local — 규칙 기반 로컬 판정기. 실제 Jev 는 강사 측 TYPESAFE_API_KEY 필요");
else if (jevMode === "typesafe") process.env.TYPESAFE_API_KEY ? ok("JEV_MODE=typesafe, 키 있음") : bad("JEV_MODE=typesafe 인데 TYPESAFE_API_KEY 없음");
else process.env.OPENROUTER_API_KEY ? ok("JEV_MODE=openrouter, 키 있음") : bad("JEV_MODE=openrouter 인데 OPENROUTER_API_KEY 없음");

// 장기 기억 (Hindsight)
const memMode = process.env.MEMORY_MODE ?? "file";
if (memMode === "file") warn("MEMORY_MODE=file — .hindsight/*.json 에 저장. 실제 Hindsight 는 pnpm memory:up 후 MEMORY_MODE=hindsight");
else {
  try {
    const r = await fetch(`${process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888"}/health`);
    r.ok ? ok(`Hindsight 연결 OK (${process.env.HINDSIGHT_BASE_URL})`) : bad(`Hindsight 응답 ${r.status}`);
  } catch { bad("Hindsight 서버에 연결할 수 없음 — pnpm memory:up 또는 MEMORY_MODE=file"); }
}

// 날씨 MCP 서버
try {
  const r = await fetch(process.env.MCP_WEATHER_URL ?? "http://localhost:3333/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(`날씨 MCP 서버 응답 ${r.status} (${process.env.MCP_WEATHER_URL ?? "http://localhost:3333/mcp"})`);
} catch { warn("날씨 MCP 서버 꺼짐 — 다른 터미널에서 pnpm mcp:weather (없어도 agent 는 날씨 없이 돈다)"); }

// LangSmith 트레이싱 (선택)
if (process.env.LANGSMITH_TRACING === "true") {
  process.env.LANGSMITH_API_KEY
    ? ok(`LANGSMITH_TRACING=true — 실행 기록이 smith.langchain.com 프로젝트 '${process.env.LANGSMITH_PROJECT ?? "default"}' 로 올라감`)
    : bad("LANGSMITH_TRACING=true 인데 LANGSMITH_API_KEY 없음 — 키를 넣거나 LANGSMITH_TRACING=false 로");
} else warn("LANGSMITH_TRACING 꺼짐 — traces/*.jsonl 에만 기록. 켜려면 .env 에 LANGSMITH_TRACING=true + LANGSMITH_API_KEY");

// 데이터
["data/api/radar-screen.json", "data/docs/rulebook.md"].forEach((f) => fs.existsSync(f) ? ok(f) : bad(`${f} 없음`));

console.log(`
다음 단계
  pnpm mcp:weather        # 날씨 MCP 서버 (다른 터미널에 켜 둔다)
  pnpm agent              # 보고 한 줄 → agent ⇄ tools → judge
  pnpm agent --watch      # 단계마다 들어간 값·나온 값 보기
  pnpm see:run            # 브라우저(localhost:3030)에서 실시간 보기
  pnpm see:studio         # LangGraph Studio (LangSmith 키 필요)
`);
