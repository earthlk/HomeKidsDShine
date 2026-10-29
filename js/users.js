// ============================================================
// Homey Kids D Shine — users.js
// บัญชีผู้ใช้งาน
// ============================================================

const Users = {

  rows:    [],
  targets: null,
  query:   '',
  role:    'all',

  LABEL: { admin: 'ผู้ดูแลระบบ', trainer: 'ผู้ฝึกสอน', parent: 'ผู้ปกครอง' },

  async render(el) {
    const res = await API.cached('getUsers');
    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }
    this.rows = res.data.users;
    this.paint(el);
  },

  paint(el) {
    const groups = [
      ['all',     'ทั้งหมด',      this.rows.length],
      ['admin',   'ผู้ดูแลระบบ',  this.rows.filter(u => u.role === 'admin').length],
      ['trainer', 'ผู้ฝึกสอน',    this.rows.filter(u => u.role === 'trainer').length],
      ['parent',  'ผู้ปกครอง',    this.rows.filter(u => u.role === 'parent').length],
    ];

    el.innerHTML = `
      <div class="toolbar">
        <input class="field__input toolbar__search" id="uSearch" type="search"
          placeholder="ค้นหาจากชื่อหรืออีเมล" value="${UI.esc(this.query)}">
        <div class="toolbar__actions">
          <button class="btn btn--primary" data-act="new">เพิ่มผู้ใช้งาน</button>
        </div>
      </div>

      <div class="chipbar">
        ${groups.map(([v, label, n]) =>
          `<button class="chipbtn${this.role === v ? ' is-on' : ''}" data-role="${v}">
            ${label} <span class="chipbtn__n">${n}</span></button>`).join('')}
      </div>

      <div id="uList"></div>`;

    el.querySelector('#uSearch').addEventListener('input', e => {
      Users.query = e.target.value;
      Users.paintList();
    });
    el.querySelector('[data-act="new"]').onclick = () => Users.openForm();
    el.querySelectorAll('[data-role]').forEach(b => {
      b.onclick = () => {
        Users.role = b.dataset.role;
        el.querySelectorAll('[data-role]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.role === Users.role));
        Users.paintList();
      };
    });

    this.paintList();
  },

  paintList() {
    const box = document.getElementById('uList');
    if (!box) return;

    const q = this.query.trim().toLowerCase();
    const rows = this.rows.filter(u => {
      if (this.role !== 'all' && u.role !== this.role) return false;
      if (!q) return true;
      return [u.name, u.email, u.phone]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0);
    });

    if (!rows.length) {
      box.innerHTML = UI.empty('ไม่พบผู้ใช้งาน', 'ลองพิมพ์คำอื่น หรือเปลี่ยนตัวกรองสิทธิ์');
      return;
    }

    box.innerHTML = '<div class="ulist">' + rows.map(u => `
      <button class="urow ${u.active ? '' : 'urow--off'}" data-open="${UI.esc(u.id)}">
        <span class="urow__av urow__av--${UI.esc(u.role)}">${UI.esc(People.initial(u))}</span>
        <span class="urow__main">
          <span class="urow__name">
            ${UI.esc(u.name)}
            ${u.isSelf ? '<span class="pchip pchip--ok">คุณ</span>' : ''}
          </span>
          <span class="urow__mail">${UI.esc(u.email)}</span>
        </span>
        <span class="urow__tags">
          <span class="pchip pchip--${UI.esc(u.role)}">${this.LABEL[u.role] || u.role}</span>
          ${this.linkTag(u)}
          ${u.active ? '' : '<span class="pchip pchip--muted">ปิดใช้งาน</span>'}
        </span>
      </button>`).join('') + '</div>';

    box.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = () => Users.openDetail(b.dataset.open);
    });
  },

  // บัญชีที่ยังไม่ผูกกับข้อมูลตัวบุคคลจะใช้งานได้ไม่เต็มที่
  // ผู้ฝึกสอนจะไม่มีตารางของตัวเอง ผู้ปกครองจะมองไม่เห็นบุตรหลาน
  linkTag(u) {
    if (u.role === 'admin') return '';
    if (u.linked) return `<span class="pchip">${UI.esc(u.linked)}</span>`;
    return '<span class="pchip pchip--warn">ยังไม่ผูกข้อมูล</span>';
  },

  openDetail(id) {
    const u = this.rows.find(x => String(x.id) === String(id));
    if (!u) return;

    const hint = u.role === 'admin' ? ''
      : u.linked ? ''
      : (u.role === 'trainer'
          ? 'บัญชีนี้ยังไม่ผูกกับข้อมูลผู้ฝึกสอน จึงยังไม่มีตารางสอนของตัวเอง ไปผูกได้ที่หน้าผู้ฝึกสอน'
          : 'บัญชีนี้ยังไม่ผูกกับข้อมูลผู้ปกครอง จึงยังมองไม่เห็นบุตรหลาน ไปผูกได้ที่หน้าเด็กและผู้ปกครอง');

    UI.openSheet(`
      <div class="dhead">
        <div class="pcard__avatar pcard__avatar--lg urow__av--${UI.esc(u.role)}">${UI.esc(People.initial(u))}</div>
        <div>
          <h2 class="dhead__name">${UI.esc(u.name)}</h2>
          <p class="dhead__sub">${this.LABEL[u.role] || u.role}</p>
        </div>
      </div>

      ${People.section('บัญชี', [
        ['อีเมล', u.email],
        ['โทรศัพท์', u.phone],
        ['สถานะ', u.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'],
        ['ข้อมูลที่ผูกไว้', u.linked],
        ['สร้างเมื่อ', u.createdAt ? UI.thaiDate(u.createdAt) : ''],
      ])}

      ${hint ? `<div class="notice notice--info">${hint}</div>` : ''}

      ${(u.hasLine || u.hasGoogle) ? `
        <div class="dsection">
          <h3 class="dsection__title">บัญชีที่เชื่อมไว้</h3>
          ${u.hasLine ? `<div class="drow2">
            <span class="drow2__k">LINE</span>
            <span class="drow2__v">เชื่อมแล้ว</span>
            <button class="btn btn--ghost btn--sm" data-act="unline">ตัดการเชื่อม</button>
          </div>` : ''}
          ${u.hasGoogle ? `<div class="drow2">
            <span class="drow2__k">Google</span>
            <span class="drow2__v">เชื่อมแล้ว</span>
            <button class="btn btn--ghost btn--sm" data-act="ungoogle">ตัดการเชื่อม</button>
          </div>` : ''}
        </div>` : ''}

      <div class="sheet__actions">
        ${u.isSelf ? '' : `<button class="btn btn--ghost" data-act="toggle" data-busy="กำลังบันทึก">
          ${u.active ? 'ปิดบัญชี' : 'เปิดบัญชี'}</button>`}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        <button class="btn btn--primary" data-act="edit">แก้ไข</button>
      </div>`);

    People.bindSheet({
      close:    () => UI.closeSheet(),
      edit:     () => { UI.closeSheet(); Users.openForm(u); },
      toggle:   () => Users.toggle(u.id),
      unline:   () => Users.unlink(u.id, 'line'),
      ungoogle: () => Users.unlink(u.id, 'google'),
    });
  },

  async openForm(u) {
    u = u || {};
    const editing = !!u.id;

    UI.openSheet(UI.loading());

    // รายการผู้ฝึกสอนและผู้ปกครองที่ยังไม่มีบัญชี ไว้ให้เลือกผูก
    const res = await API.cached('getLinkTargets');
    this.targets = res.ok ? res.data : { trainer: [], parent: [] };

    UI.fillSheet(`
      <div class="sheet__title">${editing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'}</div>
      ${editing ? `<p class="sheet__sub">${UI.esc(u.name)} · ${UI.esc(u.email)}</p>` : ''}

      ${People.fgroup('ข้อมูลบัญชี')}
      <div class="frow">
        ${People.finput('u_name', 'ชื่อ', u.name, 'ชื่อที่แสดงในระบบ')}
        ${People.finput('u_phone', 'โทรศัพท์', u.phone, '08x-xxx-xxxx', 'tel')}
      </div>
      ${People.finput('u_email', 'อีเมล', u.email, 'name@example.com', 'email')}
      ${People.fselect('u_role', 'สิทธิ์การใช้งาน', [
        ['admin', 'ผู้ดูแลระบบ — เห็นและแก้ไขได้ทุกอย่าง'],
        ['trainer', 'ผู้ฝึกสอน — เห็นตารางและบันทึกกิจกรรมของตัวเอง'],
        ['parent', 'ผู้ปกครอง — เห็นข้อมูลบุตรหลานของตัวเอง'],
      ], u.role || 'trainer')}

      ${People.fgroup('ผูกกับข้อมูลที่มีอยู่',
        'ผู้ฝึกสอนและผู้ปกครองต้องผูกกับข้อมูลของตัวเอง จึงจะเห็นตารางและบุตรหลานได้')}
      <div class="field" id="u_linkBox">
        <label class="field__label" for="u_linkId">ข้อมูลที่ผูก</label>
        <select class="field__input" id="u_linkId"></select>
        <p class="fhint" id="u_linkHint"></p>
      </div>

      ${editing ? '' : `
        ${People.fgroup('รหัสผ่านแรกเข้า')}
        ${People.finput('u_password', 'รหัสผ่าน', '', 'อย่างน้อย 8 ตัวอักษร')}
        <p class="fhint">แจ้งรหัสนี้ให้เจ้าตัวแล้วบอกให้เปลี่ยนเองหลังเข้าใช้ครั้งแรก</p>`}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    const role = document.getElementById('u_role');
    role.onchange = () => Users.fillLinkOptions(u);
    this.fillLinkOptions(u);

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Users.submit(u.id),
    });
  },

  // ตัวเลือกเปลี่ยนตามสิทธิ์ที่เลือก ผู้ดูแลระบบไม่ต้องผูกกับอะไร
  fillLinkOptions(u) {
    const role = People.val('u_role');
    const wrap = document.getElementById('u_linkBox');
    const sel  = document.getElementById('u_linkId');
    const hint = document.getElementById('u_linkHint');
    if (!wrap || !sel) return;

    if (role === 'admin') {
      wrap.classList.add('is-hidden');
      sel.innerHTML = '';
      return;
    }

    wrap.classList.remove('is-hidden');

    const word = role === 'trainer' ? 'ผู้ฝึกสอน' : 'ผู้ปกครอง';
    const list = (this.targets[role] || [])
      .filter(t => !t.linkedTo || String(t.linkedTo) === String(u.id || ''));

    const mine = (this.targets[role] || [])
      .find(t => String(t.linkedTo) === String(u.id || ''));

    sel.innerHTML = '<option value="">ยังไม่ผูก</option>' + list.map(t =>
      `<option value="${UI.esc(t.id)}"${mine && String(mine.id) === String(t.id) ? ' selected' : ''}>
        ${UI.esc(t.name)}${t.phone ? ' · ' + UI.esc(t.phone) : ''}</option>`).join('');

    hint.textContent = list.length
      ? 'เลือกข้อมูล' + word + 'ที่สร้างไว้แล้ว'
      : 'ยังไม่มีข้อมูล' + word + 'ที่ว่าง ไปสร้างที่หน้า' + word + 'ก่อน';
  },

  async submit(id) {
    const payload = {
      id,
      name:     People.val('u_name'),
      email:    People.val('u_email'),
      phone:    People.val('u_phone'),
      role:     People.val('u_role'),
      password: People.val('u_password'),
      linkId:   People.val('u_linkId'),
    };

    const res = await API.call('saveUser', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้ใช้งานแล้ว');
    UI.closeSheet();
    this.reload();
  },

  async toggle(id) {
    const res = await API.call('toggleUser', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }
    UI.toast(res.data.active ? 'เปิดบัญชีแล้ว' : 'ปิดบัญชีแล้ว');
    UI.closeSheet();
    this.reload();
  },

  async unlink(id, provider) {
    const res = await API.call('unlinkAccount', { id, provider });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }
    UI.toast('ตัดการเชื่อมแล้ว');
    UI.closeSheet();
    this.reload();
  },

  async reload() {
    this.targets = null;
    App.invalidate();
    await this.render(document.getElementById('page'));
  },
};

PAGES.users = (el) => Users.render(el);
