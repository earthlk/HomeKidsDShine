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
    const warn = !t.hasAccount
      ? '<span class="pchip pchip--warn">ยังไม่มีบัญชีเข้าระบบ</span>'
      : (!t.accountActive ? '<span class="pchip pchip--muted">บัญชีถูกปิด</span>' : '');

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

        ${warn ? `<div class="pcard__alerts">${warn}</div>` : ''}
      </article>`;
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

      ${editing && !t.hasAccount ? `
        <div class="notice notice--info">
          ยังไม่มีบัญชีเข้าระบบ ไปสร้างและผูกได้ที่หน้าผู้ใช้งาน
        </div>` : ''}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Trainers.submit(t.id, t.active),
    });
  },

  async submit(id, active) {
    const payload = {
      id,
      name:           People.val('t_name'),
      phone:          People.val('t_phone'),
      specialization: People.val('t_specialization'),
      active:         id ? active : true,
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
