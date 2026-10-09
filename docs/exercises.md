# 2일차 실습 — 같이 하나씩 붙이기 (단계 0~8)

작성: 2026-10-06 · 갱신: 2026-10-09 — 빈칸 방식에서 "거의 빈 Agent 에 같이 하나씩 붙이기" 로 전환 (계획: `docs/plan-steps.md`)

원칙
- **TODO 번호 = 단계 번호.** "지금 4번" 이면 모두 `TODO 4-…` 를 연다
- **빈칸이 비어 있어도 프로그램은 끝까지 돈다.** 담당자 화면에 그 줄이 비어 있을 뿐. 그래서 매 단계 "붙이기 전 / 후" 를 같은 명령으로 비교한다
- 강사가 화면에서 같이 치고, 교육생은 따라 친다. 늦으면 `pnpm step <단계>` 로 그 단계까지 채워진 상태로 넘어간다
- 기본 확인은 키 없이: `.env` 의 `LLM_MODE=mock · JEV_MODE=local · MEMORY_MODE=file`

---

## 1. 단계

| 단계 | 같이 붙이는 것 | 파일 · TODO | 쓰는 양 | 확인 명령 | 붙인 뒤 화면 | 배우는 것 |
|---|---|---|---|---|---|---|
| 0 | (없음) 환경 점검 · 구조 · 첫 실행 | — | — | `pnpm setup:check` · `pnpm agent` | 보고만 있고 근거가 빈 담당자 화면. Jev 줄은 "확신 0%" , 마지막에 `[STOP] 답을 받았지만 이어가지 않았습니다 — TODO 7` | 전체 구조, 빈칸 규칙 |
| 1 | 레이더 부하 데려오기 | `main.ts` TODO 1 | 1줄 | `pnpm agent` | `[SUB] ┏━ askRadar` 띠 안에서 agent ⇄ tools 가 여러 줄, 레이더 · 확대 줄 | Subagent — LangGraph 에겐 그냥 노드. 안을 열면 1일차 Loop (도구 실행 · MAX_STEPS) |
| 2 | 부하에게 새 도구 `look_flight_plan` | `ask-radar.ts` TODO 2-1(설명) · 2-2(실행) | 3줄 + 5줄 | `pnpm agent 3` | `[TOOL] look_flight_plan`, 비행 계획 줄 "잠실 드론 쇼 · 신청 없음" | Tool — 설명(description)이 모델의 선택을 정한다 |
| 3 | 규정 한 줄에 점수 매기기 | `search-docs.ts` TODO 3 | 3줄 | `pnpm agent 2` | 관련 규정 줄 "풍선 … 감시" | RAG — 찾아서 넣어 쓰게 한다 |
| 4 | 날씨를 MCP 로 | `server.ts` TODO 4-1 · `mcp.ts` TODO 4-2 (두 칸) | 5줄 + 4줄 + 3줄 | 터미널 1 `pnpm mcp:weather`, 터미널 2 `pnpm agent` (`pnpm mcp:inspect` 로 서버만 따로) | `[MCP] look_weather`, 날씨 줄. 서버를 끄면 "날씨 없이 계속" | MCP 서버 · 클라이언트, 외부 의존이 죽어도 Agent 는 산다 |
| 5 | 순차를 동시로 + 합류 | `main.ts` TODO 5 | 3줄 | `pnpm agent --watch` | searchDocs 와 askRadar 가 같이 시작, `← join:searchDocs+askRadar` | Task Decomposition · 병렬. 왜 나누나 (Context 분리) |
| 6 | Jev 에게 묻기 | `main.ts` TODO 6 | 1줄 | `pnpm agent 1` | Jev 판정 줄에 확신도 · 위험도 · 정체불명 막대. 그 아래 `[RULE]` 코드 규칙 | 판정 모델 — Jev 는 의견, 결정은 코드 규칙. QUESTIONS 문장을 바꿔 보기 |
| 7 | 사람의 답으로 이어가기 | `main.ts` TODO 7 | 1줄 | `pnpm agent` → Ctrl+C → `pnpm agent --resume <번호>` | `[DECIDE] … — 사람이 결정`, 껐다 켜도 같은 질문에서 이어짐 | HITL · Checkpoint (SqliteSaver) |
| 8 | 기억 찾기 · 남기기 | `main.ts` TODO 8-1(remember) · 8-2(approve) | 1줄 + 1줄 | `pnpm agent 2` 두 번 | 두 번째엔 `같은 사례 찾음 → Jev 생략`. 보고 2 에서 `w` 를 고른 뒤 다시 돌리면 기억이 "감시 강화" 로 | Context · Memory — 사람이 가르친다 |

**왜 7(이어가기)이 8(기억)보다 먼저인가:** 기억은 approve 에서 사람의 결정까지 합쳐 남긴다. 사람 답으로 이어가지 못하면 approve 가 끝나지 않아 남길 것도 없다.

## 단계별 코드 (붙이기 전 → 후)

**1 레이더 부하** — `main.ts` 조립부
```diff
-  .addNode("askRadar", async () => ({ facts: "(TODO 1: 레이더 부하가 아직 없어서 확인한 사실이 없습니다)" }))
+  .addNode("askRadar", radarAgent)   // ask-radar.ts 의 compile() 된 그래프
```

**2 내 도구** — `ask-radar.ts` 도구 목록(2-1) · runTool(2-2)
```diff
+  { type: "function", function: { name: "look_flight_plan", description: "오늘 미리 통보되거나 허가된 비행 계획(훈련 · 드론 쇼 · 취재 헬기)을 조회한다. 레이더에 잡힌 것이 허가된 것인지 확인할 때 쓴다. (교육용 합성 자료)",
+      parameters: { type: "object", properties: { 어디: { type: "string", description: "장소 또는 보고 문장 그대로. 예: 잠실 / 서쪽 훈련 구역" } }, required: ["어디"] } } },
```
```diff
+  if (name === "look_flight_plan") {
+    const where = String(args.어디 ?? "");
+    const plans: RadarRow[] = readJson("flight-plans.json");
+    const found = plans.filter((p) => inRegion(p, where));
+    return JSON.stringify({ 비행계획: found.length ? found.map(brief) : [`'${where.slice(0, 20)}' 에 통보된 비행 계획 없음`] });
+  }
```
자료 `data/api/flight-plans.json`: 서쪽 훈련 09~11시 승인 · 광화문 방송 헬기 승인 · 잠실 드론 쇼 신청 없음

**3 규정집** — `search-docs.ts`
```diff
-  const scored = rules.map((rule) => ({ rule, score: 0 }));
+  const scored = rules.map((rule) => ({ rule, score: words(rule).filter((word) => question.includes(word)).length }));
```

**4 MCP** — `server.ts`(4-1) 에 `server.registerTool("look_weather", …)`, `mcp.ts`(4-2) 에 `listTools()` → 모델 도구 형식 · `callTool()` → 글자 꺼내기. 정답은 main 의 같은 파일

**5 동시 수집** — `main.ts` 조립부
```diff
   .addEdge(START, "searchDocs")
-  .addEdge("searchDocs", "askRadar")
-  .addEdge("askRadar", "remember")
+  .addEdge(START, "askRadar")
+  .addEdge(["searchDocs", "askRadar"], "remember")
```

**6 Jev** — `main.ts` judge
```diff
-  const res: JevResult = { answers: { action: { type: "choice", choice: "watch", confidence: 0 }, … } }; // Jev 없음
+  const res = await askJev({ report: state.report, facts: state.facts, past }, QUESTIONS);
```
덤: `QUESTIONS.unknown.instructions` 를 "더 알아봐야 해?" 로 바꿔 보면 어떤 보고든 정체불명이 높게 나온다 (실제 Jev 키 필요) — 질문 한 줄이 결과를 바꾼다

**7 이어가기** — `main.ts` 실행부
```diff
-  const answer = await askPerson(question);
-  log("stop", `답(${answer})을 받았지만 그래프를 이어가지 않았습니다 — TODO 7`);
-  break;
+  await run(new Command({ resume: await askPerson(question) }));
```

**8 기억** — `main.ts` remember(8-1) · approve(8-2)
```diff
-  const found = null as { case: Case; time: string; score: number } | null; // 기억 없음
+  const found = await findSameCase(state.report);
```
```diff
-  // 기억에 남기지 않는다 → 다음에 같은 보고가 와도 처음 보는 일
+  await saveCase({ ...state, judgment: { ...j, action: picked } }, config, decision, { summary: 요약.slice(0, 요약.indexOf("## 모델이 정리한 사실")), human: label });
```

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
| Jev 바꿔 비교 | `JEV_MODE=local pnpm agent --all` 과 `JEV_MODE=typesafe pnpm agent --all` | 표 두 개 나란히: 규칙 판정기는 전부 scramble, Jev 는 보고마다 다르게 |
| 모델 바꿔 보기 | `.env` 의 `LLM_MODE` 를 ollama / relay 로 | 같은 보고, 다른 도구 선택·사실 정리 |
| 실행 기록 트리 | `.env` 에 `LANGSMITH_TRACING=true` | smith.langchain.com 에서 노드 → LLM · Jev · MCP · 기억 호출이 트리로 |
| 그래프 그림 | `pnpm graph` | `docs/graphs/agent.md` — 선을 바꾸면 그림도 바뀐다 |
| 공식 디버거 | `pnpm studio` | Input `{ "report": "…" }` 로 한 노드씩 |

---

## 3. 시간 배치 (오전 2-A, 휴식 빼고 150분)

| 블록 | 단계 | 눈으로 보는 것 |
|---|---|---|
| 09:00~09:50 | 0 (20분) · 1 (15분) · 2 (15분) | `--watch`, `pnpm agent:limit`, `LLM_MOCK_SLOW=1` |
| 휴식 — `pnpm step 2` | | |
| 10:05~11:00 | 3 (15분) · 4 (25분) · 5 (15분) | Inspector, 날씨 서버 끄고 켜기, Worker vs Subagent |
| 휴식 — `pnpm step 5` | | |
| 11:15~12:00 | 6 (15분) · 7 (15분) · 8 (15분) | 같은 보고 두 번, 사람이 가르친다, 기억 대시보드 |
| 2-B 13:00~14:10 | 시연 | Deev 사례(appendix), `LLM_MODE` 비교, LangSmith, Jev 질문 바꾸기 |
