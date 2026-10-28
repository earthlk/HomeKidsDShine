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
          <div class="signin__mark">${ICON.brand}</div>

          <h1 class="signin__title">Homey Kids D<span class="signin__shine">Shine</span></h1>
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

          <p class="signin__alt">
            <button type="button" class="linkbtn" id="forgotBtn">ลืมรหัสผ่าน</button>
          </p>

          <p class="signin__foot">ยังไม่มีบัญชี ติดต่อผู้ดูแลศูนย์เพื่อขอเปิดใช้งาน</p>
        </div>
      </div>`;

    document.getElementById('signinBtn').onclick = () => Auth.signIn();
    document.getElementById('peek').onclick = () => Auth.togglePassword();
    document.getElementById('forgotBtn').onclick = () => Auth.renderForgot();

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

    // UI.run ปิดปุ่มและแสดงตัวหมุนระหว่างรอ กันการกดซ้ำระหว่างที่ยังไม่ตอบ
    await UI.run(btn, 'กำลังตรวจสอบ', async () => {
      // เข้าสู่ระบบส่ง email/password ที่ระดับบนสุด ไม่ได้อยู่ใน payload
      // จึงเรียกผ่าน _postLogin แทน API.call ที่ต้องมี token
      const out = await Auth._postLogin(email, password);

      if (!out.ok) { Auth.showError(out.message); return; }

      Store.set({
        token:  out.data.token,
        role:   out.data.role,
        name:   out.data.name,
        userId: out.data.userId,
      });

      App.start();
    });
  },

  // ยิงคำขอเข้าสู่ระบบโดยตรง เพราะโครงสร้าง body ต่างจาก action อื่น
  async _postLogin(email, password) {
    return this._post({ action: 'login', email, password });
  },

  // คำขอที่ยังไม่มี session — เข้าสู่ระบบ และยืนยันอีเมล
  // ใช้ fetch ตัวนี้ร่วมกัน ไม่เขียนซ้ำหลายที่
  async _post(body) {
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('http') !== 0) {
      return { ok: false, message: 'ยังไม่ได้ตั้งค่า GAS_URL ใน js/config.js' };
    }
    try {
      const res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (HTTP ' + res.status + ')' };
      return await res.json();
    } catch (err) {
      console.error('[' + body.action + ']', err);
      return { ok: false, message: 'เครือข่ายมีปัญหา ลองใหม่อีกครั้ง' };
    }
  },

  // ── ลืมรหัสผ่าน ───────────────────────────────────────────
  // กรอกอีเมลแล้วระบบส่งลิงก์ตั้งรหัสใหม่ไปให้ ลิงก์อายุ 1 ชั่วโมง
  renderForgot(prefill) {
    document.getElementById('root').innerHTML = `
      <div class="signin">
        <div class="signin__inner">
          <div class="signin__mark">${ICON.brand}</div>
          <h1 class="signin__title">Homey Kids D<span class="signin__shine">Shine</span></h1>
          <p class="signin__lede">กรอกอีเมลที่ใช้เข้าระบบ แล้วเราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p>

          <div id="forgotBox"></div>

          <div class="field">
            <label class="field__label" for="femail">อีเมล</label>
            <input class="field__input" type="email" id="femail"
              autocomplete="username" placeholder="you@example.com"
              value="${UI.esc(prefill || '')}">
          </div>

          <div class="signin__actions">
            <button class="btn btn--primary btn--block" id="sendResetBtn">ส่งลิงก์ตั้งรหัสใหม่</button>
          </div>

          <p class="signin__alt">
            <button type="button" class="linkbtn" id="backBtn">กลับไปหน้าเข้าสู่ระบบ</button>
          </p>
        </div>
      </div>`;

    document.getElementById('sendResetBtn').onclick = () => Auth.submitForgot();
    document.getElementById('backBtn').onclick = () => Auth.renderSignIn();
    document.getElementById('femail').addEventListener('keydown', e => {
      if (e.key === 'Enter') Auth.submitForgot();
    });
    document.getElementById('femail').focus();
  },

  async submitForgot() {
    const email = document.getElementById('femail').value.trim();
    const btn   = document.getElementById('sendResetBtn');
    const box   = document.getElementById('forgotBox');

    box.innerHTML = '';

    if (!email || email.indexOf('@') < 1) {
      box.innerHTML = '<div class="notice notice--error">กรอกอีเมลให้ถูกต้องก่อน</div>';
      return;
    }

    await UI.run(btn, 'กำลังส่ง', async () => {
      const out = await Auth._post({ action: 'requestReset', email });

      if (!out.ok) {
        box.innerHTML = '<div class="notice notice--error">' + UI.esc(out.message) + '</div>';
        return;
      }

      // หลังบ้านตอบข้อความเดียวกันเสมอ ไม่บอกว่ามีอีเมลนี้ในระบบหรือไม่
      // หน้าเว็บจึงต้องไม่เดาต่อเองว่าส่งสำเร็จหรือไม่สำเร็จ
      //
      // เปลี่ยนทั้งหน้าแทนการปิดปุ่มไว้เฉย ๆ เพราะ UI.run จะคืนสภาพปุ่มให้เองตอนจบ
      // ปุ่มที่ปิดไว้ในนี้จึงกลับมากดได้อีก กลายเป็นกดส่งซ้ำได้ไม่จำกัด
      Auth.renderForgotSent(email, out.data.message);
    });
  },

  renderForgotSent(email, message) {
    document.getElementById('root').innerHTML = `
      <div class="signin">
        <div class="signin__inner">
          <div class="signin__mark">${ICON.brand}</div>
          <h1 class="signin__title">Homey Kids D<span class="signin__shine">Shine</span></h1>

          <div class="notice notice--info">${UI.esc(message)}</div>

          <div class="invite__who">
            <span class="invite__who-name">ส่งไปที่</span>
            <span class="invite__who-mail">${UI.esc(email)}</span>
          </div>

          <p class="signin__foot">
            ลิงก์ใช้ได้ภายใน 1 ชั่วโมง ถ้ารอสักพักแล้วยังไม่ได้รับ
            ลองตรวจโฟลเดอร์จดหมายขยะ หรือแจ้งผู้ดูแลศูนย์
          </p>

          <div class="signin__actions">
            <button class="btn btn--ghost btn--block" id="backBtn">กลับไปหน้าเข้าสู่ระบบ</button>
          </div>
        </div>
      </div>`;

    document.getElementById('backBtn').onclick = () => Auth.renderSignIn();
  },

  // ── ยืนยันอีเมลและตั้งรหัสผ่านครั้งแรก ────────────────────
  // เข้าหน้านี้จากลิงก์ในอีเมล ?invite=... ไม่ได้ผ่านหน้าเข้าสู่ระบบ
  async renderInvite(token) {
    this._invite = token;

    document.getElementById('root').innerHTML = `
      <div class="signin">
        <div class="signin__inner">
          <div class="signin__mark">${ICON.brand}</div>
          <h1 class="signin__title">Homey Kids D<span class="signin__shine">Shine</span></h1>
          <div id="inviteBody">${UI.loading('กำลังตรวจลิงก์ยืนยัน')}</div>
        </div>
      </div>`;

    const res = await this._post({ action: 'checkInvite', invite: token });
    const box = document.getElementById('inviteBody');

    if (!res.ok) {
      box.innerHTML = `
        <div class="notice notice--error">${UI.esc(res.message)}</div>
        <div class="signin__actions">
          <button class="btn btn--ghost btn--block" id="toSignin">ไปหน้าเข้าสู่ระบบ</button>
        </div>`;
      document.getElementById('toSignin').onclick = () => Auth.leaveInvite();
      return;
    }

    // ลิงก์ลืมรหัสกับลิงก์เปิดบัญชีใช้หน้าเดียวกัน ต่างกันแค่ข้อความ
    // หลังบ้านเป็นคนบอก mode มา ไม่ได้เดาจากชื่อพารามิเตอร์ใน URL
    const me    = res.data;
    const reset = me.mode === 'reset';
    this._mode  = me.mode;

    box.innerHTML = `
      <p class="signin__lede">${reset
        ? 'ตั้งรหัสผ่านใหม่ของคุณ รหัสเดิมจะใช้ไม่ได้ทันทีที่ตั้งเสร็จ'
        : 'ตั้งรหัสผ่านของคุณเพื่อเปิดใช้งานบัญชี'}</p>

      <div class="invite__who">
        <span class="invite__who-name">${UI.esc(me.name)}</span>
        <span class="invite__who-mail">${UI.esc(me.email)}</span>
      </div>

      <div id="inviteError"></div>

      <div class="field">
        <label class="field__label" for="ipw">รหัสผ่านใหม่</label>
        <div class="field__wrap">
          <input class="field__input" type="password" id="ipw"
            autocomplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร">
          <button class="field__peek" id="ipeek" type="button"
            aria-label="แสดงรหัสผ่าน">${ICON.eye}</button>
        </div>
      </div>

      <div class="field">
        <label class="field__label" for="ipw2">พิมพ์รหัสผ่านอีกครั้ง</label>
        <input class="field__input" type="password" id="ipw2"
          autocomplete="new-password" placeholder="••••••••">
      </div>

      <div class="signin__actions">
        <button class="btn btn--primary btn--block" id="inviteBtn">
          ${reset ? 'ตั้งรหัสผ่านใหม่และเข้าใช้งาน' : 'ตั้งรหัสผ่านและเข้าใช้งาน'}
        </button>
      </div>

      <p class="signin__foot">รหัสนี้มีแค่คุณที่รู้ ผู้ดูแลศูนย์มองไม่เห็น</p>`;

    document.getElementById('ipeek').onclick = () => {
      const input = document.getElementById('ipw');
      const btn   = document.getElementById('ipeek');
      const show  = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICON.eyeOff : ICON.eye;
      btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    };

    ['ipw', 'ipw2'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') Auth.submitInvite();
      });
    });

    document.getElementById('inviteBtn').onclick = () => Auth.submitInvite();
    document.getElementById('ipw').focus();
  },

  async submitInvite() {
    const pw      = document.getElementById('ipw').value;
    const confirm = document.getElementById('ipw2').value;
    const btn     = document.getElementById('inviteBtn');
    const err     = document.getElementById('inviteError');

    err.innerHTML = '';

    const show = (msg) => {
      err.innerHTML = '<div class="notice notice--error">' + UI.esc(msg) + '</div>';
    };

    if (pw.length < 8)  { show('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'); return; }
    if (pw !== confirm) { show('รหัสผ่านสองช่องไม่ตรงกัน'); return; }

    await UI.run(btn, 'กำลังตั้งรหัสผ่าน', async () => {
      const out = await Auth._post({
        action:   'acceptInvite',
        invite:   Auth._invite,
        password: pw,
        confirm:  confirm,
      });

      if (!out.ok) { show(out.message); return; }

      // ยืนยันแล้วเข้าสู่ระบบให้เลย ไม่ต้องให้พิมพ์รหัสที่เพิ่งตั้งอีกรอบ
      Store.set({
        token:  out.data.token,
        role:   out.data.role,
        name:   out.data.name,
        userId: out.data.userId,
      });

      Auth._clearInviteUrl();
      UI.toast(Auth._mode === 'reset' ? 'ตั้งรหัสผ่านใหม่แล้ว' : 'ยืนยันอีเมลแล้ว ยินดีต้อนรับ');
      App.start();
    });
  },

  // ออกจากหน้ายืนยันไปหน้าเข้าสู่ระบบ โดยลบ token ออกจาก URL ก่อน
  // ไม่งั้นกดรีเฟรชแล้วจะเด้งกลับมาหน้ายืนยันเดิมซ้ำไม่จบ
  leaveInvite() {
    this._clearInviteUrl();
    this.renderSignIn();
  },

  _clearInviteUrl() {
    this._invite = null;
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      // บางเบราว์เซอร์ในโหมดส่วนตัวห้ามแก้ประวัติ ปล่อยผ่าน ไม่ใช่เรื่องคอขาดบาดตาย
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
