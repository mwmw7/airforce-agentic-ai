# 공군 AI센터 · Agentic AI 설계·구현 실무 — 핸즈온 저장소

2026. 10. 29(목) ~ 30(금) · TypeScript · LangGraph.js · MCP · Jev · Hindsight

> 이 저장소의 모든 데이터(레이더 화면·기상·규정집)는 **교육용 합성 자료**이며 실제 공역·부대·기종·규정과 무관합니다.
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
| 강사가 나눠주는 조별 토큰 (`.env` 에 입력) | `uv` (Hindsight 기억 서버를 내 노트북에서 띄울 때, https://docs.astral.sh/uv/) |

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
pnpm mcp:weather                 # 터미널 1: 날씨 MCP 서버 (켜 둔 채로 둔다. 없으면 agent 는 날씨 없이 돈다)
pnpm agent                       # 터미널 2: 보고 1번 → LLM 이 레이더·규정집·날씨 확인 → Jev 판정 → 출격이면 사람이 승인(y/n)
pnpm agent 3                     # 보고 3번 (1~4), 또는 pnpm agent "한강에 오리 풍선이 떠요" 처럼 내 보고
pnpm agent:limit                 # 호출 한도 1 로 강제 중단 — 멈추는 건 모델이 아니라 코드
pnpm agent --watch               # 단계(노드)마다 들어간 값·나온 값을 보여 주며 실행 (--watch=full 이면 전부)
pnpm agent --resume <실행번호>    # 담당자 확인 중 Ctrl+C 로 껐던 실행을 멈춘 곳부터 이어가기 (실행번호는 시작할 때 출력)
pnpm agent --all                 # 보고 4종을 차례로 돌리고 표로 정리. 건마다 사람이 y/w/n 을 답한다 (--answer w 를 주면 자동). JEV_MODE=local 과 typesafe 로 두 번 돌려 비교
pnpm agent:live                  # 브라우저(http://localhost:3030)에서 실시간으로 보기 — 보고를 무작위로 계속 돌린다 (Ctrl+C 로 끝)
LLM_MOCK_SLOW=1 pnpm agent       # 모델이 늦는 상황 시연 → 끊고 담당자에게 retry / skip / stop 을 묻는다
pnpm studio                      # LangGraph Studio(공식 디버거). LangSmith 키를 .env 의 LANGSMITH_API_KEY 에 (설정: langgraph.json)
```

`hands-on` 브랜치는 **거의 빈 Agent** 에서 출발합니다. 빈칸이 비어 있어도 끝까지 돌고, 담당자 화면에 근거 줄이 비어 있을 뿐입니다. 단계마다 빈칸을 채우고 다시 돌리면 화면에 새 줄이 생깁니다. 늦었으면 `pnpm step <단계>` 로 그 단계까지 채워진 상태로 넘어갑니다 (3장).

Studio 의 Input 에는 보고 한 줄만 넣습니다.

```json
{ "report": "서울 상공에 정체불명의 둥근 비행체가 떠 있어요. 움직이지도 않고 무전에 대답도 없어요." }
```

---

## 2. 내 에이전트 — 한눈에

관제실에 보고 한 줄이 들어오면, **규정집 Worker 와 레이더 부하 Agent(Subagent)가 동시에** 자료를 모으고, 전에 똑같은 보고를 판단한 기억이 있으면 그 판단을 그대로 쓰고(Jev 생략), 없으면 판정 모델이 의견을 냅니다. **언제나 마지막은 사람**이 모든 근거를 한눈에 보고 출격 / 감시 / 무시 를 고릅니다.

```
         ┌─▶ searchDocs  (Worker: 함수 하나, 규정집 찾기)                      ─┐
START ───┤                                                                    ├─▶ remember ─┬─ 같은 사례 기억 있음 ──────┐ (Jev 생략)
         └─▶ askRadar    (Subagent: 부하 Agent, 안에서 agent ⇄ tools 를 반복) ─┘             └─ 없음 ─▶ judge (Jev) ───┴─▶ approve ─▶ END
                                                                                     approve = 레이더 · 확대 · 날씨 · 규정 · 기억 · Jev 를 모아 보여 주고 사람이 결정

askRadar 안 (labs/agent/ask-radar.ts):
  START ─▶ agent ─┬─ 도구 쓰고 싶다   ─▶ tools ─▶ agent … (반복)
                  ├─ 다 확인했다     ─▶ END   (facts · evidence 만 들고 부모에게 돌아간다. 대화 기록은 부하 안에 남는다)
                  ├─ 너무 많이 돌았다 ─▶ stop  ─▶ END   (내 코드가 강제로 멈춤 — 부하만 멈추고 부모는 계속)
                  └─ 모델이 늦다     ─▶ askHuman ─▶ 사람이 고름: retry → agent / skip → END / stop → stop
```

Worker 와 Subagent 는 LangGraph 에겐 똑같이 "노드 하나" 입니다. 안에 모델 루프가 있으면 우리가 부하(Subagent)라고 부를 뿐입니다. 터미널에서는 부하가 도는 동안 `[SUB] ┏━ askRadar` 띠가 열리고, 그 사이 모든 줄 앞에 보라색 `┃` 가 붙었다가 `┗━ askRadar 끝` 에서 닫힙니다. searchDocs 는 띠 밖에서 한 줄에 끝나고, `--watch` 면 띠 안에 `askRadar › agent`, `askRadar › tools` 가 여러 줄 찍힙니다.

| 단계 (노드) | 하는 일 | 배우는 것 |
|---|---|---|
| `searchDocs` (Worker) | 보고 한 줄로 규정집에서 관련 규정을 찾아 근거에 넣기. 모델 호출 없음, 함수 하나 | Task Decomposition — 정해진 일은 함수가 |
| `askRadar` (Subagent) | 아래 agent ⇄ tools 루프를 통째로 감싼 부하 그래프. 부모에겐 facts · evidence · steps 만 돌려준다 | Subagent · Context 분리 (팀장 칠판은 결론만) |
| `agent` (부하 안) | 모델에게 "도구를 더 쓸래, 사실을 정리할래?" 묻기 | Agent Loop · Tool Calling |
| `tools` (부하 안) | 모델이 고른 도구를 **내 코드가** 실행. 로컬 도구(레이더 보기·확대)와 MCP 도구(날씨)가 한 목록에 섞여 있다 | 모델은 부르겠다고 말할 뿐, 실행은 내 코드 |
| `remember` | 기억에서 같은 사례 찾기(`findSameCase`). 보고 겹침 0.9 이상이면 그때의 판정을 그대로 쓰고 Jev 를 건너뜀 | 장기 기억으로 판단하기 (같은 사례 = 코드 규칙) |
| `judge` | 비슷한 기억을 참고로(recall) Jev 에게 3가지 질문(출격/감시/무시 · 위험도 · 정체불명 확률), 끝나면 기억에 남김(retain) | 판정 모델 · 장기 기억 |
| `approve` | **언제나** 멈춰서 레이더 · 확대 · 날씨 · 규정 · 기억 · Jev 의견 · 코드 권고를 한눈에 보여 주고, 사람이 y(출격) / w(감시) / n(무시) 를 고름. 사람의 답이 기억에 남음 | Human-in-the-Loop (`interrupt`) |
| `askHuman` (부하 안) | 모델이 늦으면 멈추고 retry / skip / stop 묻기. 부하 안의 interrupt 도 부모 실행번호로 저장·재개된다 | 시간 초과 · 사람 개입 |
| `stop` (부하 안) | MAX_STEPS 를 넘기면 부하만 강제 종료. 부모는 규정집 결과만 들고 판정으로 | Harness — 멈추는 건 코드 · 장애 격리 |

그림: `docs/graphs/agent.md` (`pnpm graph` 로 다시 생성)

### 도구 4개 + Worker 1개

| 도구 | 어디서 실행 | 자료 |
|---|---|---|
| `look_radar` 보고에 나온 장소로 레이더 보기 | 로컬 (`ask-radar.ts`) | 실제 모델이면 **LLM 이 보고에 맞춰 레이더 화면을 지어냄** (실행마다 한 번, 확대와 앞뒤가 맞음). mock·실패 시 `data/api/radar-screen.json` |
| `look_closer` 한 자리 확대 | 로컬 (`ask-radar.ts`) | 〃 |
| `look_flight_plan` 오늘 통보·허가된 비행 계획 조회 (2단계에서 직접 붙인다) | 로컬 (`ask-radar.ts`) | `data/api/flight-plans.json` — 잠실 드론 쇼는 **신청 없음** |
| (Worker) `searchDocs` 규정집 찾아보기 (RAG) — 모델이 고르는 도구가 아니라 부모 그래프가 항상 돌리는 노드 | 로컬 (`search-docs.ts`) | `data/docs/rulebook.md` |
| `look_weather` 그 장소의 날씨 보기 | **MCP 서버** (`mcp-servers/weather`) | 서버 안에서 **LLM 이 장소·상황에 맞춰 지어냄**. mock·실패 시 규칙표 |

### 보고 4종 (`labs/agent/main.ts` 의 REPORTS)

| # | 보고 | 보는 포인트 |
|---|---|---|
| 1 | 서울 상공 정체불명 둥근 비행체, 무응답 | "서울" 로 레이더를 보면 남산 물체 + 광화문 헬기 두 건 → 확대해서 가려낸다 → Jev 출격 권고 → 사람이 결정. **두 번 돌리면 두 번째엔 기억으로 판단(Jev 생략)** |
| 2 | 한강 위 거대한 오리 풍선, 김포 쪽으로 | 규정집에 "풍선은 감시" 가 있다 |
| 3 | 잠실 상공 드론 수십 대 | 비행 계획(`look_flight_plan`)에 드론 쇼 신청이 없다 → 규정집 "허가 없는 드론 떼는 감시" |
| 4 | 옆 부대 훈련기, 예정 코스 정상 | 별일 아님 |

---

## 3. 실습 순서 — 같이 하나씩 붙이기 (TODO 번호 = 단계 번호)

강사와 함께 한 단계씩 붙이고, 매번 `pnpm agent` 로 다시 돌려 **담당자 화면에 새 줄이 생기는 것**을 확인합니다. 단계별 코드 · 확인 방법은 `docs/exercises.md`.

| 단계 | 같이 붙이는 것 | 파일 (TODO) | 화면에 생기는 것 | 개념 |
|---|---|---|---|---|
| 0 | (없음) 환경 · 구조 · 첫 실행 | — | 보고만 있고 근거가 빈 담당자 화면 | 전체 구조 |
| 1 | 레이더 부하 데려오기 `addNode("askRadar", radarAgent)` | `main.ts` (1) | `[SUB] ┏━ askRadar` 띠, 레이더 · 확대 줄 | Subagent · Agent Loop |
| 2 | 부하에게 새 도구 `look_flight_plan` — 설명 + 실행 | `ask-radar.ts` (2-1 · 2-2) | `[TOOL] look_flight_plan`, 비행 계획 줄 | Tool Calling — 설명이 선택을 정한다 |
| 3 | 규정집 줄마다 점수 매기기 | `search-docs.ts` (3) | 관련 규정 줄 (`pnpm agent 2`) | RAG |
| 4 | 날씨를 MCP 로 — 서버에 등록 + 목록 받기 · 실행 | `server.ts` (4-1) · `mcp.ts` (4-2) | 날씨 줄 (`pnpm mcp:weather` 켜고). 끄면 "날씨 없이 계속" | MCP |
| 5 | 순차를 동시로 + 합류 | `main.ts` (5) | `--watch` 에서 searchDocs · askRadar 가 같이 시작 | Task Decomposition · 병렬 |
| 6 | Jev 에게 묻기 `askJev(…, QUESTIONS)` | `main.ts` (6) | Jev 판정 줄 (확신도 · 위험도 · 정체불명) | 판정 모델 |
| 7 | 사람의 답으로 이어가기 `Command({ resume })` | `main.ts` (7) | "사람이 결정". Ctrl+C → `pnpm agent --resume <번호>` | HITL · Checkpoint |
| 8 | 기억 찾기 · 남기기 | `main.ts` (8-1 · 8-2) | 같은 보고 두 번째엔 "같은 사례 찾음 → Jev 생략" | Context · Memory |

**따라잡기:** `pnpm step 4` → 4단계까지 채워진 상태 (main 의 정답을 가져와 5 부터는 다시 빈칸). `pnpm step 0` 은 처음 상태로. 빈칸이 든 파일만 덮어쓰며, 먼저 묻습니다.

완성 코드로 제공 (설명 · 시연): 도구 실행 루프와 MAX_STEPS 강제 중단(`ask-radar.ts` — 1일차 Loop 그대로, `pnpm agent:limit`), 모델이 늦을 때 사람에게 묻기(`LLM_MOCK_SLOW=1`), 모델 교체, Studio.

---|---|---|---|---|
| 1 | 도구 결과를 모델에게 돌려주기 | `labs/agent/ask-radar.ts` | Agent Loop | `pnpm agent` |
| 2 | 강제 중단은 코드가 | 〃 | Harness | `pnpm agent:limit` |
| 3 | 규정집 줄마다 점수 매기기 | `labs/agent/search-docs.ts` | RAG (찾아서 넣는다) | `pnpm agent 2` |
| 4 | MCP 서버에 `look_weather` 도구 등록 | `mcp-servers/weather/server.ts` | MCP Server | `pnpm mcp:inspect` → `http://localhost:3333/mcp` |
| 5 | MCP 도구 목록 받기 · 실행하기 | `labs/agent/mcp.ts` | MCP Client | `pnpm mcp:weather` + `pnpm agent` |
| 7 | 부하 Agent(서브그래프)를 노드로 꽂기 (`addNode("askRadar", radarAgent)`) | `labs/agent/main.ts` 조립부 | Subagent — LangGraph 에겐 그냥 노드 | `pnpm agent` → 담당자 화면에 레이더 · 확대 · 날씨 줄이 생기면 성공 |
| 8 | 순차를 동시로: `addEdge(START, …)` 두 줄 + 합류 `addEdge([…], "remember")` | 〃 | Task Decomposition · 병렬 실행 | `pnpm agent --watch` → searchDocs 와 askRadar 가 같이 시작하면 성공 |
| 9 | 사람의 답으로 멈춘 곳부터 이어가기 (`Command({ resume })`) | `labs/agent/main.ts` 실행부 | Checkpointer · HITL | `pnpm agent` → Ctrl+C → `pnpm agent --resume <번호>` |

(6 은 비어 있음 — `docs/exercises.md` 의 계획대로 선 잇기 빈칸이 들어갈 자리)

빈칸이 아닌 것 (완성 코드로 제공 · 시연): 장기 기억(`src/lib/memory.ts`), 모델 교체, Studio.

---

## 4. 자주 쓰는 명령

```bash
pnpm mcp:weather             # 날씨 MCP 서버 (http://localhost:3333/mcp)
pnpm mcp:inspect             # MCP Inspector — 화면에서 Streamable HTTP + 위 주소를 넣고 look_weather 를 직접 눌러 본다
pnpm memory:up               # Hindsight 기억 서버를 내 노트북에 띄운다 (uv 필요, 첫 실행 약 200MB) → .env MEMORY_MODE=hindsight
pnpm memory:ui               # Hindsight 대시보드 http://localhost:18888 — retain 된 기억(사실·요약·링크)과 서버 작업을 눈으로 본다 (끄기: pnpm memory:ui:stop)
pnpm memory:reset            # 기억 전부 지우고 처음부터 (현재 MEMORY_MODE 의 저장소 + checkpoints.sqlite). --all 이면 서버 bank 와 파일 둘 다
pnpm agent --watch=full      # 들어간 값·나온 값을 자르지 않고 전부
pnpm graph                   # 그래프를 Mermaid 그림으로 (docs/graphs/)
pnpm typecheck               # 타입 검사
pnpm setup:check             # 환경 점검
```

Claude Code 에 같은 MCP 서버 꽂기: `claude mcp add --transport http weather http://localhost:3333/mcp`

기억 실험: `.hindsight/control-room.json` 을 지우고 보고 1 을 돌리면 "같은 사례 없음 → Jev 에게 묻는다", 한 번 더 돌리면 "기억 판단 … Jev 생략" 으로 Jev 없이 판단합니다. 첫 번째에 출격을 **반려(n)** 하면 두 번째엔 "감시" 로 떠오릅니다 — 사람의 결정이 기억을 고칩니다. `pnpm agent:live` 에서는 remember 노드 아래 기억 카드(그때 보고 · 일치도 · 그때 확신)로 보입니다. Hindsight 모드의 그래프는 `npx @vectorize-io/hindsight-control-plane --api-url http://localhost:8888` (localhost:9999) 에서 그림으로 봅니다.

---

## 5. 모델·판정기·기억 바꾸기 (.env 세 줄)

| 설정 | 기본 (키 없이) | 강사 제공 | 폐쇄망으로 옮길 때 |
|---|---|---|---|
| `LLM_MODE` | `mock` (정해진 답) | `relay` — 강사 Bedrock 주소 + 조별 토큰 | vLLM/Ollama 등 OpenAI 호환 주소 |
| `JEV_MODE` | `local` (규칙 판정기) | `typesafe` — Jev (TypeSafe SDK, `TYPESAFE_API_KEY`) | `src/lib/jev.ts` 의 `localJudge` 자리에 자체 모델 |
| `MEMORY_MODE` | `file` (`.hindsight/*.json`) | `hindsight` — `pnpm memory:up` 또는 강사 서버 주소 | 자체 호스팅 Hindsight |

모델 비교: `LLM_MODE=ollama` + `LLM_BASE_URL=http://localhost:11434/v1` + `LLM_MODEL=qwen3:8b` 로 바꾸면 같은 보고를 노트북 모델로 돌려 봅니다.

실행 기록은 `traces/*.jsonl` 에 남습니다 (Langfuse 특강에서 확장). `.env` 에 `LANGSMITH_TRACING=true` 와 `LANGSMITH_API_KEY` 를 넣으면 같은 실행이 smith.langchain.com 에도 트리(노드 → LLM 호출 · Jev · MCP · 기억)로 올라갑니다. 코드 수정 없이 켜고 끕니다.

---

## 6. 저장소 구조

```
airforce-agentic-ai/
├─ src/lib/                 공용 모듈 — 폐쇄망으로 옮길 때 바꾸는 곳이 전부 여기
│  ├─ llm.ts                 LLM (Bedrock 중계 / Ollama / 클라우드 / mock)
│  ├─ jev.ts                 Jev 판정 모델 (TypeSafe SDK / OpenRouter / 로컬 규칙 판정기)
│  ├─ memory.ts              장기 기억 (Hindsight 서버 / 파일) — createBank · retain · recall · reflect
│  ├─ trace.ts               실행 기록 (traces/*.jsonl)
│  ├─ show.ts                --watch 출력
│  └─ live.ts · live.html    브라우저 실시간 보기 (pnpm agent:live)
├─ labs/agent/
│  ├─ main.ts                부모 그래프 — 보고 → [searchDocs ‖ askRadar] → remember → judge → approve (빈칸 1 · 5 · 6 · 7 · 8)
│  ├─ ask-radar.ts           레이더 부하 Agent(Subagent) — agent ⇄ tools 루프, 늦으면 askHuman, MAX_STEPS 면 stop, 도구 look_flight_plan (빈칸 2)
│  ├─ state.ts               부모 칠판(State). 부하는 여기에 자기 칸(대화)을 더해 쓴다 — 겹치는 칸만 부모로 돌아온다
│  ├─ search-docs.ts         규정집 찾아보기 + Worker 노드 (빈칸 3)
│  └─ mcp.ts                 MCP 서버 접속 → 도구 목록 → 실행 (빈칸 4-2)
├─ mcp-servers/weather/server.ts   날씨 MCP 서버, Streamable HTTP (빈칸 4-1)
├─ data/                     교육용 합성 자료
│  ├─ api/                    레이더 화면(radar-screen.json)
│  └─ docs/rulebook.md        관제 규정 10줄
├─ docs/graphs/              그래프 그림 (pnpm graph)
├─ docs/plan.md · day2-handson.md   구현 계획 · 2일차 핵심 내용
├─ docs/slides/day2.html     2일차 강의 슬라이드 (38장, 브라우저로 열기. ← → 이동, 화면 왼쪽/오른쪽 클릭, O 전체보기) — pnpm slides 로 재생성 (python3)
├─ docs/slides-plan.md       슬라이드 장 단위 계획
├─ checkpoints.sqlite        실행 저장 (LangGraph SqliteSaver, --resume 용. git 에 안 올라감)
├─ .hindsight/               file 모드 기억 (git 에 안 올라감)
├─ traces/                   실행 기록
├─ langgraph.json            LangGraph Studio 설정 (pnpm studio)
└─ tools/                    doctor(환경 점검) · make-handson(빈칸 만들기) · step(따라잡기) · blanks(빈칸 변환 공용) · draw-graph(그림) · memory-up(Hindsight 띄우기) · make-slides(강의 슬라이드)
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
- MCP TypeScript SDK — https://github.com/modelcontextprotocol/typescript-sdk
- Jev / TypeSafe — https://typesafe.ai
- Hindsight (Node 클라이언트 · 로컬 데몬) — https://hindsight.vectorize.io/sdks/nodejs · https://hindsight.vectorize.io/sdks/hindsight-all-npm
- Langfuse — https://langfuse.com/docs
