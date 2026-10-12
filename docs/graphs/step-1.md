# 단계 1: 처음 상태 — 전부 빈칸 (pnpm step 1)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#ffffff', 'primaryColor': '#f2f0ff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#6b5fd3', 'lineColor': '#6b5fd3', 'textColor': '#000000', 'clusterBkg': '#fafaff', 'clusterBorder': '#6b5fd3'}, 'flowchart': {'curve': 'linear', 'htmlLabels': false}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	searchDocs(searchDocs)
	askRadar(askRadar)
	remember(remember)
	judge(judge)
	approve(approve)
	writeReport(writeReport)
	__end__([<p>__end__</p>]):::last
	__start__ --> searchDocs;
	approve --> writeReport;
	askRadar --> remember;
	judge --> approve;
	searchDocs --> askRadar;
	writeReport --> __end__;
	remember -.-> judge;
	remember -.-> approve;
	classDef default fill:#f2f0ff,stroke:#6b5fd3,color:#000000,line-height:1.2;
	classDef first fill:#ffffff,stroke:#6b5fd3,color:#000000;
	classDef last fill:#bfb6fc,stroke:#6b5fd3,color:#000000;

```
