// ============================================================
// Homey Kids D Shine — payouts.js
// จ่ายค่าสอน — ค่าสอนที่ศูนย์จ่ายให้ผู้ฝึกสอน
// ============================================================
//
// คิดเป็นรายคาบ ไม่ใช่รายหัวเด็ก คาบที่สอนพร้อมกันหลายคนนับเป็นคาบเดียว
// ติ๊กเลือกคาบแล้วกดจ่าย จบในขั้นตอนเดียว ไม่มีสถานะรอโอนคั่นกลาง
// จ่ายผิดให้ยกเลิกรายการ คาบจะกลับไปอยู่ในยอดค้างจ่าย
//
// ยอดค้างจ่ายไม่กรองตามวันที่เลย ต้องเห็นทั้งหมดเสมอ
// เพราะถ้ากรองแล้วคาบเก่าที่ลืมจ่ายจะหายไปจากสายตา
// ช่องวันที่มีผลกับแท็บจ่ายแล้วเท่านั้น
//
// ผู้ดูแลระบบเห็นทุกคน ผู้ฝึกสอนเห็นแต่ของตัวเองและดูอย่างเดียว
// ============================================================

const Payouts = {

  board:  null,
  tab:    'due',      // due = ค้างจ่าย | paid = จ่ายแล้ว
  from:   '',
  to:     '',
  who:    'all',      // กรองตามผู้ฝึกสอน
  picked: {},         // คาบที่ติ๊กเลือกไว้ key = คาบ
  query:  '',

  // ── ทางเข้าหน้า ───────────────────────────────────────────
  async render(el) {
    if (!this.from) {
      const r = Money.thisMonth();
      this.from = r.from;
      this.to   = r.to;
    }

    el.innerHTML = `<div id="poBody">${UI.loading('กำลังรวมยอด')}</div>`;
    const box = document.getElementById('poBody');

    const res = await API.cached('getFinanceBoard', { from: this.from, to: this.to });
    if (!res.ok) {
      box.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }
    this.board = res.data;

    if (this.board.noProfile) {
      box.innerHTML = UI.empty('ยังไม่ผูกข้อมูลผู้ฝึกสอน',
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน จึงยังไม่มีค่าสอนของตัวเอง แจ้งผู้ดูแลศูนย์ให้ผูกให้');
      return;
    }

    this.paint(box);
  },

  paint(box) {
    const admin = !this.board.isTrainer;
    const due   = this.classes();
    const paid  = this.rounds();
    const sumD  = due.reduce((n, c) => n + Number(c.fee || 0), 0);
    const sumP  = paid.reduce((n, r) => n + Number(r.amount || 0), 0);
    const caps  = paid.reduce((n, r) => n + Number(r.classCount || 0), 0);

    box.innerHTML = `
      <div class="lstrip">
        <div class="lstrip__i">
          <span class="lstrip__k">ค้างจ่าย</span>
          <span class="lstrip__v lstrip__v--warn">${UI.money(sumD)}</span>
          <span class="lstrip__n">${due.length} คาบ · ทุกช่วงเวลา</span>
        </div>
        <div class="lstrip__i">
          <span class="lstrip__k">จ่ายแล้วในช่วงนี้</span>
          <span class="lstrip__v">${UI.money(sumP)}</span>
          <span class="lstrip__n">${caps} คาบ</span>
        </div>
      </div>

      <div class="ftools">
        <div class="chipbar chipbar--tabs">
          ${[['due', 'ค้างจ่าย'], ['paid', 'จ่ายแล้ว']]
            .map(([v, label]) => `<button class="chipbtn${this.tab === v ? ' is-on' : ''}"
              data-ptab="${v}">${label}
              <span class="chipbtn__n">${this.countOf(v)}</span></button>`).join('')}
        </div>
        <div class="ftools__right">
          ${admin ? this.whoPicker() : ''}
          ${admin ? `<input class="field__input ftools__q" id="po_q" type="search"
            placeholder="ค้นหาคอร์สหรือชื่อเด็ก" value="${UI.esc(this.query)}">` : ''}
        </div>
      </div>

      <div id="poRange">${this.tab === 'paid' ? Money.rangeHtml(this.from, this.to, 'po') : ''}</div>

      <div id="poList"></div>
      <div id="poBar"></div>`;

    if (admin) {
      box.querySelector('#po_q').addEventListener('input', e => {
        Payouts.query = e.target.value;
        Payouts.paintList();
      });
      box.querySelector('#po_who').onchange = (e) => {
        Payouts.who = e.target.value;
        Payouts.picked = {};          // เปลี่ยนคนแล้วของที่ติ๊กไว้ใช้ไม่ได้
        Payouts.paint(box);
      };
    }

    if (this.tab === 'paid') {
      Money.bindRange(box, 'po', this, (from, to) => {
        Payouts.from = from;
        Payouts.to   = to;
        Payouts.picked = {};
        Payouts.reload();
      });
    }

    box.querySelectorAll('[data-ptab]').forEach(b => {
      b.onclick = () => {
        Payouts.tab = b.dataset.ptab;
        Payouts.picked = {};
        Payouts.paint(box);          // วาดใหม่ เพราะช่องวันที่ต้องซ่อนหรือโผล่ตามแท็บ
      };
    });

    this.paintList();
  },

  // ── ตัวกรองผู้ฝึกสอน ──────────────────────────────────────
  // ใช้ช่องเลือกไม่ใช่ปุ่มเรียงกัน เพราะศูนย์ที่มีครูสิบกว่าคนปุ่มจะล้นหลายบรรทัด
  // ต้องเลือกคนก่อนถึงจะติ๊กเลือกคาบได้ เพราะการจ่ายหนึ่งครั้งเป็นของคนเดียว
  whoPicker() {
    const all = this.board.trainers || [];
    const due = this.classes();

    const n = {};
    ((this.board && this.board.classes) || []).forEach(c => {
      n[c.trainerId] = (n[c.trainerId] || 0) + 1;
    });

    return `
      <label class="whosel">
        <span class="whosel__k">ผู้ฝึกสอน</span>
        <select class="field__input" id="po_who">
          <option value="all"${this.who === 'all' ? ' selected' : ''}>
            ทุกคน (ค้าง ${due.length} คาบ)</option>
          ${all.map(t => `
            <option value="${UI.esc(t.id)}"${this.who === String(t.id) ? ' selected' : ''}>
              ${UI.esc(t.name)}${n[t.id] ? ' — ค้าง ' + n[t.id] + ' คาบ' : ''}
            </option>`).join('')}
        </select>
      </label>`;
  },

  // คาบที่หลังบ้านส่งมาคือคาบที่ยังไม่ได้จ่ายทั้งหมดอยู่แล้ว ไม่ตัดตามช่วงวัน
  // ที่นี่เหลือแค่กรองตามผู้ฝึกสอนที่เลือกไว้
  classes() {
    const all = (this.board && this.board.classes) || [];
    if (this.who === 'all') return all;
    return all.filter(c => String(c.trainerId) === String(this.who));
  },

  // รายการที่จ่ายแล้วในช่วงวันที่เลือก
  rounds() {
    const all = (this.board && this.board.payouts) || [];
    if (this.who === 'all') return all;
    return all.filter(r => String(r.trainerId) === String(this.who));
  },

  countOf(tab) {
    return tab === 'paid' ? this.rounds().length : this.classes().length;
  },

  // ── รายการ ────────────────────────────────────────────────
  paintList() {
    const box = document.getElementById('poList');
    if (!box) return;

    if (this.tab === 'paid') { this.paintRounds(box); this.paintBar(); return; }

    const q = this.query.trim().toLowerCase();
    const list = this.classes().filter(c => !q ||
      [c.trainerName, c.courseName, (c.children || []).join(' ')]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));

    if (!list.length) {
      box.innerHTML = UI.empty('ไม่มีคาบค้างจ่าย',
        'จ่ายครบทุกคาบแล้ว หรือยังไม่มีคาบที่บันทึกกิจกรรมเรียบร้อย');
      this.paintBar();
      return;
    }

    // ติ๊กเลือกได้เฉพาะตอนดูคาบค้างจ่ายของผู้สอนคนเดียว
    const canPick = !this.board.isTrainer && this.who !== 'all';

    box.innerHTML = (canPick ? `
      <div class="pickhead">
        <label class="pickall">
          <input type="checkbox" id="pickAll"
            ${list.every(c => this.picked[c.key]) ? 'checked' : ''}>
          <span>เลือกทั้งหมด ${list.length} คาบ</span>
        </label>
      </div>` : (!this.board.isTrainer ? `
      <p class="fhint fhint--lead">เลือกผู้ฝึกสอนด้านบนก่อน แล้วจะติ๊กเลือกคาบที่จะจ่ายได้</p>` : ''))
      + '<div class="irows">' + list.map(c => `
      <div class="crow${canPick ? ' crow--pick' : ''}${
        canPick && this.picked[c.key] ? ' is-picked' : ''}"${
        canPick ? ` data-pick="${UI.esc(c.key)}"` : ''}>
        ${canPick ? `<span class="crow__box${this.picked[c.key] ? ' is-on' : ''}"
          aria-hidden="true"></span>` : ''}
        <span class="crow__when">
          <b>${UI.esc(UI.thaiDate(c.date, 'short'))}</b>
          <small>${UI.esc(c.startTime)}</small>
        </span>
        <span class="crow__main">
          <b>${UI.esc(c.courseName || 'ไม่พบคอร์ส')}</b>
          <small>${this.board.isTrainer ? '' : UI.esc(c.trainerName) + ' · '}เด็ก ${
            c.children.length} คน${
            c.children.length ? ' · ' + UI.esc(c.children.join(' ')) : ''}</small>
        </span>
        <span class="crow__fee">${UI.money(c.fee)}</span>
      </div>`).join('') + '</div>';

    if (canPick) {
      box.querySelectorAll('[data-pick]').forEach(el => {
        el.onclick = () => {
          const k = el.dataset.pick;
          if (Payouts.picked[k]) delete Payouts.picked[k];
          else Payouts.picked[k] = true;
          Payouts.paintList();
        };
      });
      const all = box.querySelector('#pickAll');
      all.onclick = (e) => {
        e.stopPropagation();
        const on = all.checked;
        list.forEach(c => {
          if (on) Payouts.picked[c.key] = true;
          else delete Payouts.picked[c.key];
        });
        Payouts.paintList();
      };
    }

    this.paintBar();
  },

  // ── แถบล่างบอกยอดที่เลือกไว้ ──────────────────────────────
  paintBar() {
    const bar = document.getElementById('poBar');
    if (!bar) return;

    const keys = Object.keys(this.picked);
    if (!keys.length || this.tab !== 'due' || this.who === 'all') {
      bar.innerHTML = '';
      return;
    }

    const chosen = this.classes().filter(c => this.picked[c.key]);
    const total  = chosen.reduce((n, c) => n + Number(c.fee || 0), 0);
    const name   = (this.board.trainers || [])
      .filter(t => String(t.id) === String(this.who))
      .map(t => t.name)[0] || '';

    bar.innerHTML = `
      <div class="pickbar">
        <div class="pickbar__txt">
          <strong>${chosen.length} คาบ</strong> ของ${UI.esc(name)}
          <span class="pickbar__amt">${UI.money(total)} บาท</span>
        </div>
        <div class="pickbar__act">
          <button class="btn btn--ghost btn--sm" data-act="clear">ล้าง</button>
          <button class="btn btn--primary" data-act="open" data-busy="กำลังเปิด">จ่ายค่าสอน</button>
        </div>
      </div>`;

    bar.querySelector('[data-act="clear"]').onclick = () => {
      Payouts.picked = {};
      Payouts.paintList();
    };
    bar.querySelector('[data-act="open"]').onclick = (e) =>
      UI.run(e.currentTarget, 'กำลังเปิด', () => Payouts.confirm(chosen, total, name));
  },

  // ── จ่ายค่าสอน ────────────────────────────────────────────
  // คาบที่เลือกพับเก็บไว้ เพราะตรวจมาแล้วจากแถบล่างว่ากี่คาบกี่บาท
  // ฟอร์มที่ต้องกรอกจึงอยู่บนสุด ไม่ต้องเลื่อนผ่านรายการยาว ๆ ก่อน
  confirm(chosen, total, name) {
    UI.openSheet(`
      <div class="sheet__title">จ่ายค่าสอน</div>
      <p class="sheet__sub">${UI.esc(name)}</p>

      <div class="duebar duebar--due">
        <span class="duebar__k">ยอดที่จะจ่าย</span>
        <span class="duebar__v">${UI.money(total)}</span>
        <span class="duebar__u">${chosen.length} คาบ</span>
      </div>

      ${People.fselect('p_method', 'วิธีจ่าย',
        [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], 'transfer')}
      ${People.finput('p_ref', 'เลขอ้างอิง', '', 'เลขรายการจากสลิป')}
      ${People.finput('p_note', 'หมายเหตุ', '', 'เช่น ค่าสอนครึ่งเดือนแรก')}

      <details class="fold">
        <summary class="fold__sum">ดูคาบที่เลือกไว้ ${chosen.length} คาบ</summary>
        <div class="minilist">
          ${chosen.map(c => `
            <div class="minirow">
              <span class="minirow__d">${UI.esc(UI.thaiDate(c.date, 'short'))} ${UI.esc(c.startTime)}</span>
              <span class="minirow__t">${UI.esc(c.courseName)}
                <span class="minirow__n">เด็ก ${c.children.length} คน</span></span>
              <span class="minirow__m">${UI.money(c.fee)}</span>
            </div>`).join('')}
        </div>
      </details>

      <p class="fhint">
        บันทึกแล้วยอดจะถูกตรึงไว้ ถ้าแก้อัตราค่าสอนทีหลัง ยอดรายการนี้จะไม่เปลี่ยนตาม
        ถ้าจ่ายผิดให้ยกเลิกรายการ คาบจะกลับไปอยู่ในยอดค้างจ่าย
      </p>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึกการจ่าย</button>
      </div>`);

    Income.syncRef('p_method', 'p_ref');

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Payouts.create(chosen),
    });
  },

  async create(chosen) {
    // ส่งแถวของเด็กทุกคนในคาบที่เลือก หลังบ้านตรวจซ้ำทุกแถวอีกที
    const sessionIds = [];
    chosen.forEach(c => { (c.sessionIds || []).forEach(id => sessionIds.push(id)); });

    const res = await API.call('createPayout', {
      trainerId:  this.who,
      sessionIds: sessionIds,
      method:     People.val('p_method'),
      reference:  People.val('p_ref'),
      note:       People.val('p_note'),
    });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    this.picked = {};
    this.tab = 'paid';
    await this.reload();
    UI.toast('จ่ายค่าสอนให้' + res.data.trainerName + ' แล้ว ' +
             res.data.classCount + ' คาบ ' + UI.money(res.data.amount) + ' บาท');
  },

  // ── รายการที่จ่ายแล้ว ─────────────────────────────────────
  paintRounds(box) {
    const rounds = this.rounds();

    if (!rounds.length) {
      box.innerHTML = UI.empty('ยังไม่มีการจ่ายในช่วงวันที่นี้',
        this.board.isTrainer
          ? 'เมื่อศูนย์จ่ายค่าสอนแล้ว รายการจะขึ้นที่นี่ ลองขยายช่วงวันที่ด้านบน'
          : 'เลือกผู้ฝึกสอนแล้วติ๊กคาบที่จะจ่าย จากแท็บค้างจ่าย');
      return;
    }

    box.innerHTML = '<div class="irows">' + rounds.map(r => `
      <button class="crow crow--done" data-payout="${UI.esc(r.id)}">
        <span class="crow__when">
          <b>${UI.esc(UI.thaiDate(r.paidAt || r.periodStart, 'short'))}</b>
          <small>${UI.esc(Money.methodOf(r.method))}</small>
        </span>
        <span class="crow__main">
          <b>${this.board.isTrainer ? 'ค่าสอน ' + r.classCount + ' คาบ'
            : UI.esc(r.trainerName) + ' · ' + r.classCount + ' คาบ'}</b>
          <small>${UI.esc(UI.thaiDate(r.periodStart, 'short'))}${
            r.periodStart === r.periodEnd ? ''
              : ' – ' + UI.esc(UI.thaiDate(r.periodEnd, 'short'))}${
            r.reference ? ' · อ้างอิง ' + UI.esc(r.reference) : ''}</small>
        </span>
        <span class="crow__fee">${UI.money(r.amount)}</span>
      </button>`).join('') + '</div>';

    box.querySelectorAll('[data-payout]').forEach(b => {
      b.onclick = () => Payouts.openRound(b.dataset.payout);
    });
  },

  // ── รายละเอียดรอบจ่าย ─────────────────────────────────────
  async openRound(id) {
    UI.openSheet(UI.loading());

    const res = await API.call('getPayoutDetail', { id });
    if (!res.ok) { UI.closeSheet(); UI.toast(res.message, 'error'); return; }

    const r     = res.data.payout;
    const list  = res.data.classes || [];
    const admin = !this.board.isTrainer;

    UI.fillSheet(`
      <div class="sheet__title">จ่ายค่าสอนแล้ว</div>
      <p class="sheet__sub">
        ${UI.esc(r.trainerName)} ·
        ${UI.esc(UI.thaiDate(r.periodStart))}${
        r.periodStart === r.periodEnd ? '' : ' ถึง ' + UI.esc(UI.thaiDate(r.periodEnd))}
      </p>

      <div class="duebar">
        <span class="duebar__k">จ่ายไปแล้ว</span>
        <span class="duebar__v">${UI.money(r.amount)}</span>
        <span class="duebar__u">${r.classCount} คาบ · ${UI.esc(Money.methodOf(r.method))}${
          r.paidAt ? ' · ' + UI.esc(UI.thaiDate(r.paidAt, 'short')) : ''}${
          r.reference ? ' · อ้างอิง ' + UI.esc(r.reference) : ''}</span>
      </div>

      ${r.note ? `<p class="fhint">หมายเหตุ ${UI.esc(r.note)}</p>` : ''}

      ${r.bank && (r.bank.no || r.bank.name) ? People.section('บัญชีรับเงิน', [
        ['ธนาคาร', r.bank.name],
        ['เลขบัญชี', r.bank.no],
        ['ชื่อบัญชี', r.bank.accName],
      ]) : (admin ? `<div class="notice notice--warn">
        ผู้สอนคนนี้ยังไม่ได้กรอกบัญชีรับค่าสอน เพิ่มได้ที่หน้าผู้ฝึกสอน
      </div>` : '')}

      <details class="fold">
        <summary class="fold__sum">ดูคาบในรอบนี้ ${list.length} คาบ</summary>
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
      </details>

      ${admin ? `
        <details class="fold">
          <summary class="fold__sum">แก้ไขรายละเอียดการจ่าย</summary>
          ${People.fselect('y_method', 'วิธีจ่าย',
            [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], r.method || 'transfer')}
          ${People.finput('y_ref', 'เลขอ้างอิง', r.reference, 'เลขรายการจากสลิป')}
          ${People.finput('y_note', 'หมายเหตุ', r.note, '')}
          <p class="fhint">แก้ได้เฉพาะรายละเอียด ถ้าจ่ายผิดคนหรือผิดคาบให้ยกเลิกรายการแล้วทำใหม่</p>
          <button class="btn btn--ghost btn--sm" data-act="pay"
            data-busy="กำลังบันทึก">บันทึกการแก้ไข</button>
        </details>` : ''}

      <div class="sheet__actions">
        ${admin ? `<button class="btn btn--ghost" data-act="cancel"
          data-busy="กำลังยกเลิก">ยกเลิกรายการ</button>` : ''}
        <button class="btn btn--primary" data-act="close">ปิด</button>
      </div>`);

    Income.syncRef('y_method', 'y_ref');

    People.bindSheet({
      close:  () => UI.closeSheet(),
      pay:    () => Payouts.saveEdit(id),
      cancel: () => Payouts.cancel(id, r),
    });
  },

  async saveEdit(id) {
    const res = await API.call('markPayoutPaid', {
      id,
      method:    People.val('y_method'),
      reference: People.val('y_ref'),
      note:      People.val('y_note'),
    });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    await this.reload();
    UI.toast('แก้ไขรายละเอียดแล้ว');
  },

  async cancel(id, r) {
    if (!confirm('ยกเลิกรายการจ่ายนี้ของ' + r.trainerName + '?\n' +
      r.classCount + ' คาบ ' + UI.money(r.amount) + ' บาท จะกลับไปอยู่ในยอดค้างจ่าย')) return;

    const res = await API.call('cancelPayout', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    this.tab = 'due';
    await this.reload();
    UI.toast('ยกเลิกแล้ว คาบกลับไปอยู่ในยอดค้างจ่าย');
  },

  async reload() {
    API.clearCache('getFinanceBoard');
    await this.render(document.getElementById('page'));
  },
};

PAGES.payouts = (el) => Payouts.render(el);
