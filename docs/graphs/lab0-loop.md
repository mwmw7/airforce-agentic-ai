# 실습 0 — agent ⇄ tools 루프

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	agent(agent)
	tools(tools)
	stop(stop)
	__end__([<p>__end__</p>]):::last
	__start__ --> agent;
	stop --> __end__;
	tools --> agent;
	agent -.-> tools;
	agent -.-> stop;
	agent -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```
