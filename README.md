# 공군 AI센터 · Agentic AI 설계·구현 실무 — 핸즈온 저장소

2026. 10. 29(목) ~ 30(금) · TypeScript · LangGraph.js · MCP · Jev · Hindsight

> 이 저장소의 모든 데이터(항적·지침·사건·기상·전력)는 **교육용 합성 자료**이며 실제 공역·부대·기종·규정과 무관합니다.
> Agent 는 **권고**까지만 수행하고, 결정은 항상 사람이 합니다.

---

## 0. 브랜치 안내 — 먼저 읽어 주세요

| 브랜치 | 용도 | 누가 |
|---|---|---|
| `main` | **핸즈온용.** 핵심 구간 17곳이 비어 있고 주석으로 할 일이 적혀 있음 (`✏️ 여기에 코드를 작성하세요`) | 교육생 |
| `solution` | **완성본.** 모든 빈칸이 채워진 정답 코드 | 강사 · 막힌 교육생 |

막히면 정답을 보세요. 파일 경로가 같으니 `git diff main solution -- <파일>` 로 내 코드와 정답을 나란히 비교할 수 있습니다.

```bash
git diff main solution -- labs/lab2-scramble/nodes/triage.ts
```

빈칸 목록은 `pnpm make:handson --check` 로 언제든 볼 수 있습니다.

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
corepack enable && corepack prepare pnpm@12.6.0 --activate   # pnpm 이 없다면 (Node 22 내장 corepack)
pnpm install                 # 현장 네트워크 부하를 피하려면 미리 해 두세요
cp .env.example .env        # 토큰은 당일 강사가 배포. 없어도 mock/local 모드로 전부 실행됩니다
pnpm run doctor              # 환경 점검
```

`pnpm run doctor` 결과에 ❌ 가 없으면 준비 완료입니다. ⚠️ 는 "네트워크 없이 도는 대체 모드" 라는 뜻이라 실습에는 지장이 없습니다.

### 1-3. 첫 실행

```bash
pnpm lab0                       # [실습 0] 50줄짜리 순수 Agent 루프
pnpm lab0:limit                 # 호출 한도 1 로 강제 중단 — 중단 사유가 '코드' 에서 나오는지 확인
pnpm lab2 --scenario 1       # [실습 2] 스크램블 판단 보조 Agent (승인 프롬프트에서 y/n)
```

`main` 브랜치에서는 빈칸 때문에 `lab2` 가 triage 노드만 돌고 끝납니다. 그게 정상이며, 실습 순서대로 빈칸을 채우면 한 노드씩 살아납니다.

---

## 2. 저장소 구조

```
airforce-agentic-ai/
├─ src/lib/                 공용 모듈 — 폐쇄망 이관 시 교체하는 4곳이 전부 여기
│  ├─ llm.ts                 ① 메인 LLM (OpenAI 호환: Bedrock 중계 / Ollama / 클라우드 / mock)
│  ├─ jev.ts                 ② Jev 판정 모델 (OpenRouter Decisions API / 로컬 규칙 판정기)
│  ├─ memory.ts              ③ 장기 메모리 (Hindsight 서버 / 파일)
│  └─ trace.ts               ④ 트레이서 (traces/*.jsonl → 강의 5 에서 Langfuse)
├─ labs/
│  ├─ lab0-pure-loop/        [실습 0] 프레임워크 없는 while 루프 Agent          (1일차)
│  └─ lab2-scramble/         [실습 2] 스크램블 판단 보조 Agent — LangGraph.js   (2일차)
│     ├─ state.ts             공유 State (reducer)
│     ├─ graph.ts             노드·엣지 조립
│     ├─ nodes/               triage → investigate(Send×4) → synthesize → decide → guardrail → approve → report
│     ├─ tools.ts             doctrine RAG · 사건 파일 검색 · HTTP mock
│     ├─ run.ts               실행기 (interrupt / SQLite 재개)
│     └─ evaluate.ts          시나리오 5개 × N회 일치율
├─ mcp-servers/scramble-radar/  더미 항적 DB MCP 서버 (stdio)
├─ data/                     교육용 합성 자료
│  ├─ alerts/                 시나리오 5개 + answers.json (정답표)
│  ├─ doctrine/               지침 v1(구) · v2(신) · v3-draft(미승인, 악성 지시 포함)
│  ├─ incidents/              과거 사건 보고서 5건
│  └─ api/                    tracks · weather · assets
├─ reports/                  Agent 가 저장하는 보고서 (승인된 것만) · 평가 결과
├─ traces/                   실행 트레이스 (jsonl)
└─ tools/                    doctor(환경 점검) · make-handson(빈칸 생성)
```

---

## 3. 2일차 실습 순서 ↔ 빈칸 (TODO) 대응표

`main` 브랜치에서 아래 순서대로 채웁니다. 각 TODO 위에는 무엇을 왜 하는지 주석이 있습니다.

| 단계 | TODO | 파일 | 확인 명령 | 핵심 개념 |
|---|---|---|---|---|
| 0-2 | 도구 결과를 messages 에 되돌려 넣기 | `labs/lab0-pure-loop/agent.ts` | `pnpm lab0` | Agent Loop · Tool Calling |
| 0-3 | 강제 중단은 Harness 가 | 〃 | `pnpm lab0:limit` | Harness |
| 2-1 | Jev 트리아지 질문 3개 | `nodes/triage.ts` | `pnpm lab2 --scenario 1` | 판정 모델 · noul/choice/score |
| 2-2a | MCP 도구 `get_track` 등록 | `mcp-servers/scramble-radar/server.ts` | `pnpm mcp:radar:inspect` | MCP Server |
| 2-2b | findings 누적 reducer | `state.ts` | — | State · Reducer |
| 2-2c | `Send` 로 Worker 4개 병렬 | `nodes/investigate.ts` | — | Orchestrator–Workers |
| 2-2d | 그래프 조립 | `graph.ts` | `pnpm lab2 --scenario 1` | StateGraph · Edge |
| 2-3 | 구·신 지침 충돌 → 최신 승인본 | `nodes/investigate.ts` | `pnpm lab2 --scenario 4` | Agentic Retrieval |
| 2-4a | Hindsight `recall` | `nodes/synthesize.ts` | — | 장기 메모리 |
| 2-4b | confidence 기반 분기 | `nodes/decide.ts` | `pnpm lab2 --scenario 3` | 조건부 엣지 · 재조사 상한 |
| 2-5a | `interrupt()` 승인 대기 | `nodes/approve.ts` | `pnpm lab2 --scenario 1 --exit` | Human-in-the-Loop |
| 2-5b | Hindsight `retain` | `nodes/report.ts` | 같은 시나리오 재실행 → recall 확인 | 장기 메모리 |
| 2-5c | SQLite Checkpointer | `run.ts` | `pnpm lab2:resume --thread <id>` | Checkpoint · 재개 |
| 2-5d | `Command({ resume })` | `run.ts` | 〃 | 재개 |
| 2-6 | 채점 규칙 | `evaluate.ts` | `pnpm lab2:eval --runs 1 --tag before` | Evaluation |
| 2-7 | 결정적 가드레일 (지시문 탐지) | `nodes/guardrail.ts` | `pnpm lab2:injection` | Prompt Injection · Sandbox |
| 2-8 | Jev 가드레일 질문 | `nodes/decide.ts` | 〃 | 모델 기반 Guardrail |
| 2-9 | 개선 루프 | (자유) | `pnpm lab2:eval --tag after` | 전후 비교 |

### 그래프 한눈에

```
START ─▶ triage ─▶ [Send ×4] ─▶ worker ─▶ synthesize ─▶ decide ─┬─▶ guardrail ─▶ approve ─┬─▶ report ─▶ END
          (Jev)                 radar / doctrine /   (LLM+recall)   (Jev)  │                (interrupt) └─▶ END (반려)
                                past_incidents /                           └─▶ worker_retry ─▶ worker ─▶ synthesize …
                                weather_assets                                 (추가 조회 1회)
```

---

## 4. 자주 쓰는 명령

```bash
pnpm check                          # 타입 검사
pnpm lab2 --scenario 4           # 구·신 지침 충돌 + Prompt Injection 시나리오
pnpm lab2 --scenario 1 --exit    # 승인 대기에서 종료 → 프로세스가 죽어도 상태는 SQLite 에
pnpm lab2:resume --thread <id>   # 그 지점부터 재개
pnpm lab2:eval                      # 5 시나리오 × 3회 → 정답표 일치율 표 + reports/eval-*.json
pnpm mcp:radar:inspect              # MCP Inspector 로 서버 도구 직접 호출해 보기
cat traces/<run>.jsonl | jq .          # 트레이스 읽기 (jq 없으면 그냥 cat)
```

Claude Code 에 같은 MCP 서버 꽂기:

```bash
claude mcp add radar -- pnpm exec tsx mcp-servers/scramble-radar/server.ts
```

---

## 5. 모델·판정기·메모리 바꾸기 (.env 세 줄)

| 대상 | 기본 (강사 제공) | 노트북 로컬 | 폐쇄망 이관 시 |
|---|---|---|---|
| LLM | `LLM_MODE=relay` Bedrock 중계 API | `LLM_MODE=ollama`, `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen3:8b` | vLLM/Ollama 등 OpenAI 호환 엔드포인트 |
| 판정기 | `JEV_MODE=openrouter` (Jev) | `JEV_MODE=local` (규칙 판정기) | `src/lib/jev.ts` 의 `localJudge` 자리에 자체 분류 모델 |
| 메모리 | `MEMORY_MODE=hindsight` (docker) | `MEMORY_MODE=file` | 자체 호스팅 Hindsight |
| 트레이스 | `traces/*.jsonl` | 〃 | 자체 호스팅 Langfuse (강의 5) |

키가 하나도 없을 때의 조합 `LLM_MODE=mock · JEV_MODE=local · MEMORY_MODE=file` 로도 그래프 흐름·중단·재개·가드레일·평가가 전부 돌아갑니다.

Hindsight 서버 (선택):

```bash
docker run -p 8888:8888 vectorize/hindsight     # 이미지 이름·옵션은 https://hindsight.vectorize.io 최신 문서 확인
# .env → MEMORY_MODE=hindsight
```

---

## 6. 강사용 — 두 브랜치 관리

정답은 `solution` 에서만 고치고, `main` 은 스크립트로 생성합니다.

```bash
git checkout solution
# … 코드 수정 …
git commit -am "fix: …"

git checkout main
git checkout solution -- .            # solution 트리를 그대로 가져온 뒤
node tools/make-handson.mjs           # 마커 기준으로 빈칸 생성
git commit -am "handson: regenerate from solution"
```

마커 규칙은 `tools/make-handson.mjs` 상단 주석 참고 (`// ===== TODO x-y: … =====` / `// ----- SOLUTION -----` / `//!` 자리표시자 / `// ----- END SOLUTION -----`).

---

## 7. 참고 링크

- LangGraph.js — https://langchain-ai.github.io/langgraphjs/
- MCP TypeScript SDK — https://github.com/modelcontextprotocol/typescript-sdk
- Jev / OpenRouter Decisions API — https://openrouter.ai/docs/guides/community/jev-tutorial
- Hindsight (Node 클라이언트) — https://hindsight.vectorize.io/sdks/nodejs
- Langfuse — https://langfuse.com/docs
