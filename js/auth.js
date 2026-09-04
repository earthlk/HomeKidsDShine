// ============================================================
// Homey Kids D Shine — auth.js
// เข้าสู่ระบบ / ออกจากระบบ
// ============================================================

const Auth = {

  // ── วาดหน้าเข้าสู่ระบบ ────────────────────────────────────
  renderSignIn() {
    document.getElementById('root').innerHTML = `
      <div class="signin">
        <div class="signin__inner">
          <div class="signin__mark">${ICON.star}</div>

          <h1 class="signin__title">Homey Kids D Shine</h1>
          <p class="signin__lede">เข้าสู่ระบบเพื่อดูตารางฝึก บันทึกกิจกรรม และติดตามคอร์ส</p>

          <div id="signinError"></div>

          <div class="field">
            <label class="field__label" for="email">อีเมล</label>
            <input class="field__input" type="email" id="email"
              autocomplete="username" placeholder="you@example.com">
          </div>

          <div class="field">
            <label class="field__label" for="password">รหัสผ่าน</label>
            <div class="field__wrap">
              <input class="field__input" type="password" id="password"
                autocomplete="current-password" placeholder="••••••••">
              <button class="field__peek" id="peek" type="button"
                aria-label="แสดงรหัสผ่าน">${ICON.eye}</button>
            </div>
          </div>

          <div class="signin__actions">
            <button class="btn btn--primary btn--block" id="signinBtn">เข้าสู่ระบบ</button>
          </div>

          <p class="signin__foot">ยังไม่มีบัญชี ติดต่อผู้ดูแลศูนย์เพื่อขอเปิดใช้งาน</p>
        </div>
      </div>`;

    document.getElementById('signinBtn').onclick = () => Auth.signIn();
    document.getElementById('peek').onclick = () => Auth.togglePassword();

    // กด Enter ในช่องไหนก็เข้าสู่ระบบได้
    ['email', 'password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') Auth.signIn();
      });
    });

    document.getElementById('email').focus();
  },

  togglePassword() {
    const input = document.getElementById('password');
    const btn   = document.getElementById('peek');
    const show  = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? ICON.eyeOff : ICON.eye;
    btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
  },

  showError(message) {
    document.getElementById('signinError').innerHTML =
      '<div class="notice notice--error">' + UI.esc(message) + '</div>';
  },

  // ── เข้าสู่ระบบ ───────────────────────────────────────────
  async signIn() {
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('signinBtn');

    document.getElementById('signinError').innerHTML = '';

    if (!email || !password) {
      this.showError('กรอกอีเมลและรหัสผ่านให้ครบก่อน');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังตรวจสอบ';

    // เข้าสู่ระบบส่ง email/password ที่ระดับบนสุด ไม่ได้อยู่ใน payload
    // จึงเรียกผ่าน _postLogin แทน API.call ที่ต้องมี token
    const out = await this._postLogin(email, password);

    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';

    if (!out.ok) { this.showError(out.message); return; }

    Store.set({
      token:  out.data.token,
      role:   out.data.role,
      name:   out.data.name,
      userId: out.data.userId,
    });

    App.start();
  },

  // ยิงคำขอเข้าสู่ระบบโดยตรง เพราะโครงสร้าง body ต่างจาก action อื่น
  async _postLogin(email, password) {
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('http') !== 0) {
      return { ok: false, message: 'ยังไม่ได้ตั้งค่า GAS_URL ใน js/config.js' };
    }
    try {
      const res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      if (!res.ok) return { ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (HTTP ' + res.status + ')' };
      return await res.json();
    } catch (err) {
      console.error('[signIn]', err);
      return { ok: false, message: 'เครือข่ายมีปัญหา ลองใหม่อีกครั้ง' };
    }
  },

  // ── ออกจากระบบ ────────────────────────────────────────────
  // silent = true เมื่อเซสชันหมดอายุเอง ไม่ต้องยิงคำขอกลับไป
  async signOut(silent = false) {
    if (!silent) await API.call('logout', {});
    Store.clear();
    API.clearCache();
    this.renderSignIn();
  },
};
