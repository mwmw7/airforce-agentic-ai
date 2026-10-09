# 2일차 진행 방식 변경 계획 — "같이 하나씩 붙여 가며 키우기"

작성: 2026-10-09 · 상태: **승인 대기** (승인 전에는 코드를 고치지 않는다)

## 0. 무엇이 바뀌나

| | 지금 | 바꾼 뒤 |
|---|---|---|
| 진행 | 빈칸 11개를 개념별로 나눠서 채운다 | 강사와 교육생이 **같이** 한 단계씩 붙이고, 매번 `pnpm agent` 로 다시 돌려 화면에 새 줄이 생기는 것을 확인한다 |
| 출발점 | 대부분 켜진 상태 (Jev · 기억은 항상 켜짐) | **거의 빈 Agent**: 보고 한 줄 → 담당자 화면. 레이더 · 규정 · 날씨 · Jev · 기억 줄이 전부 비어 있다 |
| 빈칸 번호 | 개념 순서 (1~11, 중간중간 빔) | **단계 번호 = TODO 번호** (TODO 1 = 1단계). 강의 중 "지금 몇 번" 이 한 숫자로 통한다 |
| 늦은 사람 | `git diff hands-on main` 으로 정답 보기 | `pnpm step 4` 한 줄이면 4단계까지 채워진 상태로 점프한다 |

## 1. 단계 순서 (오전 2-A, 휴식 빼고 150분)

**레이더 부하(Subagent)를 1단계에 둔다.** 레이더 · 확대 · 날씨 도구가 전부 부하 안에 있으므로, 부하를 먼저 데려와야 그 뒤에 붙이는 도구가 화면에 보인다.
이야기도 자연스럽다. "1일차에 만든 도구 쓰는 Agent, 그걸 오늘은 내 팀의 레이더 담당 부하로 데려온다."

| 단계 | 같이 붙이는 것 | 파일 · 양 | 붙인 뒤 화면에 생기는 것 | 공군 항목 | 시간 |
|---|---|---|---|---|---|
| 0 | (붙이는 것 없음) 환경 · 구조 · 첫 실행 | — | 보고만 있고 근거가 다 빈 담당자 화면 | 개요 · Harness | 20분 |
| 1 | **레이더 부하 데려오기** — 서브그래프를 노드로 꽂기 | `main.ts` 1줄 | `[SUB] ┏━ askRadar` 띠, "레이더" · "확대" 줄 | Subagent · Agent Loop | 15분 |
| 2 | **부하에게 도구 하나 더** — `look_flight_plan` (비행 계획 조회) | `ask-radar.ts` 설명 1줄 + 실행 1줄 | `[TOOL] look_flight_plan`, "비행 계획" 줄 (잠실 드론 쇼 = 신청 없음) | Tool Calling | 15분 |
| — | 휴식 09:50 · 여기까지 못 한 사람은 `pnpm step 2` | | | | |
| 3 | **규정집 찾기** — 규정 한 줄에 점수 매기기 | `search-docs.ts` 3줄 | "관련 규정" 줄 | RAG · 외부 Tool 연계 | 15분 |
| 4 | **날씨를 MCP 로** — 서버에 도구 등록(4-1) + 클라이언트에서 목록 · 실행(4-2) | `server.ts` 5줄 · `mcp.ts` 7줄 | "날씨" 줄. 서버를 끄면 "날씨 없이 계속" | MCP | 25분 |
| 5 | **동시에 모으기** — 순차를 동시로 + 합류 | `main.ts` 3줄 | `--watch` 에서 둘이 같이 시작, `join:searchDocs+askRadar` | Task Decomposition · 병렬 | 15분 |
| — | 휴식 11:00 · `pnpm step 5` | | | | |
| 6 | **Jev 에게 묻기** | `main.ts` judge 1~2줄 | "Jev 판정" 줄 (출격 / 감시 / 무시 + 확신도) | 판정 모델 (플러스알파) | 15분 |
| 7 | **기억 붙이기** — 찾기(remember) + 남기기(approve) | `main.ts` 2곳, 각 1줄 | 같은 보고를 두 번 넣으면 두 번째는 "같은 사례 찾음 → Jev 생략" | Context · Memory | 15분 |
| 8 | **이어가기** — 사람 답으로 멈춘 곳부터 | `main.ts` 1줄 | Ctrl+C → `pnpm agent --resume <번호>` 로 같은 질문에서 이어짐 | HITL · Checkpoint | 15분 |

2-B(70분)는 지금처럼 시연 위주: Prompt Injection(appendix Deev 사례) · 모델 교체(`LLM_MODE`) · 실행 기록(LangSmith) · Jev 질문 문장 바꿔 보기(옛 빈칸 10, 실험으로).

### 빈칸이 아닌 것으로 바뀌는 것

- **옛 빈칸 1 · 2 (도구 실행해서 돌려주기 · MAX_STEPS 강제 중단)** → 완성 코드로 둔다. 1일차에 Loop 로 직접 다루는 내용이라, 1단계에서 "부하 안을 열어 보면 어제 그 루프" 로 보여 주고 `pnpm agent:limit` 시연만 한다
- **옛 빈칸 6 (judge → approve 선 잇기)** → 넣지 않는다 (5단계 동시 수집과 개념이 겹침)

## 2. 코드 변경

### 2-1. 비워 두면 "없는 것처럼" 돌아가는 자리표시 (원칙: 빈칸을 비워도 프로그램은 끝까지 돈다)

| TODO | 비워 둔 상태 (hands-on) | 채운 상태 (main) |
|---|---|---|
| 1 | 가짜 부하: `facts: "(레이더 부하가 아직 없습니다)"` (지금 TODO 7 그대로) | `.addNode("askRadar", radarAgent)` |
| 2 | 도구 설명이 빈 문자열 → 모델이 고르지 않음, 실행은 "미구현" | 설명 + `flight-plans.json` 조회 |
| 3 | 점수 0 → 규정 없음 (지금 TODO 3 그대로) | 겹치는 단어 수 |
| 4-1 · 4-2 | 도구 없음 → "날씨 없이 계속" (지금 TODO 4 · 5 그대로) | registerTool · listTools · callTool |
| 5 | 순차 연결 (지금 TODO 8 그대로) | 동시 + 배열 합류 |
| 6 | **새 빈칸.** Jev 없음 → `{ action: "watch", 확신 0 }` 으로 "일단 감시" (코드 규칙은 그대로 돌아 "Jev 도 헷갈려함 → 사람 확인") | `askJev(…, QUESTIONS)` 한 줄. 질문 세 개는 빈칸 위에 상수로 미리 써 둔다 (빈칸이 15줄을 넘지 않게) |
| 7 | **새 빈칸.** 기억 없음 → remember 는 `memory: null`, approve 는 저장 안 함 | `findSameCase` 한 줄 · `saveCase` 한 줄 |
| 8 | 답을 받고도 이어가지 않음 (지금 TODO 9 그대로) | `Command({ resume })` |

- 옛 TODO 1 · 2 (`ask-radar.ts`) 의 마커를 지우고 완성 코드로 남긴다. 주석의 "TODO 1 · 2" 언급도 정리
- 새 자료 `data/api/flight-plans.json` (교육용 합성 자료): 서쪽 훈련 09~11시 승인 · 광화문 방송 헬기 승인 · 잠실 드론 쇼 신청 없음
- mock 모델은 받은 도구를 순서대로 한 번씩 부르므로 `look_flight_plan` 도 키 없이 호출된다 (확인 필요: 도구 설명이 비었을 때 mock 이 건너뛰게 할지)

### 2-2. `pnpm step <N>` — 따라잡기 (새 파일 `tools/step.mjs`, 40줄 안팎)

- 빈칸이 든 파일마다 `origin/main` 의 완성본을 읽어, **TODO 번호가 N 이하인 칸만 정답을 남기고** 나머지는 빈칸으로 만들어 덮어쓴다
- 변환 로직은 `make-handson.mjs` 의 것을 함수로 빼서 같이 쓴다 (`--keep N` 옵션). 마커 규칙은 그대로
- 덮어쓰기 전에 "지금 고친 내용이 사라집니다" 한 줄 경고, `--yes` 없으면 묻는다
- Windows · Mac 모두 git 명령 하나(`git show origin/main:<경로>`)만 쓴다. 새 의존성 없음

## 3. 문서 · 슬라이드 갱신

| 파일 | 할 일 |
|---|---|
| `tools/make-slides.py` → `docs/slides/day2.html` | 빈칸 슬라이드를 단계 0~8 순서로 재배치, 슬라이드마다 "붙이기 전 / 후" 화면. 옛 빈칸 1·2 슬라이드는 1단계 설명으로 합침 |
| `docs/exercises.md` | 단계표로 다시 씀 (위 1장 표 + 단계별 diff) |
| `docs/day2-handson.md` (권 대위 전달용) | 5장 빈칸 표를 단계표로 |
| `README.md` | 3장 표, `pnpm step` 사용법 |
| `CLAUDE.md` | 3-1 현재 상태 · 6장 대응표의 TODO 번호 |
| `docs/instructor-script.md` (새로) | 단계별: 말할 것 2~3줄 · 같이 칠 코드 · 확인 명령 · 흔한 실수 · 시간이 밀리면 자를 곳 (8장 8번 강사 스크립트를 겸함) |

## 4. 검증

1. main: `pnpm typecheck`, mock 완주 (`LLM_MODE=mock JEV_MODE=local MEMORY_MODE=file`), `pnpm agent 2` 두 번(기억), Ctrl+C 후 `--resume`
2. hands-on 재생성 → typecheck → **0단계 상태 그대로** mock 완주 (빈 화면이지만 끝까지 감)
3. `pnpm step 1` … `pnpm step 8` 을 차례로 돌리며 매번 mock 완주, 화면에 그 단계의 새 줄이 생기는지
4. `pnpm step 8` 결과가 main 과 같은지 (`git diff main -- labs mcp-servers`)
5. 실제 Ollama + 실제 Jev 로 한 번, Windows 노트북에서 `pnpm step` 한 번

## 5. 결정 필요

- (확인) Subagent 를 1단계로 두는 순서
- (확인) 옛 빈칸 1 · 2 를 완성 코드로 돌리는 것
- 2단계 새 도구 이름 `look_flight_plan` · 자료 내용 이대로 갈지
