#!/usr/bin/env bash
# .devcontainer/setup.sh — Codespace(컨테이너)를 처음 만들 때 한 번 도는 준비 스크립트
#   교육생 노트북에서 하던 설치 과정(README 1-2)을 그대로 자동으로 한다
set -e

echo "[준비 1/4] pnpm 켜기 (package.json 의 packageManager 버전)"
sudo corepack enable
corepack install

echo "[준비 2/4] 패키지 설치"
pnpm install --frozen-lockfile

echo "[준비 3/4] .env 만들기 (이미 있으면 그대로 둠)"
[ -f .env ] || cp .env.example .env

echo "[준비 4/4] uv 설치 (선택 실습: pnpm memory:up 으로 Hindsight 띄울 때만 필요)"
curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1 || echo "  uv 설치 실패 — Hindsight 로컬 실습만 못 하고 나머지는 상관없음"

pnpm setup:check
echo "준비 끝. 터미널에서 pnpm agent 를 쳐 보세요."
