// ============================================================
// Homey Kids D Shine — trainers.js
// ข้อมูลผู้ฝึกสอน
// ============================================================

const Trainers = {

  data:  { trainers: [], linkable: [] },
  query: '',

  async render(el) {
    const res = await API.cached('getTrainerBoard');
    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }
    this.data = res.data;
    this.paint(el);
  },

  paint(el) {
    el.innerHTML = `
      <div class="toolbar">
        <input class="field__input toolbar__search" id="trSearch" type="search"
          placeholder="ค้นหาจากชื่อ เบอร์โทร หรือความถนัด" value="${UI.esc(this.query)}">
        <div class="toolbar__actions">
          <button class="btn btn--primary" data-act="new">เพิ่มผู้ฝึกสอน</button>
        </div>
      </div>
      <div id="trList"></div>`;

    el.querySelector('#trSearch').addEventListener('input', e => {
      Trainers.query = e.target.value;
      Trainers.paintList();
    });
    el.querySelector('[data-act="new"]').onclick = () => Trainers.openForm();

    this.paintList();
  },

  paintList() {
    const box = document.getElementById('trList');
    if (!box) return;

    const q = this.query.trim().toLowerCase();
    const rows = this.data.trainers.filter(t => !q ||
      [t.name, t.phone, t.specialization, t.email]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));

    if (!rows.length) {
      box.innerHTML = this.data.trainers.length
        ? UI.empty('ไม่พบผู้ฝึกสอนที่ค้นหา', 'ลองพิมพ์คำอื่น')
        : UI.empty('ยังไม่มีผู้ฝึกสอน',
            'เพิ่มผู้ฝึกสอนคนแรกเพื่อเริ่มลงนัด แล้วเปิดบัญชีเข้าระบบให้ที่หน้าผู้ใช้งาน');
      return;
    }

    box.innerHTML = '<div class="pgrid">' + rows.map(t => this.card(t)).join('') + '</div>';

    box.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = () => Trainers.openDetail(b.dataset.open);
    });
  },

  card(t) {
    // ผู้ฝึกสอนที่ไม่มีบัญชีเข้าระบบจะบันทึกกิจกรรมเองไม่ได้ ต้องเห็นตั้งแต่การ์ด
    const warn = (!t.hasAccount
      ? '<span class="pchip pchip--warn">ยังไม่มีบัญชีเข้าระบบ</span>'
      : (!t.accountActive ? '<span class="pchip pchip--muted">บัญชีถูกปิด</span>' : ''))
      // ไม่มีคอร์สที่รับสอน แปลว่าลงนัดให้คนนี้ไม่ได้เลย
      + (!(t.courseIds || []).length
          ? '<span class="pchip pchip--warn">ยังไม่ได้เลือกคอร์สที่รับสอน</span>' : '');

    const courses = this.courseNames(t.courseIds);

    return `
      <article class="pcard ${t.active ? '' : 'pcard--off'}" data-open="${UI.esc(t.id)}">
        <div class="pcard__top">
          <div class="pcard__avatar pcard__avatar--trainer">${UI.esc(People.initial(t))}</div>
          <div class="pcard__id">
            <h3 class="pcard__name">${UI.esc(t.name)}</h3>
            <p class="pcard__sub">${UI.esc(t.specialization || '')}</p>
          </div>
          ${t.active ? '' : '<span class="pchip pchip--muted">ปิดใช้งาน</span>'}
        </div>

        <div class="pcard__body">
          ${t.phone ? People.row('โทรศัพท์', t.phone) : ''}
          ${t.email ? People.row('อีเมล', t.email) : ''}
        </div>

        <div class="tally">
          <div class="tally__item">
            <span class="tally__num tally__num--done">${t.done}</span>
            <span class="tally__label">สอนแล้ว</span>
          </div>
          <div class="tally__item">
            <span class="tally__num tally__num--booked">${t.upcoming}</span>
            <span class="tally__label">นัดข้างหน้า</span>
          </div>
          <div class="tally__item">
            <span class="tally__num${t.pending ? ' tally__num--low' : ' tally__num--muted'}">${t.pending}</span>
            <span class="tally__label">รอบันทึก</span>
          </div>
        </div>

        ${courses.length ? `<div class="pcard__alerts">
          ${courses.map(n => `<span class="pchip">${UI.esc(n)}</span>`).join('')}
        </div>` : ''}

        ${warn ? `<div class="pcard__alerts">${warn}</div>` : ''}
      </article>`;
  },

  // แปลงรายการ id คอร์สเป็นชื่อ ตัดตัวที่หาไม่เจอออก เช่นคอร์สที่ถูกลบไปแล้ว
  courseNames(ids) {
    const map = {};
    (this.data.courses || []).forEach(c => { map[String(c.id)] = c.name; });
    return (ids || []).map(id => map[String(id)]).filter(Boolean);
  },

  // ── รายละเอียด ────────────────────────────────────────────
  openDetail(id) {
    const t = this.data.trainers.find(x => String(x.id) === String(id));
    if (!t) return;

    UI.openSheet(`
      <div class="dhead">
        <div class="pcard__avatar pcard__avatar--trainer pcard__avatar--lg">${UI.esc(People.initial(t))}</div>
        <div>
          <h2 class="dhead__name">${UI.esc(t.name)}</h2>
          <p class="dhead__sub">${UI.esc(t.specialization || 'ไม่ระบุความถนัด')}</p>
        </div>
      </div>

      ${People.section('ข้อมูลติดต่อ', [
        ['โทรศัพท์', t.phone],
        ['อีเมลเข้าระบบ', t.email],
      ])}

      ${People.section('คอร์สที่รับสอน', [
        ['คอร์ส', this.courseNames(t.courseIds).join(', ') || 'ยังไม่ได้เลือก'],
      ])}

      ${People.section('บัญชีรับค่าสอน', [
        ['ธนาคาร', t.bankName],
        ['เลขบัญชี', t.bankAccountNo],
        ['ชื่อบัญชี', t.bankAccountName],
      ])}

      ${People.section('การใช้งาน', [
        ['สถานะ', t.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'],
        ['บัญชีเข้าระบบ', t.hasAccount
          ? (t.accountActive ? 'มีและใช้งานได้' : 'มีแต่ถูกปิด')
          : 'ยังไม่มี'],
      ])}

      ${!t.hasAccount ? `
        <div class="notice notice--info">
          ผู้ฝึกสอนคนนี้ยังเข้าระบบไม่ได้ จึงบันทึกกิจกรรมและดูตารางของตัวเองไม่ได้
          ไปสร้างบัญชีและผูกกันได้ที่หน้าผู้ใช้งาน
        </div>` : ''}

      <div class="tally tally--wide">
        <div class="tally__item">
          <span class="tally__num tally__num--done">${t.done}</span>
          <span class="tally__label">สอนแล้ว</span>
        </div>
        <div class="tally__item">
          <span class="tally__num tally__num--booked">${t.upcoming}</span>
          <span class="tally__label">นัดข้างหน้า</span>
        </div>
        <div class="tally__item">
          <span class="tally__num${t.pending ? ' tally__num--low' : ''}">${t.pending}</span>
          <span class="tally__label">รอบันทึก</span>
        </div>
        <div class="tally__item">
          <span class="tally__num tally__num--muted">${t.total}</span>
          <span class="tally__label">นัดทั้งหมด</span>
        </div>
      </div>

      <div class="sheet__actions">
        ${t.total === 0
          ? `<button class="btn btn--danger" data-act="del" data-busy="กำลังลบ">ลบ</button>`
          : `<button class="btn btn--ghost" data-act="toggle" data-busy="กำลังบันทึก">
               ${t.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>`}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        <button class="btn btn--primary" data-act="edit">แก้ไข</button>
      </div>`);

    People.bindSheet({
      close:  () => UI.closeSheet(),
      edit:   () => { UI.closeSheet(); Trainers.openForm(t); },
      toggle: () => Trainers.toggle(t.id),
      del:    () => Trainers.confirmRemove(t),
    });
  },

  // ── ฟอร์ม ─────────────────────────────────────────────────
  openForm(t) {
    t = t || {};
    const editing = !!t.id;

    UI.openSheet(`
      <div class="sheet__title">${editing ? 'แก้ไขผู้ฝึกสอน' : 'เพิ่มผู้ฝึกสอน'}</div>
      ${editing ? `<p class="sheet__sub">${UI.esc(t.name)}</p>` : ''}

      ${People.fgroup('ข้อมูลผู้ฝึกสอน')}
      <div class="frow">
        ${People.finput('t_name', 'ชื่อที่ใช้เรียก', t.name, 'เช่น ครูเอิร์ธ')}
        ${People.finput('t_phone', 'โทรศัพท์', t.phone, '08x-xxx-xxxx', 'tel')}
      </div>
      ${People.finput('t_specialization', 'ความถนัด', t.specialization,
        'เช่น พัฒนาการกล้ามเนื้อมัดใหญ่')}

      ${People.fgroup('คอร์สที่รับสอน', 'ลงนัดให้ผู้ฝึกสอนคนนี้ได้เฉพาะคอร์สที่เลือกไว้')}
      ${this.courseChips(t.courseIds || [])}

      ${People.fgroup('อัตราค่าสอน',
        'คิดต่อคาบ สอนกี่คนในคาบเดียวกันก็ได้เท่าเดิม เว้นว่างไว้คือใช้ค่าตั้งต้นของคอร์ส')}
      <div id="t_fees"></div>

      ${People.fgroup('บัญชีรับค่าสอน', 'ใช้ในหน้าการเงิน เห็นเฉพาะผู้ดูแลระบบ')}
      ${People.fselect('t_bankName', 'ธนาคาร', this.BANKS, t.bankName, 'เลือกธนาคาร')}
      <div class="frow">
        ${People.finput('t_bankAccountNo', 'เลขบัญชี', t.bankAccountNo, 'ตัวเลขอย่างเดียว')}
        ${People.finput('t_bankAccountName', 'ชื่อบัญชี', t.bankAccountName, 'ตามหน้าสมุดบัญชี')}
      </div>

      ${editing && !t.hasAccount ? `
        <div class="notice notice--info">
          ยังไม่มีบัญชีเข้าระบบ ไปสร้างและผูกได้ที่หน้าผู้ใช้งาน
        </div>` : ''}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    // เลือกคอร์สแล้วช่องอัตราค่าสอนต้องขึ้นตามทันที ไม่ต้องบันทึกก่อน
    document.querySelectorAll('[data-course]').forEach(b => {
      b.onclick = () => { b.classList.toggle('is-on'); Trainers.paintFees(t.fees || {}); };
    });
    this.paintFees(t.fees || {});

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Trainers.submit(t.id, t.active),
    });
  },

  // ── ช่องอัตราค่าสอนรายคอร์ส ───────────────────────────────
  // ขึ้นเฉพาะคอร์สที่เลือกไว้ตอนนี้ ไม่ใช่ทุกคอร์สในระบบ
  // อ่านค่าที่พิมพ์ค้างไว้กลับมาก่อนวาดใหม่ ไม่งั้นกดเลือกคอร์สอื่นแล้วค่าที่พิมพ์หาย
  paintFees(saved) {
    const box = document.getElementById('t_fees');
    if (!box) return;

    const typed = {};
    box.querySelectorAll('[data-fee]').forEach(i => { typed[i.dataset.fee] = i.value; });

    const on = Array.prototype.slice
      .call(document.querySelectorAll('[data-course].is-on'))
      .map(b => b.dataset.course);

    if (!on.length) {
      box.innerHTML = '<p class="fhint">เลือกคอร์สที่รับสอนก่อน แล้วจะกรอกอัตราค่าสอนได้</p>';
      return;
    }

    const byId = {};
    (this.data.courses || []).forEach(c => { byId[String(c.id)] = c; });

    box.innerHTML = '<div class="feelist">' + on.map(id => {
      const c   = byId[id] || {};
      const val = typed[id] !== undefined ? typed[id]
                : (saved[id] !== undefined ? saved[id] : '');
      const def = Number(c.trainerFee || 0);
      return `
        <label class="feerow">
          <span class="feerow__name">${UI.esc(c.name || id)}</span>
          <span class="feerow__in">
            <input class="field__input" type="number" min="0" step="10"
              data-fee="${UI.esc(id)}" value="${UI.esc(val)}"
              placeholder="${def ? UI.money(def) : 'ยังไม่ตั้งค่าตั้งต้น'}">
            <span class="feerow__unit">บาท/คาบ</span>
          </span>
        </label>`;
    }).join('') + '</div>' +
    '<p class="fhint">ตัวเลขจาง ๆ คือค่าตั้งต้นของคอร์ส แก้ที่หน้าคอร์ส</p>';
  },

  // ปุ่มเลือกคอร์ส กดสลับเปิดปิดได้ทีละอัน
  // คอร์สที่ปิดการขายแล้วยังแสดงถ้าเคยเลือกไว้ เพราะอาจมีนัดเก่าค้างอยู่
  courseChips(selected) {
    const list = (this.data.courses || [])
      .filter(c => c.active || selected.indexOf(String(c.id)) >= 0);

    if (!list.length) {
      return '<p class="fhint">ยังไม่มีคอร์สในระบบ เพิ่มคอร์สที่หน้าคอร์สก่อน</p>';
    }

    return '<div class="chipbar">' + list.map(c => `
      <button type="button" class="chipbtn${selected.indexOf(String(c.id)) >= 0 ? ' is-on' : ''}"
        data-course="${UI.esc(c.id)}">
        ${UI.esc(c.name)}${c.active ? '' : ' (ปิดการขาย)'}
      </button>`).join('') + '</div>';
  },

  // ธนาคารที่คนไทยใช้บ่อย เลือกจากรายการกันพิมพ์ชื่อไม่ตรงกัน
  BANKS: ['กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'กรุงศรีอยุธยา',
          'ทหารไทยธนชาต', 'ออมสิน', 'ธ.ก.ส.', 'ยูโอบี', 'ซีไอเอ็มบี ไทย',
          'แลนด์ แอนด์ เฮ้าส์', 'เกียรตินาคินภัทร', 'อาคารสงเคราะห์'],

  // ช่องที่เว้นว่างไม่ส่งไป หลังบ้านจะได้รู้ว่าให้ใช้ค่าตั้งต้นของคอร์ส
  // ถ้าส่งเป็น 0 จะกลายเป็นสอนฟรี ซึ่งคนละความหมายกับเว้นว่าง
  readFees() {
    const out = {};
    document.querySelectorAll('[data-fee]').forEach(i => {
      const v = String(i.value).trim();
      if (v !== '') out[i.dataset.fee] = Number(v);
    });
    return out;
  },

  async submit(id, active) {
    const payload = {
      id,
      name:           People.val('t_name'),
      phone:          People.val('t_phone'),
      specialization: People.val('t_specialization'),
      active:         id ? active : true,
      courseIds:      Array.prototype.slice
                        .call(document.querySelectorAll('[data-course].is-on'))
                        .map(b => b.dataset.course),
      bankName:        People.val('t_bankName'),
      bankAccountNo:   People.val('t_bankAccountNo'),
      bankAccountName: People.val('t_bankAccountName'),
      fees:            Trainers.readFees(),
    };

    if (!payload.name) { UI.toast('กรอกชื่อผู้ฝึกสอนก่อน', 'error'); return; }

    const res = await API.call('saveTrainer', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้ฝึกสอนแล้ว');
    UI.closeSheet();
    this.reload();
  },

  async toggle(id) {
    const res = await API.call('toggleTrainer', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }
    UI.toast(res.data.active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว');
    UI.closeSheet();
    this.reload();
  },

  confirmRemove(t) {
    UI.openSheet(`
      <div class="sheet__title">ลบผู้ฝึกสอน</div>
      <p>ลบ <strong>${UI.esc(t.name)}</strong> ออกจากระบบ การลบย้อนกลับไม่ได้</p>
      <p class="fhint">บัญชีเข้าระบบจะยังอยู่ ลบแยกได้ที่หน้าผู้ใช้งาน</p>
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--danger" data-act="go" data-busy="กำลังลบ">ลบผู้ฝึกสอน</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      go: async () => {
        const res = await API.call('removeTrainer', { id: t.id });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('ลบแล้ว');
        UI.closeSheet();
        Trainers.reload();
      },
    });
  },

  async reload() {
    App.invalidate();
    await this.render(document.getElementById('page'));
  },
};

PAGES.trainers = (el) => Trainers.render(el);
