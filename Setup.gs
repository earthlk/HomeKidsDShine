// ============================================================
// Homey Kids D Shine — Setup.gs
// รันครั้งเดียวตอนติดตั้ง ไม่ใช่ส่วนของระบบที่ทำงานประจำ
// ============================================================
//
// ลำดับการรัน:
//   1. createNewSpreadsheet()   → ได้ ID ชีตใหม่ เอาไปใส่ใน Config.gs
//   2. createAdminUser()        → สร้างบัญชีผู้ดูแลระบบตัวแรก
//   3. migrateFromOldSheet()    → ย้ายข้อมูลที่ใช้จริงจากชีตเก่า (ถ้าต้องการ)
//
// ============================================================

// ── ขั้นที่ 1: สร้าง Spreadsheet ใหม่พร้อมทุกชีต ────────────
function createNewSpreadsheet() {
  const ss = SpreadsheetApp.create('Homey Kids D Shine — ฐานข้อมูล');

  Object.keys(SCHEMA).forEach((name, i) => {
    const headers = SCHEMA[name];
    // ชีตแรกใช้ Sheet1 ที่มีอยู่แล้ว เปลี่ยนชื่อแทนการสร้างใหม่
    const sheet = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);

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
  });

  Logger.log('════════════════════════════════════');
  Logger.log('สร้างชีตใหม่เรียบร้อย');
  Logger.log('ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
  Logger.log('');
  Logger.log('→ เอา ID ข้างบนไปใส่ในตัวแปร SPREADSHEET_ID ใน Config.gs');
  Logger.log('→ แล้วรัน createAdminUser() ต่อ');
  Logger.log('════════════════════════════════════');
}

// ── ขั้นที่ 2: สร้างบัญชีผู้ดูแลระบบตัวแรก ──────────────────
function createAdminUser() {
  const EMAIL    = 'admin@homeykids.com';
  const PASSWORD = 'Admin@1234';          // เปลี่ยนทันทีหลังเข้าใช้งานครั้งแรก
  const NAME     = 'ผู้ดูแลระบบ';

  const existing = readAll(SHEET.USERS)
    .find(u => String(u.email).toLowerCase() === EMAIL.toLowerCase());
  if (existing) {
    Logger.log('มีบัญชีนี้อยู่แล้ว: ' + EMAIL);
    return;
  }

  insertRow(SHEET.USERS, {
    id: newId(), email: EMAIL, password: hashPassword(PASSWORD),
    role: ROLE.ADMIN, name: NAME, phone: '', active: true,
    lineUserId: '', googleId: '', createdAt: nowTH(), updatedAt: '',
  });

  Logger.log('════════════════════════════════════');
  Logger.log('สร้างบัญชีผู้ดูแลระบบแล้ว');
  Logger.log('อีเมล: ' + EMAIL);
  Logger.log('รหัสผ่าน: ' + PASSWORD);
  Logger.log('→ เปลี่ยนรหัสผ่านทันทีหลังเข้าใช้งานครั้งแรก');
  Logger.log('════════════════════════════════════');
}

// ── ขั้นที่ 3: ย้ายข้อมูลจากชีตเก่า ─────────────────────────
// ย้ายเฉพาะข้อมูลที่ใช้จริง:
//   - ผู้ปกครองที่มีเด็กในสังกัด (ตัดแถวขยะ 27 แถวออก)
//   - เด็กทุกคน
//   - คอร์สทุกคอร์ส
// ไม่ย้าย: นัดหมายเก่า, log, consent — เริ่มนับใหม่จะสะอาดกว่า
//
// รันแบบ dryRun = true ก่อนเสมอ เพื่อดูว่าจะย้ายอะไรบ้าง
function migrateFromOldSheet() {
  const DRY_RUN = true;   // ← เปลี่ยนเป็น false เมื่อตรวจผลแล้วพอใจ

  const old = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);

  const oldRead = (name) => {
    const sheet = old.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const values  = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    const headers = values[0].map(h => String(h).trim());
    return values.slice(1)
      .filter(r => r.some(c => c !== '' && c !== null))
      .map(r => {
        const o = {};
        headers.forEach((h, i) => { o[h] = cellToValue(r[i]); });
        return o;
      });
  };

  const oldParents  = oldRead('Parents');
  const oldChildren = oldRead('Children');
  const oldCourses  = oldRead('Courses');

  // เก็บเฉพาะผู้ปกครองที่มีเด็กในสังกัดจริง
  const parentIdsWithKids = {};
  oldChildren.forEach(c => { parentIdsWithKids[String(c.parentId)] = true; });
  const keepParents = oldParents.filter(p => parentIdsWithKids[String(p.id)]);

  Logger.log('════════════════════════════════════');
  Logger.log(DRY_RUN ? '🔍 ทดลองรัน (ยังไม่เขียนข้อมูลจริง)' : '✍️ เขียนข้อมูลจริง');
  Logger.log('ผู้ปกครอง: มี ' + oldParents.length + ' แถว → ย้าย ' + keepParents.length +
             ' แถว (ตัดแถวไม่มีเด็กในสังกัด ' + (oldParents.length - keepParents.length) + ' แถว)');
  Logger.log('เด็ก: ย้าย ' + oldChildren.length + ' คน');
  Logger.log('คอร์ส: ย้าย ' + oldCourses.length + ' คอร์ส');
  Logger.log('────────────────────────────────────');

  keepParents.forEach(p => Logger.log('  ผู้ปกครอง: ' + p.name + ' (' + p.id + ')'));
  oldChildren.forEach(c => Logger.log('  เด็ก: ' + c.name + ' (' + c.id + ')'));
  oldCourses.forEach(c => Logger.log('  คอร์ส: ' + c.name));

  if (DRY_RUN) {
    Logger.log('────────────────────────────────────');
    Logger.log('→ ถ้าผลลัพธ์ถูกต้อง แก้ DRY_RUN เป็น false แล้วรันใหม่');
    Logger.log('════════════════════════════════════');
    return;
  }

  // ── เขียนจริง ──
  keepParents.forEach(p => {
    insertRow(SHEET.PARENTS, {
      id: p.id, userId: p.userId || '', name: p.name || '', nickname: p.nickname || '',
      phone: p.phone || '', phoneAlt: p.phoneAlt || '', email: p.email || '',
      lineId: p.lineId || '', address: p.address || '',
      receiptName: p.receiptName || '', taxId: p.taxId || '',
      createdAt: p.createdAt || nowTH(), updatedAt: '',
    });
  });

  oldChildren.forEach(c => {
    insertRow(SHEET.CHILDREN, {
      id: c.id, parentId: c.parentId || '', parentRelation: c.parentRelationship || '',
      name: c.name || '', nickname: c.nickname || '', dob: c.dob || '', gender: c.gender || '',
      weight: c.weight || '', height: c.height || '', bloodType: c.bloodType || '',
      medicalConditions: c.medicalConditions || '', foodAllergy: c.foodAllergy || '',
      drugAllergy: c.drugAllergy || '', medications: c.medications || '',
      physicalLimitation: c.physicalLimitation || '',
      emergencyName: c.emergencyContact || '', emergencyPhone: c.emergencyPhone || '',
      emergencyRelation: c.emergencyRelation || '',
      doctorName: c.doctorName || '', doctorPhone: c.doctorPhone || '',
      school: c.school || '', trainingGoal: c.trainingGoal || '', notes: c.notes || '',
      createdAt: c.createdAt || nowTH(), updatedAt: '',
    });
  });

  oldCourses.forEach(c => {
    insertRow(SHEET.COURSES, {
      id: c.id, name: c.name || '', description: c.description || '',
      category: c.category || '', totalSessions: c.totalSessions || '',
      price: c.price || '', trainerFee: c.trainerFee || '',
      durationMin: 60, active: true,
      createdAt: c.createdAt || nowTH(), updatedAt: '',
    });
  });

  Logger.log('ย้ายข้อมูลเรียบร้อย ✅');
  Logger.log('════════════════════════════════════');
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
}
