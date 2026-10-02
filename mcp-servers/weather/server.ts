/**
 * mcp-servers/weather/server.ts — 날씨를 알려주는 MCP 서버 (Streamable HTTP)
 *   하는 일: "look_weather" 도구 하나를 MCP 로 공개한다. 부르면 data/api/weather.json 에서 날씨 한 줄을 돌려준다
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
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

const PORT = Number(process.env.MCP_WEATHER_PORT ?? 3333);

// ── 1. 데이터: 교육용 합성 자료. 볼 때마다 하나가 무작위로 나온다 ──
const weathers: Record<string, string>[] = JSON.parse(readFileSync(new URL("../../data/api/weather.json", import.meta.url), "utf8"));
function lookWeather(): string {
  const { _notice, ...w } = weathers[Math.floor(Math.random() * weathers.length)];
  return JSON.stringify(w);
}

// ── 2. 서버 만들기 + 도구 등록 ──
// 요청마다 새로 만든다 (세션 없는 "stateless" 방식 — MCP SDK 공식 예제와 같다. 서버 하나가 전송 하나에만 붙기 때문)
function makeServer(): McpServer {
  const server = new McpServer({ name: "weather", version: "0.1.0" });

  // ===== TODO 4: MCP 서버에 look_weather 도구 등록하기 =====
  // server.registerTool(이름, { description, inputSchema }, 실행 함수) 모양입니다.
  //   · 이름: "look_weather"
  //   · description: 모델이 읽고 "언제 쓸지" 정하는 설명. 예: "지금 날씨(하늘·구름·바람·시야·비행 가능 여부)를 한 번 본다"
  //   · inputSchema: 입력 없음 → {} (입력이 있다면 { 도시: z.string() } 처럼 zod 로 적는다)
  //   · 실행 함수: lookWeather() 결과를 { content: [{ type: "text", text: 결과 }] } 모양으로 돌려준다
  // [여기에 코드를 작성하세요] — 정답은 main 브랜치의 같은 파일
  // server.registerTool("look_weather", { ... }, async () => ({ content: [{ type: "text", text: ... }] }));
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
