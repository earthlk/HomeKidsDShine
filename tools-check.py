import pathlib, re, collections

root = pathlib.Path('/home/claude/repo')
bad = False

# 1. เมธอดชื่อซ้ำในไฟล์หน้าจอ
for f in sorted((root/'js').glob('*.js')):
    n = re.findall(r'^  (?:async )?([a-zA-Z_]\w*)\s*\(', f.read_text(), re.M)
    d = [x for x, c in collections.Counter(n).items() if c > 1 and x != 'start']
    if d: print('!! เมธอดซ้ำ', f.name, d); bad = True

# 2. ฟังก์ชันชื่อซ้ำในหลังบ้าน รวมข้ามไฟล์
src, alln = '', {}
for f in sorted((root/'apps-script').glob('*.gs')):
    t = f.read_text(); src += t + '\n'
    for n in re.findall(r'^function\s+([a-zA-Z_]\w*)\s*\(', t, re.M):
        alln.setdefault(n, []).append(f.name)
dup = {k: v for k, v in alln.items() if len(v) > 1}
if dup: print('!! ฟังก์ชันซ้ำ', dup); bad = True

# 3. ตัวเลือก CSS ซ้ำ
sel = re.findall(r'^([.#][A-Za-z0-9_.\-]+)\s*\{', (root/'css/app.css').read_text(), re.M)
d = [k for k, c in collections.Counter(sel).items() if c > 1]
if d: print('!! CSS ซ้ำ', d); bad = True

# 4. เส้นทางที่ไม่มีฟังก์ชันรองรับ
routes = (root/'apps-script/Main.gs').read_text()
block  = routes[routes.index('const ROUTES = {'):]
defined = set(alln.keys())
miss = sorted(set(c for c in re.findall(r'=>\s*([a-zA-Z_]\w*)\s*\(', block) if c not in defined))
if miss: print('!! เส้นทางไม่มีฟังก์ชัน', miss); bad = True

# 5. หน้าจอเรียก action ที่ไม่มีในตารางเส้นทาง
names = set(re.findall(r'^\s{2}([a-zA-Z_]\w*):\s*\{', block, re.M))
js = '\n'.join(f.read_text() for f in sorted((root/'js').glob('*.js')))
unk = sorted(u for u in set(re.findall(r"API\.(?:call|cached)\('([a-zA-Z_]\w*)'", js))
             if u not in names and u not in ('login', 'ping'))
if unk: print('!! หน้าจอเรียก action ที่ไม่มี', unk); bad = True

# 6. หน้าที่อยู่ในเมนูแต่ยังไม่ลงทะเบียน
pages = set(re.findall(r'^PAGES\.([a-zA-Z_]\w*)', js, re.M))
navs  = set(re.findall(r"id:\s*'([a-z]+)'", (root/'js/app.js').read_text()))
notreg = sorted(n for n in navs if n not in pages)
if notreg: print('   หมายเหตุ หน้าที่ยังไม่ลงทะเบียน:', notreg)

print('พบปัญหา' if bad else 'ตรวจผ่านทุกข้อ')

# 7. ฟิลด์ที่หน้าจออ่านแต่หลังบ้านไม่เคยส่งมา
#    เป็นบั๊กเงียบ เพราะ JavaScript คืน undefined แล้วแสดงเป็น 0 หรือช่องว่าง
def check_fields():
    gs = '\n'.join(f.read_text() for f in sorted((root/'apps-script').glob('*.gs')))
    sent = set(re.findall(r'^\s*([a-zA-Z_]\w*):\s', gs, re.M))

    problems = []
    for f in sorted((root/'js').glob('*.js')):
        t = f.read_text()
        for var in ['c', 'e', 's', 'r', 't', 'u', 'x', 'g']:
            for fld in re.findall(r'\b' + var + r'\.([a-zA-Z_]\w{3,})\b', t):
                if fld in sent: continue
                if fld in ('length','value','id','name','dataset','forEach','map','filter',
                           'items','lead','push','indexOf','classList','onclick','split',
                           'join','trim','slice','sort','some','find','toLocaleString',
                           'replace','textContent','innerHTML','options','selectedIndex',
                           'parentElement','disabled','type','checked','files','style',
                           'getFullYear','getMonth','getDate','getDay','charAt','padStart',
                           'localeCompare','toString','concat','then','catch','message',
                           'target','currentTarget','preventDefault','stopPropagation'):
                    continue
                problems.append((f.name, var + '.' + fld))

    seen, out = set(), []
    for x in problems:
        if x not in seen: seen.add(x); out.append(x)
    return out

miss = check_fields()
if miss:
    print('   หมายเหตุ ฟิลด์ที่อาจไม่มีในข้อมูลจากหลังบ้าน:')
    for f, fld in miss[:20]: print('     ', f, fld)

# 8. รายการเมนูซ้ำ id เดียวกันในสิทธิ์เดียวกัน
def check_nav():
    t = (root/'js/app.js').read_text()
    block = t[t.index('const NAV = {'):t.index('const ROLE_LABEL')]
    out = []
    for role in re.findall(r'(\w+):\s*\[(.*?)\],\n', block, re.S):
        ids = re.findall(r"id:\s*'([a-z]+)'", role[1])
        d = [k for k, c in collections.Counter(ids).items() if c > 1]
        if d: out.append((role[0], d))
    return out

nav = check_nav()
if nav:
    print('!! เมนูซ้ำ:', nav)
