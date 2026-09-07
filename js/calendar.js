// ============================================================
// Homey Kids D Shine — calendar.js
// ตารางนัดหมาย
// ============================================================

const Cal = {

  sessions: [],
  canEdit:  false,
  meta:     null,          // ข้อมูลประกอบฟอร์ม โหลดเมื่อเปิดฟอร์มครั้งแรก
  anchor:   null,          // วันที่ใช้อ้างอิงว่ากำลังดูช่วงไหน
  view:     null,          // month | week | list | cards

  DAYS:   ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  MONTHS: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
           'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],

  // ── โหลดและวาดหน้า ────────────────────────────────────────
  async render(el) {
    if (!this.anchor) this.anchor = UI.today();
    // จอเล็กใช้มุมมองรายการเป็นค่าตั้งต้น ตารางเดือนอ่านยากบนมือถือ
    if (!this.view) this.view = window.innerWidth < 768 ? 'list' : 'month';

    const win = this.window();
    const res = await API.cached('getSchedule', win);

    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.sessions = res.data.sessions;
    this.canEdit  = res.data.canEdit;
    this.paint(el);
  },

  // ขอข้อมูลเผื่อเดือนหน้าและเดือนก่อน จะได้กดเปลี่ยนเดือนแล้วไม่ต้องรอโหลด
  window() {
    const [y, m] = this.anchor.split('-').map(Number);
    const pad = n => String(n).padStart(2, '0');
    const from = new Date(y, m - 2, 1);
    const to   = new Date(y, m + 1, 0);
    return {
      from: from.getFullYear() + '-' + pad(from.getMonth() + 1) + '-01',
      to:   to.getFullYear() + '-' + pad(to.getMonth() + 1) + '-' + pad(to.getDate()),
    };
  },

  paint(el) {
    const views = [['month', 'เดือน'], ['week', 'สัปดาห์'],
                   ['list', 'รายการ'], ['cards', 'การ์ด']];

    el.innerHTML = `
      <div class="calbar">
        <div class="calnav">
          <button class="calnav__arrow" data-move="-1" aria-label="ก่อนหน้า">‹</button>
          <span class="calnav__label">${this.rangeLabel()}</span>
          <button class="calnav__arrow" data-move="1" aria-label="ถัดไป">›</button>
          <button class="btn btn--ghost btn--sm" data-today>วันนี้</button>
        </div>

        <div class="segbar">
          ${views.map(([v, label]) =>
            `<button class="segbar__btn${this.view === v ? ' is-on' : ''}" data-view="${v}">${label}</button>`
          ).join('')}
        </div>

        ${this.canEdit ? '<button class="btn btn--primary" data-new>ลงนัด</button>' : ''}
      </div>

      <div id="calBody"></div>`;

    el.querySelectorAll('[data-move]').forEach(b => {
      b.onclick = () => Cal.move(Number(b.dataset.move));
    });
    el.querySelector('[data-today]').onclick = () => {
      Cal.anchor = UI.today();
      Cal.goTo();
    };
    el.querySelectorAll('[data-view]').forEach(b => {
      b.onclick = () => { Cal.view = b.dataset.view; Cal.paint(el); };
    });
    const add = el.querySelector('[data-new]');
    if (add) add.onclick = () => Cal.openForm();


    this.paintBody();
  },

  async move(dir) {
    const [y, m, d] = this.anchor.split('-').map(Number);
    const base = new Date(y, m - 1, d);

    if (this.view === 'week') base.setDate(base.getDate() + dir * 7);
    else                      base.setMonth(base.getMonth() + dir);

    const pad = n => String(n).padStart(2, '0');
    this.anchor = base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate());
    await this.goTo();
  },

  // ── ย้ายช่วงเวลาที่กำลังดู ─────────────────────────────────
  // ต่างจาก reload ตรงที่ไม่ล้างข้อมูลที่เก็บไว้
  // เดือนที่เคยโหลดแล้วจึงกลับไปดูได้ทันทีโดยไม่ต้องรอเครือข่าย
  async goTo() {
    const el = document.getElementById('page');
    if (!el) return;

    // วาดแถบเครื่องมือด้วยเดือนใหม่ก่อน ผู้ใช้จะเห็นว่ากดติดทันที
    this.paint(el);

    const box = document.getElementById('calBody');
    if (box) box.innerHTML = UI.skeleton(4);

    const res = await API.cached('getSchedule', this.window());
    if (!res.ok) {
      if (box) box.innerHTML = `<div class="notice notice--error">${UI.esc(res.message)}</div>`;
      return;
    }

    this.sessions = res.data.sessions;
    this.canEdit  = res.data.canEdit;
    this.paintBody();
  },

  rangeLabel() {
    const [y, m, d] = this.anchor.split('-').map(Number);

    if (this.view === 'week') {
      const start = this.weekStart();
      const end   = new Date(start); end.setDate(start.getDate() + 6);
      const same  = start.getMonth() === end.getMonth();
      return start.getDate() + (same ? '' : ' ' + this.MONTHS[start.getMonth()].slice(0, 3)) +
             ' – ' + end.getDate() + ' ' + this.MONTHS[end.getMonth()] + ' ' + (end.getFullYear() + 543);
    }

    return this.MONTHS[m - 1] + ' ' + (y + 543);
  },

  weekStart() {
    const [y, m, d] = this.anchor.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() - base.getDay());
    return base;
  },

  paintBody() {
    const box = document.getElementById('calBody');
    if (!box) return;

    if (this.view === 'month') this.paintMonth(box);
    if (this.view === 'week')  this.paintWeek(box);
    if (this.view === 'list')  this.paintList(box);
    if (this.view === 'cards') this.paintCards(box);

    box.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = (ev) => { ev.stopPropagation(); Cal.openDetail(b.dataset.open); };
    });
    box.querySelectorAll('[data-group]').forEach(b => {
      b.onclick = (ev) => { ev.stopPropagation(); Cal.openGroup(b.dataset.date, b.dataset.group); };
    });
    box.querySelectorAll('[data-day]').forEach(b => {
      if (Cal.canEdit) b.onclick = () => Cal.openForm(null, { date: b.dataset.day });
    });
  },

  // ── มุมมองเดือน ───────────────────────────────────────────
  paintMonth(box) {
    const [y, m] = this.anchor.split('-').map(Number);
    const first  = new Date(y, m - 1, 1);
    const days   = new Date(y, m, 0).getDate();
    const lead   = first.getDay();
    const today  = UI.today();
    const byDate = this.byDate();
    const pad    = n => String(n).padStart(2, '0');

    let cells = this.DAYS.map(d => `<div class="mcell__name">${d}</div>`).join('');

    for (let i = 0; i < lead; i++) cells += '<div class="mcell mcell--pad"></div>';

    for (let day = 1; day <= days; day++) {
      const iso    = y + '-' + pad(m) + '-' + pad(day);
      const groups = this.groupSessions(byDate[iso] || []);

      // แสดงได้สามรายการต่อวัน มากกว่านั้นบอกเป็นจำนวนเพื่อไม่ให้ช่องล้น
      const items = groups.slice(0, 3).map(g => `
        <button class="mev mev--${UI.esc(g.lead.status)}" data-group="${UI.esc(g.key)}"
          data-date="${iso}" title="${UI.esc(this.groupTitle(g))}">
          <span class="mev__t">${UI.esc(g.lead.startTime)}</span>
          <span class="mev__n">${UI.esc(this.groupLabel(g))}</span>
        </button>`).join('');

      cells += `
        <div class="mcell${iso === today ? ' mcell--today' : ''}" data-day="${iso}">
          <span class="mcell__num">${day}</span>
          ${items}
          ${groups.length > 3 ? `<span class="mcell__more">อีก ${groups.length - 3} รายการ</span>` : ''}
        </div>`;
    }

    box.innerHTML = `<div class="mgrid">${cells}</div>`;
  },

  // เด็กหลายคนที่เรียนคอร์สเดียวกัน เวลาเดียวกัน กับครูคนเดียวกัน
  // คือคาบสอนคาบเดียว ไม่ใช่หลายคาบ จึงควรขึ้นในปฏิทินรายการเดียว
  groupSessions(list) {
    const map = {};
    const out = [];

    list.forEach(s => {
      const key = [s.courseName, s.startTime, s.endTime, s.trainerId,
                   s.status].join('|');

      if (!map[key]) {
        map[key] = { key: key, lead: s, items: [] };
        out.push(map[key]);
      }
      map[key].items.push(s);
    });

    return out;
  },

  // ป้ายที่แสดงขึ้นกับสิทธิ์ เพราะแต่ละคนเห็นเฉพาะนัดของตัวเองอยู่แล้ว
  // ผู้ปกครองรู้อยู่แล้วว่าเป็นลูกตัวเอง จึงอยากรู้ว่าใครสอน
  // ผู้ฝึกสอนรู้อยู่แล้วว่าตัวเองสอน จึงอยากรู้ว่าสอนใคร
  groupLabel(g) {
    const s = g.lead;
    if (g.items.length > 1) return s.courseName + ' ×' + g.items.length;

    const role = Store.get('role');
    if (role === 'trainer') return s.courseName + ' · ' + s.childName;
    if (role === 'parent')  return s.courseName + ' · ' + s.trainerName;
    return s.courseName;
  },

  groupTitle(g) {
    const s = g.lead;
    return s.startTime + '–' + s.endTime + ' ' + s.courseName +
           ' · ' + s.trainerName +
           ' · ' + g.items.map(x => x.childName).join(', ');
  },

  // ── มุมมองสัปดาห์ ─────────────────────────────────────────
  paintWeek(box) {
    const start  = this.weekStart();
    const today  = UI.today();
    const byDate = this.byDate();
    const pad    = n => String(n).padStart(2, '0');

    let cols = '';
    for (let i = 0; i < 7; i++) {
      const d   = new Date(start); d.setDate(start.getDate() + i);
      const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const list = byDate[iso] || [];

      cols += `
        <div class="wcol${iso === today ? ' wcol--today' : ''}">
          <div class="wcol__head" data-day="${iso}">
            <span class="wcol__day">${this.DAYS[d.getDay()]}</span>
            <span class="wcol__num">${d.getDate()}</span>
          </div>
          <div class="wcol__body">
            ${list.length ? this.groupSessions(list).map(g => this.chip(g, iso)).join('')
                          : '<span class="wcol__empty">—</span>'}
          </div>
        </div>`;
    }

    box.innerHTML = `<div class="wgrid">${cols}</div>`;
  },

  chip(g, iso) {
    const s     = g.lead;
    const many  = g.items.length > 1;
    const under = many ? g.items.map(x => x.childName).join(', ')
                       : (Store.get('role') === 'trainer' ? s.childName : s.trainerName);

    return `
      <button class="wev wev--${UI.esc(s.status)}" data-group="${UI.esc(g.key)}"
        data-date="${UI.esc(iso)}" title="${UI.esc(this.groupTitle(g))}">
        <span class="wev__t">${UI.esc(s.startTime)}–${UI.esc(s.endTime)}</span>
        <span class="wev__n">${UI.esc(s.courseName)}${many ? ' ×' + g.items.length : ''}</span>
        <span class="wev__s">${UI.esc(under)}</span>
      </button>`;
  },

  // ── มุมมองรายการ ──────────────────────────────────────────
  // รวมเป็นคาบเหมือนมุมมองการ์ด หนึ่งแถวคือหนึ่งคาบสอน
  paintList(box) {
    const [y, m] = this.anchor.split('-').map(Number);
    const prefix = y + '-' + String(m).padStart(2, '0');
    const byDate = this.byDate();
    const dates  = Object.keys(byDate).filter(d => d.indexOf(prefix) === 0).sort();

    if (!dates.length) {
      box.innerHTML = UI.empty('ไม่มีนัดในเดือนนี้',
        this.canEdit ? 'กดปุ่มลงนัดเพื่อเพิ่มรายการแรกของเดือน'
                     : 'เมื่อมีนัดใหม่ รายการจะขึ้นที่นี่');
      return;
    }

    const today = UI.today();

    box.innerHTML = dates.map(iso => {
      const d      = new Date(iso + 'T00:00:00');
      const groups = this.groupSessions(byDate[iso]);

      return `
        <div class="agroup">
          <div class="agroup__head${iso === today ? ' agroup__head--today' : ''}">
            <span class="agroup__num">${d.getDate()}</span>
            <span class="agroup__day">${this.DAYS[d.getDay()]}</span>
            <span class="agroup__mon">${this.MONTHS[d.getMonth()]}</span>
            ${iso === today ? '<span class="pchip pchip--ok">วันนี้</span>' : ''}
            <span class="agroup__n">${groups.length} คาบ · ${byDate[iso].length} คน</span>
          </div>
          ${groups.map(g => this.card(g, iso)).join('')}
        </div>`;
    }).join('');
  },

  card(g, iso) {
    const s    = g.lead;
    const many = g.items.length > 1;
    const kids = g.items.map(x => x.childName).join(', ');
    const note = this.groupNotes(g);

    // รวมข้อควรระวังของเด็กทุกคนในคาบ ตัดที่ซ้ำออก
    const alerts = [];
    g.items.forEach(x => (x.alerts || []).forEach(a => {
      if (alerts.indexOf(a) < 0) alerts.push(a);
    }));

    return `
      <button class="acard acard--${UI.esc(s.status)}"
        data-group="${UI.esc(g.key)}" data-date="${UI.esc(iso)}">

        <span class="acard__time">
          <span class="acard__from">${UI.esc(s.startTime)}</span>
          <span class="acard__to">${UI.esc(s.endTime)}</span>
        </span>

        <span class="acard__col">
          <span class="acard__name">${UI.esc(s.courseName || 'ไม่ระบุคอร์ส')}</span>
          <span class="acard__k">ผู้ฝึกสอน</span>
          <span class="acard__v">${UI.esc(s.trainerName || '—')}</span>
          ${s.location ? `<span class="acard__meta">${UI.esc(s.location)}</span>` : ''}
        </span>

        <span class="acard__col">
          <span class="acard__k">${many ? 'เด็ก ' + g.items.length + ' คน' : 'เด็ก'}</span>
          <span class="acard__v">${UI.esc(kids)}</span>
        </span>

        <span class="acard__col">
          <span class="acard__k">ผู้ปกครอง</span>
          <span class="acard__v">${many ? 'กดเพื่อดูรายชื่อ'
            : UI.esc(s.parentName || '—')}</span>
          ${!many && s.parentPhone ? `<span class="acard__meta">${UI.esc(s.parentPhone)}</span>` : ''}
        </span>

        ${this.statusChip(s)}

        ${alerts.length || note || s.cancelReason ? `
          <span class="acard__foot">
            ${alerts.length
              ? `<span class="acard__alert">${UI.esc(alerts.join(' · '))}</span>` : ''}
            ${note ? `<span class="acard__meta">หมายเหตุ ${UI.esc(note)}</span>` : ''}
            ${s.cancelReason ? `<span class="acard__meta">ยกเลิก: ${UI.esc(s.cancelReason)}</span>` : ''}
          </span>` : ''}
      </button>`;
  },

  // หมายเหตุของคาบ รวมของทุกคนแล้วตัดที่ซ้ำออก
  groupNotes(g) {
    const out = [];
    g.items.forEach(x => {
      const n = String(x.notes || '').trim();
      if (n && out.indexOf(n) < 0) out.push(n);
    });
    return out.join(' · ');
  },

  // ── มุมมองการ์ด ───────────────────────────────────────────
  // หนึ่งการ์ดคือหนึ่งคาบสอน ไม่ใช่หนึ่งเด็ก
  // คาบกลุ่มที่มีเด็กสามคนควรเป็นการ์ดใบเดียว ไม่ใช่สามใบที่ซ้ำกันเกือบหมด
  paintCards(box) {
    const [y, m] = this.anchor.split('-').map(Number);
    const prefix = y + '-' + String(m).padStart(2, '0');
    const byDate = this.byDate();

    const dates = Object.keys(byDate)
      .filter(d => d.indexOf(prefix) === 0)
      .sort();

    if (!dates.length) {
      box.innerHTML = UI.empty('ไม่มีนัดในเดือนนี้',
        this.canEdit ? 'กดปุ่มลงนัดเพื่อเพิ่มรายการแรกของเดือน'
                     : 'เมื่อมีนัดใหม่ รายการจะขึ้นที่นี่');
      return;
    }

    const cards = [];
    dates.forEach(iso => {
      this.groupSessions(byDate[iso]).forEach(g => cards.push(this.bigCard(g, iso)));
    });

    box.innerHTML = '<div class="pgrid">' + cards.join('') + '</div>';
  },

  bigCard(g, iso) {
    const s     = g.lead;
    const many  = g.items.length > 1;
    const d     = new Date(iso + 'T00:00:00');
    const today = UI.today();

    // รวมข้อควรระวังของเด็กทุกคนในคาบ ตัดที่ซ้ำกันออก
    const alerts = [];
    g.items.forEach(x => (x.alerts || []).forEach(a => {
      if (alerts.indexOf(a) < 0) alerts.push(a);
    }));

    return `
      <article class="scard scard--${UI.esc(s.status)}${iso === today ? ' scard--today' : ''}"
        data-group="${UI.esc(g.key)}" data-date="${UI.esc(iso)}">

        <div class="scard__top">
          <span class="scard__when">
            <span class="scard__daybox">
              <span class="scard__dow">${this.DAYS[d.getDay()]}</span>
              <span class="scard__day">${d.getDate()}</span>
            </span>
            <span class="scard__hours">${UI.esc(s.startTime)} – ${UI.esc(s.endTime)}</span>
          </span>
          ${this.statusChip(s)}
        </div>

        <div>
          <h3 class="scard__name">${UI.esc(s.courseName || 'ไม่ระบุคอร์ส')}</h3>
          ${many ? `<span class="pchip pchip--slot">กลุ่ม ${g.items.length} คน</span>` : ''}
        </div>

        <div class="scard__body">
          ${this.line('ผู้ฝึกสอน', s.trainerName)}
          ${this.line('สถานที่', s.location)}
          ${this.line('หมายเหตุ', this.groupNotes(g))}
          ${this.line('เหตุผลที่ยกเลิก', s.cancelReason)}
        </div>

        <div class="scard__kids">
          <span class="scard__kidsLabel">${many ? 'เด็กในคาบ ' + g.items.length + ' คน' : 'เด็ก'}</span>
          ${g.items.map(x => `<span class="pchip">${UI.esc(x.childName)}</span>`).join('')}
          ${many ? '' : `<span class="scard__parent">ผู้ปกครอง
            ${UI.esc(s.parentName || '—')}${s.parentPhone ? ' · ' + UI.esc(s.parentPhone) : ''}</span>`}
        </div>

        ${alerts.length ? `
          <div class="scard__alerts">
            ${alerts.map(a => `<span class="pchip pchip--danger">${UI.esc(a)}</span>`).join('')}
          </div>` : ''}
      </article>`;
  },

  line(label, value) {
    if (!String(value || '').trim()) return '';
    return `<p class="scard__line"><span>${label}</span> ${UI.esc(value)}</p>`;
  },

  // จำนวนเด็กที่อยู่ในคาบสอนเดียวกัน คือคอร์ส เวลา และผู้ฝึกสอนตรงกัน
  // มุมมองรายการกับการ์ดแยกรายคน จึงต้องบอกไว้ว่าคาบนั้นมีกี่คน
  slotCount(s) {
    return this.sessions.filter(x =>
      String(x.date)       === String(s.date) &&
      String(x.courseName) === String(s.courseName) &&
      String(x.startTime)  === String(s.startTime) &&
      String(x.endTime)    === String(s.endTime) &&
      String(x.trainerId)  === String(s.trainerId) &&
      x.status !== 'cancelled').length;
  },

  slotChip(s) {
    const n = this.slotCount(s);
    return n > 1 ? `<span class="pchip pchip--slot">กลุ่ม ${n} คน</span>` : '';
  },

  statusChip(s) {
    if (s.status === 'completed') return '<span class="pchip pchip--ok">สอนแล้ว</span>';
    if (s.status === 'cancelled') return '<span class="pchip pchip--muted">ยกเลิก</span>';
    if (s.date < UI.today())      return '<span class="pchip pchip--warn">รอบันทึก</span>';
    return '<span class="pchip">นัดแล้ว</span>';
  },

  byDate() {
    const map = {};
    this.sessions.forEach(s => {
      const k = String(s.date);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    return map;
  },

  // ── รายละเอียดของคาบสอนที่มีเด็กหลายคน ────────────────────
  openGroup(iso, key) {
    const day    = this.sessions.filter(s => String(s.date) === String(iso));
    const group  = this.groupSessions(day).find(g => g.key === key);
    if (!group) return;

    // มีคนเดียวก็เปิดรายละเอียดนัดนั้นไปเลย ไม่ต้องผ่านหน้ารายชื่อ
    if (group.items.length === 1) { this.openDetail(group.items[0].id); return; }

    const s = group.lead;

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(s.courseName)}</div>

      <div class="dsection">
        ${this.row('วันที่', UI.thaiDate(s.date))}
        ${this.row('เวลา', s.startTime + ' – ' + s.endTime)}
        ${this.row('ผู้ฝึกสอน', s.trainerName)}
        ${this.row('สถานที่', s.location)}
        ${this.row('จำนวนเด็ก', group.items.length + ' คน')}
      </div>

      <div class="dsection">
        <h3 class="dsection__title">เด็กในคาบนี้</h3>
        ${group.items.map(x => `
          <button class="drow" data-kid="${UI.esc(x.id)}">
            <span class="pcard__avatar pcard__avatar--sm">${UI.esc(People.initial({ name: x.childName }))}</span>
            <span>
              <span class="drow__name">${UI.esc(x.childName)}</span>
              <span class="drow__sub">${UI.esc(x.parentName || '')}${x.parentPhone ? ' · ' + UI.esc(x.parentPhone) : ''}</span>
            </span>
            ${x.alerts && x.alerts.length
              ? `<span class="pchip pchip--danger">${UI.esc(x.alerts[0])}</span>` : ''}
          </button>`).join('')}
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
      </div>`);

    document.querySelectorAll('[data-kid]').forEach(b => {
      b.onclick = () => {
        UI.closeSheet();
        setTimeout(() => Cal.openDetail(b.dataset.kid), 120);
      };
    });

    People.bindSheet({ close: () => UI.closeSheet() });
  },

  // ── รายละเอียดนัด ─────────────────────────────────────────
  openDetail(id) {
    const s = this.sessions.find(x => String(x.id) === String(id));
    if (!s) return;

    const past   = s.date < UI.today();
    const locked = s.status === 'completed';

    let actions = '<button class="btn btn--ghost" data-act="close">ปิด</button>';
    if (this.canEdit && !locked) {
      actions = `
        ${s.status === 'scheduled'
          ? `<button class="btn btn--danger" data-act="cancel">ยกเลิกนัด</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        <button class="btn btn--primary" data-act="edit">แก้ไข</button>`;
    }

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(s.childName)} · ${UI.esc(s.courseName)}</div>

      <div class="dsection">
        ${this.row('วันที่', UI.thaiDate(s.date))}
        ${this.row('เวลา', s.startTime + ' – ' + s.endTime)}
        ${this.row('ผู้ฝึกสอน', s.trainerName)}
        ${this.row('สถานที่', s.location)}
        ${this.row('ผู้ปกครอง', s.parentName + (s.parentPhone ? ' · ' + s.parentPhone : ''))}
        ${this.slotCount(s) > 1
          ? this.row('คาบนี้มีเด็ก', this.slotCount(s) + ' คน เรียนพร้อมกัน') : ''}
        ${this.row('สถานะ', {
          completed: 'สอนแล้ว', cancelled: 'ยกเลิก',
        }[s.status] || (past ? 'เลยวันนัดแล้ว รอผู้ฝึกสอนบันทึกกิจกรรม' : 'นัดแล้ว'))}
        ${this.row('หมายเหตุ', s.notes)}
        ${this.row('เหตุผลที่ยกเลิก', s.cancelReason)}
      </div>

      ${s.alerts && s.alerts.length ? `
        <div class="dsection dsection--alert">
          <h3 class="dsection__title">ข้อควรระวัง</h3>
          ${s.alerts.map(a => `<p class="dnote">${UI.esc(a)}</p>`).join('')}
        </div>` : ''}

      <div class="sheet__actions">${actions}</div>`);

    People.bindSheet({
      close:  () => UI.closeSheet(),
      edit:   () => { UI.closeSheet(); Cal.openForm(s); },
      cancel: () => Cal.openCancel(s),
    });
  },

  row(label, value) {
    if (!String(value || '').trim()) return '';
    return `<div class="drow2">
      <span class="drow2__k">${label}</span>
      <span class="drow2__v">${UI.esc(value)}</span>
    </div>`;
  },

  // ── ฟอร์มลงนัด ────────────────────────────────────────────
  // opts รองรับการเรียกจากหน้าอื่น เช่น กดลงนัดจากหน้าคอร์ส
  //   date       วันที่ตั้งต้น
  //   enrollment รายการลงทะเบียนที่เลือกไว้ล่วงหน้า
  //   after      ฟังก์ชันที่เรียกหลังบันทึกสำเร็จ แทนการโหลดหน้าปฏิทิน
  async openForm(s, opts) {
    s = s || {};
    opts = opts || {};
    const editing = !!s.id;

    UI.openSheet(UI.loading());

    if (!this.meta) {
      const res = await API.call('getScheduleMeta');
      if (!res.ok) { UI.closeSheet(); UI.toast(res.message, 'error'); return; }
      this.meta = res.data;
    }

    // รายการที่ใช้ครบแล้วจะไม่อยู่ในตัวเลือก แต่ตอนแก้ไขต้องเห็นรายการเดิม
    let list = this.meta.enrollments;
    if (editing && !list.some(e => String(e.id) === String(s.enrollmentId))) {
      list = [{ id: s.enrollmentId, childName: s.childName,
                courseName: s.courseName, remaining: 0, durationMin: 60 }].concat(list);
    }

    if (!list.length) {
      UI.fillSheet(`
        <div class="sheet__title">ลงนัด</div>
        ${UI.empty('ยังไม่มีรายการที่นัดได้',
          'ต้องลงทะเบียนคอร์สให้เด็กก่อน หรือรายการที่มีอยู่ใช้ครบจำนวนครั้งแล้ว')}
        <div class="sheet__actions">
          <button class="btn btn--ghost" data-act="close">ปิด</button>
          <button class="btn btn--primary" data-act="go">ไปหน้าคอร์ส</button>
        </div>`);
      People.bindSheet({
        close: () => UI.closeSheet(),
        go:    () => { UI.closeSheet(); App.go('courses'); },
      });
      return;
    }

    const chosen = String(s.enrollmentId || opts.enrollment || '');

    const trainerOpts = this.meta.trainers.map(t =>
      `<option value="${UI.esc(t.id)}"${String(s.trainerId) === String(t.id) ? ' selected' : ''}>
        ${UI.esc(t.name)}</option>`).join('');

    UI.fillSheet(`
      <div class="sheet__title">${editing ? 'แก้ไขนัดหมาย' : 'ลงนัด'}</div>
      ${editing ? `<p class="sheet__sub">
        ${UI.esc(s.childName)} · ${UI.esc(s.courseName)} · ${UI.thaiDate(s.date)} ${UI.esc(s.startTime)}
      </p>` : ''}

      ${People.fgroup('เรียนอะไรกับใคร')}
      <input type="hidden" id="s_enrollmentId" value="${UI.esc(chosen)}">
      <div class="field">
        <label class="field__label" for="s_q">เด็กและคอร์ส</label>
        ${editing || opts.enrollment ? `
          <p class="picker__fixed">${UI.esc(s.childName || this.enrollName(list, chosen))}</p>
          ${editing ? '<p class="fhint">เปลี่ยนคอร์สไม่ได้ ถ้าลงผิดให้ลบนัดนี้แล้วลงใหม่</p>' : ''}
        ` : `
          <input class="field__input" id="s_q" type="search"
            placeholder="ค้นหาจากชื่อเด็ก ผู้ปกครอง หรือคอร์ส" autocomplete="off">
          <div class="picker" id="s_list"></div>
        `}
      </div>
      <div class="field">
        <label class="field__label" for="s_trainerId">ผู้ฝึกสอน</label>
        <select class="field__input" id="s_trainerId">
          <option value="">เลือกผู้ฝึกสอน</option>${trainerOpts}
        </select>
      </div>

      ${People.fgroup('วันและเวลา')}
      ${People.finput('s_date', 'วันที่', s.date || opts.date || '', '', 'date')}
      <div class="frow">
        ${People.finput('s_startTime', 'เริ่ม', s.startTime || '09:00', '', 'time')}
        ${People.finput('s_endTime', 'สิ้นสุด', s.endTime || '10:00', '', 'time')}
      </div>

      ${editing ? '' : `
      <div class="field">
        <label class="field__label" for="s_repeat">นัดซ้ำรายสัปดาห์</label>
        <select class="field__input" id="s_repeat">
          <option value="1">ครั้งเดียว</option>
          ${[2,3,4,5,6,7,8,9,10,11,12].map(n =>
            `<option value="${n}">${n} สัปดาห์ติดกัน</option>`).join('')}
        </select>
        <p class="fhint">ลงวันเดียวกันของทุกสัปดาห์ ถ้าชนกับนัดอื่นจะหยุดและบอกให้ทราบ</p>
      </div>`}

      ${People.fgroup('รายละเอียด')}
      ${People.finput('s_location', 'สถานที่', s.location, 'เช่น ห้องฝึก A')}
      <div class="field">
        <label class="field__label" for="s_notes">หมายเหตุ</label>
        <textarea class="field__input" id="s_notes" rows="2">${UI.esc(s.notes)}</textarea>
      </div>

      <div class="sheet__actions">
        ${editing && !s.hasLog
          ? `<button class="btn btn--danger" data-act="del" data-busy="กำลังลบ">ลบ</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    // ระยะเวลาของคอร์สที่เลือกอยู่ ใช้คำนวณเวลาสิ้นสุดอัตโนมัติ
    let minutes = 60;
    const setMinutes = (id) => {
      const found = list.find(e => String(e.id) === String(id));
      minutes = (found && Number(found.durationMin)) || 60;
    };
    if (chosen) setMinutes(chosen);

    const bumpEnd = () => {
      const st  = People.val('s_startTime');
      const end = document.getElementById('s_endTime');
      if (st && end) end.value = Cal.addMinutes(st, minutes);
    };

    const startEl = document.getElementById('s_startTime');
    if (startEl) startEl.addEventListener('change', bumpEnd);

    // ตัวค้นหาแทน dropdown เพราะพอมีเด็กหลายสิบคน
    // การเลื่อนหาใน dropdown ช้ากว่าการพิมพ์ชื่อมาก
    const box   = document.getElementById('s_list');
    const query = document.getElementById('s_q');

    const draw = () => {
      const q = (query.value || '').trim().toLowerCase();

      // ยังไม่พิมพ์อะไรก็ไม่ต้องแสดงทั้งหมด ศูนย์ที่มีเด็กหลายสิบคน
      // รายการจะยาวจนต้องเลื่อนหา ซึ่งเป็นปัญหาเดิมที่เลิกใช้ dropdown มา
      // แสดงเฉพาะรายการที่ใกล้หมด เพราะเป็นกลุ่มที่ต้องรีบนัดมากที่สุด
      if (!q) {
        const soon = list.slice()
          .sort((a, b) => a.remaining - b.remaining)
          .slice(0, 5);

        box.innerHTML =
          '<p class="picker__head">ใกล้หมด ควรนัดเพิ่ม</p>' +
          soon.map(e => Cal.pickRow(e)).join('') +
          '<p class="picker__none">พิมพ์ชื่อเด็ก ผู้ปกครอง หรือคอร์ส เพื่อค้นหาจากทั้งหมด ' +
          list.length + ' รายการ</p>';

        Cal.bindPickRows(box, setMinutes, bumpEnd, draw);
        return;
      }

      // ค้นได้ทั้งชื่อเล่น ชื่อจริง ชื่อผู้ปกครอง และชื่อคอร์ส
      // เด็กชื่อเล่นซ้ำกันมีบ่อย ต้องแยกด้วยชื่อผู้ปกครอง
      const rows = list.filter(e =>
        [e.childName, e.childFullName, e.parentName, e.courseName]
          .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));

      if (!rows.length) {
        box.innerHTML = '<p class="picker__none">ไม่พบรายการที่ค้นหา</p>';
        return;
      }

      box.innerHTML = rows.slice(0, 20).map(e => Cal.pickRow(e)).join('') +
        (rows.length > 20
          ? '<p class="picker__none">พบ ' + rows.length + ' รายการ แสดง 20 รายการแรก</p>'
          : '');

      Cal.bindPickRows(box, setMinutes, bumpEnd, draw);
    };

    if (query && box) {
      query.addEventListener('input', draw);
      draw();
      query.focus();
    }

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Cal.submit(s.id, s.enrollmentId, opts.after),
      del:   () => Cal.remove(s.id),
    });
  },

  // แถวในรายการเลือก แสดงชื่อผู้ปกครองไว้แยกเด็กที่ชื่อเล่นซ้ำกัน
  pickRow(e) {
    const sel  = People.val('s_enrollmentId');
    const who  = [e.childFullName, e.parentName].filter(Boolean).join(' · ');

    return `
      <button type="button" class="picker__item${String(sel) === String(e.id) ? ' is-on' : ''}"
        data-pick="${UI.esc(e.id)}">
        <span class="picker__name">${UI.esc(e.childName)}</span>
        <span class="picker__sub">${UI.esc(e.courseName)}${who ? ' — ' + UI.esc(who) : ''}</span>
        <span class="picker__left${e.remaining <= 2 ? ' picker__left--low' : ''}">เหลือ ${e.remaining}</span>
      </button>`;
  },

  bindPickRows(box, setMinutes, bumpEnd, redraw) {
    box.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => {
        document.getElementById('s_enrollmentId').value = b.dataset.pick;
        setMinutes(b.dataset.pick);
        bumpEnd();
        redraw();
      };
    });
  },

  enrollName(list, id) {
    const e = list.find(x => String(x.id) === String(id));
    return e ? e.childName + ' · ' + e.courseName : '';
  },

  addMinutes(time, minutes) {
    const [h, m] = String(time).split(':').map(Number);
    const total  = h * 60 + m + minutes;
    const pad    = n => String(n).padStart(2, '0');
    return pad(Math.floor(total / 60) % 24) + ':' + pad(total % 60);
  },

  async submit(id, lockedEnrollment, after) {
    const payload = {
      id,
      enrollmentId: id ? lockedEnrollment : People.val('s_enrollmentId'),
      trainerId:    People.val('s_trainerId'),
      date:         People.val('s_date'),
      startTime:    People.val('s_startTime'),
      endTime:      People.val('s_endTime'),
      location:     People.val('s_location'),
      notes:        People.val('s_notes'),
      repeatWeeks:  People.val('s_repeat') || 1,
    };

    const res = await API.call('saveSession', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    const d = res.data;
    // นัดซ้ำอาจหยุดกลางทางเพราะชนนัดอื่นหรือครั้งหมด ต้องบอกให้ชัดว่าลงได้กี่ครั้ง
    if (d.stoppedAt) {
      UI.toast('ลงได้ ' + d.count + ' ครั้ง แล้วหยุดที่ ' +
               UI.thaiDate(d.stoppedAt, 'short') + ' เพราะ' + d.reason, 'error');
    } else {
      UI.toast(id ? 'บันทึกการแก้ไขแล้ว'
                  : 'ลงนัดแล้ว ' + d.count + (d.count > 1 ? ' ครั้ง' : ' ครั้ง'));
    }

    UI.closeSheet();
    if (after) { App.invalidate(); await after(); }
    else       { await this.reload(); }
  },

  // ── ยกเลิกนัด ─────────────────────────────────────────────
  openCancel(s) {
    UI.openSheet(`
      <div class="sheet__title">ยกเลิกนัด</div>
      <p>ยกเลิกนัดของ <strong>${UI.esc(s.childName)}</strong>
         วันที่ ${UI.thaiDate(s.date)} เวลา ${UI.esc(s.startTime)}</p>
      <p class="fhint">ครั้งนี้จะคืนกลับเข้ายอดคงเหลือ นัดใหม่ได้ภายหลัง</p>
      ${People.finput('x_reason', 'เหตุผล', '', 'เช่น เด็กไม่สบาย ผู้ปกครองขอเลื่อน')}
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ย้อนกลับ</button>
        <button class="btn btn--danger" data-act="go" data-busy="กำลังยกเลิก">ยกเลิกนัด</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      go: async () => {
        const reason = People.val('x_reason');
        if (!reason) { UI.toast('ระบุเหตุผลก่อน', 'error'); return; }

        const res = await API.call('cancelSession', { id: s.id, reason });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }

        UI.toast('ยกเลิกนัดแล้ว');
        UI.closeSheet();
        Cal.reload();
      },
    });
  },

  async remove(id) {
    const res = await API.call('removeSession', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }
    UI.toast('ลบนัดแล้ว');
    UI.closeSheet();
    this.reload();
  },

  async reload() {
    App.invalidate();
    await this.render(document.getElementById('page'));
  },
};

PAGES.calendar = (el) => Cal.render(el);
