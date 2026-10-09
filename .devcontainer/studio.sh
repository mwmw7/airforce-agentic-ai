#!/usr/bin/env bash
# .devcontainer/studio.sh — Codespace 에서 LangGraph Studio 열기 (pnpm studio:cs)
#   Studio 화면(smith.langchain.com)이 브라우저에서 내 서버(2024)로 직접 붙는다.
#   Codespace 포트는 기본이 비공개(GitHub 로그인 필요)라 막히므로, 2024 만 공개로 바꾸고 Studio 주소를 만들어 준다.
#   공개 = 주소를 아는 사람은 누구나 내 그래프를 돌릴 수 있음 → 시연이 끝나면 Ctrl+C 로 끈다
set -e
if [ -z "$CODESPACE_NAME" ]; then echo "Codespace 가 아닙니다. 내 PC 에서는 pnpm studio 를 쓰세요."; exit 1; fi

pnpm exec langgraphjs dev --port 2024 --no-browser &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

# 서버가 뜰 때까지 기다린다 (첫 실행은 그래프 컴파일에 몇 초)
until curl -s -o /dev/null http://localhost:2024/ok; do sleep 1; done

gh codespace ports visibility 2024:public -c "$CODESPACE_NAME" >/dev/null 2>&1 \
  || echo "[studio] 포트 공개 실패 — 아래 PORTS 탭에서 2024 를 오른쪽 클릭 → Port Visibility → Public"

URL="https://${CODESPACE_NAME}-2024.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
echo
echo "[studio] 브라우저에서 이 주소를 여세요 (LangSmith 로그인 필요, 무료 계정 OK):"
echo "         https://smith.langchain.com/studio/?baseUrl=${URL}"
echo "[studio] 끝나면 Ctrl+C — 서버가 꺼지면 공개 주소도 더 이상 동작하지 않습니다"
echo
wait $SERVER
