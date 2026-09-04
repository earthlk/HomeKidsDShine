// ============================================================
// Little Stars — api.js
// ตัวเรียก backend ตัวเดียวของทั้งระบบ
// ============================================================
//
// กฎที่ต้องรักษาไว้: มีฟังก์ชันเรียก API แค่ตัวเดียว และมันไม่เคย
// กลืน error ทิ้ง ผลลัพธ์คืน { ok, data, message, code } เสมอ
// ผู้เรียกต้องเช็ค res.ok ก่อนใช้ res.data ทุกครั้ง
//
// ระบบเดิมมี api() กับ apiRaw() คู่กัน ตัวแรกแปลง error เป็น []
// ทำให้บันทึกไม่สำเร็จแต่ขึ้นข้อความว่าสำเร็จ — ห้ามเกิดซ้ำ
// ============================================================

const API = {

  // เก็บผลลัพธ์ที่ไม่ค่อยเปลี่ยน เพื่อไม่ยิงซ้ำทุกครั้งที่เปลี่ยนหน้า
  _cache: {},

  async call(action, payload = {}) {
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('http') !== 0) {
      return { ok: false, message: 'ยังไม่ได้ตั้งค่า GAS_URL ใน js/config.js', code: 'NO_URL' };
    }

    const body = {
      action,
      payload,
      token: Store.get('token') || '',
    };

    try {
      // ใช้ text/plain เพื่อเลี่ยง CORS preflight ที่ GAS Web App ไม่รองรับ
      const res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        return { ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (HTTP ' + res.status + ')', code: 'HTTP' };
      }

      const out = await res.json();

      // เซสชันหมดอายุ — พากลับไปหน้าเข้าสู่ระบบ
      if (out.code === 'UNAUTHORIZED') {
        UI.toast(out.message, 'error');
        setTimeout(() => Auth.signOut(true), 1200);
      }

      return out;

    } catch (err) {
      console.error('[API]', action, err);
      return { ok: false, message: 'เครือข่ายมีปัญหา ลองใหม่อีกครั้ง', code: 'NETWORK' };
    }
  },

  // เรียกแล้วเก็บผลไว้ ครั้งต่อไปใช้ของเดิม
  async cached(action, payload = {}) {
    const key = action + ':' + JSON.stringify(payload);
    if (this._cache[key]) return this._cache[key];

    const res = await this.call(action, payload);
    if (res.ok) this._cache[key] = res;
    return res;
  },

  // ล้าง cache หลังแก้ไขข้อมูล
  clearCache(prefix) {
    if (!prefix) { this._cache = {}; return; }
    Object.keys(this._cache).forEach(k => {
      if (k.indexOf(prefix) === 0) delete this._cache[k];
    });
  },
};

// ── ที่เก็บข้อมูลเซสชันในเบราว์เซอร์ ─────────────────────────
const Store = {
  _data: null,

  _load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(sessionStorage.getItem(CONFIG.STORE_KEY)) || {};
    } catch (e) {
      this._data = {};
    }
    return this._data;
  },

  get(key)       { return this._load()[key]; },
  all()          { return this._load(); },

  set(obj) {
    const data = Object.assign(this._load(), obj);
    this._data = data;
    sessionStorage.setItem(CONFIG.STORE_KEY, JSON.stringify(data));
  },

  clear() {
    this._data = null;
    sessionStorage.removeItem(CONFIG.STORE_KEY);
  },
};
