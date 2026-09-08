// ============================================================
// Homey Kids D Shine — Activities.gs
// บันทึกกิจกรรมการฝึกสอน
// ============================================================
//
// การบันทึกกิจกรรมคือจุดที่ทำให้นัดกลายเป็น "สอนแล้ว"
// ยอดในหน้าคอร์สและค่าสอนในหน้าการเงินนับจากตรงนี้ทั้งหมด
// จึงต้องบันทึกได้เฉพาะนัดที่เกิดขึ้นจริงแล้วเท่านั้น
//
// ============================================================

// ── รายการที่ต้องบันทึกและที่บันทึกแล้ว ─────────────────────
function getActivityBoard(sess) {
  const today    = todayTH();
  const sessions = readAll(SHEET.SESSIONS);
  const trainers = readAll(SHEET.TRAINERS);

  let me = null;
  if (sess.role === ROLE.TRAINER) {
    me = trainers.find(t => String(t.userId) === String(sess.userId));
    if (!me) {
      return { rows: [], byTrainer: [], canLog: false, needsProfile: true };
    }
  }

  // ผู้ปกครองเห็นเฉพาะบันทึกของบุตรหลานตัวเอง และเห็นเฉพาะที่บันทึกแล้ว
  // นัดที่ครูยังไม่บันทึกไม่ควรโผล่ เพราะยังไม่มีอะไรให้อ่าน
  let myEnrollIds = null;
  if (sess.role === ROLE.PARENT) {
    const myParents = readAll(SHEET.PARENTS)
      .filter(x => String(x.userId) === String(sess.userId))
      .map(x => String(x.id));

    if (!myParents.length) {
      return { rows: [], byTrainer: [], canLog: false, needsProfile: true };
    }

    const myChildIds = readAll(SHEET.CHILDREN)
      .filter(c => myParents.indexOf(String(c.parentId)) >= 0)
      .map(c => String(c.id));

    myEnrollIds = readAll(SHEET.ENROLLMENTS)
      .filter(e => myChildIds.indexOf(String(e.childId)) >= 0)
      .map(e => String(e.id));
  }

  const enrollMap  = indexBy(readAll(SHEET.ENROLLMENTS), 'id');
  const childMap   = indexBy(readAll(SHEET.CHILDREN), 'id');
  const courseMap  = indexBy(readAll(SHEET.COURSES), 'id');
  const trainerMap = indexBy(trainers, 'id');
  const actMap     = indexBy(readAll(SHEET.ACTIVITIES), 'sessionId');

  const rows = sessions
    .filter(s => {
      if (s.status === SESSION_STATUS.CANCELLED) return false;
      // นัดที่ยังไม่ถึงวันบันทึกไม่ได้ เพราะยังไม่เกิดขึ้นจริง
      if (String(s.date) > today) return false;
      if (me && String(s.trainerId) !== String(me.id)) return false;

      if (myEnrollIds) {
        if (myEnrollIds.indexOf(String(s.enrollmentId)) < 0) return false;
        if (s.status !== SESSION_STATUS.COMPLETED) return false;
      }

      return true;
    })
    .map(s => {
      const act    = actMap[String(s.id)] || {};
      const enr    = enrollMap[String(s.enrollmentId)] || {};
      const child  = childMap[String(enr.childId)] || {};
      const course = courseMap[String(enr.courseId)] || {};

      return {
        id:          s.id,
        date:        s.date,
        startTime:   s.startTime,
        endTime:     s.endTime,
        location:    s.location,
        trainerId:   s.trainerId,
        trainerName: (trainerMap[String(s.trainerId)] || {}).name || '',
        childName:   child.nickname || child.name || '',
        courseName:  course.name || '',
        alerts:      childAlerts(child),

        logged:   !!act.id,
        // บันทึกของคาบ เหมือนกันทุกคนในคาบเดียวกัน
        summary:  act.summary  || '',
        skills:   act.skills   || '',
        nextGoal: act.nextGoal || '',
        // ผลรายคน
        rating:   act.rating   || '',
        note:     act.note     || '',
        loggedAt: act.createdAt || '',
      };
    });

  // ค้างนานสุดขึ้นก่อน เพราะเป็นรายการที่ต้องรีบตาม
  rows.sort((a, b) => {
    if (a.logged !== b.logged) return a.logged ? 1 : -1;
    return a.logged
      ? String(b.date + b.startTime).localeCompare(String(a.date + a.startTime))
      : String(a.date + a.startTime).localeCompare(String(b.date + b.startTime));
  });

  // ฝั่งผู้ดูแลระบบต้องรู้ว่าใครค้างบันทึกกี่รายการ จะได้ตามงานถูกคน
  let byTrainer = [];
  if (sess.role === ROLE.ADMIN) {
    const tally = {};
    rows.filter(r => !r.logged).forEach(r => {
      const k = String(r.trainerId);
      if (!tally[k]) tally[k] = { id: r.trainerId, name: r.trainerName, pending: 0, oldest: r.date };
      tally[k].pending++;
      if (String(r.date) < String(tally[k].oldest)) tally[k].oldest = r.date;
    });

    byTrainer = Object.keys(tally).map(k => tally[k])
      .sort((a, b) => b.pending - a.pending);
  }

  return {
    rows:      rows,
    byTrainer: byTrainer,
    canLog:    sess.role === ROLE.TRAINER || sess.role === ROLE.ADMIN,
    isAdmin:   sess.role === ROLE.ADMIN,
    isParent:  sess.role === ROLE.PARENT,
    isParent:  sess.role === ROLE.PARENT,
  };
}

// ── บันทึกกิจกรรม ───────────────────────────────────────────
// บันทึกของคาบเขียนครั้งเดียวใช้กับทุกคน ส่วนผลรายคนแยกกัน
// เพราะเด็กที่เรียนคาบเดียวกันตอบสนองไม่เหมือนกัน
function saveActivity(sess, p) {
  const kids = [].concat(p.children || []);
  if (!kids.length) throw new Error('ไม่พบนัดที่จะบันทึก');

  const summary = String(p.summary || '').trim();
  if (!summary) throw new Error('เขียนสรุปการฝึกของคาบก่อน');

  const shared = {
    summary:  summary,
    skills:   String(p.skills || '').trim(),
    nextGoal: String(p.nextGoal || '').trim(),
  };

  const today    = todayTH();
  const existing = indexBy(readAll(SHEET.ACTIVITIES), 'sessionId');
  const trainers = readAll(SHEET.TRAINERS);

  let me = null;
  if (sess.role === ROLE.TRAINER) {
    me = trainers.find(t => String(t.userId) === String(sess.userId));
    if (!me) throw new Error('บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน');
  }

  let saved = 0;

  kids.forEach(kid => {
    const id  = String(kid.sessionId || '');
    const row = readOne(SHEET.SESSIONS, id);
    if (!row) throw new Error('ไม่พบนัดหมาย');

    if (row.status === SESSION_STATUS.CANCELLED) {
      throw new Error('นัดที่ยกเลิกแล้วบันทึกกิจกรรมไม่ได้');
    }
    if (String(row.date) > today) {
      throw new Error('นัดวันที่ ' + row.date + ' ยังไม่ถึงกำหนด บันทึกล่วงหน้าไม่ได้');
    }
    if (me && String(row.trainerId) !== String(me.id)) {
      throw new Error('บันทึกได้เฉพาะนัดที่ตัวเองเป็นผู้สอน');
    }

    const rating = String(kid.rating || '').trim();
    if (rating && (Number(rating) < 1 || Number(rating) > 5)) {
      throw new Error('คะแนนต้องอยู่ระหว่าง 1 ถึง 5');
    }

    const fields = Object.assign({
      sessionId: id,
      trainerId: String(row.trainerId),
      rating:    rating,
      note:      String(kid.note || '').trim(),
    }, shared);

    const old = existing[id];
    if (old) updateRow(SHEET.ACTIVITIES, Object.assign({ id: old.id }, fields));
    else     insertRow(SHEET.ACTIVITIES, fields);

    // บันทึกแล้วนัดจึงนับเป็นสอนแล้ว ยอดในหน้าคอร์สและค่าสอนอ้างอิงจากตรงนี้
    if (row.status !== SESSION_STATUS.COMPLETED) {
      updateRow(SHEET.SESSIONS, { id: id, status: SESSION_STATUS.COMPLETED });
    }

    saved++;
  });

  audit(sess.userId, 'LOG_ACTIVITY', 'session', kids.map(k => k.sessionId).join(','));
  return { count: saved };
}

// ── ลบบันทึก ────────────────────────────────────────────────
// ลบแล้วนัดกลับไปเป็นรอบันทึก ยอดสอนแล้วจะลดลงตาม
// ใช้กับกรณีบันทึกผิดนัด ไม่ใช่กรณีแก้ข้อความซึ่งใช้การแก้ไขแทน
function removeActivity(sess, p) {
  const act = readAll(SHEET.ACTIVITIES)
    .find(a => String(a.sessionId) === String(p.sessionId));
  if (!act) throw new Error('ไม่พบบันทึกกิจกรรม');

  deleteRow(SHEET.ACTIVITIES, act.id);
  updateRow(SHEET.SESSIONS, { id: p.sessionId, status: SESSION_STATUS.SCHEDULED });

  audit(sess.userId, 'DELETE_ACTIVITY', 'session', p.sessionId);
  return { success: true };
}
