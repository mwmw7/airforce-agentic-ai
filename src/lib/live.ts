/**
 * src/lib/live.ts — 브라우저에서 실시간으로 보기
 *
 * --live 를 붙이면 작은 서버(http://localhost:3030)를 띄우고, 단계 진행 · LLM 호출 · 도구 결과를 그대로 흘려보낸다.
 * 그림은 LangGraph 가 뽑는 Mermaid 를 그대로 쓰므로 어떤 그래프든 붙는다. 사람에게 묻는 질문은 브라우저 버튼으로도 답할 수 있다.
 * 새 설치 없음: Node 내장 http + 브라우저가 CDN 에서 mermaid 를 받는다.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { exec } from "node:child_process";

export const LIVE = process.argv.includes("--live");
const PORT = Number(process.env.LIVE_PORT ?? 3030);

const clients = new Set<http.ServerResponse>();
const history: string[] = []; // 늦게 연 브라우저도 지금까지 기록을 따라잡게
let answerFromPage: ((s: string) => void) | null = null;

/** 이벤트 하나를 모든 브라우저에 보낸다. --live 가 아니면 아무것도 안 한다 */
export function send(type: string, data: Record<string, unknown> = {}) {
  if (!LIVE) return;
  const line = `data: ${JSON.stringify({ type, at: Date.now(), ...data })}\n\n`;
  history.push(line);
  if (history.length > 400) history.shift();
  for (const c of clients) c.write(line);
}

/** 브라우저 버튼으로 온 답을 기다린다 (터미널 입력과 경쟁시켜 먼저 온 쪽을 쓴다) */
export const waitAnswerFromPage = () => new Promise<string>((resolve) => { answerFromPage = resolve; });

/** 서버를 띄우고 브라우저를 연다. 첫 브라우저가 붙을 때까지 최대 10초 기다린다 */
export async function startLive(graph: { getGraphAsync(): Promise<{ drawMermaid(): string }> }) {
  if (!LIVE) return;
  const mermaid = (await graph.getGraphAsync()).drawMermaid();
  const page = readFileSync(new URL("./live.html", import.meta.url), "utf8").replace("__MERMAID__", JSON.stringify(mermaid));

  http.createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      for (const line of history) res.write(line);
      clients.add(res);
      console.log(`[live] 브라우저 연결됨 (지금 ${clients.size}개)`);
      req.on("close", () => { clients.delete(res); console.log(`[live] 브라우저 끊김 (남은 ${clients.size}개)`); });
    } else if (req.url === "/answer" && req.method === "POST") {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => { answerFromPage?.(body.trim()); answerFromPage = null; res.end("ok"); });
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page);
    }
  }).on("error", (e: NodeJS.ErrnoException) => {
    // 가장 흔한 실수: 이전 pnpm loop:live 가 아직 살아 있어 포트가 잡혀 있음
    if (e.code === "EADDRINUSE") console.error(`[live] 포트 ${PORT} 가 이미 사용 중입니다. 이전 실행(Ctrl+C 안 한 터미널)을 끄거나 LIVE_PORT=${PORT + 1} 로 다시 실행하세요.`);
    else console.error(`[live] 서버를 못 띄웠습니다: ${e.message}`);
    process.exit(1);
  }).listen(PORT);

  const url = `http://localhost:${PORT}`;
  console.log(`[live] 브라우저에서 보기: ${url}  (끝내려면 Ctrl+C)`);
  const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
  exec(`${open} ${url}`, () => {}); // 못 열어도 그냥 넘어간다 (주소를 직접 치면 됨)

  for (let i = 0; i < 100 && clients.size === 0; i++) await new Promise((r) => setTimeout(r, 100));
  if (clients.size === 0) console.log(`[live] 브라우저가 아직 안 붙었습니다. ${url} 을 직접 여세요. (SSH 로 접속 중이면 포트 ${PORT} 를 내 PC 로 포워딩해야 합니다)`);
}
