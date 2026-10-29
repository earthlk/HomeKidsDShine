// ============================================================
// Homey Kids D Shine — app.js
// โครงหน้าแอป เมนูตามสิทธิ์ และตัวจัดการหน้า
// ============================================================

// ── เมนูของแต่ละสิทธิ์ ──────────────────────────────────────
// ลำดับในนี้คือลำดับที่แสดงจริง สี่รายการแรกจะขึ้นบนแท็บล่างของมือถือ
// จึงต้องเรียงรายการที่ใช้บ่อยที่สุดไว้ก่อน
//
// short คือป้ายสั้นสำหรับแท็บล่างบนมือถือ ซึ่งกว้างแค่ราวหนึ่งในสี่ของจอ
// ถ้าไม่ใส่จะใช้ label เต็มแล้วข้อความล้นขอบ
const NAV = {
  admin: [
    { id: 'home',     label: 'ภาพรวม',        icon: 'home' },
    { id: 'calendar', label: 'ตารางนัด',      icon: 'calendar' },
    { id: 'activity', label: 'บันทึกกิจกรรม', icon: 'note',   short: 'บันทึก' },
    { id: 'people',   label: 'เด็กและผู้ปกครอง', icon: 'people', short: 'เด็ก' },
    { id: 'trainers', label: 'ผู้ฝึกสอน',      icon: 'whistle' },
    { id: 'courses',  label: 'คอร์ส',          icon: 'book' },
    { id: 'finance',  label: 'การเงิน',        icon: 'wallet' },
    { id: 'receipt',  label: 'ใบเสร็จ',        icon: 'receipt' },
    { id: 'users',    label: 'ผู้ใช้งาน',      icon: 'gear' },
    { id: 'privacy',  label: 'ข้อมูลส่วนบุคคล', icon: 'shield' },
  ],
  trainer: [
    { id: 'home',     label: 'ภาพรวม',        icon: 'home' },
    { id: 'calendar', label: 'ตารางสอน',      icon: 'calendar' },
    { id: 'activity', label: 'บันทึกกิจกรรม', icon: 'note', short: 'บันทึก' },
    { id: 'courses',  label: 'คอร์ส',          icon: 'book' },
    { id: 'finance',  label: 'ค่าสอน',        icon: 'wallet' },
  ],
  parent: [
    { id: 'home',     label: 'ภาพรวม',        icon: 'home' },
    { id: 'calendar', label: 'ตารางเรียน',    icon: 'calendar' },
    { id: 'courses',  label: 'คอร์สของเรา',   icon: 'book' },
    { id: 'activity', label: 'บันทึกการเรียน', icon: 'note', short: 'บันทึก' },
    { id: 'people',   label: 'ข้อมูลบุตรหลาน', icon: 'people', short: 'บุตรหลาน' },
  ],
};

const ROLE_LABEL = {
  admin:   'ผู้ดูแลระบบ',
  trainer: 'ผู้ฝึกสอน',
  parent:  'ผู้ปกครอง',
};

// ── ทะเบียนหน้า ─────────────────────────────────────────────
// Phase ถัดไปเพิ่มหน้าใหม่โดยลงทะเบียนที่นี่ ไม่ต้องแก้ที่อื่น
// ตัวอย่าง: PAGES.people = Pages.people;
const PAGES = {};

const App = {

  current: null,

  // ── เริ่มต้นแอป ───────────────────────────────────────────
  boot() {
    if (Store.get('token')) {
      this.start();
    } else {
      Auth.renderSignIn();
    }
  },

  start() {
    this.renderShell();
    this.go('home');
  },

  // ── วาดโครงหน้า ───────────────────────────────────────────
  renderShell() {
    const role  = Store.get('role');
    const name  = Store.get('name') || '';
    const items = NAV[role] || [];

    const railLinks = items.map(item => `
      <button class="navlink" data-page="${item.id}">
        ${ICON[item.icon]}<span>${item.label}</span>
      </button>`).join('');

    // แท็บล่างแสดงสี่รายการแรกเท่านั้น ที่เหลือเข้าถึงผ่านหน้าภาพรวม
    const tabs = items.slice(0, 4).map(item => `
      <button class="tabbar__item" data-page="${item.id}">
        ${ICON[item.icon]}<span>${item.short || item.label}</span>
      </button>`).join('');

    document.getElementById('root').innerHTML = `
      <div class="shell">
        <aside class="rail">
          <div class="rail__brand">
            <div class="rail__mark">${ICON.brand}</div>
            <div>
              <div class="rail__name">Homey Kids D<span class="rail__shine">Shine</span></div>
              <div class="rail__role">ศูนย์ฝึกเด็กเล็ก</div>
            </div>
          </div>
          <nav class="rail__nav">${railLinks}</nav>
          <div class="rail__foot">
            <button class="rail__user" id="railUser" title="บัญชีของฉัน">
              <div class="rail__avatar">${UI.esc((name || '?').charAt(0))}</div>
              <div style="min-width:0">
                <div class="rail__username">${UI.esc(name)}</div>
                <div class="rail__role">${ROLE_LABEL[role] || role}</div>
              </div>
              <span class="rail__more">${ICON.chevron}</span>
            </button>
          </div>
        </aside>

        <div class="main">
          <header class="topbar">
            <div class="topbar__mark">${ICON.brand}</div>
            <h1 class="topbar__title" id="pageTitle">ภาพรวม</h1>
            <span class="topbar__date">${UI.thaiDate(UI.today())}</span>
            <button class="syncbtn" id="syncBtn" title="โหลดข้อมูลใหม่">
              ${ICON.refresh}<span class="syncbtn__t" id="syncTime"></span>
            </button>
            <button class="topbar__account" id="accountBtn" aria-label="บัญชีของฉัน">
              ${UI.esc((name || '?').charAt(0))}
            </button>
          </header>
          <main class="page" id="page"></main>
        </div>
      </div>

      <nav class="tabbar">${tabs}</nav>`;

    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.onclick = () => App.go(btn.dataset.page);
    });
    document.getElementById('accountBtn').onclick = () => App.openAccount();
    document.getElementById('railUser').onclick    = () => App.openAccount();
    document.getElementById('syncBtn').onclick     = () => Sync.now();
    Sync.start();
  },

  // ── ล้างข้อมูลที่เก็บไว้ทั้งหมด ────────────────────────────
  // เรียกหลังบันทึกทุกครั้ง ข้อมูลชุดหนึ่งมักกระทบอีกหลายหน้า
  // เช่น ลงทะเบียนคอร์สใหม่กระทบทั้งหน้าคอร์ส ตัวเลือกในฟอร์มลงนัด และปฏิทิน
  // ถ้าให้แต่ละหน้านึกเองว่าต้องล้างอะไร จะลืมและได้ข้อมูลเก่าค้างแบบหาสาเหตุยาก
  invalidate() {
    API.clearCache();
    if (typeof Cal !== 'undefined') Cal.meta = null;
  },

  // ── โหลดข้อมูลหน้าปัจจุบันใหม่ ─────────────────────────────
  async refresh() {
    this.invalidate();
    const page = document.getElementById('page');
    if (page && this.current) await this.go(this.current);
  },

  // ── กล่องบัญชีของฉัน ──────────────────────────────────────
  // ทางเข้าสู่การออกจากระบบสำหรับผู้ใช้มือถือ และเมนูที่ไม่ได้อยู่บนแท็บล่าง
  openAccount() {
    const role  = Store.get('role');
    const name  = Store.get('name') || '';
    const items = NAV[role] || [];
    const rest  = window.innerWidth < 768 ? items.slice(4) : [];

    const more = rest.length ? `
      <p style="font-size:var(--t-xs);color:var(--mist);margin-bottom:var(--sp-2)">เมนูอื่น</p>
      <div style="margin-bottom:var(--sp-4)">
        ${rest.map(i => `<button class="navlink" data-jump="${i.id}">
          ${ICON[i.icon]}<span>${i.label}</span></button>`).join('')}
      </div>` : '';

    UI.openSheet(`
      <div class="sheet__title">บัญชีของฉัน</div>
      <div class="rail__user" style="margin-bottom:var(--sp-4)">
        <div class="rail__avatar">${UI.esc(name.charAt(0))}</div>
        <div style="min-width:0">
          <div class="rail__username">${UI.esc(name)}</div>
          <div class="rail__role">${ROLE_LABEL[role] || role}</div>
        </div>
      </div>
      ${more}
      <button class="btn btn--ghost btn--block" id="changePw"
        style="margin-bottom:var(--sp-2)">เปลี่ยนรหัสผ่าน</button>

      <button class="btn btn--ghost btn--block" id="sheetSignout">
        ${ICON.exit}<span>ออกจากระบบ</span>
      </button>`);

    document.querySelectorAll('[data-jump]').forEach(btn => {
      btn.onclick = () => { UI.closeSheet(); App.go(btn.dataset.jump); };
    });
    document.getElementById('changePw').onclick = () => App.openChangePassword();

    document.getElementById('sheetSignout').onclick = () => {
      UI.closeSheet();
      Auth.signOut();
    };
  },

  // ── เปลี่ยนรหัสผ่านของตัวเอง ───────────────────────────────
  // รหัสผ่านเป็นของเจ้าของบัญชีเท่านั้น ผู้ดูแลระบบตั้งให้ไม่ได้
  // จึงต้องยืนยันด้วยรหัสเดิมก่อนเสมอ
  openChangePassword() {
    UI.openSheet(`
      <div class="sheet__title">เปลี่ยนรหัสผ่าน</div>
      ${People.finput('cp_old', 'รหัสผ่านเดิม', '', '', 'password')}
      ${People.finput('cp_new', 'รหัสผ่านใหม่', '', 'อย่างน้อย 8 ตัวอักษร', 'password')}
      ${People.finput('cp_confirm', 'ยืนยันรหัสผ่านใหม่', '', '', 'password')}
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      save: async () => {
        const oldPassword = People.val('cp_old');
        const newPassword = People.val('cp_new');

        if (!oldPassword)                       { UI.toast('กรอกรหัสผ่านเดิมก่อน', 'error'); return; }
        if (newPassword.length < 8)             { UI.toast('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร', 'error'); return; }
        if (newPassword !== People.val('cp_confirm')) { UI.toast('รหัสผ่านใหม่สองช่องไม่ตรงกัน', 'error'); return; }

        const res = await API.call('changePassword', { oldPassword, newPassword });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }

        UI.toast('เปลี่ยนรหัสผ่านแล้ว');
        UI.closeSheet();
      },
    });
  },

  // ── เปลี่ยนหน้า ───────────────────────────────────────────
  go(pageId) {
    const role = Store.get('role');
    const item = (NAV[role] || []).find(i => i.id === pageId);
    if (!item) return;

    this.current = pageId;

    // อัปเดตสถานะเมนูให้ตรงกับหน้าปัจจุบัน
    document.querySelectorAll('[data-page]').forEach(btn => {
      if (btn.dataset.page === pageId) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    document.getElementById('pageTitle').textContent = item.label;

    // กดเปลี่ยนหลายหน้าติดกัน หน้าที่โหลดช้ากว่าอาจตอบกลับมาทีหลัง
    // แล้วเขียนทับหน้าที่ผู้ใช้เลือกล่าสุด
    //
    // แก้โดยสร้างกล่องเนื้อหาใหม่ทุกครั้งที่เปลี่ยนหน้า
    // หน้าเก่ายังถืออ้างอิงกล่องเดิมที่หลุดจากหน้าจอไปแล้ว เขียนลงไปก็ไม่มีใครเห็น
    const stale = document.getElementById('page');
    const page  = document.createElement('main');
    page.id        = 'page';
    page.className = 'page';
    stale.replaceWith(page);

    page.innerHTML = UI.loading();

    if (typeof Sync !== 'undefined') Sync.reset();

    const render = PAGES[pageId];
    if (render) {
      render(page);
    } else {
      // หน้าที่ยังไม่ได้ทำใน Phase นี้
      page.innerHTML = UI.empty(
        item.label,
        'ส่วนนี้ยังอยู่ระหว่างพัฒนา จะเปิดใช้งานใน Phase ถัดไป'
      );
    }
  },
};

// ── หน้าภาพรวม (Phase 1 เป็นโครงตั้งต้น) ────────────────────
PAGES.home = async function (el) {
  const res = await API.call('getDashboard', {});

  if (!res.ok) {
    el.innerHTML = `<div class="card">
      <div class="notice notice--error">${UI.esc(res.message)}</div>
    </div>`;
    return;
  }

  const name = Store.get('name') || '';
  el.innerHTML = `
    <div class="card">
      <h2 style="font-family:var(--font-head);font-size:var(--t-lg);font-weight:600">
        สวัสดี ${UI.esc(name)}
      </h2>
      <p style="color:var(--mist);font-size:var(--t-sm);margin-top:var(--sp-2)">
        ระบบเชื่อมต่อกับฐานข้อมูลเรียบร้อยแล้ว
        ตัวเลขสรุปจะขึ้นที่นี่เมื่อเปิดใช้งานตารางนัดและคอร์สใน Phase ถัดไป
      </p>
    </div>`;
};

// ============================================================
// การซิงก์ข้อมูล
// ============================================================
//
// ข้อมูลถูกเก็บไว้ในเครื่องหลังโหลดครั้งแรก เพื่อให้กดดูรายละเอียด
// ได้ทันทีโดยไม่ต้องรอหลังบ้าน แลกกับความเสี่ยงที่ข้อมูลจะเก่า
// ถ้ามีคนอื่นแก้ไขพร้อมกัน จึงต้องมีทั้งปุ่มกดเองและการโหลดใหม่ตามเวลา
//
const Sync = {

  EVERY: 5 * 60,     // โหลดใหม่ทุกห้านาที
  left:  0,
  timer: null,

  start() {
    this.reset();
    clearInterval(this.timer);
    this.timer = setInterval(() => Sync.tick(), 1000);

    // กลับมาที่แท็บนี้หลังจากไปทำอย่างอื่นนาน ข้อมูลน่าจะเก่าแล้ว
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Sync.left <= 0) Sync.now();
    });
  },

  reset() {
    this.left = this.EVERY;
    this.paint();
  },

  tick() {
    // แท็บที่ซ่อนอยู่ไม่ต้องนับ ผู้ใช้ไม่ได้ดูอยู่
    if (document.hidden) return;

    this.left--;
    this.paint();

    if (this.left <= 0) this.now();
  },

  paint() {
    const el = document.getElementById('syncTime');
    if (!el) return;
    const m = Math.max(0, Math.floor(this.left / 60));
    const s = Math.max(0, this.left % 60);
    el.textContent = m + ':' + String(s).padStart(2, '0');
  },

  async now() {
    const btn = document.getElementById('syncBtn');
    if (!btn) return;

    // ห้ามโหลดทับระหว่างที่ผู้ใช้กำลังกรอกฟอร์มอยู่ ข้อมูลที่พิมพ์จะหาย
    if (document.getElementById('sheet') || UI._busy) {
      this.left = 30;      // เลื่อนไปอีกครึ่งนาทีแล้วค่อยลองใหม่
      return;
    }

    btn.classList.add('is-spinning');
    try {
      await App.refresh();
    } finally {
      btn.classList.remove('is-spinning');
      this.reset();
    }
  },
};

// ── เริ่มทำงาน ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.boot());
