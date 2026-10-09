# 단계별 그래프 모양

`pnpm see:steps` 로 생성. 앞 단계와 모양이 같으면 그림을 생략한다.

## 단계 1: 처음 상태 — 전부 빈칸 (pnpm step 1)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#ffffff', 'primaryColor': '#f2f0ff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#6b5fd3', 'lineColor': '#6b5fd3', 'textColor': '#000000', 'clusterBkg': '#fafaff', 'clusterBorder': '#6b5fd3'}, 'flowchart': {'curve': 'linear', 'htmlLabels': false}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	searchDocs(searchDocs)
	askRadar(askRadar)
	remember(remember)
	judge(judge)
	approve(approve)
	__end__([<p>__end__</p>]):::last
	__start__ --> searchDocs;
	approve --> __end__;
	askRadar --> remember;
	judge --> approve;
	searchDocs --> askRadar;
	remember -.-> judge;
	remember -.-> approve;
	classDef default fill:#f2f0ff,stroke:#6b5fd3,color:#000000,line-height:1.2;
	classDef first fill:#ffffff,stroke:#6b5fd3,color:#000000;
	classDef last fill:#bfb6fc,stroke:#6b5fd3,color:#000000;

```

## 단계 2: 2번을 풀 차례 — 1 정답 (pnpm step 2)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#ffffff', 'primaryColor': '#f2f0ff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#6b5fd3', 'lineColor': '#6b5fd3', 'textColor': '#000000', 'clusterBkg': '#fafaff', 'clusterBorder': '#6b5fd3'}, 'flowchart': {'curve': 'linear', 'htmlLabels': false}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	searchDocs(searchDocs)
	askRadar___start__(<p>__start__</p>)
	askRadar_agent(agent)
	askRadar_tools(tools)
	askRadar_askHuman(askHuman)
	askRadar_stop(stop)
	remember(remember)
	judge(judge)
	approve(approve)
	__end__([<p>__end__</p>]):::last
	__start__ --> searchDocs;
	approve --> __end__;
	askRadar_stop --> remember;
	judge --> approve;
	searchDocs --> askRadar___start__;
	remember -.-> judge;
	remember -.-> approve;
	subgraph askRadar
	askRadar___start__ --> askRadar_agent;
	askRadar_tools --> askRadar_agent;
	askRadar_agent -.-> askRadar_tools;
	askRadar_agent -.-> askRadar_stop;
	askRadar_agent -.-> askRadar_askHuman;
	askRadar_askHuman -.-> askRadar_agent;
	askRadar_askHuman -.-> askRadar_stop;
	end
	classDef default fill:#f2f0ff,stroke:#6b5fd3,color:#000000,line-height:1.2;
	classDef first fill:#ffffff,stroke:#6b5fd3,color:#000000;
	classDef last fill:#bfb6fc,stroke:#6b5fd3,color:#000000;

```

## 단계 3: 3번을 풀 차례 — 1 ~ 2 정답 (pnpm step 3)

_앞 단계와 모양이 같다 (바뀐 건 노드 안의 코드)_

## 단계 4: 4번을 풀 차례 — 1 ~ 3 정답 (pnpm step 4)

_앞 단계와 모양이 같다 (바뀐 건 노드 안의 코드)_

## 단계 5: 5번을 풀 차례 — 1 ~ 4 정답 (pnpm step 5)

_앞 단계와 모양이 같다 (바뀐 건 노드 안의 코드)_

## 단계 6: 6번을 풀 차례 — 1 ~ 5 정답 (pnpm step 6)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#ffffff', 'primaryColor': '#f2f0ff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#6b5fd3', 'lineColor': '#6b5fd3', 'textColor': '#000000', 'clusterBkg': '#fafaff', 'clusterBorder': '#6b5fd3'}, 'flowchart': {'curve': 'linear', 'htmlLabels': false}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	searchDocs(searchDocs)
	askRadar___start__(<p>__start__</p>)
	askRadar_agent(agent)
	askRadar_tools(tools)
	askRadar_askHuman(askHuman)
	askRadar_stop(stop)
	remember(remember)
	judge(judge)
	approve(approve)
	__end__([<p>__end__</p>]):::last
	__start__ --> searchDocs;
	__start__ --> askRadar___start__;
	approve --> __end__;
	askRadar_stop --> remember;
	judge --> approve;
	searchDocs --> remember;
	remember -.-> judge;
	remember -.-> approve;
	subgraph askRadar
	askRadar___start__ --> askRadar_agent;
	askRadar_tools --> askRadar_agent;
	askRadar_agent -.-> askRadar_tools;
	askRadar_agent -.-> askRadar_stop;
	askRadar_agent -.-> askRadar_askHuman;
	askRadar_askHuman -.-> askRadar_agent;
	askRadar_askHuman -.-> askRadar_stop;
	end
	classDef default fill:#f2f0ff,stroke:#6b5fd3,color:#000000,line-height:1.2;
	classDef first fill:#ffffff,stroke:#6b5fd3,color:#000000;
	classDef last fill:#bfb6fc,stroke:#6b5fd3,color:#000000;

```

## 단계 7: 7번을 풀 차례 — 1 ~ 6 정답 (pnpm step 7)

_앞 단계와 모양이 같다 (바뀐 건 노드 안의 코드)_

## 단계 8: 8번을 풀 차례 — 1 ~ 7 정답 (pnpm step 8)

_앞 단계와 모양이 같다 (바뀐 건 노드 안의 코드)_

## 단계 done: 전부 정답 (pnpm step done)

_앞 단계와 모양이 같다 (바뀐 건 노드 안의 코드)_
