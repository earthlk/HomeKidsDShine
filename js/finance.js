// ============================================================
// Homey Kids D Shine — finance.js
// ค่าสอนและรอบการจ่าย
// ============================================================
//
// Admin เห็นของทุกคน ปิดรอบจ่ายและบันทึกการโอนได้
// ผู้ฝึกสอนเห็นเฉพาะของตัวเอง ดูอย่างเดียว แก้อะไรไม่ได้
// การกรองทำที่หลังบ้าน หน้านี้ไม่ได้แค่ซ่อนปุ่ม
// ============================================================

const Finance = {

  data:   null,
  tab:    'due',      // due = ค้างจ่าย | paid = จ่ายแล้ว | rounds = รอบจ่าย
  from:   '',
  to:     '',
  who:    'all',      // กรองตามผู้ฝึกสอน
  query:  '',

  METHOD: { transfer: 'โอนเงิน', cash: 'เงินสด' },

  // เปิดหน้ามาเอาเดือนปัจจุบัน เป็นช่วงที่คนดูบ่อยที่สุด
  defaultRange() {
    const today = UI.today();
    return { from: today.slice(0, 8) + '01', to: today };
  },

  async render(el) {
    if (!this.from) {
      const r = this.defaultRange();
      this.from = r.from;
      this.to   = r.to;
    }

    el.innerHTML = UI.loading('กำลังรวมค่าสอน');

    const res = await API.cached('getFinanceBoard', { from: this.from, to: this.to });
    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.data = res.data;

    if (this.data.noProfile) {
      el.innerHTML = UI.empty('ยังไม่ผูกข้อมูลผู้ฝึกสอน',
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน จึงยังไม่มีค่าสอนของตัวเอง แจ้งผู้ดูแลศูนย์ให้ผูกให้');
      return;
    }

    this.paint(el);
  },

  // ── โครงหน้า ──────────────────────────────────────────────
  paint(el) {
    const admin = !this.data.isTrainer;

    el.innerHTML = `
      <div class="toolbar">
        <div class="daterange">
          <label class="daterange__item">
            <span class="daterange__k">ตั้งแต่</span>
            <input class="field__input" type="date" id="f_from" value="${UI.esc(this.from)}">
          </label>
          <label class="daterange__item">
            <span class="daterange__k">ถึง</span>
            <input class="field__input" type="date" id="f_to" value="${UI.esc(this.to)}">
          </label>
          <button class="btn btn--ghost btn--sm" data-act="apply" data-busy="กำลังโหลด">ดูช่วงนี้</button>
        </div>
        ${admin ? `<div class="toolbar__actions">
          <button class="btn btn--primary" data-act="newPayout">ปิดรอบจ่าย</button>
        </div>` : ''}
      </div>

      <div class="quickpick">
        ${this.quickRanges().map(([label, from, to]) =>
          `<button class="chipbtn${this.from === from && this.to === to ? ' is-on' : ''}"
            data-range="${from}|${to}">${label}</button>`).join('')}
      </div>

      ${this.summary()}

      <div class="chipbar">
        ${[['due', 'ค้างจ่าย'], ['paid', 'จ่ายแล้ว'], ['rounds', 'รอบจ่าย']]
          .map(([v, label]) => `<button class="chipbtn${this.tab === v ? ' is-on' : ''}"
            data-tab="${v}">${label} <span class="chipbtn__n">${this.countOf(v)}</span></button>`).join('')}
      </div>

      ${admin ? `<input class="field__input toolbar__search" id="f_q" type="search"
        placeholder="ค้นหาจากชื่อผู้สอน คอร์ส หรือเด็ก" value="${UI.esc(this.query)}">` : ''}

      <div id="fList"></div>`;

    el.querySelector('[data-act="apply"]').onclick = (e) =>
      UI.run(e.currentTarget, 'กำลังโหลด', () => Finance.applyRange());

    if (admin) {
      el.querySelector('[data-act="newPayout"]').onclick = () => Finance.openPayoutForm();
      el.querySelector('#f_q').addEventListener('input', e => {
        Finance.query = e.target.value;
        Finance.paintList();
      });
    }

    el.querySelectorAll('[data-range]').forEach(b => {
      b.onclick = () => {
        const bits = b.dataset.range.split('|');
        Finance.from = bits[0];
        Finance.to   = bits[1];
        Finance.reload();
      };
    });

    el.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => {
        Finance.tab = b.dataset.tab;
        el.querySelectorAll('[data-tab]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.tab === Finance.tab));
        Finance.paintList();
      };
    });

    this.paintList();
  },

  // ช่วงวันที่ที่เลือกบ่อย กดทีเดียวไม่ต้องจิ้มปฏิทินสองครั้ง
  quickRanges() {
    const t     = UI.today();
    const y     = Number(t.slice(0, 4));
    const m     = Number(t.slice(5, 7));
    const pad   = n => String(n).padStart(2, '0');
    const last  = (yy, mm) => new Date(yy, mm, 0).getDate();

    const pm    = m === 1 ? 12 : m - 1;
    const py    = m === 1 ? y - 1 : y;

    return [
      ['เดือนนี้',   `${y}-${pad(m)}-01`,  t],
      ['เดือนก่อน',  `${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(last(py, pm))}`],
      ['ปีนี้',      `${y}-01-01`,          t],
    ];
  },

  // ── แถบสรุปยอด ────────────────────────────────────────────
  summary() {
    const due  = this.classes('due');
    const paid = this.classes('paid');
    const sum  = (list) => list.reduce((n, c) => n + Number(c.fee || 0), 0);

    const rounds  = this.data.payouts || [];
    const waiting = rounds.filter(r => r.status === 'pending');

    return `
      <div class="statbar">
        <div class="stat stat--warn">
          <span class="stat__num">${UI.money(sum(due))}</span>
          <span class="stat__k">ค้างจ่าย · ${due.length} คาบ</span>
        </div>
        <div class="stat">
          <span class="stat__num">${UI.money(sum(paid))}</span>
          <span class="stat__k">อยู่ในรอบแล้ว · ${paid.length} คาบ</span>
        </div>
        <div class="stat">
          <span class="stat__num">${waiting.length}</span>
          <span class="stat__k">รอบที่ยังไม่ได้โอน</span>
        </div>
      </div>`;
  },

  // ── คัดรายการตามแท็บ ──────────────────────────────────────
  classes(tab) {
    const all = this.data.classes || [];
    if (tab === 'due')  return all.filter(c => !c.payoutId);
    if (tab === 'paid') return all.filter(c => !!c.payoutId);
    return all;
  },

  countOf(tab) {
    if (tab === 'rounds') return (this.data.payouts || []).length;
    return this.classes(tab).length;
  },

  filtered(list) {
    const q = this.query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      [c.trainerName, c.courseName, (c.children || []).join(' ')]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
  },

  paintList() {
    const box = document.getElementById('fList');
    if (!box) return;

    if (this.tab === 'rounds') { this.paintRounds(box); return; }

    const list = this.filtered(this.classes(this.tab));

    if (!list.length) {
      box.innerHTML = this.tab === 'due'
        ? UI.empty('ไม่มีคาบค้างจ่าย',
            'ช่วงวันที่นี้จ่ายครบแล้ว หรือยังไม่มีคาบที่บันทึกกิจกรรมเรียบร้อย')
        : UI.empty('ยังไม่มีคาบที่เข้ารอบจ่าย', 'ปิดรอบจ่ายแล้วคาบจะย้ายมาอยู่ตรงนี้');
      return;
    }

    box.innerHTML = '<div class="flist">' + list.map(c => `
      <article class="frow2">
        <div class="frow2__when">
          <span class="frow2__date">${UI.esc(UI.thaiDate(c.date, 'short'))}</span>
          <span class="frow2__time">${UI.esc(c.startTime)}–${UI.esc(c.endTime)}</span>
        </div>
        <div class="frow2__main">
          <h3 class="frow2__course">${UI.esc(c.courseName || 'ไม่พบคอร์ส')}</h3>
          <p class="frow2__meta">
            ${this.data.isTrainer ? '' : UI.esc(c.trainerName) + ' · '}เด็ก ${c.children.length} คน
            ${c.location ? ' · ' + UI.esc(c.location) : ''}
          </p>
          <p class="frow2__kids">${UI.esc(c.children.join(' · '))}</p>
        </div>
        <div class="frow2__money">
          <span class="frow2__fee">${UI.money(c.fee)}</span>
          <span class="frow2__unit">บาท</span>
        </div>
      </article>`).join('') + '</div>';
  },

  // ── รายการรอบจ่าย ─────────────────────────────────────────
  paintRounds(box) {
    const rounds = this.data.payouts || [];

    if (!rounds.length) {
      box.innerHTML = UI.empty('ยังไม่มีรอบจ่ายในช่วงนี้',
        this.data.isTrainer
          ? 'เมื่อศูนย์ปิดรอบจ่ายแล้ว รายการจะขึ้นที่นี่'
          : 'กดปิดรอบจ่ายเพื่อรวมคาบที่ค้างอยู่เป็นรอบเดียว');
      return;
    }

    box.innerHTML = '<div class="flist">' + rounds.map(r => `
      <button class="prow" data-payout="${UI.esc(r.id)}">
        <span class="prow__main">
          <span class="prow__who">
            ${this.data.isTrainer ? 'รอบ' : UI.esc(r.trainerName)}
            ${UI.esc(UI.thaiDate(r.periodStart, 'short'))} – ${UI.esc(UI.thaiDate(r.periodEnd, 'short'))}
          </span>
          <span class="prow__meta">
            ${r.classCount} คาบ
            ${r.status === 'paid' && r.paidAt
              ? ' · โอน ' + UI.esc(UI.thaiDate(r.paidAt, 'short'))
              : ''}
            ${r.reference ? ' · อ้างอิง ' + UI.esc(r.reference) : ''}
          </span>
        </span>
        <span class="prow__right">
          <span class="prow__amt">${UI.money(r.amount)}</span>
          ${r.status === 'paid'
            ? '<span class="pchip pchip--ok">โอนแล้ว</span>'
            : '<span class="pchip pchip--warn">รอโอน</span>'}
        </span>
      </button>`).join('') + '</div>';

    box.querySelectorAll('[data-payout]').forEach(b => {
      b.onclick = () => Finance.openPayout(b.dataset.payout);
    });
  },

  // ── ปิดรอบจ่าย ────────────────────────────────────────────
  openPayoutForm() {
    const due = this.classes('due');

    // เสนอเฉพาะคนที่มีคาบค้างจ่ายจริงในช่วงนี้ พร้อมบอกยอดไว้เลย
    const byTrainer = {};
    due.forEach(c => {
      if (!byTrainer[c.trainerId]) {
        byTrainer[c.trainerId] = { name: c.trainerName, n: 0, sum: 0 };
      }
      byTrainer[c.trainerId].n   += 1;
      byTrainer[c.trainerId].sum += Number(c.fee || 0);
    });

    const ids = Object.keys(byTrainer);

    UI.openSheet(`
      <div class="sheet__title">ปิดรอบจ่ายค่าสอน</div>
      <p class="sheet__sub">
        รวมคาบที่สอนและบันทึกกิจกรรมแล้ว และยังไม่เคยอยู่ในรอบไหน
      </p>

      ${ids.length ? `
        <div class="field">
          <label class="field__label" for="p_trainer">ผู้ฝึกสอน</label>
          <select class="field__input" id="p_trainer">
            ${ids.map(id => `<option value="${UI.esc(id)}">
              ${UI.esc(byTrainer[id].name)} — ${byTrainer[id].n} คาบ ${UI.money(byTrainer[id].sum)} บาท
            </option>`).join('')}
          </select>
        </div>

        <div class="frow">
          ${People.finput('p_from', 'ตั้งแต่วันที่', this.from, '', 'date')}
          ${People.finput('p_to', 'ถึงวันที่', this.to, '', 'date')}
        </div>

        ${People.finput('p_note', 'หมายเหตุ', '', 'เช่น ค่าสอนเดือนตุลาคม')}

        <div class="notice notice--info">
          ปิดรอบแล้วยอดจะถูกตรึงไว้ ถ้าแก้อัตราค่าสอนทีหลัง ยอดรอบนี้จะไม่เปลี่ยนตาม
          รอบที่ยังไม่ได้โอนยกเลิกได้
        </div>

        <div class="sheet__actions">
          <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
          <button class="btn btn--primary" data-act="save" data-busy="กำลังปิดรอบ">ปิดรอบ</button>
        </div>`
      : `
        <div class="notice notice--info">
          ช่วงวันที่นี้ไม่มีคาบที่ค้างจ่าย ลองเปลี่ยนช่วงวันที่ด้านบนก่อน
        </div>
        <div class="sheet__actions">
          <button class="btn btn--primary" data-act="close">ปิด</button>
        </div>`}`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Finance.createPayout(),
    });
  },

  async createPayout() {
    const payload = {
      trainerId: People.val('p_trainer'),
      from:      People.val('p_from'),
      to:        People.val('p_to'),
      note:      People.val('p_note'),
    };

    const res = await API.call('createPayout', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    this.tab = 'rounds';
    await this.reload();
    UI.toast('ปิดรอบของ' + res.data.trainerName + ' แล้ว ' +
             res.data.classCount + ' คาบ ' + UI.money(res.data.amount) + ' บาท');
  },

  // ── รายละเอียดรอบจ่าย ─────────────────────────────────────
  async openPayout(id) {
    UI.openSheet(UI.loading());

    const res = await API.call('getPayoutDetail', { id });
    if (!res.ok) { UI.closeSheet(); UI.toast(res.message, 'error'); return; }

    const r     = res.data.payout;
    const list  = res.data.classes || [];
    const admin = !this.data.isTrainer;
    const paid  = r.status === 'paid';

    UI.fillSheet(`
      <div class="sheet__title">รอบจ่ายค่าสอน</div>
      <p class="sheet__sub">
        ${UI.esc(r.trainerName)} ·
        ${UI.esc(UI.thaiDate(r.periodStart))} ถึง ${UI.esc(UI.thaiDate(r.periodEnd))}
      </p>

      <div class="paysum">
        <span class="paysum__amt">${UI.money(r.amount)}</span>
        <span class="paysum__k">บาท · ${r.classCount} คาบ</span>
        ${paid ? '<span class="pchip pchip--ok">โอนแล้ว</span>'
               : '<span class="pchip pchip--warn">รอโอน</span>'}
      </div>

      ${People.section('การจ่าย', [
        ['วิธีจ่าย', this.METHOD[r.method] || ''],
        ['เลขอ้างอิง', r.reference],
        ['วันที่โอน', r.paidAt ? UI.thaiDate(r.paidAt) : ''],
        ['หมายเหตุ', r.note],
      ])}

      ${r.bank && (r.bank.no || r.bank.name) ? People.section('บัญชีรับเงิน', [
        ['ธนาคาร', r.bank.name],
        ['เลขบัญชี', r.bank.no],
        ['ชื่อบัญชี', r.bank.accName],
      ]) : (admin ? `<div class="notice notice--warn">
        ผู้สอนคนนี้ยังไม่ได้กรอกบัญชีรับค่าสอน เพิ่มได้ที่หน้าผู้ฝึกสอน
      </div>` : '')}

      <div class="dsection">
        <h3 class="dsection__title">คาบในรอบนี้ ${list.length} คาบ</h3>
        <div class="minilist">
          ${list.map(c => `
            <div class="minirow">
              <span class="minirow__d">${UI.esc(UI.thaiDate(c.date, 'short'))}
                ${UI.esc(c.startTime)}</span>
              <span class="minirow__t">${UI.esc(c.courseName)}
                <span class="minirow__n">เด็ก ${c.children.length} คน</span></span>
              <span class="minirow__m">${UI.money(c.fee)}</span>
            </div>`).join('')}
        </div>
      </div>

      ${admin && !paid ? `
        <div class="dsection">
          <h3 class="dsection__title">บันทึกการโอน</h3>
          ${People.fselect('y_method', 'วิธีจ่าย',
            [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], 'transfer')}
          ${People.finput('y_ref', 'เลขอ้างอิง', '', 'เลขรายการจากสลิป')}
          ${People.finput('y_note', 'หมายเหตุ', r.note, '')}
        </div>` : ''}

      <div class="sheet__actions">
        ${admin && !paid ? `<button class="btn btn--ghost" data-act="cancel"
          data-busy="กำลังยกเลิก">ยกเลิกรอบ</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        ${admin && !paid ? `<button class="btn btn--primary" data-act="pay"
          data-busy="กำลังบันทึก">บันทึกว่าโอนแล้ว</button>` : ''}
      </div>`);

    // เงินสดไม่มีเลขอ้างอิงให้กรอก ซ่อนช่องไปเลยจะได้ไม่งง
    const method = document.getElementById('y_method');
    if (method) {
      const sync = () => {
        const wrap = document.getElementById('y_ref');
        if (wrap) wrap.closest('.field').classList.toggle('is-hidden', method.value === 'cash');
      };
      method.onchange = sync;
      sync();
    }

    People.bindSheet({
      close:  () => UI.closeSheet(),
      pay:    () => Finance.markPaid(id),
      cancel: () => Finance.cancelPayout(id, r),
    });
  },

  async markPaid(id) {
    const res = await API.call('markPayoutPaid', {
      id,
      method:    People.val('y_method'),
      reference: People.val('y_ref'),
      note:      People.val('y_note'),
    });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    await this.reload();
    UI.toast('บันทึกว่าโอนแล้ว');
  },

  async cancelPayout(id, r) {
    const ok = confirm('ยกเลิกรอบนี้ของ' + r.trainerName + '?\n' +
      r.classCount + ' คาบจะกลับไปอยู่ในรายการค้างจ่าย');
    if (!ok) return;

    const res = await API.call('cancelPayout', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    await this.reload();
    UI.toast('ยกเลิกรอบแล้ว คาบกลับไปอยู่ในรายการค้างจ่าย');
  },

  // ── เปลี่ยนช่วงวันที่ ──────────────────────────────────────
  async applyRange() {
    const from = People.val('f_from');
    const to   = People.val('f_to');

    if (!from || !to) { UI.toast('เลือกวันที่ให้ครบก่อน', 'error'); return; }
    if (to < from)    { UI.toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }

    this.from = from;
    this.to   = to;
    await this.reload();
  },

  async reload() {
    API.clearCache('getFinanceBoard');
    await this.render(document.getElementById('page'));
  },
};

PAGES.finance = (el) => Finance.render(el);
