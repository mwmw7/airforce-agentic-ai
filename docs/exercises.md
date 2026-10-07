# 교육생이 직접 해 보는 것 — 빈칸 9개 + 눈으로 보는 것

작성: 2026-10-06 · 갱신: 2026-10-07 — 7(서브그래프)·8(동시 수집) 을 main 에 구현, 기존 resume 은 9 로. 6(선 잇기)·10(Jev 질문)·11(내 도구) 은 계획 (코드 반영 전)

원칙: **빈칸을 비워 둔 채로도 프로그램은 돌아간다.** 멈추거나 틀리게 돌 뿐이다. 그래서 "채우기 전 / 후"를 같은 명령으로 비교한다.
막히면 `git diff hands-on main -- <파일>` 로 정답을 본다.

---

## 1. 빈칸 (코드를 쓴다)

| 번호 | 하는 일 | 파일 | 쓰는 양 | 확인 명령 | 배우는 것 |
|---|---|---|---|---|---|
| 1 | 모델이 고른 도구를 실행하고 결과를 `{ role: "tool", tool_call_id, content }` 로 돌려주기 | `labs/agent/ask-radar.ts` tools 노드 | 5줄 | `pnpm agent` | Agent Loop — 모델은 부르겠다고 말할 뿐, 실행은 내 코드 |
| 2 | `route`: 도구를 원하지 않으면 END(부모에게), MAX_STEPS 넘으면 stop, 아니면 tools | `labs/agent/ask-radar.ts` route | 3줄 | `pnpm agent:limit` | Harness — 멈추는 건 모델이 아니라 코드 |
| 3 | 규정집 각 줄에 "질문과 겹치는 단어 수" 점수 매기기 | `labs/agent/search-docs.ts` | 3줄 | `pnpm agent 2` | RAG — 찾아서 넣어 쓰게 한다 |
| 4 | MCP 서버에 `look_weather` 도구 등록 (`server.registerTool`) | `mcp-servers/weather/server.ts` | 5줄 | `pnpm mcp:inspect` | MCP 서버 |
| 5 | `listTools()` 결과를 모델 형식으로 바꾸기 · `callTool()` 결과 글자 꺼내기 (두 칸) | `labs/agent/mcp.ts` | 4줄 + 3줄 | `pnpm mcp:weather` + `pnpm agent` | MCP 클라이언트 |
| **6** | **선 잇기**: `.addEdge("judge", "approve")` 한 줄 | `labs/agent/main.ts` 조립부 | **1줄** | `pnpm agent 2` → `[HUMAN] 종합` 화면이 뜨면 성공 | LangGraph — 선이 끊긴 곳에서 멈춘다 |
| 7 | **부하 Agent 꽂기**: `.addNode("askRadar", radarAgent)` 한 줄 (함수 자리에 compile 된 그래프) | `labs/agent/main.ts` 조립부 | 1줄 | `pnpm agent` → 담당자 화면에 레이더 · 확대 · 날씨 줄이 생기면 성공. 비우면 "(TODO 7: 레이더 부하가 아직 없어서…)" 만 뜬다 | Subagent — LangGraph 에겐 그냥 노드, 안에 모델 루프가 있을 뿐 |
| 8 | **순차를 동시로**: `addEdge(START, …)` 두 줄 + 합류 `addEdge(["searchDocs", "askRadar"], "remember")` | `labs/agent/main.ts` 조립부 | 3줄 | `pnpm agent --watch` → 자리표시는 searchDocs 가 끝난 뒤 askRadar 가 시작, 채우면 둘이 같이 시작하고 `← join:searchDocs+askRadar` 가 찍힌다 | Task Decomposition · 병렬 — 한 단계의 노드는 전부 끝나야 다음으로 |
| 9 | 사람의 답을 `Command({ resume })` 로 넣어 멈춘 곳부터 이어가기 | `labs/agent/main.ts` 실행부 | 1줄 | `pnpm agent` → Ctrl+C → `pnpm agent --resume <번호>` | Checkpoint · HITL |
| **10** | **Jev 질문 한 줄**: 세 번째 질문(noul) 문장을 "정체를 전혀 모르는가" 로 좁혀 쓰기 | `labs/agent/main.ts` judge 노드 | **문장 1개** | 보고 1(UFO)·4(훈련기) 돌려 `정체불명 %` 가 갈리면 성공 (실제 Jev 키 필요) | 판정 모델 — 질문 한 줄이 결과를 바꾼다 |
| **11** | **내 도구 만들기**: `look_flight_plan` 의 설명 한 줄 + 실행 한 줄 | `labs/agent/ask-radar.ts` 도구 목록 · runTool | **2줄** | `pnpm agent 3` → `[TOOL] look_flight_plan` 이 찍히고 종합 화면에 `비행 계획` 줄 | Tool — 설명(description)이 모델의 선택을 정한다 |

(굵은 번호 6·10·11 은 계획, 나머지는 main 에 구현됨. 2026-10-07: 웹 검색 Worker 는 넣지 않기로 함 — 가상 시나리오와 공개 정보가 안 맞음)

### 7·8 채우기 전 / 후 (2026-10-07 구현)

**7 부하 꽂기** — 조립부
```diff
-  .addNode("askRadar", async () => ({ facts: "(TODO 7: 레이더 부하가 아직 없어서 확인한 사실이 없습니다)" }))
+  .addNode("askRadar", radarAgent)   // ask-radar.ts 의 compile() 된 그래프
```
채우기 전: 규정집만으로 판정, 담당자 화면에 레이더 줄 없음 · 채운 뒤: `askRadar › agent`, `askRadar › tools` 가 여러 줄 돌고 레이더 · 확대 · 날씨 줄이 생김

**8 동시 수집** — 조립부
```diff
-  .addEdge(START, "searchDocs")
-  .addEdge("searchDocs", "askRadar")
-  .addEdge("askRadar", "remember")
+  .addEdge(START, "searchDocs")
+  .addEdge(START, "askRadar")
+  .addEdge(["searchDocs", "askRadar"], "remember")
```
채우기 전: `▶ searchDocs … ◀ searchDocs 끝 … ▶ askRadar` 순서대로 · 채운 뒤: `▶ askRadar` 와 `▶ searchDocs` 가 나란히 시작, remember 는 `← join:searchDocs+askRadar`

### 6·10·11 채우기 전 / 후 (계획)

**6 선 잇기** — 조립부
```diff
   .addConditionalEdges("remember", afterRemember, ["judge", "approve"])
-  // .addEdge("어디서", "어디로")
+  .addEdge("judge", "approve")
   .addEdge("approve", END)
```
채우기 전: Jev 판정까지 하고 그래프가 끝남, 담당자 화면 없음 · 채운 뒤: `[HUMAN] 종합 — 담당자가 결정합니다`

**10 Jev 질문** — judge 노드
```diff
     unknown: { type: "noul",
-      instructions: "더 알아봐야 해?",
+      instructions: "정체가 무엇인지 전혀 짐작이 안 가서 정체부터 알아내야 한다",
       criteria: { true: "정체를 모른다", false: "무엇인지 대략 안다" } },
```
채우기 전: 어떤 보고든 정체불명 70~80% · 채운 뒤: UFO 75% 근처, 훈련기 10% 이하

**11 내 도구** — 도구 목록 + runTool (`ask-radar.ts`)
```diff
   { type: "function", function: { name: "look_flight_plan",
-      description: "",
+      description: "오늘 미리 통보되거나 허가된 비행 계획(훈련 · 드론 쇼 · 취재 헬기)을 조회한다. 레이더에 잡힌 것이 허가된 것인지 확인할 때 쓴다. (교육용 합성 자료)",
       parameters: { type: "object", properties: { 어디: { type: "string", description: "장소. 예: 잠실 / 서쪽 훈련 구역" } }, required: ["어디"] } } },
```
```diff
   if (name === "look_flight_plan") {
     const where = String(args.어디 ?? "");
     const plans: RadarRow[] = readJson("flight-plans.json");
-    return JSON.stringify({ 결과: "TODO 8 미구현" });
+    const found = plans.filter((p) => inRegion(p, where));
+    return JSON.stringify({ 비행계획: found.length ? found.map(brief) : [`'${where}' 에 통보된 비행 계획 없음`] });
   }
```
자료 `data/api/flight-plans.json` (제공): 서쪽 훈련 09~11시 승인 · 광화문 방송 헬기 승인 · 잠실 드론 쇼 **신청 없음**
채우기 전: 모델이 이 도구를 고를 이유가 없음 · 채운 뒤: `look_flight_plan(어디: 잠실)` → "신청 없음" → Jev 판정이 감시 쪽으로

덤 (자유 과제): 같은 모양으로 도구 하나 더. 예: 무전 기록 조회, 민원 접수 건수. 자료는 직접 만들어도 됨.

---

## 2. 눈으로 보는 것 (코드를 안 쓴다)

| 할 것 | 명령 | 보는 포인트 |
|---|---|---|
| 노드마다 칠판이 어떻게 바뀌나 | `pnpm agent 1 --watch` | agent 가 `steps: 1` 을 내놓아도 칠판은 1, 2, 3 으로 늘어난다 (reducer) |
| Worker 와 Subagent 의 차이 | `pnpm agent 1` (watch 없이도) | `[SUB] ┏━ askRadar` 띠가 열리고 닫힐 때까지 모든 줄 앞에 보라색 ┃ — 그 사이가 부하의 일. searchDocs 는 띠 밖에서 한 줄에 끝, 띠 안에는 `askRadar › agent/tools` 가 여러 줄. 부하 칠판엔 messages 가 길게, 부모(remember 입력)엔 facts · evidence · steps 만 (Context 분리) |
| 부하가 멈춰도 부모는 산다 | `pnpm agent:limit` | 부하만 `[STOP]`, 부모는 규정집 결과만 들고 판정 → 담당자 화면까지 간다 |
| 같은 보고를 두 번 | `pnpm agent 2` 두 번 | 두 번째는 `같은 사례 찾음 → Jev 생략`, 종합 화면 "기억" 줄에 그때 결정 |
| 사람이 가르친다 | 보고 2 에서 `w` 선택 후 다시 보고 2 | 기억이 "감시 강화" 로 떠오른다 |
| 기억 서버 안 들여다보기 | `pnpm memory:up` → `pnpm memory:ui` → localhost:18888 | 점(사실·요약) 과 선(시간·의미·엔티티) |
| 날씨 서버 끄고 돌리기 | `pnpm mcp:weather` 끈 채로 `pnpm agent` | `[MCP] 연결 실패 … 날씨 없이 계속` — 외부 의존이 죽어도 Agent 는 산다 |
| 모델이 늦으면 | `LLM_MOCK_SLOW=1 pnpm agent` | 끊고 사람에게 retry / skip / stop 을 묻는다 |
| 껐다 켜도 이어진다 | 담당자 확인에서 Ctrl+C → `pnpm agent --resume <번호>` | 같은 질문에서 이어짐 (checkpoints.sqlite) |
| 판정기 바꿔 비교 | `JEV_MODE=local pnpm agent --all` 과 `JEV_MODE=typesafe pnpm agent --all` | 표 두 개 나란히: 규칙 판정기는 전부 scramble, Jev 는 보고마다 다르게 |
| 모델 바꿔 보기 | `.env` 의 `LLM_MODE` 를 ollama / relay 로 | 같은 보고, 다른 도구 선택·사실 정리 |
| 실행 기록 트리 | `.env` 에 `LANGSMITH_TRACING=true` | smith.langchain.com 에서 노드 → LLM · Jev · MCP · 기억 호출이 트리로 |
| 그래프 그림 | `pnpm graph` | `docs/graphs/agent.md` — 선을 바꾸면 그림도 바뀐다 |
| 공식 디버거 | `pnpm studio` | Input `{ "report": "…" }` 로 한 노드씩 |

---

## 3. 블록별 배치 (5시간 안 기준)

| 블록 | 빈칸 | 눈으로 보는 것 |
|---|---|---|
| 1 Agent Loop · Harness | 1, 2, **6** | `--watch`, `agent:limit`, `LLM_MOCK_SLOW` |
| 2 RAG · MCP · Subagent | 3, 4, 5, 7, 8, **11** | Inspector, 서버 끄고 켜기, Worker vs Subagent `--watch` |
| 3 Jev · Hindsight | **10** | 같은 보고 두 번, 대시보드, 사람이 가르친다 |
| 4 HITL · Checkpoint | 9 | Ctrl+C → `--resume` |
| 5 Guardrail · 운영 | — | Deev 사례(appendix), `LLM_MODE` 비교, LangSmith |
