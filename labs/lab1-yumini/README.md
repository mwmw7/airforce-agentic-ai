# [실습 1] 유미니 상담 준비 도우미 (1일차 · 정진태)

1일차 실습 코드는 정진태 강사(Wefrontier)가 유미니 프로젝트 기준으로 이 폴더에 추가합니다.

계획된 구성 (커리큘럼 v2 기준)

| 단계 | 내용 | 대응 개념 |
|---|---|---|
| 1-1 | 상담 초안이 만들어진 순서를 실행 기록에서 읽기 | Trace |
| 1-2 | `get_attendance` 도구 완성 → MCP 서버로 노출 | Tool · MCP |
| 1-3 | 사실 / 기록된 설명 / 확인 질문을 나눠 초안 작성, 메모 없을 때만 추가 조회 | Agentic Retrieval |
| 1-4 | Hindsight `retain` → 재시작 후 `recall` | 장기 메모리 |
| 1-5 | 승인 후에만 확정 저장, 중복 요청 1건 유지, 일시 오류 1회 재시도 | HITL · State · Retry 예고편 |
| 1-6 | Bedrock 오픈 모델 ↔ Ollama ↔ 클라우드 모델 교체 | 모델 교체 |

공용 모듈은 2일차와 같은 것을 씁니다: `src/lib/llm.ts`, `src/lib/memory.ts`, `src/lib/trace.ts`.
MCP 서버 작성 예시는 `mcp-servers/scramble-radar/server.ts` 를 참고하세요.
