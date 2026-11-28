// ============================================================
// Homey Kids D Shine — income.js
// รับเงิน — ค่าคอร์สที่ผู้ปกครองจ่ายเข้าศูนย์
// ============================================================
//
// ผู้ดูแลระบบเห็นทุกรายการและบันทึกรับเงินได้
// ผู้ปกครองเห็นแต่ของบุตรหลานตัวเอง ดูยอดและขอ QR ได้ แต่บันทึกไม่ได้
// การกรองทำที่หลังบ้าน หน้านี้ไม่ได้แค่ซ่อนปุ่ม
//
// งานที่ทำบ่อยที่สุดของหน้านี้คือ "รับเงินมาแล้ว บันทึกหน่อย"
// จึงเอาปุ่มรับเงินมาไว้บนแถวเลย กดครั้งเดียวเจอฟอร์ม
// ส่วนการกดที่ตัวแถวเป็นการเปิดดูประวัติ ซึ่งทำนานทีครั้ง
// ============================================================

const Income = {

  board:  null,
  tab:    'due',      // due = ค้างชำระ | paid = ครบแล้ว | all = ทั้งหมด
  query:  '',

  // ── ทางเข้าหน้า ───────────────────────────────────────────
  async render(el) {
    el.innerHTML = `<div id="inBody">${UI.loading('กำลังรวมยอด')}</div>`;
    const box = document.getElementById('inBody');

    const res = await API.cached('getIncomeBoard');
    if (!res.ok) {
      box.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.board = res.data;
    this.paint(box);
  },

  paint(box) {
    const parent = this.board.isParent;
    const rows   = this.board.rows || [];

    // นับจากสถานะ ไม่ใช่จาก due เพราะรายการที่ยังไม่ได้ตั้งราคามี due เป็นศูนย์
    // แต่ไม่ได้แปลว่าจ่ายครบ ถ้านับจาก due มันจะหลุดไปรวมกับพวกที่จ่ายแล้ว
    const due  = this.rowsOf('due');
    const nop  = rows.filter(r => r.status === 'noprice');
    const sumD = due.reduce((n, r) => n + r.due, 0);
    const sumP = rows.reduce((n, r) => n + r.paid, 0);

    box.innerHTML = `
      <div class="lstrip">
        <div class="lstrip__i">
          <span class="lstrip__k">ค้างชำระ</span>
          <span class="lstrip__v lstrip__v--warn">${UI.money(sumD)}</span>
          <span class="lstrip__n">${due.length} รายการ</span>
        </div>
        <div class="lstrip__i">
          <span class="lstrip__k">รับมาแล้ว</span>
          <span class="lstrip__v">${UI.money(sumP)}</span>
          <span class="lstrip__n">สะสมทั้งหมด</span>
        </div>
        ${nop.length ? `
          <div class="lstrip__i lstrip__i--alert">
            <span class="lstrip__k">ยังไม่ได้ตั้งราคา</span>
            <span class="lstrip__v">${nop.length}</span>
            <span class="lstrip__n">ต้องแก้ก่อนเก็บเงิน</span>
          </div>` : `
          <div class="lstrip__i">
            <span class="lstrip__k">รายการลงทะเบียน</span>
            <span class="lstrip__v">${rows.length}</span>
            <span class="lstrip__n">ทั้งหมด</span>
          </div>`}
      </div>

      <div class="ftools">
        <div class="chipbar chipbar--tabs">
          ${this.tabList()
            .map(([v, label]) => `<button class="chipbtn${this.tab === v ? ' is-on' : ''}"
              data-itab="${v}">${label}
              <span class="chipbtn__n">${this.rowsOf(v).length}</span></button>`).join('')}
        </div>
        ${parent ? '' : `
          <div class="ftools__right">
            <input class="field__input ftools__q" id="in_q" type="search"
              placeholder="ค้นหาชื่อเด็ก ผู้ปกครอง หรือคอร์ส" value="${UI.esc(this.query)}">
            <button class="btn btn--ghost btn--sm" data-act="settings">ตั้งค่าการรับเงิน</button>
          </div>`}
      </div>

      <div id="inList"></div>`;

    if (!parent) {
      box.querySelector('#in_q').addEventListener('input', e => {
        Income.query = e.target.value;
        Income.paintList();
      });
      box.querySelector('[data-act="settings"]').onclick = () => Income.openSettings();
    }

    box.querySelectorAll('[data-itab]').forEach(b => {
      b.onclick = () => {
        Income.tab = b.dataset.itab;
        box.querySelectorAll('[data-itab]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.itab === Income.tab));
        Income.paintList();
      };
    });

    this.paintList();
  },

  // คัดจากสถานะที่หลังบ้านคิดมา ไม่ใช่จาก due
  // รายการที่ยังไม่ได้ตั้งราคาถือว่ายังไม่จบ จึงอยู่ในค้างชำระ ไม่ใช่ครบแล้ว
  rowsOf(tab) {
    const rows = (this.board && this.board.rows) || [];
    if (tab === 'due')     return rows.filter(r => r.status !== 'paid');
    if (tab === 'paid')    return rows.filter(r => r.status === 'paid');
    if (tab === 'noprice') return rows.filter(r => r.status === 'noprice');
    return rows;
  },

  // แท็บยังไม่ตั้งราคาโผล่เฉพาะตอนที่มีจริง เพราะเป็นของค้างที่ต้องเคลียร์
  // ไม่ใช่มุมมองถาวรที่ต้องอ่านทิ้งทุกครั้งที่เปิดหน้า
  tabList() {
    const base = [['due', 'ค้างชำระ'], ['paid', 'ครบแล้ว'], ['all', 'ทั้งหมด']];
    if (this.rowsOf('noprice').length) base.splice(1, 0, ['noprice', 'ยังไม่ตั้งราคา']);
    return base;
  },

  find(id) {
    return ((this.board && this.board.rows) || []).find(x => String(x.id) === String(id));
  },

  // ── รายการ ────────────────────────────────────────────────
  paintList() {
    const box = document.getElementById('inList');
    if (!box) return;

    const admin = !this.board.isParent;
    const q = this.query.trim().toLowerCase();
    const list = this.rowsOf(this.tab).filter(r => !q ||
      [r.childName, r.childFull, r.parentName, r.courseName]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));

    if (!list.length) {
      box.innerHTML = this.tab === 'due'
        ? UI.empty('ไม่มียอดค้างชำระ', 'ทุกรายการรับเงินครบแล้ว')
        : UI.empty('ไม่พบรายการ', 'ลองเปลี่ยนแท็บด้านบนหรือแก้คำค้นหา');
      return;
    }

    box.innerHTML = '<div class="irows">' + list.map(r => this.row(r, admin)).join('') + '</div>';

    box.querySelectorAll('[data-fee]').forEach(b => {
      b.onclick = () => Income.openFee(b.dataset.fee);
    });
    box.querySelectorAll('[data-pay]').forEach(b => {
      b.onclick = () => Income.openPay(b.dataset.pay);
    });
  },

  // ── หนึ่งแถว ──────────────────────────────────────────────
  // ตัวเลขฝั่งขวาบอกยอดที่ต้องทำอะไรต่อ บรรทัดเล็กใต้มันบอกที่มา
  // เลิกใส่ป้ายสถานะซ้ำ เพราะตัวเลขกับบรรทัดเล็กบอกครบแล้ว
  // เหลือป้ายไว้เฉพาะกรณียังไม่ได้ตั้งราคา ซึ่งเป็นเรื่องผิดปกติที่ต้องสะดุดตา
  row(r, admin) {
    const noPrice = r.status === 'noprice';
    const owed    = !noPrice && r.due > 0;

    return `
      <div class="irow${noPrice ? ' irow--alert' : ''}">
        <button class="irow__open" data-fee="${UI.esc(r.id)}">
          <span class="irow__who">
            ${UI.esc(r.childName)}
            <small>${UI.esc(r.courseName)}${
              r.parentName && admin ? ' · ' + UI.esc(r.parentName) : ''}</small>
          </span>
          <span class="irow__num${owed ? ' irow__num--due' : ''}">
            ${noPrice
              ? `<b class="irow__dash">—</b><small>ยังไม่ได้ตั้งราคา</small>`
              : owed
              ? `<b>${UI.money(r.due)}</b><small>ค้าง จาก ${UI.money(r.price)}</small>`
              : `<b>${UI.money(r.price)}</b><small>ครบแล้ว</small>`}
          </span>
        </button>
        ${admin && owed
          ? `<button class="irow__act" data-pay="${UI.esc(r.id)}">รับเงิน</button>`
          : '<span class="irow__act irow__act--off" aria-hidden="true"></span>'}
      </div>`;
  },

  // ══════════════════════════════════════════════════════════
  // บันทึกรับเงิน — กล่องสั้น เห็นฟอร์มทั้งใบไม่ต้องเลื่อน
  // ══════════════════════════════════════════════════════════
  openPay(id) {
    const r = this.find(id);
    if (!r) return;

    UI.openSheet(`
      <div class="sheet__title">รับเงิน</div>
      <p class="sheet__sub">${UI.esc(r.childName)} · ${UI.esc(r.courseName)}</p>

      <div class="duebar">
        <span class="duebar__k">ค้างอยู่</span>
        <span class="duebar__v">${UI.money(r.due)}</span>
        <span class="duebar__u">จาก ${UI.money(r.price)} บาท</span>
      </div>

      <div class="frow">
        ${People.finput('g_amount', 'จำนวนเงิน', r.due, 'รับมาเท่าไหร่', 'number')}
        ${People.finput('g_date', 'วันที่รับ', UI.today(), '', 'date')}
      </div>
      ${People.fselect('g_method', 'วิธีรับเงิน',
        [['transfer', 'โอนเงิน'], ['cash', 'เงินสด']], 'transfer')}
      ${People.finput('g_ref', 'เลขอ้างอิง', '', 'เลขรายการจากสลิป')}
      ${People.finput('g_note', 'หมายเหตุ', '', 'เช่น งวดที่ 1')}
      <p class="fhint">ใส่น้อยกว่ายอดค้างได้ถ้าแบ่งจ่าย รับเกินยอดค้างไม่ได้</p>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="qr" data-busy="กำลังสร้าง">QR พร้อมเพย์</button>
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    this.syncRef('g_method', 'g_ref');

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Income.savePayment(r.id),
      // พิมพ์ยอดไว้เท่าไหร่ให้ QR ล็อคยอดนั้น ไม่ใช่ยอดค้างทั้งก้อน
      qr:    () => Income.openQR(r, People.val('g_amount'), 'pay'),
    });
  },

  // เลขอ้างอิงมีความหมายกับการโอนเท่านั้น จ่ายเงินสดไม่มีเลขให้กรอก
  syncRef(methodId, refId) {
    const method = document.getElementById(methodId);
    if (!method) return;
    const sync = () => {
      const ref = document.getElementById(refId);
      if (ref) ref.closest('.field').classList.toggle('is-hidden', method.value === 'cash');
    };
    method.onchange = sync;
    sync();
  },

  // ══════════════════════════════════════════════════════════
  // รายละเอียดและประวัติ — เปิดจากการกดที่ตัวแถว
  // ══════════════════════════════════════════════════════════
  openFee(id) {
    const r = this.find(id);
    if (!r) return;

    const admin   = !this.board.isParent;
    const noPrice = r.status === 'noprice';
    const pct     = r.price > 0 ? Math.min(100, Math.round((r.paid / r.price) * 100)) : 0;

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(r.childName)}</div>
      <p class="sheet__sub">${UI.esc(r.courseName)}${
        r.parentName && admin ? ' · ผู้ปกครอง ' + UI.esc(r.parentName) : ''}${
        r.startDate ? ' · เริ่ม ' + UI.esc(UI.thaiDate(r.startDate, 'short')) : ''}</p>

      ${noPrice ? `
        <div class="notice notice--warn">
          รายการนี้ยังไม่ได้ตั้งราคา จึงยังคิดยอดค้างและรับเงินไม่ได้
          ${admin ? 'ไปตั้งราคาที่หน้าคอร์ส แล้วเปิดรายการลงทะเบียนของ' +
            UI.esc(r.childName) + ' เพื่อแก้ราคา' : 'แจ้งผู้ดูแลศูนย์ให้ตั้งราคาก่อน'}
        </div>`
      : `
        <div class="duebar${r.due > 0 ? ' duebar--due' : ''}">
          <span class="duebar__k">${r.due > 0 ? 'ค้างอยู่' : 'ชำระครบแล้ว'}</span>
          <span class="duebar__v">${UI.money(r.due > 0 ? r.due : r.price)}</span>
          <span class="duebar__u">รับมาแล้ว ${UI.money(r.paid)} จาก ${UI.money(r.price)} บาท</span>
          <span class="duebar__g"><i style="width:${pct}%"></i></span>
        </div>`}

      <div class="dsection">
        <h3 class="dsection__title">ประวัติการจ่าย ${r.payments.length} งวด</h3>
        ${r.payments.length ? `<div class="minilist">
          ${r.payments.map(x => `
            <div class="minirow${admin ? ' minirow--drop' : ''}">
              <span class="minirow__d">${UI.esc(UI.thaiDate(x.paidAt, 'short'))}</span>
              <span class="minirow__t">${UI.esc(Money.methodOf(x.method))}
                ${x.reference ? `<span class="minirow__n">${UI.esc(x.reference)}</span>` : ''}
                ${x.note ? `<span class="minirow__n">${UI.esc(x.note)}</span>` : ''}</span>
              <span class="minirow__m">${UI.money(x.amount)}</span>
              ${admin ? `<button class="minirow__x" data-drop="${UI.esc(x.id)}"
                title="ลบงวดนี้">✕</button>` : ''}
            </div>`).join('')}
        </div>` : '<p class="fhint">ยังไม่มีการรับเงินในรายการนี้</p>'}
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        ${r.due > 0 && !noPrice ? `<button class="btn btn--ghost" data-act="qr"
          data-busy="กำลังสร้าง">QR พร้อมเพย์</button>` : ''}
        ${admin && r.due > 0 && !noPrice ? `<button class="btn btn--primary"
          data-act="pay">รับเงิน</button>` : ''}
      </div>`);

    document.querySelectorAll('[data-drop]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); Income.dropPayment(b.dataset.drop, r); };
    });

    People.bindSheet({
      close: () => UI.closeSheet(),
      pay:   () => Income.openPay(r.id),
      // ผู้ปกครองไม่มีช่องให้พิมพ์ยอด จึงได้ยอดค้างเต็มจำนวน
      qr:    () => Income.openQR(r, '', 'fee'),
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
    await this.reload();
    UI.toast(res.data.due > 0
      ? 'บันทึกแล้ว ยังค้างอีก ' + UI.money(res.data.due) + ' บาท'
      : 'บันทึกแล้ว ชำระครบ');
  },

  async dropPayment(id, r) {
    if (!confirm('ลบงวดนี้ออกจากประวัติ?\nยอดค้างของ' + r.childName + 'จะเพิ่มกลับมา')) return;

    const res = await API.call('removePayment', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    await this.reload();
    UI.toast('ลบงวดแล้ว');
  },

  // ── ตั้งค่าการรับเงินของศูนย์ ─────────────────────────────
  async openSettings() {
    UI.openSheet(UI.loading());

    const res = await API.call('getSettings');
    if (!res.ok) { UI.closeSheet(); UI.toast(res.message, 'error'); return; }
    const s = res.data;

    UI.fillSheet(`
      <div class="sheet__title">ตั้งค่าการรับเงิน</div>
      <p class="sheet__sub">ใช้สร้าง QR พร้อมเพย์แบบล็อคยอดให้ผู้ปกครองสแกนจ่าย</p>

      ${People.fgroup('พร้อมเพย์ของศูนย์')}
      ${People.finput('s_pp', 'เบอร์พร้อมเพย์ หรือเลขผู้เสียภาษี', s.promptpayId,
        'เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก')}
      ${People.finput('s_ppname', 'ชื่อบัญชี', s.promptpayName,
        'ชื่อที่จะขึ้นในแอปธนาคารของผู้โอน')}
      <p class="fhint">
        ยอดเงินจะถูกล็อคมากับ QR ผู้โอนแก้ยอดเองไม่ได้
        สร้างในเครื่องทั้งหมด ไม่ได้ส่งเลขบัญชีหรือยอดเงินออกไปข้างนอก
      </p>

      ${People.fgroup('ข้อมูลศูนย์', 'ใช้กับใบเสร็จและไฟล์สรุปการเงิน')}
      ${People.finput('s_tax', 'เลขประจำตัวผู้เสียภาษี', s.taxId, '13 หลัก')}
      ${People.finput('s_phone', 'โทรศัพท์', s.centerPhone, '')}
      ${People.finput('s_addr', 'ที่อยู่', s.centerAddress, '')}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  async () => {
        const out = await API.call('saveSettings', {
          promptpayId:   People.val('s_pp'),
          promptpayName: People.val('s_ppname'),
          taxId:         People.val('s_tax'),
          centerPhone:   People.val('s_phone'),
          centerAddress: People.val('s_addr'),
        });
        if (!out.ok) { UI.toast(out.message, 'error'); return; }
        UI.closeSheet();
        UI.toast('บันทึกการตั้งค่าแล้ว');
      },
    });
  },

  // ── QR พร้อมเพย์ล็อคยอด ───────────────────────────────────
  // ยอดคิดที่หลังบ้าน หน้าเว็บแค่ขอมาวาด จะได้ไม่มีใครแก้ยอดจากฝั่งนี้ได้
  async openQR(r, amount, back) {
    UI.openSheet(UI.loading('กำลังสร้าง QR'));

    // พลาดแล้วพากลับไปกล่องที่กดมา ไม่ใช่ปิดทิ้งทั้งใบ
    // ไม่งั้นคนกดจะหลุดออกมาที่รายการแล้วต้องไล่หารายการเดิมใหม่
    const home = () => (back === 'pay' ? Income.openPay(r.id) : Income.openFee(r.id));
    const fail = (msg) => { UI.toast(msg, 'error'); home(); };

    const res = await API.call('getPayQR', { enrollmentId: r.id, amount: amount });
    if (!res.ok) { fail(res.message); return; }

    const q = res.data;
    let svg;
    try {
      svg = QR.svg(q.payload);
    } catch (err) {
      fail('สร้าง QR ไม่สำเร็จ: ' + err.message);
      return;
    }

    UI.fillSheet(`
      <div class="sheet__title">สแกนจ่าย</div>
      <p class="sheet__sub">${UI.esc(r.childName)} · ${UI.esc(r.courseName)}</p>

      <div class="qrbox">
        <div class="qrbox__img">${svg}</div>
        <div class="qrbox__amt">${UI.money(q.amount)} <span>บาท</span></div>
        <p class="qrbox__to">
          ${q.name ? UI.esc(q.name) + ' · ' : ''}พร้อมเพย์ ${UI.esc(q.idMask)}
        </p>
      </div>

      <div class="notice notice--info">
        ยอดถูกล็อคมากับ QR แล้ว ผู้โอนแก้ยอดเองไม่ได้
        ${q.amount < q.due
          ? 'ยอดนี้เป็นการแบ่งจ่าย จ่ายแล้วยังค้างอีก ' + UI.money(q.due - q.amount) + ' บาท'
          : 'โอนแล้วตัดยอดค้างหมดพอดี'}
      </div>

      <p class="fhint">
        โอนเสร็จแล้วยังต้องกดบันทึกรับเงินเอง ระบบไม่ได้เชื่อมกับบัญชีธนาคาร
      </p>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="back">ย้อนกลับ</button>
        <button class="btn btn--primary" data-act="close">เสร็จแล้ว</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      back:  () => home(),
    });
  },

  async reload() {
    API.clearCache('getIncomeBoard');
    await this.render(document.getElementById('page'));
  },
};

PAGES.income = (el) => Income.render(el);
