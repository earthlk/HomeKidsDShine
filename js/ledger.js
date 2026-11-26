// ============================================================
// Homey Kids D Shine — ledger.js
// สรุปการเงิน — รายรับรายจ่ายของศูนย์
// ============================================================
//
// หน้านี้ไม่ได้เพิ่มหรือแก้อะไร อ่านแล้วรวมยอดจากของที่บันทึกไว้แล้ว
//   รายรับ  มาจากหน้ารับเงิน
//   รายจ่าย มาจากหน้าจ่ายค่าสอน
//
// ไม่มีการคำนวณภาษีในนี้ ตั้งใจไม่ใส่
// อัตราภาษีและสิทธิลดหย่อนเปลี่ยนตามปีและขึ้นกับรูปแบบกิจการ
// สิ่งที่หน้านี้ทำได้ดีกว่าคือรวมตัวเลขให้ถูกและส่งออกเป็นไฟล์
// ให้เอาไปยื่นเองหรือส่งต่อให้คนทำบัญชี
// ============================================================

const Ledger = {

  data: null,
  from: '',
  to:   '',
  tab:  'in',        // in = รายการรับเงิน | out = รายการจ่าย

  // ── ทางเข้าหน้า ───────────────────────────────────────────
  async render(el) {
    // ค่าตั้งต้นเป็นปีนี้ ไม่ใช่เดือนนี้
    // เพราะคนเปิดหน้าสรุปมักอยากเห็นภาพรวมยาว ไม่ใช่แค่เดือนที่กำลังเดิน
    if (!this.from) {
      const y = UI.today().slice(0, 4);
      this.from = y + '-01-01';
      this.to   = UI.today();
    }

    el.innerHTML = `<div id="lgBody">${UI.loading('กำลังรวมยอด')}</div>`;
    const box = document.getElementById('lgBody');

    const res = await API.cached('getLedger', { from: this.from, to: this.to });
    if (!res.ok) {
      box.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.data = res.data;
    this.paint(box);
  },

  paint(box) {
    const d = this.data;

    box.innerHTML = `
      <div class="ftools">
        ${Money.rangeHtml(this.from, this.to, 'lg')}
        <div class="ftools__right">
          <button class="btn btn--ghost btn--sm" data-act="csvAll">ส่งออกรายการ</button>
          <button class="btn btn--ghost btn--sm" data-act="csvMonth">ส่งออกรายเดือน</button>
        </div>
      </div>

      <div class="lstrip">
        <div class="lstrip__i">
          <span class="lstrip__k">รายรับ</span>
          <span class="lstrip__v lstrip__v--in">${UI.money(d.income.total)}</span>
          <span class="lstrip__n">${d.income.count} รายการ</span>
        </div>
        <div class="lstrip__i">
          <span class="lstrip__k">รายจ่าย</span>
          <span class="lstrip__v lstrip__v--out">${UI.money(d.expense.total)}</span>
          <span class="lstrip__n">ค่าสอน ${d.expense.count} รายการ</span>
        </div>
        <div class="lstrip__i lstrip__i--net">
          <span class="lstrip__k">คงเหลือ</span>
          <span class="lstrip__v${d.net < 0 ? ' lstrip__v--out' : ''}">${UI.money(d.net)}</span>
          <span class="lstrip__n">${UI.thaiDate(d.from, 'short')} – ${UI.thaiDate(d.to, 'short')}</span>
        </div>
      </div>

      ${this.monthTable()}

      <div class="ftools ftools--tight">
        <div class="chipbar chipbar--tabs">
          <button class="chipbtn${this.tab === 'in' ? ' is-on' : ''}" data-ltab="in">
            รายการรับเงิน <span class="chipbtn__n">${d.inRows.length}</span></button>
          <button class="chipbtn${this.tab === 'out' ? ' is-on' : ''}" data-ltab="out">
            รายการจ่าย <span class="chipbtn__n">${d.outRows.length}</span></button>
        </div>
      </div>

      <div id="lgList"></div>

      <p class="fhint fhint--foot">
        ไฟล์ที่ส่งออกมีวันที่ คู่กรณี รายการ และเลขอ้างอิงของทุกรายการ
        เอาไปยื่นเองหรือส่งให้คนทำบัญชีต่อได้ ระบบไม่คิดภาษีให้
        เพราะอัตราและสิทธิลดหย่อนเปลี่ยนทุกปีและขึ้นกับรูปแบบกิจการ
      </p>`;

    Money.bindRange(box, 'lg', this, (from, to) => {
      Ledger.from = from;
      Ledger.to   = to;
      Ledger.reload();
    });

    box.querySelector('[data-act="csvAll"]').onclick   = () => Ledger.exportAll();
    box.querySelector('[data-act="csvMonth"]').onclick = () => Ledger.exportMonths();

    box.querySelectorAll('[data-ltab]').forEach(b => {
      b.onclick = () => {
        Ledger.tab = b.dataset.ltab;
        box.querySelectorAll('[data-ltab]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.ltab === Ledger.tab));
        Ledger.paintList();
      };
    });

    this.paintList();
  },

  // ── ตารางรายเดือน ─────────────────────────────────────────
  // ตารางจริง ไม่ใช่การ์ดเรียงกัน เพราะงานของหน้านี้คือเทียบเดือนต่อเดือน
  // ตัวเลขจึงต้องชิดขวาและอยู่ในคอลัมน์เดียวกันให้กวาดตาลงมาได้
  monthTable() {
    const months = this.data.months || [];
    if (!months.length) {
      return UI.empty('ยังไม่มีรายการในช่วงนี้',
        'ลองขยายช่วงวันที่ด้านบน หรือเริ่มบันทึกรับเงินกับจ่ายค่าสอนก่อน');
    }

    const d = this.data;

    return `
      <div class="ltable">
        <table class="ltable__t">
          <caption class="ltable__cap">รายรับรายจ่ายแยกรายเดือน</caption>
          <thead>
            <tr>
              <th scope="col">เดือน</th>
              <th scope="col" class="num">รายรับ</th>
              <th scope="col" class="num">รายจ่าย</th>
              <th scope="col" class="num">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            ${this.monthRows(months).map(m => m.empty ? `
              <tr class="is-zero">
                <th scope="row">${UI.esc(m.label)}</th>
                <td class="num">–</td>
                <td class="num">–</td>
                <td class="num">–</td>
              </tr>` : `
              <tr>
                <th scope="row">${UI.esc(m.label)}</th>
                <td class="num">${m.income ? UI.money(m.income) : '–'}</td>
                <td class="num">${m.expense ? UI.money(m.expense) : '–'}</td>
                <td class="num${m.net < 0 ? ' is-neg' : ''}">${UI.money(m.net)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">รวม</th>
              <td class="num">${UI.money(d.income.total)}</td>
              <td class="num">${UI.money(d.expense.total)}</td>
              <td class="num${d.net < 0 ? ' is-neg' : ''}">${UI.money(d.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  // เดือนที่ไม่มีรายการเลยและอยู่ติดกัน ยุบเป็นแถวเดียว
  // ดูทั้งปีแล้วมีแถวขีดกลางแปดแถวเรียงกันก่อนถึงตัวเลขจริง ตาต้องข้ามไปเอง
  // แต่จะตัดทิ้งเลยก็ไม่ได้ เพราะช่วงเวลาต้องครบตามที่เลือกไว้
  monthRows(months) {
    const out = [];
    months.forEach(m => {
      const blank = !m.income && !m.expense;
      const last  = out[out.length - 1];

      if (blank && last && last.empty) {
        last.to = m.ym;
        last.label = Money.thaiMonth(last.from) === Money.thaiMonth(last.to)
          ? Money.thaiMonth(last.from)
          : Money.thaiMonth(last.from) + ' – ' + Money.thaiMonth(last.to);
        return;
      }
      if (blank) {
        out.push({ empty: true, from: m.ym, to: m.ym, label: Money.thaiMonth(m.ym) });
        return;
      }
      out.push({ empty: false, label: Money.thaiMonth(m.ym),
                 income: m.income, expense: m.expense, net: m.net });
    });
    return out;
  },

  // ── รายการแต่ละรายการ ─────────────────────────────────────
  paintList() {
    const box = document.getElementById('lgList');
    if (!box) return;

    const income = this.tab === 'in';
    const rows   = income ? this.data.inRows : this.data.outRows;

    if (!rows.length) {
      box.innerHTML = UI.empty(
        income ? 'ยังไม่มีการรับเงินในช่วงนี้' : 'ยังไม่มีการจ่ายค่าสอนในช่วงนี้',
        'ลองขยายช่วงวันที่ด้านบน');
      return;
    }

    box.innerHTML = '<div class="irows">' + rows.map(r => `
      <div class="crow crow--flat">
        <span class="crow__when">
          <b>${UI.esc(UI.thaiDate(r.date, 'short'))}</b>
          <small>${UI.esc(Money.methodOf(r.method))}</small>
        </span>
        <span class="crow__main">
          <b>${UI.esc(r.who || '—')}</b>
          <small>${UI.esc(r.what)}${
            income && r.childName ? ' · ' + UI.esc(r.childName) : ''}${
            r.reference ? ' · อ้างอิง ' + UI.esc(r.reference) : ''}${
            r.note ? ' · ' + UI.esc(r.note) : ''}</small>
        </span>
        <span class="crow__fee crow__fee--${income ? 'in' : 'out'}">${
          income ? '+' : '−'}${UI.money(r.amount)}</span>
      </div>`).join('') + '</div>';
  },

  // ── ส่งออกไฟล์ ────────────────────────────────────────────
  // ทำในเครื่องทั้งหมด ข้อมูลการเงินไม่ได้ถูกส่งออกไปที่ไหน
  exportAll() {
    const d = this.data;

    const rows = [[
      'วันที่', 'ประเภท', 'หมวด', 'คู่กรณี', 'รายการ',
      'รายรับ', 'รายจ่าย', 'วิธี', 'เลขอ้างอิง', 'หมายเหตุ',
    ]];

    // เรียงตามวันที่จากเก่าไปใหม่ เพราะสมุดบัญชีอ่านจากบนลงล่างตามเวลา
    const all = d.inRows.map(r => ({ r: r, income: true }))
      .concat(d.outRows.map(r => ({ r: r, income: false })))
      .sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)));

    all.forEach(x => {
      const r = x.r;
      rows.push([
        r.date,
        x.income ? 'รายรับ' : 'รายจ่าย',
        x.income ? 'ค่าคอร์ส' : (r.category || 'ค่าสอน'),
        r.who,
        x.income && r.childName ? r.what + ' (' + r.childName + ')' : r.what,
        x.income ? r.amount : '',
        x.income ? '' : r.amount,
        Money.methodOf(r.method),
        r.reference,
        r.note,
      ]);
    });

    rows.push([]);
    rows.push(['รวมรายรับ', '', '', '', '', d.income.total]);
    rows.push(['รวมรายจ่าย', '', '', '', '', '', d.expense.total]);
    rows.push(['คงเหลือ', '', '', '', '', d.net]);

    Money.download(this.fileName('รายการ'), rows);
    UI.toast('ส่งออก ' + all.length + ' รายการแล้ว');
  },

  exportMonths() {
    const d = this.data;
    const rows = [['เดือน', 'รายรับ', 'รายจ่าย', 'คงเหลือ']];

    (d.months || []).forEach(m => {
      rows.push([m.ym, m.income, m.expense, m.net]);
    });
    rows.push(['รวม', d.income.total, d.expense.total, d.net]);

    Money.download(this.fileName('รายเดือน'), rows);
    UI.toast('ส่งออกสรุปรายเดือนแล้ว');
  },

  fileName(kind) {
    return 'สรุปการเงิน-' + kind + '-' + this.from + '-ถึง-' + this.to + '.csv';
  },

  async reload() {
    API.clearCache('getLedger');
    await this.render(document.getElementById('page'));
  },
};

PAGES.ledger = (el) => Ledger.render(el);
