// ============================================================
// Little Stars — app.js
// โครงหน้าแอป เมนูตามสิทธิ์ และตัวจัดการหน้า
// ============================================================

// ── เมนูของแต่ละสิทธิ์ ──────────────────────────────────────
// ลำดับในนี้คือลำดับที่แสดงจริง สี่รายการแรกจะขึ้นบนแท็บล่างของมือถือ
// จึงต้องเรียงรายการที่ใช้บ่อยที่สุดไว้ก่อน
const NAV = {
  admin: [
    { id: 'home',     label: 'ภาพรวม',        icon: 'home' },
    { id: 'calendar', label: 'ตารางนัด',      icon: 'calendar' },
    { id: 'activity', label: 'บันทึกกิจกรรม', icon: 'note' },
    { id: 'people',   label: 'เด็กและผู้ปกครอง', icon: 'people' },
    { id: 'courses',  label: 'คอร์ส',          icon: 'book' },
    { id: 'finance',  label: 'การเงิน',        icon: 'wallet' },
    { id: 'receipt',  label: 'ใบเสร็จ',        icon: 'receipt' },
    { id: 'users',    label: 'ผู้ใช้งาน',      icon: 'gear' },
    { id: 'privacy',  label: 'ข้อมูลส่วนบุคคล', icon: 'shield' },
  ],
  trainer: [
    { id: 'home',     label: 'ภาพรวม',        icon: 'home' },
    { id: 'calendar', label: 'ตารางสอน',      icon: 'calendar' },
    { id: 'activity', label: 'บันทึกกิจกรรม', icon: 'note' },
    { id: 'finance',  label: 'ค่าสอน',        icon: 'wallet' },
  ],
  parent: [
    { id: 'home',     label: 'ภาพรวม',        icon: 'home' },
    { id: 'calendar', label: 'ตารางเรียน',    icon: 'calendar' },
    { id: 'courses',  label: 'คอร์สของเรา',   icon: 'book' },
    { id: 'people',   label: 'ข้อมูลบุตรหลาน', icon: 'people' },
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
        ${ICON[item.icon]}<span>${item.label}</span>
      </button>`).join('');

    document.getElementById('root').innerHTML = `
      <div class="shell">
        <aside class="rail">
          <div class="rail__brand">
            <div class="rail__mark">${ICON.star}</div>
            <div>
              <div class="rail__name">${UI.esc(name)}</div>
              <div class="rail__role">${ROLE_LABEL[role] || role}</div>
            </div>
          </div>
          <nav class="rail__nav">${railLinks}</nav>
          <div class="rail__foot">
            <button class="btn btn--ghost btn--block" id="signoutBtn">
              ${ICON.exit}<span>ออกจากระบบ</span>
            </button>
          </div>
        </aside>

        <div class="main">
          <header class="topbar">
            <h1 class="topbar__title" id="pageTitle">ภาพรวม</h1>
            <span class="topbar__date">${UI.thaiDate(UI.today())}</span>
          </header>
          <main class="page" id="page"></main>
        </div>
      </div>

      <nav class="tabbar">${tabs}</nav>`;

    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.onclick = () => App.go(btn.dataset.page);
    });
    document.getElementById('signoutBtn').onclick = () => Auth.signOut();
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

    const page = document.getElementById('page');
    page.innerHTML = UI.loading();

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

// ── เริ่มทำงาน ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.boot());
