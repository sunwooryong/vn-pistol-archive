# -*- coding: utf-8 -*-
# 게임사격기록(모든 파일) → web/game.json
#   사용: python game-etl.py  [폴더경로]
#   기본 폴더: OneDrive 문서\새 폴더\게임사격기록지
#   지원: *.pdf(챔피언/Final/녹다운/인쇄 순위표) · *.csv(게임결과 내보내기) · *.xlsx(발별 분석)
#   KO/VI 중복판·CSV/인쇄본 중복은 자동 제거. 담당 선수는 build/athletes.json과 이름 매칭해 식별키 부여.
import glob, re, os, sys, json, contextlib, io, warnings, logging, unicodedata, datetime
logging.disable(logging.CRITICAL); warnings.filterwarnings('ignore')
try:
    import pdfplumber
except Exception:
    pdfplumber = None

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = r'C:/Users/sunwo/OneDrive/문서/새 폴더/게임사격기록지'
folder = sys.argv[1] if len(sys.argv) > 1 else DEFAULT

def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s.replace('đ', 'd').replace('Đ', 'D')).lower().strip()

# 아카이브 선수 로드
ath_list = []
ap = os.path.join(HERE, 'build', 'athletes.json')
if os.path.exists(ap):
    try: ath_list = json.load(open(ap, encoding='utf-8'))
    except Exception: ath_list = []
by_norm = {norm(a['full_name']): a for a in ath_list}

# 선수명 후보(공백·기호 제거 정규화) — 신형 템플릿의 뒤섞인 이름 복원용
def despace(s): return re.sub(r'[^a-z0-9]', '', norm(s))
CAND = [(a['full_name'], despace(a['full_name'])) for a in ath_list if len(despace(a['full_name'])) >= 6]
def _subseq(a, b):
    it = iter(b)
    return all(c in it for c in a)
def recover_name(field):
    """소속(지역)이 글자 단위로 뒤섞인 이름 문자열에서 로스터와 부분수열 매칭으로 실제 이름 복원"""
    blob = despace(field)
    if not blob: return None
    hits = [(full, ct) for full, ct in CAND if _subseq(ct, blob)]
    if not hits: return None
    hits.sort(key=lambda x: -len(x[1]))
    return hits[0][0]

def date_from(text, base):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', base) or re.search(r'(\d{4}-\d{2}-\d{2})', text or '')
    if m: return m.group(1)
    m = re.search(r'(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})', text or '')
    if m:
        y = int(m.group(1)); y += 2000 if y < 100 else 0
        return f'{y:04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    return ''

def pdf_text(f):
    if not pdfplumber: return '', 1
    try:
        with contextlib.redirect_stderr(io.StringIO()):
            d = pdfplumber.open(f)
            pages = d.pages
            txt = '\n'.join((p.extract_text() or '') for p in pages)
        return txt, len(pages)
    except Exception:
        return '', 0

# ---- 파서들: 각자 match dict 리스트 반환 ----
# match = {date,name,file,game_type,athletes:[{rank,raw_name,region,total,result,status,shootoff}]}

def parse_scoreline(text, base):
    """챔피언/Final/녹다운: '1. 이름 ... 합계 (우승|탈락)' 형식"""
    title = next((l.strip() for l in text.split('\n') if l.strip()), '')
    low = title.lower()
    if '챔피언' in title or 'hồ sơ' in low or 'tập luyện' in low: mname = '챔피언 결정전'
    elif 'final' in low: mname = 'Final Match'
    elif 'knockdown' in low: mname = 'Knockdown'
    else: mname = title.split('·')[0].strip()[:30] or '게임'
    gtype = 'knockdown' if 'knockdown' in low else 'elimination'
    rows = []
    for line in text.split('\n'):
        m = re.match(r'^\s*(\d+)\.\s+(.+)$', line)
        if not m: continue
        rank = int(m.group(1)); rest = m.group(2)
        nm = re.match(r'^([^\d]+?)\s+\d', rest)
        if not nm: continue
        name = re.sub(r'\s+', ' ', nm.group(1)).strip()
        if len(name) < 2: continue
        tm = re.search(r'(\d{2,4}(?:\.\d)?)\s*(우승|탈락|vô địch|bị loại)', rest, re.I)
        status = ''; total = None
        if tm:
            total = float(tm.group(1)); st = tm.group(2).lower()
            status = '우승' if ('우승' in st or 'vô' in st) else '탈락'
        else:
            fl = re.findall(r'\d{2,3}\.\d', rest)
            if fl: total = float(fl[-1])
        if total is None: continue
        so = re.search(r'SO\d*[:\s]+([\d.]+)', rest)
        rows.append({'rank': rank, 'raw_name': name, 'region': None, 'total': total,
                     'result': None, 'status': status, 'shootoff': float(so.group(1)) if so else None})
    return [{'date': date_from(text, base), 'name': mname, 'file': base, 'game_type': gtype, 'athletes': rows}] if rows else []

def parse_ranking(text, base):
    """인쇄·Ryong Shooting Game: '순위 선수 지역 결과 상태' 순위표"""
    lines = text.split('\n')
    # 게임명
    gm = next((re.sub(r'\s*\(.*$', '', l).replace('상세 기록', '').strip()
               for l in lines if '—' in l or 'Shooting' in l), '')
    mname = 'Target Shooting' if 'target' in text.lower() else (gm[:30] or '게임')
    gtype = 'target'
    rows = []; started = False
    for l in lines:
        if re.search(r'순위\s+선수\s+지역', l): started = True; continue
        if not started: continue
        m = re.match(r'^(\d+)\s+(.+?)\s+([A-Z]{3})\s+(.+?)\s+(playing|탈락|우승|완료|finished|done)?\s*$', l)
        if not m:
            if re.match(r'^[가-힣A-Za-z].* \(', l): break  # 상세 섹션 시작
            continue
        rank = int(m.group(1)); name = m.group(2).strip(); region = m.group(3)
        result = m.group(4).strip(); status = (m.group(5) or '').strip()
        rows.append({'rank': rank, 'raw_name': name, 'region': region, 'total': None,
                     'result': result, 'status': status, 'shootoff': None})
    return [{'date': date_from(text, base), 'name': mname, 'file': base, 'game_type': gtype, 'athletes': rows}] if rows else []

RE_DETAIL_ROW = re.compile(r'^(\d+)\s+(.+?)\s+(\d{2,4}(?:\.\d+)?)\s+(우승|탈락|vô địch|bị loại)\s*$', re.I)
def parse_detail(text, base):
    """신형 Shooting Game v5 템플릿: '선수 / 소속' · 'VĐV / Đội' 발별 상세표(소속이 이름과 뒤섞임).
       순위행 '<순위> <이름(뒤섞임)> <총점> <상태>' 를 순위별 1회만 추출, 로스터로 이름 복원."""
    title = next((l.strip() for l in text.split('\n') if l.strip()), '')
    low = title.lower()
    if '챔피언' in title or 'chung kết' in low or 'hồ sơ' in low or 'vô địch' in low: mname = '챔피언 결정전'
    elif 'final' in low: mname = 'Final Match'
    elif 'knockdown' in low: mname = 'Knockdown'
    else: mname = (title.split('·')[0].strip()[:30] or '게임')
    byrank = {}
    for line in text.split('\n'):
        m = RE_DETAIL_ROW.match(line.strip())
        if not m: continue
        rk = int(m.group(1))
        if rk in byrank: continue  # 발 구간(1–10,11–20…)마다 같은 순위가 반복 → 1회만
        tot = float(m.group(3)); tot = int(tot) if tot.is_integer() else tot
        st = m.group(4).lower()
        status = '우승' if ('우승' in st or 'vô' in st) else '탈락'
        name = recover_name(m.group(2)) or re.sub(r'\s+', ' ', m.group(2)).strip()
        byrank[rk] = {'rank': rk, 'raw_name': name, 'region': None, 'total': tot,
                      'result': None, 'status': status, 'shootoff': None}
    rows = [byrank[r] for r in sorted(byrank)]
    return [{'date': date_from(text, base), 'name': mname, 'file': base, 'game_type': 'elimination', 'athletes': rows}] if rows else []

def parse_pdf(f):
    base = os.path.basename(f); text, _ = pdf_text(f)
    if not text: return []
    if re.search(r'순위\s+선수\s+지역', text):
        return parse_ranking(text, base)
    if re.search(r'(선수\s*/\s*소속|VĐV\s*/\s*Đội)', text):
        d = parse_detail(text, base)
        if d: return d
    return parse_scoreline(text, base)

def parse_csv(f):
    import csv
    base = os.path.basename(f)
    try:
        rows = list(csv.reader(open(f, encoding='utf-8-sig')))
    except Exception:
        return []
    if len(rows) < 2: return []
    hdr = [h.strip() for h in rows[0]]
    def col(*names):
        for n in names:
            if n in hdr: return hdr.index(n)
        return -1
    ci = {k: col(*v) for k, v in {
        'date': ['날짜', 'date'], 'match': ['경기명', 'match'], 'gtype': ['게임유형', 'type'],
        'rank': ['순위', 'rank'], 'name': ['선수명', 'name'], 'region': ['지역', 'region'],
        'result': ['결과', 'result'], 'shots': ['발수', 'shots'], 'status': ['상태', 'status']}.items()}
    groups = {}
    for r in rows[1:]:
        if not any(x.strip() for x in r): continue
        g = lambda k: (r[ci[k]].strip() if 0 <= ci[k] < len(r) else '')
        key = (g('date'), g('match') or 'Game')
        groups.setdefault(key, []).append(r)
    out = []
    for (date, mname), rs in groups.items():
        ath = []
        for r in rs:
            g = lambda k: (r[ci[k]].strip() if 0 <= ci[k] < len(r) else '')
            rk = g('rank');
            try: rk = int(rk)
            except Exception: rk = len(ath) + 1
            res = g('result'); tot = None
            mt = re.search(r'(\d{2,4}(?:\.\d)?)', res)  # 결과에 숫자 총점이 있으면
            if mt and ('★' not in res and 'Lv' not in res): tot = float(mt.group(1))
            ath.append({'rank': rk, 'raw_name': g('name'), 'region': g('region') or None,
                        'total': tot, 'result': res or None, 'status': g('status'), 'shootoff': None})
        gtype = (rs[0][ci['gtype']].strip() if 0 <= ci['gtype'] < len(rs[0]) else '') or 'game'
        out.append({'date': date, 'name': mname or 'Game', 'file': base, 'game_type': gtype, 'athletes': ath})
    return out

def parse_xlsx(f):
    base = os.path.basename(f)
    try:
        import openpyxl
    except Exception:
        return []
    try:
        wb = openpyxl.load_workbook(f, data_only=True, read_only=True)
    except Exception:
        return []
    ws = wb.worksheets[0]
    cells = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        cells.append(list(row));
        if i > 40: break
    flat = {}
    for row in cells:
        if row and row[0] is not None:
            label = str(row[0]).strip()
            val = next((c for c in row[1:] if c is not None), None)
            flat[label] = val
    total = flat.get('총점'); shots = flat.get('총 발수')
    # 날짜/선수/종목: 파일명 + 제목
    date = date_from(' '.join(str(c) for r in cells[:4] for c in r if c), base)
    title = str(cells[1][0]) if len(cells) > 1 and cells[1] and cells[1][0] else base
    disc = '50m' if '50m' in title or '50m' in base else ''
    nm = '응우옌' if ('nguyen' in base.lower() or '응우옌' in title) else re.sub(r'\.xlsx$', '', base)
    # 풀네임 추정: 아카이브에서 '응우옌' 포함 선수 1명이면 그걸로
    try:
        total = float(total) if total is not None else None
    except Exception:
        total = None
    if total is None: return []
    return [{'date': date, 'name': (disc + ' 분석').strip(), 'file': base, 'game_type': 'analysis',
             'athletes': [{'rank': 1, 'raw_name': nm, 'region': None, 'total': total,
                           'result': (f'{int(shots)}발' if shots else None), 'status': '', 'shootoff': None}]}]

# ---- 게임 앱 결과 JSON(구조화) 파서: 최신 PDF가 이미지형이라 못 읽는 경기 보완 ----
GAME_LABEL = {'target': '목표 사격', 'tenstreak': '10점 연결', 'blackjack': 'Blackjack', '3-0': '3-0',
              'percent10s': 'Percent 10s', 'tickingclock': 'Ticking Clock', 'steptest': 'Step Test',
              '10perfectshots': '10 Perfect Shots', 'approachtape': 'Approach Tape', 'clickclick': 'Click Click',
              'monitor': 'Monitor Off/On'}
def result_json_str(r, game):
    ex = r.get('extra') or {}; parts = []
    if game == 'tenstreak':
        if r.get('score'): parts.append(f"{int(r['score'])}연속")
        if r.get('scoreSum'): parts.append(f"{int(r['scoreSum'])}점")
        if r.get('shots'): parts.append(f"{r['shots']}발")
    elif game == 'target':
        if ex.get('stage'): parts.append(f"Lv{ex['stage']}")
        if r.get('shots'): parts.append(f"{r['shots']}발")
    else:
        if r.get('scoreSum'): parts.append(f"{int(r['scoreSum'])}점")
        elif r.get('score'): parts.append(str(r['score']))
        if r.get('shots'): parts.append(f"{r['shots']}발")
    return ' · '.join(parts) or None
def parse_result_json(f):
    try: d = json.load(open(f, encoding='utf-8'))
    except Exception: return []
    st = d.get('standings') or []
    if not st: return []
    se = d.get('settings') or {}
    game = d.get('game') or se.get('gameKey') or 'game'
    arch = d.get('archivedAt') or ''
    date = arch[:10] if re.match(r'\d{4}-\d{2}-\d{2}', arch) else ''
    nm = (d.get('gameName') or se.get('gameName') or '').strip() or GAME_LABEL.get(game, game)
    ath = []
    for i, r in enumerate(st):
        rk = int(r.get('rank') or (i + 1))
        tot = r.get('scoreSum')
        tot = float(tot) if isinstance(tot, (int, float)) and tot else None
        ath.append({'rank': rk, 'raw_name': (r.get('name') or '').strip(), 'region': r.get('region') or None,
                    'total': tot, 'result': result_json_str(r, game),
                    'status': '우승' if rk == 1 else '', 'shootoff': None})
    return [{'date': date, 'name': nm, 'file': os.path.basename(f), 'game_type': game,
             'athletes': ath, '_archivedAt': arch}]

# ---- 수집 ----
all_matches = []
for f in sorted(glob.glob(os.path.join(folder, '*'))):
    ext = f.lower().rsplit('.', 1)[-1] if '.' in f else ''
    try:
        if ext == 'pdf': all_matches += parse_pdf(f)
        elif ext == 'csv': all_matches += parse_csv(f)
        elif ext in ('xlsx', 'xlsm'): all_matches += parse_xlsx(f)
    except Exception as e:
        print(f'  [건너뜀] {os.path.basename(f)}: {e}')

# 게임 앱 구조화 결과 JSON 수집(백업 폴더). 같은 (날짜,게임)의 중간 스냅샷은 가장 최근 1개만.
BK = os.path.expanduser('~/Sunwoo_Shooting Game_Backup')
_jm = []
for jf in sorted(glob.glob(os.path.join(BK, 'result-*.json'))):
    try: _jm += parse_result_json(jf)
    except Exception as e: print(f'  [건너뜀] {os.path.basename(jf)}: {e}')
_latest = {}
for mt in _jm:
    if not mt['date'] or not mt['athletes']: continue
    k = (mt['date'], mt['game_type'])
    if k not in _latest or mt.get('_archivedAt', '') > _latest[k].get('_archivedAt', ''):
        _latest[k] = mt
for mt in _latest.values():
    mt.pop('_archivedAt', None); all_matches.append(mt)

# ---- 중복 제거 (같은 날짜+경기명+선수/총점 구성) ----
PRIO = {'csv': 5, 'elimination': 4, 'knockdown': 4, 'analysis': 3, 'target': 2}  # 높을수록 우선
def src_prio(mt):
    b = mt['file'].lower()
    if b.startswith('result-') and b.endswith('.json'): return 7   # 게임 앱 구조화 결과(최우선)
    if b.endswith('.csv'): return 6
    if '_vi.pdf' in b or 'ho_so' in b: return 1      # VI판은 KO판에 양보
    if '_ko.pdf' in b: return 5
    if b.endswith('.xlsx'): return 3
    return PRIO.get(mt['game_type'], 2)
def sig(mt):
    players = sorted((norm(a['raw_name']), (round(a['total']) if a['total'] else a.get('result') or '')) for a in mt['athletes'])
    return (mt['date'], norm(mt['name']), tuple(players))

best = {}
for mt in all_matches:
    s = sig(mt)
    if s not in best or src_prio(mt) > src_prio(best[s]):
        best[s] = mt
matches = sorted(best.values(), key=lambda m: (m['date'], m['name']))

# ---- 스쿼드로 축약 이름 해소 ----
squad = {}
for mt in matches:
    for a in mt['athletes']:
        n = norm(a['raw_name'])
        if ' ' in n and (n in by_norm or len(n) > 8):
            squad[n] = a['raw_name']

def resolve(raw):
    n = norm(raw)
    if n in by_norm: return by_norm[n]['full_name'], by_norm[n].get('identity_key')
    cands = [full for sn, full in squad.items() if sn == n or sn.endswith(' ' + n) or sn.endswith(n)]
    cands = list(dict.fromkeys(cands))
    if len(cands) == 1:
        fn = cands[0]; a = by_norm.get(norm(fn)); return fn, (a.get('identity_key') if a else None)
    return raw, None

resolved = 0; total_rows = 0
for mt in matches:
    for a in mt['athletes']:
        fn, key = resolve(a['raw_name']); a['name'] = fn; a['key'] = key
        total_rows += 1
        if key: resolved += 1

out = {'generated_at': datetime.date.today().isoformat(), 'source': '게임사격기록지', 'matches': matches}
json.dump(out, open(os.path.join(HERE, 'web', 'game.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(f'[game.json 저장] 경기 {len(matches)}개 · 행 {total_rows} · 식별키매칭 {resolved}  (원본파일 {len(all_matches)}건→중복제거)')
for mt in matches:
    print(f"  {mt['date']} {mt['name']} [{mt['game_type']}]: {len(mt['athletes'])}명")
