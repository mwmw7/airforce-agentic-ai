# -*- coding: utf-8 -*-
"""tools/make-slides.py — 2일차 강의 슬라이드 생성기 → docs/slides/day2.html 한 파일
   재료: docs/slides/captures/*.txt (터미널 캡처, mock) · captures/todos.json (빈칸 before/after) · docs/graphs/agent.md (Mermaid)
   실행: python3 tools/make-slides.py   (캡처를 새로 뽑았거나 문안을 고쳤을 때)
   보기: docs/slides/day2.html 을 브라우저로. ← → 이동, 화면 왼쪽/오른쪽 클릭, O 전체보기, F 전체화면"""
import html, json, re, unicodedata
from pathlib import Path

R = Path(__file__).resolve().parent.parent
S = R / 'docs/slides/captures'
CAP = S
TODOS = json.load(open(S / 'todos.json', encoding='utf-8'))
MERMAID = re.search(r'```mermaid\n(.*?)```', (R / 'docs/graphs/agent.md').read_text(encoding='utf-8'), re.S).group(1).strip()
MERMAID = '\n'.join(l for l in MERMAID.split('\n') if not l.strip().startswith('classDef') and not l.strip().startswith('%%')).replace('graph TD;', 'graph LR;').replace(':::first','').replace(':::last','').replace('<p>','').replace('</p>','')

# ───────── 재료 다듬기 ─────────
def width(s):  # 한글은 2칸
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)
def cut(s, w=112):
    out = ''; n = 0
    for c in s:
        cw = 2 if unicodedata.east_asian_width(c) in 'WF' else 1
        if n + cw > w: return out + '…'
        out += c; n += cw
    return out
def cap(name): return (CAP / name).read_text(encoding='utf-8').split('\n')
def pick(name, pats, limit=40, w=76, start=None, stop=None):
    """캡처에서 정규식 중 하나에 맞는 줄만. start/stop 은 구간 자르기"""
    ls = cap(name)
    if start:
        i = next((k for k, l in enumerate(ls) if re.search(start, l)), 0); ls = ls[i:]
    if stop:
        j = next((k for k, l in enumerate(ls) if k > 0 and re.search(stop, l)), len(ls)); ls = ls[:j + 1]
    out = [l for l in ls if any(re.search(p, l) for p in pats)] if pats else ls
    return [cut(l.rstrip(), w) for l in out[:limit]]

TAGS = ['REPORT','SETUP','LLM','TOOL','MCP','MEMORY','JEV','RULE','HUMAN','DECIDE','STOP','NODE','SUB','LIVE']
def term(lines, extra_cls=''):
    """터미널 줄 → 색 입힌 <pre>"""
    out = []
    for l in lines:
        e = html.escape(l)
        e = re.sub(r'^(┃ )', r'<span class="bar">\1</span>', e)
        e = re.sub(r'\[(' + '|'.join(TAGS) + r')(\s*)\]', lambda m: f'<span class="tag t-{m.group(1).lower()}">{m.group(1)}{m.group(2)}</span>', e)
        e = re.sub(r'(┏━|┗━)', r'<span class="mag">\1</span>', e)
        e = e.replace('│', '<span class="dim">│</span>')
        e = re.sub(r'(← join:[^ ]+)', r'<span class="amber">\1</span>', e)
        out.append(e)
    return f'<pre class="term {extra_cls}">' + '\n'.join(out) + '</pre>'
def code(lines, w=76):
    return '<pre class="code">' + '\n'.join(html.escape(cut(l, w)) for l in lines) + '</pre>'
def diff(todo, part=0, w=74):
    t = TODOS[todo]; p = t['parts'][part]
    out = []
    for l in p['before']: out.append('<span class="del">- ' + html.escape(cut(l.strip(), w)) + '</span>')
    for l in p['after']:
        s = l.strip()
        if not s: continue
        out.append('<span class="add">+ ' + html.escape(cut(s, w)) + '</span>')
    return '<pre class="diff">' + ''.join(out) + '</pre>'
def diff_raw(before, after):
    out = ['<span class="del">- ' + html.escape(cut(l, 74)) + '</span>' for l in before] + ['<span class="add">+ ' + html.escape(cut(l, 74)) + '</span>' for l in after]
    return '<pre class="diff">' + ''.join(out) + '</pre>'
def cmd(c, note=''):
    return f'<div class="cmd"><span class="prompt">$</span> {html.escape(c)}' + (f'<span class="note">{html.escape(note)}</span>' if note else '') + '</div>'
def ok(text): return f'<div class="ok"><span>이게 보이면 성공</span>{text}</div>'
def para(text): return f'<p>{text}</p>'
def mermaid(src): return f'<pre class="mermaid">{html.escape(src)}</pre>'
def table(head, rows, cls=''):
    h = ''.join(f'<th>{c}</th>' for c in head)
    b = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<table class="tbl {cls}"><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table>'
def cols(*parts, ratio=''): return f'<div class="cols {ratio}">' + ''.join(f'<div>{p}</div>' for p in parts) + '</div>'
def bullets(items): return '<ul class="list">' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'
def small(t): return f'<p class="small">{t}</p>'

BLOCKS = ['오프닝', 'Agent Loop · Harness', 'RAG · MCP · Subagent', 'Jev · Hindsight', 'HITL · Checkpoint', '운영']
slides = []  # (block, title, body_html, kind)
def add(block, title, body, kind='text'): slides.append((block, title, body, kind))

# ───────── 0. 오프닝 ─────────
add(0, '보고 한 줄이 들어오면, 수집하고, 기억하고, 판정하고, 사람이 결정한다',
    mermaid(MERMAID) +
    cols(bullets(['규정집 Worker 와 레이더 부하 Agent 가 <b>동시에</b> 자료를 모은다',
                  '전에 같은 보고를 판단했으면 기억이 답한다 (Jev 생략)',
                  '없으면 Jev 가 출격 / 감시 / 무시 의견을 낸다']),
         bullets(['마지막 버튼은 언제나 사람이 누른다',
                  '오늘 이 그래프를 빈칸 9개로 직접 완성한다',
                  '점선은 조건에 따라 갈리는 선, 실선은 항상 가는 선'])), 'fig')
add(0, '소개', '''
<div class="intro">
  <div class="name">최호섭</div>
  <div class="career">삼성전자 R&amp;D센터 → 툰스퀘어 CTO</div>
  <table class="tbl plain">
    <tr><td>Tooning</td><td>웹툰 제작 툴</td></tr>
    <tr><td>Tooning Plus</td><td>Tooning 의 유료 고급 기능</td></tr>
    <tr><td>Deev</td><td>캐릭터 챗 서비스. 오늘 오후에 이 서비스의 실제 지시문 탐지 코드를 봅니다</td></tr>
  </table>
  <div class="mail">branden@tooning.io</div>
</div>''', 'text')
add(0, '오늘의 규칙: 빈칸을 비워 둔 채로도 프로그램은 돌아간다',
    cols(cmd('git clone -b hands-on https://github.com/mwmw7/airforce-agentic-ai') + cmd('pnpm install && cp .env.example .env') + cmd('pnpm agent', '빈칸이 비어 있으면 멈추거나 틀리게 돈다') +
         bullets(['빈칸은 <b>TODO 1 ~ 9</b>. 파일 안에서 <code>// ===== TODO n</code> 을 찾는다',
                  '채운 뒤 같은 명령을 다시 치면 한 단계 살아난다',
                  '막히면 정답과 비교: <code>git diff hands-on main -- &lt;파일&gt;</code>',
                  '키가 하나도 없어도 mock 모드로 전부 돈다']),
         term(pick('01_handson_todo1.txt', [r'^\[SUB', r'^┃ \[LLM', r'^┃ \[STOP'], limit=12)) + small('빈칸 1 이 비어 있을 때: 도구 결과가 돌아가지 않아 모델이 같은 도구를 8번 조르다 내 코드에 막힌다')), 'cmd')
add(0, '오늘 일정',
    table(['시간', '블록', '하는 일', '빈칸'],
          [['09:00 ~ 09:50', 'Agent Loop · Harness', '도구 호출 루프, 멈추는 조건, 칠판(State)', '1 · 2 · 6'],
           ['10:05 ~ 11:00', 'RAG · MCP · Subagent', '규정집 검색, 날씨 MCP 서버, 레이더 부하 Agent, 동시 수집', '3 · 4 · 5 · 7 · 8'],
           ['11:15 ~ 12:00', 'Jev · Hindsight', 'Jev 3질문, 어제 판단을 오늘 기억', '10'],
           ['13:00 ~ 13:30', 'HITL · Checkpoint', '사람 결정, 껐다 켜도 이어가기', '9'],
           ['13:30 ~ 14:10', '운영', '자료 속 지시문, 모델 교체, 실행 기록', '—'],
           ['14:30 ~ 16:00', '특강 (이현우)', 'Langfuse 로 검증과 활용', '—']]) + small('휴식 09:50 · 11:00 · 14:10'), 'table')

# ───────── 1. Agent Loop · Harness ─────────
add(1, '도구 호출은 어떻게 일어나나?',
    cols(mermaid('''flowchart LR
  A["agent<br/>모델 호출"] -- "tool_calls: [{name: look_radar, arguments: {어디: 서울}}]" --> T["tools<br/>내 코드 runTool()"]
  T -- "{ role: tool, tool_call_id, content: 결과 JSON }" --> A
  A -- "tool_calls 없음 → facts 2~3줄" --> E((END))'''),
         bullets(['모델은 <b>JSON 으로 "이 도구를 써 달라"</b> 고 말한다',
                  '실행은 내 코드 <code>runTool</code> 이 한다. 모델은 파일도 네트워크도 못 만진다',
                  '결과는 <code>role: "tool"</code> 메시지로 다시 모델에게',
                  '모델이 도구를 더 안 원하면 루프가 끝난다']), ratio='r64'), 'fig')
add(1, '빈칸 1 · 도구를 실행하고 결과를 모델에게 돌려주기',
    cols(diff('TODO 1') + cmd('pnpm agent'),
         term(pick('02_run1_first.txt', [r'^┃ \[LLM', r'^┃ \[TOOL  \] look_radar', r'지역 서울', r'서울 남산 위'], limit=7)) +
         ok('<code>[TOOL] look_radar</code> 가 찍히고, 2회째 호출에서 모델이 결과를 받아 다음 도구를 고른다')), 'diff')
add(1, '누가 멈추나?',
    cols(mermaid('''flowchart TD
  A[agent] --> R{route}
  R -- "도구 원함 · steps < MAX_STEPS" --> T[tools]
  R -- "도구 원함 · steps ≥ MAX_STEPS" --> S[stop]
  R -- "도구 안 원함" --> E((END))
  R -- "모델이 늦음" --> H[askHuman]
  T --> A'''),
         bullets(['모델은 "그만할까?" 를 스스로 판단하지 않는다',
                  '<code>route</code> 함수가 매번 칠판을 보고 다음 노드를 고른다',
                  '<code>MAX_STEPS</code> 는 환경 변수. 넘으면 모델을 더 부르지 않는다',
                  '시간도 마찬가지: <code>LLM_TIMEOUT_SEC</code> · <code>RUN_TIMEOUT_SEC</code>'])), 'fig')
add(1, '빈칸 2 · 멈추는 조건은 코드가 쓴다',
    cols(diff('TODO 2') + cmd('pnpm agent:limit', 'MAX_STEPS=1'),
         term(pick('04_limit.txt', [r'^\[SUB', r'^┃ \[LLM', r'^┃ \[STOP', r'^\[(MEMORY|JEV|HUMAN|DECIDE)'], limit=9)) +
         ok('<code>[STOP] 모델을 이미 1번 불렀습니다</code> 가 찍히고, 레이더 없이도 판정과 담당자 화면까지 간다')), 'diff')
add(1, '칠판(State)은 어떻게 쌓이나?',
    cols(term(pick('05_watch.txt', [r'◀ askRadar › agent 끝', r'▶ askRadar › tools 시작', r'▶ askRadar › agent 시작', r'^┃\s+│ steps'], limit=12)) + cmd('pnpm agent 3 --watch'),
         bullets(['agent 노드는 매번 <code>steps: 1</code> 만 돌려준다',
                  '칠판에는 1, 2, 3 으로 쌓인다. <b>reducer</b> 가 더하기 때문',
                  '칸마다 규칙이 다르다: 더하기(steps) · 이어 붙이기(messages, evidence) · 덮어쓰기(facts)',
                  '노드는 "내가 바꾼 칸" 만 돌려주고, 합치는 건 LangGraph 가 한다']) +
         code(['steps:    Annotation<number>({ reducer: (prev, next) => prev + next })',
               'messages: Annotation<Msg[]>({ reducer: (prev, next) => [...prev, ...next] })',
               'facts:    Annotation<string>()   // 덮어쓰기'])), 'cmd')
add(1, '빈칸 6 · 선이 끊긴 곳에서 그래프는 멈춘다',
    cols(diff_raw(['// .addEdge("어디서", "어디로")'], ['.addEdge("judge", "approve")']) + cmd('pnpm agent 2') +
         bullets(['노드는 다 있어도 선이 없으면 거기서 끝난다',
                  'LangGraph 는 compile 때 "못 가는 노드" 만 잡고, 안 이어진 끝은 조용히 끝낸다',
                  '그림을 뽑으면 바로 보인다: <code>pnpm graph</code>']),
         term(pick('02_run1_first.txt', [r'^\[RULE', r'^\[HUMAN', r'^\s+│ (보고|레이더|관련 규정|Jev 판정|코드 권고)$', r'^\[DECIDE'], limit=9)) +
         ok('채우기 전엔 Jev 판정에서 끝난다. 채우면 <code>[HUMAN] 종합 — 담당자가 결정합니다</code> 화면이 뜬다')), 'diff')
add(1, '모델이 늦으면?',
    cols(term(pick('06_slow.txt', [r'^┃ \[LLM', r'^┃ \[HUMAN', r'^\[SUB   \] ┗', r'^\[HUMAN', r'^\[DECIDE'], limit=8)) + cmd('LLM_MOCK_SLOW=1 pnpm agent 4'),
         bullets(['한 번 호출이 <code>LLM_TIMEOUT_SEC</code> 를 넘으면 끊는다',
                  '끊은 뒤 뭘 할지는 코드가 정하지 않고 <b>사람에게 묻는다</b>: retry / skip / stop',
                  'skip 이면 사실 없이 판정으로, stop 이면 전부 중단',
                  '실행 전체가 <code>RUN_TIMEOUT_SEC</code> 를 넘어도 끊는다'])), 'cmd')

# ───────── 2. RAG · MCP · Subagent ─────────
add(2, '모델이 모르는 문서는?',
    cols(mermaid('''flowchart LR
  Q["보고 한 줄"] --> W["단어로 쪼개기"]
  W --> SC["규정집 10줄에<br/>겹치는 단어 수로 점수"]
  SC --> T["상위 3줄"]
  T --> EV["칠판 evidence"]
  EV --> J["judge · approve 가 본다"]'''),
         bullets(['RAG = 모델이 답하기 전에 <b>자료를 찾아서 넣어 주는</b> 구조',
                  '어떻게 찾느냐는 자유. 오늘은 가장 단순한 겹치는 단어 수',
                  '임베딩으로 바꾸고 싶으면 점수 함수 하나만 바꾼다. 그래프는 그대로',
                  '규정집은 <code>data/docs/rulebook.md</code> 열 줄, 전부 가상']), ratio='r64'), 'fig')
add(2, '빈칸 3 · 규정 한 줄에 점수 매기기',
    cols(diff('TODO 3') + cmd('pnpm agent 2'),
         term(pick('07_mcp_off.txt', [r'^\[TOOL  \] search_docs', r'^\s+│ \d+\. '], limit=4)) +
         term(pick('07_mcp_off.txt', [r'^\s+│ 관련 규정$', r'^\s+│\s+· \d+\. '], limit=4)) +
         ok('담당자 화면 "관련 규정" 에 풍선 규정이 올라온다. 점수가 전부 0 이면 "관련 규정 없음"')), 'diff')
add(2, '도구를 다른 프로세스에 두면?',
    cols(mermaid('''flowchart LR
  subgraph agent["내 Agent (MCP Host · Client)"]
    A[agent] --> L["도구 목록 = 로컬 2개 + MCP 서버 것"]
  end
  subgraph srv["mcp-servers/weather (MCP Server · localhost:3333)"]
    W["look_weather"]
  end
  L -- "listTools()" --> W
  L -- "callTool()" --> W'''),
         bullets(['MCP = 도구를 <b>다른 프로세스</b>에 두고 표준 규약으로 부르는 것',
                  '서버: <code>registerTool</code> 로 이름 · 설명 · 입력 모양 · 실행 함수를 등록',
                  '클라이언트: 접속 → 목록 받기 → 실행. 세 함수뿐',
                  '모델 입장에선 로컬 도구와 구분이 없다. 같은 목록에 섞여 있을 뿐'])), 'fig')
add(2, '빈칸 4 · 5 · 서버에 도구 등록, 클라이언트에서 목록 받고 실행',
    cols(diff('TODO 4', w=88) + cmd('pnpm mcp:weather', '다른 터미널에서 먼저') + cmd('pnpm mcp:inspect', 'http://localhost:3333/mcp'),
         diff('TODO 5', 0, w=88) + diff('TODO 5', 1, w=88) + cmd('pnpm agent') +
         term(pick('02_run1_first.txt', [r'^┃ \[MCP   \] 날씨 서버 연결 OK', r'look_weather  ', r'^┃ \[MCP   \] look_weather'], limit=3)) +
         ok('<code>[MCP] 날씨 서버 연결 OK — 도구 1개</code>, 그리고 모델이 3회째에 look_weather 를 고른다')), 'dense')
add(2, '서버를 끄면?',
    cols(term(pick('07_mcp_off.txt', [r'^┃ \[MCP   \] 날씨 서버 연결 실패', r'^┃ \[LLM', r'^\[SUB   \] ┗', r'^\[DECIDE'], limit=7)) + cmd('pnpm agent 2', '날씨 서버를 끈 채로'),
         bullets(['연결 실패는 <b>에러가 아니라 안내 한 줄</b>이다',
                  '도구 목록에서 날씨만 빠지고 Agent 는 계속 간다',
                  '외부 의존이 죽어도 Agent 가 사는 것은 코드로 정해 둔 일이다',
                  '어디서 그렇게 했나: <code>labs/agent/mcp.ts</code> 의 <code>connectMcp</code> 가 null 을 돌려준다'])), 'cmd')
add(2, 'LangGraph 사용자가 가장 많이 쓰는 그래프 다섯 가지',
    table(['패턴', '모양', '한 줄 비유', '우리 코드'],
          [['Tool-calling 루프 (ReAct)', 'agent ⇄ tools 왕복', '혼자 일하는 직원', '있음 — ask-radar.ts'],
           ['Supervisor', '감독 모델이 부하 여럿 중 누구에게 넘길지 고름', '팀장이 팀원을 지명', '없음 — 다음 단계'],
           ['Orchestrator–Workers', '일을 쪼개 동시에 뿌리고 합침', '팀장이 일을 쪼개 동시에 배분', '있음 — main.ts (빈칸 8)'],
           ['Router', '입력 보고 갈림길 하나, 루프 없음', '안내 데스크', 'route 함수가 축소판'],
           ['Evaluator–Optimizer', '만들기 → 평가 → 다시 만들기', '퇴고하는 작가', '<span class="amber">실제 사례 시연: 3D 이펙트 생성 → 렌더 → 평가 → 재생성</span>']]) +
    small('interrupt 로 사람이 끼어드는 것은 패턴이 아니라 어느 패턴에나 끼우는 공통 부품이다. LangChain 이 권하는 순서: ReAct 하나로 시작하고, 도구가 열 개를 넘거나 역할이 갈리면 쪼개라'), 'table')
add(2, 'Worker 와 Subagent 는 뭐가 다른가?',
    cols(table(['', 'Worker', 'Subagent'],
               [['하는 일', '정해진 일 하나', '목표 하나를 받아 알아서 끝냄'],
                ['모델 호출', '없음', '있음, 반복 (도구를 고르고 또 고름)'],
                ['실행 횟수', '항상 같음', '상황마다 다름'],
                ['코드 모양', '함수 하나', '그래프 하나 (agent ⇄ tools)'],
                ['우리 코드', 'searchDocs', 'askRadar']]),
         bullets(['복사기와 인턴. 복사기는 몇 장 나올지 미리 알고, 인턴은 몇 번 왔다 갔다 할지 자기가 정한다',
                  '<b>LangGraph 에겐 둘 다 노드 하나다.</b> 안에 모델 루프가 있으면 우리가 부하라고 부를 뿐',
                  '선 잇기 · 체크포인트 · interrupt 코드는 둘이 완전히 같다']) +
         code(['.addNode("searchDocs", searchDocsNode)   // 함수',
               '.addNode("askRadar",   radarAgent)       // compile() 된 그래프'])), 'table')
add(2, '빈칸 7 · 부하 Agent 를 노드로 꽂기',
    cols(diff('TODO 7') + cmd('pnpm agent') +
         bullets(['<code>ask-radar.ts</code> 가 자기 칠판으로 agent ⇄ tools 를 돌리고 <code>compile()</code> 한 것',
                  '부모와 이름이 겹치는 칸(facts · evidence · steps)만 돌아온다',
                  '부하가 모델과 주고받은 대화 20줄은 부하 안에 남는다']),
         term(pick('02_run1_first.txt', [r'^\[TOOL  \] search_docs', r'^\[SUB', r'^┃ \[(MCP|LLM)'], limit=9)) +
         ok('<code>[SUB] ┏━ askRadar</code> 띠가 열리고 그 안의 줄에 ┃ 가 붙는다. 비워 두면 레이더 줄 없이 판정으로 간다')), 'diff')
add(2, '빈칸 8 · 순차를 동시로',
    cols(diff('TODO 8') + cmd('pnpm agent 1 --watch') +
         small('LangGraph 는 한 단계의 노드가 전부 끝나야 다음으로 간다. 배열로 묶으면 "둘 다 끝나야" 가 코드에 보이고, 가지 길이가 달라도 안전하다. 자유 과제: 부하에 도구 하나 더 — 비행 계획 조회 look_flight_plan'),
         term(pick('08_sequential_watch.txt', [r'^\[NODE  \] [▶◀] (searchDocs|askRadar) '], limit=3)) + small('채우기 전: 규정집이 끝나야 레이더가 출발') +
         term(pick('05_watch.txt', [r'^\[NODE  \] [▶◀] (searchDocs|askRadar|remember) '], limit=5)) + small('채운 뒤: 둘이 같이 출발, remember 는 둘 다 끝나야') +
         ok('<code>▶ askRadar</code> 와 <code>▶ searchDocs</code> 가 나란히 시작하고, remember 가 <code>← join:searchDocs+askRadar</code> 로 깨어난다')), 'diff')
add(2, '왜 나누나?',
    table(['이점', '하나의 루프였을 때', '부하로 나누면', '어디서 보이나'],
          [['작업 기록이 부모에 안 남는다', '레이더 조회 대화 20줄이 판정 · 저장 · 화면까지 따라감', '20줄은 부하 칠판에만. 부모엔 facts 3줄 + evidence', '<code>--watch</code>: remember 입력에 messages 가 없다'],
           ['부하가 멈춰도 부모는 산다', 'MAX_STEPS 면 전체 종료', '부하만 끝나고 규정집 결과로 판정까지', '<code>pnpm agent:limit</code>'],
           ['부하 단위로 갈아 끼운다', '루프 · 판정 · 승인이 한 파일에', '모델 · 키 · 도구를 부하만 바꾸거나 옆에 하나 더', '다음 단계'],
           ['속도', '—', '<b>지금 구성에선 없다.</b> 모델 쓰는 가지가 하나뿐이고, 노트북 GPU 는 요청을 한 줄로 받는다', '가지 2개 이상 + Bedrock 일 때']]) +
    small('이점이 아닌 것: 판정 정확도는 안 바뀐다(judge 는 facts 만 읽는다) · 코드가 짧아지지 않는다(파일 둘, 칠판 둘) · LangGraph 에겐 그냥 노드 하나'), 'table')

# ───────── 3. Jev · Hindsight ─────────
add(3, 'LLM 말고 Jev 를 쓰면?',
    cols(table(['', 'LLM', 'Jev (TypeSafe System One)'],
               [['돌려주는 것', '문장', '확률 + 확신도'],
                ['질문 모양', '자유 프롬프트', 'choice · score · noul 세 종류'],
                ['속도', '초 단위', '밀리초 단위'],
                ['우리 코드', '부하의 사실 정리', 'judge 노드 3질문']]),
         code(['askJev({ report, facts, past }, {',
               '  action:  { type: "choice", criteria: { scramble, watch, ignore } },',
               '  danger:  { type: "score",  criteria: ["안 위험", "조금", "꽤", "비상"] },',
               '  unknown: { type: "noul",   instructions: "정체가 무엇인지 전혀 짐작이 안 가서 …" },',
               '})']) +
         bullets(['Jev 는 <b>의견</b>만 준다. 출격 / 감시 / 무시를 정하는 규칙은 코드에 있다',
                  '키가 없으면 <code>JEV_MODE=local</code> 로 Jev 자리를 정규식 규칙이 대신한다. 흐름은 똑같이 돈다'])), 'table')
add(3, '판정 화면 읽기',
    cols(term(pick('10_all_typesafe.txt', [], start=r'^\[JEV   \] \[typesafe\]', stop=r'^\[RULE', limit=16, w=96), 'tiny') + small('실제 Jev (보고 1, 서울 상공 정체불명 비행체)'),
         bullets(['① action: 셋 중 하나를 고르고 확률을 나란히 준다. 확신(confidence)은 1등과 2등의 차이',
                  '② danger: 0 ~ 3 점수. 기준 문장 4개를 우리가 적었다',
                  '③ unknown: 예 / 아니오 확률',
                  '<code>[RULE]</code> 줄이 코드 규칙이다: 확신 20% 미만이면 사람에게, scramble 이면 출격 준비, watch 인데 정체불명 50% 이상이면 정체부터'])), 'cmd')
add(3, '빈칸 10 · 질문 한 줄이 결과를 바꾼다',
    cols(diff_raw(['instructions: "더 알아봐야 해?",'], ['instructions: "정체가 무엇인지 전혀 짐작이 안 가서 정체부터 알아내야 한다",']) + cmd('pnpm agent 1', 'UFO') + cmd('pnpm agent 4', '훈련기') +
         bullets(['noul 질문은 문장 하나가 전부다. 모호하면 어느 보고든 70 ~ 80% 가 나온다',
                  '좁혀 쓰면 UFO 는 75% 근처, 훈련기는 10% 이하로 갈린다',
                  '실제 Jev 키가 있어야 차이가 난다. JEV_MODE=local 은 정규식이라 둔하다']),
         ok('보고 1 과 4 의 <code>정체불명 %</code> 가 확실히 갈리면 성공')), 'diff')
add(3, 'JEV_MODE 를 바꾸면?',
    term(pick('09_all_local.txt', [r'^[┌│└├]'], limit=9, w=150), 'tiny') + small('JEV_MODE=local — Jev 자리를 정규식 규칙이 대신. 정체불명 보고는 전부 scramble 로 기운다') +
    term(pick('10_all_typesafe.txt', [r'^[┌│└├]'], limit=9, w=150), 'tiny') + small('JEV_MODE=typesafe — 실제 Jev. 보고마다 의견과 확신이 다르다. 훈련기는 ignore 97%') +
    cols(cmd('JEV_MODE=local pnpm agent --all --answer w'), cmd('JEV_MODE=typesafe pnpm agent --all --answer w')), 'cmd')
add(3, '어제 판단을 오늘 기억하면?',
    cols(mermaid('''flowchart LR
  C["수집 끝"] --> M{remember<br/>같은 사례?}
  M -- "일치 0.9 이상" --> AP["approve<br/>그때 판정 그대로"]
  M -- "없음" --> J["judge<br/>Jev + recall"]
  J --> AP
  AP -- "사람 결정 + 근거 요약 retain" --> H[("Hindsight<br/>기억 서버 또는 파일")]
  H -. "findSameCase · recall" .-> M'''),
         bullets(['기억은 두 번 쓴다: 판정 전에 <b>찾고</b>, 사람 결정 뒤에 <b>남긴다</b>',
                  '같은 사례면 Jev 를 부르지 않는다. 그때의 판정과 사람의 선택이 그대로 올라온다',
                  '비슷하지만 다른 사례는 Jev 에게 참고 자료(past)로 같이 보낸다',
                  '서버가 없으면 <code>MEMORY_MODE=file</code> 로 JSON 파일에 똑같이 남긴다']), ratio='r64'), 'fig')
add(3, '같은 보고 두 번',
    cols(term(pick('02_run1_first.txt', [r'^\[MEMORY', r'^\[JEV   \]', r'^\[RULE', r'^\[DECIDE'], limit=5)) + small('첫 번째: 기억 없음 → Jev 판정'),
         term(pick('03_run1_again.txt', [r'^\[MEMORY', r'^\s+│ 그때', r'^\[DECIDE'], limit=5)) + small('두 번째: 같은 사례 찾음 → Jev 생략, 그때 결정이 그대로')) +
    cmd('pnpm agent 1', '두 번') + ok('두 번째 실행에 <code>[MEMORY] 같은 사례 찾음 → Jev 생략</code>'), 'cmd')
add(3, '사람이 가르친다',
    cols(term(pick('07_mcp_off.txt', [r'^\[MEMORY', r'^\s+│ 그때', r'^\[DECIDE'], limit=5)) + cmd('pnpm agent 2', '담당자가 w(감시 강화)를 고른 뒤 다시') +
         bullets(['기억에 남는 건 Jev 의견이 아니라 <b>사람의 최종 선택</b>과 그때 본 근거 요약이다',
                  '다음에 같은 보고가 오면 사람이 고른 쪽으로 떠오른다',
                  '기억 서버 안은 <code>pnpm memory:ui</code> 로 들여다본다 (localhost:18888)']),
         '<div class="placeholder">pnpm memory:ui 대시보드 캡처 자리<br/><span>점 = 사실 · 요약, 선 = 시간 · 의미 · 엔티티</span></div>'), 'cmd')

# ───────── 4. HITL · Checkpoint ─────────
add(4, '사람이 끼어들면 어디서 멈추나?',
    cols(mermaid('''flowchart LR
  subgraph sub["askRadar (부하)"]
    AG[agent] -- "모델이 늦음" --> AH["askHuman<br/>interrupt: retry / skip / stop"]
  end
  sub --> RM[remember] --> JD[judge] --> AP["approve<br/>interrupt: y / w / n"] --> E((END))'''),
         bullets(['<code>interrupt(질문)</code> 한 줄이면 그래프가 거기서 멈추고 질문이 바깥으로 나온다',
                  '두 곳: 부하 안(모델이 늦을 때), 부모의 approve(언제나)',
                  'approve 는 레이더 · 확대 · 날씨 · 규정 · 기억 · Jev 를 한 화면에 모아 보여 주고 묻는다',
                  'Agent 는 권고까지. 버튼은 사람이 누른다'])), 'fig')
add(4, '빈칸 9 · 사람의 답으로 멈춘 곳부터 이어가기',
    cols(diff('TODO 9') + cmd('pnpm agent') +
         bullets(['같은 <code>thread_id</code> 로 다시 돌리면 LangGraph 가 멈춘 자리를 찾는다',
                  '답은 <code>interrupt()</code> 의 반환값으로 들어간다. 노드 함수는 처음부터 다시 돌지만 그 줄에서 답을 받는다']),
         term(pick('02_run1_first.txt', [r'^\[HUMAN \] 종합', r'^\s+│ 코드 권고$', r'^\s+│\s+· 출격', r'^\[HUMAN \] 답', r'^\[DECIDE'], limit=5)) +
         ok('답을 넣으면 같은 줄에서 이어져 <code>[DECIDE]</code> 까지 간다. 비워 두면 답을 받고도 끝난다')), 'diff')
add(4, '껐다 켜면?',
    cols(term(pick('12a_approve_killed.txt', [r'^\[SETUP', r'^\s+│ 모델 한 번', r'^\[HUMAN \] 종합'], limit=3) + ['^C  (담당자 확인 중 Ctrl+C)']) + small('멈춘 실행번호가 SETUP 줄에 있다'),
         term(pick('12b_approve_resume.txt', [r'^\[SETUP', r'^\[HUMAN', r'^\[DECIDE'], limit=4)) + small('--resume: 처음부터 돌리지 않고 같은 질문에서 이어진다')) +
    cmd('pnpm agent --resume loop-1-1791371799518') +
    bullets(['저장은 <code>SqliteSaver</code> 한 줄. 단계마다 <code>checkpoints.sqlite</code> 에 칠판이 남는다',
             '직접 쓴 SQL 은 한 줄도 없다. 파일 하나를 지우면 처음부터']), 'cmd')
add(4, '부하 안에서 멈춰도?',
    cols(term(pick('11a_killed.txt', [r'^\[SUB', r'^┃ \[LLM', r'^┃ \[HUMAN'], limit=3) + ['^C']) + small('부하 안 askHuman 에서 Ctrl+C'),
         term(pick('11b_resume.txt', [r'^\[SETUP \] 이어가기', r'^\[HUMAN \] 가짜', r'^\[SUB', r'^┃ \[LLM', r'^\[DECIDE'], limit=8)) + small('같은 실행번호로 부하 안 그 줄부터')) +
    bullets(['부하의 체크포인트는 부모 실행번호 아래 이름을 달고 저장된다',
             '그래서 서브그래프 안에서 멈춰도 <code>--resume</code> 한 줄로 이어진다. 특별한 코드가 없다']), 'cmd')
add(4, '되감으면?',
    cols(code(['const history = [];',
               'for await (const snap of graph.getStateHistory(config)) history.push(snap);',
               '// 체크포인트마다: snap.values(칠판) · snap.next(다음 노드) · snap.config(그 시점 id)',
               '',
               '// 담당자가 "감시" 라고 한 시점으로 돌아가 "출격" 으로 다시 돌린다',
               'await graph.invoke(new Command({ resume: "y" }), history[2].config);']) +
         bullets(['체크포인트는 되돌아갈 수 있는 저장 슬롯이다',
                  '같은 실행번호 안에서 "그때 다르게 답했으면" 을 재생한다',
                  '시연만 한다. 코드는 10줄, 빈칸 아님']),
         '<div class="placeholder">시연 자리<br/><span>구현 여부 미정 — 미구현이면 "다음 단계" 로 넘어간다</span></div>'), 'cmd')

# ───────── 5. 운영 ─────────
add(5, '운영 중 자료에 지시문이 섞여 오면?',
    cols(code(['// src/lib/jev.ts — JEV_MODE=local 규칙 (속는 쪽을 흉내 낸다)',
               'const injected = /승인 없이|즉시 (저장|통보)|이전 지시는 무시|ignore previous|bypass approval/.test(everything);',
               'if (injected) risk = 0.95;   // 자료 속 한 줄이 위험도를 끌어올린다 → 무조건 출격으로 기운다']) +
         bullets(['Jev 에 들어가는 글은 "보고 + 도구 결과" 다. 도구 결과에 지시문이 섞이면 그대로 읽는다',
                  '걸러내는 코드가 없으면 LLM 도 Jev 도 속는다']),
         table(['지금 코드에 있는 상한', '어디'],
               [['모델 호출 횟수 MAX_STEPS', 'ask-radar.ts route'],
                ['한 번 호출 · 실행 전체 시간', 'llm.ts · main.ts'],
                ['사람 결정 없이는 끝나지 않음', 'main.ts approve interrupt'],
                ['MCP 서버에 API 키를 주지 않음', 'mcp-servers/weather'],
                ['Jev 에는 걸러낸 사실만', 'judge 는 facts · report 만 보냄']])), 'table')
add(5, '실제 서비스(Deev)는 어떻게 거르나',
    cols(code(['// appendix/detect_define.ts — 1차 정규식 (영 · 한), 2차 TypeSafe',
               "{ name: 'KO_IGNORE_INSTRUCTIONS',",
               "  regex: /(?:이전|기존|시스템|위의|모든)\\s*(?:지시|지침|명령|규칙|프롬프트|설정)\\s*…(?:무시|우회|초기화|재설정|생략)/ },",
               "{ name: 'EN_SYSTEM_OVERRIDE', regex: /(?:system|developer|rules?)\\s+(?:override|bypass|reset)/i },",
               '',
               'public async detect(inputs): Promise<InjectionCheckResult> {',
               '  if (!apiKey) return { ...this.detectWithRegex(inputs), unavailableReason: "missing-key" };',
               '  const timeout = setTimeout(() => controller.abort(), 5_000);   // 탐지기도 시간 상한',
               '  …  // → { detected, detector: "typesafe" | "regex", matchedPattern }',
               '',
               '// appendix/detect_call.ts — 사용자 입력 4곳을 한 번에 검사, 걸리면 요청 거절',
               "const safety = await this.detector.detect([{ name: 'userPrompt', content }, { name: 'userPersona', … }]);",
               'if (safety.detected) return { ok: false, errorCode: ERROR_CODE.DvPromptInjectionDetected.code };']) +
         bullets(['정규식: 빠르고, 왜 걸렸는지 설명된다',
                  '모델 판정: 말을 바꿔 써도 잡는다',
                  '둘을 겹쳐 쓰고, 키가 없을 때의 동작도 정해 둔다']),
         '<figure class="shot"><img src="../../appendix/img.png" alt="Deev 캐릭터 챗 화면"><figcaption>Deev 캐릭터 챗 화면 — 사용자 입력 · 페르소나 · 메모 · 재생성 지시 네 곳을 모두 검사한다</figcaption></figure>', ratio='r64'), 'cmd')
add(5, '모델을 바꾸면?',
    cols(term(pick('02_run1_first.txt', [r'^\[SETUP \] 모델', r'^┃ \[LLM', r'^\[DECIDE'], limit=6)) + small('LLM_MODE=mock — 정해진 순서로 도구를 하나씩'),
         term(pick('13_ollama.txt', [r'^\[SETUP \] 모델', r'^┃ \[LLM', r'^\[DECIDE'], limit=6)) + small('LLM_MODE=ollama — 노트북 qwen3.5. 확대까지 2번만 보고 사실 정리, 호출마다 5 ~ 10초')) +
    code(['# .env — 슬롯만 바꾼다. 그래프 · 도구 · 판정 코드는 그대로',
          'LLM_MODE=relay      LLM_BASE_URL=<강사가 나눠 주는 Bedrock 주소>   LLM_API_KEY=<조별 토큰>',
          'LLM_MODE=ollama     LLM_BASE_URL=http://localhost:11434/v1          LLM_MODEL=qwen3:8b']) +
    small('relay(Bedrock) 주소와 조별 토큰은 당일 안내'), 'cmd')
add(5, '실행 기록은 어디서 보나?',
    cols(code(['# .env',
               'LANGSMITH_TRACING=true',
               'LANGSMITH_API_KEY=<smith.langchain.com 무료 키>',
               '',
               '# 코드 수정 없음. 노드 → LLM 호출 · Jev · MCP · 기억 호출이 트리로 올라간다',
               '# 끄면 traces/*.jsonl 만 남는다']) +
         bullets(['노드 하나 = span 하나, 부하 안의 agent ⇄ tools 는 askRadar 아래에 접혀 있다',
                  'LLM 호출은 보낸 메시지 · 받은 답 · 토큰 수까지',
                  '<code>pnpm studio</code> 는 같은 키로 LangGraph Studio 를 띄운다',
                  'Langfuse 로 보는 법은 14:30 이현우 특강에서']),
         '<div class="placeholder img">LangSmith 트리 캡처 자리<br/><span>run → searchDocs · askRadar(agent, tools …) · remember · judge · approve</span></div>'), 'cmd')
add(5, '오늘 만든 것과 요청 항목',
    table(['요청 항목', '오늘 코드', '빈칸'],
          [['Agent Loop · Planning · Tool Calling', 'ask-radar.ts agent ⇄ tools', '1'],
           ['Harness · Context Engineering', 'MAX_STEPS 강제 중단, 부하 대화는 부하 안에만', '2'],
           ['외부 Tool 연계', 'searchDocs(RAG) · look_weather(MCP)', '3'],
           ['MCP', '날씨 MCP 서버 + 클라이언트', '4 · 5'],
           ['Context · Memory · Agentic Retrieval', 'Hindsight remember / retain, 같은 사례면 Jev 생략', '시연'],
           ['State · Checkpoint · Retry', 'reducer 칠판, SqliteSaver, --resume', '9'],
           ['Task Decomposition · Subagent', 'searchDocs(Worker) + askRadar(서브그래프) 동시 실행 후 합류', '7 · 8'],
           ['HITL · 장기 실행 제어', 'interrupt 두 곳, 이어가기', '6 · 9'],
           ['Trace · Evaluation · Observability', 'traces/*.jsonl, LangSmith, Langfuse(특강)', '—'],
           ['권한 · Prompt Injection · Sandbox', '상한 다섯 곳, Deev 실제 탐지 코드, MCP 서버에 키 미전달', '—'],
           ['Jev', 'choice · score · noul 3질문', '10']], 'dense') +
    '<div class="placeholder slot">마무리 5분 자리 (미결): Claude Code · opencode 구조 대응표 / AWS AI-DLC · Kiro / 대기업 Agentic AI 동향</div>', 'table')

# ───────── HTML ─────────
def section(i, b, title, body, kind):
    return f'''<section class="slide k-{kind}" data-i="{i}" data-block="{b}">
  <h1>{title}</h1>
  <div class="body">{body}</div>
  <footer><span class="blk b{b}">{html.escape(BLOCKS[b])}</span><span class="num">{i + 1} / {len(slides)}</span></footer>
</section>'''

CSS = r'''
:root{--bg:#0F141B;--panel:#161D26;--panel2:#1C2531;--text:#E7ECF2;--muted:#8C98A8;--amber:#F2B544;--line:#2A3542;--mag:#C97BDC;
 --t-report:#D9DEE5;--t-setup:#3A4553;--t-llm:#9C4FB5;--t-tool:#2E8B57;--t-mcp:#2A9BAA;--t-memory:#3F6FCC;--t-jev:#C9A52F;--t-human:#C64B4B;--t-rule:#B9C0C9;--t-decide:#1F8A4C;--t-stop:#B83232;--t-node:#3A4553;--t-sub:#8E2EA8;--t-live:#3A4553;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:"IBM Plex Sans KR",system-ui,sans-serif;overflow:hidden}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center center;cursor:pointer;user-select:none}
.slide{position:absolute;inset:0;padding:72px 96px 64px;display:none;flex-direction:column;background:var(--bg)}
.slide.on{display:flex}
.k-dense pre{font-size:15.5px;line-height:1.38;padding:12px 16px}.k-dense .cmd{font-size:21px;padding:9px 16px}
#stage.prerender .slide{display:flex;visibility:hidden}#stage.prerender .slide.on{visibility:visible}
h1{font-size:54px;font-weight:600;line-height:1.2;letter-spacing:-0.01em;margin-bottom:34px;max-width:1700px}
.body{flex:1;min-height:0;font-size:27px;line-height:1.5;display:flex;flex-direction:column;gap:18px}
.body > *{flex:0 0 auto}
footer{display:flex;justify-content:space-between;font-size:19px;color:var(--muted);padding-top:16px;border-top:1px solid var(--line)}
footer .blk::before{content:"";display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:10px;background:var(--amber)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:start;min-height:0}
.cols.r64{grid-template-columns:1.5fr 1fr}
.cols > div{display:flex;flex-direction:column;gap:16px;min-width:0}
pre{font-family:"IBM Plex Mono",ui-monospace,monospace;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px 20px;font-size:17px;line-height:1.45;white-space:pre;overflow:hidden;color:#D5DBE3}
pre.tiny{font-size:16px}
pre.code{color:#D5DBE3}
pre.diff .del{color:#F08B8B;display:block}pre.diff .add{color:#8BE0A4;display:block}
pre.term .tag{display:inline-block;color:#fff;padding:0 6px;border-radius:3px;font-weight:600}
.t-report,.t-rule{color:#111 !important}
.t-report{background:var(--t-report)}.t-setup{background:var(--t-setup)}.t-llm{background:var(--t-llm)}.t-tool{background:var(--t-tool)}.t-mcp{background:var(--t-mcp)}
.t-memory{background:var(--t-memory)}.t-jev{background:var(--t-jev);color:#111 !important}.t-human{background:var(--t-human)}.t-rule{background:var(--t-rule)}
.t-decide{background:var(--t-decide)}.t-stop{background:var(--t-stop)}.t-node{background:var(--t-node)}.t-sub{background:var(--t-sub)}.t-live{background:var(--t-live)}
pre .bar,pre .mag{color:var(--mag);font-weight:700}pre .dim{color:#5B6676}pre .amber{color:var(--amber);font-weight:600}
.cmd{font-family:"IBM Plex Mono",monospace;font-size:24px;background:var(--panel2);border-left:4px solid var(--amber);padding:12px 20px;border-radius:0 6px 6px 0}
.cmd .prompt{color:var(--amber);margin-right:10px}.cmd .note{color:var(--muted);font-size:19px;margin-left:18px}
.ok{border:1px solid var(--amber);border-radius:6px;padding:12px 18px;font-size:23px;line-height:1.45}
.ok > span{display:block;color:var(--amber);font-size:17px;margin-bottom:4px}
ul.list{list-style:none;display:flex;flex-direction:column;gap:12px}
ul.list li{padding-left:26px;position:relative;font-size:25px;line-height:1.45}
ul.list li::before{content:"";position:absolute;left:0;top:16px;width:10px;height:10px;border-radius:50%;background:var(--amber)}
code{font-family:"IBM Plex Mono",monospace;font-size:0.92em;background:var(--panel2);padding:1px 7px;border-radius:4px;color:#E8D9A6}
p{font-size:26px;line-height:1.5}p.small{font-size:20px;color:var(--muted);line-height:1.45}
table.tbl{border-collapse:collapse;width:100%;font-size:22px;line-height:1.4}
table.tbl th{text-align:left;color:var(--muted);font-weight:500;padding:8px 14px;border-bottom:1px solid var(--line);font-size:19px}
table.tbl td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
table.tbl tr:last-child td{border-bottom:none}table.tbl.dense{font-size:20px}table.tbl.dense td{padding:7px 12px}
table.tbl td:first-child{font-weight:600;white-space:nowrap}
table.tbl.plain td{border:none;padding:8px 18px 8px 0;font-size:26px}table.tbl.plain td:first-child{color:var(--amber)}
.intro{display:flex;flex-direction:column;gap:22px;justify-content:center;flex:1}
.intro .name{font-size:88px;font-weight:600;letter-spacing:-0.02em;line-height:1}
.intro .career{font-size:32px;color:var(--muted)}.intro .mail{font-family:"IBM Plex Mono",monospace;font-size:26px;color:var(--amber);margin-top:16px}
.placeholder{border:1px dashed var(--line);border-radius:6px;padding:40px 24px;color:var(--muted);text-align:center;font-size:22px;line-height:1.5}
.placeholder span{font-size:18px}.placeholder.img{min-height:420px;display:flex;flex-direction:column;justify-content:center}
.placeholder.slot{text-align:left;padding:14px 18px;font-size:19px}
figure.shot{display:flex;flex-direction:column;align-items:center;gap:10px}figure.shot img{max-height:640px;max-width:100%;border-radius:8px;border:1px solid var(--line)}figure.shot figcaption{font-size:18px;color:var(--muted);text-align:center;line-height:1.4}
pre.mermaid{background:transparent;border:none;padding:0;display:flex;justify-content:center;align-items:flex-start;color:transparent;width:100%}
pre.mermaid svg{width:100% !important;max-width:none !important;height:auto;max-height:560px}
pre.mermaid .nodeLabel,pre.mermaid .edgeLabel,pre.mermaid .cluster-label{color:#E7ECF2}
pre.mermaid .edgeLabel{background:#0F141B !important;color:#B8C2CF !important;padding:2px 6px}
pre.mermaid svg text{fill:#E7ECF2 !important}pre.mermaid svg .edgeLabel text,pre.mermaid svg .edgeLabel tspan{fill:#B8C2CF !important}pre.mermaid svg .edgeLabel rect,pre.mermaid svg .labelBkg{fill:#0F141B !important;opacity:1}pre.mermaid svg .cluster rect{fill:#131a22 !important;stroke:#3A4553 !important}
#bar{position:fixed;left:0;bottom:0;height:4px;background:var(--amber);width:0;transition:width .2s}
#hint{position:fixed;right:18px;top:12px;font-size:13px;color:var(--muted);opacity:.7}
#overview{position:fixed;inset:0;background:#0A0D12;display:none;overflow:auto;padding:36px 48px;z-index:10}
#overview.on{display:block}
#overview .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:22px}
#overview .cell{position:relative;cursor:pointer;border:2px solid var(--line);border-radius:6px;overflow:hidden;background:var(--bg);aspect-ratio:16/9}
#overview .cell.cur{border-color:var(--amber)}#overview .cell:hover{border-color:#fff}
#overview .cell .mini{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;pointer-events:none}
#overview .cell .mini .slide{display:flex}
#overview .cell .n{position:absolute;right:8px;bottom:6px;font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--amber);background:rgba(15,20,27,.85);padding:1px 7px;border-radius:3px}
#overview .cell .t{position:absolute;left:0;right:0;bottom:0;padding:5px 9px;font-size:12px;color:var(--text);background:linear-gradient(transparent,rgba(15,20,27,.95) 40%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#overview h2{font-size:18px;color:var(--muted);font-weight:500;margin-bottom:18px}
@media (prefers-reduced-motion: reduce){#bar{transition:none}}
'''

JS = r'''
const slides=[...document.querySelectorAll('#stage .slide')], N=slides.length;
let cur=0;
const stage=document.getElementById('stage'), ov=document.getElementById('overview'), bar=document.getElementById('bar');
function fit(){const s=Math.min(innerWidth/1920, innerHeight/1080); stage.style.transform=`translate(-50%,-50%) scale(${s})`;}
function go(i, push=true){cur=Math.max(0,Math.min(N-1,i)); slides.forEach((s,k)=>s.classList.toggle('on',k===cur)); bar.style.width=((cur+1)/N*100)+'%'; if(push) history.replaceState(null,'','#'+(cur+1)); document.title=`${cur+1}/${N} · ${slides[cur].querySelector('h1').textContent}`;}
function openOverview(){const g=ov.querySelector('.grid'); g.innerHTML=''; slides.forEach((s,k)=>{const c=document.createElement('div'); c.className='cell'+(k===cur?' cur':''); const m=document.createElement('div'); m.className='mini'; const clone=s.cloneNode(true); clone.classList.add('on'); m.appendChild(clone); c.appendChild(m); const n=document.createElement('div'); n.className='n'; n.textContent=k+1; const t=document.createElement('div'); t.className='t'; t.textContent=s.querySelector('h1').textContent; c.appendChild(t); c.appendChild(n); c.onclick=(e)=>{e.stopPropagation(); go(k); closeOverview();}; g.appendChild(c);}); ov.classList.add('on'); requestAnimationFrame(scaleCells); setTimeout(()=>{const cc=g.querySelector('.cell.cur'); cc&&cc.scrollIntoView({block:'center'});},0);}
function scaleCells(){ov.querySelectorAll('.cell').forEach(c=>{const w=c.clientWidth; c.querySelector('.mini').style.transform=`scale(${w/1920})`;});}
function closeOverview(){ov.classList.remove('on');}
stage.addEventListener('click',(e)=>{const r=stage.getBoundingClientRect(); if(e.clientX < r.left + r.width/2) go(cur-1); else go(cur+1);});
ov.addEventListener('click',closeOverview);
addEventListener('keydown',(e)=>{
  if(e.key==='o'||e.key==='O'){ov.classList.contains('on')?closeOverview():openOverview(); return;}
  if(e.key==='Escape'){closeOverview(); return;}
  if(ov.classList.contains('on')) return;
  if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(e.key)){e.preventDefault(); go(cur+1);}
  else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(e.key)){e.preventDefault(); go(cur-1);}
  else if(e.key==='Home') go(0); else if(e.key==='End') go(N-1);
  else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}
});
addEventListener('resize',()=>{fit(); if(ov.classList.contains('on')) scaleCells();});
addEventListener('hashchange',()=>{const n=(parseInt(location.hash.slice(1))||1)-1; if(n!==cur) go(n,false);});
fit(); go((parseInt(location.hash.slice(1))||1)-1,false);
if(window.mermaid){mermaid.initialize({startOnLoad:false,theme:'base',securityLevel:'loose',htmlLabels:false,flowchart:{curve:'linear',htmlLabels:false,padding:14,nodeSpacing:40,rankSpacing:50},themeVariables:{background:'#0F141B',primaryColor:'#1C2531',primaryTextColor:'#E7ECF2',primaryBorderColor:'#3A4553',lineColor:'#8C98A8',secondaryColor:'#161D26',tertiaryColor:'#161D26',clusterBkg:'#131a22',clusterBorder:'#3A4553',edgeLabelBackground:'#0F141B',fontFamily:'IBM Plex Sans KR, sans-serif',fontSize:'20px'}}); stage.classList.add('prerender'); (document.fonts?Promise.all([document.fonts.load('20px "IBM Plex Sans KR"','agent searchDocs remember 보고 수집'),document.fonts.load('600 54px "IBM Plex Sans KR"','가 abc'),document.fonts.load('18px "IBM Plex Mono"','abc')]).then(()=>document.fonts.ready):Promise.resolve()).then(()=>mermaid.run({querySelector:'pre.mermaid'})).then(()=>{document.querySelectorAll('pre.mermaid').forEach(p=>p.style.color='inherit');}).finally(()=>stage.classList.remove('prerender'));}
'''

sections = '\n'.join(section(i, b, t, body, k) for i, (b, t, body, k) in enumerate(slides))
page = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentic AI 2일차 — 스크램블 판단 보조 Agent 핸즈온</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>{CSS}</style>
</head>
<body>
<div id="stage">
{sections}
</div>
<div id="bar"></div>
<div id="hint">← → 이동 · O 전체보기 · F 전체화면</div>
<div id="overview"><h2>전체보기 — 장을 누르면 그 장으로 (O 또는 Esc 로 닫기)</h2><div class="grid"></div></div>
<script>{JS}</script>
</body>
</html>'''
out = R / 'docs/slides/day2.html'
out.write_text(page, encoding='utf-8')
print(f'{out} — {len(slides)}장, {len(page)//1024}KB')
for i, (b, t, _, k) in enumerate(slides): print(f'{i+1:2d} [{BLOCKS[b]}] {t}')
