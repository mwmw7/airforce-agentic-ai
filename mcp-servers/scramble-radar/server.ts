/**
 * mcp-servers/scramble-radar/server.ts — 가상 항적 DB 를 노출하는 MCP 서버 (stdio)
 *
 * MCP 구조 복습
 *   Host(내 Agent, Claude Code…) ─ Client ─ [stdio / Streamable HTTP] ─ Server(이 파일)
 *   Server 가 제공하는 것: Tools(함수) · Resources(읽기 전용 데이터) · Prompts(템플릿)
 *
 * 같은 서버를 두 곳에 꽂아 동일하게 동작하는지 확인해 보세요.
 *   1) 내 Agent   : labs/lab2-scramble/nodes/investigate.ts 가 MultiServerMCPClient 로 연결
 *   2) Claude Code: `claude mcp add radar -- pnpm exec tsx mcp-servers/scramble-radar/server.ts`
 *   3) Inspector  : pnpm scramble:inspect
 *
 * 데이터는 data/api/tracks.json (교육용 합성 자료). 실제로는 SQLite 등으로 바꾸면 됩니다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";

interface Track {
  track_id: string;
  first_seen: string;
  position: { lat: number; lon: number };
  altitude_ft: number;
  speed_kts: number;
  heading_deg: number;
  iff: string;
  origin_guess: string;
  note: string;
}

function loadTracks(): Track[] {
  return JSON.parse(readFileSync(new URL("../../data/api/tracks.json", import.meta.url), "utf8"));
}

const server = new McpServer({ name: "scramble-radar", version: "0.1.0" });

// ===== TODO 2-2a: MCP 도구 get_track 등록 =====
// server.registerTool(name, { description, inputSchema }, handler) 로 도구를 등록하세요.
//   · name        : "get_track"
//   · description : 모델이 이 도구를 '언제' 쓸지 판단하는 유일한 근거입니다. 구체적으로 쓰세요.
//   · inputSchema : zod 스키마 ({ track_id: z.string() })
//   · handler     : loadTracks() 에서 track_id 로 찾아 { content: [{ type: "text", text: JSON }] } 반환
//                   못 찾으면 에러를 던지지 말고 { error: "not_found" } 를 텍스트로 돌려주세요 (모델이 다음 행동을 고를 수 있게).
// ----- SOLUTION -----
server.registerTool(
  "get_track",
  {
    description:
      "가상 항적 DB 에서 항적 ID(예: UNK-0412) 로 현재 위치·고도·속도·진로·IFF 응답 상태를 조회한다. 미식별 항적 알림을 받으면 가장 먼저 호출한다. (교육용 합성 자료)",
    inputSchema: { track_id: z.string().describe("항적 ID, 예: UNK-0412") },
  },
  async ({ track_id }) => {
    const hit = loadTracks().find((t) => t.track_id === track_id);
    return {
      content: [{ type: "text", text: JSON.stringify(hit ?? { error: "not_found", track_id }) }],
    };
  },
);
// ----- END SOLUTION -----

// 완성 제공: 반경 검색 (편대 여부 판단용)
server.registerTool(
  "find_tracks_near",
  {
    description: "특정 항적 주변 반경(nm) 안의 다른 항적을 찾는다. 편대 비행 여부를 판단할 때 사용. (교육용 합성 자료)",
    inputSchema: { track_id: z.string(), radius_nm: z.number().default(10) },
  },
  async ({ track_id, radius_nm }) => {
    const all = loadTracks();
    const me = all.find((t) => t.track_id === track_id);
    if (!me) return { content: [{ type: "text", text: JSON.stringify({ error: "not_found", track_id }) }] };
    const near = all.filter((t) => t.track_id !== track_id && distNm(me.position, t.position) <= radius_nm)
      .map((t) => ({ track_id: t.track_id, dist_nm: Math.round(distNm(me.position, t.position) * 10) / 10, iff: t.iff }));
    return { content: [{ type: "text", text: JSON.stringify({ center: track_id, radius_nm, near }) }] };
  },
);

// Resource 예시: 전체 항적 스냅샷 (읽기 전용)
server.registerResource(
  "tracks-snapshot",
  "radar://tracks/all",
  { description: "현재 시점 전체 항적 스냅샷", mimeType: "application/json" },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(loadTracks(), null, 2) }] }),
);

function distNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3440.065; // 지구 반지름(nm)
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const transport = new StdioServerTransport();
await server.connect(transport);
// stdio 서버는 stdout 을 프로토콜 채널로 쓰므로 로그는 반드시 stderr 로!
console.error("[scramble-radar] MCP server ready (stdio)");
