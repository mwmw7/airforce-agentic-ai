/**
 * tools/see-studio.mjs — LangGraph Studio(공식 디버거)로 내 그래프 보기 (pnpm see:studio)
 *   내 PC     : Studio 서버(localhost:2024)를 켜고 브라우저로 Studio 를 연다
 *   Codespace : Studio 화면(smith.langchain.com)이 브라우저에서 2024 로 직접 붙어야 하는데 Codespace 포트는 기본이 비공개다
 *               → 2024 만 공개로 바꾸고 붙여 넣을 Studio 주소를 찍어 준다. 공개 주소는 누구나 접속 가능하니 시연 후 Ctrl+C
 *   어느 쪽이든 LangSmith 로그인(무료 계정)이 필요하다
 */
import { spawn, execFile } from "node:child_process";

const PORT = 2024;
const inCodespace = Boolean(process.env.CODESPACE_NAME);

// Studio 서버 켜기. 내 PC 면 서버가 직접 브라우저를 연다, Codespace 면 주소만 찍는다
const args = ["exec", "langgraphjs", "dev", "--port", String(PORT), ...(inCodespace ? ["--no-browser"] : [])];
const server = spawn("pnpm", args, { stdio: "inherit", shell: process.platform === "win32" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));

if (inCodespace) {
  // 서버가 뜰 때까지 기다린다 (첫 실행은 그래프를 읽느라 몇 초)
  while (!(await fetch(`http://localhost:${PORT}/ok`).then((r) => r.ok).catch(() => false))) await new Promise((r) => setTimeout(r, 1000));

  execFile("gh", ["codespace", "ports", "visibility", `${PORT}:public`, "-c", process.env.CODESPACE_NAME], (err) => {
    if (err) console.log(`[see:studio] 포트 공개 실패 — 아래 PORTS 탭에서 ${PORT} 오른쪽 클릭 → Port Visibility → Public`);
  });
  const baseUrl = `https://${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  console.log(`\n[see:studio] 브라우저에서 이 주소를 여세요 (LangSmith 로그인 필요):`);
  console.log(`            https://smith.langchain.com/studio/?baseUrl=${baseUrl}`);
  console.log(`[see:studio] 끝나면 Ctrl+C — 서버가 꺼지면 공개 주소도 동작하지 않습니다\n`);
}
