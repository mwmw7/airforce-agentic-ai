# 공군 AI센터 · Agentic AI 설계·구현 실무 — 핸즈온 저장소

2026. 10. 29(목) ~ 30(금) · TypeScript · LangGraph.js · MCP · Jev · Hindsight

> 이 저장소의 모든 데이터(항적·지침·사건·기상·전력)는 **교육용 합성 자료**이며 실제 공역·부대·기종·규정과 무관합니다.
> Agent 는 **권고**까지만 수행하고, 결정은 항상 사람이 합니다.

---

## 0. 브랜치 안내 — 먼저 읽어 주세요

| 브랜치 | 용도 | 누가 |
|---|---|---|
| `main` | **완성본.** 모든 코드가 채워진 정답 · 개발 브랜치 | 강사 · 막힌 교육생 |
| `hands-on` | **핸즈온용.** `main` 과 같지만 핵심 구간 17곳이 비어 있고 주석으로 할 일이 적혀 있음 (`✏️ 여기에 코드를 작성하세요`) | 교육생 |

교육생은 `hands-on` 브랜치에서 실습합니다. 막히면 정답을 보세요. 파일 경로가 같으니 `git diff hands-on main -- <파일>` 로 내 코드와 정답을 나란히 비교할 수 있습니다.

```bash
git diff hands-on main -- labs/lab2-scramble/nodes/triage.ts
```

빈칸 목록은 `pnpm instructor:make-handson --check` 로 언제든 볼 수 있습니다.

---

## 1. 5분 시작 가이드

### 1-1. 준비물 (교육 1주 전에 미리)

| 필수 | 선택 |
|---|---|
| Node.js **22 LTS** 이상 (`node -v`) | Ollama + `ollama pull qwen3:8b` (모델 교체 실습) |
| git, VS Code | Docker Desktop (Hindsight 메모리 서버) |
| 강사가 나눠주는 조별 토큰 (`.env` 에 입력) | Claude Code (MCP 서버를 꽂아 보는 시연) |

### 1-2. 설치

```bash
git clone https://github.com/mwmw7/airforce-agentic-ai.git
cd airforce-agentic-ai
git checkout hands-on        # 실습용 브랜치 (빈칸 버전)
corepack enable && corepack prepare pnpm@12.6.0 --activate   # pnpm 이 없다면 (Node 22 내장 corepack)
pnpm install                 # 현장 네트워크 부하를 피하려면 미리 해 두세요
cp .env.example .env        # 토큰은 당일 강사가 배포. 없어도 mock/local 모드로 전부 실행됩니다
pnpm setup:check              # 환경 점검
```

`pnpm setup:check` 결과에 ❌ 가 없으면 준비 완료입니다. ⚠️ 는 "네트워크 없이 도는 대체 모드" 라는 뜻이라 실습에는 지장이 없습니다.

### 1-3. 첫 실행

```bash
pnpm loop:run                   # [실습 0] LangGraph 로 만든 가장 작은 Agent 루프
pnpm loop:limit                 # 호출 한도 1 로 강제 중단 — 중단 사유가 '코드' 에서 나오는지 확인
pnpm scramble:run --scenario 1  # [실습 2] 스크램블 판단 보조 Agent (승인 프롬프트에서 y/n)
```

`hands-on` 브랜치에서는 빈칸 때문에 `loop:run` · `scramble:run` 이 "TODO … 미구현" 안내와 함께 멈춥니다. 그게 정상이며, 실습 순서대로 빈칸을 채우면 한 단계씩 살아납니다.

### 1-4. 명령 이름 읽는 법

명령은 **`주제:동작`** 규칙입니다. `loop` = 실습 0, `scramble` = 실습 2 로 기억하면 됩니다. 전체 목록은 `pnpm run` 으로 볼 수 있습니다.

| 접두사 | 실습 | 한 줄 요약 |
|---|---|---|
| `loop:*` | [실습 0] Agent 루프 (`labs/lab0-loop/`) | LangGraph 노드 2개(agent · tools)로 **Agent 원리** 확인 |
| `scramble:*` | [실습 2] 스크램블 판단 보조 Agent (`labs/lab2-scramble/`) | 자료 수집 → 판정 → 승인 → 보고서의 **실무형 워크플로** |
| `setup:*` · `typecheck` | 공통 | 환경 점검 · 타입 검사 |
| `instructor:*` | 강사용 | 교육생은 쓰지 않음 |

**`loop`(실습 0) 과 `scramble`(실습 2) 의 차이**

| | `loop` (실습 0) | `scramble` (실습 2) |
|---|---|---|
| 목적 | 개념 이해 — "Agent = LLM + 도구 + 루프" | 실무 설계 — 여러 단계로 된 판단 워크플로 |
| 코드 | 파일 1개 (`agent.ts`) | `state` · `sources` · `nodes` · `graph` · `run` 5개 |
| 그래프 | agent ⇄ tools 반복 (조건부 엣지) | 병렬 수집 → 판정 → 승인 → 보고서 (한 줄 흐름) |
| 도구 호출 | 모델이 고른 도구를 tools 노드가 실행 | RAG · 웹 검색 · MCP 서버를 코드가 병렬 호출 |
| 핵심 개념 | State · Node · Edge · Tool Calling · Harness (`MAX_STEPS`) | 병렬 실행(fan-out/in) · RAG · MCP · Jev 판정 · 사람 승인(HITL) · 로컬 LLM |
| 빈칸 (`hands-on`) | 2개 (0-2, 0-3) | 7개 (2-1 ~ 2-7) |

| 명령 | 하는 일 |
|---|---|
| `loop:run ["질문"]` | Agent 루프 실행 (정상 종료). 질문을 인자로 바꿔 볼 수 있음 |
| `loop:limit` | 호출 한도 1 로 강제 중단 — 중단 사유가 '코드' 에서 나오는지 확인 |
| `scramble:run --scenario N` | 시나리오 N(1~5) 실행, 승인 프롬프트에서 y/n (`--yes` 면 자동 승인) |
| `scramble:mcp` | 레이더 MCP 서버만 단독 실행 |
| `scramble:inspect` | MCP Inspector 로 서버 도구 직접 호출 |

---

## 2. 저장소 구조

```
airforce-agentic-ai/
├─ src/lib/                 공용 모듈 — 폐쇄망 이관 시 교체하는 곳이 전부 여기
│  ├─ llm.ts                 ① LLM (OpenAI 호환) — 메인: 중계 / Ollama / 클라우드 / mock, 로컬: Ollama / mock
│  ├─ jev.ts                 ② Jev 판정 모델 (OpenRouter Decisions API / 로컬 규칙 판정기)
│  ├─ memory.ts              ③ 장기 메모리 (Hindsight 서버 / 파일) — 현재 실습에서는 사용하지 않음
│  └─ trace.ts               ④ 트레이서 (traces/*.jsonl → 강의 5 에서 Langfuse)
├─ labs/
│  ├─ lab0-loop/             [실습 0] LangGraph Agent 루프 (agent ⇄ tools)          (1일차)
│  └─ lab2-scramble/         [실습 2] 스크램블 판단 보조 Agent                      (2일차)
│     ├─ state.ts             공유 State (evidence 누적 reducer)
│     ├─ sources.ts           자료 수집 3종 — RAG(지침·사건) · 웹 검색 · MCP(레이더)
│     ├─ nodes.ts             rag / web / mcp → judge(Jev) → approve(interrupt) → report(로컬 LLM)
│     ├─ graph.ts             노드·엣지 조립
│     └─ run.ts               실행기 (승인 프롬프트 → Command resume)
├─ mcp-servers/scramble-radar/  더미 항적 DB MCP 서버 (stdio)
├─ data/                     교육용 합성 자료
│  ├─ alerts/                 시나리오 5개
│  ├─ doctrine/               지침 v1(구) · v2(신) · v3-draft(미승인) — RAG 는 v2 만 색인
│  ├─ incidents/              과거 사건 보고서 5건
│  ├─ web/                    가상 웹 검색 결과 (TAVILY_API_KEY 없을 때)
│  └─ api/                    tracks · weather · assets
├─ reports/                  Agent 가 저장하는 보고서
├─ traces/                   실행 트레이스 (jsonl)
└─ tools/                    doctor(환경 점검) · make-handson(빈칸 생성)
```

---

## 3. 실습 순서 ↔ 빈칸 (TODO) 대응표

`hands-on` 브랜치에서 아래 순서대로 채웁니다. 각 TODO 위에는 무엇을 왜 하는지 주석이 있습니다.

| 단계 | TODO | 파일 | 확인 명령 | 핵심 개념 |
|---|---|---|---|---|
| 0-2 | 도구 실행 결과를 tool 메시지로 돌려주기 | `labs/lab0-loop/agent.ts` | `pnpm loop:run` | Node · Tool Calling |
| 0-3 | 강제 중단은 Harness 가 | 〃 | `pnpm loop:limit` | 조건부 Edge · Harness |
| 2-1 | evidence 누적 reducer | `state.ts` | — | State · Reducer |
| 2-2 | MCP 도구 `get_track` 등록 | `mcp-servers/scramble-radar/server.ts` | `pnpm scramble:inspect` | MCP Server |
| 2-3 | 병렬 수집 → 판정 → 승인 → 보고서 엣지 | `graph.ts` | `pnpm scramble:run --yes` | fan-out / fan-in |
| 2-4 | Jev 판정 질문 (choice) | `nodes.ts` | 〃 | 판정 모델 · Type-Safe 출력 |
| 2-5 | `interrupt()` 승인 대기 | `nodes.ts` | `pnpm scramble:run` | Human-in-the-Loop |
| 2-6 | 로컬 LLM 보고서 작성 | `nodes.ts` | `LOCAL_LLM_MODE=ollama` 로 실행 | 로컬 LLM · 사실은 코드가, 문장은 LLM 이 |
| 2-7 | `Command({ resume })` 로 이어가기 | `run.ts` | `pnpm scramble:run` | Checkpointer · 재개 |

### 그래프 한눈에

```
[실습 0] loop                              [실습 2] scramble

START ─▶ agent ─┬─▶ tools ─▶ agent …                  ┌─▶ rag ─┐
                ├─▶ END (최종 답변)          START ───┼─▶ web ─┼─▶ judge ─▶ approve ─▶ report ─▶ END
                └─▶ stop ─▶ END (MAX_STEPS)           └─▶ mcp ─┘   (Jev)    (사람 y/n)  (로컬 LLM)
```

### 시나리오

| # | 알림 | 기대 권고 |
|---|---|---|
| 1 | IFF 무응답 + ADIZ 진입 + 내륙 진로 | 출격 (scramble) |
| 2 | IFF 정상, 국제 항로 8nm 이탈 | 감시 강화 (monitor) |
| 3 | 저고도 저속, 응답기 상태 불명 | 감시 강화 (monitor) |
| 4 | IFF 무응답, 2분 내 진입 예상 | 출격 (scramble) |
| 5 | IFF 무응답 편대 2기 동시 진입 임박 | 출격 (scramble) |

---

## 4. 자주 쓰는 명령

```bash
pnpm typecheck                          # 타입 검사
pnpm scramble:run --scenario 2          # IFF 정상 민항기 — Jev 가 감시 강화를 권고하는지
pnpm scramble:run --yes                 # 승인 자동 (반복 테스트용)
LOCAL_LLM_MODE=ollama pnpm scramble:run # 보고서를 로컬 LLM(Ollama) 으로 작성
pnpm scramble:inspect                   # MCP Inspector 로 서버 도구 직접 호출해 보기
cat traces/<run>.jsonl | jq .           # 트레이스 읽기 (jq 없으면 그냥 cat)
```

Claude Code 에 같은 MCP 서버 꽂기:

```bash
claude mcp add radar -- pnpm exec tsx mcp-servers/scramble-radar/server.ts
```

---

## 5. 모델·판정기·메모리 바꾸기 (.env 세 줄)

| 대상 | 기본 (강사 제공) | 노트북 로컬 | 폐쇄망 이관 시 |
|---|---|---|---|
| 메인 LLM (loop) | `LLM_MODE=relay` Bedrock 중계 API | `LLM_MODE=ollama`, `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen3:8b` | vLLM/Ollama 등 OpenAI 호환 엔드포인트 |
| 로컬 LLM (scramble 보고서) | `LOCAL_LLM_MODE=mock` (템플릿) | `LOCAL_LLM_MODE=ollama`, `LOCAL_LLM_MODEL=qwen3:8b` | 〃 |
| 웹 검색 (scramble) | 가상 결과 (`data/web/`) | `TAVILY_API_KEY` 를 넣으면 실제 검색 | 내부 검색 API 로 `searchWeb` 교체 |
| 판정기 | `JEV_MODE=openrouter` (Jev) | `JEV_MODE=local` (규칙 판정기) | `src/lib/jev.ts` 의 `localJudge` 자리에 자체 분류 모델 |
| 메모리 | `MEMORY_MODE=hindsight` (docker) | `MEMORY_MODE=file` | 자체 호스팅 Hindsight |
| 트레이스 | `traces/*.jsonl` | 〃 | 자체 호스팅 Langfuse (강의 5) |

키가 하나도 없을 때의 조합 `LLM_MODE=mock · LOCAL_LLM_MODE=mock · JEV_MODE=local` 로도 두 실습의 그래프 흐름·승인·보고서가 전부 돌아갑니다.

Hindsight 서버 (선택):

```bash
docker run -p 8888:8888 vectorize/hindsight     # 이미지 이름·옵션은 https://hindsight.vectorize.io 최신 문서 확인
# .env → MEMORY_MODE=hindsight
```

---

## 6. 강사용 — 두 브랜치 관리

모든 작업은 `main` (완성본) 에서 하고, `hands-on` 은 스크립트로 생성합니다.

```bash
git checkout main
# … 코드 수정 …
git commit -am "fix: …" && git push

git checkout hands-on
git checkout main -- .                # main 트리를 그대로 가져온 뒤
node tools/make-handson.mjs           # 마커 기준으로 빈칸 생성
git commit -am "handson: regenerate from main" && git push
```

`main` 에서 파일을 삭제·이동했다면 `hands-on` 에서도 같은 파일을 `git rm` 해 주세요 (`git checkout main -- .` 은 삭제를 옮기지 않습니다).

마커 규칙은 `tools/make-handson.mjs` 상단 주석 참고 (`// ===== TODO x-y: … =====` / `// ----- SOLUTION -----` / `//!` 자리표시자 / `// ----- END SOLUTION -----`).

---

## 7. 참고 링크

- LangGraph.js — https://langchain-ai.github.io/langgraphjs/
- MCP TypeScript SDK — https://github.com/modelcontextprotocol/typescript-sdk
- Jev / OpenRouter Decisions API — https://openrouter.ai/docs/guides/community/jev-tutorial
- Hindsight (Node 클라이언트) — https://hindsight.vectorize.io/sdks/nodejs
- Langfuse — https://langfuse.com/docs
