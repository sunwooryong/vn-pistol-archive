# -*- coding: utf-8 -*-
# 게임사격기록(PDF) → web/game.json
#   사용: python game-etl.py  [폴더경로]
#   기본 폴더: OneDrive 문서\새 폴더\게임사격기록지
#   담당 선수 이름으로 아카이브(build/athletes.json)와 매칭해 식별키 부여.
import pdfplumber, glob, re, os, sys, json, contextlib, io, warnings, logging, unicodedata
logging.disable(logging.CRITICAL); warnings.filterwarnings('ignore')

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = r'C:/Users/sunwo/OneDrive/문서/새 폴더/게임사격기록지'
folder = sys.argv[1] if len(sys.argv) > 1 else DEFAULT

def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s.replace('đ', 'd').replace('Đ', 'D')).lower().strip()

# 아카이브 선수 로드 (있으면 식별키 매칭)
ath_list = []
ap = os.path.join(HERE, 'build', 'athletes.json')
if os.path.exists(ap):
    ath_list = json.load(open(ap, encoding='utf-8'))
by_norm = {norm(a['full_name']): a for a in ath_list}

files = sorted(glob.glob(folder + '/*_훈련기록_KO.pdf'))
matches = []
for f in files:
    with contextlib.redirect_stderr(io.StringIO()):
        d = pdfplumber.open(f); t = d.pages[0].extract_text() or ''
    base = os.path.basename(f)
    md = re.search(r'(\d{4}-\d{2}-\d{2})', base)
    date = md.group(1) if md else ''
    title = (t.split('\n')[0] or '').strip()
    mname = '챔피언 결정전' if '챔피언' in title else ('Final Match' if 'Final' in title else title.split('·')[0].strip())
    rows = []
    for line in t.split('\n'):
        m = re.match(r'^\s*(\d+)\.\s+(.+)$', line)
        if not m: continue
        rank = int(m.group(1)); rest = m.group(2)
        nm = re.match(r'^([^\d]+?)\s+\d', rest)
        if not nm: continue
        name = re.sub(r'\s+', ' ', nm.group(1)).strip()
        # 합계: 우승/탈락 바로 앞 숫자(정수 또는 소수). 없으면 마지막 소수.
        tm = re.search(r'(\d{2,4}(?:\.\d)?)\s*(우승|탈락)', rest)
        status = ''
        if tm:
            total = float(tm.group(1)); status = tm.group(2)
        else:
            fl = re.findall(r'\d{2,3}\.\d', rest)
            if not fl: continue
            total = float(fl[-1])
        so = re.search(r'SO\d*[:\s]+([\d.]+)', rest)
        rows.append({'rank': rank, 'raw_name': name, 'total': total, 'status': status,
                     'shootoff': float(so.group(1)) if so else None})
    matches.append({'date': date, 'name': mname, 'file': base, 'athletes': rows})

# 스쿼드(풀네임 등장) 구성 → 축약 이름 해소
squad = {}  # norm(full) -> full
for mt in matches:
    for a in mt['athletes']:
        n = norm(a['raw_name'])
        if ' ' in n and (n in by_norm or len(n) > 8):
            squad[n] = a['raw_name']

def resolve(raw):
    n = norm(raw)
    if n in by_norm: return by_norm[n]['full_name'], by_norm[n].get('identity_key')
    # 스쿼드 내 끝단어/포함 매칭
    cands = [full for sn, full in squad.items() if sn == n or sn.endswith(' ' + n) or sn.endswith(n)]
    cands = list(dict.fromkeys(cands))
    if len(cands) == 1:
        fn = cands[0]; a = by_norm.get(norm(fn))
        return fn, (a.get('identity_key') if a else None)
    return raw, None

resolved = 0; total_rows = 0
for mt in matches:
    for a in mt['athletes']:
        fn, key = resolve(a['raw_name'])
        a['name'] = fn; a['key'] = key
        total_rows += 1
        if key: resolved += 1

out = {'generated_at': __import__('datetime').date.today().isoformat(),
       'source': '게임사격기록지', 'matches': matches}
outp = os.path.join(HERE, 'web', 'game.json')
json.dump(out, open(outp, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'[game.json 저장] 경기 {len(matches)}개 · 행 {total_rows} · 식별키매칭 {resolved}')
for mt in matches:
    print(f"  {mt['date']} {mt['name']}: {len(mt['athletes'])}명" + ('' if mt['athletes'] else '  ← 파싱실패'))
