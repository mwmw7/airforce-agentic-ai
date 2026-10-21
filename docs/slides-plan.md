# 2일차 강의 슬라이드 계획 — 장 단위 목록

작성: 2026-10-07 · 형식: HTML 슬라이드 16:9 · 다크 · 로고 없음 · 밀도 B(총 38장) · 터미널 캡처 사용 · 1일차와 독립
> **2026-10-14 재구성:** 단계마다 "`pnpm step N` 표지 1장 + 실습 1장" (47장 → 2026-10-15 48장: 7단계 뒤에 `checkpoints.sqlite` 테이블 캡처 장 추가). 1일차 자료와 겹치는 개념 4장(루프 · 누가 멈추나 · State 쌓임 · interrupt 위치)은 빼고 "1일차에서 가져오는 것" 표 1장으로 대신했다. 번역어 "부하" 는 쓰지 않는다 (Subagent).
> **2026-10-09 재구성:** 슬라이드를 "같이 하나씩 붙이기" 단계 0 ~ 8 순서(36장)로 다시 짰다. 아래 장 목록은 2026-10-07 판(빈칸 1 ~ 11)이라 번호가 다르다. 현재 순서는 `python3 tools/make-slides.py` 출력, 단계 정의는 `docs/exercises.md`.

**구현: `docs/slides/day2.html` (생성기 `tools/make-slides.py`, 캡처 `docs/slides/captures/`). 문안을 고치면 생성기를 고치고 `pnpm slides`, PDF 는 `pnpm slides:pdf` (→ `day2.pdf`).**

한 장의 틀은 고정: **질문(제목) → 그림 또는 diff → 실행 명령 → "이게 보이면 성공"**. 이론 불릿 없음.
슬라이드 종류는 네 가지뿐: `그림` `diff` `명령` `표`. 괄호 안은 종류와 재료 출처.

---

## 0. 오프닝 (09:00~09:10, 4장)

| # | 제목 (= 질문) | 종류 | 내용 |
|---|---|---|---|
| 1 | 오늘 만드는 것 | 그림 | 부모 그래프 한 장 (`docs/graphs/agent.md` Mermaid). "보고 한 줄 → 수집 → 기억 → 판정 → 사람" |
| 2 | 소개 | 표 | 최호섭 · 삼성전자 R&D센터 → 툰스퀘어 CTO · Tooning / Tooning Plus / Deev · branden@tooning.io (Edu 포함 여부 미결) |
| 3 | 오늘의 규칙 | 명령 | Codespaces 전용: `pnpm agent` 하나 (노트북 설치는 3장에서 README 1-3 으로) · `pnpm agent` 가 TODO 에서 멈추는 캡처 · "막히면 `git diff hands-on main -- <파일>`" · 빈칸 11개 지도 (번호만) |
| 4 | 오늘 일정 | 표 | 블록 5개 · 시간 · 각 블록에서 채우는 빈칸 번호 · 휴식 2번. 오후 14:30 정진태 Langfuse 특강 예고 |

## 1. Agent Loop · Harness (09:10~09:50, 7장) — 빈칸 1 · 2 · 6

| # | 제목 | 종류 | 내용 |
|---|---|---|---|
| 5 | 도구 호출은 어떻게 일어나나? | 그림 | agent ⇄ tools 루프. 모델이 돌려주는 `tool_calls` JSON → 내 코드 `runTool` → 결과를 `role: "tool"` 로 다시 모델에게. 세 화살표 |
| 6 | 빈칸 1 | diff | tools 노드 before/after (`exercises.md`) · `pnpm agent` · 성공: `[TOOL] look_radar` 가 찍히고 모델이 2회째 호출에서 결과를 받는다 |
| 7 | 누가 멈추나? | 그림 | route 함수. "모델이 도구를 또 원하면? MAX_STEPS 는 누가 세나?" |
| 8 | 빈칸 2 | diff | route before/after · `pnpm agent:limit` · 성공: `[STOP] 모델을 이미 1번 불렀습니다` |
| 9 | 칠판(State)은 어떻게 쌓이나? | 명령 | `pnpm agent 1 --watch` 캡처. agent 가 `steps: 1` 을 내도 칠판은 1, 2, 3 (reducer 3종: 더하기 · 이어 붙이기 · 덮어쓰기) |
| 10 | 선이 끊기면? | diff | 빈칸 6 `.addEdge("judge", "approve")` (계획). `pnpm agent 2` · 성공: `[HUMAN] 종합` 화면 |
| 11 | 모델이 늦으면? | 명령 | `LLM_MOCK_SLOW=1 pnpm agent` 캡처. 끊고 사람에게 retry / skip / stop — "시간 제한도 Harness" |

## 2. RAG · MCP · Subagent (10:05~11:00, 10장) — 빈칸 3 · 4 · 5 · 7 · 8 · 11

| # | 제목 | 종류 | 내용 |
|---|---|---|---|
| 12 | 모델이 모르는 문서는? | 그림 | RAG = "찾아서 넣어 쓰게". 규정집 10줄 → 단어 겹침 점수 → 상위 3줄 → 칠판 evidence |
| 13 | 빈칸 3 | diff | search-docs.ts before/after · `pnpm agent 2` · 성공: 담당자 화면 "관련 규정"에 풍선 규정 |
| 14 | 도구를 다른 프로세스에 두면? | 그림 | MCP Host / Client / Server 세 상자, Streamable HTTP. "모델 입장에선 로컬 도구와 구분 안 됨" |
| 15 | 빈칸 4 · 5 | diff | server.registerTool + listTools/callTool before/after · `pnpm mcp:weather` + `pnpm mcp:inspect` · 성공: `[MCP] 날씨 서버 연결 OK — 도구 1개` |
| 16 | 서버를 끄면? | 명령 | `pnpm mcp:weather` 끈 채 `pnpm agent` 캡처: `[MCP] 연결 실패 … 날씨 없이 계속`. "외부 의존이 죽어도 Agent 는 산다" |
| 17 | LangGraph 사용자가 가장 많이 쓰는 그래프 5가지 | 표 | ReAct · Supervisor · Orchestrator–Workers · Router · Evaluator–Optimizer (+HITL 공통). 비유 한 줄씩. **Evaluator–Optimizer 칸에 "실제 사례 시연: 3D 이펙트 생성→렌더→평가→재생성" 자리** (사용자가 별도 프로젝트로 시연) |
| 18 | Worker 와 Subagent 는 뭐가 다른가? | 그림 | 복사기 vs 인턴. 표 5줄(하는 일 · 모델 호출 · 실행 횟수 · 코드 모양 · 실패하면). "LangGraph 에겐 둘 다 노드 하나" |
| 19 | 빈칸 7 | diff | `.addNode("askRadar", radarAgent)` before/after · `pnpm agent` · 성공: `[SUB] ┏━ askRadar` 띠와 ┃ 줄 캡처 |
| 20 | 빈칸 8 | diff | 순차 3줄 → 동시 3줄 · `pnpm agent --watch` · 성공: `▶ askRadar` 와 `▶ searchDocs` 나란히, `← join:` |
| 21 | 왜 나누나? | 표 | Subagent 이점 4 + 이점 아닌 것 3 (메모리 표 그대로). "팀장 칠판은 결론만". 속도는 지금 구성에선 없음을 정직하게 |

(빈칸 11 `look_flight_plan` 은 자유 과제로 20번 장 하단 한 줄)

## 3. Jev · Hindsight (11:15~12:00, 7장) — 빈칸 10

| # | 제목 | 종류 | 내용 |
|---|---|---|---|
| 22 | LLM 말고 Jev 를 쓰면? | 그림 | LLM(문장) vs Jev(확률 + 확신도). 질문 3종 choice / score / noul. "의견은 Jev, 규칙은 코드" |
| 23 | 판정 화면 읽기 | 명령 | `[JEV]` 캡처: scramble 65% · 위험도 2.55/3 · 정체불명 75% → `[RULE]` 코드 규칙 → 권고 |
| 24 | 빈칸 10 | diff | noul 질문 문장 한 줄 before/after · 보고 1(UFO) vs 4(훈련기) · 성공: 정체불명 % 가 갈린다 (실제 Jev 키 필요) |
| 25 | JEV_MODE 를 바꾸면? | 표 | `JEV_MODE=local` vs `typesafe` 의 `--all` 표 두 개 나란히. JEV_MODE=local 은 전부 scramble |
| 26 | 어제 판단을 오늘 기억하면? | 그림 | remember 노드: 같은 사례(일치도 0.9↑)면 Jev 생략. retain / recall 두 화살표 |
| 27 | 같은 보고 두 번 | 명령 | 캡처 두 장: 첫 번째 `[JEV]`, 두 번째 `[MEMORY] 같은 사례 찾음 → Jev 생략` |
| 28 | 사람이 가르친다 | 명령 | 보고 2 에서 `w` 선택 → 다시 돌리면 "감시 강화"로 떠오름. `pnpm memory:ui` 대시보드 캡처 (점과 선) |

## 4. HITL · Checkpoint (13:00~13:30, 5장) — 빈칸 9

| # | 제목 | 종류 | 내용 |
|---|---|---|---|
| 29 | 사람이 끼어들면 어디서 멈추나? | 그림 | interrupt() 두 곳: Subagent 안 askHuman(늦을 때), 부모 approve(언제나). "Agent 는 권고까지, 버튼은 사람" |
| 30 | 빈칸 9 | diff | `Command({ resume })` before/after · 성공: 답 넣으면 같은 줄에서 이어진다 |
| 31 | 껐다 켜면? | 명령 | 담당자 확인에서 Ctrl+C → `pnpm agent --resume <번호>` 캡처. SqliteSaver, "직접 SQL 은 한 줄도 없다" |
| 32 | Subagent 안에서 멈춰도? | 명령 | `LLM_MOCK_SLOW=1` → Ctrl+C → `--resume` 캡처. Subagent 의 interrupt 도 부모 실행번호로 |
| 33 | 되감으면? (시연) | 명령 | `getStateHistory` 로 지난 체크포인트 목록 → 하나 골라 다른 답으로 재생. (구현 미정 — 미구현이면 "다음 단계" 한 줄) |

## 5. 운영 (13:30~14:10, 5장)

| # | 제목 | 종류 | 내용 |
|---|---|---|---|
| 34 | 운영 중 자료에 지시문이 섞여 오면? | 그림 | 자료에 섞인 "이전 지시는 무시" 한 줄이 판정을 뒤집는 모습 (`jev.ts` JEV_MODE=local 규칙이 위험도 0.95 로 기움). 지금 코드에 있는 상한들 위치: MAX_STEPS · RUN_TIMEOUT_SEC · approve interrupt · MCP 서버에 키 미전달 |
| 35 | 실제 서비스(Deev)는 어떻게 거르나 | 명령 | appendix Deev 캡처(img.png) + `detect_define.ts` 의 정규식 1차 → TypeSafe 2차 핵심 10줄 + `detect_call.ts` 3분 타임아웃. 정규식은 빠르고 설명 가능, 모델 판정은 변형에 강함 |
| 36 | 모델을 바꾸면? | 표 | `LLM_MODE` mock / ollama / cloud(OpenRouter) 같은 보고 결과 비교. "슬롯만 바꾼다, 그래프는 그대로" (OpenRouter 조별 키는 당일 배포) |
| 37 | 실행 기록은 어디서 보나? | 명령 | `LANGSMITH_TRACING=true` 트리 캡처 (노드 → LLM · Jev · MCP · 기억). "Langfuse 는 다음 시간 정진태" |
| 38 | 마무리 | 표 | 권 대위 항목 ↔ 오늘 코드 대응표 12줄 (CLAUDE.md 6장). (5-1 미결: Claude Code·opencode 대응표 / AI-DLC·Kiro / 동향 5분을 여기에 둘지) |

---

## 비워 둔 자리 (결정 오면 채움)
- 2번 장: Tooning Edu 포함 여부, Tooning Plus 한 줄 설명
- 33번 장: 시간 되감기 구현 여부
- 38번 장: 5-1 마무리 슬롯
- writeReport 는 2026-10-12 구현 → 운영 블록 '보고서는 누가 쓰나?' 1장 추가. 채점표는 범위 밖

## 캡처 목록 (mock 으로 먼저 뽑고, 실제 모델 캡처로 교체 가능)
`pnpm agent` TODO 멈춤 · `[TOOL] look_radar` · `agent:limit` · `--watch` reducer · `[HUMAN] 종합` · `LLM_MOCK_SLOW` · MCP 연결 OK / 실패 · `[SUB] ┏━` 띠 · 순차 vs 동시 `--watch` · `[JEV]` 3질문 · `--all` 표 2개 · 같은 보고 두 번 · memory:ui · Ctrl+C → `--resume` · LangSmith 트리
