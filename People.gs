// ============================================================
// Homey Kids D Shine — People.gs
// ผู้ปกครองและเด็ก
// ============================================================

// ── อ่านข้อมูลทั้งหมดในครั้งเดียว ───────────────────────────
// ระบบเดิมยิงคำขอทีละคนในลูป ทำให้หน้าเดียวยิงหลายสิบครั้ง
// ที่นี่คืนทั้งผู้ปกครองและเด็กพร้อมกัน หน้าเว็บเรียกครั้งเดียวจบ
function getPeople(sess) {
  const parents  = readAll(SHEET.PARENTS);
  const children = readAll(SHEET.CHILDREN);

  if (sess.role === ROLE.ADMIN) {
    return { parents, children, canEdit: true };
  }

  // ผู้ฝึกสอนต้องเห็นข้อมูลเด็กเพื่อความปลอดภัยระหว่างฝึก
  // เช่น อาการแพ้ โรคประจำตัว ข้อจำกัดทางร่างกาย และเบอร์ติดต่อฉุกเฉิน
  // แต่ไม่ต้องเห็นข้อมูลการเงินของผู้ปกครอง
  if (sess.role === ROLE.TRAINER) {
    return {
      parents: parents.map(p => ({
        id: p.id, name: p.name, nickname: p.nickname,
        phone: p.phone, phoneAlt: p.phoneAlt, lineId: p.lineId,
      })),
      children,
      canEdit: false,
    };
  }

  // ผู้ปกครองเห็นเฉพาะข้อมูลตัวเองและบุตรหลานในสังกัด
  const mine       = parents.filter(p => String(p.userId) === String(sess.userId));
  const myIds      = mine.map(p => String(p.id));
  const myChildren = children.filter(c => myIds.indexOf(String(c.parentId)) >= 0);

  return { parents: mine, children: myChildren, canEdit: false };
}

// ── บันทึกผู้ปกครอง (สร้างใหม่หรือแก้ไข) ────────────────────
function saveParent(sess, p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('กรอกชื่อผู้ปกครองก่อน');

  const fields = {
    name,
    nickname:    String(p.nickname    || '').trim(),
    phone:       String(p.phone       || '').trim(),
    phoneAlt:    String(p.phoneAlt    || '').trim(),
    email:       String(p.email       || '').trim(),
    lineId:      String(p.lineId      || '').trim(),
    address:     String(p.address     || '').trim(),
    receiptName: String(p.receiptName || '').trim(),
    taxId:       String(p.taxId       || '').trim(),
    userId:      String(p.userId      || '').trim(),
  };

  if (p.id) {
    updateRow(SHEET.PARENTS, Object.assign({ id: p.id }, fields));
    audit(sess.userId, 'UPDATE', 'parent', p.id);
    return { id: p.id };
  }

  const row = insertRow(SHEET.PARENTS, fields);
  audit(sess.userId, 'CREATE', 'parent', row.id);
  return { id: row.id };
}

// ── บันทึกเด็ก (สร้างใหม่หรือแก้ไข) ─────────────────────────
function saveChild(sess, p) {
  const name = String(p.name || '').trim();
  if (!name)      throw new Error('กรอกชื่อเด็กก่อน');
  if (!p.parentId) throw new Error('เลือกผู้ปกครองก่อน');

  // ผู้ปกครองที่อ้างถึงต้องมีอยู่จริง กันข้อมูลกำพร้า
  if (!readOne(SHEET.PARENTS, p.parentId)) {
    throw new Error('ไม่พบผู้ปกครองที่เลือก');
  }

  const text = (k) => String(p[k] || '').trim();
  const fields = {
    parentId:           String(p.parentId),
    parentRelation:     text('parentRelation'),
    name:               name,
    nickname:           text('nickname'),
    dob:                text('dob'),
    gender:             text('gender'),
    weight:             text('weight'),
    height:             text('height'),
    bloodType:          text('bloodType'),
    medicalConditions:  text('medicalConditions'),
    foodAllergy:        text('foodAllergy'),
    drugAllergy:        text('drugAllergy'),
    medications:        text('medications'),
    physicalLimitation: text('physicalLimitation'),
    emergencyName:      text('emergencyName'),
    emergencyPhone:     text('emergencyPhone'),
    emergencyRelation:  text('emergencyRelation'),
    doctorName:         text('doctorName'),
    doctorPhone:        text('doctorPhone'),
    school:             text('school'),
    trainingGoal:       text('trainingGoal'),
    notes:              text('notes'),
  };

  if (p.id) {
    updateRow(SHEET.CHILDREN, Object.assign({ id: p.id }, fields));
    audit(sess.userId, 'UPDATE', 'child', p.id);
    return { id: p.id };
  }

  const row = insertRow(SHEET.CHILDREN, fields);
  audit(sess.userId, 'CREATE', 'child', row.id);
  return { id: row.id };
}

// ── สร้างผู้ปกครองและเด็กพร้อมกัน ───────────────────────────
// ถ้าสร้างเด็กไม่สำเร็จต้องลบผู้ปกครองที่เพิ่งสร้างทิ้ง
// ระบบเดิมไม่ทำขั้นนี้ จึงเหลือผู้ปกครองที่ไม่มีเด็กค้างในชีต 24 แถว
function createFamily(sess, p) {
  const parentInput = p.parent || {};
  const childInput  = p.child  || {};

  let parentId = String(parentInput.id || '').trim();
  let createdParentId = null;

  if (!parentId) {
    const created = saveParent(sess, parentInput);
    parentId = created.id;
    createdParentId = created.id;
  }

  try {
    const child = saveChild(sess, Object.assign({}, childInput, { parentId }));
    return { parentId, childId: child.id };
  } catch (err) {
    // ย้อนคืนผู้ปกครองที่เพิ่งสร้าง เพื่อไม่ให้เหลือข้อมูลกำพร้า
    if (createdParentId) {
      deleteRow(SHEET.PARENTS, createdParentId);
      audit(sess.userId, 'ROLLBACK', 'parent', createdParentId);
    }
    throw err;
  }
}

// ── ลบผู้ปกครอง ─────────────────────────────────────────────
// ลบได้เฉพาะเมื่อไม่มีเด็กในสังกัด ไม่งั้นข้อมูลเด็กจะกำพร้า
function removeParent(sess, p) {
  const kids = readAll(SHEET.CHILDREN)
    .filter(c => String(c.parentId) === String(p.id));

  if (kids.length) {
    throw new Error('ลบไม่ได้เพราะยังมีเด็กในสังกัด ' + kids.length +
                    ' คน ย้ายเด็กไปผู้ปกครองคนอื่นก่อน');
  }

  deleteRow(SHEET.PARENTS, p.id);
  audit(sess.userId, 'DELETE', 'parent', p.id);
  return { success: true };
}

// ── ลบเด็ก ──────────────────────────────────────────────────
// ลบได้เฉพาะเมื่อยังไม่เคยลงทะเบียนคอร์ส เพราะประวัติการฝึกต้องคงอยู่
function removeChild(sess, p) {
  const enrolls = readAll(SHEET.ENROLLMENTS)
    .filter(e => String(e.childId) === String(p.id));

  if (enrolls.length) {
    throw new Error('ลบไม่ได้เพราะเคยลงทะเบียนคอร์สแล้ว ' + enrolls.length +
                    ' รายการ ประวัติการฝึกต้องเก็บไว้');
  }

  deleteRow(SHEET.CHILDREN, p.id);
  audit(sess.userId, 'DELETE', 'child', p.id);
  return { success: true };
}

// ── รายชื่อบัญชีผู้ใช้สิทธิ์ผู้ปกครอง สำหรับผูกกับข้อมูล ────
// ระบบเดิมไม่เคยบันทึก userId ในชีต Parents ผลคือผู้ปกครองล็อกอิน
// เข้ามาแล้วมองไม่เห็นข้อมูลตัวเองและบุตรหลานเลย
function getLinkableUsers(sess) {
  const linked = {};
  readAll(SHEET.PARENTS).forEach(p => {
    if (p.userId) linked[String(p.userId)] = String(p.id);
  });

  return readAll(SHEET.USERS)
    .filter(u => u.role === ROLE.PARENT && isTrue(u.active))
    .map(u => ({
      id:      u.id,
      name:    u.name,
      email:   u.email,
      linkedTo: linked[String(u.id)] || '',
    }));
}
