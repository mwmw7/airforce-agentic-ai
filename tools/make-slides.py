# -*- coding: utf-8 -*-
"""tools/make-slides.py — 2일차 강의 슬라이드 생성기 → docs/slides/day2.html 한 파일
   재료: docs/slides/captures/*.txt (터미널 캡처, mock) · 빈칸 before/after 는 main 코드의 TODO 마커에서 바로 읽음 · docs/graphs/agent.md (Mermaid)
   실행: python3 tools/make-slides.py   (캡처를 새로 뽑았거나 문안을 고쳤을 때)
   보기: docs/slides/day2.html 을 브라우저로. ← → 이동, 화면 왼쪽/오른쪽 클릭, O 전체보기, F 전체화면"""
import html, json, re, unicodedata
from pathlib import Path

R = Path(__file__).resolve().parent.parent
S = R / 'docs/slides/captures'
CAP = S
def read_todos():
    """main(완성본) 코드의 빈칸 마커에서 before(자리표시 //!) / after(정답)를 뽑는다. 'TODO 4' 에는 4-1 · 4-2 가 나온 순서대로 parts 로 들어간다"""
    todos = {}
    for f in ['labs/agent/main.ts', 'labs/agent/ask-radar.ts', 'labs/agent/search-docs.ts', 'mcp-servers/weather/server.ts', 'labs/agent/mcp.ts']:
        ls = (R / f).read_text(encoding='utf-8').split('\n'); name = None
        for i, l in enumerate(ls):
            m = re.match(r'\s*// ===== (TODO (\d+)[^:]*): (.*) =====', l)
            if m: name, label = f'TODO {m.group(2)}', m.group(1)   # label = 마커 그대로 (TODO 4-2 처럼 소번호 포함)
            if re.match(r'\s*// ----- SOLUTION -----', l):
                part = {'before': [], 'after': [], 'file': f, 'label': label}   # 파일 · 소번호는 part 마다 (TODO 4 는 두 파일에 걸친다)
                for x in ls[i + 1:]:
                    if re.match(r'\s*// ----- END SOLUTION -----', x): break
                    pm = re.match(r'\s*//! ?(.*)', x)
                    if pm: part['before'].append(pm.group(1))
                    else: part['after'].append(x)
                todos.setdefault(name, {'file': f, 'parts': []})['parts'].append(part)
    return todos
TODOS = read_todos()
def read_graph(name):
    """docs/graphs/<name>.md 의 Mermaid 를 슬라이드 테마에 맞게 다듬는다 (색 지정 · init 줄을 빼고 슬라이드 쪽 테마를 쓴다)"""
    src = re.search(r'```mermaid\n(.*?)```', (R / f'docs/graphs/{name}.md').read_text(encoding='utf-8'), re.S).group(1).strip()
    return '\n'.join(l for l in src.split('\n') if not l.strip().startswith('classDef') and not l.strip().startswith('%%')).replace(':::first','').replace(':::last','').replace('<p>','').replace('</p>','')
MERMAID = read_graph('agent').replace('graph TD;', 'graph LR;')

def graph_change(before, after):
    """단계 그림 둘(docs/graphs/step-*.md, pnpm see:steps 로 생성)을 비교해 뒤 그림에서 새로 생긴 노드 · 선을 앰버로 칠한다"""
    a, b = read_graph(before), read_graph(after)
    node = lambda l: re.match(r'\s*(\w+)\(', l)
    edge = lambda l: re.search(r'-\.?->', l)
    nodes_a = {node(l).group(1) for l in a.split('\n') if node(l)}
    edges_a = {l.strip() for l in a.split('\n') if edge(l)}
    new_nodes = [node(l).group(1) for l in b.split('\n') if node(l) and node(l).group(1) not in nodes_a]
    edges_b = [l.strip() for l in b.split('\n') if edge(l)]
    new_edges = [i for i, l in enumerate(edges_b) if l not in edges_a]
    marks = ['classDef new stroke:#F2B544,stroke-width:3px']
    if new_nodes: marks.append(f'class {",".join(new_nodes)} new')
    if new_edges: marks.append(f'linkStyle {",".join(map(str, new_edges))} stroke:#F2B544,stroke-width:3px')
    return a, b + '\n' + '\n'.join(marks)

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

TAGS = ['REPORT','SETUP','LLM','TOOL','MCP','MEMORY','JEV','RULE','HUMAN','DECIDE','STOP','NODE','SUB','LIVE','WRITE']
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
def snip(file, pre):
    """코드 상자 위에 파일 이름 탭 — 30명이 어느 파일을 보는지 한눈에. file 이 비면 상자만"""
    return f'<div class="snip"><div class="file">{html.escape(file)}</div>{pre}</div>' if file else pre
def code(lines, w=76, file=''):
    return snip(file, '<pre class="code">' + '\n'.join(html.escape(cut(l, w)) for l in lines) + '</pre>')
def diff(todo, part=0, w=74):
    t = TODOS[todo]; p = t['parts'][part]
    label = p['file'] + ' · ' + p['label']   # 예: labs/agent/mcp.ts · TODO 4-2
    out = []
    for l in p['before']: out.append('<span class="del">- ' + html.escape(cut(l.strip(), w)) + '</span>')
    for l in p['after']:
        s = l.strip()
        if not s: continue
        out.append('<span class="add">+ ' + html.escape(cut(s, w)) + '</span>')
    return snip(label, '<pre class="diff">' + ''.join(out) + '</pre>')
def diff_ctx(lines, file='', w=74):
    """앞뒤 문맥이 있는 diff: (' ' | '-' | '+', 줄) 목록. 문맥 줄은 회색, 지울 줄 빨강, 넣을 줄 초록"""
    cls = {' ': 'ctx', '-': 'del', '+': 'add'}
    out = [f'<span class="{cls[k]}">{k} ' + html.escape(cut(l, w)) + '</span>' for k, l in lines]
    return snip(file, '<pre class="diff">' + ''.join(out) + '</pre>')
def diff_raw(before, after, file='', w=74):
    out = ['<span class="del">- ' + html.escape(cut(l, w)) + '</span>' for l in before] + ['<span class="add">+ ' + html.escape(cut(l, w)) + '</span>' for l in after]
    return snip(file, '<pre class="diff">' + ''.join(out) + '</pre>')
def cmd(c, note=''):
    return (f'<div class="cmd"><span class="prompt">$</span> <span class="c">{html.escape(c)}</span>' + (f'<span class="note">{html.escape(note)}</span>' if note else '')
            + '<button class="copy" title="명령 복사">복사</button></div>')  # 명령만 복사한다 (설명은 빼고)
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

BLOCKS = ['오프닝', '1교시 · Subagent 와 도구 (단계 1 · 2)', '2교시 · 자료 · MCP · 동시 (단계 3 · 4 · 5)', '3교시 · 판정 · 사람 · 기억 (단계 6 · 7 · 8)', '운영']
slides = []  # (block, title, body_html, kind, step)
LAST_STEP = 8          # 핸즈온 단계 0 ~ 8. 푸터 게이지가 "지금 몇 단계 · 남은 몇" 을 그린다
step_now = None        # 아직 단계 표지 전(오프닝)이면 None → 게이지 없음
def add(block, title, body, kind='text'):
    slides.append((block, title, body, kind, LAST_STEP + 1 if block == 4 else step_now))  # 운영 블록 = 전부 끝
def step_tag(n, title): return f'<span class="amber">{n}단계</span> · {title}'
def cover(block, n, title, what, where, shows, concept, day1=''):
    """단계 표지: pnpm step N 한 줄 + 같이 붙이는 것 · 파일 · 화면 · 개념. 1일차에서 가져오는 것은 day1 에"""
    rows = [['같이 붙이는 것', what], ['파일 (TODO)', where], ['화면에 생기는 것', shows], ['개념', concept]]
    if day1: rows.append(['1일차에서', day1])
    global step_now; step_now = n
    c = cmd(f'pnpm step {n}', '늦었으면 이걸로 따라잡기 — 1 ~ ' + f'{n - 1} 은 정답, {n} 부터 내 차례' if n > 1 else '처음 상태 — 1 ~ 8 전부 빈칸') if n else cmd('pnpm agent', '빈칸이 전부 비어 있어도 끝까지 돈다 (= pnpm step 1 상태)')
    add(block, step_tag(n, title), c + table(['', ''], rows, 'plain meta'), 'cover')

# ───────── 0. 오프닝 ─────────
add(0, '소개', '''
<div class="intro">
  <div class="name">최호섭</div>
  <div class="career">삼성전자 R&amp;D센터 → 툰스퀘어 CTO</div>
  <table class="tbl plain">
    <tr><td>Tooning Edu</td><td>웹툰 제작 툴</td></tr>
    <tr><td>Tooning Plus</td><td>Tooning 의 유료 고급 기능</td></tr>
    <tr><td>Deev</td><td>캐릭터 챗 서비스. 오늘 오후에 이 서비스의 실제 지시문 탐지 코드를 봅니다</td></tr>
  </table>
  <div class="mail">branden@tooning.io</div>
</div>''', 'text')
add(0, '보고 한 줄이 들어오면, 수집하고, 기억하고, 판정하고, 사람이 결정한다',
    mermaid(MERMAID) +
    cols(bullets(['규정집 Worker 와 레이더 Subagent 가 <b>동시에</b> 자료를 모은다',
                  '전에 같은 보고를 판단했으면 기억이 답한다 (Jev 생략)',
                  '없으면 Jev 가 출격 / 감시 / 무시 의견을 낸다']),
         bullets(['마지막 버튼은 언제나 사람이 누른다',
                  '오늘 이 그래프를 <b>거의 빈 Agent 에서 8단계로</b> 같이 붙여 완성한다',
                  '점선은 조건에 따라 갈리는 선, 실선은 항상 가는 선'])), 'fig')
add(0, '시작은 링크 하나: Codespaces 에서 hands-on 브랜치 열기',
    cols('<figure class="shot"><img src="captures/codespace_start.png" alt="Codespaces 만들기 화면"><figcaption>링크를 열면 보이는 화면 — 저장소 · 브랜치 hands-on · 2-core 가 미리 골라져 있다. 초록 단추만 누른다</figcaption></figure>',
         '<figure class="qr"><img src="captures/codespace_qr.png" alt="Codespaces 링크 QR"><figcaption>폰으로 찍어도 같은 링크</figcaption></figure>' +
         cmd('https://codespaces.new/mwmw7/airforce-agentic-ai?ref=hands-on', 'GitHub 로그인만 있으면 된다') +
         bullets(['브랜치가 <b>hands-on</b> 인지 확인하고 <b>Create codespace</b>',
                  '브라우저에 VS Code 가 뜨면 설치 · .env · 환경 점검이 <b>자동으로</b> 끝난다 (<code>.devcontainer/</code>). "준비 끝" 이 보이면 <code>pnpm agent</code>',
                  '개인 계정은 달마다 2-core 60시간이 무료. 이틀 교육은 10시간이면 끝',
                  '30분 안 쓰면 자동으로 멈춘다. 다시 열면 그 자리부터 (점심 뒤)',
                  'Codespaces 를 못 쓰면 README <b>1-3</b> 대로 노트북에 직접 설치 (clone · install · setup:check). 그 뒤는 똑같다']) +
         small('fork 는 안 해도 된다. 끝나고 남기고 싶으면 push 할 때 자동으로 내 fork 가 생긴다'), ratio='r64'), 'cmd')
add(0, '오늘의 규칙: 같이 하나씩 붙이고, 매번 다시 돌린다',
    cols(cmd('pnpm agent', '"준비 끝" 이 보이면 이것 하나. 빈칸이 비어 있어도 끝까지 돈다') +
         bullets(['문제는 <b>TODO 1 ~ 8</b>. 단계 번호 = TODO 번호. 파일 안에서 <code>// ===== TODO n</code> 을 찾는다',
                  '강사가 화면에서 치면 같이 친다. 채운 뒤 <code>pnpm agent</code> → 화면에 새 줄이 생긴다',
                  '키가 하나도 없어도 mock 모드로 전부 돈다. 설치 · <code>.env</code> · 점검은 Codespaces 가 이미 끝냈다']),
         table(['늦었으면', '상태'],
               [['<code>pnpm step 1</code>', '1 ~ 8 전부 남음 (처음 상태)'],
                ['<code>pnpm step 4</code>', '1 ~ 3 풀림, 4번을 풀 차례'],
                ['<code>pnpm step 8</code>', '1 ~ 7 풀림, 8번만 남음'],
                ['<code>pnpm step done</code>', '전부 풀림 (main 과 같음)']]) +
         small('강사가 "4단계 시작합니다" 하면 늦은 사람도 같은 숫자 4. 정답은 main 브랜치에서 가져오고, 빈칸이 든 파일만 덮어쓴다 (먼저 묻는다)')), 'cmd')
add(0, '오늘 일정',
    table(['시간', '단계', '같이 붙이는 것', '따라잡기', '공군 요청 항목'],
          [['09:00 ~ 09:50', '0 · 1 · 2', '첫 실행, 레이더 Subagent 데려오기, Subagent 에게 도구 하나 더', '<code>pnpm step 1</code>', 'Subagent · Agent Loop · Harness · Tool'],
           ['10:05 ~ 11:00', '3 · 4 · 5', '규정집 찾기, 날씨 MCP, 동시에 모으기', '<code>pnpm step 3</code>', 'RAG · MCP · Task Decomposition'],
           ['11:15 ~ 12:00', '6 · 7 · 8', 'Jev 판정, 사람 답으로 이어가기, 기억', '<code>pnpm step 6</code>', '판정 모델 · HITL · Checkpoint · Memory'],
           ['13:00 ~ 14:10', '시연', '자료 속 지시문, 모델 교체, 실행 기록', '<code>pnpm step done</code>', 'Guardrail · Sandbox · Trace'],
           ['14:30 ~ 16:00', '특강 (정진태)', 'Langfuse 로 검증과 활용', '', 'Evaluation · Observability']]) +
    small('휴식 09:50 · 11:00 · 14:10 — 휴식 뒤 늦은 사람은 그 교시의 <code>pnpm step</code> 숫자로 맞춘다. 정답은 main 에서 가져오고 빈칸 든 파일만 덮어쓴다 (먼저 묻는다)'), 'table')
add(0, '1일차에서 가져오는 것 — 어제 배운 것을 오늘 어디에 쓰나',
    table(['1일차', '배운 것', '오늘 단계'],
          [['오전', '도구 = 이름 + 설명 + 입력 모양 + 실행 함수 · tool_calls ↔ role: "tool" 왕복', '<b>2단계</b> look_flight_plan (설명 + 실행) · 1단계 askRadar 안의 agent ⇄ tools 는 완성 코드로'],
           ['① 그래프', '노드 · 엣지 · route · recursionLimit', '<b>1단계</b> addNode 에 서브그래프 · <b>5단계</b> addEdge 로 동시 + 합류 · MAX_STEPS 는 stop 노드 (완성 코드)'],
           ['② State', 'reducer · 같은 칸에 두 노드가 쓰면 · stream', '<b>1단계</b> MainState / RadarState 로 나눈다 (이름 겹치는 칸만 부모로) · <code>--watch</code> 로 reducer 보기'],
           ['③ 사람', 'interrupt · Command resume · thread_id · MemorySaver', '<b>7단계</b> approve 의 interrupt 와 Command({ resume }) · MemorySaver → SqliteSaver 한 줄, 실행번호 = thread_id'],
           ['④ 기억', '같은 thread 로 이어 묻기 · 요약 · 장기 기억(개념) · 서브그래프 = 노드(개념)', '<b>8단계</b> Hindsight findSameCase · retain · 1단계에서 서브그래프를 실제로 꽂는다']], 'dense') +
    small('어제와 같은 코드는 오늘 다시 설명하지 않는다. 막히면 어제 자료의 그 장을 편다'), 'table')
cover(0, 0, '첫 실행', '아무것도 안 붙인다. 구조를 보고 한 번 돌린다', '—', '보고만 있고 근거가 빈 담당자 화면', '전체 구조 · 빈칸이 비어도 끝까지 돈다')
add(0, step_tag(0, '첫 실행: 근거가 텅 빈 담당자 화면'),
    cols(term(pick('00_step1_blank.txt', [r'^\[TOOL', r'^\[HUMAN \] 종합', r'^\s+│ (보고|관련 규정|기억|Jev 판정|코드 권고|모델이 정리한 사실)$', r'^\s+│\s+· (관련 규정 없음|비슷한|watch|Jev 도|\(TODO)', r'^\[STOP', r'^\[DECIDE'], limit=18)) + cmd('pnpm agent 3'),
         bullets(['보고는 들어왔는데 <b>눈(레이더)이 없다</b>. 규정도, 날씨도, 기억도 없다',
                  'Jev 자리는 "확신 0%" — 코드 규칙이 "사람이 한 번 더 확인" 으로 보낸다',
                  '마지막 줄: 사람 답을 받고도 이어가지 않는다 (TODO 7)',
                  '오늘 8단계 동안 이 화면에 줄이 하나씩 늘어난다']) +
         ok('끝까지 돌고 <code>[DECIDE]</code> 가 찍힌다. 빈칸이 비어도 프로그램은 멈추지 않는다')), 'cmd')

# ───────── 1. 단계 1 · 2 ─────────
cover(1, 1, '레이더 Subagent 데려오기', '<code>addNode("askRadar", radarAgent)</code> — 함수 자리에 compile() 된 그래프', '<code>main.ts</code> (TODO 1)', '<code>[SUB] ┏━ askRadar</code> 띠, 레이더 · 확대 줄', 'Subagent · Agent Loop', '오전 agent ⇄ tools 루프 그대로 (완성 코드) · ④ 서브그래프 = 노드')
add(1, step_tag(1, '레이더 담당 Subagent 데려오기'),
    cols(diff('TODO 1') + cmd('pnpm agent 1') +
         bullets(['<code>ask-radar.ts</code> 는 1일차에 만든 것과 같은 <b>도구 쓰는 Agent</b> 하나다',
                  '함수 자리에 <code>compile()</code> 된 그래프를 넣으면 그게 Subagent 다',
                  '부모와 이름이 겹치는 칸(facts · evidence · steps)만 돌아온다. Subagent 의 대화는 Subagent 안에',
                  '<code>pnpm agent:limit</code> (MAX_STEPS=1): Subagent 만 <code>[STOP]</code>, 부모는 규정집 결과로 판정까지']),
         term(pick('02_run1_first.txt', [r'^\[TOOL  \] search_docs', r'^\[SUB', r'^┃ \[(LLM|TOOL)'], limit=10)) +
         ok('<code>[SUB] ┏━ askRadar</code> 띠가 열리고, 담당자 화면에 <b>레이더 · 확대</b> 줄이 생긴다')), 'diff')
G1, G2 = graph_change('step-1', 'step-2')
add(1, '1단계 전후 — 그래프에서 무엇이 바뀌었나?',
    cols(mermaid(G1) + small('채우기 전 (<code>pnpm step 1</code>): askRadar 는 함수 하나짜리 가짜 Subagent'),
         mermaid(G2) + small('채운 뒤 (<code>pnpm step 2</code>): askRadar 가 <span class="amber">agent ⇄ tools 루프</span>로 펼쳐진다')) +
    bullets(['바뀐 건 노드 <b>하나의 속</b>. 바깥 선(searchDocs → askRadar → remember)은 그대로다',
             '오늘 그래프 모양이 바뀌는 건 두 번뿐: 지금(1단계, 노드)과 5단계(선). 나머지 단계는 노드 안의 코드만 채운다',
             '그림 다시 뽑기: <code>pnpm see:steps</code> → <code>docs/graphs/step-*.md</code>']), 'fig')
add(1, '왜 나누나?',
    table(['이점', '하나의 루프였을 때', 'Subagent 로 나누면', '어디서 보이나'],
          [['Subagent 가 멈춰도 부모는 산다', 'MAX_STEPS 면 전체 종료', 'Subagent 만 끝나고 규정집 결과로 판정까지', '<code>pnpm agent:limit</code>'],
           ['Subagent 단위로 갈아 끼운다', '루프 · 판정 · 승인이 한 파일에', '모델 · 키 · 도구를 Subagent 만 바꾸거나 옆에 하나 더', '다음 단계'],
           ['속도', '—', '<b>5단계에서 동시로 바꿔도 지금 구성에선 없다.</b> 모델 쓰는 가지가 하나뿐이고, 노트북 GPU 는 요청을 한 줄로 받는다', '가지 2개 이상 + 원격 모델일 때']]) +
    small('이점이 아닌 것: 판정 정확도는 안 바뀐다(judge 는 facts 만 읽는다) · 코드가 짧아지지 않는다(파일 둘, State 둘) · LangGraph 에겐 그냥 노드 하나'), 'table')

add(1, '모델이 늦으면?',
    cols(term(pick('06_slow.txt', [r'^┃ \[LLM', r'^┃ \[HUMAN', r'^\[SUB   \] ┗', r'^\[HUMAN', r'^\[DECIDE'], limit=8)) + cmd('LLM_MOCK_SLOW=1 pnpm agent 4'),
         bullets(['한 번 호출이 <code>LLM_TIMEOUT_SEC</code> 를 넘으면 끊는다',
                  '끊은 뒤 뭘 할지는 코드가 정하지 않고 <b>사람에게 묻는다</b>: retry / skip / stop',
                  'skip 이면 사실 없이 판정으로, stop 이면 전부 중단',
                  '실행 전체가 <code>RUN_TIMEOUT_SEC</code> 를 넘어도 끊는다'])), 'cmd')
cover(1, 2, 'Subagent 에게 도구 하나 더', '<code>look_flight_plan</code> — 설명(2-1) + 실행(2-2)', '<code>ask-radar.ts</code> (TODO 2-1 · 2-2)', '<code>[TOOL] look_flight_plan</code>, 비행 계획 줄 (<code>pnpm agent 3</code>)', 'Tool Calling — 설명이 선택을 정한다', '오전 도구 = 설명 + 실행')
add(1, step_tag(2, 'Subagent 에게 도구 하나 더 — 비행 계획 조회'),
    cols(diff('TODO 2', 0, w=88) + diff('TODO 2', 1, w=88) + cmd('pnpm agent 3', '잠실 드론'),
         term(pick('14_flight_plan.txt', [r'^┃ \[LLM   \] 3회째', r'^┃ \[TOOL  \] look_flight_plan', r'^\s+│ 비행 계획$', r'신청 없음'], limit=5)) +
         bullets(['도구 = <b>설명(모델이 읽는 것)</b> + <b>실행(내 코드)</b>. 둘 다 내가 쓴다',
                  '모델은 description 을 읽고 "언제 쓸지" 정한다. 설명이 선택을 정한다',
                  '자료 <code>data/api/flight-plans.json</code>: 잠실 드론 쇼는 신청 없음']) +
         ok('<code>[TOOL] look_flight_plan</code> 이 찍히고 담당자 화면에 <b>비행 계획</b> 줄이 생긴다')), 'dense')

# ───────── 2. 단계 3 · 4 · 5 ─────────
cover(2, 3, '규정집 줄마다 점수 매기기', '보고와 겹치는 단어 수로 규정 줄에 점수 → 상위 3줄', '<code>search-docs.ts</code> (TODO 3)', '관련 규정 줄 (<code>pnpm agent 2</code>)', 'RAG · Worker (모델 호출 없는 함수)')
add(2, '모델이 모르는 문서는?',
    cols(mermaid('''flowchart LR
  Q["보고 한 줄"] --> W["단어로 쪼개기"]
  W --> SC["규정집 10줄에<br/>겹치는 단어 수로 점수"]
  SC --> T["상위 3줄"]
  T --> EV["State evidence"]
  EV --> J["judge · approve 가 본다"]'''),
         bullets(['RAG = 모델이 답하기 전에 <b>자료를 찾아서 넣어 주는</b> 구조',
                  '어떻게 찾느냐는 자유. 오늘은 가장 단순한 겹치는 단어 수',
                  '임베딩으로 바꾸고 싶으면 점수 함수 하나만 바꾼다. 그래프는 그대로',
                  '규정집은 <code>data/docs/rulebook.md</code> 열 줄, 전부 가상']), ratio='r64'), 'fig')
add(2, step_tag(3, '규정 한 줄에 점수 매기기'),
    cols(diff('TODO 3') + cmd('pnpm agent 2'),
         term(pick('07_mcp_off.txt', [r'^\[TOOL  \] search_docs', r'^\s+│ \d+\. '], limit=4)) +
         term(pick('07_mcp_off.txt', [r'^\s+│ 관련 규정$', r'^\s+│\s+· \d+\. '], limit=4)) +
         ok('담당자 화면 <b>관련 규정</b> 에 풍선 규정이 올라온다. 점수가 전부 0 이면 "관련 규정 없음"')), 'diff')
add(2, 'Worker 와 Subagent 는 뭐가 다른가?',
    cols(table(['', 'Worker', 'Subagent'],
               [['하는 일', '정해진 일 하나', '목표 하나를 받아 알아서 끝냄'],
                ['모델 호출', '없음', '있음, 반복 (도구를 고르고 또 고름)'],
                ['실행 횟수', '항상 같음', '상황마다 다름'],
                ['코드 모양', '함수 하나', '그래프 하나 (agent ⇄ tools)'],
                ['우리 코드', 'searchDocs (3단계)', 'askRadar (1단계)']]),
         bullets(['복사기와 인턴. 복사기는 몇 장 나올지 미리 알고, 인턴은 몇 번 왔다 갔다 할지 자기가 정한다',
                  '<b>LangGraph 에겐 둘 다 노드 하나다.</b> 안에 모델 루프가 있으면 우리가 Subagent 라고 부를 뿐',
                  '선 잇기 · 체크포인트 · interrupt 코드는 둘이 완전히 같다']) +
         code(['.addNode("searchDocs", searchDocsNode)   // 함수',
               '.addNode("askRadar",   radarAgent)       // compile() 된 그래프'], file='labs/agent/main.ts')), 'table')
cover(2, 4, '날씨를 MCP 로', '서버에 <code>registerTool</code>(4-1) · 클라이언트에서 목록 받고 실행(4-2)', '<code>mcp-servers/weather/server.ts</code> (4-1) · <code>mcp.ts</code> (4-2)', '날씨 줄 (<code>pnpm mcp:weather</code> 켠 채). 끄면 "날씨 없이 계속"', 'MCP — 도구를 다른 프로세스에')
add(2, '도구를 다른 프로세스에 두면?',
    cols(mermaid('''flowchart LR
  subgraph agent["내 Agent (MCP Host · Client)"]
    A[agent] --> L["도구 목록 = 로컬 3개 + MCP 서버 것"]
  end
  subgraph srv["mcp-servers/weather (MCP Server · localhost:3333)"]
    W["look_weather"]
  end
  L -- "listTools()" --> W
  L -- "callTool()" --> W'''),
         bullets(['MCP = 도구를 <b>다른 프로세스</b>에 두고 표준 규약으로 부르는 것',
                  '서버: <code>registerTool</code> 로 이름 · 설명 · 입력 모양 · 실행 함수를 등록 (4-1)',
                  '클라이언트: 접속 → 목록 받기 → 실행 (4-2)',
                  '모델 입장에선 2단계에서 만든 로컬 도구와 구분이 없다. 같은 목록에 섞여 있을 뿐'])), 'fig')
add(2, step_tag(4, '날씨를 MCP 로 — 서버에 등록, 클라이언트에서 목록 받고 실행'),
    cols(diff('TODO 4', 0, w=88) + cmd('pnpm mcp:weather', '다른 터미널에서 먼저') + cmd('pnpm mcp:inspect', 'http://localhost:3333/mcp'),
         diff('TODO 4', 1, w=88) + diff('TODO 4', 2, w=88) + cmd('pnpm agent') +
         term(pick('02_run1_first.txt', [r'^┃ \[MCP   \] 날씨 서버 연결 OK', r'^┃ \[MCP   \] look_weather'], limit=2)) +
         ok('<code>[MCP] 날씨 서버 연결 OK — 도구 1개</code>, 담당자 화면에 <b>날씨</b> 줄')), 'dense')
add(2, '서버를 끄면?',
    cols(term(pick('07_mcp_off.txt', [r'^┃ \[MCP   \] 날씨 서버 연결 실패', r'^┃ \[LLM', r'^\[SUB   \] ┗', r'^\[DECIDE'], limit=7)) + cmd('pnpm agent 2', '날씨 서버를 끈 채로'),
         bullets(['연결 실패는 <b>에러가 아니라 안내 한 줄</b>이다',
                  '도구 목록에서 날씨만 빠지고 Agent 는 계속 간다',
                  '외부 의존이 죽어도 Agent 가 사는 것은 코드로 정해 둔 일이다',
                  '어디서 그렇게 했나: <code>labs/agent/mcp.ts</code> 의 <code>connectMcp</code> 가 null 을 돌려준다'])), 'cmd')
cover(2, 5, '순차를 동시로', '<code>START → 둘</code>, <code>[둘] → remember</code> 세 줄', '<code>main.ts</code> (TODO 5)', '<code>--watch</code> 에서 searchDocs · askRadar 가 같이 시작', 'Task Decomposition · 병렬', '① addEdge · ② 같은 단계에서 두 노드가 쓰면 (reducer)')
add(2, step_tag(5, '순차를 동시로'),
    cols(diff('TODO 5') + cmd('pnpm agent 1 --watch') +
         small('LangGraph 는 한 단계의 노드가 전부 끝나야 다음으로 간다. 배열로 묶으면 "둘 다 끝나야" 가 코드에 보이고, 가지 길이가 달라도 안전하다'),
         term(pick('08_sequential_watch.txt', [r'^\[NODE  \] [▶◀] (searchDocs|askRadar) '], limit=3)) + small('채우기 전: 규정집이 끝나야 레이더가 출발') +
         term(pick('05_watch.txt', [r'^\[NODE  \] [▶◀] (searchDocs|askRadar|remember) '], limit=5)) + small('채운 뒤: 둘이 같이 출발, remember 는 둘 다 끝나야') +
         ok('<code>▶ askRadar</code> 와 <code>▶ searchDocs</code> 가 나란히 시작하고, remember 가 <code>← join:searchDocs+askRadar</code> 로 깨어난다')), 'diff')
G5, G6 = graph_change('step-5', 'step-6')
add(2, '5단계 전후 — 그래프에서 무엇이 바뀌었나?',
    cols(mermaid(G5) + small('채우기 전 (<code>pnpm step 5</code>): 규정집 → 레이더 → remember, 한 줄로'),
         mermaid(G6) + small('채운 뒤 (<code>pnpm step 6</code>): <span class="amber">START 에서 둘로 갈라졌다가 remember 에서 합류</span>')) +
    bullets(['노드는 하나도 안 늘었다. 코드 세 줄을 바꿨고, 그림에선 <b>searchDocs → askRadar 선이 빠지고 앰버 선 두 개가 생겼다</b>',
             '1단계는 노드 속을, 5단계는 노드 사이의 선을 바꿨다. 오늘 그래프 모양이 바뀌는 건 이 두 번이 전부다']), 'fig')
# ───────── 3. 단계 6 · 7 · 8 ─────────
cover(3, 6, 'Jev 에게 묻기', '<code>askJev(단서, QUESTIONS)</code> 한 줄 — 출격/감시/무시 · 위험도 · 정체불명', '<code>main.ts</code> (TODO 6)', 'Jev 판정 줄 (확신도 · 위험도 · 정체불명)', '판정 모델 — 의견은 Jev, 규칙은 코드')
add(3, 'LLM 말고 Jev 를 쓰면?',
    cols(table(['', 'LLM', 'Jev (TypeSafe System One)'],
               [['돌려주는 것', '문장', '확률 + 확신도'],
                ['질문 모양', '자유 프롬프트', 'choice · score · noul 세 종류'],
                ['속도', '초 단위', '밀리초 단위'],
                ['우리 코드', 'Subagent 의 사실 정리', 'judge 노드 3질문 (QUESTIONS)']]),
         code(['const QUESTIONS = {',
               '  action:  { type: "choice", criteria: { scramble, watch, ignore } },',
               '  danger:  { type: "score",  criteria: ["안 위험", "조금", "꽤", "비상"] },',
               '  unknown: { type: "noul",   instructions: "정체가 무엇인지 전혀 짐작이 안 가서 …" },',
               '};'], file='labs/agent/main.ts') +
         bullets(['Jev 는 <b>의견</b>만 준다. 출격 / 감시 / 무시를 정하는 규칙은 코드에 있다',
                  '키가 없으면 <code>JEV_MODE=local</code> 로 Jev 자리를 정규식 규칙이 대신한다. 흐름은 똑같이 돈다'])), 'table')
add(3, step_tag(6, 'Jev 에게 묻기'),
    cols(diff('TODO 6', w=88) + cmd('pnpm agent 1') +
         bullets(['질문 세 개는 위에 <code>QUESTIONS</code> 로 미리 적혀 있다. 빈칸은 묻는 한 줄',
                  '비워 두면 "확신 0% 감시" 뿐이라 코드 규칙이 언제나 사람에게 넘긴다']),
         term(pick('10_all_typesafe.txt', [], start=r'^\[JEV   \] \[typesafe\]', stop=r'^\[RULE', limit=16, w=96), 'tiny') +
         ok('<code>[JEV]</code> 막대 세 개와 <code>[RULE]</code> 줄이 찍히고, 담당자 화면 <b>Jev 판정</b> 에 확신도 · 위험도 · 정체불명')), 'diff')
add(3, '판정 화면 읽기 · 질문 한 줄이 결과를 바꾼다',
    bullets(['① action: 셋 중 하나를 고르고 확률을 나란히 준다. 확신(confidence)은 1등과 2등의 차이 · ② danger: 0 ~ 3 점수, 기준 문장 4개를 우리가 적었다 · ③ unknown: 예 / 아니오 확률',
             '<code>[RULE]</code> 줄이 코드 규칙이다: 확신 20% 미만이면 사람에게, scramble 이면 출격 준비, watch 인데 정체불명 50% 이상이면 정체부터']) +
    code(['const QUESTIONS = {',
          '  action:  { type: "choice", instructions: "report 와 facts 를 보고 관제실이 지금 뭘 해야 할까?",',
          '                             criteria: { scramble: "위험해 보인다 …", watch: "좀 수상하지만 …", ignore: "별일 아니다 …" } },',
          '  danger:  { type: "score",  instructions: "얼마나 위험해 보이나?", criteria: DANGER },',
          '  unknown: { type: "noul",   instructions: "정체가 무엇인지 전혀 짐작이 안 가서 정체부터 알아내야 한다",',
          '                             criteria: { true: "정체를 모른다", false: "무엇인지 대략 안다" } },',
          '};'], w=160, file='labs/agent/main.ts · QUESTIONS (세 질문이 전부 여기)') +
    cols(cmd('pnpm agent 1', 'UFO — ③ unknown 이 몇 % 인가'), cmd('pnpm agent 4', '훈련기 — 같은 질문, 다른 보고')) +
    small('해 보기: unknown 의 instructions 를 "더 알아봐야 해?" 처럼 모호하게 바꾸고 둘 다 다시 돌린다. ③ 의 % 가 두 보고에서 갈리면 질문이 일을 한 것이다. 끝나면 원래 문장으로 되돌린다 (실제 Jev 키가 있어야 차이가 난다. JEV_MODE=local 은 문장을 안 읽는다)'), 'cmd')
cover(3, 7, '사람의 답으로 이어가기', '<code>Command({ resume: 답 })</code> 으로 같은 thread 다시 invoke', '<code>main.ts</code> (TODO 7)', '"사람이 결정". Ctrl+C 뒤 <code>pnpm agent --resume &lt;번호&gt;</code>', 'HITL · Checkpoint', '③ interrupt · Command resume · thread_id 그대로. MemorySaver 만 SqliteSaver 로')
add(3, step_tag(7, '사람의 답으로 멈춘 곳부터 이어가기'),
    bullets(['<code>interrupt()</code> 는 그래프를 <b>멈추고 저장만</b> 한다. 답을 넣어 <b>다시 돌리는 건 그래프 밖 반복문</b>의 일이다 — 그게 TODO 7']) +
    cols(diff_ctx([(' ', 'async function runWithHuman() {'),
                   (' ', '  if (!resumeId) await run(input);            // 처음이면 START 부터, --resume 이면 생략'),
                   (' ', '  for (;;) {'),
                   (' ', '    // 그래프가 interrupt() 에서 멈춰 있나? 멈췄으면 질문이 tasks 에 들어 있다'),
                   (' ', '    const stopped = await graph.getState(config);'),
                   (' ', '    const question = stopped.tasks.flatMap((t) => t.interrupts ?? [])[0]?.value;'),
                   (' ', '    if (!question) break;                       // 질문이 없다 = 끝까지 돌았다'),
                   (' ', '    // ===== TODO 7 ====='),
                   ('-', '    const answer = await askPerson(question);'),
                   ('-', '    log("stop", `답(${answer})을 받았지만 그래프를 이어가지 않았습니다'),
                   ('-', '                 — TODO 7 (--resume 도 7단계를 채운 뒤부터)`);'),
                   ('-', '    break;                                      // 답만 받고 끝'),
                   ('+', '    log("setup", `멈춰도 된다 — pnpm agent --resume ${threadId} 로 여기부터 이어간다`);'),
                   ('+', '    // 같은 thread_id 로 다시 돌린다 → 멈춘 줄에서 답을 받고 이어진다'),
                   ('+', '    await run(new Command({ resume: await askPerson(question) }));'),
                   (' ', '  }'),
                   (' ', '}')], file='labs/agent/main.ts · TODO 7 (그래프 밖 실행 반복문)', w=96) + cmd('pnpm agent'),
         bullets(['① <b>멈춤</b> — <code>approve</code> 안의 <code>interrupt()</code> 가 그래프를 멈추고 칠판을 <code>checkpoints.sqlite</code> 에 저장한다',
                  '② <b>묻기</b> — 바깥 반복문이 "멈춰 있나?" 를 보고 <code>askPerson</code> 으로 답을 받는다',
                  '③ <b>이어가기 (빈칸)</b> — 같은 <code>thread_id</code> 로 <code>Command({ resume: 답 })</code>. <code>approve</code> 는 처음부터 다시 돌지만 <code>interrupt()</code> 가 이번엔 답을 돌려줘서 그 줄부터 계속. 이어갈 수 있게 됐으니 <code>--resume</code> 안내도 여기서 찍는다']) +
         term([x for l in pick('00_step1_blank.txt', [r'^\[HUMAN \] 답', r'^\[STOP'], limit=2, w=200) for x in l.replace(' (--resume', '\n         (--resume').split('\n')]) + small('채우기 전: 답은 받았는데 그래프를 다시 돌리지 않아 여기서 끝') +
         term(pick('14_flight_plan.txt', [r'^\[HUMAN \] 답', r'^\[DECIDE'], limit=2)) + small('채운 뒤: approve 가 그 답으로 결정을 쓰고 끝까지 간다') +
         ok('<code>[DECIDE] … — 사람이 결정</code>'), ratio='r64'), 'diff')
add(3, '껐다 켜면?',
    bullets(['멈춘 자리는 메모리가 아니라 <b>파일</b>(<code>checkpoints.sqlite</code>)에 있다. 프로세스를 죽여도 파일은 남는다 → <b>같은 실행번호로 켜면 그 자리부터</b>']) +
    cols(term(pick('12a_approve_killed.txt', [r'^\[SETUP \] 멈춰도', r'^\[HUMAN \] 종합'], limit=2, w=100) + ['         │ y(출격) / w(감시 강화) / n(무시) > ^C   ← 답 안 하고 Ctrl+C'], 'tiny') +
         small('① 끄기: 질문 화면에서 끈다. 질문 바로 위 SETUP 줄에 이어가는 명령이 그대로 적혀 있다 — 7단계를 채운 뒤에만 나오는 줄') +
         cmd('pnpm agent --resume loop-1-1792592796718', '② 켜기: 내 화면의 번호로') +
         term(pick('12b_approve_resume.txt', [r'^\[SETUP \] 이어가기', r'^\[HUMAN \] 종합', r'\[HUMAN \] 답', r'^\[DECIDE'], limit=4, w=100), 'tiny') +
         small('③ 이어짐: search_docs · askRadar · Jev 줄이 <b>없다</b> = 다시 수집하지 않았다. 같은 질문이 바로 뜨고, 답하면 끝까지 간다'),
         code(['.compile({ checkpointer:              // 어제 MemorySaver 자리',
               '  SqliteSaver.fromConnString("checkpoints.sqlite") })',
               '',
               'const threadId = resumeId ?? `loop-${round}-${Date.now()}`;',
               'if (!resumeId) await run(input);   // 이어가기면 START 부터 안 감'], w=66, file='labs/agent/main.ts · 바뀐 건 이 세 줄') +
         bullets(['<code>checkpoints.sqlite</code> 는 <b>게임 세이브 파일</b>이다. 노드 하나 끝날 때마다 칠판 전체를 한 줄 저장하고, <code>interrupt()</code> 에서는 "사람 답 기다리는 중" 으로 멈춘 채 저장된다. 실행번호 = <code>thread_id</code> 로 그 줄을 찾는다']) +
         table(['', '7단계 채우기 전', '채운 뒤'],
               [['껐다 켜면', '같은 질문이 다시 뜬다 (세이브 읽기)', '같은 질문이 다시 뜬다'],
                ['답하면', '<code>STOP</code> — 화면에 찍고 끝. 세이브는 그대로', '<code>DECIDE</code> — 이어서 돌고 새 줄이 붙는다'],
                ['또 켜면', '같은 질문이 또. 백 번 해도 같다', '기다리는 질문이 없어 바로 끝']], 'dense') +
         small('채우기 전에 되는 건 세이브 <b>읽기</b>뿐이다. 세이브에서 <b>이어서 플레이하고 다시 저장</b>하는 한 줄이 TODO 7. Subagent 안 askHuman 에서 멈춰도 같다 — 파일 속은 다음 장'), ratio='r64'), 'cmd')
add(3, '파일 안에는 뭐가 남나?',
    cols('<figure class="shot"><img src="captures/checkpoint.png" alt="checkpoints.sqlite 의 checkpoints 테이블"><figcaption>checkpoints 테이블을 IDE 의 DB 보기로 연 화면 — 한 줄이 superstep 하나. 실행 35번에 463줄</figcaption></figure>',
         bullets(['테이블은 둘뿐 — <code>checkpoints</code>(단계마다 State 전체) · <code>writes</code>(노드가 칸에 쓴 값). 둘 다 SqliteSaver 가 만든다',
                  '<code>thread_id</code> = SETUP 줄의 실행번호. <code>--resume</code> 은 이 열로 멈춘 줄을 찾는다',
                  '<code>checkpoint_ns</code> 가 비면 부모, <code>askRadar:…</code> 면 Subagent. Subagent 의 messages 는 그 줄 안에만 있다',
                  '<code>metadata</code> 의 step: -1 입력 → 0 수집 → 1 판정 → 2 사람(interrupt · resume) → 3 보고서',
                  '우리 코드에 SQL 은 없다. 궁금하면 이렇게 열어 보고, 꼬이면 <code>pnpm memory:reset</code> 으로 지운다']), ratio='r64'), 'cmd')
cover(3, 8, '기억 찾기 · 남기기', 'remember 에서 <code>findSameCase</code>(8-1) · approve 뒤 <code>saveCase</code>(8-2)', '<code>main.ts</code> (TODO 8-1 · 8-2)', '같은 보고 두 번째엔 "같은 사례 찾음 → Jev 생략"', 'Context · Memory — 장기 기억이 판단을 바꾼다', '④ 단기 기억(thread) 과 장기 기억의 차이')
add(3, '어제 판단을 오늘 기억하면?',
    cols(mermaid('''flowchart LR
  C["수집 끝"] --> M{remember<br/>같은 사례? 8-1}
  M -- "일치 0.9 이상" --> AP["approve<br/>그때 판정 그대로"]
  M -- "없음" --> J["judge<br/>Jev + recall"]
  J --> AP
  AP -- "사람 결정 + 근거 요약 saveCase 8-2" --> H[("Hindsight<br/>서버 또는 .hindsight/*.json")]
  H -. "findSameCase · recall" .-> M'''),
         bullets(['기억은 두 번 쓴다: 판정 전에 <b>찾고</b>(8-1), 사람 결정 뒤에 <b>남긴다</b>(8-2)',
                  '남기는 건 approve 가 끝난 뒤 — 그래서 7단계(이어가기)가 먼저다',
                  '같은 사례면 Jev 를 부르지 않는다. 그때의 판정과 사람의 선택이 그대로 올라온다',
                  'Hindsight 서버가 없으면 <code>MEMORY_MODE=file</code> 로 JSON 파일에 똑같이 남긴다']), ratio='r64'), 'fig')
add(3, step_tag(8, '기억 찾기 · 남기기'),
    cols(diff('TODO 8', 0, w=88) + diff('TODO 8', 1, w=88) + cmd('pnpm agent 1', '두 번'),
         term(pick('02_run1_first.txt', [r'^\[MEMORY', r'^\[JEV   \]', r'^\[DECIDE'], limit=4)) + small('첫 번째: 기억 없음 → Jev 판정') +
         term(pick('03_run1_again.txt', [r'^\[MEMORY', r'^\s+│ 그때', r'^\[DECIDE'], limit=5)) + small('두 번째: 같은 사례 찾음 → Jev 생략') +
         ok('두 번째 실행에 <code>[MEMORY] 같은 사례 찾음 → Jev 생략</code>')), 'dense')
add(3, '사람이 가르친다',
    cols(term(pick('07_mcp_off.txt', [r'^\[MEMORY', r'^\s+│ 그때', r'^\[DECIDE'], limit=5)) + cmd('pnpm agent 2', '담당자가 w(감시 강화)를 고른 뒤 다시') +
         bullets(['기억에 남는 건 Jev 의견이 아니라 <b>사람의 최종 선택</b>과 그때 본 근거 요약이다',
                  '다음에 같은 보고가 오면 사람이 고른 쪽으로 떠오른다',
                  'Hindsight 안은 <code>pnpm memory:ui</code> 로 들여다본다 (localhost:18888)']),
         '<div class="placeholder">pnpm memory:ui 대시보드 캡처 자리<br/><span>점 = 사실 · 요약, 선 = 시간 · 의미 · 엔티티</span></div>'), 'cmd')
add(3, 'Hindsight 를 켜면 무엇이 달라지나? — MEMORY_MODE file vs hindsight',
    table(['', '<code>MEMORY_MODE=file</code> (기본, Hindsight 서버 없음)', '<code>MEMORY_MODE=hindsight</code> (Hindsight 서버)'],
          [['저장', '<code>.hindsight/control-room.json</code> 한 파일', 'Hindsight 서버 (<code>pnpm memory:up</code>, localhost:8888)'],
           ['준비물', '없음', 'Hindsight 데몬 · <code>uv</code> · Hindsight 가 쓸 LLM'],
           ['retain 남기기', '원문 한 줄을 파일에 붙임, 바로 반영', '맡기고 바로 돌아옴(async). Hindsight 가 뒤에서 사실 추출 → 엔티티 연결 → 링크 → 요약(consolidation)'],
           ['recall 찾기 (Jev 참고)', '겹치는 <b>단어 수</b>', '의미 · 단어 · 그래프 · 시간 네 갈래 + 리랭커. 표현이 달라도 찾는다'],
           ['같은 사례? (remember)', '원문 보고 겹침 <code>overlap</code> ≥ 0.9', '후보는 Hindsight 가 찾고, 판단은 <b>같은 <code>overlap</code></b>'],
           ['reflect', '기억 목록을 그대로', 'Hindsight 의 LLM 이 기억을 근거로 한 문단'],
           ['실행 끝 화면', '없음', 'Hindsight 가 한 일(사실 · 엔티티 · 요약)을 숫자로']], 'dense') +
    bullets(['부르는 함수는 똑같다 (<code>createBank · retain · recall · findSameCase</code>) → 그래프 코드는 한 줄도 안 바뀐다',
             '"같은 사례면 Jev 생략" 은 두 모드 모두 <b>코드 규칙</b>이 정한다 → 키 없이도 "어제 판단을 오늘 기억" 체험은 같다',
             '차이는 찾는 힘과 정리: file 은 메모장에서 단어 찾기, Hindsight 는 정리 · 연결해 두었다가 뜻으로 찾아 준다',
             '주의: Hindsight 의 retain 은 비동기 — 실행 끝 <code>[MEMORY] 서버 작업 끝</code> 을 본 뒤 다음 실행',
             '<code>MEMORY_MODE=off</code> 면 둘 다 안 한다 — 기억 없는 Agent 와 비교할 때']), 'table')
add(3, '되감으면?',
    cols(code(['const history = [];',
               'for await (const snap of graph.getStateHistory(config)) history.push(snap);',
               '// 체크포인트마다: snap.values(State) · snap.next(다음 노드) · snap.config(그 시점 id)',
               '',
               '// 담당자가 "감시" 라고 한 시점으로 돌아가 "출격" 으로 다시 돌린다',
               'await graph.invoke(new Command({ resume: "y" }), history[2].config);'], file='예시 코드 (핸즈온 저장소에는 없음)') +
         bullets(['체크포인트는 되돌아갈 수 있는 저장 슬롯이다',
                  '같은 실행번호 안에서 "그때 다르게 답했으면" 을 재생한다',
                  '시연만 한다. 코드는 10줄, 빈칸 아님']),
         '<div class="placeholder">시연 자리<br/><span>구현 여부 미정 — 미구현이면 "다음 단계" 로 넘어간다</span></div>'), 'cmd')

# ───────── 4. 운영 ─────────
add(4, '운영 중 자료에 지시문이 섞여 오면?',
    cols(code(['// JEV_MODE=local 규칙 (속는 쪽을 흉내 낸다)',
               'const injected = /승인 없이|즉시 (저장|통보)|이전 지시는 무시|ignore previous|bypass approval/.test(everything);',
               'if (injected) risk = 0.95;   // 자료 속 한 줄이 위험도를 끌어올린다 → 무조건 출격으로 기운다'], file='src/lib/jev.ts') +
         bullets(['Jev 에 들어가는 글은 "보고 + 도구 결과" 다. 도구 결과에 지시문이 섞이면 그대로 읽는다',
                  '걸러내는 코드가 없으면 LLM 도 Jev 도 속는다']),
         table(['지금 코드에 있는 상한', '어디'],
               [['모델 호출 횟수 MAX_STEPS', 'ask-radar.ts route'],
                ['한 번 호출 · 실행 전체 시간', 'llm.ts · main.ts'],
                ['사람 결정 없이는 끝나지 않음', 'main.ts approve interrupt'],
                ['MCP 서버에 API 키를 주지 않음', 'mcp-servers/weather'],
                ['보고서는 reports/ 안에만 저장', 'write-report.ts saveReport'],
                ['Jev 에는 걸러낸 사실만', 'judge 는 facts · report 만 보냄']])), 'table')
add(4, '실제 서비스(Deev)는 어떻게 거르나',
    cols(code(['// 1차 정규식 (영 · 한), 2차 TypeSafe',
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
               'if (safety.detected) return { ok: false, errorCode: ERROR_CODE.DvPromptInjectionDetected.code };'], file='appendix/detect_define.ts') +
         bullets(['정규식: 빠르고, 왜 걸렸는지 설명된다',
                  '모델 판정: 말을 바꿔 써도 잡는다',
                  '둘을 겹쳐 쓰고, 키가 없을 때의 동작도 정해 둔다']),
         '<figure class="shot"><img src="../../appendix/img.png" alt="Deev 캐릭터 챗 화면"><figcaption>Deev 캐릭터 챗 화면 — 사용자 입력 · 페르소나 · 메모 · 재생성 지시 네 곳을 모두 검사한다</figcaption></figure>', ratio='r64'), 'cmd')
add(4, '모델을 바꾸면?',
    cols(term(pick('02_run1_first.txt', [r'^\[SETUP \] 모델', r'^┃ \[LLM', r'^\[DECIDE'], limit=6)) + small('LLM_MODE=mock — 정해진 순서로 도구를 하나씩'),
         term(pick('13_ollama.txt', [r'^\[SETUP \] 모델', r'^┃ \[LLM', r'^\[DECIDE'], limit=6)) + small('LLM_MODE=ollama — 노트북 qwen3.5. 확대까지 2번만 보고 사실 정리, 호출마다 5 ~ 10초')) +
    code(['# 슬롯만 바꾼다. 그래프 · 도구 · 판정 코드는 그대로',
          'LLM_MODE=cloud      LLM_MODEL=anthropic/claude-sonnet-5.5     # OpenRouter, 조별 키',
          'LLM_MODE=cloud      LLM_MODEL=qwen/qwen3-32b                  # 같은 키, 이름만 바꿔 오픈 모델',
          'LLM_MODE=ollama     LLM_BASE_URL=http://localhost:11434/v1    LLM_MODEL=qwen3:8b'], file='.env') +
    small('조별 OpenRouter 키는 당일 안내. 보고서(reports/)를 모델별로 나란히 열어 비교한다'), 'cmd')
add(4, '보고서는 누가 쓰나?',
    cols(code(['// 사람이 결정한 뒤 한 번',
               '// 1. 바뀌면 안 되는 것(결정 · 시각)은 코드가 머리말에',
               'const head = [`# 당직 브리핑 — ${id}`, `- 결정: ${state.judgment.decision}`, …];',
               '',
               '// 2. 문장만 LLM 이. 사실 목록 = approve 가 사람에게 보여 준 그 목록',
               'body = await askLLM({ system: RULES, user: facts, mockText: facts });',
               '//    실패하면(mock · 키 없음 · 시간 초과) 사실 목록을 그대로',
               '',
               '// 3. reports/ 안에만. ../ 가 섞이면 거부 (Sandbox)',
               'if (!target.startsWith(REPORTS_DIR)) throw new Error("reports/ 밖에는 저장할 수 없습니다");'], file='labs/agent/write-report.ts') +
         bullets(['판정은 Jev, 결정은 사람, 문장만 LLM',
                  '규칙: "사실 목록에 없는 건 쓰지 않는다 · 결정은 바꾸지 않는다"',
                  '모델을 바꾸면(LLM_MODE) 문장이 달라진다 — 사실과 결정은 그대로']),
         term(pick('14_report.txt', [r'^\[WRITE', r'^\s+│ (##|-) '], limit=14, w=70, start=r'^\[WRITE')) + small('보고 3 · 담당자 w · OpenRouter 모델. 파일은 reports/&lt;실행번호&gt;.md')), 'cmd')
add(4, '실행 기록은 어디서 보나?',
    cols(code(['LANGSMITH_TRACING=true',
               'LANGSMITH_API_KEY=<smith.langchain.com 무료 키>',
               '',
               '# 코드 수정 없음. 노드 → LLM 호출 · Jev · MCP · 기억 호출이 트리로 올라간다',
               '# 끄면 traces/*.jsonl 만 남는다'], file='.env') +
         bullets(['노드 하나 = span 하나, Subagent 안의 agent ⇄ tools 는 askRadar 아래에 접혀 있다',
                  'LLM 호출은 보낸 메시지 · 받은 답 · 토큰 수까지',
                  '<code>pnpm see:studio</code> 는 같은 키로 LangGraph Studio 를 띄운다',
                  'Langfuse 로 보는 법은 14:30 정진태 특강에서']),
         '<div class="placeholder img">LangSmith 트리 캡처 자리<br/><span>run → searchDocs · askRadar(agent, tools …) · remember · judge · approve · writeReport</span></div>'), 'cmd')
add(4, 'LangGraph 사용자가 가장 많이 쓰는 그래프 다섯 가지',
    table(['패턴', '모양', '한 줄 비유', '우리 코드'],
          [['Tool-calling 루프 (ReAct)', 'agent ⇄ tools 왕복', '혼자 일하는 직원', '있음 — ask-radar.ts (1단계)'],
           ['Supervisor', '감독 모델이 Subagent 여럿 중 누구에게 넘길지 고름', '팀장이 팀원을 지명', '없음 — 다음 단계'],
           ['Orchestrator–Workers', '일을 쪼개 동시에 뿌리고 합침', '팀장이 일을 쪼개 동시에 배분', '있음 — main.ts (5단계)'],
           ['Router', '입력 보고 갈림길 하나, 루프 없음', '안내 데스크', 'route 함수가 축소판'],
           ['Evaluator–Optimizer', '만들기 → 평가 → 다시 만들기', '퇴고하는 작가', '<span class="amber">실제 사례 시연: 배동환 CTO 의 Shader Agent — 생성 → 렌더 → 평가 → 재생성</span>']]) +
    small('오늘 그래프 = ReAct (1단계) + Orchestrator–Workers (5단계) + interrupt (7단계). interrupt 로 사람이 끼어드는 것은 패턴이 아니라 어느 패턴에나 끼우는 공통 부품이다. LangChain 이 권하는 순서: ReAct 하나로 시작하고, 도구가 열 개를 넘거나 역할이 갈리면 쪼개라'), 'table')
add(4, '오늘 만든 것과 요청 항목',
    table(['요청 항목', '오늘 코드', '단계'],
          [['Agent Loop · Planning · Tool Calling', 'ask-radar.ts agent ⇄ tools, 새 도구 look_flight_plan', '1 · 2'],
           ['Harness · Context Engineering', 'MAX_STEPS 강제 중단, Subagent 대화는 Subagent 안에만', '1 · 5'],
           ['외부 Tool 연계', 'searchDocs(RAG) · look_flight_plan · look_weather(MCP)', '2 · 3 · 4'],
           ['MCP', '날씨 MCP 서버 + 클라이언트', '4'],
           ['Task Decomposition · Subagent', 'searchDocs(Worker) + askRadar(서브그래프) 동시 실행 후 합류', '1 · 5'],
           ['Jev (판정 모델)', 'choice · score · noul 3질문 + 코드 규칙', '6'],
           ['HITL · 장기 실행 제어', 'interrupt 두 곳, 이어가기', '7'],
           ['State · Checkpoint · Retry', 'reducer State, SqliteSaver, --resume', '7'],
           ['Context · Memory · Agentic Retrieval', 'Hindsight 찾기 · 남기기, 같은 사례면 Jev 생략', '8'],
           ['Trace · Evaluation · Observability', 'traces/*.jsonl, LangSmith, Langfuse(특강)', '시연'],
           ['권한 · Prompt Injection · Sandbox', '상한 여섯 곳, Deev 실제 탐지 코드, MCP 서버에 키 미전달, 보고서 reports/ 격리', '시연']], 'dense') +
    '<div class="placeholder slot">마무리 5분 자리 (미결): Claude Code · opencode 구조 대응표 / AWS AI-DLC · Kiro / 대기업 Agentic AI 동향</div>' +
    '<div class="links">추가 자료 · '
    '<a href="frontier-compare.html" target="_blank">Agent 구현 비교 덱 (핸즈온 · Claude Code · Opencode)</a> · '
    '<a href="https://docs.google.com/presentation/d/15TWur3FoEh3LOYjRo4MU0xIS1G_zKfNKfi6kquwkwcE/edit?usp=sharing" target="_blank">타사 Shader Agent 예시 (Google Slides)</a></div>', 'table')

# ───────── HTML ─────────
def gauge(step):
    if step is None: return ''
    cells = ''.join(f'<i class="{"done" if k < step else "now" if k == step else ""}"></i>' for k in range(LAST_STEP + 1))
    label = f'<b>{step}단계</b> · 남은 {LAST_STEP - step}' if step <= LAST_STEP else f'<b>{LAST_STEP}단계</b>까지 전부 끝'
    return f'<span class="gauge">{cells}<span class="lbl">{label}</span></span>'

def section(i, b, title, body, kind, step):
    return f'''<section class="slide k-{kind}" data-i="{i}" data-block="{b}">
  <h1>{title}</h1>
  <div class="body">{body}</div>
  <footer><span class="blk b{b}">{html.escape(BLOCKS[b])}</span>{gauge(step)}<span class="num">{i + 1} / {len(slides)}</span></footer>
</section>'''

CSS = r'''
:root{--bg:#0F141B;--panel:#161D26;--panel2:#1C2531;--text:#E7ECF2;--muted:#8C98A8;--amber:#F2B544;--line:#2A3542;--mag:#C97BDC;
 --t-report:#D9DEE5;--t-setup:#3A4553;--t-llm:#9C4FB5;--t-tool:#2E8B57;--t-mcp:#2A9BAA;--t-memory:#3F6FCC;--t-jev:#C9A52F;--t-human:#C64B4B;--t-rule:#B9C0C9;--t-decide:#1F8A4C;--t-stop:#B83232;--t-node:#3A4553;--t-sub:#8E2EA8;--t-live:#3A4553;--t-write:#D9DEE5;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:"IBM Plex Sans KR",system-ui,sans-serif;overflow:hidden}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center center;cursor:pointer;user-select:none}
.slide{position:absolute;inset:0;padding:72px 96px 64px;display:none;flex-direction:column;background:var(--bg)}
.slide.on{display:flex}
.k-cover .body{display:flex;flex-direction:column;justify-content:center;gap:36px;height:calc(100% - 20px)}.k-cover .cmd{font-size:44px;padding:22px 36px}.k-cover .cmd .note{font-size:22px;display:block;margin:8px 0 0 54px}.k-cover .tbl.meta{font-size:28px}.k-cover .tbl.meta td:first-child{color:var(--muted);width:280px;white-space:nowrap}
.k-dense pre{font-size:15.5px;line-height:1.38;padding:12px 16px}.k-dense .cmd{font-size:21px;padding:9px 16px}
#stage.prerender .slide{display:flex;visibility:hidden}#stage.prerender .slide.on{visibility:visible}
/* 인쇄(PDF): 장마다 1920x1080 한 페이지. pnpm slides:pdf 가 Chrome 헤드리스로 뽑는다 */
@page{size:1920px 1080px;margin:0}
@media print{.cmd .copy{display:none}html,body{overflow:visible;height:auto}#stage{position:static;transform:none !important;width:1920px;height:auto;cursor:default}
 .slide{position:relative;inset:auto;display:flex !important;visibility:visible !important;width:1920px;height:1080px}
 .slide + .slide{break-before:page}
 #bar,#overview,#hint,.mermaidTooltip{display:none !important}}
h1{font-size:54px;font-weight:600;line-height:1.2;letter-spacing:-0.01em;margin-bottom:34px;max-width:1700px}
.body{flex:1;min-height:0;font-size:27px;line-height:1.5;display:flex;flex-direction:column;gap:18px}
.body > *{flex:0 0 auto}
footer{display:flex;justify-content:space-between;font-size:19px;color:var(--muted);padding-top:16px;border-top:1px solid var(--line)}
footer{align-items:center}
footer .gauge{display:inline-flex;align-items:center;gap:5px}
footer .gauge i{display:inline-block;width:26px;height:9px;border-radius:2px;border:1px solid var(--line)}
footer .gauge i.done{background:var(--line);border-color:var(--line)}
footer .gauge i.now{background:var(--amber);border-color:var(--amber)}
footer .gauge .lbl{margin-left:12px}footer .gauge b{color:var(--amber);font-weight:600}
footer .blk::before{content:"";display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:10px;background:var(--amber)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:start;min-height:0}
.cols.r64{grid-template-columns:1.5fr 1fr}
.cols > div{display:flex;flex-direction:column;gap:16px;min-width:0}
pre{font-family:"IBM Plex Mono",ui-monospace,monospace;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px 20px;font-size:17px;line-height:1.45;white-space:pre;overflow:hidden;color:#D5DBE3}
pre.tiny{font-size:16px}
pre.code{color:#D5DBE3}
.snip{display:flex;flex-direction:column}.snip .file{align-self:flex-start;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px;line-height:1;color:var(--amber);background:var(--panel);border:1px solid var(--line);border-bottom:0;border-radius:6px 6px 0 0;padding:7px 14px 6px}.snip pre{border-top-left-radius:0}
pre.diff .del{color:#F08B8B;display:block}pre.diff .add{color:#8BE0A4;display:block}pre.diff .ctx{color:#8C98A8;display:block}
pre.term .tag{display:inline-block;color:#fff;padding:0 6px;border-radius:3px;font-weight:600}
.t-report,.t-rule{color:#111 !important}
.t-report{background:var(--t-report)}.t-setup{background:var(--t-setup)}.t-llm{background:var(--t-llm)}.t-tool{background:var(--t-tool)}.t-mcp{background:var(--t-mcp)}
.t-memory{background:var(--t-memory)}.t-jev{background:var(--t-jev);color:#111 !important}.t-human{background:var(--t-human)}.t-rule{background:var(--t-rule)}
.t-decide{background:var(--t-decide)}.t-stop{background:var(--t-stop)}.t-node{background:var(--t-node)}.t-sub{background:var(--t-sub)}.t-live{background:var(--t-live)}
pre .bar,pre .mag{color:var(--mag);font-weight:700}pre .dim{color:#5B6676}pre .amber{color:var(--amber);font-weight:600}
.cmd{font-family:"IBM Plex Mono",monospace;font-size:24px;background:var(--panel2);border-left:4px solid var(--amber);padding:12px 20px;border-radius:0 6px 6px 0}
.cmd{position:relative;padding-right:84px}.cmd .copy{position:absolute;right:10px;top:50%;transform:translateY(-50%);font:600 15px/1 "Noto Sans KR",sans-serif;color:var(--muted);background:transparent;border:1px solid var(--muted);border-radius:5px;padding:5px 10px;cursor:pointer}.cmd .copy:hover,.cmd .copy.done{color:var(--amber);border-color:var(--amber)}
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
.links{margin-top:14px;font-size:19px;color:var(--muted)}.links a{color:var(--amber);text-decoration:underline;text-underline-offset:4px}
figure.qr{display:flex;align-items:center;gap:14px;margin:0}figure.qr img{width:170px;height:170px;border-radius:6px;background:#fff;padding:4px}figure.qr figcaption{font-size:18px;color:var(--muted)}
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
stage.addEventListener('click',(e)=>{if(e.target.closest('.cmd .copy, a')) return; const r=stage.getBoundingClientRect(); if(e.clientX < r.left + r.width/2) go(cur-1); else go(cur+1);});
ov.addEventListener('click',closeOverview);
addEventListener('click',(e)=>{const b=e.target.closest('.cmd .copy'); if(!b) return; navigator.clipboard.writeText(b.parentElement.querySelector('.c').textContent).then(()=>{b.textContent='복사됨'; b.classList.add('done'); setTimeout(()=>{b.textContent='복사'; b.classList.remove('done');},1200);});});
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
if(window.mermaid){mermaid.initialize({startOnLoad:false,theme:'base',securityLevel:'loose',htmlLabels:false,flowchart:{curve:'linear',htmlLabels:false,padding:14,nodeSpacing:40,rankSpacing:50},themeVariables:{background:'#0F141B',primaryColor:'#1C2531',primaryTextColor:'#E7ECF2',primaryBorderColor:'#3A4553',lineColor:'#8C98A8',secondaryColor:'#161D26',tertiaryColor:'#161D26',clusterBkg:'#131a22',clusterBorder:'#3A4553',edgeLabelBackground:'#0F141B',fontFamily:'IBM Plex Sans KR, sans-serif',fontSize:'20px'}}); stage.classList.add('prerender'); (document.fonts?Promise.all([document.fonts.load('20px "IBM Plex Sans KR"','agent searchDocs remember 보고 수집'),document.fonts.load('600 54px "IBM Plex Sans KR"','가 abc'),document.fonts.load('18px "IBM Plex Mono"','abc')]).then(()=>document.fonts.ready):Promise.resolve()).then(()=>mermaid.run({querySelector:'pre.mermaid'})).then(()=>{document.querySelectorAll('pre.mermaid').forEach(p=>p.style.color='inherit');}).finally(()=>{stage.classList.remove('prerender'); document.body.dataset.ready='1';});} else document.body.dataset.ready='1';
'''

sections = '\n'.join(section(i, b, t, body, k, st) for i, (b, t, body, k, st) in enumerate(slides))
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
for i, (b, t, _, k, st) in enumerate(slides): print(f'{i+1:2d} [{BLOCKS[b]}] {t}')
