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

def parse_pdf(f):
    base = os.path.basename(f); text, _ = pdf_text(f)
    if not text: return []
    if re.search(r'순위\s+선수\s+지역', text):
        return parse_ranking(text, base)
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

# ---- 중복 제거 (같은 날짜+경기명+선수/총점 구성) ----
PRIO = {'csv': 5, 'elimination': 4, 'knockdown': 4, 'analysis': 3, 'target': 2}  # 높을수록 우선
def src_prio(mt):
    b = mt['file'].lower()
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
