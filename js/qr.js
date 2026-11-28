// ============================================================
// Homey Kids D Shine — qr.js
// ตัวเข้ารหัส QR ขนาดเล็ก ทำงานในเครื่องล้วน
// ============================================================
//
// ทำไมไม่เรียกบริการสร้าง QR จากข้างนอก
//   1. ยอดเงินกับเลขพร้อมเพย์ของศูนย์จะหลุดไปเครื่องคนอื่น
//   2. วันไหนบริการนั้นล่ม หน้าจ่ายเงินก็ใช้ไม่ได้ไปด้วย
//   3. หน้าเว็บนี้ไม่ได้โหลดสคริปต์จากข้างนอกเลยอยู่แล้ว
//
// รองรับโหมด byte ระดับแก้ไขข้อผิดพลาด M เวอร์ชัน 1 ถึง 10
// พอสำหรับ payload พร้อมเพย์ที่ยาวประมาณ 80 ถึง 110 ตัวอักษร
// ============================================================

const QR = {

  // ── ตารางโครงสร้างบล็อกของระดับ M ────────────────────────
  // [จำนวน codeword แก้ error ต่อบล็อก, บล็อกกลุ่ม 1, data ต่อบล็อก,
  //  บล็อกกลุ่ม 2, data ต่อบล็อก]
  EC_M: {
    1:  [10, 1, 16, 0, 0],
    2:  [16, 1, 28, 0, 0],
    3:  [26, 1, 44, 0, 0],
    4:  [18, 2, 32, 0, 0],
    5:  [24, 2, 43, 0, 0],
    6:  [16, 4, 27, 0, 0],
    7:  [18, 4, 31, 0, 0],
    8:  [22, 2, 38, 2, 39],
    9:  [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  },

  // ตำแหน่งกึ่งกลางของลายสอบเทียบ แยกตามเวอร์ชัน
  ALIGN: {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  },

  // ── เลขในสนามจำกัด GF(256) สำหรับ Reed-Solomon ───────────
  _exp: null,
  _log: null,

  initGF() {
    if (this._exp) return;
    const exp = new Array(512), log = new Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      log[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;   // พหุนามตั้งต้นของมาตรฐาน QR
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    this._exp = exp;
    this._log = log;
  },

  mul(a, b) {
    if (a === 0 || b === 0) return 0;
    return this._exp[this._log[a] + this._log[b]];
  },

  // พหุนามตัวหารสำหรับสร้าง codeword แก้ error
  // คูณ (x + α⁰)(x + α¹)…(x + αⁿ⁻¹) เข้าด้วยกัน
  //
  // ⚠️ เก็บแบบดีกรีมากไปน้อย poly[0] คือสัมประสิทธิ์ของดีกรีสูงสุดและเป็น 1 เสมอ
  // ถ้าเก็บกลับด้าน การหารใน ecBytes จะได้ผลลัพธ์ผิดทั้งชุดโดยไม่มีอะไรฟ้อง
  rsPoly(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j]     ^= poly[j];                          // เลื่อนดีกรีขึ้นหนึ่ง
        next[j + 1] ^= this.mul(poly[j], this._exp[i]);  // คูณด้วย αⁱ
      }
      poly = next;
    }
    return poly;
  },

  ecBytes(data, n) {
    const gen = this.rsPoly(n);
    const res = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = res[i];
      if (factor === 0) continue;
      for (let j = 1; j < gen.length; j++) {
        res[i + j] ^= this.mul(gen[j], factor);
      }
    }
    return res.slice(data.length);
  },

  // ── BCH สำหรับข้อมูลรูปแบบและข้อมูลเวอร์ชัน ──────────────
  bch(value, poly, bits) {
    let v = value << (bits - 1);
    const top = 1 << (bits - 1);
    while (this.bitLen(v) >= bits) {
      v ^= poly << (this.bitLen(v) - bits);
    }
    return (value << (bits - 1)) | v;
  },

  bitLen(v) {
    let n = 0;
    while (v) { n++; v >>>= 1; }
    return n;
  },

  // ── ลงบิตข้อมูลให้ครบความยาวที่เวอร์ชันนั้นต้องการ ────────
  encodeData(text, version) {
    const spec    = this.EC_M[version];
    const g1n = spec[1], g1d = spec[2], g2n = spec[3], g2d = spec[4];
    const totalData = g1n * g1d + g2n * g2d;

    const bytes = this.toUtf8(text);
    const bits  = [];
    const push  = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    push(0b0100, 4);                                   // โหมด byte
    push(bytes.length, version <= 9 ? 8 : 16);         // ความยาวข้อมูล
    bytes.forEach(b => push(b, 8));

    // ตัวปิดท้าย ยาวได้ถึง 4 บิต แต่ไม่เกินที่เหลือ
    const cap = totalData * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    // เติมให้เต็มด้วยสองค่านี้สลับกัน ตามที่มาตรฐานกำหนด
    const pad = [0xEC, 0x11];
    let k = 0;
    while (bits.length < cap) { push(pad[k % 2], 8); k++; }

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      codewords.push(v);
    }

    // ── แบ่งเป็นบล็อก คิด ec ของแต่ละบล็อก แล้วสานสลับกัน ──
    const blocks = [];
    let at = 0;
    for (let i = 0; i < g1n; i++) { blocks.push(codewords.slice(at, at + g1d)); at += g1d; }
    for (let i = 0; i < g2n; i++) { blocks.push(codewords.slice(at, at + g2d)); at += g2d; }

    const ecs = blocks.map(b => this.ecBytes(b, spec[0]));

    const out = [];
    const maxData = Math.max(g1d, g2d);
    for (let i = 0; i < maxData; i++) {
      blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    }
    for (let i = 0; i < spec[0]; i++) {
      ecs.forEach(e => out.push(e[i]));
    }
    return out;
  },

  toUtf8(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  },

  // ── วางลายตายตัวลงตาราง ───────────────────────────────────
  // reserved บอกว่าช่องไหนห้ามเอาข้อมูลไปวางทับ
  buildBase(version) {
    const size = version * 4 + 17;
    const m    = [], res = [];
    for (let i = 0; i < size; i++) {
      m.push(new Array(size).fill(0));
      res.push(new Array(size).fill(false));
    }

    const finder = (r, c) => {
      for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
          const y = r + i, x = c + j;
          if (y < 0 || x < 0 || y >= size || x >= size) continue;
          const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                     (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                     (i >= 2 && i <= 4 && j >= 2 && j <= 4);
          m[y][x]   = on ? 1 : 0;
          res[y][x] = true;
        }
      }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // เส้นจังหวะ ขาวดำสลับบนแถวและคอลัมน์ที่ 6
    for (let i = 8; i < size - 8; i++) {
      m[6][i] = m[i][6] = (i % 2 === 0) ? 1 : 0;
      res[6][i] = res[i][6] = true;
    }

    // ลายสอบเทียบ ไม่วางทับลายมุม
    const pos = this.ALIGN[version];
    pos.forEach(r => pos.forEach(c => {
      if (res[r][c]) return;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const on = Math.max(Math.abs(i), Math.abs(j)) !== 1;
          m[r + i][c + j]   = on ? 1 : 0;
          res[r + i][c + j] = true;
        }
      }
    }));

    // จุดดำตายตัวใต้ลายมุมซ้ายล่าง
    m[size - 8][8] = 1;
    res[size - 8][8] = true;

    // กันที่ไว้ให้ข้อมูลรูปแบบ
    for (let i = 0; i < 9; i++) {
      if (!res[8][i]) { res[8][i] = true; }
      if (!res[i][8]) { res[i][8] = true; }
    }
    for (let i = 0; i < 8; i++) {
      res[8][size - 1 - i] = true;
      res[size - 1 - i][8] = true;
    }

    // ข้อมูลเวอร์ชัน มีเฉพาะเวอร์ชัน 7 ขึ้นไป
    if (version >= 7) {
      const vinfo = this.bch(version, 0x1F25, 13);
      for (let i = 0; i < 18; i++) {
        const bit = (vinfo >> i) & 1;
        const r = Math.floor(i / 3), c = i % 3;
        m[r][size - 11 + c] = bit;  res[r][size - 11 + c] = true;
        m[size - 11 + c][r] = bit;  res[size - 11 + c][r] = true;
      }
    }

    return { m, res, size };
  },

  // ── วางบิตข้อมูลแบบซิกแซกจากขวาล่างขึ้นไป ────────────────
  place(base, codewords) {
    const { m, res, size } = base;
    const bits = [];
    codewords.forEach(c => {
      for (let i = 7; i >= 0; i--) bits.push((c >> i) & 1);
    });

    let idx = 0, up = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--;          // ข้ามคอลัมน์เส้นจังหวะ
      for (let v = 0; v < size; v++) {
        const row = up ? size - 1 - v : v;
        for (let k = 0; k < 2; k++) {
          const col = right - k;
          if (res[row][col]) continue;
          m[row][col] = idx < bits.length ? bits[idx] : 0;
          idx++;
        }
      }
      up = !up;
    }
  },

  maskFn(n) {
    return [
      (i, j) => (i + j) % 2 === 0,
      (i, j) => i % 2 === 0,
      (i, j) => j % 3 === 0,
      (i, j) => (i + j) % 3 === 0,
      (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
      (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
      (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
      (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
    ][n];
  },

  // ── คะแนนโทษ ยิ่งน้อยยิ่งอ่านง่าย ────────────────────────
  penalty(m) {
    const n = m.length;
    let score = 0;

    // แถวหรือคอลัมน์ที่สีเดียวกันติดกันตั้งแต่ 5 ช่อง
    const runs = (get) => {
      for (let i = 0; i < n; i++) {
        let last = -1, len = 0;
        for (let j = 0; j < n; j++) {
          const v = get(i, j);
          if (v === last) { len++; }
          else { if (len >= 5) score += 3 + (len - 5); last = v; len = 1; }
        }
        if (len >= 5) score += 3 + (len - 5);
      }
    };
    runs((i, j) => m[i][j]);
    runs((i, j) => m[j][i]);

    // สี่ช่องสีเดียวกันเป็นสี่เหลี่ยม
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const v = m[i][j];
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
      }
    }

    // ลวดลายที่ชวนสับสนกับลายมุม
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const hit = (get, i, j) => {
      const same = (p) => p.every((v, k) => get(i, j + k) === v);
      return same(pat1) || same(pat2);
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j + 11 <= n; j++) {
        if (hit((a, b) => m[a][b], i, j)) score += 40;
        if (hit((a, b) => m[b][a], i, j)) score += 40;
      }
    }

    // สัดส่วนช่องดำที่ห่างจากครึ่งหนึ่ง
    let dark = 0;
    m.forEach(row => row.forEach(v => { if (v) dark++; }));
    const pct = (dark * 100) / (n * n);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;

    return score;
  },

  // ── สร้างตาราง QR ────────────────────────────────────────
  // คืน array ของ array ค่า 0/1
  matrix(text, forceMask) {
    this.initGF();

    // เลือกเวอร์ชันเล็กที่สุดที่ใส่ข้อมูลลงได้
    const need = this.toUtf8(text).length;
    let version = 0;
    for (let v = 1; v <= 10; v++) {
      const s = this.EC_M[v];
      const cap = s[1] * s[2] + s[3] * s[4];
      // โหมด 4 บิต + ความยาว (8 หรือ 16 บิต) + ตัวปิดท้าย 4 บิต
      const head = v <= 9 ? 2 : 3;
      if (need + head <= cap) { version = v; break; }
    }
    if (!version) throw new Error('ข้อความยาวเกินกว่าที่ QR ขนาดนี้จะเก็บได้');

    const codewords = this.encodeData(text, version);

    let best = null, bestScore = Infinity;
    const from = forceMask === undefined ? 0 : forceMask;
    const upto = forceMask === undefined ? 8 : forceMask + 1;
    for (let mask = from; mask < upto; mask++) {
      const base = this.buildBase(version);
      this.place(base, codewords);

      const fn = this.maskFn(mask);
      const { m, res, size } = base;
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          if (!res[i][j] && fn(i, j)) m[i][j] ^= 1;
        }
      }

      // ข้อมูลรูปแบบ ระดับ M คือ 00 ต่อด้วยเลขหน้ากาก
      // เก็บสองชุดคนละมุม เครื่องอ่านจะได้ยังอ่านออกถ้ามุมหนึ่งเลอะ
      //
      // ⚠️ ชุดแรกไล่ลงคอลัมน์ 8 ก่อน แล้วค่อยไล่ตามแถว 8
      // สลับแถวกับคอลัมน์เมื่อไหร่ QR จะสแกนไม่ติดเลยทั้งที่ลายดูปกติ
      const fbits = this.bch((0b00 << 3) | mask, 0x537, 11) ^ 0b101010000010010;
      for (let i = 0; i < 15; i++) {
        const bit = (fbits >> i) & 1;

        // ชุดที่หนึ่ง รอบลายมุมซ้ายบน
        if (i <= 5)       m[i][8] = bit;
        else if (i === 6) m[7][8] = bit;
        else if (i === 7) m[8][8] = bit;
        else if (i === 8) m[8][7] = bit;
        else              m[8][14 - i] = bit;

        // ชุดที่สอง ครึ่งแรกไล่ตามแถว 8 จากขวาสุด ครึ่งหลังไล่ลงคอลัมน์ 8
        if (i < 8) m[8][size - 1 - i] = bit;
        else       m[size - 15 + i][8] = bit;
      }

      const score = this.penalty(m);
      if (score < bestScore) { bestScore = score; best = m; }
    }

    return best;
  },

  // ── วาดเป็น SVG ──────────────────────────────────────────
  // ใช้ path เดียวทั้งภาพ เบากว่าวาด rect ทีละช่องหลายร้อยอัน
  svg(text, opts) {
    const o      = opts || {};
    const m      = this.matrix(text);
    const n      = m.length;
    const quiet  = o.quiet === undefined ? 4 : o.quiet;   // ขอบขาวรอบนอก
    const total  = n + quiet * 2;
    const dark   = o.dark || '#3D2F22';
    const light  = o.light || '#FFFFFF';

    let d = '';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (m[i][j]) d += `M${j + quiet} ${i + quiet}h1v1h-1z`;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
           `shape-rendering="crispEdges" role="img" aria-label="คิวอาร์โค้ดสำหรับโอนเงิน">` +
           `<rect width="${total}" height="${total}" fill="${light}"/>` +
           `<path d="${d}" fill="${dark}"/></svg>`;
  },
};
