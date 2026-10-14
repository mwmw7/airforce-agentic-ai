/**
 * tools/draw-graph.ts — 실습 그래프를 그림(Mermaid)으로 뽑기
 *   코드의 addEdge 를 LangGraph 가 직접 읽어 그리므로, 선을 바꾸면 그림도 바로 바뀐다
 *   출력: docs/graphs/*.md  → VS Code 미리보기(Mermaid 확장) 또는 https://mermaid.live 에 붙여넣기
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { graph as agentGraph } from "../labs/agent/main.js";

const drawings = [
  { file: "agent.md", title: "내 에이전트 — 보고 → [규정집 Worker ‖ 레이더 Subagent] → remember → judge → approve → writeReport", app: agentGraph },
];

mkdirSync("docs/graphs", { recursive: true });
for (const { file, title, app } of drawings) {
  const mermaid = (await app.getGraphAsync({ xray: true })).drawMermaid() // 그래프 구조 → Mermaid 글자. xray: Subagent(서브그래프) 안까지 펼쳐 그린다
    // 기본 그림은 배경만 연보라로 정해, 뷰어가 다크 테마면 글자가 묻힌다
    // → 그림 안에서 테마(base)와 글자 · 배경 · 선 색을 고정해 어느 뷰어에서든 똑같이 보이게 한다
    .replace("%%{init: {'flowchart': {'curve': 'linear'}}}%%",
      "%%{init: {'theme': 'base', 'themeVariables': {'background': '#ffffff', 'primaryColor': '#f2f0ff', 'primaryTextColor': '#000000', " +
      "'primaryBorderColor': '#6b5fd3', 'lineColor': '#6b5fd3', 'textColor': '#000000', 'clusterBkg': '#fafaff', 'clusterBorder': '#6b5fd3'}, " +
      "'flowchart': {'curve': 'linear', 'htmlLabels': false}}}%%")
    .replace("classDef default fill:#f2f0ff,line-height:1.2;", "classDef default fill:#f2f0ff,stroke:#6b5fd3,color:#000000,line-height:1.2;")
    .replace("classDef first fill-opacity:0;", "classDef first fill:#ffffff,stroke:#6b5fd3,color:#000000;")
    .replace("classDef last fill:#bfb6fc;", "classDef last fill:#bfb6fc,stroke:#6b5fd3,color:#000000;");
  writeFileSync(`docs/graphs/${file}`, `# ${title}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`);
  console.log(`[그림] docs/graphs/${file}`);
}
