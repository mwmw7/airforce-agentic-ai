/**
 * labs/agent/mcp.ts — MCP 서버에 접속해 도구를 가져다 쓰기 (agent 쪽 = MCP Host/Client)
 *   흐름: 접속하기(connectMcp) → 도구 목록 받기(listMcpTools) → 실행하기(callMcpTool)
 *   서버는 따로 켜 둬야 한다: pnpm mcp:weather. 안 켜져 있으면 안내 한 줄 내고 도구 없이 계속 간다.
 *
 * 모델 입장에선 로컬 도구(look_radar)와 MCP 도구(look_weather)가 구분되지 않는다. 같은 목록에 섞여 있을 뿐이다.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { traceable } from "langsmith/traceable";
import type { Tool } from "../../src/lib/llm.js";
import { log } from "../../src/lib/show.js";

export const MCP_WEATHER_URL = process.env.MCP_WEATHER_URL ?? "http://localhost:3333/mcp";

let client: Client | null = null;
let mcpToolNames = new Set<string>();

/** 1. 접속: 서버에 "안녕, 나는 agent 야" 하고 인사(initialize)한다. 서버가 없으면 null */
export async function connectMcp(url = MCP_WEATHER_URL): Promise<Client | null> {
  if (client) return client;
  const c = new Client({ name: "airforce-agent", version: "0.1.0" });
  try {
    await c.connect(new StreamableHTTPClientTransport(new URL(url)));
    client = c;
    return c;
  } catch {
    log("mcp", `날씨 서버 연결 실패 (${url}) — 다른 터미널에서 pnpm mcp:weather 를 먼저 켜세요. 날씨 없이 계속합니다.`);
    return null;
  }
}

/** 2. 도구 목록: 서버에 "무슨 도구 있어?" 묻고, 모델에게 줄 수 있는 모양(OpenAI tool 형식)으로 바꾼다 */
export async function listMcpTools(): Promise<Tool[]> {
  const c = await connectMcp();
  if (!c) return [];
  // ===== TODO 5: MCP 도구 목록 받기 =====
  // c.listTools() 의 결과 tools 는 [{ name, description, inputSchema }] 모양입니다.
  // 이걸 모델이 읽는 형식 { type: "function", function: { name, description, parameters: inputSchema } } 로 하나씩 바꿔 돌려주세요.
  // (이름은 mcpToolNames 에 넣어 두면 tools 노드가 "MCP 도구인지" 구분할 수 있습니다)
  // ----- SOLUTION -----
  //! return [];
  const { tools } = await c.listTools();
  mcpToolNames = new Set(tools.map((t) => t.name));
  log("mcp", `날씨 서버 연결 OK — 도구 ${tools.length}개 받음: ${tools.map((t) => t.name).join(", ")}`);
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema as Record<string, unknown> },
  }));
  // ----- END SOLUTION -----
}

/** 이 이름이 MCP 에서 받은 도구인가 (tools 노드가 로컬 도구와 구분할 때 쓴다) */
export const isMcpTool = (name: string): boolean => mcpToolNames.has(name);

/** 3. 실행: 서버에 "이 도구 실행해 줘" 하고 결과 글자를 받는다. LangSmith 가 켜져 있으면 "mcp.call" 로 기록된다 */
export const callMcpTool = traceable(async function callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  const c = await connectMcp();
  if (!c) return JSON.stringify({ error: "MCP 서버 없음" });
  // ===== TODO 5: MCP 도구 실행하기 =====
  // c.callTool({ name, arguments: args }) 를 부르면 result.content 에 [{ type: "text", text }] 가 옵니다. text 만 모아 돌려주세요.
  // ----- SOLUTION -----
  //! return JSON.stringify({ error: "TODO 5 미구현" });
  try {
    const result = await c.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }); // 서버가 LLM 을 부르면 몇십 초 걸릴 수 있다
    const content = result.content as { type: string; text?: string }[];
    return content.filter((x) => x.type === "text").map((x) => x.text ?? "").join("\n");
  } catch (e) {
    // 서버가 늦거나 죽어도 agent 는 멈추지 않는다. 결과 대신 사정을 돌려주면 모델이 "날씨 없이" 정리한다
    return JSON.stringify({ error: `MCP 도구 ${name} 실패: ${(e as Error).message}` });
  }
  // ----- END SOLUTION -----
}, { name: "mcp.call", run_type: "tool" });
