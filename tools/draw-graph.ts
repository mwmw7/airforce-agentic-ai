/**
 * tools/draw-graph.ts — 실습 그래프를 그림(Mermaid)으로 뽑기
 *   코드의 addEdge 를 LangGraph 가 직접 읽어 그리므로, 선을 바꾸면 그림도 바로 바뀐다
 *   출력: docs/graphs/*.md  → VS Code 미리보기(Mermaid 확장) 또는 https://mermaid.live 에 붙여넣기
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { graph as agentGraph } from "../labs/agent/main.js";

const drawings = [
  { file: "agent.md", title: "내 에이전트 — 보고 → agent ⇄ tools → remember → judge", app: agentGraph },
];

mkdirSync("docs/graphs", { recursive: true });
for (const { file, title, app } of drawings) {
  const mermaid = (await app.getGraphAsync()).drawMermaid(); // 그래프 구조 → Mermaid 글자
  writeFileSync(`docs/graphs/${file}`, `# ${title}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`);
  console.log(`[그림] docs/graphs/${file}`);
}
