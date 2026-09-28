# 공군 AI센터 · Agentic AI 설계·구현 실무 — 핸즈온 저장소

2026. 10. 29(목) ~ 30(금) · TypeScript · LangGraph.js · MCP · Jev · Hindsight

> 이 저장소의 모든 데이터(항적·지침·사건·기상·전력)는 **교육용 합성 자료**이며 실제 공역·부대·기종·규정과 무관합니다.
> Agent 는 **권고**까지만 수행하고, 결정은 항상 사람이 합니다.

---

## 0. 브랜치 안내 — 먼저 읽어 주세요

| 브랜치 | 용도 | 누가 |
|---|---|---|
| `main` | **완성본.** 모든 코드가 채워진 정답 | 강사 · 막힌 교육생 |
| `hands-on` | **실습용.** `main` 과 같지만 핵심 10곳이 비어 있고 주석으로 할 일이 적혀 있음 (`[여기에 코드를 작성하세요]`) | 교육생 |

교육생은 `hands-on` 브랜치에서 실습합니다. 막히면 정답을 보세요. 파일 경로가 같으니 내 코드와 정답을 나란히 비교할 수 있습니다.

```bash
git diff hands-on main -- labs/lab2-scramble/decide.ts
```

---

## 1. 5분 시작 가이드

### 1-1. 준비물 (교육 1주 전에 미리)

| 필수 | 선택 |
|---|---|
| Node.js **22 LTS** 이상 (`node -v`) | Docker Desktop (Hindsight 기억 서버) |
| git, VS Code | Ollama + `ollama pull qwen3:8b` (모델 바꿔 보기) |
| 강사가 나눠주는 조별 토큰 (`.env` 에 입력) | Claude Code (MCP 서버를 꽂아 보는 시연) |

로컬 LLM 은 설치하지 않아도 됩니다. 보고서를 쓰는 모델은 강사가 AWS Bedrock 에 올려 두고 주소만 나눠 드립니다.

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
pnpm loop:run                    # [실습 0] 가장 작은 Agent 루프
pnpm loop:limit                  # 호출 한도 1 로 강제 중단 — 멈추는 건 모델이 아니라 코드
pnpm scramble:run --scenario 1   # [실습 2] 스크램블 판단 보조 Agent (담당자 확인에서 y/n)
```

`hands-on` 브랜치에서는 빈칸 때문에 "TODO … 미구현" 안내와 함께 멈춥니다. 정상이며, 순서대로 빈칸을 채우면 한 단계씩 살아납니다.

---

## 2. [실습 2] 스크램블 판단 보조 Agent — 한눈에

알림이 오면 자료를 동시에 모으고, 수상한 지시문을 걸러낸 뒤, Jev 가 판정하고, **사람이 출격을 결정**하면, LLM 이 보고서를 씁니다.

```
         ┌─▶ searchDocs ─┐
START ───┼─▶ searchWeb  ─┼─▶ checkSafety ─▶ decide ─▶ askHuman ─▶ writeReport ─▶ END
         └─▶ askRadar   ─┘   수상한 지시     기억 +     사람이      LLM 보고서 +
                             걸러내기       Jev 판정    결정        기억 남기기
```

| 단계 (파일) | 하는 일 | 배우는 것 |
|---|---|---|
| `search-docs.ts` | 지침·과거 사건 문서에서 관련 문단 찾기 | RAG |
| `search-web.ts` | 웹에서 공개 정보 찾기 (가상 결과 / Tavily) | 외부 검색 도구 |
| `ask-radar.ts` | 레이더 MCP 서버에 항적 정보 묻기 | MCP |
| `check-safety.ts` | 자료에 섞인 "AI 에게 내리는 명령" 걸러내기 | Prompt Injection 방어 |
| `decide.ts` | 과거 기억을 떠올리고 Jev 에게 출격/감시 강화/대기 묻기 | 판정 모델 · 장기 기억 |
| `ask-human.ts` | 멈추고 담당자 결정 받기 | Human-in-the-Loop |
| `write-report.ts` | LLM 보고서 작성, 이번 판단을 기억으로 남기기 | 사실은 코드가, 문장은 LLM 이 |
| `state.ts` · `graph.ts` · `run.ts` | 칠판 · 선 잇기 · 실행/이어하기 | State · 병렬 실행 · 멈춘 곳부터 이어가기 |
| `grade.ts` | 시나리오 6개를 여러 번 돌려 정답표와 비교 | 평가 |

### 시나리오

| # | 알림 | 정답 | 보는 포인트 |
|---|---|---|---|
| 1 | IFF 무응답 + ADIZ 진입 + 내륙 진로 | 출격 | 기본 흐름 |
| 2 | IFF 정상, 국제 항로 8nm 이탈 | 감시 강화 | 과잉 대응하지 않기 |
| 3 | 저고도 저속, 응답기 상태 불명 | 감시 강화 | **웹 결과에 수상한 지시문** → `checkSafety` 가 걸러내야 함 |
| 4 | IFF 무응답, 2분 내 진입 예상 | 출격 | 최신 지침(v2) 기준 |
| 5 | IFF 무응답 편대 2기 진입 임박 | 출격 | 여러 항적 |
| 6 | 다음 날, 어제 그 기체로 추정되는 항적 | 출격 | **기억**: 1 을 먼저 돌렸으면 출격, 기억이 없으면 감시 강화 |

---

## 3. 실습 순서 ↔ 빈칸 (TODO)

| 단계 | 할 일 | 파일 | 확인 명령 |
|---|---|---|---|
| 0-2 | 도구 결과를 모델에게 돌려주기 | `labs/lab0-loop/agent.ts` | `pnpm loop:run` |
| 0-3 | 강제 중단은 코드가 | 〃 | `pnpm loop:limit` |
| 2-1 | 동시에 들어오는 단서 이어 붙이기 | `state.ts` | — |
| 2-2 | MCP 도구 `get_track` 등록 | `mcp-servers/scramble-radar/server.ts` | `pnpm scramble:inspect` |
| 2-3 | 선 잇기 (동시 수집 → 검사 → 판정 → 사람 → 보고서) | `graph.ts` | `pnpm scramble:run --yes` |
| 2-4 | 수상한 문장 걸러내기 | `check-safety.ts` | `pnpm scramble:run --scenario 3 --yes` |
| 2-5 | Jev 에게 물어볼 질문 | `decide.ts` | 〃 |
| 2-6 | `interrupt()` 로 멈추고 담당자 답 받기 | `ask-human.ts` | `pnpm scramble:run` |
| 2-7 | LLM 에게 보고서 쓰게 하기 | `write-report.ts` | 〃 |
| 2-8 | `Command({ resume })` 로 이어가기 | `run.ts` | 〃 |

(`labs/lab2-scramble/` 경로는 생략)

---

## 4. 자주 쓰는 명령

```bash
pnpm scramble:run --scenario 2              # 시나리오 2
pnpm scramble:run --scenario 1 --yes        # 담당자 확인 자동 승인 (반복 테스트용)
pnpm scramble:run --resume <실행번호>        # 담당자 확인 중에 껐던 실행 이어가기 (실행번호는 시작할 때 출력됨)
pnpm scramble:run --scenario 3 --no-safety  # 안전 검사를 끄면 판정이 어떻게 바뀌는지 (강사 시연)
pnpm scramble:grade                         # 시나리오 6개 × 3회 채점표
pnpm scramble:grade --times 1 --tag before  # 고치기 전 결과 저장 → 고친 뒤 --tag after 와 비교
pnpm scramble:inspect                       # MCP Inspector 로 서버 도구 직접 호출
pnpm typecheck                              # 타입 검사
```

기억 실험: `.hindsight/scramble.json` 을 지우고 시나리오 6 만 돌리면 감시 강화, 시나리오 1 을 돌린 뒤 **프로그램을 새로 켜서** 6 을 돌리면 출격이 나옵니다.

Claude Code 에 같은 MCP 서버 꽂기:

```bash
claude mcp add radar -- pnpm exec tsx mcp-servers/scramble-radar/server.ts
```

---

## 5. 모델·판정기·기억·검색 바꾸기 (.env 네 줄)

| 설정 | 기본 (키 없이) | 강사 제공 | 폐쇄망으로 옮길 때 |
|---|---|---|---|
| `LLM_MODE` | `mock` (정해진 답) | `relay` — 강사 Bedrock 주소 + 조별 토큰 | vLLM/Ollama 등 OpenAI 호환 주소 |
| `JEV_MODE` | `local` (규칙 판정기) | `openrouter` — Jev | `src/lib/jev.ts` 의 `localJudge` 자리에 자체 모델 |
| `MEMORY_MODE` | `file` (`.hindsight/*.json`) | `hindsight` — docker 서버 | 자체 호스팅 Hindsight |
| `SEARCH_MODE` | `mock` (`data/web/`) | `tavily` — 실제 웹 검색 | 내부 검색 API 로 `search-web.ts` 교체 |

모델 비교: `LLM_MODE=ollama` + `LLM_BASE_URL=http://localhost:11434/v1` + `LLM_MODEL=qwen3:8b` 로 바꾸면 같은 보고서를 노트북 모델로 써 봅니다.

실행 기록은 `traces/*.jsonl` 에 남습니다 (Langfuse 특강에서 확장).

Hindsight 서버 (선택):

```bash
docker run -p 8888:8888 vectorize/hindsight     # 이미지 이름·옵션은 https://hindsight.vectorize.io 최신 문서 확인
# .env → MEMORY_MODE=hindsight
```

---

## 6. 저장소 구조

```
airforce-agentic-ai/
├─ src/lib/                 공용 모듈 — 폐쇄망으로 옮길 때 바꾸는 곳이 전부 여기
│  ├─ llm.ts                 LLM (Bedrock 중계 / Ollama / 클라우드 / mock)
│  ├─ jev.ts                 Jev 판정 모델 (OpenRouter / 로컬 규칙 판정기)
│  ├─ memory.ts              장기 기억 (Hindsight 서버 / 파일)
│  └─ trace.ts               실행 기록 (traces/*.jsonl)
├─ labs/
│  ├─ lab0-loop/             [실습 0] Agent 루프 (1일차)
│  └─ lab2-scramble/         [실습 2] 스크램블 판단 보조 Agent (2일차) — 파일 설명은 2장
├─ mcp-servers/scramble-radar/  가상 항적 DB MCP 서버
├─ data/                     교육용 합성 자료
│  ├─ alerts/                 시나리오 6개 + 정답표(answers.json)
│  ├─ doctrine/               지침 v1(옛) · v2(현행) · v3-draft(미승인) — 문서 검색은 v2 만
│  ├─ incidents/              과거 사건 보고서 5건
│  ├─ web/                    가상 웹 검색 결과 (수상한 지시문 1건 포함)
│  └─ api/                    항적 · 기상 · 전력
├─ reports/                  Agent 가 쓴 보고서 · 채점 결과
├─ traces/                   실행 기록
└─ tools/                    doctor(환경 점검) · make-handson(빈칸 만들기)
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
- MCP TypeScript SDK — https://github.com/modelcontextprotocol/typescript-sdk
- Jev / OpenRouter Decisions API — https://openrouter.ai/docs/guides/community/jev-tutorial
- Hindsight (Node 클라이언트) — https://hindsight.vectorize.io/sdks/nodejs
- Langfuse — https://langfuse.com/docs
