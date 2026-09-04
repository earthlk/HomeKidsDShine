// ============================================================
// Homey Kids D Shine — ui.js
// ส่วนประกอบหน้าจอที่ทุกหน้าใช้ร่วมกัน
// ============================================================

const UI = {

  // ── ข้อความแจ้งผล ─────────────────────────────────────────
  _toastTimer: null,

  toast(message, kind = 'ok') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
    el.textContent = message;
    el.hidden = false;

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  },

  // ── กล่องซ้อน ─────────────────────────────────────────────
  openSheet(html) {
    this.closeSheet();
    const wrap = document.createElement('div');
    wrap.className = 'sheet';
    wrap.id = 'sheet';
    wrap.innerHTML = '<div class="sheet__box" role="dialog" aria-modal="true">' + html + '</div>';

    // คลิกพื้นหลังเพื่อปิด
    wrap.addEventListener('click', e => { if (e.target === wrap) UI.closeSheet(); });
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
  },

  // เปลี่ยนเนื้อหาในกล่องที่เปิดอยู่ ใช้ตอนโหลดข้อมูลเสร็จ
  fillSheet(html) {
    const box = document.querySelector('#sheet .sheet__box');
    if (box) box.innerHTML = html;
  },

  closeSheet() {
    const el = document.getElementById('sheet');
    if (el) el.remove();
    document.body.style.overflow = '';
  },

  // ── สถานะกำลังโหลด ────────────────────────────────────────
  loading(text = 'กำลังโหลด') {
    return '<div class="loading"><div class="spinner"></div>' +
           '<p style="color:var(--mist);font-size:var(--t-sm)">' + text + '</p></div>';
  },

  // ── สถานะว่าง ─────────────────────────────────────────────
  empty(title, text, actionHtml = '') {
    return '<div class="empty"><p class="empty__title">' + title + '</p>' +
           '<p class="empty__text">' + text + '</p>' + actionHtml + '</div>';
  },

  // ── กันอักขระพิเศษก่อนใส่ลง HTML ──────────────────────────
  // ชื่อคนไทยมีเครื่องหมายคำพูดหรืออะพอสทรอฟีได้ ถ้าไม่กันจะทำ HTML พัง
  esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // ── วันที่แบบไทย ──────────────────────────────────────────
  thaiDate(iso, style = 'long') {
    if (!iso) return '';
    const p = String(iso).split(' ')[0].split('-');
    if (p.length !== 3) return iso;

    const MONTHS_LONG  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                          'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                          'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

    const day   = parseInt(p[2], 10);
    const month = (style === 'long' ? MONTHS_LONG : MONTHS_SHORT)[parseInt(p[1], 10) - 1];
    const year  = parseInt(p[0], 10) + 543;

    return day + ' ' + month + ' ' + (style === 'long' ? year : String(year).slice(-2));
  },

  // วันนี้ตามเวลาไทย — ห้ามใช้ toISOString() เพราะให้เวลา UTC
  // ก่อนเจ็ดโมงเช้าจะได้วันของเมื่อวาน
  today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },
};

// ── ไอคอน (SVG ในตัว ไม่พึ่งไลบรารีภายนอก) ──────────────────
const ICON = {
  // เครื่องหมายแบรนด์ — หลังคาบ้านกับหน้าต่างสี่ช่อง วาดตามโลโก้
  brand:    '<svg viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 14.6L14 4l11.4 10.6"/><g fill="currentColor" stroke="none"><rect x="10.5" y="11.2" width="3.1" height="3.1" rx="0.9"/><rect x="14.4" y="11.2" width="3.1" height="3.1" rx="0.9"/><rect x="10.5" y="15.1" width="3.1" height="3.1" rx="0.9"/><rect x="14.4" y="15.1" width="3.1" height="3.1" rx="0.9"/></g></svg>',
  home:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 21v-7h6v7"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  note:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h9l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5M8 13h8M8 17h5"/></svg>',
  book:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 016.5 2H20v18H6.5A2.5 2.5 0 004 22z"/><path d="M4 17.5A2.5 2.5 0 016.5 15H20"/></svg>',
  wallet:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  people:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.5a3 3 0 010 5.6M17.5 20a6.4 6.4 0 00-2-4.6"/></svg>',
  receipt:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  gear:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003.6 15a2 2 0 110-4 1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010.2 4a2 2 0 114 0 1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7 2 2 0 110 4z"/></svg>',
  shield:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/></svg>',
  exit:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg>',
  eye:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  eyeOff:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10.6 6.1A9.9 9.9 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.3 3.9M6.5 7.8A17 17 0 002 12s3.6 6.5 10 6.5c1.6 0 3-.3 4.3-.8"/><path d="M10.1 10.1a2.8 2.8 0 003.9 3.9M3 3l18 18"/></svg>',
};
