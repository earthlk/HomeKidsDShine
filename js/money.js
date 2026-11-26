// ============================================================
// Homey Kids D Shine — money.js
// ของใช้ร่วมของหน้าการเงินสามหน้า
// ============================================================
//
// รับเงิน จ่ายค่าสอน และสรุปการเงิน เป็นสามหน้าแยกกัน
// แต่ใช้คำเรียก ช่วงวันที่ และวิธีวางตัวเลขชุดเดียวกัน
// รวมไว้ที่นี่ที่เดียว ไม่งั้นแก้คำว่า "โอนเงิน" ต้องตามแก้สามที่
// ============================================================

const Money = {

  METHOD: { transfer: 'โอนเงิน', cash: 'เงินสด' },

  FEE_LABEL: {
    noprice: 'ยังไม่ได้ตั้งราคา', unpaid: 'ยังไม่จ่าย',
    partial: 'จ่ายบางส่วน',      paid:   'ครบแล้ว',
  },

  methodOf(v) {
    return this.METHOD[v] || v || '';
  },

  // ── ช่วงวันที่ ────────────────────────────────────────────
  // ตั้งแต่วันที่หนึ่งของเดือนนี้ถึงวันนี้ เป็นช่วงที่คนเปิดดูบ่อยที่สุด
  thisMonth() {
    const t = UI.today();
    return { from: t.slice(0, 8) + '01', to: t };
  },

  // ปุ่มช่วงเวลาสำเร็จรูป คิดวันสุดท้ายของเดือนจากปฏิทินจริง
  // ไม่ใช้ค่าคงที่ 30 หรือ 31 เพราะกุมภาพันธ์ปีอธิกสุรทินจะพลาด
  quickRanges() {
    const t   = UI.today();
    const y   = Number(t.slice(0, 4));
    const m   = Number(t.slice(5, 7));
    const pad = n => String(n).padStart(2, '0');
    const last = (yy, mm) => new Date(yy, mm, 0).getDate();
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;

    return [
      ['เดือนนี้',  `${y}-${pad(m)}-01`, t],
      ['เดือนก่อน', `${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(last(py, pm))}`],
      ['ปีนี้',     `${y}-01-01`, t],
    ];
  },

  // ชื่อเดือนไทยจากคีย์ YYYY-MM ตัดจากตัวหนังสือตรง ๆ
  // ไม่ผ่าน new Date เพราะบางเครื่องตีความเป็นเวลา UTC แล้วเลื่อนเดือน
  thaiMonth(ym) {
    const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const y = Number(String(ym).slice(0, 4));
    const m = Number(String(ym).slice(5, 7));
    if (!y || !m) return ym;
    return MONTHS[m - 1] + ' ' + String(y + 543).slice(-2);
  },

  // ── แถบเลือกช่วงวันที่ ────────────────────────────────────
  // ใช้เหมือนกันทั้งหน้าจ่ายค่าสอนและหน้าสรุป
  // เลือกวันแล้วโหลดเลย ไม่มีปุ่มยืนยันอีกชั้น
  rangeHtml(from, to, prefix) {
    return `
      <div class="daterange">
        <input class="field__input" type="date" id="${prefix}_from" value="${UI.esc(from)}"
          aria-label="ตั้งแต่วันที่">
        <span class="daterange__to">ถึง</span>
        <input class="field__input" type="date" id="${prefix}_to" value="${UI.esc(to)}"
          aria-label="ถึงวันที่">
        <span class="daterange__sep"></span>
        ${this.quickRanges().map(([label, f, t]) =>
          `<button class="chipbtn chipbtn--sm${from === f && to === t ? ' is-on' : ''}"
            data-range="${f}|${t}">${label}</button>`).join('')}
      </div>`;
  },

  // ผูกเหตุการณ์ให้แถบช่วงวันที่ apply รับ (from, to) ที่ตรวจแล้ว
  bindRange(box, prefix, current, apply) {
    const read = () => {
      const from = People.val(prefix + '_from');
      const to   = People.val(prefix + '_to');
      if (!from || !to) return;                       // ยังพิมพ์ไม่ครบ ปล่อยเงียบ ๆ
      if (to < from) { UI.toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
      if (from === current.from && to === current.to) return;
      apply(from, to);
    };

    [prefix + '_from', prefix + '_to'].forEach(id => {
      const el = box.querySelector('#' + id);
      if (el) el.onchange = read;
    });

    box.querySelectorAll('[data-range]').forEach(b => {
      b.onclick = () => {
        const bits = b.dataset.range.split('|');
        apply(bits[0], bits[1]);
      };
    });
  },

  // ── ส่งออกเป็นไฟล์ CSV ────────────────────────────────────
  // ทำในเครื่องทั้งหมด ไม่ได้ส่งข้อมูลการเงินออกไปที่ไหน
  csvCell(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },

  // BOM ข้างหน้าเป็นเรื่องจำเป็น ไม่ใช่ของประดับ
  // Excel บน Windows เปิดไฟล์ UTF-8 ที่ไม่มี BOM แล้วภาษาไทยกลายเป็นขยะ
  download(name, rows) {
    const body = rows.map(r => r.map(c => this.csvCell(c)).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
