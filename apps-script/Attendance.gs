// ============================================================
// Homey Kids D Shine — Attendance.gs
// เช็กชื่อและคาบชดเชย
// ============================================================
//
// หนึ่งแถวในชีต Sessions คือเด็กหนึ่งคนในคาบหนึ่งคาบอยู่แล้ว
// การมาเรียนจึงเป็นคอลัมน์ของแถวนั้น ไม่ต้องมีชีตแยก
//
// กฎสำคัญของไฟล์นี้ — ระบบไม่ตัดสินแทนคน
// เด็กขาดเรียนแล้วจะเข้าคิวรอตัดสิน ผู้ดูแลระบบเลือกเองเป็นเคส ๆ ว่าจะ
//   คืนคาบ      ได้คาบกลับ ไว้นัดใหม่ทีหลัง
//   นัดใหม่     คืนคาบแล้วลงนัดชดเชยให้เลยในขั้นตอนเดียว
//   ตัดคาบ      ถือว่าใช้คาบนั้นไปแล้ว
//
// สาเหตุที่ไม่ฮาร์ดโค้ดกฎเดียว เพราะศูนย์เล็กแต่ละเคสเงื่อนไขไม่เหมือนกัน
// แจ้งล่วงหน้ากับเงียบหายไปเลยก็ต่างกัน ป่วยกับลืมก็ต่างกัน
// กฎเดียวจะผิดเสมอกับอีกครึ่งหนึ่งของเคส
// ============================================================

// ── สถานะรวมของคาบหนึ่งแถว ──────────────────────────────────
// ใช้ชื่อเดียวกันทั้งหลังบ้านและหน้าเว็บ จะได้ไม่ต้องแปลสองที่
function attendanceState(row, today) {
  const att = String(row.attendance || '');

  if (row.status === SESSION_STATUS.CANCELLED) return 'cancelled';
  if (att === ATTENDANCE.ABSENT) {
    const m = String(row.makeupStatus || '');
    return m && m !== MAKEUP.PENDING ? 'decided' : 'pending';
  }
  if (att) return 'checked';

  // ยังไม่มีใครเช็ก ถ้าวันผ่านไปแล้วถือว่าค้างเช็ก
  return String(row.date) < String(today) ? 'unchecked' : 'upcoming';
}

// ── กระดานเช็กชื่อ ──────────────────────────────────────────
function getAttendanceBoard(sess, p) {
  const today    = todayTH();
  const sessions = readAll(SHEET.SESSIONS);
  const enrolls  = indexBy(readAll(SHEET.ENROLLMENTS), 'id');
  const children = indexBy(readAll(SHEET.CHILDREN), 'id');
  const courses  = indexBy(readAll(SHEET.COURSES), 'id');
  const trainers = readAll(SHEET.TRAINERS);
  const tMap     = indexBy(trainers, 'id');

  // ผู้ฝึกสอนเห็นเฉพาะคาบของตัวเอง กรองที่นี่ ไม่ใช่แค่ซ่อนปุ่มที่หน้าเว็บ
  let visible = sessions;
  let me = null;
  if (sess.role === ROLE.TRAINER) {
    me = trainers.find(t => String(t.userId) === String(sess.userId));
    if (!me) return { noProfile: true, isTrainer: true };
    visible = sessions.filter(s => String(s.trainerId) === String(me.id));
  }

  const rows = visible.map(s => {
    const enr    = enrolls[String(s.enrollmentId)]  || {};
    const child  = children[String(enr.childId)]    || {};
    const course = courses[String(enr.courseId)]    || {};
    const t      = tMap[String(s.trainerId)]        || {};

    return {
      id:          s.id,
      date:        s.date,
      startTime:   s.startTime,
      endTime:     s.endTime,
      location:    s.location,
      state:       attendanceState(s, today),
      attendance:  s.attendance || '',
      note:        s.attendanceNote || '',
      makeupStatus: s.makeupStatus || '',
      makeupOfId:  s.makeupOfId || '',
      enrollmentId: s.enrollmentId,
      childName:   child.nickname || child.name || '',
      childFull:   child.name || '',
      // ข้อควรระวังต้องมากับแถวเช็กชื่อด้วย ไม่ใช่มีแค่ในหน้าเด็ก
      // คนที่ยืนอยู่หน้าเด็กตอนเช็กชื่อคือคนที่ต้องรู้ว่าแพ้อะไร
      alerts:      childAlerts(child),
      courseName:  course.name || '',
      trainerId:   s.trainerId,
      trainerName: t.name || '',
    };
  });

  const pick = (state) => rows.filter(r => r.state === state)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // รายการที่ตัดสินแล้ว เรียงใหม่สุดขึ้นก่อน เพราะเปิดดูเพื่อทวนของที่เพิ่งทำ
  const decided = rows.filter(r => r.state === 'decided')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 100);

  return {
    isTrainer: sess.role === ROLE.TRAINER,
    today:     today,
    pending:   pick('pending'),
    unchecked: pick('unchecked'),
    decided:   decided,
    trainers:  trainers.map(t => ({ id: t.id, name: t.name })),
  };
}

// ── ตัวเลขสำหรับป้ายแจ้งเตือนบนเมนู ─────────────────────────
// เรียกตอนเข้าระบบและหลังตัดสินทุกครั้ง จะได้เห็นว่ามีของค้างโดยไม่ต้องเปิดหน้า
// ตอนนี้อ่านทั้งกระดานแล้วนับ ซึ่งเร็วพอสำหรับชีตขนาดศูนย์เล็ก
// ถ้าวันหนึ่งนัดสะสมเป็นหลักหมื่นแถวค่อยทำตัวนับแยก
function getAlerts(sess) {
  const board = getAttendanceBoard(sess, {});
  if (board.noProfile) return { pending: 0, unchecked: 0 };
  return {
    pending:   board.pending.length,
    unchecked: board.unchecked.length,
  };
}

// ── เช็กชื่อรายคน ───────────────────────────────────────────
// ใช้ได้ทั้งจากหน้าเช็กชื่อและจากฟอร์มบันทึกกิจกรรม
function markAttendance(sess, p) {
  const row = readOne(SHEET.SESSIONS, p.id);
  if (!row) throw new Error('ไม่พบนัดหมาย');

  if (row.status === SESSION_STATUS.CANCELLED) {
    throw new Error('นัดที่ยกเลิกแล้วเช็กชื่อไม่ได้');
  }

  const today = todayTH();
  if (String(row.date) > today) {
    throw new Error('นัดวันที่ ' + row.date + ' ยังไม่ถึงกำหนด เช็กชื่อล่วงหน้าไม่ได้');
  }

  if (sess.role === ROLE.TRAINER) {
    const me = readAll(SHEET.TRAINERS)
      .find(t => String(t.userId) === String(sess.userId));
    if (!me) throw new Error('บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน');
    if (String(row.trainerId) !== String(me.id)) {
      throw new Error('เช็กชื่อได้เฉพาะคาบที่ตัวเองเป็นผู้สอน');
    }
  }

  applyAttendance(row, p.attendance, p.note, sess.userId);
  audit(sess.userId, 'ATTENDANCE', 'session', p.id);

  return { id: p.id, attendance: String(p.attendance || '') };
}

// เขียนค่าการมาเรียนลงแถว แยกออกมาเพราะฟอร์มบันทึกกิจกรรมก็เรียกใช้
// ตัวเรียกเป็นคนตรวจสิทธิ์และวันที่มาก่อนแล้ว
function applyAttendance(row, value, note, userId) {
  const att = String(value || '');
  const ok  = [ATTENDANCE.PRESENT, ATTENDANCE.LATE, ATTENDANCE.ABSENT];
  if (att && ok.indexOf(att) < 0) throw new Error('สถานะการมาเรียนไม่ถูกต้อง');

  const fields = {
    id:             row.id,
    attendance:     att,
    attendanceNote: String(note || '').trim(),
    attendanceAt:   att ? nowTH() : '',
  };

  if (att === ATTENDANCE.ABSENT) {
    // ขาดแล้วเข้าคิวรอตัดสิน แต่ถ้าเคยตัดสินไปแล้วอย่าไปล้มของเดิม
    // ไม่งั้นแก้การเช็กชื่อทีหลังแล้วผลที่ตัดสินไว้จะหายไปเงียบ ๆ
    if (!row.makeupStatus) fields.makeupStatus = MAKEUP.PENDING;
  } else {
    // เปลี่ยนจากขาดเป็นมา ผลการตัดสินเดิมใช้ไม่ได้แล้ว ล้างทิ้ง
    fields.makeupStatus = '';
    fields.decidedAt    = '';
    fields.decidedBy    = '';
  }

  updateRow(SHEET.SESSIONS, fields);
  return fields;
}

// ── ตัดสินคาบที่ขาด ─────────────────────────────────────────
// decision = credited | rescheduled | charged
// ถ้าเลือก rescheduled ต้องส่งวันเวลาของคาบใหม่มาด้วย จะได้จบในขั้นตอนเดียว
function decideMakeup(sess, p) {
  const row = readOne(SHEET.SESSIONS, p.id);
  if (!row) throw new Error('ไม่พบนัดหมาย');

  if (String(row.attendance) !== ATTENDANCE.ABSENT) {
    throw new Error('คาบนี้ไม่ได้บันทึกว่าขาดเรียน จึงไม่มีอะไรให้ตัดสิน');
  }

  const decision = String(p.decision || '');
  const allowed  = [MAKEUP.CREDITED, MAKEUP.RESCHEDULED, MAKEUP.CHARGED];
  if (allowed.indexOf(decision) < 0) throw new Error('ผลการตัดสินไม่ถูกต้อง');

  let made = null;

  if (decision === MAKEUP.RESCHEDULED) {
    // ลงนัดชดเชยผ่านตัวตรวจชุดเดียวกับการลงนัดปกติ
    // จะได้ไม่มีทางลัดที่เลี่ยงการตรวจเวลาชนกันหรือผู้สอนไม่ได้รับสอนคอร์สนี้
    const fields = validateSession({
      enrollmentId: row.enrollmentId,
      trainerId:    p.trainerId || row.trainerId,
      date:         p.date,
      startTime:    p.startTime,
      endTime:      p.endTime,
      location:     p.location || row.location,
      notes:        'คาบชดเชยของวันที่ ' + row.date,
    }, null);

    const problem = checkConflict(fields, null);
    if (problem) throw new Error(problem);

    made = insertRow(SHEET.SESSIONS, Object.assign({}, fields, {
      status:     SESSION_STATUS.SCHEDULED,
      makeupOfId: row.id,
    }));
  }

  updateRow(SHEET.SESSIONS, {
    id:           row.id,
    makeupStatus: decision,
    decidedAt:    nowTH(),
    decidedBy:    sess.userId,
    attendanceNote: p.note !== undefined
      ? String(p.note || '').trim() : row.attendanceNote,
  });

  audit(sess.userId, 'DECIDE_MAKEUP', 'session', row.id + ':' + decision);

  return {
    id:         row.id,
    decision:   decision,
    makeupId:   made ? made.id : '',
    remaining:  remainingOf(row.enrollmentId),
  };
}

// ── ยกเลิกผลการตัดสิน ───────────────────────────────────────
// ตัดสินผิดคนหรือผิดเคส ให้ย้อนกลับไปอยู่ในคิวได้
// คาบชดเชยที่ลงไว้แล้วไม่ถูกลบอัตโนมัติ เพราะอาจนัดกับผู้ปกครองไปแล้ว
// ถ้าจะยกเลิกคาบนั้นด้วยให้ไปยกเลิกที่หน้าตารางนัด
function undoMakeup(sess, p) {
  const row = readOne(SHEET.SESSIONS, p.id);
  if (!row) throw new Error('ไม่พบนัดหมาย');
  if (!row.makeupStatus || row.makeupStatus === MAKEUP.PENDING) {
    throw new Error('คาบนี้ยังไม่ได้ตัดสิน');
  }

  const madeFor = readAll(SHEET.SESSIONS)
    .filter(s => String(s.makeupOfId) === String(row.id) &&
                 s.status !== SESSION_STATUS.CANCELLED);

  updateRow(SHEET.SESSIONS, {
    id:           row.id,
    makeupStatus: MAKEUP.PENDING,
    decidedAt:    '',
    decidedBy:    '',
  });

  audit(sess.userId, 'UNDO_MAKEUP', 'session', row.id);

  return {
    id:        row.id,
    remaining: remainingOf(row.enrollmentId),
    // บอกกลับไปว่ายังมีคาบชดเชยค้างอยู่กี่คาบ หน้าเว็บจะได้เตือนให้ไปจัดการ
    madeCount: madeFor.length,
  };
}
