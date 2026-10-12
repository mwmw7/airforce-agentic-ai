/**
 * tools/memory-up.ts — Hindsight 를 내 노트북에서 띄우기 (Docker 없음)
 *   pnpm memory:up   → http://localhost:8888 에 Hindsight 데몬이 뜬다. 켜 둔 채로 두고 .env 에 MEMORY_MODE=hindsight
 *   준비물: uv (https://docs.astral.sh/uv/ 한 줄 설치). 첫 실행 때 약 200MB 를 받는다 (내장 Postgres 포함)
 *
 * Hindsight 는 기억을 정리할 때 자기도 LLM 을 쓴다. 따로 키를 받지 않고 .env 의 LLM 설정(LLM_BASE_URL · LLM_API_KEY · LLM_MODEL)을 그대로 넘긴다.
 *   LLM_MODE=ollama 면 ollama 공급자로, 그 외(relay · cloud)는 OpenAI 호환 공급자로 연결한다.
 *   OpenRouter 면 HINDSIGHT_LLM_MODEL 을 따로 둔다 (claude-haiku-4.5 · qwen3-32b 확인). claude-*-5.5 는 사실 추출이 404 로 실패한다 (.env.example 참고)
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
    // 한국어로 기억하기: 기본값은 영어 기준이라 작은 모델은 사실을 영어로 옮겨 적는다 (잠실 → "Jamseong")
    HINDSIGHT_API_LLM_OUTPUT_LANGUAGE: "Korean",                    // 사실·요약·답을 한국어로
    HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL: "BAAI/bge-m3",           // 의미 검색도 다국어 모델로 (기본 bge-small-en 은 영어 전용)
    HINDSIGHT_API_RERANKER_LOCAL_MODEL: "BAAI/bge-reranker-v2-m3", // 순위 매기기도 다국어 모델로
  },
  readyTimeoutMs: 900_000, // 첫 실행은 다운로드(다국어 모델 약 3GB) 때문에 오래 걸린다
  logger: consoleLogger,
});

console.log(`[Hindsight] 데몬을 켜는 중… (처음이면 몇 분 걸립니다)`);
// 주의: 같은 포트에 데몬이 이미 떠 있으면 그걸 그대로 쓴다 → 위 설정(다국어 모델 등)이 적용되지 않는다.
//       다른 설정으로 켜려면 먼저 끈다: uvx hindsight-embed -p airforce-agent daemon stop (또는 -p default)
const already = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false);
if (already) console.log(`[Hindsight] 포트 ${port} 에 데몬이 이미 떠 있어 그대로 씁니다. 설정을 바꿨다면 먼저 끄세요: uvx hindsight-embed -p airforce-agent daemon stop`);
await server.start();
console.log(`[Hindsight] 준비됨 → ${server.getBaseUrl()}  (.env: MEMORY_MODE=hindsight, HINDSIGHT_BASE_URL=${server.getBaseUrl()})`);
console.log(`[Hindsight] Ctrl+C 로 끕니다`);

// Ctrl+C 를 받으면 데몬도 같이 끈다
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 60_000); // 아무것도 안 하지만 프로그램이 끝나지 않게 붙잡아 둔다 (끌 때까지)
