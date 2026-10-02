/**
 * tools/memory-up.ts — Hindsight 를 내 노트북에서 띄우기 (Docker 없음)
 *   pnpm memory:up   → http://localhost:8888 에 Hindsight 데몬이 뜬다. 켜 둔 채로 두고 .env 에 MEMORY_MODE=hindsight
 *   준비물: uv (https://docs.astral.sh/uv/ 한 줄 설치). 첫 실행 때 약 200MB 를 받는다 (내장 Postgres 포함)
 *
 * Hindsight 는 기억을 정리할 때 자기도 LLM 을 쓴다. 따로 키를 받지 않고 .env 의 LLM 설정(LLM_BASE_URL · LLM_API_KEY · LLM_MODEL)을 그대로 넘긴다.
 *   LLM_MODE=ollama 면 ollama 공급자로, 그 외(relay · cloud)는 OpenAI 호환 공급자로 연결한다.
 */
import "dotenv/config";
import { consoleLogger, HindsightServer } from "@vectorize-io/hindsight-all";

const port = Number(process.env.HINDSIGHT_PORT ?? 8888);
const isOllama = process.env.LLM_MODE === "ollama";

const server = new HindsightServer({
  profile: "airforce-agent",
  port,
  env: {
    HINDSIGHT_API_LLM_PROVIDER: isOllama ? "ollama" : "openai",
    HINDSIGHT_API_LLM_BASE_URL: process.env.LLM_BASE_URL,
    HINDSIGHT_API_LLM_API_KEY: process.env.LLM_API_KEY,
    HINDSIGHT_API_LLM_MODEL: process.env.HINDSIGHT_LLM_MODEL ?? process.env.LLM_MODEL,
  },
  readyTimeoutMs: 180_000, // 첫 실행은 다운로드 때문에 오래 걸린다
  logger: consoleLogger,
});

console.log(`[Hindsight] 데몬을 켜는 중… (처음이면 몇 분 걸립니다)`);
await server.start();
console.log(`[Hindsight] 준비됨 → ${server.getBaseUrl()}  (.env: MEMORY_MODE=hindsight, HINDSIGHT_BASE_URL=${server.getBaseUrl()})`);
console.log(`[Hindsight] Ctrl+C 로 끕니다`);

// Ctrl+C 를 받으면 데몬도 같이 끈다
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 60_000); // 아무것도 안 하지만 프로그램이 끝나지 않게 붙잡아 둔다 (끌 때까지)
