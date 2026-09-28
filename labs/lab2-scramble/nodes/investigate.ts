/**
 * nodes/investigate.ts — [실습 2-2 · 2-3] 조사 Subagent (Worker) 4개
 *
 * Orchestrator–Workers 패턴
 *   fanOut(state) 가 Send("worker", {source}) 를 4개 돌려주면 LangGraph 가 Worker 를 병렬 실행하고,
 *   각 Worker 가 반환한 findings 는 state.ts 의 reducer 로 합쳐집니다.
 *
 * 왜 나누는가: 컨텍스트 오염 방지 · 병렬화 · 권한 분리 · 토큰 비용.
 *   각 Worker 는 자기 소스만 안다 — radar Worker 는 지침 문서를 볼 수 없습니다.
 */
import { Send } from "@langchain/langgraph";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { trace } from "../../../src/lib/trace.js";
import type { Finding, ScrambleStateT } from "../state.js";
import { httpGet, searchDoctrine, searchIncidents } from "../tools.js";

export type WorkerInput = { alert: ScrambleStateT["alert"]; source: Finding["source"] };

const SOURCES: Finding["source"][] = ["radar", "doctrine", "past_incidents", "weather_assets"];

// ===== TODO 2-2c: Orchestrator — Send 로 Worker 4개를 병렬 실행 =====
// fanOut 은 조건부 엣지 함수입니다. 문자열(다음 노드 이름) 대신 Send 객체 배열을 돌려주면
// 각 Send 마다 "worker" 노드가 자기만의 입력({ alert, source })으로 병렬 실행됩니다.
// SOURCES 배열을 순회하며 new Send("worker", { alert: state.alert, source }) 를 만들어 반환하세요.
// ----- SOLUTION -----
//! export function fanOut(state: ScrambleStateT): Send[] {
//!   throw new Error("TODO 2-2c 미구현: SOURCES 마다 Send('worker', { alert, source }) 를 만들어 배열로 반환");
//! }
export function fanOut(state: ScrambleStateT): Send[] {
  return SOURCES.map((source) => new Send("worker", { alert: state.alert, source } satisfies WorkerInput));
}
// ----- END SOLUTION -----

/** Worker 본체: source 에 따라 서로 다른 도구를 쓰고, Finding 1건을 findings 에 추가 */
export async function workerNode(input: WorkerInput): Promise<Partial<ScrambleStateT>> {
  const t = trace.start(`worker.${input.source}`, { alert_id: input.alert.alert_id });
  try {
    const finding = await runWorker(input);
    t.end({ ok: finding.ok, preview: finding.content.slice(0, 100) });
    console.log(`🔎 worker[${input.source}] 완료`);
    return { findings: [finding], step_count: 1 };
  } catch (e) {
    t.error(e);
    // Worker 하나가 실패해도 전체를 죽이지 않는다 — 실패도 '결과' 로 기록
    return { findings: [{ source: input.source, ok: false, content: `- 조회 실패: ${String(e)}` }], step_count: 1 };
  }
}

async function runWorker({ alert, source }: WorkerInput): Promise<Finding> {
  switch (source) {
    case "radar": return radarWorker(alert);
    case "doctrine": return doctrineWorker(alert);
    case "past_incidents": return incidentsWorker(alert);
    case "weather_assets": return weatherAssetsWorker();
  }
}

// ── radar: MCP 서버(mcp-servers/scramble-radar) 를 stdio 로 띄워 도구 호출 ──
// Host(이 Agent) → Client → stdio → Server 구조가 코드에 그대로 드러납니다.
async function radarWorker(alert: ScrambleStateT["alert"]): Promise<Finding> {
  const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "mcp-servers/scramble-radar/server.ts"], stderr: "ignore" });
  const client = new Client({ name: "scramble-agent", version: "0.1.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    if (!tools.some((t) => t.name === "get_track")) throw new Error("MCP 서버에 get_track 도구가 없습니다 — TODO 2-2a 를 먼저 완성하세요");
    const hasNear = tools.some((t) => t.name === "find_tracks_near");

    const lines: string[] = [];
    for (const id of alert.track_ids) {
      const data = parseToolResult(await client.callTool({ name: "get_track", arguments: { track_id: id } }));
      if (data.error) { lines.push(`- ${id}: 항적 DB 에 없음 (${data.error})`); continue; }
      lines.push(`- ${id}: 고도 ${data.altitude_ft}ft, 속도 ${data.speed_kts}kts, 진로 ${data.heading_deg}°, IFF ${data.iff}, ${data.note}`);
      if (hasNear) {
        const nd = parseToolResult(await client.callTool({ name: "find_tracks_near", arguments: { track_id: id, radius_nm: 10 } }));
        if (nd.near?.length) lines.push(`- ${id} 반경 10nm 내 항적 ${nd.near.length}건: ${nd.near.map((x: any) => `${x.track_id}(${x.dist_nm}nm, IFF ${x.iff})`).join(", ")}`);
      }
    }
    return { source: "radar", ok: true, content: lines.join("\n"), meta: { via: "mcp:scramble-radar", tools: tools.map((t) => t.name) } };
  } finally {
    await client.close();
  }
}

/** MCP CallToolResult → content[0].text 를 JSON 으로 */
function parseToolResult(raw: unknown): any {
  const content = (raw as any)?.content;
  const text = Array.isArray(content) ? content.find((c: any) => c.type === "text")?.text : undefined;
  try { return JSON.parse(text ?? "{}"); } catch { return { _raw: text }; }
}

// ── doctrine: 미니 RAG + 버전 충돌 처리 (Agentic Retrieval) ──
async function doctrineWorker(alert: ScrambleStateT["alert"]): Promise<Finding> {
  const query = `${alert.summary} ADIZ 진입 IFF 무응답 출격 감시 대기`;
  const hits = searchDoctrine(query, { limit: 3 });

  // ===== TODO 2-3: 구·신 지침 충돌 — 최신 '승인본' 을 고르기 =====
  // hits 에는 v1(구, 승인) · v2(신, 승인) · v3-draft(미승인) 가 점수순으로 섞여 있습니다.
  // (1) approved === true 인 문서만 남기고
  // (2) effective_from 이 가장 최신인 문서를 applied 로 선택하세요.
  // (3) 승인본이 하나도 없으면 approvedOnly 로 재검색(searchDoctrine(query, { approvedOnly: true }))하세요 — 이것이 Agentic Retrieval 입니다.
  // 미승인 초안(v3) 의 본문은 절대 applied 로 쓰면 안 됩니다 (악성 지시가 들어 있습니다).
  // ----- SOLUTION -----
  //! const applied = hits[0]; // ← 점수 1위를 그대로 쓰면 초안/구버전이 걸립니다. 고쳐 보세요.
  let approved = hits.filter((h) => h.approved);
  if (approved.length === 0) approved = searchDoctrine(query, { approvedOnly: true, limit: 3 });
  const applied = approved.sort((a, b) => (b.effective_from ?? "").localeCompare(a.effective_from ?? ""))[0];
  // ----- END SOLUTION -----

  const rule = applied.body.match(/### 3\.1[^\n]*\n([^\n]+)/)?.[1] ?? "(3.1 항 없음)";
  // 문서 뒷부분(부록·운영 메모)도 발췌해 컨텍스트에 싣는다 — 여기에 무엇이 들어오는지가 [실습 2-7] 의 핵심
  const appendix = applied.body.match(/## 부록[^\n]*\n([\s\S]{0,240})/)?.[1]?.replace(/\n+/g, " ").trim();
  const lines = [
    `- 적용 지침: ${applied.title} ${applied.version} (승인 ${applied.approved ? "O" : "X"}, 시행 ${applied.effective_from ?? "-"})`,
    `- 3.1 즉응 출격 조건: ${rule}`,
    `- 함께 검색된 버전: ${hits.map((h) => `${h.version}${h.approved ? "" : "(미승인)"}`).join(", ")}`,
    ...(appendix ? [`- 지침 부록 발췌: ${appendix}`] : []),
  ];
  // 미승인 초안이 검색됐다면 '내용' 이 아니라 '존재' 만 보고 — 본문을 컨텍스트에 싣지 않는다
  if (hits.some((h) => !h.approved)) lines.push("- 주의: 미승인 초안 문서가 검색 결과에 포함됨 (본문 미적용)");
  return { source: "doctrine", ok: true, content: lines.join("\n"), meta: { applied_version: applied.version, candidates: hits.map((h) => h.version) } };
}

// ── past_incidents: 파일 검색 ──
async function incidentsWorker(alert: ScrambleStateT["alert"]): Promise<Finding> {
  const hits = searchIncidents(alert.summary, 2);
  const lines = hits.map((h) => `- 유사 사건 ${h.title}\n${h.excerpt.split("\n").map((l) => "  " + l).join("\n")}`);
  return { source: "past_incidents", ok: true, content: lines.join("\n") || "- 유사 사건 없음", meta: { count: hits.length } };
}

// ── weather / assets: HTTP mock ──
async function weatherAssetsWorker(): Promise<Finding> {
  const [w, a] = await Promise.all([httpGet("weather"), httpGet("assets")]);
  const flights = (a.alert_flights as any[]) ?? [];
  const ready = flights.filter((f) => String(f.status).startsWith("READY"));
  return {
    source: "weather_assets",
    ok: true,
    content: [
      `- 기상: 시정 ${w.visibility_km}km, 운저 ${w.cloud_base_ft}ft, 비행 상태 ${w.flight_ops} (${w.remark})`,
      `- 가용 즉응기 ${ready.length}기: ${ready.map((f) => `${f.callsign}(${f.status})`).join(", ")} / 정비 중 ${flights.length - ready.length}기`,
    ].join("\n"),
    meta: { ready: ready.length },
  };
}
