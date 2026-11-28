// ============================================================
// Homey Kids D Shine — Setup.gs
// รันครั้งเดียวตอนติดตั้ง ไม่ใช่ส่วนของระบบที่ทำงานประจำ
// ============================================================
//
// ลำดับการรัน:
//   1. createNewSpreadsheet()   → ได้ ID ชีตใหม่ เอาไปใส่ใน Config.gs
//   2. setupWizard()            → สร้างบัญชีผู้ดูแลระบบตัวแรกจากอีเมลของคุณเอง
//   3. removeDefaultAdmin()     → ลบบัญชีทดสอบ admin@homeykids.com ทิ้ง
//                                 รันหลังจากเข้าใช้งานด้วยบัญชีจริงได้แล้วเท่านั้น
//
// ============================================================

// ── ขั้นที่ 1: สร้าง Spreadsheet ใหม่พร้อมทุกชีต ────────────
function createNewSpreadsheet() {
  const ss = SpreadsheetApp.create('Homey Kids D Shine — ฐานข้อมูล');

  Object.keys(SCHEMA).forEach((name, i) => {
    // ชีตแรกใช้ Sheet1 ที่มีอยู่แล้ว เปลี่ยนชื่อแทนการสร้างใหม่
    const existing = i === 0 ? ss.getSheets()[0].setName(name) : null;
    makeSheet(ss, name, existing);
  });

  Logger.log('════════════════════════════════════');
  Logger.log('สร้างชีตใหม่เรียบร้อย');
  Logger.log('ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
  Logger.log('');
  Logger.log('→ เอา ID ข้างบนไปใส่ในตัวแปร SPREADSHEET_ID ใน Config.gs');
  Logger.log('→ แล้วรัน setupWizard() ต่อ');
  Logger.log('════════════════════════════════════');
}

// ── ขั้นที่ 2: สร้างบัญชีผู้ดูแลระบบตัวแรก ──────────────────
//
// ปัญหาไก่กับไข่: ผู้ใช้ทุกคนอยู่ในชีต การจะเพิ่มผู้ใช้ต้องล็อกอินก่อน
// แต่ยังไม่มีใครให้ล็อกอินเลย จึงต้องมีทางเข้าหนึ่งทางที่ไม่ผ่านหน้าเว็บ
//
// ทางนั้นคือตรงนี้ และใช้อีเมลของบัญชี Google ที่กดรันฟังก์ชันนี้
// ไม่ใช่อีเมลสมมุติที่เขียนไว้ในโค้ด ด้วยเหตุผลสองข้อ
//   1. คนที่เปิดโปรเจ็กต์ Apps Script นี้ได้ คือคนที่เข้าถึงชีตทั้งใบได้อยู่แล้ว
//      การให้สิทธิ์ผู้ดูแลระบบกับคนคนนั้นจึงไม่ได้เพิ่มความเสี่ยงอะไรใหม่
//   2. อีเมลจริงหมายความว่า "ลืมรหัสผ่าน" ใช้งานได้จริง
//      อีเมลสมมุติไม่มีใครรับจดหมายได้ ถ้าลืมรหัสคือล็อกตัวเองออกถาวร
//
// ไม่ตั้งรหัสผ่านให้ ออกเป็นลิงก์ตั้งรหัสแบบเดียวกับที่เชิญผู้ใช้คนอื่น
// เจ้าตัวตั้งรหัสเอง ระบบจึงไม่เคยมีรหัสผ่านที่ใครอื่นรู้มาก่อน
function setupWizard() {
  const email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw new Error('อ่านอีเมลของบัญชีที่รันสคริปต์ไม่ได้ ' +
      'ลองกดรันใหม่แล้วกดอนุญาตสิทธิ์ให้ครบ');
  }
  if (String(SITE_URL).indexOf('http') !== 0) {
    throw new Error('ตั้งค่า SITE_URL ใน Config.gs ให้เป็นที่อยู่หน้าเว็บก่อน ' +
      'ไม่งั้นลิงก์ตั้งรหัสผ่านจะพาไปผิดที่');
  }

  const all   = readAll(SHEET.USERS);
  const admins = all.filter(u => u.role === ROLE.ADMIN && isTrue(u.active));
  let   user   = all.find(u => String(u.email).trim().toLowerCase() === email);

  if (user) {
    // มีบัญชีอยู่แล้ว ยกระดับเป็นผู้ดูแลระบบและออกลิงก์ตั้งรหัสใหม่
    // เส้นทางนี้คือทางออกตอนล็อกตัวเองออกจากระบบด้วย
    updateRow(SHEET.USERS, { id: user.id, role: ROLE.ADMIN, active: true });
    user = Object.assign({}, user, { role: ROLE.ADMIN, active: true });
    Logger.log('อีเมลนี้มีบัญชีอยู่แล้ว ยกระดับเป็นผู้ดูแลระบบและออกลิงก์ตั้งรหัสใหม่');
  } else {
    user = insertRow(SHEET.USERS, {
      email:    email,
      password: '',
      role:     ROLE.ADMIN,
      name:     'ผู้ดูแลระบบ',
      phone:    '',
      active:   true,
      lineUserId: '', googleId: '',
      verified: false, inviteToken: '', inviteExpires: '',
    });
  }

  const invite = issueInvite(user);

  Logger.log('════════════════════════════════════');
  Logger.log('บัญชีผู้ดูแลระบบ: ' + email);
  Logger.log(invite.sent
    ? 'ส่งลิงก์ตั้งรหัสผ่านไปที่อีเมลนี้แล้ว เปิดกล่องจดหมายได้เลย'
    : 'ส่งอีเมลไม่สำเร็จ ใช้ลิงก์ข้างล่างนี้แทน');
  Logger.log('ลิงก์ตั้งรหัสผ่าน: ' + invite.link);
  Logger.log('ลิงก์หมดอายุ: ' + invite.expires);

  if (admins.length) {
    Logger.log('');
    Logger.log('⚠ มีผู้ดูแลระบบอยู่ก่อนแล้ว ' + admins.length + ' บัญชี: ' +
      admins.map(u => u.email).join(', '));
  }
  const fake = all.find(u =>
    String(u.email).trim().toLowerCase() === 'admin@homeykids.com');
  if (fake) {
    Logger.log('');
    Logger.log('⚠ ยังมีบัญชีทดสอบ admin@homeykids.com อยู่ ' +
      'รหัสผ่านของบัญชีนี้เคยอยู่ในโค้ดที่เปิดสาธารณะ');
    Logger.log('→ เข้าใช้งานด้วยบัญชีจริงให้ได้ก่อน แล้วรัน removeDefaultAdmin()');
  }
  Logger.log('════════════════════════════════════');
}

// ── ขั้นที่ 3: ลบบัญชีทดสอบทิ้ง ─────────────────────────────
// แยกเป็นคนละฟังก์ชันโดยตั้งใจ ไม่ลบให้อัตโนมัติตอน setupWizard
// เพราะถ้าลิงก์ตั้งรหัสไปไม่ถึงอีเมลจริง บัญชีทดสอบคือทางเข้าทางเดียวที่เหลือ
// ต้องเข้าใช้งานด้วยบัญชีจริงให้สำเร็จก่อน ถึงจะทิ้งบันไดเส้นเก่าได้
function removeDefaultAdmin() {
  const EMAIL = 'admin@homeykids.com';
  const all   = readAll(SHEET.USERS);
  const fake  = all.find(u => String(u.email).trim().toLowerCase() === EMAIL);

  if (!fake) {
    Logger.log('ไม่มีบัญชี ' + EMAIL + ' อยู่แล้ว ไม่ต้องทำอะไร');
    return;
  }

  // ต้องเหลือผู้ดูแลระบบที่ "ล็อกอินได้จริง" ไม่ใช่แค่มีแถวอยู่ในชีต
  // บัญชีที่สร้างจาก setupWizard แล้วยังไม่ได้กดลิงก์ตั้งรหัส จะไม่มีรหัสผ่าน
  // ถ้านับบัญชีแบบนั้นว่าใช้ได้ แล้วลบบัญชีทดสอบทิ้ง คือล็อกตัวเองออกทั้งระบบ
  const others = all.filter(u =>
    u.role === ROLE.ADMIN && isTrue(u.active) &&
    String(u.password || '').trim() && String(u.id) !== String(fake.id));

  if (!others.length) {
    throw new Error('ลบไม่ได้ เพราะจะไม่เหลือผู้ดูแลระบบที่เข้าใช้งานได้เลย ' +
      'รัน setupWizard() กดลิงก์ตั้งรหัสผ่าน และเข้าสู่ระบบให้สำเร็จก่อน');
  }

  revokeSessions(fake.id);
  deleteRow(SHEET.USERS, fake.id);

  Logger.log('ลบบัญชีทดสอบ ' + EMAIL + ' แล้ว');
  Logger.log('ผู้ดูแลระบบที่เหลือ: ' + others.map(u => u.email).join(', '));
}

// ── เติมคอลัมน์ที่ขาด ───────────────────────────────────────
// รันเมื่ออัปเดตโค้ดแล้ว checkSetup แจ้งว่าชีตขาดคอลัมน์
// เพิ่มต่อท้ายเท่านั้น ไม่แตะคอลัมน์เดิม ข้อมูลที่มีอยู่จึงไม่เลื่อน
function repairSheets() {
  let added = 0;
  let made  = 0;

  Object.keys(SCHEMA).forEach(name => {
    let sheet = getSS().getSheetByName(name);

    // ชีตใหม่ที่เพิ่มเข้ามาทีหลัง เช่น Payouts ของ Phase 6
    // สร้างให้เลย ไม่ต้องไปรัน createNewSpreadsheet ซึ่งสร้างไฟล์ใหม่ทั้งไฟล์
    if (!sheet) {
      sheet = makeSheet(getSS(), name);
      made++;
      Logger.log('สร้างชีตใหม่: ' + name);
      return;   // สร้างพร้อมหัวคอลัมน์ครบแล้ว ไม่ต้องตรวจต่อ
    }

    const lastCol = sheet.getLastColumn();
    const headers = lastCol
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim())
      : [];

    const missing = SCHEMA[name].filter(h => headers.indexOf(h) === -1);
    if (!missing.length) return;

    missing.forEach((h, i) => {
      sheet.getRange(1, lastCol + i + 1)
        .setValue(h)
        .setFontWeight('bold')
        .setFontColor('#FFFFFF')
        .setBackground('#A96246');
    });

    added += missing.length;
    Logger.log('เพิ่มใน ' + name + ': ' + missing.join(', '));
  });

  if (!made && !added) Logger.log('ชีตและคอลัมน์ครบอยู่แล้ว ไม่มีอะไรต้องซ่อม');
  else Logger.log('สร้างชีตใหม่ ' + made + ' ชีต · เพิ่มคอลัมน์ ' + added + ' คอลัมน์');
}

// ── สร้างชีตหนึ่งชีตพร้อมหัวคอลัมน์ตาม SCHEMA ───────────────
// ใช้ร่วมกันระหว่าง createNewSpreadsheet กับ repairSheets
// เขียนที่เดียว หัวตารางของชีตใหม่จะได้หน้าตาเหมือนของเดิมเสมอ
function makeSheet(ss, name, existing) {
  const headers = SCHEMA[name];
  if (!headers) throw new Error('ไม่มี schema ของชีต: ' + name);

  const sheet = existing || ss.insertSheet(name);

  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setFontColor('#FFFFFF')
    .setBackground('#A96246');

  sheet.setFrozenRows(1);

  // ตัดคอลัมน์ว่างที่เกินออก ให้ getLastColumn() คืนค่าตรงกับ schema
  if (sheet.getMaxColumns() > headers.length) {
    sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length);
  }

  // ตั้งรูปแบบคอลัมน์เบอร์โทรและเลขบัญชีเป็นข้อความตั้งแต่ต้น
  // กันชีตแปลงเป็นตัวเลขแล้วตัดศูนย์หน้าทิ้ง
  headers.forEach((h, i) => {
    if (isTextyField(h)) sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  });

  return sheet;
}

// ── ซ่อมเบอร์โทรที่ศูนย์หน้าหายไปแล้ว ───────────────────────
// รันครั้งเดียวหลังอัปเดตโค้ด แก้ทั้งรูปแบบคอลัมน์และค่าที่เสียไปแล้ว
function repairPhoneNumbers() {
  let fixed = 0;

  Object.keys(SCHEMA).forEach(name => {
    const sheet = getSS().getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;

    const headers = SCHEMA[name];
    headers.forEach((h, i) => {
      if (!isTextyField(h)) return;

      const col   = i + 1;
      const range = sheet.getRange(2, col, sheet.getLastRow() - 1, 1);
      const vals  = range.getValues();
      let touched = false;

      const out = vals.map(r => {
        const v = r[0];
        if (typeof v === 'number' && v !== '') { touched = true; fixed++; return [fixTexty(h, v)]; }
        return [v === null || v === undefined ? '' : String(v)];
      });

      range.setNumberFormat('@');      // ตั้งรูปแบบทั้งคอลัมน์ กันเสียซ้ำ
      if (touched) range.setValues(out);
    });
  });

  Logger.log(fixed ? 'ซ่อมเบอร์และเลขภาษี ' + fixed + ' ช่อง' : 'ไม่มีค่าที่ต้องซ่อม');
}

// ── ติ๊กว่าบัญชีเดิมยืนยันอีเมลแล้ว ─────────────────────────
// บัญชีที่สร้างก่อนมีระบบยืนยันอีเมลจะไม่มีค่าในคอลัมน์ verified
// ตัวระบบไม่พังเพราะ isVerified() ถือว่าบัญชีที่มีรหัสผ่านคือยืนยันแล้ว
// แต่รันตัวนี้ครั้งเดียวจะทำให้ป้ายในหน้าผู้ใช้งานตรงกับความจริงทุกแถว
function backfillVerified() {
  const rows = readAll(SHEET.USERS);
  let marked = 0;

  rows.forEach(u => {
    if (isTrue(u.verified)) return;
    if (!String(u.password || '').trim()) return;   // ยังไม่ตั้งรหัส ปล่อยไว้
    updateRow(SHEET.USERS, { id: u.id, verified: true });
    marked++;
  });

  Logger.log(marked ? 'ติ๊กว่ายืนยันแล้ว ' + marked + ' บัญชี'
                    : 'ไม่มีบัญชีที่ต้องติ๊กเพิ่ม');
}

// ── ตรวจว่าระบบส่งอีเมลได้จริงไหม ───────────────────────────
// รันก่อนเริ่มใช้ระบบยืนยันอีเมล ถ้าโควตาเหลือ 0 ลิงก์จะไม่ออกไปไหนเลย
function checkMailQuota() {
  Logger.log('โควตาอีเมลที่เหลือวันนี้: ' + MailApp.getRemainingDailyQuota() + ' ฉบับ');
  Logger.log('SITE_URL ที่จะใส่ในลิงก์: ' + SITE_URL);
  Logger.log('→ SITE_URL ต้องตรงกับที่หน้าเว็บอยู่จริง ไม่งั้นลิงก์ในอีเมลเปิดไม่ได้');
}

// ── ตรวจว่าติดตั้งครบหรือยัง ────────────────────────────────
function checkSetup() {
  Logger.log('SPREADSHEET_ID = ' + SPREADSHEET_ID);
  try {
    const ss = getSS();
    Logger.log('เปิดชีตได้: ' + ss.getName());
  } catch (e) {
    Logger.log('❌ เปิดชีตไม่ได้ — ตรวจ SPREADSHEET_ID ใน Config.gs');
    return;
  }

  Object.keys(SCHEMA).forEach(name => {
    const sheet = getSS().getSheetByName(name);
    if (!sheet) { Logger.log('❌ ไม่มีชีต: ' + name); return; }
    const rows    = Math.max(0, sheet.getLastRow() - 1);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => String(h).trim());
    const missing = SCHEMA[name].filter(h => headers.indexOf(h) === -1);
    Logger.log((missing.length ? '⚠️ ' : '✅ ') + name + ' — ' + rows + ' แถว' +
               (missing.length ? ' | ขาดคอลัมน์: ' + missing.join(', ') : ''));
  });

  checkFiles();
}

// ── ตรวจว่าวางไฟล์ .gs ครบทุกไฟล์หรือยัง ────────────────────
// Apps Script ไม่สร้างไฟล์ใหม่ให้เอง ถ้าวางทับไฟล์เดิมอย่างเดียว
// ไฟล์ที่เพิ่งเพิ่มเข้ามาจะหายไป แล้วพังตอนใช้งานจริงว่า "xxx is not defined"
// ตรวจจากฟังก์ชันตัวแทนหนึ่งตัวต่อหนึ่งไฟล์
function checkFiles() {
  const NEED = {
    'Utils.gs':      'readAll',
    'Auth.gs':       'revokeSessions',
    'Invites.gs':    'isVerified',
    'Main.gs':       'route',
    'People.gs':     'getPeople',
    'Courses.gs':    'getCourseBoard',
    'Sessions.gs':   'getSchedule',
    'Activities.gs': 'getActivityBoard',
    'Trainers.gs':   'getTrainerBoard',
    'Users.gs':      'getUsers',
    'Finance.gs':    'getFinanceBoard',
    'Settings.gs':   'getSettings',
    'Ledger.gs':     'getLedger',
    'Attendance.gs': 'getAttendanceBoard',
    'Dashboard.gs':  'getDashboard',
  };

  const missing = [];
  Object.keys(NEED).forEach(file => {
    // typeof กับชื่อที่ไม่มีอยู่จริงคืน 'undefined' เฉย ๆ ไม่ throw
    // จึงใช้ตรวจได้ปลอดภัย ไม่ต้องพึ่ง globalThis ที่ GAS อาจไม่ยกฟังก์ชันขึ้นไปให้
    let ok = false;
    try {
      ok = eval('typeof ' + NEED[file]) === 'function';
    } catch (e) {
      ok = false;
    }
    if (!ok) missing.push(file + ' (ไม่พบ ' + NEED[file] + ')');
  });

  if (missing.length) {
    Logger.log('❌ ยังไม่ได้วางไฟล์เหล่านี้ในโปรเจ็กต์:');
    missing.forEach(m => Logger.log('   • ' + m));
    Logger.log('   → กด + ข้างคำว่า Files แล้วเลือก Script ตั้งชื่อให้ตรง แล้ววางโค้ดลงไป');
  } else {
    Logger.log('✅ ไฟล์ .gs ครบทุกไฟล์');
  }
}
