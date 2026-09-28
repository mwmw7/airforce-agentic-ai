/**
 * src/lib/trace.ts — 최소 트레이서 (JSONL 파일)
 *
 * [강의 4] Trace = "실행 경로 · 도구 결과 · 비용" 을 나중에 재구성할 수 있게 남기는 것.
 * 여기서는 traces/<run-id>.jsonl 에 span 을 한 줄씩 기록합니다.
 * [강의 5] 에서 같은 span 을 Langfuse 로 보내도록 확장합니다 (폐쇄망 이관 포인트 ④).
 */
import fs from "node:fs";
import path from "node:path";

const TRACE_DIR = path.resolve(process.cwd(), "traces");
const RUN_ID = process.env.RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");

let seq = 0;

export interface Span {
  end(output?: Record<string, unknown>): void;
  error(e: unknown): void;
}

function write(rec: Record<string, unknown>) {
  fs.mkdirSync(TRACE_DIR, { recursive: true });
  fs.appendFileSync(path.join(TRACE_DIR, `${RUN_ID}.jsonl`), JSON.stringify(rec) + "\n");
}

export const trace = {
  runId: RUN_ID,
  file: path.join(TRACE_DIR, `${RUN_ID}.jsonl`),

  /** span 시작. 반환된 객체로 end()/error() 호출 */
  start(name: string, input?: Record<string, unknown>): Span {
    const id = ++seq;
    const startedAt = Date.now();
    write({ ts: new Date().toISOString(), run: RUN_ID, id, name, phase: "start", input });
    return {
      end(output) {
        write({ ts: new Date().toISOString(), run: RUN_ID, id, name, phase: "end", ms: Date.now() - startedAt, output });
      },
      error(e) {
        write({ ts: new Date().toISOString(), run: RUN_ID, id, name, phase: "error", ms: Date.now() - startedAt, error: String(e) });
      },
    };
  },

  /** 단발 이벤트 (노드 진입, 가드레일 차단 등) */
  event(name: string, data?: Record<string, unknown>) {
    write({ ts: new Date().toISOString(), run: RUN_ID, name, phase: "event", data });
  },
};
