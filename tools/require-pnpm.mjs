// 이 저장소는 pnpm 전용입니다. npm / yarn 으로 install 하면 여기서 막습니다.
// (network 없이 동작하도록 외부 패키지 대신 user-agent 만 확인)
const ua = process.env.npm_config_user_agent ?? "";
if (!ua.startsWith("pnpm/")) {
  console.error(`
[문제] 이 저장소는 pnpm 전용입니다. (감지된 패키지 매니저: ${ua.split(" ")[0] || "알 수 없음"})

   pnpm 설치:  corepack enable && corepack prepare pnpm@12.6.0 --activate
   의존성 설치: pnpm install
`);
  process.exit(1);
}
