/**
 * mcp-servers/weather/server.ts — 날씨를 알려주는 MCP 서버 (Streamable HTTP)
 *   하는 일: "look_weather" 도구 하나를 MCP 로 공개한다. 장소(또는 보고 문장)를 받아 그 상황에 맞는 날씨를 LLM 이 지어서 돌려준다
 *   LLM 은 .env 의 LLM_MODE 그대로 (relay · ollama · cloud). mock 이거나 LLM 이 실패하면 아래 규칙표로 만든다 (키 없이도 돈다)
 *   켜기:   pnpm mcp:weather   → http://localhost:3333/mcp 에서 기다린다 (agent 가 접속해 쓴다. 자동으로 켜지지 않으니 먼저 켤 것)
 *   점검:   pnpm mcp:inspect   → MCP Inspector 화면에서 위 주소를 넣고 도구를 직접 눌러 본다
 *
 * MCP 서버 = "도구를 담은 작은 프로그램". agent(Host) 가 접속해 "무슨 도구 있어?" 묻고(listTools), "실행해 줘" 한다(callTool).
 * 같은 서버를 Claude Code 에 꽂아도 똑같이 동작한다: claude mcp add --transport http weather http://localhost:3333/mcp
 *
 * 구조 (위에서 아래로)
 *   1. 데이터 읽기    2. 서버 만들기 + 도구 등록 (빈칸 4)    3. HTTP 로 열기
 */
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { askLLM, LLM_MODE } from "../../src/lib/llm.js";

const PORT = Number(process.env.MCP_WEATHER_PORT ?? 3333);

// ── 1. 날씨 만들기: 교육용 합성 자료. 파일에서 찾지 않고, 받은 글(장소 · 보고 문장)에 맞춰 그 자리에서 만든다 ──
//   1-a) LLM 에게 "이 상황에 그럴듯한 날씨를 JSON 으로" 부탁한다 (아래 lookWeather)
//   1-b) mock 이거나 LLM 이 실패하면 규칙표로 만든다: 지역 열쇠말로 기본 날씨 + 문장 단서(밤 · 바람 · 안개 · 비) 덮어쓰기 (ruleWeather)
type Weather = { 하늘: string; 구름: string; 바람: string; 시야: string; 비행: string };
const BY_REGION: [string[], Weather][] = [
  [["서울", "남산", "광화문"], { 하늘: "맑음", 구름: "조금", 바람: "약함", 시야: "멀리까지 잘 보임", 비행: "가능" }],
  [["한강", "여의도", "김포", "공항"], { 하늘: "흐림", 구름: "낮게 깔림", 바람: "셈 (서풍, 돌풍)", 시야: "보통", 비행: "가능하지만 주의 (저고도 돌풍)" }],
  [["잠실", "송파"], { 하늘: "맑음", 구름: "없음", 바람: "약함", 시야: "좋음", 비행: "가능" }],
  [["인천", "앞바다", "동해", "바다"], { 하늘: "해무", 구름: "낮게 깔림", 바람: "보통", 시야: "짧음 (해무)", 비행: "저고도 주의" }],
  [["서쪽", "훈련"], { 하늘: "맑음", 구름: "조금", 바람: "약간 셈 (서북풍)", 시야: "멀리까지 잘 보임", 비행: "가능" }],
];
const DEFAULT: Weather = { 하늘: "흐림", 구름: "보통", 바람: "보통", 시야: "보통", 비행: "가능" };

function ruleWeather(where: string): string {
  const base = BY_REGION.find(([keys]) => keys.some((k) => where.includes(k)))?.[1] ?? DEFAULT;
  const w: Weather & { 때?: string } = { ...base };
  // 문장 속 단서로 덮어쓴다
  if (/밤|야간|새벽/.test(where)) w.때 = "야간 (시야 제한)";
  if (/바람|돌풍|태풍/.test(where)) w.바람 = "셈 (돌풍 주의)";
  if (/안개|해무/.test(where)) { w.하늘 = "안개"; w.시야 = "코앞만 보임"; w.비행 = "어려움"; }
  if (/비가|비 오|빗줄기|폭우|소나기|눈이|눈 내|눈보라/.test(where)) { w.하늘 = "비"; w.구름 = "잔뜩"; w.시야 = "짧음"; w.비행 = "주의"; } // "비행체" 의 "비" 에 걸리지 않게 단어로 본다
  return JSON.stringify(w);
}

/** LLM 에게 날씨를 지어 달라고 한다. 답은 JSON 한 줄이어야 하고, 모양이 틀리거나 실패하면 규칙표로 돌아간다 */
async function lookWeather(where: string): Promise<string> {
  const fallback = ruleWeather(where);
  if (LLM_MODE === "mock") return fallback;
  try {
    const text = await askLLM({
      system: "너는 가상 기상 관측소다. 받은 장소·상황에 어울리는 지금 날씨를 지어내라. 실제 날씨를 알 필요 없다. " +
        "답은 설명 없이 JSON 객체 한 줄만. 모양은 정확히 {\"하늘\":\"…\",\"구름\":\"…\",\"바람\":\"…\",\"시야\":\"…\",\"비행\":\"…\"} 이고 값은 짧은 한국어 구. 밤이면 시야에 야간을 반영하라. (교육용 합성 자료)",
      user: `장소·상황: ${where}\n이런 모양으로: ${fallback}`,
      mockText: fallback,
    });
    const json = text.match(/\{[\s\S]*\}/)?.[0] ?? "";                 // 앞뒤 말이 붙어 와도 JSON 부분만 꺼낸다
    const w = JSON.parse(json) as Record<string, unknown>;
    if (["하늘", "구름", "바람", "시야", "비행"].every((k) => typeof w[k] === "string")) return JSON.stringify({ ...w, 출처: `LLM(${LLM_MODE})` });
    return fallback;
  } catch {
    return fallback;                                                   // LLM 이 늦거나 틀린 모양이면 규칙표
  }
}

// ── 2. 서버 만들기 + 도구 등록 ──
// 요청마다 새로 만든다 (세션 없는 "stateless" 방식 — MCP SDK 공식 예제와 같다. 서버 하나가 전송 하나에만 붙기 때문)
function makeServer(): McpServer {
  const server = new McpServer({ name: "weather", version: "0.1.0" });

  // ===== TODO 4: MCP 서버에 look_weather 도구 등록하기 =====
  // server.registerTool(이름, { description, inputSchema }, 실행 함수) 모양입니다.
  //   · 이름: "look_weather"
  //   · description: 모델이 읽고 "언제 쓸지" 정하는 설명. 예: "지금 날씨(하늘·구름·바람·시야·비행 가능 여부)를 한 번 본다"
  //   · inputSchema: { 어디: z.string() } — 장소 또는 보고 문장 (zod 로 적는다. 모델이 이 설명을 보고 값을 채운다)
  //   · 실행 함수: ({ 어디 }) 를 받아 lookWeather(어디) 결과를 { content: [{ type: "text", text: 결과 }] } 모양으로 돌려준다
  // ----- SOLUTION -----
  //! // server.registerTool("look_weather", { description: "...", inputSchema: { 어디: z.string() } }, async ({ 어디 }) => ({ content: [{ type: "text", text: ... }] }));
  server.registerTool(
    "look_weather",
    {
      description: "그 장소의 지금 날씨(하늘·구름·바람·시야·비행 가능 여부)를 본다. 보고에 나온 장소를 넣는다. (교육용 합성 자료)",
      inputSchema: { 어디: z.string().describe("장소 또는 보고 문장 그대로. 예: 한강 / 잠실 밤하늘") },
    },
    async ({ 어디 }) => ({ content: [{ type: "text", text: await lookWeather(어디) }] }),
  );
  // ----- END SOLUTION -----
  return server;
}

// ── 3. HTTP 로 열기: POST /mcp 로 오는 요청을 MCP 전송(transport)에 넘긴다 ──
createServer(async (req, res) => {
  if (req.url !== "/mcp" || req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("MCP 서버입니다. POST /mcp 로 보내세요.");
    return;
  }
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // 세션 없음
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}).listen(PORT, () => {
  console.log(`[weather MCP] http://localhost:${PORT}/mcp 에서 기다리는 중 (Ctrl+C 로 끝)`);
});
