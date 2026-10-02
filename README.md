# 공군 AI센터 · Agentic AI 설계·구현 실무 — 핸즈온 저장소

2026. 10. 29(목) ~ 30(금) · TypeScript · LangGraph.js · Jev

> 이 저장소의 모든 데이터(레이더 화면·기상)는 **교육용 합성 자료**이며 실제 공역·부대·기종·규정과 무관합니다.
> Agent 는 **권고**까지만 수행하고, 결정은 항상 사람이 합니다.

---

## 0. 브랜치 안내 — 먼저 읽어 주세요

| 브랜치 | 용도 | 누가 |
|---|---|---|
| `main` | **완성본.** 모든 코드가 채워진 정답 | 강사 · 막힌 교육생 |
| `hands-on` | **실습용.** `main` 과 같지만 핵심 몇 곳이 비어 있고 주석으로 할 일이 적혀 있음 (`[여기에 코드를 작성하세요]`) | 교육생 |

교육생은 `hands-on` 브랜치에서 실습합니다. 막히면 정답을 보세요. 파일 경로가 같으니 내 코드와 정답을 나란히 비교할 수 있습니다.

```bash
git diff hands-on main -- labs/agent/main.ts
```

---

## 1. 5분 시작 가이드

### 1-1. 준비물 (교육 1주 전에 미리)

| 필수 | 선택 |
|---|---|
| Node.js **22 LTS** 이상 (`node -v`) | Ollama + `ollama pull qwen3:8b` (내 노트북 모델로 바꿔 보기) |
| git, VS Code | LangSmith 무료 계정 (LangGraph Studio · 실행 기록 보기) |
| 강사가 나눠주는 조별 토큰 (`.env` 에 입력) | |

로컬 LLM 은 설치하지 않아도 됩니다. 모델은 강사가 AWS Bedrock 에 올려 두고 주소만 나눠 드립니다.

### 1-2. 설치

```bash
git clone https://github.com/mwmw7/airforce-agentic-ai.git
cd airforce-agentic-ai
git checkout hands-on        # 실습용 브랜치 (빈칸 버전)
corepack enable && corepack prepare pnpm@12.6.0 --activate   # pnpm 이 없다면 (Node 22 내장 corepack)
pnpm install
cp .env.example .env         # 토큰은 당일 강사가 배포. 없어도 mock 모드로 전부 실행됩니다
pnpm setup:check             # 환경 점검
```

`[문제]` 가 없으면 준비 완료입니다. `[참고]` 는 "네트워크 없이 도는 대체 모드" 라는 뜻이라 실습에는 지장이 없습니다.

### 1-3. 첫 실행

```bash
pnpm agent                       # 보고 1번 → LLM 이 레이더 확인 → Jev 판정 → 출격이면 사람이 승인(y/n)
pnpm agent 3                     # 보고 3번 (1~4), 또는 pnpm agent "한강에 오리 풍선이 떠요" 처럼 내 보고
pnpm agent:limit                 # 호출 한도 1 로 강제 중단 — 멈추는 건 모델이 아니라 코드
pnpm agent --watch               # 단계(노드)마다 들어간 값·나온 값을 보여 주며 실행 (--watch=full 이면 전부)
pnpm agent:live                  # 브라우저(http://localhost:3030)에서 실시간으로 보기 — 보고를 무작위로 계속 돌리고, 멈추면 버튼으로 답할 수 있다 (Ctrl+C 로 끝)
LLM_MOCK_SLOW=1 pnpm agent       # 모델이 늦는 상황 시연 → 끊고 담당자에게 retry / skip / stop 을 묻는다 (한도는 .env 의 LLM_TIMEOUT_SEC · RUN_TIMEOUT_SEC)
pnpm studio                      # LangGraph Studio(공식 디버거) — 그래프 보기·돌리기·멈춤 이어가기. LangSmith 키를 .env 의 LANGSMITH_API_KEY 에 (설정: langgraph.json)
```

`hands-on` 브랜치에서는 빈칸 때문에 "TODO … 미구현" 안내와 함께 멈춥니다. 정상이며, 순서대로 빈칸을 채우면 한 단계씩 살아납니다.

Studio 의 Input 에는 보고 한 줄만 넣습니다.

```json
{ "report": "서울 상공에 정체불명의 둥근 비행체가 떠 있어요. 움직이지도 않고 무전에 대답도 없어요." }
```

---

## 2. 내 에이전트 — 한눈에

관제실에 보고 한 줄이 들어오면, 모델이 도구로 사실을 확인하고, 판정 모델이 의견을 내고, 최종 결정은 코드와 사람이 합니다.

```
START ─▶ agent ─┬─ 도구 쓰고 싶다   ─▶ tools ─▶ agent … (반복)
                ├─ 다 확인했다     ─▶ judge ─┬─ 출격 아님 ─▶ END          (Jev 판정 + 코드가 결정)
                │                           └─ 출격!   ─▶ approve ─▶ END  (멈추고 사람이 승인/반려)
                ├─ 너무 많이 돌았다 ─▶ stop  ─▶ END   (내 코드가 강제로 멈춤)
                └─ 모델이 늦다     ─▶ askHuman ─▶ 사람이 고름: retry → agent / skip → judge / stop → stop
```

| 단계 (노드) | 하는 일 | 배우는 것 |
|---|---|---|
| `agent` | 모델에게 "도구를 더 쓸래, 사실을 정리할래?" 묻기 | Agent Loop · Tool Calling |
| `tools` | 모델이 고른 도구(look_radar · look_closer · look_weather)를 **내 코드가** 실행 | 모델은 부르겠다고 말할 뿐, 실행은 내 코드 |
| `judge` | Jev 에게 3가지 질문(출격/감시/무시 · 위험도 · 정체불명 확률) | 판정 모델 |
| `approve` | 출격이면 멈추고 사람에게 승인/반려 묻기 | Human-in-the-Loop (`interrupt`) |
| `askHuman` | 모델이 늦으면 멈추고 retry / skip / stop 묻기 | 시간 초과 · 사람 개입 |
| `stop` | MAX_STEPS 를 넘기면 강제 종료 | Harness — 멈추는 건 코드 |

그림: `docs/graphs/agent.md` (`pnpm graph` 로 다시 생성)

### 보고 4종 (`labs/agent/main.ts` 의 REPORTS)

| # | 보고 | 보는 포인트 |
|---|---|---|
| 1 | 서울 상공 정체불명 둥근 비행체, 무응답 | 도구를 여러 번 쓰고 출격 → 사람 승인 |
| 2 | 한강 위 거대한 오리 풍선, 김포 쪽으로 | 위험하진 않지만 감시 |
| 3 | 잠실 상공 드론 수십 대 | 허가 여부 확인 |
| 4 | 옆 부대 훈련기, 예정 코스 정상 | 별일 아님 |

---

## 3. 실습 순서 ↔ 빈칸 (TODO)

| 단계 | 할 일 | 파일 | 확인 명령 |
|---|---|---|---|
| 1 | 도구 결과를 모델에게 돌려주기 | `labs/agent/main.ts` | `pnpm agent` |
| 2 | 강제 중단은 코드가 | 〃 | `pnpm agent:limit` |

이 폴더에 한 단계씩 기능(검색 · MCP · 안전 검사 · 기억 · 보고서)을 붙여 나갑니다. 새 단계가 생기면 이 표에 한 줄씩 추가됩니다.

---

## 4. 자주 쓰는 명령

```bash
pnpm agent --watch=full      # 들어간 값·나온 값을 자르지 않고 전부
pnpm graph                   # 그래프를 Mermaid 그림으로 (docs/graphs/)
pnpm typecheck               # 타입 검사
pnpm setup:check             # 환경 점검
```

---

## 5. 모델·판정기 바꾸기 (.env 두 줄)

| 설정 | 기본 (키 없이) | 강사 제공 | 폐쇄망으로 옮길 때 |
|---|---|---|---|
| `LLM_MODE` | `mock` (정해진 답) | `relay` — 강사 Bedrock 주소 + 조별 토큰 | vLLM/Ollama 등 OpenAI 호환 주소 |
| `JEV_MODE` | `local` (규칙 판정기) | `openrouter` — Jev | `src/lib/jev.ts` 의 `localJudge` 자리에 자체 모델 |

모델 비교: `LLM_MODE=ollama` + `LLM_BASE_URL=http://localhost:11434/v1` + `LLM_MODEL=qwen3:8b` 로 바꾸면 같은 보고를 노트북 모델로 돌려 봅니다.

실행 기록은 `traces/*.jsonl` 에 남습니다 (Langfuse 특강에서 확장). `.env` 에 `LANGSMITH_TRACING=true` 와 `LANGSMITH_API_KEY` 를 넣으면 같은 실행이 smith.langchain.com 에도 트리(노드 → LLM 호출·Jev 판정)로 올라갑니다. 코드 수정 없이 켜고 끕니다.

---

## 6. 저장소 구조

```
airforce-agentic-ai/
├─ src/lib/                 공용 모듈 — 폐쇄망으로 옮길 때 바꾸는 곳이 전부 여기
│  ├─ llm.ts                 LLM (Bedrock 중계 / Ollama / 클라우드 / mock)
│  ├─ jev.ts                 Jev 판정 모델 (OpenRouter / 로컬 규칙 판정기)
│  ├─ trace.ts               실행 기록 (traces/*.jsonl)
│  ├─ show.ts                --watch 출력
│  └─ live.ts · live.html    브라우저 실시간 보기 (pnpm agent:live)
├─ labs/agent/main.ts        내 에이전트 — 보고 → agent ⇄ tools → judge
├─ data/api/                 교육용 합성 자료 — 레이더 화면(radar-screen.json) · 기상(weather.json)
├─ docs/graphs/              그래프 그림 (pnpm graph)
├─ traces/                   실행 기록
├─ langgraph.json            LangGraph Studio 설정 (pnpm studio)
└─ tools/                    doctor(환경 점검) · make-handson(빈칸 만들기) · draw-graph(그림)
```

---

## 7. 강사용 — 두 브랜치 관리

모든 작업은 `main` 에서 하고, `hands-on` 은 스크립트로 만듭니다.

```bash
git checkout main
# … 코드 수정 …
git commit -am "fix: …" && git push

git checkout hands-on
git checkout main -- .                # main 파일을 그대로 가져온 뒤
node tools/make-handson.mjs           # 표시된 정답 구간을 빈칸으로
git commit -am "handson: regenerate from main" && git push
```

`main` 에서 파일을 지우거나 옮겼다면 `hands-on` 에서도 같은 파일을 `git rm` 해 주세요 (`git checkout main -- .` 은 삭제를 옮기지 않습니다).
빈칸 목록 확인: `pnpm instructor:make-handson --check`. 표시 규칙은 `tools/make-handson.mjs` 상단 주석 참고.

---

## 8. 참고 링크

- LangGraph.js — https://langchain-ai.github.io/langgraphjs/
- LangSmith · Studio — https://docs.smith.langchain.com
- Jev / OpenRouter Decisions API — https://openrouter.ai/docs/guides/community/jev-tutorial
- Langfuse — https://langfuse.com/docs
