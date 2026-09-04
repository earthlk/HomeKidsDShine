// ============================================================
// Homey Kids D Shine — people.js
// หน้าเด็กและผู้ปกครอง
// ============================================================

const People = {

  data:  { parents: [], children: [], canEdit: false },
  tab:   'children',   // เปิดที่แท็บเด็กก่อน เพราะเป็นข้อมูลที่ดูบ่อยที่สุด
  query: '',

  // ── วาดหน้า ───────────────────────────────────────────────
  async render(el) {
    // เรียกครั้งเดียวได้ทั้งผู้ปกครองและเด็ก
    const res = await API.cached('getPeople');
    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.data  = res.data;
    this.query = '';
    this.paint(el);
  },

  paint(el) {
    const d   = this.data;
    const add = d.canEdit ? `
      <div class="toolbar__actions">
        <button class="btn btn--ghost" data-act="new-parent">เพิ่มผู้ปกครอง</button>
        <button class="btn btn--primary" data-act="new-family">เพิ่มเด็ก</button>
      </div>` : '';

    el.innerHTML = `
      <div class="toolbar">
        <input class="field__input toolbar__search" id="peopleSearch"
          type="search" placeholder="ค้นหาจากชื่อ ชื่อเล่น หรือเบอร์โทร"
          value="${UI.esc(this.query)}">
        ${add}
      </div>

      <div class="segbar" role="tablist">
        <button class="segbar__btn${this.tab === 'children' ? ' is-on' : ''}"
          data-tab="children" role="tab" aria-selected="${this.tab === 'children'}">
          เด็ก <span class="segbar__count">${d.children.length}</span>
        </button>
        <button class="segbar__btn${this.tab === 'parents' ? ' is-on' : ''}"
          data-tab="parents" role="tab" aria-selected="${this.tab === 'parents'}">
          ผู้ปกครอง <span class="segbar__count">${d.parents.length}</span>
        </button>
      </div>

      <div id="peopleList"></div>`;

    el.querySelector('#peopleSearch').addEventListener('input', e => {
      People.query = e.target.value;
      People.paintList();
    });

    el.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { People.tab = b.dataset.tab; People.paint(el); };
    });

    el.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'new-parent') People.openParentForm();
        if (b.dataset.act === 'new-family') People.openFamilyForm();
      };
    });

    this.paintList();
  },

  // ── รายการการ์ด ───────────────────────────────────────────
  paintList() {
    const box = document.getElementById('peopleList');
    if (!box) return;

    const isChild = this.tab === 'children';
    const rows    = this.filter(isChild ? this.data.children : this.data.parents);

    // แยกกรณีไม่มีข้อมูลเลย กับหาไม่เจอ เพราะทางแก้ต่างกัน
    if (!rows.length) {
      const total = isChild ? this.data.children.length : this.data.parents.length;
      const word  = isChild ? 'เด็ก' : 'ผู้ปกครอง';

      box.innerHTML = total
        ? UI.empty('ไม่พบ' + word + 'ที่ค้นหา',
            'ลองพิมพ์คำอื่น หรือค้นด้วยชื่อเล่นและเบอร์โทร')
        : UI.empty('ยังไม่มีข้อมูล' + word,
            this.data.canEdit
              ? 'เริ่มจากกดปุ่มเพิ่มเด็ก ระบบจะให้กรอกข้อมูลผู้ปกครองไปพร้อมกัน'
              : 'ติดต่อผู้ดูแลศูนย์เพื่อเพิ่มข้อมูล');
      return;
    }

    box.innerHTML = '<div class="pgrid">' +
      rows.map(r => isChild ? this.childCard(r) : this.parentCard(r)).join('') +
      '</div>';

    box.querySelectorAll('[data-open]').forEach(c => {
      c.onclick = () => isChild
        ? People.openChildDetail(c.dataset.open)
        : People.openParentDetail(c.dataset.open);
    });
  },

  filter(rows) {
    const q = this.query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.name, r.nickname, r.phone, r.phoneAlt, r.school]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0)
    );
  },

  // ── การ์ดเด็ก ─────────────────────────────────────────────
  childCard(c) {
    const parent = this.parentOf(c);
    const alerts = this.alertsOf(c);

    return `
      <article class="pcard ${alerts.length ? 'pcard--alert' : ''}" data-open="${UI.esc(c.id)}">
        <div class="pcard__top">
          <div class="pcard__avatar">${UI.esc(this.initial(c))}</div>
          <div class="pcard__id">
            <h3 class="pcard__name">${UI.esc(c.nickname || c.name)}</h3>
            <p class="pcard__sub">${UI.esc(c.nickname ? c.name : '')}</p>
            <p class="pcard__meta">
              ${c.gender === 'F' ? 'หญิง' : 'ชาย'}${c.dob ? ' · ' + UI.esc(this.age(c.dob)) : ''}
            </p>
          </div>
          ${c.bloodType ? `<span class="pchip pchip--blood">${UI.esc(c.bloodType)}</span>` : ''}
        </div>

        <div class="pcard__body">
          ${c.school       ? this.row('โรงเรียน', c.school) : ''}
          ${c.trainingGoal ? this.row('เป้าหมาย', c.trainingGoal) : ''}
          ${parent ? this.row('ผู้ปกครอง',
              parent.name + (c.parentRelation ? ' (' + c.parentRelation + ')' : '') +
              (parent.phone ? ' · ' + parent.phone : '')) : ''}
        </div>

        ${alerts.length ? `<div class="pcard__alerts">
          ${alerts.map(a => `<span class="pchip pchip--${a.kind}">${UI.esc(a.text)}</span>`).join('')}
        </div>` : ''}
      </article>`;
  },

  // ── การ์ดผู้ปกครอง ────────────────────────────────────────
  parentCard(p) {
    const kids = this.data.children.filter(c => String(c.parentId) === String(p.id));

    return `
      <article class="pcard" data-open="${UI.esc(p.id)}">
        <div class="pcard__top">
          <div class="pcard__avatar pcard__avatar--parent">${UI.esc(this.initial(p))}</div>
          <div class="pcard__id">
            <h3 class="pcard__name">${UI.esc(p.name)}</h3>
            <p class="pcard__sub">${UI.esc(p.nickname || '')}</p>
          </div>
        </div>

        <div class="pcard__body">
          ${p.phone  ? this.row('โทรศัพท์', p.phone + (p.phoneAlt ? ' · ' + p.phoneAlt : '')) : ''}
          ${p.lineId ? this.row('LINE', p.lineId) : ''}
          ${p.email  ? this.row('อีเมล', p.email) : ''}
        </div>

        ${kids.length ? `<div class="pcard__alerts">
          ${kids.map(k => `<span class="pchip">${UI.esc(k.nickname || k.name)}</span>`).join('')}
        </div>` : '<div class="pcard__alerts"><span class="pchip pchip--muted">ยังไม่มีเด็กในสังกัด</span></div>'}
      </article>`;
  },

  // ── รายละเอียดเด็ก ────────────────────────────────────────
  openChildDetail(id) {
    const c = this.data.children.find(x => String(x.id) === String(id));
    if (!c) return;

    const parent = this.parentOf(c);
    const edit   = this.data.canEdit;

    UI.openSheet(`
      <div class="dhead">
        <div class="pcard__avatar pcard__avatar--lg">${UI.esc(this.initial(c))}</div>
        <div>
          <h2 class="dhead__name">${UI.esc(c.name)}</h2>
          ${c.nickname ? `<p class="dhead__sub">${UI.esc(c.nickname)}</p>` : ''}
        </div>
      </div>

      ${this.section('ข้อมูลทั่วไป', [
        ['เพศ',       c.gender === 'F' ? 'หญิง' : 'ชาย'],
        ['วันเกิด',   c.dob ? UI.thaiDate(c.dob) + ' · อายุ ' + this.age(c.dob) : ''],
        ['น้ำหนัก',   c.weight ? c.weight + ' กก.' : ''],
        ['ส่วนสูง',   c.height ? c.height + ' ซม.' : ''],
        ['โรงเรียน',  c.school],
        ['เป้าหมายการฝึก', c.trainingGoal],
      ])}

      ${this.section('ข้อมูลสุขภาพ', [
        ['กรุ๊ปเลือด',        c.bloodType],
        ['โรคประจำตัว',      c.medicalConditions],
        ['แพ้อาหาร',          c.foodAllergy],
        ['แพ้ยา',             c.drugAllergy],
        ['ยาที่ใช้ประจำ',     c.medications],
        ['ข้อจำกัดทางร่างกาย', c.physicalLimitation],
      ], 'alert')}

      ${this.section('ติดต่อฉุกเฉิน', [
        [c.emergencyRelation || 'ผู้ติดต่อ',
          c.emergencyName + (c.emergencyPhone ? ' · ' + c.emergencyPhone : '')],
        ['แพทย์หรือโรงพยาบาล',
          c.doctorName + (c.doctorPhone ? ' · ' + c.doctorPhone : '')],
      ])}

      ${parent ? this.section('ผู้ปกครอง', [
        ['ชื่อ', parent.name + (c.parentRelation ? ' (' + c.parentRelation + ')' : '')],
        ['โทรศัพท์', parent.phone],
        ['LINE', parent.lineId],
      ]) : ''}

      ${c.notes ? `<div class="dsection">
        <h3 class="dsection__title">หมายเหตุ</h3>
        <p class="dnote">${UI.esc(c.notes)}</p>
      </div>` : ''}

      <div class="sheet__actions">
        ${edit ? `<button class="btn btn--danger" data-act="del">ลบ</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        ${edit ? `<button class="btn btn--primary" data-act="edit">แก้ไข</button>` : ''}
      </div>`);

    this.bindSheet({
      close: () => UI.closeSheet(),
      edit:  () => { UI.closeSheet(); People.openChildForm(c); },
      del:   () => People.confirmRemove('child', c.id, c.nickname || c.name),
    });
  },

  // ── รายละเอียดผู้ปกครอง ───────────────────────────────────
  openParentDetail(id) {
    const p = this.data.parents.find(x => String(x.id) === String(id));
    if (!p) return;

    const kids = this.data.children.filter(c => String(c.parentId) === String(p.id));
    const edit = this.data.canEdit;

    UI.openSheet(`
      <div class="dhead">
        <div class="pcard__avatar pcard__avatar--parent pcard__avatar--lg">${UI.esc(this.initial(p))}</div>
        <div>
          <h2 class="dhead__name">${UI.esc(p.name)}</h2>
          ${p.nickname ? `<p class="dhead__sub">${UI.esc(p.nickname)}</p>` : ''}
        </div>
      </div>

      ${this.section('ช่องทางติดต่อ', [
        ['โทรศัพท์หลัก',  p.phone],
        ['โทรศัพท์สำรอง', p.phoneAlt],
        ['LINE',          p.lineId],
        ['อีเมล',         p.email],
        ['ที่อยู่',        p.address],
      ])}

      ${this.section('ข้อมูลใบเสร็จ', [
        ['ชื่อผู้รับใบเสร็จ', p.receiptName],
        ['เลขผู้เสียภาษี',   p.taxId],
      ])}

      ${kids.length ? `<div class="dsection">
        <h3 class="dsection__title">บุตรหลานในความดูแล</h3>
        ${kids.map(k => `<button class="drow" data-child="${UI.esc(k.id)}">
          <span class="pcard__avatar pcard__avatar--sm">${UI.esc(this.initial(k))}</span>
          <span>
            <span class="drow__name">${UI.esc(k.name)}</span>
            <span class="drow__sub">${UI.esc(k.nickname || '')}${k.dob ? ' · ' + this.age(k.dob) : ''}</span>
          </span>
        </button>`).join('')}
      </div>` : ''}

      <div class="sheet__actions">
        ${edit ? `<button class="btn btn--danger" data-act="del">ลบ</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ปิด</button>
        ${edit ? `<button class="btn btn--primary" data-act="edit">แก้ไข</button>` : ''}
      </div>`);

    document.querySelectorAll('[data-child]').forEach(b => {
      b.onclick = () => {
        UI.closeSheet();
        setTimeout(() => People.openChildDetail(b.dataset.child), 120);
      };
    });

    this.bindSheet({
      close: () => UI.closeSheet(),
      edit:  () => { UI.closeSheet(); People.openParentForm(p); },
      del:   () => People.confirmRemove('parent', p.id, p.name),
    });
  },

  // ── ฟอร์มผู้ปกครอง ────────────────────────────────────────
  async openParentForm(p) {
    p = p || {};
    UI.openSheet(UI.loading());

    // รายชื่อบัญชีผู้ใช้สิทธิ์ผู้ปกครอง เพื่อผูกกับข้อมูลนี้
    const res   = await API.cached('getLinkableUsers');
    const users = res.ok ? res.data : [];

    const options = users.map(u => {
      const taken = u.linkedTo && String(u.linkedTo) !== String(p.id || '');
      return `<option value="${UI.esc(u.id)}"${String(p.userId) === String(u.id) ? ' selected' : ''}${taken ? ' disabled' : ''}>
        ${UI.esc(u.name)} (${UI.esc(u.email)})${taken ? ' — ผูกกับคนอื่นแล้ว' : ''}
      </option>`;
    }).join('');

    UI.fillSheet(`
      <div class="sheet__title">${p.id ? 'แก้ไขผู้ปกครอง' : 'เพิ่มผู้ปกครอง'}</div>

      ${this.fgroup('ข้อมูลทั่วไป')}
      <div class="frow">
        ${this.finput('f_name', 'ชื่อและนามสกุล', p.name, 'ชื่อจริง นามสกุล')}
        ${this.finput('f_nickname', 'ชื่อเล่น', p.nickname)}
      </div>

      ${this.fgroup('ช่องทางติดต่อ')}
      <div class="frow">
        ${this.finput('f_phone', 'โทรศัพท์หลัก', p.phone, '08x-xxx-xxxx', 'tel')}
        ${this.finput('f_phoneAlt', 'โทรศัพท์สำรอง', p.phoneAlt, '', 'tel')}
      </div>
      <div class="frow">
        ${this.finput('f_email', 'อีเมล', p.email, 'name@example.com', 'email')}
        ${this.finput('f_lineId', 'LINE ID', p.lineId)}
      </div>
      <div class="field">
        <label class="field__label" for="f_address">ที่อยู่</label>
        <textarea class="field__input" id="f_address" rows="2">${UI.esc(p.address)}</textarea>
      </div>

      ${this.fgroup('ข้อมูลใบเสร็จ')}
      <div class="frow">
        ${this.finput('f_receiptName', 'ชื่อผู้รับใบเสร็จ', p.receiptName, 'ถ้าต่างจากชื่อข้างบน')}
        ${this.finput('f_taxId', 'เลขผู้เสียภาษี', p.taxId, '13 หลัก')}
      </div>

      ${this.fgroup('บัญชีเข้าใช้งาน')}
      <div class="field">
        <label class="field__label" for="f_userId">ผูกกับบัญชีผู้ใช้</label>
        <select class="field__input" id="f_userId">
          <option value="">ยังไม่ผูก</option>
          ${options}
        </select>
        <p class="fhint">ผูกแล้วผู้ปกครองจะเห็นตารางเรียนและคอร์สของบุตรหลานเมื่อเข้าสู่ระบบ</p>
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save">บันทึก</button>
      </div>`);

    this.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => People.submitParent(p.id),
    });
  },

  async submitParent(id) {
    const payload = {
      id,
      name:        this.val('f_name'),
      nickname:    this.val('f_nickname'),
      phone:       this.val('f_phone'),
      phoneAlt:    this.val('f_phoneAlt'),
      email:       this.val('f_email'),
      lineId:      this.val('f_lineId'),
      address:     this.val('f_address'),
      receiptName: this.val('f_receiptName'),
      taxId:       this.val('f_taxId'),
      userId:      this.val('f_userId'),
    };

    if (!payload.name) { UI.toast('กรอกชื่อผู้ปกครองก่อน', 'error'); return; }

    const res = await API.call('saveParent', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้ปกครองแล้ว');
    UI.closeSheet();
    this.reload();
  },

  // ── ฟอร์มเด็ก ─────────────────────────────────────────────
  openChildForm(c) {
    c = c || {};
    UI.openSheet(`
      <div class="sheet__title">${c.id ? 'แก้ไขข้อมูลเด็ก' : 'เพิ่มเด็ก'}</div>
      ${this.childFields(c)}
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save">บันทึก</button>
      </div>`);

    this.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => People.submitChild(c.id),
    });
  },

  async submitChild(id) {
    const payload = Object.assign({ id }, this.readChildFields());
    if (!payload.name)     { UI.toast('กรอกชื่อเด็กก่อน', 'error'); return; }
    if (!payload.parentId) { UI.toast('เลือกผู้ปกครองก่อน', 'error'); return; }

    const res = await API.call('saveChild', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มเด็กแล้ว');
    UI.closeSheet();
    this.reload();
  },

  // ── ฟอร์มเพิ่มเด็กพร้อมผู้ปกครอง ──────────────────────────
  openFamilyForm() {
    const hasParents = this.data.parents.length > 0;

    UI.openSheet(`
      <div class="sheet__title">เพิ่มเด็ก</div>

      ${this.fgroup('ผู้ปกครอง')}
      <div class="field">
        <label class="field__label" for="fam_pick">เลือกผู้ปกครอง</label>
        <select class="field__input" id="fam_pick">
          ${hasParents ? this.data.parents.map(p =>
            `<option value="${UI.esc(p.id)}">${UI.esc(p.name)}${p.phone ? ' · ' + UI.esc(p.phone) : ''}</option>`
          ).join('') : ''}
          <option value="">เพิ่มผู้ปกครองใหม่</option>
        </select>
      </div>

      <div id="famNew" class="${hasParents ? 'is-hidden' : ''}">
        <div class="frow">
          ${this.finput('fam_name', 'ชื่อและนามสกุล', '', 'ชื่อจริง นามสกุล')}
          ${this.finput('fam_nickname', 'ชื่อเล่น', '')}
        </div>
        <div class="frow">
          ${this.finput('fam_phone', 'โทรศัพท์หลัก', '', '08x-xxx-xxxx', 'tel')}
          ${this.finput('fam_lineId', 'LINE ID', '')}
        </div>
      </div>

      ${this.childFields({})}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save">บันทึก</button>
      </div>`);

    // ช่องเลือกผู้ปกครองในส่วนข้อมูลเด็กไม่ต้องใช้ เพราะเลือกไว้ข้างบนแล้ว
    const dup = document.getElementById('c_parentWrap');
    if (dup) dup.classList.add('is-hidden');

    const pick = document.getElementById('fam_pick');
    pick.onchange = () => {
      document.getElementById('famNew').classList.toggle('is-hidden', pick.value !== '');
    };

    this.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => People.submitFamily(),
    });
  },

  async submitFamily() {
    const pickedId = this.val('fam_pick');
    const child    = this.readChildFields();

    if (!child.name) { UI.toast('กรอกชื่อเด็กก่อน', 'error'); return; }

    const parent = pickedId
      ? { id: pickedId }
      : {
          name:     this.val('fam_name'),
          nickname: this.val('fam_nickname'),
          phone:    this.val('fam_phone'),
          lineId:   this.val('fam_lineId'),
        };

    if (!pickedId && !parent.name) {
      UI.toast('กรอกชื่อผู้ปกครองก่อน', 'error');
      return;
    }

    const res = await API.call('createFamily', { parent, child });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast('เพิ่มข้อมูลแล้ว');
    UI.closeSheet();
    this.reload();
  },

  // ── ยืนยันการลบ ───────────────────────────────────────────
  confirmRemove(kind, id, label) {
    const word = kind === 'child' ? 'เด็ก' : 'ผู้ปกครอง';

    UI.openSheet(`
      <div class="sheet__title">ลบ${word}</div>
      <p>ลบ <strong>${UI.esc(label)}</strong> ออกจากระบบ การลบย้อนกลับไม่ได้</p>
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--danger" data-act="go">ลบ${word}</button>
      </div>`);

    this.bindSheet({
      close: () => UI.closeSheet(),
      go: async () => {
        const res = await API.call(kind === 'child' ? 'removeChild' : 'removeParent', { id });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('ลบแล้ว');
        UI.closeSheet();
        People.reload();
      },
    });
  },

  // ── ช่องกรอกข้อมูลเด็ก ใช้ร่วมกันสองฟอร์ม ─────────────────
  childFields(c) {
    const RELATIONS = ['พ่อ','แม่','ปู่','ย่า','ตา','ยาย','ลุง','ป้า','น้า','อา',
                       'ผู้ปกครองตามกฎหมาย','อื่น ๆ'];
    const BLOOD = ['A','B','AB','O','A+','A-','B+','B-','AB+','AB-','O+','O-'];

    const parentOpts = this.data.parents.map(p =>
      `<option value="${UI.esc(p.id)}"${String(c.parentId) === String(p.id) ? ' selected' : ''}>
        ${UI.esc(p.name)}</option>`).join('');

    return `
      ${this.fgroup('ข้อมูลเด็ก')}
      <div class="field" id="c_parentWrap">
        <label class="field__label" for="c_parentId">ผู้ปกครอง</label>
        <select class="field__input" id="c_parentId">
          <option value="">เลือกผู้ปกครอง</option>${parentOpts}
        </select>
      </div>
      <div class="frow">
        ${this.finput('c_name', 'ชื่อและนามสกุล', c.name, 'ชื่อจริง นามสกุล')}
        ${this.finput('c_nickname', 'ชื่อเล่น', c.nickname)}
      </div>
      <div class="frow">
        ${this.fselect('c_parentRelation', 'ผู้ปกครองเป็นอะไรกับเด็ก', RELATIONS, c.parentRelation, 'ไม่ระบุ')}
        ${this.fselect('c_gender', 'เพศ',
          [['M','ชาย'],['F','หญิง']], c.gender || 'M')}
      </div>
      <div class="frow">
        ${this.finput('c_dob', 'วันเกิด', c.dob, '', 'date')}
        ${this.finput('c_school', 'โรงเรียน', c.school)}
      </div>
      <div class="frow">
        ${this.finput('c_weight', 'น้ำหนัก (กก.)', c.weight, '', 'number')}
        ${this.finput('c_height', 'ส่วนสูง (ซม.)', c.height, '', 'number')}
      </div>
      ${this.finput('c_trainingGoal', 'เป้าหมายการฝึก', c.trainingGoal, 'เช่น เสริมการทรงตัว')}

      ${this.fgroup('ข้อมูลสุขภาพ', 'ผู้ฝึกสอนจะเห็นข้อมูลส่วนนี้เพื่อดูแลเด็กระหว่างฝึก')}
      <div class="frow">
        ${this.fselect('c_bloodType', 'กรุ๊ปเลือด', BLOOD, c.bloodType, 'ไม่ทราบ')}
        ${this.finput('c_medicalConditions', 'โรคประจำตัว', c.medicalConditions, 'เช่น หอบหืด')}
      </div>
      <div class="frow">
        ${this.finput('c_foodAllergy', 'แพ้อาหาร', c.foodAllergy, 'เช่น นมวัว ถั่ว')}
        ${this.finput('c_drugAllergy', 'แพ้ยา', c.drugAllergy, 'เช่น เพนิซิลลิน')}
      </div>
      <div class="frow">
        ${this.finput('c_medications', 'ยาที่ใช้ประจำ', c.medications)}
        ${this.finput('c_physicalLimitation', 'ข้อจำกัดทางร่างกาย', c.physicalLimitation, 'เช่น เลี่ยงการวิ่งนาน')}
      </div>

      ${this.fgroup('ติดต่อฉุกเฉิน')}
      <div class="frow">
        ${this.finput('c_emergencyName', 'ชื่อผู้ติดต่อ', c.emergencyName)}
        ${this.finput('c_emergencyRelation', 'เกี่ยวข้องเป็น', c.emergencyRelation, 'เช่น ย่า')}
      </div>
      <div class="frow">
        ${this.finput('c_emergencyPhone', 'เบอร์ฉุกเฉิน', c.emergencyPhone, '', 'tel')}
        ${this.finput('c_doctorName', 'แพทย์หรือโรงพยาบาล', c.doctorName)}
      </div>
      ${this.finput('c_doctorPhone', 'เบอร์แพทย์', c.doctorPhone, '', 'tel')}

      <div class="field">
        <label class="field__label" for="c_notes">หมายเหตุ</label>
        <textarea class="field__input" id="c_notes" rows="2"
          placeholder="สิ่งที่ผู้ฝึกสอนควรทราบ">${UI.esc(c.notes)}</textarea>
      </div>`;
  },

  readChildFields() {
    const pick = document.getElementById('fam_pick');
    return {
      parentId:           pick ? pick.value : this.val('c_parentId'),
      parentRelation:     this.val('c_parentRelation'),
      name:               this.val('c_name'),
      nickname:           this.val('c_nickname'),
      dob:                this.val('c_dob'),
      gender:             this.val('c_gender'),
      weight:             this.val('c_weight'),
      height:             this.val('c_height'),
      bloodType:          this.val('c_bloodType'),
      medicalConditions:  this.val('c_medicalConditions'),
      foodAllergy:        this.val('c_foodAllergy'),
      drugAllergy:        this.val('c_drugAllergy'),
      medications:        this.val('c_medications'),
      physicalLimitation: this.val('c_physicalLimitation'),
      emergencyName:      this.val('c_emergencyName'),
      emergencyPhone:     this.val('c_emergencyPhone'),
      emergencyRelation:  this.val('c_emergencyRelation'),
      doctorName:         this.val('c_doctorName'),
      doctorPhone:        this.val('c_doctorPhone'),
      school:             this.val('c_school'),
      trainingGoal:       this.val('c_trainingGoal'),
      notes:              this.val('c_notes'),
    };
  },

  // ── ตัวช่วยเล็ก ๆ ─────────────────────────────────────────
  val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  },

  // ผูกปุ่มในกล่องซ้อนด้วย data-act เพื่อไม่ต้องใส่ชื่อลงใน onclick
  // ชื่อคนไทยมีอะพอสทรอฟีได้ ถ้าฝังลง onclick จะทำ HTML พัง
  bindSheet(handlers) {
    document.querySelectorAll('#sheet [data-act]').forEach(b => {
      const fn = handlers[b.dataset.act];
      if (fn) b.onclick = fn;
    });
  },

  finput(id, label, value, placeholder, type) {
    return `<div class="field">
      <label class="field__label" for="${id}">${label}</label>
      <input class="field__input" id="${id}" type="${type || 'text'}"
        value="${UI.esc(value)}" placeholder="${UI.esc(placeholder || '')}">
    </div>`;
  },

  fselect(id, label, options, selected, blank) {
    const opts = options.map(o => {
      const v = Array.isArray(o) ? o[0] : o;
      const t = Array.isArray(o) ? o[1] : o;
      return `<option value="${UI.esc(v)}"${String(selected) === String(v) ? ' selected' : ''}>${UI.esc(t)}</option>`;
    }).join('');

    return `<div class="field">
      <label class="field__label" for="${id}">${label}</label>
      <select class="field__input" id="${id}">
        ${blank ? `<option value="">${UI.esc(blank)}</option>` : ''}${opts}
      </select>
    </div>`;
  },

  fgroup(title, hint) {
    return `<div class="fgroup">
      <h3 class="fgroup__title">${title}</h3>
      ${hint ? `<p class="fhint">${hint}</p>` : ''}
    </div>`;
  },

  row(label, value) {
    return `<p class="pcard__line"><span>${label}</span> ${UI.esc(value)}</p>`;
  },

  section(title, pairs, kind) {
    const rows = pairs
      .filter(([, v]) => String(v || '').trim())
      .map(([k, v]) => `<div class="drow2">
        <span class="drow2__k">${UI.esc(k)}</span>
        <span class="drow2__v">${UI.esc(v)}</span>
      </div>`).join('');

    if (!rows) return '';

    return `<div class="dsection ${kind === 'alert' ? 'dsection--alert' : ''}">
      <h3 class="dsection__title">${title}</h3>${rows}
    </div>`;
  },

  parentOf(child) {
    return this.data.parents.find(p => String(p.id) === String(child.parentId));
  },

  // เรื่องที่ผู้ฝึกสอนต้องรู้ก่อนเริ่มสอน แสดงเป็นป้ายบนการ์ดเลย
  alertsOf(c) {
    const list = [];
    if (c.drugAllergy)        list.push({ kind: 'danger', text: 'แพ้ยา ' + c.drugAllergy });
    if (c.foodAllergy)        list.push({ kind: 'danger', text: 'แพ้อาหาร ' + c.foodAllergy });
    if (c.medicalConditions)  list.push({ kind: 'warn',   text: c.medicalConditions });
    if (c.physicalLimitation) list.push({ kind: 'warn',   text: c.physicalLimitation });
    return list;
  },

  // คำนำหน้าที่คนไทยใช้กันแทบทุกคน ถ้าไม่ตัดออกก่อน
  // ตัวอักษรบนวงกลมจะเป็นตัวเดียวกันหมดจนแยกไม่ออกว่าใครเป็นใคร
  PREFIXES: ['เด็กชาย','เด็กหญิง','นางสาว','ด.ช.','ด.ญ.','น้อง','คุณ','นาย','นาง',
             'แม่','พ่อ','ปู่','ย่า','ตา','ยาย','พี่','ครู'],

  initial(person) {
    let text = String(person.nickname || person.name || '').trim();

    for (let i = 0; i < this.PREFIXES.length; i++) {
      const pre = this.PREFIXES[i];
      // ตัดเฉพาะเมื่อยังเหลือตัวอักษรหลังคำนำหน้า
      if (text.indexOf(pre) === 0 && text.length > pre.length) {
        text = text.slice(pre.length).trim();
        break;
      }
    }

    return text.charAt(0) || '?';
  },

  age(dob) {
    const parts = String(dob).split('-');
    if (parts.length !== 3) return '';

    const born = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const now  = new Date();

    let y = now.getFullYear() - born.getFullYear();
    let m = now.getMonth() - born.getMonth();
    if (now.getDate() < born.getDate()) m--;
    if (m < 0) { y--; m += 12; }

    return y > 0 ? y + ' ปี ' + m + ' เดือน' : m + ' เดือน';
  },

  // โหลดใหม่หลังแก้ไขข้อมูล ต้องล้าง cache ก่อนไม่งั้นได้ของเดิม
  async reload() {
    API.clearCache('getPeople');
    API.clearCache('getLinkableUsers');
    await this.render(document.getElementById('page'));
  },
};

PAGES.people = (el) => People.render(el);
