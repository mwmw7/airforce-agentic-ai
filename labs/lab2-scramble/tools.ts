/**
 * labs/lab2-scramble/tools.ts — 조사 Worker 들이 쓰는 도구 모음 (MCP 를 제외한 3종)
 *
 *   doctrine       : 지침 문서 검색 (교육용 미니 RAG — 단어 겹침 점수, 실제로는 벡터 검색으로 교체)
 *   past_incidents : 과거 사건 보고서 파일 검색
 *   weather/assets : 기상·가용 전력 HTTP mock (실제로는 fetch(URL) 한 줄로 교체)
 *
 * 도구 설계 원칙 ([강의 2])
 *   · 권한·기간·건수 검사는 도구 코드가 한다 (모델에게 맡기지 않는다)
 *   · 오류는 던지지 말고 구조화된 값으로 돌려준다 (not_found / retryable) — 모델이 다음 행동을 고를 수 있게
 *   · 문서 내용은 '데이터' 다. 도구는 문서 안의 지시를 절대 실행하지 않는다
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.resolve(process.cwd(), "data");

export interface DoctrineDoc {
  file: string;
  version: string;
  approved: boolean;
  effective_from: string | null;
  title: string;
  body: string;
  score: number;
}

/** front-matter 를 파싱한 지침 문서 목록 */
export function loadDoctrine(): Omit<DoctrineDoc, "score">[] {
  const dir = path.join(DATA, "doctrine");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    const meta: Record<string, string> = {};
    for (const line of (fm?.[1] ?? "").split("\n")) {
      const [k, ...v] = line.split(":");
      if (k) meta[k.trim()] = v.join(":").trim();
    }
    return {
      file,
      version: meta.version ?? "?",
      approved: meta.approved === "true",
      effective_from: meta.effective_from && meta.effective_from !== "null" ? meta.effective_from : null,
      title: meta.title ?? file,
      body: raw.replace(/^---[\s\S]*?---\n/, ""),
    };
  });
}

/**
 * 지침 검색. 기본은 '점수순' — 그래서 초안(v3)과 구버전(v1)도 함께 올라옵니다.
 * [실습 2-3] 에서 버전 메타데이터로 최신 승인본을 고르는 로직을 Worker 쪽에 추가합니다.
 */
export function searchDoctrine(query: string, opts: { approvedOnly?: boolean; limit?: number } = {}): DoctrineDoc[] {
  const q = tokenize(query);
  return loadDoctrine()
    .filter((d) => (opts.approvedOnly ? d.approved : true))
    .map((d) => ({ ...d, score: overlap(q, tokenize(d.body)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 3);
}

export interface IncidentHit { file: string; title: string; excerpt: string; score: number }

export function searchIncidents(query: string, limit = 3): IncidentHit[] {
  const dir = path.join(DATA, "incidents");
  const q = tokenize(query);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((file) => {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    return { file, title: body.split("\n")[0].replace(/^#\s*/, ""), excerpt: body.split("\n").filter((l) => l.startsWith("- ")).join("\n"), score: overlap(q, tokenize(body)) };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** HTTP mock — 실제 서비스라면 `await fetch(\`${BASE}/weather?region=…\`)` 로 바뀌는 자리 */
export async function httpGet(endpoint: "weather" | "assets"): Promise<Record<string, unknown>> {
  await new Promise((r) => setTimeout(r, 120)); // 네트워크 지연 흉내
  return JSON.parse(fs.readFileSync(path.join(DATA, "api", `${endpoint}.json`), "utf8"));
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9가-힣-]+/).filter((w) => w.length >= 2);
}
function overlap(q: string[], doc: string[]): number {
  const set = new Set(doc);
  return q.filter((w) => set.has(w)).length;
}
