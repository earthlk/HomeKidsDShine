// ============================================================
// Little Stars — Auth.gs
// ล็อกอิน / session / สิทธิ์
// ============================================================

// ── เข้ารหัสรหัสผ่าน ────────────────────────────────────────
function hashPassword(pw) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(pw), Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ── ล็อกอินด้วยอีเมล + รหัสผ่าน ─────────────────────────────
function login(email, password) {
  if (!email || !password) {
    return { ok: false, message: 'กรอกอีเมลและรหัสผ่านให้ครบก่อน' };
  }

  const target = String(email).trim().toLowerCase();
  const hash   = hashPassword(password);
  const user   = readAll(SHEET.USERS)
    .find(u => String(u.email).trim().toLowerCase() === target);

  if (!user || String(user.password).trim() !== hash) {
    return { ok: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
  }
  if (!isTrue(user.active)) {
    return { ok: false, message: 'บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ' };
  }

  return { ok: true, data: createSession(user) };
}

// ── สร้าง session ───────────────────────────────────────────
// เก็บสองที่: CacheService (เร็ว) + ScriptProperties (ไม่หายกลางคัน)
// CacheService ของ GAS ลบข้อมูลทิ้งได้ตลอดเมื่อหน่วยความจำเต็ม
// ถ้าเก็บที่เดียวผู้ใช้จะโดนเตะออกแบบไม่มีสาเหตุ
function createSession(user) {
  const token = Utilities.getUuid().replace(/-/g, '');
  const sess  = {
    userId:  user.id,
    role:    user.role,
    name:    user.name,
    email:   user.email,
    expires: Date.now() + SESSION_TTL * 1000,
  };
  const raw = JSON.stringify(sess);

  CacheService.getScriptCache().put('s_' + token, raw, SESSION_TTL);
  PropertiesService.getScriptProperties().setProperty('s_' + token, raw);

  audit(user.id, 'LOGIN', 'user', user.id);
  return { token, role: user.role, name: user.name, userId: user.id };
}

// ── ตรวจ token ──────────────────────────────────────────────
function validateToken(token) {
  if (!token) return null;

  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  let raw = cache.get('s_' + token);

  if (!raw) {
    raw = props.getProperty('s_' + token);
    if (!raw) return null;
    cache.put('s_' + token, raw, SESSION_TTL);   // ดึงกลับเข้า cache
  }

  const sess = JSON.parse(raw);
  if (Date.now() > sess.expires) {
    cache.remove('s_' + token);
    props.deleteProperty('s_' + token);
    return null;
  }

  // ต่ออายุทุกครั้งที่ใช้งาน
  sess.expires = Date.now() + SESSION_TTL * 1000;
  const updated = JSON.stringify(sess);
  cache.put('s_' + token, updated, SESSION_TTL);
  props.setProperty('s_' + token, updated);

  return sess;
}

function logout(token) {
  CacheService.getScriptCache().remove('s_' + token);
  PropertiesService.getScriptProperties().deleteProperty('s_' + token);
  return { ok: true };
}

// ลบ session ที่หมดอายุออกจาก ScriptProperties
// ตั้ง time-based trigger รันวันละครั้งได้
function cleanExpiredSessions() {
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  let removed = 0;

  Object.keys(all).forEach(key => {
    if (key.indexOf('s_') !== 0) return;
    try {
      if (Date.now() > JSON.parse(all[key]).expires) {
        props.deleteProperty(key);
        removed++;
      }
    } catch (e) {
      props.deleteProperty(key);
      removed++;
    }
  });
  Logger.log('ลบ session หมดอายุ ' + removed + ' รายการ');
}

// ── เปลี่ยนรหัสผ่านของตัวเอง ────────────────────────────────
function changePassword(sess, p) {
  const user = readOne(SHEET.USERS, sess.userId);
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');
  if (String(user.password).trim() !== hashPassword(p.oldPassword)) {
    throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  }
  if (!p.newPassword || String(p.newPassword).length < 8) {
    throw new Error('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');
  }
  updateRow(SHEET.USERS, { id: sess.userId, password: hashPassword(p.newPassword) });
  audit(sess.userId, 'CHANGE_PASSWORD', 'user', sess.userId);
  return { success: true };
}

// ── ข้อมูลผู้ใช้ปัจจุบัน (เรียกตอนเปิดแอป) ──────────────────
function getMe(sess) {
  const user = readOne(SHEET.USERS, sess.userId);
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');
  return {
    userId: user.id,
    name:   user.name,
    email:  user.email,
    phone:  user.phone,
    role:   user.role,
  };
}

// ── helper ──────────────────────────────────────────────────
// ค่า TRUE ในชีตอาจมาเป็น boolean, "TRUE", "true" หรือ 1 แล้วแต่ format ของ cell
function isTrue(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}
