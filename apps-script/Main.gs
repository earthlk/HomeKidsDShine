// ============================================================
// Little Stars — Main.gs
// จุดรับ request ทั้งหมด + ตารางเส้นทาง action
// ============================================================
//
// รูปแบบผลลัพธ์ที่ส่งกลับ frontend มีแค่สองแบบเท่านั้น:
//   สำเร็จ  → { ok: true,  data: ... }
//   ล้มเหลว → { ok: false, message: 'ข้อความภาษาไทย', code: '...' }
//
// ฝั่ง frontend จึงมีฟังก์ชันเรียก API ตัวเดียว ไม่ต้องมี api()/apiRaw()
// แยกกันแบบเดิมที่ทำให้ error หายไปเงียบ ๆ
// ============================================================

function doGet(e) {
  return json({ ok: true, data: { service: 'Little Stars API', time: nowTH() } });
}

function doPost(e) {
  // frontend ส่งมาเป็น text/plain เพื่อเลี่ยง CORS preflight ที่ GAS ไม่รองรับ
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, message: 'รูปแบบข้อมูลไม่ถูกต้อง', code: 'BAD_JSON' });
  }

  try {
    return json(route(body));
  } catch (err) {
    Logger.log('ERROR [' + body.action + '] ' + err.message + '\n' + err.stack);
    return json({ ok: false, message: err.message || 'ระบบขัดข้อง', code: 'SERVER_ERROR' });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── เส้นทางหลัก ─────────────────────────────────────────────
function route(body) {
  const action  = body.action;
  const payload = body.payload || {};

  // action ที่ไม่ต้องล็อกอิน
  if (action === 'login')  return login(body.email, body.password);
  if (action === 'ping')   return { ok: true, data: { time: nowTH() } };

  // action ที่เหลือต้องมี token ที่ยังไม่หมดอายุ
  const sess = validateToken(body.token);
  if (!sess) {
    return { ok: false, message: 'เซสชันหมดอายุ เข้าสู่ระบบใหม่อีกครั้ง', code: 'UNAUTHORIZED' };
  }

  const handler = ROUTES[action];
  if (!handler) {
    return { ok: false, message: 'ไม่รู้จักคำสั่ง: ' + action, code: 'UNKNOWN_ACTION' };
  }

  // ตรวจสิทธิ์ตาม role ที่กำหนดไว้ในตาราง
  if (handler.roles && handler.roles.indexOf(sess.role) === -1) {
    return { ok: false, message: 'บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้', code: 'FORBIDDEN' };
  }

  return { ok: true, data: handler.fn(sess, payload) };
}

// ── ตารางเส้นทาง ────────────────────────────────────────────
// roles ว่าง = ทุก role ที่ล็อกอินแล้วเรียกได้ (ตัว handler กรองข้อมูลตาม role เอง)
// Phase 1 มีแค่ auth + dashboard เปล่า ๆ — Phase ถัดไปค่อยเพิ่มทีละกลุ่ม
const ROUTES = {
  logout:         { fn: (s)    => logout_(s) },
  getMe:          { fn: (s)    => getMe(s) },
  changePassword: { fn: (s, p) => changePassword(s, p) },
  getDashboard:   { fn: (s)    => getDashboard(s) },
};

// ห่อ logout ให้รับ session แทน token
function logout_(sess) {
  audit(sess.userId, 'LOGOUT', 'user', sess.userId);
  return { success: true };
}

// ── Dashboard (Phase 1 ยังเป็นโครงเปล่า) ────────────────────
// Phase ถัดไปจะเติมตัวเลขจริงเมื่อมีข้อมูลนัดหมายและคอร์สแล้ว
function getDashboard(sess) {
  return {
    role:  sess.role,
    name:  sess.name,
    today: todayTH(),
    cards: [],
  };
}
