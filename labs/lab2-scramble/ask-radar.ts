/**
 * labs/lab2-scramble/ask-radar.ts — 레이더 MCP 서버에 항적 정보 묻기
 * 입력: 알림의 항적 ID 들 / 출력: 항적별 고도·속도·IFF 한 줄씩 clues 에 추가
 * 내 Agent(Host) → Client → stdio → Server(mcp-servers/scramble-radar) 구조가 그대로 보인다.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { traceable } from "langsmith/traceable";
import type { Clue, State } from "./state.js";

export async function askRadar(state: State): Promise<Partial<State>> {
  // 서버를 자식 프로세스로 띄운다. env 를 따로 주지 않으면 MCP SDK 가 PATH·HOME 같은 최소 값만 넘긴다
  // → .env 의 API 키가 서버 쪽으로 새지 않는다 (격리)
  const transport = new StdioClientTransport({
    command: process.execPath, // 지금 쓰는 node (Windows·Mac 공통)
    args: ["--import", "tsx", "mcp-servers/scramble-radar/server.ts"],
    stderr: "ignore",
  });
  const client = new Client({ name: "scramble-agent", version: "0.1.0" });

  try {
    await client.connect(transport);
    // 항적 하나를 서버에 묻는다. LangSmith 가 켜져 있으면 MCP 호출 하나하나가 "mcp.get_track" tool 기록으로 남는다
    const getTrack = traceable(async (track_id: string) => {
      const res = await client.callTool({ name: "get_track", arguments: { track_id } });
      const text = (res.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "{}";
      return JSON.parse(text);
    }, { name: "mcp.get_track", run_type: "tool" });
    const lines: string[] = [];
    for (const track_id of state.alert.track_ids) {
      const t = await getTrack(track_id);
      lines.push(t.error ? `${track_id}: 항적 DB 에 없음` : `${track_id}: 고도 ${t.altitude_ft}ft · 속도 ${t.speed_kts}kts · 진로 ${t.heading_deg}° · IFF ${t.iff} · ${t.note}`);
    }
    const clue: Clue = { from: "radar", ok: true, lines };
    return { clues: [clue] };
  } catch (e) {
    return { clues: [{ from: "radar", ok: false, lines: [`레이더 조회 실패: ${String(e)}`] }] };
  } finally {
    await client.close();
  }
}
