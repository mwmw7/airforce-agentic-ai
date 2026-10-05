# 내 에이전트 — 보고 → agent ⇄ tools → remember → judge

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	agent(agent)
	tools(tools)
	askHuman(askHuman)
	remember(remember)
	judge(judge)
	approve(approve)
	stop(stop)
	__end__([<p>__end__</p>]):::last
	__start__ --> agent;
	approve --> __end__;
	stop --> __end__;
	tools --> agent;
	agent -.-> tools;
	agent -.-> remember;
	agent -.-> stop;
	agent -.-> askHuman;
	askHuman -.-> agent;
	askHuman -.-> remember;
	askHuman -.-> stop;
	remember -.-> judge;
	remember -.-> approve;
	remember -.-> __end__;
	judge -.-> approve;
	judge -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```
