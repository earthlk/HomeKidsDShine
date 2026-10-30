// ============================================================
// Homey Kids D Shine — finance.js
// การเงิน — เงินเข้าจากผู้ปกครอง และเงินออกเป็นค่าสอน
// ============================================================
//
// หน้านี้มีสองฝั่งที่ไม่เกี่ยวกันเลย แยกให้ขาดตั้งแต่ระดับบนสุด
//   รับเงิน    — ค่าคอร์สที่ผู้ปกครองจ่ายเข้าศูนย์ แบ่งจ่ายได้
//   จ่ายค่าสอน — ค่าสอนที่ศูนย์จ่ายให้ผู้ฝึกสอน คิดเป็นรายคาบ จ่ายเป็นรอบ
//
// Admin เห็นทั้งสองฝั่ง · ผู้ฝึกสอนเห็นแต่ค่าสอนของตัวเอง
// ผู้ปกครองเห็นแต่ค่าเรียนของบุตรหลานตัวเอง และดูอย่างเดียว
// การกรองทำที่หลังบ้าน หน้านี้ไม่ได้แค่ซ่อนปุ่ม
// ============================================================

const Finance = {

  side:  null,        // 'income' = รับเงิน | 'pay' = จ่ายค่าสอน
  role:  null,

  // ── ฝั่งจ่ายค่าสอน ────────────────────────────────────────
  pay:   null,
  tab:   'due',       // due = ค้างจ่าย | paid = จ่ายแล้ว
  from:  '',
  to:    '',
  who:   'all',       // กรองตามผู้ฝึกสอน
  picked: {},         // คาบที่ติ๊กเลือกไว้ key = คาบ
  query: '',

  // ── ฝั่งรับเงิน ───────────────────────────────────────────
  income:  null,
  feeTab:  'due',     // due = ค้างชำระ | paid = ครบแล้ว | all = ทั้งหมด
  feeQuery: '',

  METHOD:    { transfer: 'โอนเงิน', cash: 'เงินสด' },
  FEE_LABEL: { unpaid: 'ยังไม่จ่าย', partial: 'จ่ายบางส่วน', paid: 'ครบแล้ว' },

  defaultRange() {
    const t = UI.today();
    return { from: t.slice(0, 8) + '01', to: t };
  },

  // ── ทางเข้าหน้า ───────────────────────────────────────────
  async render(el) {
    this.role = Store.get('role');

    // ผู้ฝึกสอนมีแต่ค่าสอน ผู้ปกครองมีแต่ค่าเรียน ไม่ต้องมีปุ่มสลับให้สับสน
    if (!this.side) {
      this.side = this.role === 'trainer' ? 'pay'
                : this.role === 'parent'  ? 'income'
                : 'income';
    }

    if (!this.from) {
      const r = this.defaultRange();
      this.from = r.from;
      this.to   = r.to;
    }

    // หัวหน้าจอบรรทัดเดียว — ช่วงวันที่อยู่ซ้าย ปุ่มสลับฝั่งอยู่ขวาสุด
    // ช่องวันที่ใช้กับรายการที่จ่ายแล้วเท่านั้น จึงฝากไว้ให้ฝั่งจ่ายค่าสอนเติมเอง
    el.innerHTML = `
      <div class="fhead">
        <div class="fhead__left" id="fHeadLeft"></div>
        ${this.role === 'admin' ? `
          <div class="segbar fhead__seg">
            <button class="segbar__btn${this.side === 'income' ? ' is-on' : ''}"
              data-side="income">รับเงิน</button>
            <button class="segbar__btn${this.side === 'pay' ? ' is-on' : ''}"
              data-side="pay">จ่ายค่าสอน</button>
          </div>` : ''}
      </div>
      <div id="fBody">${UI.loading('กำลังรวมยอด')}</div>`;

    el.querySelectorAll('[data-side]').forEach(b => {
      b.onclick = () => {
        Finance.side = b.dataset.side;
        Finance.render(document.getElementById('page'));
      };
    });

    const body = document.getElementById('fBody');
    if (this.side === 'income') await this.renderIncome(body);
    else                        await this.renderPay(body);
  },

  // ══════════════════════════════════════════════════════════
  // ฝั่งรับเงิน — ค่าคอร์สจากผู้ปกครอง
  // ══════════════════════════════════════════════════════════

  async renderIncome(box) {
    const res = await API.cached('getIncomeBoard');
    if (!res.ok) {
      box.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }
    this.income = res.data;
    this.paintIncome(box);
  },

  paintIncome(box) {
    const parent = this.income.isParent;
    const rows   = this.income.rows || [];

    const due  = rows.filter(r => r.due > 0);
    const sumD = due.reduce((n, r) => n + r.due, 0);
    const sumP = rows.reduce((n, r) => n + r.paid, 0);

    box.innerHTML = `
      <div class="statbar">
        <div class="stat stat--warn">
          <span class="stat__num">${UI.money(sumD)}</span>
          <span class="stat__k">ค้างชำระ · ${due.length} รายการ</span>
        </div>
        <div class="stat">
          <span class="stat__num">${UI.money(sumP)}</span>
          <span class="stat__k">รับมาแล้วทั้งหมด</span>
        </div>
        <div class="stat">
          <span class="stat__num">${rows.length}</span>
          <span class="stat__k">รายการลงทะเบียน</span>
        </div>
      </div>

      <div class="chipbar">
        ${[['due', 'ค้างชำระ'], ['paid', 'ครบแล้ว'], ['all', 'ทั้งหมด']]
          .map(([v, label]) => `<button class="chipbtn${this.feeTab === v ? ' is-on' : ''}"
            data-ftab="${v}">${label}
            <span class="chipbtn__n">${this.feeRows(v).length}</span></button>`).join('')}
      </div>

      ${parent ? '' : `<input class="field__input toolbar__search" id="fe_q" type="search"
        placeholder="ค้นหาจากชื่อเด็ก ผู้ปกครอง หรือคอร์ส" value="${UI.esc(this.feeQuery)}">`}

      <div id="feList"></div>`;

    if (!parent) {
      box.querySelector('#fe_q').addEventListener('input', e => {
        Finance.feeQuery = e.target.value;
        Finance.paintFeeList();
      });
    }

    box.querySelectorAll('[data-ftab]').forEach(b => {
      b.onclick = () => {
        Finance.feeTab = b.dataset.ftab;
        box.querySelectorAll('[data-ftab]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.ftab === Finance.feeTab));
        Finance.paintFeeList();
      };
    });

    this.paintFeeList();
  },

  feeRows(tab) {
    const rows = (this.income && this.income.rows) || [];
    if (tab === 'due')  return rows.filter(r => r.due > 0);
    if (tab === 'paid') return rows.filter(r => r.due <= 0);
    return rows;
  },

  paintFeeList() {
    const box = document.getElementById('feList');
    if (!box) return;

    const q = this.feeQuery.trim().toLowerCase();
    const list = this.feeRows(this.feeTab).filter(r => !q ||
      [r.childName, r.childFull, r.parentName, r.courseName]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));

    if (!list.length) {
      box.innerHTML = this.feeTab === 'due'
        ? UI.empty('ไม่มียอดค้างชำระ', 'ทุกรายการในช่วงนี้รับเงินครบแล้ว')
        : UI.empty('ไม่พบรายการ', 'ลองเปลี่ยนตัวกรองหรือคำค้นหา');
      return;
    }

    box.innerHTML = '<div class="flist">' + list.map(r => `
      <button class="erow" data-fee="${UI.esc(r.id)}">
        <span class="erow__main">
          <span class="erow__who">
            ${UI.esc(r.childName)}
            ${r.parentName && !this.income.isParent
              ? `<span class="erow__parent">ผู้ปกครอง ${UI.esc(r.parentName)}</span>` : ''}
          </span>
          <span class="erow__course">${UI.esc(r.courseName)}</span>
          ${this.bar(r)}
        </span>
        <span class="erow__right">
          ${r.due > 0
            ? `<span class="erow__due">${UI.money(r.due)}</span>
               <span class="erow__k">ค้าง · จาก ${UI.money(r.price)}</span>`
            : `<span class="erow__done">${UI.money(r.price)}</span>
               <span class="erow__k">ครบแล้ว</span>`}
          <span class="pchip pchip--${r.status === 'paid' ? 'ok'
            : r.status === 'partial' ? 'warn' : 'muted'}">
            ${this.FEE_LABEL[r.status]}</span>
        </span>
      </button>`).join('') + '</div>';

    box.querySelectorAll('[data-fee]').forEach(b => {
      b.onclick = () => Finance.openFee(b.dataset.fee);
    });
  },

  // แถบความคืบหน้าของการชำระ เห็นสัดส่วนได้เร็วกว่าอ่านตัวเลขสองตัวมาเทียบกันเอง
  bar(r) {
    const pct = r.price > 0 ? Math.min(100, Math.round((r.paid / r.price) * 100)) : 0;
    return `<span class="paybar"><span class="paybar__fill" style="width:${pct}%"></span></span>`;
  },

  // ── รายละเอียดการชำระของรายการหนึ่ง ───────────────────────
  openFee(id) {
    const r = (this.income.rows || []).find(x => String(x.id) === String(id));
    if (!r) return;

    const admin = !this.income.isParent;

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(r.childName)}</div>
      <p class="sheet__sub">${UI.esc(r.courseName)}${
        r.parentName && admin ? ' · ผู้ปกครอง ' + UI.esc(r.parentName) : ''}</p>

      <div class="paysum ${r.due > 0 ? 'paysum--due' : ''}">
        <span class="paysum__amt">${UI.money(r.due)}</span>
        <span class="paysum__k">บาท ${r.due > 0 ? 'ที่ยังค้างอยู่' : '— ชำระครบแล้ว'}</span>
      </div>

      ${People.section('ยอดรวม', [
        ['ราคาที่ตกลง', UI.money(r.price) + ' บาท'],
        ['รับมาแล้ว', UI.money(r.paid) + ' บาท'],
        ['คงเหลือ', UI.money(r.due) + ' บาท'],
        ['วันที่เริ่ม', r.startDate ? UI.thaiDate(r.startDate) : ''],
      ])}

      <div class="dsection">
        <h3 class="dsection__title">ประวัติการจ่าย ${r.payments.length} งวด</h3>
        ${r.payments.length ? `<div class="minilist">
          ${r.payments.map(x => `
            <div class="minirow${admin ? ' minirow--drop' : ''}">
              <span class="minirow__d">${UI.esc(UI.thaiDate(x.paidAt, 'short'))}</span>
              <span class="minirow__t">${UI.esc(this.METHOD[x.method] || x.method)}
                ${x.reference ? `<span class="minirow__n">${UI.esc(x.reference)}</span>` : ''}
                ${x.note ? `<span class="minirow__n">${UI.esc(x.note)}</span>` : ''}</span>
              <span class="minirow__m">${UI.money(x.amount)}</span>
              ${admin ? `<button class="minirow__x" data-drop="${UI.esc(x.id)}"
                title="ลบงวดนี้">✕</button>` : ''}
            </div>`).join('')}
        </div>` : '<p class="fhint">ยังไม่มีการรับเงินในรายการนี้</p>'}
      </div>

      ${admin && r.due > 0 ? `
        <div class="dsection">
          <h3 class="dsection__title">บันทึกรับเงิน</h3>
          <div class="frow">
            ${People.finput('g_amount', 'จำนวนเงิน', r.due, 'รับมาเท่าไหร่', 'number')}
            ${People.finput('g_date', 'วันที่รับ', UI.today(), '', 'date')}
          </div>
          ${People.fselect('g_method', 'วิธีรับเงิน',
            [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], 'transfer')}
          ${People.finput('g_ref', 'เลขอ้างอิง', '', 'เลขรายการจากสลิป')}
          ${People.finput('g_note', 'หมายเหตุ', '', 'เช่น งวดที่ 1')}
          <p class="fhint">ใส่น้อยกว่ายอดค้างได้ถ้าแบ่งจ่าย รับเกินยอดค้างไม่ได้</p>
        </div>` : ''}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        ${admin && r.due > 0 ? `<button class="btn btn--primary" data-act="save"
          data-busy="กำลังบันทึก">บันทึกรับเงิน</button>` : ''}
      </div>`);

    const method = document.getElementById('g_method');
    if (method) {
      const sync = () => {
        const ref = document.getElementById('g_ref');
        if (ref) ref.closest('.field').classList.toggle('is-hidden', method.value === 'cash');
      };
      method.onchange = sync;
      sync();
    }

    document.querySelectorAll('[data-drop]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); Finance.dropPayment(b.dataset.drop, r); };
    });

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Finance.savePayment(r.id),
    });
  },

  async savePayment(enrollmentId) {
    const res = await API.call('recordPayment', {
      enrollmentId,
      amount:    People.val('g_amount'),
      paidAt:    People.val('g_date'),
      method:    People.val('g_method'),
      reference: People.val('g_ref'),
      note:      People.val('g_note'),
    });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    await this.reloadIncome();
    UI.toast(res.data.due > 0
      ? 'บันทึกแล้ว ยังค้างอีก ' + UI.money(res.data.due) + ' บาท'
      : 'บันทึกแล้ว ชำระครบ');
  },

  async dropPayment(id, r) {
    if (!confirm('ลบงวดนี้ออกจากประวัติ?\nยอดค้างของ' + r.childName + 'จะเพิ่มกลับมา')) return;

    const res = await API.call('removePayment', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    await this.reloadIncome();
    UI.toast('ลบงวดแล้ว');
  },

  async reloadIncome() {
    API.clearCache('getIncomeBoard');
    await this.render(document.getElementById('page'));
  },

  // ══════════════════════════════════════════════════════════
  // ฝั่งจ่ายค่าสอน — ค่าสอนของผู้ฝึกสอน
  // ══════════════════════════════════════════════════════════

  async renderPay(box) {
    const res = await API.cached('getFinanceBoard', { from: this.from, to: this.to });
    if (!res.ok) {
      box.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }
    this.pay = res.data;

    if (this.pay.noProfile) {
      box.innerHTML = UI.empty('ยังไม่ผูกข้อมูลผู้ฝึกสอน',
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน จึงยังไม่มีค่าสอนของตัวเอง แจ้งผู้ดูแลศูนย์ให้ผูกให้');
      return;
    }

    this.paintPay(box);
  },

  paintPay(box) {
    const admin = !this.pay.isTrainer;

    // ช่องวันที่ไปอยู่บรรทัดเดียวกับปุ่มสลับฝั่ง ประหยัดพื้นที่แนวตั้ง
    // และใช้กับแท็บจ่ายแล้วเท่านั้น ค้างจ่ายต้องเห็นทั้งหมดเสมอ
    const head = document.getElementById('fHeadLeft');
    if (head) {
      head.innerHTML = `
        <div class="daterange${this.tab === 'due' ? ' is-hidden' : ''}" id="fRange">
          <input class="field__input" type="date" id="f_from" value="${UI.esc(this.from)}"
            aria-label="ตั้งแต่วันที่">
          <span class="daterange__to">ถึง</span>
          <input class="field__input" type="date" id="f_to" value="${UI.esc(this.to)}"
            aria-label="ถึงวันที่">
          <span class="daterange__sep"></span>
          ${this.quickRanges().map(([label, from, to]) =>
            `<button class="chipbtn chipbtn--sm${this.from === from && this.to === to ? ' is-on' : ''}"
              data-range="${from}|${to}">${label}</button>`).join('')}
        </div>`;

      // เลือกวันแล้วโหลดเลย ไม่ต้องมีปุ่มยืนยันอีกชั้น
      // ช่องวันที่ยิง change เมื่อได้วันครบแล้วเท่านั้น จึงไม่โหลดรัว ๆ ระหว่างพิมพ์
      ['f_from', 'f_to'].forEach(id => {
        head.querySelector('#' + id).onchange = () => Finance.applyRange();
      });

      head.querySelectorAll('[data-range]').forEach(b => {
        b.onclick = () => {
          const bits = b.dataset.range.split('|');
          Finance.from = bits[0];
          Finance.to   = bits[1];
          Finance.reloadPay();
        };
      });
    }

    box.innerHTML = `
      ${this.paySummary()}

      <div class="filterbar">
        <div class="chipbar chipbar--tabs">
          ${[['due', 'ค้างจ่าย'], ['paid', 'จ่ายแล้ว']]
            .map(([v, label]) => `<button class="chipbtn${this.tab === v ? ' is-on' : ''}"
              data-tab="${v}">${label}
              <span class="chipbtn__n">${this.countOf(v)}</span></button>`).join('')}
        </div>
        ${admin ? this.whoPicker() : ''}
      </div>

      ${admin ? `<input class="field__input toolbar__search" id="f_q" type="search"
        placeholder="ค้นหาจากคอร์สหรือชื่อเด็ก" value="${UI.esc(this.query)}">` : ''}

      <div id="fList"></div>
      <div id="fBar"></div>`;

    if (admin) {
      box.querySelector('#f_q').addEventListener('input', e => {
        Finance.query = e.target.value;
        Finance.paintList();
      });
      box.querySelector('#f_who').onchange = (e) => {
        Finance.who = e.target.value;
        Finance.picked = {};          // เปลี่ยนคนแล้วของที่ติ๊กไว้ใช้ไม่ได้
        Finance.paintPay(box);
      };
    }

    box.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => {
        Finance.tab = b.dataset.tab;
        Finance.picked = {};
        Finance.paintPay(box);        // วาดใหม่ทั้งฝั่ง เพราะช่องวันที่ต้องซ่อน/โผล่ตามแท็บ
      };
    });

    this.paintList();
  },

  // ── ตัวกรองผู้ฝึกสอน ──────────────────────────────────────
  // ใช้ช่องเลือกไม่ใช่ปุ่มเรียงกัน เพราะศูนย์ที่มีครูสิบกว่าคนปุ่มจะล้นหลายบรรทัด
  // ต้องเลือกคนก่อนถึงจะติ๊กเลือกคาบได้ เพราะการจ่ายหนึ่งครั้งเป็นของคนเดียว
  whoPicker() {
    const all = this.pay.trainers || [];
    const due = this.classes();

    const n = {};
    ((this.pay && this.pay.classes) || []).forEach(c => {
      n[c.trainerId] = (n[c.trainerId] || 0) + 1;
    });

    return `
      <label class="whosel">
        <span class="whosel__k">ผู้ฝึกสอน</span>
        <select class="field__input" id="f_who">
          <option value="all"${this.who === 'all' ? ' selected' : ''}>
            ทุกคน (ค้าง ${due.length} คาบ)</option>
          ${all.map(t => `
            <option value="${UI.esc(t.id)}"${this.who === String(t.id) ? ' selected' : ''}>
              ${UI.esc(t.name)}${n[t.id] ? ' — ค้าง ' + n[t.id] + ' คาบ' : ''}
            </option>`).join('')}
        </select>
      </label>`;
  },

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

  paySummary() {
    const due  = this.classes();
    const sumD = due.reduce((n, c) => n + Number(c.fee || 0), 0);
    const paid = this.rounds();
    const sumP = paid.reduce((n, r) => n + Number(r.amount || 0), 0);
    const kids = paid.reduce((n, r) => n + Number(r.classCount || 0), 0);

    return `
      <div class="statbar statbar--2">
        <div class="stat stat--warn">
          <span class="stat__num">${UI.money(sumD)}</span>
          <span class="stat__k">ค้างจ่ายทั้งหมด · ${due.length} คาบ</span>
        </div>
        <div class="stat">
          <span class="stat__num">${UI.money(sumP)}</span>
          <span class="stat__k">จ่ายแล้วในช่วงนี้ · ${kids} คาบ</span>
        </div>
      </div>`;
  },

  // คาบที่หลังบ้านส่งมาคือคาบที่ยังไม่ได้จ่ายทั้งหมดอยู่แล้ว ไม่ตัดตามช่วงวัน
  // ที่นี่เหลือแค่กรองตามผู้ฝึกสอนที่เลือกไว้
  classes() {
    const all = (this.pay && this.pay.classes) || [];
    if (this.who === 'all') return all;
    return all.filter(c => String(c.trainerId) === String(this.who));
  },

  // รายการที่จ่ายแล้วในช่วงวันที่เลือก
  rounds() {
    const all = (this.pay && this.pay.payouts) || [];
    if (this.who === 'all') return all;
    return all.filter(r => String(r.trainerId) === String(this.who));
  },

  countOf(tab) {
    return tab === 'paid' ? this.rounds().length : this.classes().length;
  },

  paintList() {
    const box = document.getElementById('fList');
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
    const canPick = !this.pay.isTrainer && this.who !== 'all';

    box.innerHTML = (canPick ? `
      <div class="pickhead">
        <label class="pickall">
          <input type="checkbox" id="pickAll"
            ${list.every(c => this.picked[c.key]) ? 'checked' : ''}>
          <span>เลือกทั้งหมด ${list.length} คาบ</span>
        </label>
      </div>` : (!this.pay.isTrainer ? `
      <p class="fhint fhint--lead">เลือกผู้ฝึกสอนด้านบนก่อน แล้วจะติ๊กเลือกคาบที่จะจ่ายได้</p>` : ''))
      + '<div class="flist">' + list.map(c => `
      <article class="frow2${canPick ? ' frow2--pick' : ''}${
        canPick && this.picked[c.key] ? ' is-picked' : ''}"${
        canPick ? ` data-pick="${UI.esc(c.key)}"` : ''}>
        ${canPick ? `<input type="checkbox" class="frow2__box"
          ${this.picked[c.key] ? 'checked' : ''} tabindex="-1">` : ''}
        <div class="frow2__when">
          <span class="frow2__date">${UI.esc(UI.thaiDate(c.date, 'short'))}</span>
          <span class="frow2__time">${UI.esc(c.startTime)}–${UI.esc(c.endTime)}</span>
        </div>
        <div class="frow2__main">
          <h3 class="frow2__course">${UI.esc(c.courseName || 'ไม่พบคอร์ส')}</h3>
          <p class="frow2__meta">
            ${this.pay.isTrainer ? '' : UI.esc(c.trainerName) + ' · '}เด็ก ${c.children.length} คน
            ${c.location ? ' · ' + UI.esc(c.location) : ''}
          </p>
          <p class="frow2__kids">${UI.esc(c.children.join(' · '))}</p>
        </div>
        <div class="frow2__money">
          <span class="frow2__fee">${UI.money(c.fee)}</span>
          <span class="frow2__unit">บาท</span>
        </div>
      </article>`).join('') + '</div>';

    if (canPick) {
      box.querySelectorAll('[data-pick]').forEach(el => {
        el.onclick = () => {
          const k = el.dataset.pick;
          if (Finance.picked[k]) delete Finance.picked[k];
          else Finance.picked[k] = true;
          Finance.paintList();
        };
      });
      const all = box.querySelector('#pickAll');
      all.onclick = (e) => {
        e.stopPropagation();
        const on = all.checked;
        list.forEach(c => {
          if (on) Finance.picked[c.key] = true;
          else delete Finance.picked[c.key];
        });
        Finance.paintList();
      };
    }

    this.paintBar();
  },

  // ── แถบล่างบอกยอดที่เลือกไว้ ──────────────────────────────
  paintBar() {
    const bar = document.getElementById('fBar');
    if (!bar) return;

    const keys = Object.keys(this.picked);
    if (!keys.length || this.tab !== 'due' || this.who === 'all') {
      bar.innerHTML = '';
      return;
    }

    const chosen = this.classes().filter(c => this.picked[c.key]);
    const total  = chosen.reduce((n, c) => n + Number(c.fee || 0), 0);
    const name   = (this.pay.trainers || [])
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
          <button class="btn btn--primary" data-act="close" data-busy="กำลังเปิด">จ่ายค่าสอน</button>
        </div>
      </div>`;

    bar.querySelector('[data-act="clear"]').onclick = () => {
      Finance.picked = {};
      Finance.paintList();
    };
    bar.querySelector('[data-act="close"]').onclick = (e) =>
      UI.run(e.currentTarget, 'กำลังเปิด', () => Finance.confirmPayout(chosen, total, name));
  },

  // ── จ่ายค่าสอน ────────────────────────────────────────────
  // ติ๊กเลือกแล้วจ่ายจบในขั้นตอนเดียว ไม่มีสถานะรอโอนคั่นกลาง
  confirmPayout(chosen, total, name) {
    UI.openSheet(`
      <div class="sheet__title">จ่ายค่าสอน</div>
      <p class="sheet__sub">${UI.esc(name)} · ${chosen.length} คาบ</p>

      <div class="paysum">
        <span class="paysum__amt">${UI.money(total)}</span>
        <span class="paysum__k">บาท</span>
      </div>

      <div class="minilist">
        ${chosen.map(c => `
          <div class="minirow">
            <span class="minirow__d">${UI.esc(UI.thaiDate(c.date, 'short'))} ${UI.esc(c.startTime)}</span>
            <span class="minirow__t">${UI.esc(c.courseName)}
              <span class="minirow__n">เด็ก ${c.children.length} คน</span></span>
            <span class="minirow__m">${UI.money(c.fee)}</span>
          </div>`).join('')}
      </div>

      ${People.fselect('p_method', 'วิธีจ่าย',
        [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], 'transfer')}
      ${People.finput('p_ref', 'เลขอ้างอิง', '', 'เลขรายการจากสลิป')}
      ${People.finput('p_note', 'หมายเหตุ', '', 'เช่น ค่าสอนครึ่งเดือนแรก')}

      <div class="notice notice--info">
        บันทึกแล้วยอดจะถูกตรึงไว้ ถ้าแก้อัตราค่าสอนทีหลัง ยอดรายการนี้จะไม่เปลี่ยนตาม
        ถ้าจ่ายผิดให้ยกเลิกรายการ คาบจะกลับไปอยู่ในยอดค้างจ่าย
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึกการจ่าย</button>
      </div>`);

    const method = document.getElementById('p_method');
    const sync = () => {
      const ref = document.getElementById('p_ref');
      if (ref) ref.closest('.field').classList.toggle('is-hidden', method.value === 'cash');
    };
    method.onchange = sync;
    sync();

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Finance.createPayout(chosen),
    });
  },

  async createPayout(chosen) {
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
    await this.reloadPay();
    UI.toast('จ่ายค่าสอนให้' + res.data.trainerName + ' แล้ว ' +
             res.data.classCount + ' คาบ ' + UI.money(res.data.amount) + ' บาท');
  },

  // ── รายการที่จ่ายแล้ว ─────────────────────────────────────
  paintRounds(box) {
    const rounds = this.rounds();

    if (!rounds.length) {
      box.innerHTML = UI.empty('ยังไม่มีการจ่ายในช่วงวันที่นี้',
        this.pay.isTrainer
          ? 'เมื่อศูนย์จ่ายค่าสอนแล้ว รายการจะขึ้นที่นี่ ลองขยายช่วงวันที่ด้านบน'
          : 'เลือกผู้ฝึกสอนแล้วติ๊กคาบที่จะจ่าย จากแท็บค้างจ่าย');
      return;
    }

    box.innerHTML = '<div class="flist">' + rounds.map(r => `
      <button class="prow" data-payout="${UI.esc(r.id)}">
        <span class="prow__main">
          <span class="prow__who">
            ${this.pay.isTrainer ? '' : UI.esc(r.trainerName) + ' · '}${
            UI.esc(UI.thaiDate(r.periodStart, 'short'))}${
            r.periodStart === r.periodEnd ? ''
              : ' – ' + UI.esc(UI.thaiDate(r.periodEnd, 'short'))}
          </span>
          <span class="prow__meta">
            ${r.classCount} คาบ · ${UI.esc(this.METHOD[r.method] || r.method)}
            ${r.paidAt ? ' · จ่าย ' + UI.esc(UI.thaiDate(r.paidAt, 'short')) : ''}
            ${r.reference ? ' · อ้างอิง ' + UI.esc(r.reference) : ''}
          </span>
        </span>
        <span class="prow__right">
          <span class="prow__amt">${UI.money(r.amount)}</span>
          <span class="pchip pchip--ok">จ่ายแล้ว</span>
        </span>
      </button>`).join('') + '</div>';

    box.querySelectorAll('[data-payout]').forEach(b => {
      b.onclick = () => Finance.openPayout(b.dataset.payout);
    });
  },

  // ── รายละเอียดรอบจ่าย ─────────────────────────────────────
  async openPayout(id) {
    UI.openSheet(UI.loading());

    const res = await API.call('getPayoutDetail', { id });
    if (!res.ok) { UI.closeSheet(); UI.toast(res.message, 'error'); return; }

    const r     = res.data.payout;
    const list  = res.data.classes || [];
    const admin = !this.pay.isTrainer;

    UI.fillSheet(`
      <div class="sheet__title">รายการจ่ายค่าสอน</div>
      <p class="sheet__sub">
        ${UI.esc(r.trainerName)} ·
        ${UI.esc(UI.thaiDate(r.periodStart))}${
        r.periodStart === r.periodEnd ? '' : ' ถึง ' + UI.esc(UI.thaiDate(r.periodEnd))}
      </p>

      <div class="paysum">
        <span class="paysum__amt">${UI.money(r.amount)}</span>
        <span class="paysum__k">บาท · ${r.classCount} คาบ</span>
        <span class="pchip pchip--ok">จ่ายแล้ว</span>
      </div>

      ${People.section('การจ่าย', [
        ['วิธีจ่าย', this.METHOD[r.method] || ''],
        ['เลขอ้างอิง', r.reference],
        ['วันที่จ่าย', r.paidAt ? UI.thaiDate(r.paidAt) : ''],
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

      ${admin ? `
        <div class="dsection">
          <h3 class="dsection__title">แก้ไขรายละเอียดการจ่าย</h3>
          ${People.fselect('y_method', 'วิธีจ่าย',
            [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], r.method || 'transfer')}
          ${People.finput('y_ref', 'เลขอ้างอิง', r.reference, 'เลขรายการจากสลิป')}
          ${People.finput('y_note', 'หมายเหตุ', r.note, '')}
          <p class="fhint">แก้ได้เฉพาะรายละเอียด ถ้าจ่ายผิดคนหรือผิดคาบให้ยกเลิกรายการแล้วทำใหม่</p>
        </div>` : ''}

      <div class="sheet__actions">
        ${admin ? `<button class="btn btn--ghost" data-act="cancel"
          data-busy="กำลังยกเลิก">ยกเลิกรายการ</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        ${admin ? `<button class="btn btn--primary" data-act="pay"
          data-busy="กำลังบันทึก">บันทึกการแก้ไข</button>` : ''}
      </div>`);

    const method = document.getElementById('y_method');
    if (method) {
      const sync = () => {
        const ref = document.getElementById('y_ref');
        if (ref) ref.closest('.field').classList.toggle('is-hidden', method.value === 'cash');
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
    await this.reloadPay();
    UI.toast('แก้ไขรายละเอียดแล้ว');
  },

  async cancelPayout(id, r) {
    if (!confirm('ยกเลิกรายการจ่ายนี้ของ' + r.trainerName + '?\n' +
      r.classCount + ' คาบ ' + UI.money(r.amount) + ' บาท จะกลับไปอยู่ในยอดค้างจ่าย')) return;

    const res = await API.call('cancelPayout', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    this.tab = 'due';
    await this.reloadPay();
    UI.toast('ยกเลิกแล้ว คาบกลับไปอยู่ในยอดค้างจ่าย');
  },

  async applyRange() {
    const from = People.val('f_from');
    const to   = People.val('f_to');

    // ยังกรอกไม่ครบ ปล่อยไว้เงียบ ๆ ไม่ต้องเตือน เพราะยังพิมพ์อยู่
    if (!from || !to) return;
    if (to < from)    { UI.toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
    if (from === this.from && to === this.to) return;

    this.from = from;
    this.to   = to;
    this.picked = {};
    await this.reloadPay();
  },

  async reloadPay() {
    API.clearCache('getFinanceBoard');
    await this.render(document.getElementById('page'));
  },
};

PAGES.finance = (el) => Finance.render(el);
