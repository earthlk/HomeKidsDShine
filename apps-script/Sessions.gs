// ============================================================
// Homey Kids D Shine — Sessions.gs
// ตารางนัดหมาย
// ============================================================

// ── ตารางนัดในช่วงเวลาที่ขอ ─────────────────────────────────
// รับ from และ to เพื่อไม่ต้องส่งนัดทั้งหมดมาทุกครั้ง
// ศูนย์ที่เปิดมาหลายปีจะมีนัดหลายพันรายการ ส่งมาทั้งหมดจะช้าขึ้นเรื่อย ๆ
function getSchedule(sess, p) {
  const from = String(p.from || '');
  const to   = String(p.to   || '');

  let rows = readAll(SHEET.SESSIONS);
  if (from) rows = rows.filter(s => String(s.date) >= from);
  if (to)   rows = rows.filter(s => String(s.date) <= to);

  const enrollments = readAll(SHEET.ENROLLMENTS);
  const children    = readAll(SHEET.CHILDREN);
  const parents     = readAll(SHEET.PARENTS);
  const courses     = readAll(SHEET.COURSES);
  const trainers    = readAll(SHEET.TRAINERS);
  const activities  = readAll(SHEET.ACTIVITIES);

  const enrollMap  = indexBy(enrollments, 'id');
  const childMap   = indexBy(children, 'id');
  const parentMap  = indexBy(parents, 'id');
  const courseMap  = indexBy(courses, 'id');
  const trainerMap = indexBy(trainers, 'id');
  const actMap     = indexBy(activities, 'sessionId');

  // ผู้ฝึกสอนเห็นเฉพาะตารางของตัวเอง
  if (sess.role === ROLE.TRAINER) {
    const me = trainers.find(t => String(t.userId) === String(sess.userId));
    rows = me ? rows.filter(s => String(s.trainerId) === String(me.id)) : [];
  }

  // ผู้ปกครองเห็นเฉพาะนัดของบุตรหลานตัวเอง
  if (sess.role === ROLE.PARENT) {
    const myParentIds = parents
      .filter(x => String(x.userId) === String(sess.userId))
      .map(x => String(x.id));

    const myChildIds = children
      .filter(c => myParentIds.indexOf(String(c.parentId)) >= 0)
      .map(c => String(c.id));

    const myEnrollIds = enrollments
      .filter(e => myChildIds.indexOf(String(e.childId)) >= 0)
      .map(e => String(e.id));

    rows = rows.filter(s => myEnrollIds.indexOf(String(s.enrollmentId)) >= 0);
  }

  const out = rows.map(s => {
    const enr     = enrollMap[String(s.enrollmentId)] || {};
    const child   = childMap[String(enr.childId)]     || {};
    const parent  = parentMap[String(child.parentId)] || {};
    const course  = courseMap[String(enr.courseId)]   || {};
    const trainer = trainerMap[String(s.trainerId)]   || {};

    return {
      id:           s.id,
      enrollmentId: s.enrollmentId,
      date:         s.date,
      startTime:    s.startTime,
      endTime:      s.endTime,
      status:       s.status,
      location:     s.location,
      notes:        s.notes,
      cancelReason: s.cancelReason,
      trainerId:    s.trainerId,
      trainerName:  trainer.name || '',
      childId:      enr.childId,
      childName:    child.nickname || child.name || '',
      childFullName: child.name || '',
      parentName:   parent.name || '',
      parentPhone:  parent.phone || '',
      courseName:   course.name || '',
      hasLog:       !!actMap[String(s.id)],
      // ข้อมูลสุขภาพที่ผู้ฝึกสอนต้องรู้ก่อนเริ่มสอน
      alerts:       childAlerts(child),
    };
  });

  // เรียงตามวันและเวลา ให้ทุกมุมมองใช้ลำดับเดียวกัน
  out.sort((a, b) => String(a.date + a.startTime)
    .localeCompare(String(b.date + b.startTime)));

  return { sessions: out, canEdit: sess.role === ROLE.ADMIN };
}

// เรื่องที่ต้องเตือนผู้ฝึกสอน ดึงมาแสดงบนนัดเลยไม่ต้องเปิดหาในหน้าเด็ก
function childAlerts(child) {
  const list = [];
  if (child.drugAllergy)        list.push('แพ้ยา ' + child.drugAllergy);
  if (child.foodAllergy)        list.push('แพ้อาหาร ' + child.foodAllergy);
  if (child.medicalConditions)  list.push(child.medicalConditions);
  if (child.physicalLimitation) list.push(child.physicalLimitation);
  return list;
}

// ── ข้อมูลประกอบฟอร์มลงนัด ──────────────────────────────────
// รายการลงทะเบียนที่ยังนัดเพิ่มได้ พร้อมยอดคงเหลือของแต่ละรายการ
function getScheduleMeta(sess) {
  const enrollments = readAll(SHEET.ENROLLMENTS);
  const sessions    = readAll(SHEET.SESSIONS);
  const children    = indexBy(readAll(SHEET.CHILDREN), 'id');
  const courses     = indexBy(readAll(SHEET.COURSES), 'id');
  const parents     = indexBy(readAll(SHEET.PARENTS), 'id');
  const byEnroll    = groupBy(sessions, 'enrollmentId');

  const options = [];

  enrollments.forEach(e => {
    if (String(e.status) === 'closed') return;   // รายการที่ปิดแล้วนัดเพิ่มไม่ได้

    const mine  = byEnroll[String(e.id)] || [];
    const total = Number(e.totalSessions) || 0;
    const used  = mine.filter(s => s.status !== SESSION_STATUS.CANCELLED).length;
    if (used >= total) return;                   // ใช้ครบแล้ว นัดเพิ่มไม่ได้

    const child  = children[String(e.childId)]  || {};
    const course = courses[String(e.courseId)]  || {};
    const parent = parents[String(child.parentId)] || {};

    options.push({
      id:        e.id,
      childId:   e.childId,
      childName: child.nickname || child.name || '',
      // ชื่อจริงและชื่อผู้ปกครองไว้แยกเด็กที่ชื่อเล่นซ้ำกัน
      childFullName: child.name || '',
      parentName: parent.name || '',
      courseName: course.name || '',
      durationMin: Number(course.durationMin) || 60,
      remaining: total - used,
    });
  });

  options.sort((a, b) => String(a.childName).localeCompare(String(b.childName), 'th'));

  const trainers = readAll(SHEET.TRAINERS)
    .filter(t => t.active === '' || isTrue(t.active))
    .map(t => ({ id: t.id, name: t.name }));

  return { enrollments: options, trainers: trainers };
}

// ── บันทึกนัดหมาย ───────────────────────────────────────────
function saveSession(sess, p) {
  const fields = validateSession(p, p.id);

  if (p.id) {
    const current = readOne(SHEET.SESSIONS, p.id);
    if (!current) throw new Error('ไม่พบนัดหมาย');
    if (current.status === SESSION_STATUS.COMPLETED) {
      throw new Error('นัดที่บันทึกกิจกรรมแล้วแก้ไม่ได้ ให้ผู้ฝึกสอนแก้ที่บันทึกกิจกรรมแทน');
    }

    updateRow(SHEET.SESSIONS, Object.assign({ id: p.id }, fields));
    audit(sess.userId, 'UPDATE', 'session', p.id);
    return { id: p.id, count: 1 };
  }

  // นัดซ้ำรายสัปดาห์ ลดงานตอนเปิดคอร์สใหม่ที่ต้องลงนัดทีละแปดถึงสิบสองครั้ง
  const repeat = Math.max(1, Math.min(52, Number(p.repeatWeeks) || 1));
  const made   = [];

  for (let i = 0; i < repeat; i++) {
    const row = Object.assign({}, fields, {
      date:   addDays(fields.date, i * 7),
      status: SESSION_STATUS.SCHEDULED,
    });

    // ตรวจทีละครั้ง เพราะสัปดาห์ถัด ๆ ไปอาจชนกับนัดอื่นที่มีอยู่แล้ว
    const problem = checkConflict(row, null);
    if (problem) {
      if (made.length) {
        return { count: made.length, stoppedAt: row.date, reason: problem };
      }
      throw new Error(problem);
    }

    const left = remainingOf(fields.enrollmentId) - made.length;
    if (left <= 0) {
      return { count: made.length, stoppedAt: row.date, reason: 'ครบจำนวนครั้งที่ซื้อไว้แล้ว' };
    }

    const created = insertRow(SHEET.SESSIONS, row);
    made.push(created.id);
  }

  audit(sess.userId, 'CREATE', 'session', made.join(','));
  return { count: made.length };
}

// ── ตรวจความถูกต้องของนัด ───────────────────────────────────
function validateSession(p, editingId) {
  const date  = String(p.date || '').trim();
  const start = String(p.startTime || '').trim();
  const end   = String(p.endTime || '').trim();

  if (!p.enrollmentId) throw new Error('เลือกรายการลงทะเบียนก่อน');
  if (!p.trainerId)    throw new Error('เลือกผู้ฝึกสอนก่อน');
  if (!date)           throw new Error('เลือกวันที่ก่อน');
  if (!start || !end)  throw new Error('ระบุเวลาเริ่มและเวลาสิ้นสุด');
  if (end <= start)    throw new Error('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');

  const enr = readOne(SHEET.ENROLLMENTS, p.enrollmentId);
  if (!enr) throw new Error('ไม่พบรายการลงทะเบียน');
  if (String(enr.status) === 'closed') {
    throw new Error('รายการลงทะเบียนนี้ปิดแล้ว เปิดรายการก่อนจึงจะนัดเพิ่มได้');
  }

  // นัดเกินจำนวนครั้งที่ซื้อไว้ไม่ได้ ยอดคงเหลือจะติดลบ
  if (!editingId && remainingOf(p.enrollmentId) <= 0) {
    throw new Error('รายการนี้ใช้ครบจำนวนครั้งแล้ว ลงทะเบียนรอบใหม่ก่อนจึงจะนัดได้');
  }

  const row = {
    enrollmentId: String(p.enrollmentId),
    trainerId:    String(p.trainerId),
    date:         date,
    startTime:    start,
    endTime:      end,
    location:     String(p.location || '').trim(),
    notes:        String(p.notes || '').trim(),
  };

  if (editingId) {
    const problem = checkConflict(row, editingId);
    if (problem) throw new Error(problem);
  }

  return row;
}

// ── ตรวจการชนกันของเวลา ─────────────────────────────────────
// ผู้ฝึกสอนหนึ่งคนดูแลเด็กหลายคนพร้อมกันได้ ถ้าเป็นคอร์สเดียวกันและช่วงเวลาเดียวกัน
// เพราะนั่นคือคาบสอนกลุ่มคาบเดียว ไม่ใช่การสอนซ้อนกัน
//
// ที่ยังห้ามคือ
//   - ผู้ฝึกสอนคนเดียวรับคนละคอร์สในเวลาที่คาบเกี่ยวกัน
//   - คอร์สเดียวกันแต่เวลาไม่ตรงกันพอดี เพราะจะสอนพร้อมกันจริงไม่ได้
//   - เด็กคนเดียวมีนัดซ้อนกัน
function checkConflict(row, skipId) {
  const sessions = readAll(SHEET.SESSIONS).filter(s =>
    String(s.date) === String(row.date) &&
    s.status !== SESSION_STATUS.CANCELLED &&
    String(s.id) !== String(skipId || ''));

  if (!sessions.length) return null;

  const overlap = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime;

  const enrollMap = indexBy(readAll(SHEET.ENROLLMENTS), 'id');
  const myEnroll  = enrollMap[String(row.enrollmentId)] || {};
  const myCourse  = String(myEnroll.courseId || '');
  const myChild   = String(myEnroll.childId  || '');

  // คาบเดียวกันคือคอร์สตรงกันและเวลาเริ่มกับเวลาจบตรงกันเป๊ะ
  const sameSlot = (s) => {
    const e = enrollMap[String(s.enrollmentId)] || {};
    return String(e.courseId) === myCourse &&
           String(s.startTime) === String(row.startTime) &&
           String(s.endTime)   === String(row.endTime);
  };

  const clashTrainer = sessions.find(s =>
    String(s.trainerId) === String(row.trainerId) &&
    overlap(s, row) && !sameSlot(s));

  if (clashTrainer) {
    const t   = readOne(SHEET.TRAINERS, row.trainerId) || {};
    const e   = enrollMap[String(clashTrainer.enrollmentId)] || {};
    const c   = readOne(SHEET.COURSES, e.courseId) || {};
    const why = String(e.courseId) === myCourse
      ? 'คอร์สเดียวกันแต่เวลาไม่ตรงกันพอดี รวมเป็นคาบเดียวกันไม่ได้'
      : 'ติดสอน ' + (c.name || 'คอร์สอื่น') + ' อยู่';

    return (t.name || 'ผู้ฝึกสอน') + ' ' + why + ' วันที่ ' + row.date +
           ' เวลา ' + clashTrainer.startTime + ' ถึง ' + clashTrainer.endTime;
  }

  const clashChild = sessions.find(s => {
    const e = enrollMap[String(s.enrollmentId)] || {};
    return String(e.childId) === myChild && overlap(s, row);
  });

  if (clashChild) {
    const c = readOne(SHEET.CHILDREN, myChild) || {};
    return (c.nickname || c.name || 'เด็ก') + ' มีนัดอยู่แล้ววันที่ ' + row.date +
           ' เวลา ' + clashChild.startTime + ' ถึง ' + clashChild.endTime;
  }

  return null;
}

// จำนวนครั้งที่ยังนัดได้ นับนัดที่ยกเลิกแล้วเป็นครั้งที่ยังไม่ใช้
function remainingOf(enrollmentId) {
  const enr = readOne(SHEET.ENROLLMENTS, enrollmentId);
  if (!enr) return 0;

  const used = readAll(SHEET.SESSIONS).filter(s =>
    String(s.enrollmentId) === String(enrollmentId) &&
    s.status !== SESSION_STATUS.CANCELLED).length;

  return (Number(enr.totalSessions) || 0) - used;
}

// บวกวันแบบไม่พึ่ง Date object เพื่อเลี่ยงปัญหาเขตเวลา
function addDays(dateStr, days) {
  const p = String(dateStr).split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + days);

  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// ── ยกเลิกนัด ───────────────────────────────────────────────
// ไม่ลบทิ้งเพราะต้องรู้ว่าเคยนัดแล้วยกเลิกด้วยเหตุอะไร
// และครั้งที่ยกเลิกจะคืนกลับเข้ายอดคงเหลือให้นัดใหม่ได้
function cancelSession(sess, p) {
  const row = readOne(SHEET.SESSIONS, p.id);
  if (!row) throw new Error('ไม่พบนัดหมาย');

  if (row.status === SESSION_STATUS.COMPLETED) {
    throw new Error('นัดที่บันทึกกิจกรรมแล้วยกเลิกไม่ได้');
  }
  if (!String(p.reason || '').trim()) {
    throw new Error('ระบุเหตุผลการยกเลิกก่อน');
  }

  updateRow(SHEET.SESSIONS, {
    id:           p.id,
    status:       SESSION_STATUS.CANCELLED,
    cancelReason: String(p.reason).trim(),
  });

  audit(sess.userId, 'CANCEL', 'session', p.id);
  return { success: true };
}

// ── ลบนัด ───────────────────────────────────────────────────
// ลบได้เฉพาะนัดที่ยังไม่เกิดขึ้นและยังไม่มีบันทึกกิจกรรม
function removeSession(sess, p) {
  const row = readOne(SHEET.SESSIONS, p.id);
  if (!row) throw new Error('ไม่พบนัดหมาย');

  if (row.status === SESSION_STATUS.COMPLETED) {
    throw new Error('นัดที่บันทึกกิจกรรมแล้วลบไม่ได้ ใช้การยกเลิกแทน');
  }

  const logged = readAll(SHEET.ACTIVITIES)
    .filter(a => String(a.sessionId) === String(p.id));
  if (logged.length) {
    throw new Error('นัดนี้มีบันทึกกิจกรรมแล้ว ลบไม่ได้');
  }

  deleteRow(SHEET.SESSIONS, p.id);
  audit(sess.userId, 'DELETE', 'session', p.id);
  return { success: true };
}
