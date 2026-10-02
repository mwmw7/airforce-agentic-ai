# 다음 단계 구현 계획 — `labs/agent` 에 하나씩 붙이기

작성: 2026-10-02 · 상태: 승인 대기

## 원칙

- 기존 시나리오는 바꾸지 않는다: 보고 4종, `agent ⇄ tools → judge → approve`, 빈칸 1(도구 결과 돌려주기) · 2(강제 중단)
- 단계마다 파일 하나, 빈칸은 개념 하나당 하나(10~15줄), 못 채워도 다음 단계로 진행 가능
- 키·서버 없이도 mock 모드로 끝까지 돈다
- 순서: **RAG → 날씨 MCP(HTTP) → Hindsight → SQLite**
- 단계가 끝날 때마다: `pnpm typecheck`, mock 완주, README 3장 표 · `docs/day2-handson.md` 부록 갱신, hands-on 재생성

## 1. RAG — 규정집 찾아보기 (빈칸 3)

| 항목 | 내용 |
|---|---|
| 붙이는 방식 | 도구 `look_rulebook` 추가. 모델이 "규정집 찾아볼래" 하면 내 코드가 관련 문단을 돌려준다 |
| 자료 | `data/docs/rulebook.md` — 관제 규정 10줄 안팎. 예: "무전 무응답 + 정지 = 출격 검토", "풍선·연·새 떼는 감시", "사전 통보된 훈련·허가된 드론 쇼는 무시" |
| 새 파일 | `labs/agent/search-docs.ts` — `searchDocs(질문): string[]` |
| 검색 방식 | 기본은 임베딩 없음. 질문과 각 줄의 **겹치는 단어 수**로 점수를 매겨 상위 3줄 반환 (Node 기본 기능만, 새 패키지 없음) |
| RAG 정의 (확정) | "모델이 답하기 전에 자료를 **찾아서 넣어 쓰게** 하는 구조"가 RAG 다. 어떻게 찾느냐(키워드 · 벡터)는 정의에 없다. 강의 멘트: "오늘은 구조가 보이게 가장 단순한 검색을 쓴다. 의미로 찾고 싶으면 이 함수 안만 임베딩 검색으로 바꾼다, 바깥은 그대로" |
| 빈칸 3 | 점수 매기기 5줄 |
| 확인 | `pnpm agent 2` (풍선) → 모델이 규정집을 보고 "감시" 쪽 사실을 정리하는지 |

## 2. MCP — 날씨 도구를 HTTP MCP 서버로 (빈칸 4 · 5)

| 항목 | 내용 |
|---|---|
| 붙이는 방식 | 로컬 `look_weather` 를 지우고, 같은 기능을 MCP 서버로 만든 뒤 agent 가 접속해 가져다 쓴다. 레이더 둘(`look_radar` · `look_closer`)은 로컬에 남긴다 |
| 전송 방식 | **Streamable HTTP** (`http://localhost:3333/mcp`). stdio 는 강의에서 한 줄 소개만 |
| 서버 | `mcp-servers/weather/server.ts` — Node `http` + MCP SDK. `data/api/weather.json` 을 읽어 한 줄 돌려줌. **빈칸 4**: `look_weather` 도구 등록 (이름 · 설명 · 입력 스키마 · 실행 함수) |
| 클라이언트 | `labs/agent/mcp.ts` — `connect(주소) → listTools() → callTool()` 세 함수. **빈칸 5**: 목록 받기 · 실행하기 |
| agent 변경 | 도구 목록 = 로컬 2개 + MCP 에서 받은 것. tools 노드는 "MCP 도구면 `callTool`, 아니면 `runTool`" 한 줄 분기 |
| 실행 | **교육생 30명이 각자 자기 노트북에서** 터미널 1 `pnpm mcp:weather` (서버, 켜 둔 채로) → 터미널 2 `pnpm agent`. **자동 실행 없음** |
| 서버 없을 때 | "날씨 서버 연결 실패 — pnpm mcp:weather 를 먼저 켜세요" 한 줄 안내 후 레이더만으로 계속 |
| 설정 | `.env` 에 `MCP_WEATHER_URL=http://localhost:3333/mcp` |
| 점검 | `pnpm mcp:inspect` 로 내 서버의 도구를 눌러 보기 · 서버를 끄면 agent 가 안내 후 레이더만으로 가는지 확인 |
| 의존성 | `@modelcontextprotocol/sdk`, `zod` (입력 스키마) |

## 3. Hindsight — 기억 (빈칸 아님, 완성 코드 · 시연)

| 항목 | 내용 |
|---|---|
| 공식 패턴 | Hindsight 문서의 기본 흐름 `createBank(mission)` → `retain` → `recall` (+ `reflect`) 을 같은 이름으로 `src/lib/memory.ts` 에 둔다 |
| 어디서 | 시작 시 한 번 `createBank("control-room", mission: "관제실 보조. 보고와 결정을 기억한다")` / judge 시작에 `recall(report)` → Jev 에 `past` 로 전달 (`jev.ts` 에 past 처리 있음) / 결정 뒤 `retain("보고 … → 결정 …")` |
| 시연 | 보고 1을 두 번 돌리면 두 번째엔 "어제도 출격"이 떠올라 확신이 올라감. `reflect("최근 서울 상공 보고 경향은?")` 은 강사 한 줄 시연 |
| 로컬 테스트 (Docker 없음) | 공식 패키지 `@vectorize-io/hindsight-all` 이 Hindsight 를 내 노트북에서 작은 데몬으로 띄워 준다 (내장 Postgres 포함, 첫 실행 때 약 200MB 받음). 코드: `new HindsightServer({ profile, port, env }) → start() → getBaseUrl()`. `pnpm memory:up` 명령으로 켜고 끈다 |
| 로컬 테스트 준비물 | `uv` (Python 패키지 도구, 한 줄 설치) + Hindsight 가 쓸 LLM 하나. LLM 은 OpenAI 호환 주소면 되므로 강사 Bedrock 주소(`LLM_BASE_URL`)를 그대로 넘긴다 → 교육생은 Ollama 설치 불필요. Windows · Mac 지원 |
| 서버 없을 때 | `MEMORY_MODE=file` → `.hindsight/control-room.json` 에 같은 모양으로 저장. `uv` 가 없거나 막히면 이걸로 진행 |
| 개발 검증 | 내 노트북에서 `hindsight-all` + Ollama 로 실제 retain · recall · reflect 동작 확인 |
| 의존성 | `@vectorize-io/hindsight-client`, `@vectorize-io/hindsight-all` |

## 4. SQLite — 멈춘 곳부터 이어가기 (빈칸 6)

| 항목 | 내용 |
|---|---|
| 공식 패턴 (플랫폼 통합) | 직접 SQL 을 쓰지 않는다. LangGraph 가 제공하는 체크포인터 `SqliteSaver`(`@langchain/langgraph-checkpoint-sqlite`) 를 `compile({ checkpointer })` 에 꽂으면 저장 · 복구를 LangGraph 가 전부 처리한다. 코드는 `MemorySaver` → `SqliteSaver.fromConnString("checkpoints.sqlite")` 한 줄 교체 |
| 재개 | approve 에서 y/n 묻는 중 Ctrl+C → `pnpm agent --resume <실행번호>` → 같은 `thread_id` 로 `Command({ resume: 답 })` |
| 빈칸 6 | resume 부분 (`Command({ resume })`) |
| 의존성 | `@langchain/langgraph-checkpoint-sqlite` (prebuilt 바이너리, Windows · Mac 확인됨) |
| 확인 | `checkpoints.sqlite` 파일이 생기고, 재개 후 approve 에서 이어지는지. 한 번 저장된 실행은 `pnpm agent --resume` 으로 며칠 뒤에도 이어진다 |
| 참고 | LangGraph Studio 는 자체 저장소를 쓰므로 영향 없음 |

## 빈칸 번호 정리

| 번호 | 내용 | 파일 |
|---|---|---|
| 1 | 도구 결과를 모델에게 돌려주기 | `labs/agent/main.ts` (기존) |
| 2 | 강제 중단은 코드가 | 〃 (기존) |
| 3 | 규정집 점수 매기기 | `labs/agent/search-docs.ts` |
| 4 | MCP 서버에 `look_weather` 등록 | `mcp-servers/weather/server.ts` |
| 5 | MCP 도구 목록 받기 · 실행하기 | `labs/agent/mcp.ts` |
| 6 | `Command({ resume })` 로 이어가기 | `labs/agent/main.ts` |

## 결정된 것 (2026-10-02)

- Jev 는 TypeSafe 공식 SDK 직접 호출 (`JEV_MODE=typesafe`, 완료 · 커밋 4e4dae6)
- MCP 는 날씨 도구만, HTTP 전송, 서버 자동 실행 없음, 교육생 각자 로컬에서 실행
- Hindsight 는 공식 패턴(createBank · retain · recall · reflect) 그대로, 로컬은 `hindsight-all` 데몬(Docker 없음), 안 되면 file 모드
- SQLite 는 LangGraph 공식 체크포인터 `SqliteSaver` 로 플랫폼 통합 (직접 SQL 없음)
- RAG 임베딩 시연은 하지 않음
- Langfuse · 채점표 · Prompt Injection 은 이 계획 범위 밖

## 내가 (강사가) 해 줄 것

- 지금: "시작" 한마디
- 나중: 규정집 10줄 초안 검토 · 교육생 사전 안내문에 `uv` 설치 한 줄 추가 여부 결정
