// ============================================================
// Homey Kids D Shine — Trainers.gs
// ข้อมูลผู้ฝึกสอน
// ============================================================

// คอร์สที่รับสอนเก็บเป็นข้อความคั่นจุลภาคในเซลล์เดียว
// ง่ายกว่าแยกชีตใหม่ และจำนวนคอร์สของศูนย์มีไม่มาก
function parseIds(value) {
  return String(value || '').split(',').map(x => x.trim()).filter(Boolean);
}

function getTrainerBoard(sess) {
  const trainers = readAll(SHEET.TRAINERS);
  const users    = readAll(SHEET.USERS);
  const sessions = readAll(SHEET.SESSIONS);
  const today    = todayTH();

  const userMap = indexBy(users, 'id');
  const byTrainer = groupBy(sessions, 'trainerId');

  const rows = trainers.map(t => {
    const mine    = byTrainer[String(t.id)] || [];
    const account = userMap[String(t.userId)];

    return {
      id:             t.id,
      userId:         t.userId,
      name:           t.name,
      phone:          t.phone,
      specialization: t.specialization,
      active:         t.active === '' ? true : isTrue(t.active),

      courseIds:       parseIds(t.courseIds),
      bankName:        t.bankName || '',
      bankAccountNo:   t.bankAccountNo || '',
      bankAccountName: t.bankAccountName || '',

      // บัญชีเข้าระบบ ถ้าไม่มีจะเข้าใช้งานไม่ได้เลย ต้องเห็นชัดจากหน้านี้
      email:          account ? account.email : '',
      accountActive:  account ? isTrue(account.active) : false,
      hasAccount:     !!account,

      done:     mine.filter(s => s.status === SESSION_STATUS.COMPLETED).length,
      upcoming: mine.filter(s => s.status === SESSION_STATUS.SCHEDULED &&
                                 String(s.date) >= today).length,
      pending:  mine.filter(s => s.status === SESSION_STATUS.SCHEDULED &&
                                 String(s.date) < today).length,
      total:    mine.length,
    };
  });

  rows.sort((a, b) => (a.active === b.active ? 0 : (a.active ? -1 : 1)) ||
                      String(a.name).localeCompare(String(b.name), 'th'));

  // บัญชีสิทธิ์ผู้ฝึกสอนที่ยังไม่ได้ผูกกับข้อมูลใคร
  const taken = {};
  trainers.forEach(t => { if (t.userId) taken[String(t.userId)] = String(t.id); });

  const linkable = users
    .filter(u => u.role === ROLE.TRAINER && isTrue(u.active))
    .map(u => ({
      id: u.id, name: u.name, email: u.email,
      linkedTo: taken[String(u.id)] || '',
    }));

  const courses = readAll(SHEET.COURSES)
    .map(c => ({ id: c.id, name: c.name, category: c.category, active: isTrue(c.active) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));

  return { trainers: rows, linkable: linkable, courses: courses };
}

// ── บันทึกผู้ฝึกสอน ─────────────────────────────────────────
// เก็บเฉพาะข้อมูลตัวบุคคล ส่วนบัญชีเข้าระบบและการผูกทำที่หน้าผู้ใช้งาน
// แยกให้มีทางเดียว เพราะมีสองทางแล้วจะเกิดข้อมูลที่ผูกกันไม่ตรงแบบระบบเดิม
function saveTrainer(sess, p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('กรอกชื่อผู้ฝึกสอนก่อน');

  const courseIds = [].concat(p.courseIds || []).map(String).filter(Boolean);

  // เอาคอร์สออกไม่ได้ถ้ายังมีนัดที่ยังไม่ถึงในคอร์สนั้น
  // ไม่งั้นนัดเดิมจะกลายเป็นผู้สอนที่ไม่ได้รับสอนคอร์สนั้นแล้ว
  if (p.id) {
    const current = readOne(SHEET.TRAINERS, p.id);
    const removed = parseIds(current && current.courseIds)
      .filter(id => courseIds.indexOf(id) < 0);

    if (removed.length) {
      const today     = todayTH();
      const enrollMap = indexBy(readAll(SHEET.ENROLLMENTS), 'id');
      const courseMap = indexBy(readAll(SHEET.COURSES), 'id');

      const stuck = readAll(SHEET.SESSIONS).filter(x =>
        String(x.trainerId) === String(p.id) &&
        x.status === SESSION_STATUS.SCHEDULED &&
        String(x.date) >= today &&
        removed.indexOf(String((enrollMap[String(x.enrollmentId)] || {}).courseId)) >= 0);

      if (stuck.length) {
        const names = removed
          .map(id => (courseMap[id] || {}).name || id)
          .join(', ');
        throw new Error('เอา ' + names + ' ออกไม่ได้ เพราะยังมีนัดที่ยังไม่ถึงอีก ' +
                        stuck.length + ' ครั้ง ย้ายนัดให้ผู้สอนคนอื่นก่อน');
      }
    }
  }

  const fields = {
    name:            name,
    phone:           String(p.phone || '').trim(),
    specialization:  String(p.specialization || '').trim(),
    active:          p.active === false ? false : true,
    courseIds:       courseIds.join(','),
    bankName:        String(p.bankName || '').trim(),
    bankAccountNo:   String(p.bankAccountNo || '').replace(/[^0-9]/g, ''),
    bankAccountName: String(p.bankAccountName || '').trim(),
  };

  if (p.id) {
    updateRow(SHEET.TRAINERS, Object.assign({ id: p.id }, fields));
    audit(sess.userId, 'UPDATE', 'trainer', p.id);
    return { id: p.id };
  }

  const row = insertRow(SHEET.TRAINERS, fields);
  audit(sess.userId, 'CREATE', 'trainer', row.id);
  return { id: row.id };
}

// ── เปิดหรือปิดการใช้งานผู้ฝึกสอน ───────────────────────────
// ผู้ฝึกสอนที่ปิดไว้จะไม่อยู่ในตัวเลือกตอนลงนัด แต่ประวัติเดิมยังอยู่ครบ
function toggleTrainer(sess, p) {
  const row = readOne(SHEET.TRAINERS, p.id);
  if (!row) throw new Error('ไม่พบผู้ฝึกสอน');

  const next  = !(row.active === '' ? true : isTrue(row.active));
  const today = todayTH();

  // ปิดคนที่ยังมีนัดค้างอยู่ไม่ได้ นัดจะกลายเป็นไม่มีคนสอน
  if (!next) {
    const left = readAll(SHEET.SESSIONS).filter(s =>
      String(s.trainerId) === String(p.id) &&
      s.status === SESSION_STATUS.SCHEDULED &&
      String(s.date) >= today).length;

    if (left) {
      throw new Error('ยังมีนัดที่ยังไม่ถึงอีก ' + left +
                      ' ครั้ง ย้ายนัดให้คนอื่นหรือยกเลิกก่อน');
    }
  }

  updateRow(SHEET.TRAINERS, { id: p.id, active: next });
  audit(sess.userId, next ? 'ACTIVATE' : 'DEACTIVATE', 'trainer', p.id);
  return { active: next };
}

// ── ลบผู้ฝึกสอน ─────────────────────────────────────────────
// ลบได้เฉพาะคนที่ยังไม่เคยมีนัดเลย เพราะประวัติการสอนและค่าสอนต้องอ้างอิงได้
function removeTrainer(sess, p) {
  const used = readAll(SHEET.SESSIONS)
    .filter(s => String(s.trainerId) === String(p.id));

  if (used.length) {
    throw new Error('ลบไม่ได้เพราะมีนัดหมายแล้ว ' + used.length +
                    ' ครั้ง ปิดการใช้งานแทนได้');
  }

  deleteRow(SHEET.TRAINERS, p.id);
  audit(sess.userId, 'DELETE', 'trainer', p.id);
  return { success: true };
}
