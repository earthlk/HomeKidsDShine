// ============================================================
// Homey Kids D Shine — Trainers.gs
// ข้อมูลผู้ฝึกสอน
// ============================================================

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

  return { trainers: rows, linkable: linkable };
}

// ── บันทึกผู้ฝึกสอน ─────────────────────────────────────────
// เก็บเฉพาะข้อมูลตัวบุคคล ส่วนบัญชีเข้าระบบและการผูกทำที่หน้าผู้ใช้งาน
// แยกให้มีทางเดียว เพราะมีสองทางแล้วจะเกิดข้อมูลที่ผูกกันไม่ตรงแบบระบบเดิม
function saveTrainer(sess, p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('กรอกชื่อผู้ฝึกสอนก่อน');

  const fields = {
    name:           name,
    phone:          String(p.phone || '').trim(),
    specialization: String(p.specialization || '').trim(),
    active:         p.active === false ? false : true,
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
