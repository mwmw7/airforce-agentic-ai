# 2일차 (10/30 금) 핸즈온 핵심 내용 — 권 대위 전달용

작성: 최호섭 (툰스퀘어 CTO) · 2026-10-02 · 저장소 `mwmw7/airforce-agentic-ai`

> 모든 실습 자료는 교육용 합성 자료입니다. Agent 는 권고까지만 하고, 결정은 항상 사람이 합니다.

---

## 1. 한 줄 요약

1일차에 만든 Agent 골격 위에 **외부 기술(검색 · MCP · 기억 · 판정 모델)을 하나씩 연결**하고, **안전하게 운영 · 평가**하는 법까지 하루에 완주합니다.

## 2. 실습 시나리오 — 스크램블 판단 보조

가상 공역에 미식별 항적 알림이 들어오면:

```
알림 수신 → 자료 수집 (규정집 Worker · 레이더 부하 Agent, 동시에)
         → 수상한 지시문 걸러내기
         → 판정 모델이 출격 / 감시 강화 / 대기 권고 (+ 어제 기억)
         → 담당자가 결정 (승인 / 반려)
         → LLM 이 보고서 작성 → 오늘 판단을 기억으로 저장
```

교육생은 "완성 코드 + 핵심 구간 빈칸 채우기" 방식으로, 빈칸을 하나 채울 때마다 Agent 가 한 단계씩 살아납니다. 못 채워도 정답 브랜치로 다음 단계로 넘어갈 수 있습니다.

## 3. 시간표

| 시간 | 구분 | 꼭 다루는 내용 |
|---|---|---|
| 09:00~12:00 | 강의 2-A + 실습 2-A<br>외부 기술 소개와 연결 | · 규정집 Worker(함수)와 레이더 부하 Agent(Subagent, 안에서 도구 · MCP 를 골라 씀)를 **동시에** 돌려 자료 수집 (Task Decomposition · Subagent)<br>· 장기 기억(Hindsight): 어제 판단을 오늘 기억<br>· 판정 모델(Jev): 출격 여부 + 확신도<br>· 사람 승인(interrupt) 후 재개, 강제 종료 후 Checkpoint 재개<br>· LLM 은 보고서 작성에만 사용 (사실은 코드가, 문장은 LLM 이) |
| 13:00~14:10 | 강의 2-B + 실습 2-B<br>운영 · 안전 · 개선 | · 문서 속 악성 지시(Prompt Injection) 걸러내기, 끄고 비교<br>· 담당자 결정 없이는 저장 금지, 보고서 폴더 격리, MCP 서버에 키 미전달 (Guardrail · Sandbox)<br>· 모델 교체(Bedrock · Ollama · 클라우드) 후 결과 비교<br>· 채점표로 수정 전후 비교 |
| 14:30~16:00 | 특강 (이현우 90분)<br>Langfuse | · Trace · Observability, 지연 · 사용량 · 비용 해석<br>· Dataset · 평가 기준 · 사람 검토 · 자동 평가<br>· 프롬프트 · 모델 · 코드 변경 전후 비교<br>· 오전 실습 결과를 그대로 띄워 시연 |

휴식: 09:50~10:05, 11:00~11:15, 14:10~14:30

## 4. 공군 제시 항목 ↔ 실습 대응

| 공군 제시 항목 | 실습에서 하는 일 |
|---|---|
| Agent Loop · Planning · Tool Calling | 모델이 도구를 고르고, 내 코드가 실행하고, 결과를 다시 모델에게 |
| Harness · Context Engineering | 최대 호출 수 강제 중단, 판정에는 걸러낸 단서만 전달 |
| 외부 Tool 연계 (API · 데이터 · 검색) | 문서 검색(RAG) · 레이더 도구 · 날씨 MCP |
| MCP | 날씨 MCP 서버 직접 등록 (Claude Code 에도 연결 시연) |
| Context · Memory · Agentic Retrieval | 승인 문서만 색인하는 검색, Hindsight 기억 (같은 사례면 기억으로 판단, Jev 생략) |
| State · Checkpoint · Retry | 단서 누적 State, 저장 후 강제 종료 → 재개 |
| Task Decomposition · Subagent | 규정집 Worker + 레이더 Subagent(서브그래프) 동시 실행 후 합류. 부하의 대화는 부하 안에만, 부모에는 결론만 (Context 분리) |
| HITL · 장기 실행 제어 | interrupt 로 승인 · 반려, 이어가기 |
| Trace · Evaluation · Observability | 단계별 기록, LangSmith, 채점표 (Langfuse 는 이현우 특강에서) |
| 권한 · Prompt Injection · Guardrail | 실제 서비스(툰스퀘어 Deev)의 악성 지시 탐지 코드 사례(appendix), 담당자 결정 없이는 저장 금지 |
| Sandbox | 보고서는 지정 폴더에만, MCP 서버에 API 키 미전달 |
| (추가) 판정 모델 | Jev 출격 판정 + 확신도 |

## 5. 진행 방식 — 강사와 같이 하나씩 붙이기

거의 빈 Agent 에서 출발해 강사와 교육생이 **같이** 한 단계씩 붙이고, 매번 다시 실행해 화면에 새 근거 줄이 생기는 것을 확인합니다. 늦은 분은 명령 한 줄(`pnpm step <지금 단계>`)로 앞 단계가 풀린 상태로 넘어갑니다.

| 단계 | 같이 붙이는 것 | 개념 |
|---|---|---|
| 0 | 환경 · 구조 · 첫 실행 | 전체 구조 |
| 1 | 레이더 담당 부하 Agent 데려오기 (1일차에 만든 도구 쓰는 Agent 를 부하로) | Subagent · Agent Loop · Harness |
| 2 | 부하에게 새 도구 붙이기 (비행 계획 조회) | Tool — 설명이 선택을 정한다 |
| 3 | 규정집 찾기 | RAG |
| 4 | 날씨를 MCP 서버로 | MCP 서버 · 클라이언트 |
| 5 | 규정집과 레이더를 동시에 모으기 | Task Decomposition · 병렬 |
| 6 | Jev 출격 판정 | 판정 모델 |
| 7 | 사람의 답으로 멈춘 곳부터 이어가기 | HITL · Checkpoint |
| 8 | 어제 판단을 오늘 기억하기 | Context · Memory |

완성 코드로 제공 (설명 · 시연): 도구 실행 루프와 최대 호출 수 강제 중단(1일차 Loop 와 같은 코드), 모델 교체, Prompt Injection 탐지 사례(appendix).

## 6. 준비물 (교육 1주 전 안내)

Node 22 · git · VS Code · pnpm. 로컬 LLM 설치는 필요 없습니다 (강사가 Bedrock 에 올린 모델 주소를 나눠 드립니다). 키가 하나도 없어도 mock 모드로 전 실습이 돌아갑니다.

---

## 부록. 현재 구현 상태 (2026-10-07)

핸즈온 코드는 `labs/agent/main.ts` 하나에서 출발해 아래 단계를 전부 붙였습니다. 2026-10-07 에 레이더 루프를 부하 Agent(`ask-radar.ts`)로 떼어 규정집 Worker 와 동시에 돌립니다. Langfuse 연동은 이현우 특강 범위라 제외하고, 웹 검색은 가상 시나리오와 맞지 않아 넣지 않습니다.

| 상태 | 내용 | 위치 |
|---|---|---|
| 구현 | Agent Loop (agent ⇄ tools, 도구 3개: 레이더 · 확대 · 날씨 MCP) — 레이더 부하 Agent 안 | `labs/agent/ask-radar.ts` · 빈칸 1 |
| 구현 | Harness 강제 중단 (MAX_STEPS) | 〃 · 빈칸 2 |
| 구현 | RAG: 규정집 찾아보기 (단어 겹침 검색, 라이브러리 없음) — 부모 그래프의 Worker 노드 | `labs/agent/search-docs.ts` · 빈칸 3 |
| 구현 | Subagent: 레이더 루프를 서브그래프로 compile 해 부모에 노드로 꽂음. 칠판 분리(MainState / RadarState) → 부하의 대화는 부하 안에만 | `labs/agent/ask-radar.ts` · `state.ts` · 빈칸 7 |
| 구현 | 동시 수집 후 합류: `addEdge(START, …)` ×2 + `addEdge([…], "remember")`. 부하가 멈춰도 부모는 계속 | `labs/agent/main.ts` · 빈칸 8 |
| 구현 | MCP 서버: 날씨 도구를 Streamable HTTP 로 공개 | `mcp-servers/weather/server.ts` · 빈칸 4 |
| 구현 | MCP 클라이언트: 접속 → 도구 목록 → 실행 | `labs/agent/mcp.ts` · 빈칸 5 |
| 구현 | Jev 판정 3질문 (TypeSafe SDK 직접 호출, 키 없으면 로컬 판정기) | `src/lib/jev.ts` |
| 구현 | 장기 기억 Hindsight: createBank · retain · recall · reflect, 서버 없으면 file 모드 | `src/lib/memory.ts` · 시연 |
| 구현 | 기억으로 판단: `remember` 노드가 같은 사례(일치도 0.9↑)를 찾으면 그때의 판정(metadata)을 그대로 써 Jev 생략. 사람이 반려하면 다음엔 "감시" 로 떠오름. live 화면에 기억 카드 | `labs/agent/main.ts` · `findSameCase` · 시연 |
| 구현 | HITL: 언제나 마지막에 interrupt — 레이더 · 규정 · 날씨 · 기억 · Jev 를 종합해 보여 주고 사람이 출격 / 감시 / 무시 결정 | `labs/agent/main.ts` approve 노드 |
| 구현 | Checkpoint: LangGraph SqliteSaver, 강제 종료 후 `--resume`. 부하 안의 interrupt 도 같은 실행번호로 재개 | 〃 · 빈칸 9 |
| 구현 | 모델 지연 처리: 시간 초과 → retry / skip / stop | `ask-radar.ts` askHuman 노드 |
| 구현 | 모델 교체 (relay · ollama · cloud · mock) | `src/lib/llm.ts` · `LLM_MODE` |
| 구현 | Trace: traces/*.jsonl + LangSmith, LangGraph Studio | `src/lib/trace.ts` · `langgraph.json` |
| 구현 | 실시간 보기 (브라우저 · --watch) | `src/lib/live.ts` · `show.ts` |
| 구현 | LLM 보고서 작성 + 저장 폴더 격리 (사실·결정은 코드, 문장은 LLM, `reports/` 밖 거부) | `labs/agent/write-report.ts` writeReport 노드 (완성 코드) |
