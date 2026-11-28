// ============================================================
// Homey Kids D Shine — People.gs
// ผู้ปกครองและเด็ก
// ============================================================

// ── อ่านข้อมูลทั้งหมดในครั้งเดียว ───────────────────────────
// ระบบเดิมยิงคำขอทีละคนในลูป ทำให้หน้าเดียวยิงหลายสิบครั้ง
// ที่นี่คืนทั้งผู้ปกครองและเด็กพร้อมกัน หน้าเว็บเรียกครั้งเดียวจบ
// ── อายุและช่วงอายุ ─────────────────────────────────────────
// คำนวณที่หลังบ้าน เพราะหน้าจอจัดกลุ่มและเรียงตามช่วงอายุ
// ถ้าต่างคนต่างคำนวณ เด็กคนเดียวกันอาจตกคนละกลุ่มในคนละหน้า
const AGE_BANDS = [
  { id: 'b1', label: 'เตาะแตะ 1–3 ขวบ',     min: 0,  max: 3  },
  { id: 'b2', label: 'อนุบาล 4–6 ขวบ',      min: 4,  max: 6  },
  { id: 'b3', label: 'ประถมต้น 7–9 ขวบ',    min: 7,  max: 9  },
  { id: 'b4', label: 'ประถมปลาย 10–12 ขวบ', min: 10, max: 12 },
  { id: 'b5', label: 'โตกว่า 12 ขวบ',       min: 13, max: 99 },
];

function ageOf(dob) {
  const s = String(dob || '');
  if (s.length < 10) return null;

  const t = todayTH();
  let a = Number(t.slice(0, 4)) - Number(s.slice(0, 4));
  // ยังไม่ถึงวันเกิดของปีนี้ ให้ลบหนึ่ง เทียบ MM-DD ตรง ๆ ได้เพราะเติมศูนย์หน้าแล้ว
  if (s.slice(5, 10) > t.slice(5, 10)) a--;

  return (a >= 0 && a < 30) ? a : null;
}

function bandOf(age) {
  if (age === null) return 'b0';
  for (let i = 0; i < AGE_BANDS.length; i++) {
    if (age >= AGE_BANDS[i].min && age <= AGE_BANDS[i].max) return AGE_BANDS[i].id;
  }
  return 'b0';
}

// ── ความคืบหน้าของเด็กแต่ละคน แยกตามคอร์ส ──────────────────
// หน้าเด็กแสดงหนึ่งแถบต่อหนึ่งคอร์สที่กำลังเรียน
// เพื่อให้เห็นงานที่ค้างทันทีโดยไม่ต้องเปิดหน้าคอร์สมาเทียบ
function progressByChild() {
  const enrollments = readAll(SHEET.ENROLLMENTS);
  const sessions    = readAll(SHEET.SESSIONS);
  const courseMap   = indexBy(readAll(SHEET.COURSES), 'id');
  const byEnroll    = groupBy(sessions, 'enrollmentId');
  const out         = {};

  enrollments.forEach(e => {
    if (String(e.status) === 'closed') return;

    const mine   = byEnroll[String(e.id)] || [];
    const total  = Number(e.totalSessions) || 0;
    const taught = mine.filter(s => s.status === SESSION_STATUS.COMPLETED).length;
    const booked = mine.filter(s => s.status === SESSION_STATUS.SCHEDULED).length;
    const k      = String(e.childId);

    if (!out[k]) out[k] = [];
    out[k].push({
      enrollmentId: e.id,
      courseId:     e.courseId,
      courseName:   (courseMap[String(e.courseId)] || {}).name || '',
      taught:       taught,
      booked:       booked,
      total:        total,
      // ยังไม่ได้นัด = คาบที่จ่ายเงินมาแล้วแต่ยังไม่มีวัน คือของค้างที่ต้องตาม
      unbooked:     Math.max(0, total - taught - booked),
      pct:          total ? Math.round(taught * 100 / total) : 0,
    });
  });

  return out;
}

// เติมข้อมูลที่หน้าจอต้องใช้ลงในข้อมูลเด็กดิบ ๆ
// ไม่แตะฟิลด์เดิมเลย เพิ่มอย่างเดียว ฟอร์มแก้ไขจึงยังทำงานเหมือนเดิม
function enrichChildren(children) {
  const prog = progressByChild();

  return children.map(c => {
    const age = ageOf(c.dob);
    return Object.assign({}, c, {
      age:      age,
      ageBand:  bandOf(age),
      alerts:   childAlerts(c),
      courses:  prog[String(c.id)] || [],
    });
  });
}

function getPeople(sess) {
  const parents  = readAll(SHEET.PARENTS);
  const children = readAll(SHEET.CHILDREN);

  // ผู้ปกครองหนึ่งคนมีลูกกี่คน ใช้ทั้งการ์ดผู้ปกครองและการค้นหา
  const kidsOf = (list, pid) => list
    .filter(c => String(c.parentId) === String(pid))
    .map(c => c.nickname || c.name || '');

  const bands = AGE_BANDS.concat([{ id: 'b0', label: 'ยังไม่ได้กรอกวันเกิด' }]);

  if (sess.role === ROLE.ADMIN) {
    return {
      parents: parents.map(p => Object.assign({}, p, { kids: kidsOf(children, p.id) })),
      children: enrichChildren(children),
      bands: bands, canEdit: true, canManage: true,
    };
  }

  // ผู้ฝึกสอนต้องเห็นข้อมูลเด็กเพื่อความปลอดภัยระหว่างฝึก
  // เช่น อาการแพ้ โรคประจำตัว ข้อจำกัดทางร่างกาย และเบอร์ติดต่อฉุกเฉิน
  // แต่ไม่ต้องเห็นข้อมูลการเงินของผู้ปกครอง
  if (sess.role === ROLE.TRAINER) {
    return {
      parents: parents.map(p => ({
        id: p.id, name: p.name, nickname: p.nickname,
        phone: p.phone, phoneAlt: p.phoneAlt, lineId: p.lineId,
        kids: kidsOf(children, p.id),
      })),
      children: enrichChildren(children),
      bands: bands,
      canEdit: false,
      canManage: false,
    };
  }

  // ผู้ปกครองเห็นเฉพาะข้อมูลตัวเองและบุตรหลานในสังกัด
  // แก้ไขได้ แต่เพิ่มหรือลบไม่ได้ เพราะกระทบการลงทะเบียนและการเงิน
  const mine       = parents.filter(p => String(p.userId) === String(sess.userId));
  const myIds      = mine.map(p => String(p.id));
  const myChildren = children.filter(c => myIds.indexOf(String(c.parentId)) >= 0);

  return {
    parents:  mine.map(p => Object.assign({}, p, { kids: kidsOf(myChildren, p.id) })),
    children: enrichChildren(myChildren),
    bands:    bands,
    canEdit:  true,
    canManage: false,
  };
}

// ── รายการผู้ปกครองที่บัญชีนี้เป็นเจ้าของ ───────────────────
function myParentIds(sess) {
  return readAll(SHEET.PARENTS)
    .filter(x => String(x.userId) === String(sess.userId))
    .map(x => String(x.id));
}

// ── บันทึกผู้ปกครอง (สร้างใหม่หรือแก้ไข) ────────────────────
function saveParent(sess, p) {
  // ผู้ปกครองแก้ได้เฉพาะข้อมูลของตัวเอง และสร้างข้อมูลใหม่ไม่ได้
  if (sess.role !== ROLE.ADMIN) {
    if (sess.role !== ROLE.PARENT) throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลผู้ปกครอง');
    if (!p.id) throw new Error('เพิ่มผู้ปกครองใหม่ได้เฉพาะผู้ดูแลระบบ');
    if (myParentIds(sess).indexOf(String(p.id)) < 0) {
      throw new Error('แก้ไขได้เฉพาะข้อมูลของตัวเอง');
    }
    // ห้ามย้ายข้อมูลไปผูกกับบัญชีอื่น
    delete p.userId;
  }

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
  // ผู้ปกครองแก้ได้เฉพาะบุตรหลานในสังกัดตัวเอง และย้ายไปผู้ปกครองอื่นไม่ได้
  if (sess.role !== ROLE.ADMIN) {
    if (sess.role !== ROLE.PARENT) throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลเด็ก');
    if (!p.id) throw new Error('เพิ่มเด็กใหม่ได้เฉพาะผู้ดูแลระบบ');

    const current = readOne(SHEET.CHILDREN, p.id);
    if (!current) throw new Error('ไม่พบข้อมูลเด็ก');

    const mine = myParentIds(sess);
    if (mine.indexOf(String(current.parentId)) < 0) {
      throw new Error('แก้ไขได้เฉพาะบุตรหลานในความดูแลของตัวเอง');
    }
    p.parentId = current.parentId;
  }

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
  if (sess.role !== ROLE.ADMIN) throw new Error('ลบได้เฉพาะผู้ดูแลระบบ');
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
  if (sess.role !== ROLE.ADMIN) throw new Error('ลบได้เฉพาะผู้ดูแลระบบ');
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
