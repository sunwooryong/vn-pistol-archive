# -*- coding: utf-8 -*-
# ISSF 세계랭킹 자동 수집 → web/training-check/worldrank.json
#   ISSF가 매월 1일 공개하는 월간 랭킹 XLSX(World-Ranking-YYYYMMDD.xlsx)를 조회·파싱.
#   사용: python worldrank-etl.py
import os, re, json, io, datetime, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'web', 'training-check', 'worldrank.json')
PAGE = 'https://www.issf-sports.org/competitions/worldranking'
RECORDS_PAGE = 'https://www.issf-sports.org/competitions/records'
UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}
TOPN = 8

LABELS = {
    'APM':  {'ko': '10m 공기권총 남자', 'vi': '10m Súng ngắn hơi Nam', 'en': '10m Air Pistol Men'},
    'APW':  {'ko': '10m 공기권총 여자', 'vi': '10m Súng ngắn hơi Nữ', 'en': '10m Air Pistol Women'},
    'RFPM': {'ko': '25m 속사권총 남자', 'vi': '25m Bắn nhanh Nam', 'en': '25m Rapid Fire Pistol Men'},
    'SPW':  {'ko': '25m 권총 여자', 'vi': '25m Súng ngắn Nữ', 'en': '25m Pistol Women'},
    'ARM':  {'ko': '10m 공기소총 남자', 'vi': '10m Súng trường hơi Nam', 'en': '10m Air Rifle Men'},
    'ARW':  {'ko': '10m 공기소총 여자', 'vi': '10m Súng trường hơi Nữ', 'en': '10m Air Rifle Women'},
    'R3PM': {'ko': '50m 소총 3자세 남자', 'vi': '50m STr 3 tư thế Nam', 'en': '50m Rifle 3P Men'},
    'R3PW': {'ko': '50m 소총 3자세 여자', 'vi': '50m STr 3 tư thế Nữ', 'en': '50m Rifle 3P Women'},
    'TRM':  {'ko': '트랩 남자', 'vi': 'Trap Nam', 'en': 'Trap Men'},
    'TRW':  {'ko': '트랩 여자', 'vi': 'Trap Nữ', 'en': 'Trap Women'},
    'SKM':  {'ko': '스키트 남자', 'vi': 'Skeet Nam', 'en': 'Skeet Men'},
    'SKW':  {'ko': '스키트 여자', 'vi': 'Skeet Nữ', 'en': 'Skeet Women'},
}
ORDER = ['APM', 'APW', 'RFPM', 'SPW', 'ARM', 'ARW', 'R3PM', 'R3PW', 'TRM', 'TRW', 'SKM', 'SKW']

# C: 대회별 예선 1~8위(시리즈+총점). 기준 대회(최신 주요대회) — 갱신 시 여기만 수정.
COMP = {
    'id': '3275',
    'label': {'ko': '2025 세계선수권', 'vi': 'GĐ Thế giới 2025', 'en': '2025 World Champ'},
}
COMP_EVENTS = ['APM', 'APW']   # 10m 권총(6시리즈+총점 깔끔). 25m은 채점구조가 달라 제외


def comp_links(comp_id):
    # 대회 결과 색인에서 종목별 '예선 개인' 결과 상세 URL 추출(남/녀 해시 다름 → 구성 대신 스크랩)
    try:
        html = fetch('https://www.issf-sports.org/competitions/%s/results' % comp_id)
    except Exception:
        return {}
    out = {}
    for hx in set(re.findall(r'/competitions/%s/results/([0-9a-f]{20,})' % comp_id, html)):
        try:
            parts = bytes.fromhex(hx).decode('latin1').split(';')
        except Exception:
            continue
        if len(parts) >= 7 and parts[5] == 'Q' and parts[6] == 'I':
            code = parts[3]
            out[code] = 'https://www.issf-sports.org/competitions/%s/results/%s' % (comp_id, hx)
    return out


def parse_comp(html, topn=8):
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S):
        if '/athletes/' not in tr:
            continue
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if not tds:
            continue
        rtxt = re.sub(r'<[^>]+>', '', tds[0]).strip()
        if not rtxt.isdigit():
            continue
        rank = int(rtxt)
        if rank < 1 or rank > topn:
            continue
        mn = re.search(r'<a[^>]*>([^<]+)</a>', tr)
        if not mn:
            continue
        name = mn.group(1).replace('\xa0', ' ').replace('&nbsp;', ' ').strip()
        mnoc = re.search(r'</a></td>\s*<td[^>]*>([A-Z]{3})</td>', tr)
        noc = mnoc.group(1) if mnoc else ''
        ser = [int(x) for x in re.findall(r'align="center">\s*(\d+)\s*</td>', tr)][:6]
        mt = re.search(r'align="right">\s*(\d+(?:\.\d+)?)\s*-\s*\d+x', tr)
        total = mt.group(1) if mt else ''
        out.append({'rank': rank, 'name': name, 'noc': noc, 'series': ser, 'total': total})
    return sorted(out, key=lambda x: x['rank'])[:topn]


def fetch(url, binary=False):
    # urllib은 ISSF CDN에서 차단(404)되므로 curl 사용(Win10+/Git-Bash 기본 제공)
    if binary:
        tf = tempfile.NamedTemporaryFile(delete=False, suffix='.bin'); tf.close()
        subprocess.run(['curl', '-sL', '--fail', '-A', UA['User-Agent'], '-o', tf.name, url], check=True, timeout=90)
        data = open(tf.name, 'rb').read()
        os.unlink(tf.name)
        return data
    r = subprocess.run(['curl', '-sL', '--fail', '-A', UA['User-Agent'], url], check=True, capture_output=True, timeout=90)
    return r.stdout.decode('utf-8', 'replace')


def latest_xlsx_url():
    html = fetch(PAGE)
    links = re.findall(r'(https?://[^"\'<> ]*getfile\.aspx[^"\'<> ]*World-Ranking-(\d{8})\.xlsx)', html, re.I)
    if not links:
        rel = re.findall(r'([^"\'<> ]*getfile\.aspx[^"\'<> ]*World-Ranking-(\d{8})\.xlsx)', html, re.I)
        links = [(u if u.startswith('http') else 'https://backoffice.issf-sports.org/' + u.lstrip('/'), d) for u, d in rel]
    if not links:
        raise RuntimeError('랭킹 XLSX 링크를 찾지 못함')
    links.sort(key=lambda x: x[1])
    url = links[-1][0].replace('\\u0026', '&').replace('&amp;', '&')  # JS/HTML 이스케이프 복원
    return url, links[-1][1]


def parse_records(html):
    """ISSF 기록 페이지 → {종목제목(en): {WR/QWR/WRJ/QWRJ: {score,name,noc}}}. 개인기록만(팀 제외)."""
    recs = {}
    parts = re.split(r'<h2[^>]*>(.*?)</h2>', html)
    for k in range(1, len(parts), 2):
        title = re.sub(r'<[^>]+>', '', parts[k]).strip()
        content = parts[k + 1] if k + 1 < len(parts) else ''
        out = {}
        for chunk in content.split('<div class="grid')[1:]:
            mt = re.search(r'<div>([A-Z]{2,5})</div>', chunk)
            if not mt:
                continue
            typ = mt.group(1)
            if typ not in ('WR', 'QWR', 'WRJ', 'QWRJ') or typ in out:
                continue
            ms = re.search(r'text-center">([\d.]+)<', chunk)
            mn = re.search(r'<a[^>]*>([^<]+)</a>', chunk)   # 개인(팀은 <a> 없음→제외)
            mnoc = re.search(r'alt="([A-Z]{3})"', chunk)
            if not (ms and mn):
                continue
            out[typ] = {'score': ms.group(1), 'name': mn.group(1).strip(), 'noc': mnoc.group(1) if mnoc else ''}
        if out:
            recs[title] = out
    return recs


def build():
    import openpyxl
    url, datestr = latest_xlsx_url()
    buf = fetch(url, binary=True)
    wb = openpyxl.load_workbook(io.BytesIO(buf), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]

    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    idx = {str(v).strip().upper(): i for i, v in enumerate(header) if v is not None}
    iE, iR, iRt, iN, iNOC = idx.get('EVENT'), idx.get('RANK'), idx.get('RATING'), idx.get('NAME'), idx.get('NOC')
    if None in (iE, iR, iN):
        raise RuntimeError('헤더(EVENT/RANK/NAME) 누락: ' + repr(list(idx.keys())))

    events = {}
    for row in rows:
        ev = (str(row[iE]).strip() if row[iE] is not None else '')
        if not ev:
            continue
        try:
            rank = int(row[iR])
        except (TypeError, ValueError):
            continue
        if rank < 1 or rank > TOPN:
            continue
        name = (str(row[iN]).strip() if row[iN] is not None else '')
        noc = (str(row[iNOC]).strip() if (iNOC is not None and row[iNOC] is not None) else '')
        pts = row[iRt] if iRt is not None else None
        try:
            pts = int(pts)
        except (TypeError, ValueError):
            pass
        events.setdefault(ev, []).append({'rank': rank, 'name': name, 'noc': noc, 'points': pts})

    # 세계/주니어 기록(실패해도 랭킹은 진행)
    records = {}
    try:
        records = parse_records(fetch(RECORDS_PAGE))
    except Exception as e:
        print('  (records fetch failed:', e, ')')

    # 대회 예선 결과 링크(종목별)
    clinks = comp_links(COMP['id'])

    codes = [c for c in ORDER if c in events] + [c for c in events if c not in ORDER]
    out_events = []
    for code in codes:
        lab = LABELS.get(code, {'ko': code, 'vi': code, 'en': code})
        en = lab['en']
        sr = records.get(en, {})          # 시니어: WR(결선)·QWR(본선)
        jr = records.get(en + ' Junior', {})  # 주니어: WRJ·QWRJ
        rec = {}
        if sr.get('QWR'): rec['qwr'] = sr['QWR']
        if sr.get('WR'): rec['wr'] = sr['WR']
        if jr.get('QWRJ'): rec['qwrj'] = jr['QWRJ']
        if jr.get('WRJ'): rec['wrj'] = jr['WRJ']
        ev = {
            'code': code,
            'label': lab,
            'ranks': sorted(events[code], key=lambda x: x['rank'])[:TOPN],
            'records': rec,
        }
        # C: 대회 예선 1~8위(시리즈+총점) — 권총 종목만
        if code in COMP_EVENTS and clinks.get(code):
            try:
                top = parse_comp(fetch(clinks[code]))
                if top:
                    ev['comp'] = {'label': COMP['label'], 'top': top}
            except Exception as e:
                print('  (comp %s failed: %s)' % (code, e))
        out_events.append(ev)

    ver = f'{datestr[:4]}.{datestr[4:6]}.{datestr[6:8]}'
    out = {
        'source': 'ISSF World Ranking',
        'version': ver,
        'generated_at': datetime.datetime.now().isoformat(timespec='seconds'),
        'events': out_events,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'[worldrank.json] {len(out_events)} events, version {ver}')
    print('  ' + url)


if __name__ == '__main__':
    build()
