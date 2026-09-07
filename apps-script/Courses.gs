// ============================================================
// Homey Kids D Shine — Courses.gs
// คอร์สและการลงทะเบียน
// ============================================================
//
// สถานะของการลงทะเบียนไม่ได้ให้คนเลือกเอง แต่คำนวณจากข้อมูลจริง
// เพราะถ้าให้กดเปลี่ยนเองจะลืม แล้วตัวเลขไม่ตรงกับความจริง
//
//   ปิดรายการ  — ผู้ดูแลระบบสั่งปิด เช่น เด็กเลิกเรียนกลางคัน
//   เรียนจบ    — จำนวนครั้งที่ผู้ฝึกสอนบันทึกกิจกรรมแล้ว ครบตามที่ซื้อไว้
//   กำลังเรียน — นอกเหนือจากนั้น
//
// ============================================================

// ── ข้อมูลหน้าคอร์สทั้งหมดในครั้งเดียว ──────────────────────
// รวมประวัติการฝึกของทุกรายการมาด้วยเลย เพื่อให้กดดูประวัติแล้วขึ้นทันที
// ไม่ต้องยิงคำขอไปหลังบ้านใหม่ซึ่งใช้เวลาหนึ่งถึงสามวินาทีต่อครั้ง
function getCourseBoard(sess) {
  const courses     = readAll(SHEET.COURSES);
  const enrollments = readAll(SHEET.ENROLLMENTS);
  const children    = readAll(SHEET.CHILDREN);
  const sessions    = readAll(SHEET.SESSIONS);
  const trainers    = readAll(SHEET.TRAINERS);
  const activities  = readAll(SHEET.ACTIVITIES);

  const isAdmin = sess.role === ROLE.ADMIN;
  let visible   = enrollments;

  // ผู้ฝึกสอนเห็นเฉพาะรายการที่ตัวเองเคยสอนหรือมีนัดอยู่
  // เดิมกรองแค่ผู้ปกครอง ทำให้ผู้ฝึกสอนเห็นการลงทะเบียนของเด็กทุกคนในศูนย์
  if (sess.role === ROLE.TRAINER) {
    const me = readAll(SHEET.TRAINERS)
      .find(t => String(t.userId) === String(sess.userId));

    if (!me) return { courses: [], enrollments: [], children: [], canEdit: false };

    const mine = {};
    sessions.forEach(x => {
      if (String(x.trainerId) === String(me.id)) mine[String(x.enrollmentId)] = true;
    });

    visible = enrollments.filter(e => mine[String(e.id)]);
  }

  // ผู้ปกครองเห็นเฉพาะการลงทะเบียนของบุตรหลานตัวเอง
  if (sess.role === ROLE.PARENT) {
    const myParentIds = readAll(SHEET.PARENTS)
      .filter(p => String(p.userId) === String(sess.userId))
      .map(p => String(p.id));

    const myChildIds = children
      .filter(c => myParentIds.indexOf(String(c.parentId)) >= 0)
      .map(c => String(c.id));

    visible = enrollments.filter(e => myChildIds.indexOf(String(e.childId)) >= 0);
  }

  const childMap   = indexBy(children, 'id');
  const courseMap  = indexBy(courses, 'id');
  const trainerMap = indexBy(trainers, 'id');
  const actMap     = indexBy(activities, 'sessionId');

  // นับจำนวนครั้งแยกตามการลงทะเบียน ไม่ใช่ตามคอร์ส
  // ระบบเดิมนับรวมทุกคนที่ลงคอร์สเดียวกันแล้วเอามาแสดงในแถวของเด็กแต่ละคน
  // ทำให้เด็กสามคนที่ลงคอร์สเดียวกันเห็นตัวเลขเหมือนกันหมด
  const byEnroll = groupBy(sessions, 'enrollmentId');

  const rows = visible.map(e => {
    const mine   = byEnroll[String(e.id)] || [];
    const total  = Number(e.totalSessions) || 0;
    const done   = mine.filter(s => s.status === SESSION_STATUS.COMPLETED).length;
    const booked = mine.filter(s => s.status === SESSION_STATUS.SCHEDULED).length;
    const child  = childMap[String(e.childId)]  || {};
    const course = courseMap[String(e.courseId)] || {};

    // ลบได้เฉพาะรายการที่ยังไม่มีการดำเนินการใด ๆ เลย
    // ถ้ามีนัดแล้วต้องใช้การปิดรายการแทน ไม่งั้นนัดหมาย บันทึกกิจกรรม
    // และยอดค่าสอนที่จ่ายไปแล้วจะกลายเป็นข้อมูลลอยที่หาต้นทางไม่เจอ
    const closed = String(e.status) === 'closed';

    // ประวัติการฝึก เรียงตามวันจากเก่าไปใหม่ ให้อ่านเป็นลำดับพัฒนาการ
    const history = mine.map(s => {
      const trainer = trainerMap[String(s.trainerId)] || {};
      const act     = actMap[String(s.id)] || {};
      return {
        // ส่ง id และรายละเอียดมาด้วย เพื่อให้กดแก้ไขนัดจากหน้าคอร์สได้เลย
        id:           s.id,
        enrollmentId: s.enrollmentId,
        trainerId:    s.trainerId,
        date:         s.date,
        startTime:    s.startTime,
        endTime:      s.endTime,
        location:     s.location || '',
        notes:        s.notes || '',
        status:       s.status,
        trainerName:  trainer.name || '',
        summary:      act.summary || '',
        rating:       act.rating || '',
        cancelReason: s.cancelReason || '',
        hasLog:       !!act.id,
      };
    }).sort((a, b) => String(a.date + a.startTime)
      .localeCompare(String(b.date + b.startTime)));

    return {
      id:            e.id,
      childId:       e.childId,
      childName:     child.nickname || child.name || '',
      childFullName: child.name || '',
      courseId:      e.courseId,
      courseName:    course.name || '',
      totalSessions: total,
      done:          done,
      booked:        booked,
      remaining:     Math.max(0, total - done - booked),
      state:         closed ? 'closed' : (total > 0 && done >= total ? 'completed' : 'active'),
      canDelete:     mine.length === 0,
      startDate:     e.startDate,
      expireDate:    e.expireDate,
      notes:         e.notes,
      // ราคาที่ตกลงจริง ถ้าไม่ได้ระบุไว้ให้ใช้ราคาตั้งของคอร์ส
      price:         e.price === '' || e.price === undefined
                       ? (Number(course.price) || 0) : (Number(e.price) || 0),
      coursePrice:   Number(course.price) || 0,
      trainerFee:    Number(course.trainerFee) || 0,
      history:       history,
    };
  });

  // เรียงที่ใกล้หมดไว้ก่อน เพราะเป็นรายการที่ต้องรีบชวนต่อคอร์ส
  // รายการที่ปิดหรือจบแล้วไปอยู่ท้ายสุด
  rows.sort((a, b) => {
    const rank = { active: 0, completed: 1, closed: 2 };
    return (rank[a.state] - rank[b.state]) ||
           (a.remaining - b.remaining) ||
           String(a.childName).localeCompare(String(b.childName), 'th');
  });

  // ผู้ฝึกสอนดูภาพรวมคอร์ส ไม่ใช่รายการลงทะเบียนรายคน
  // อยากรู้ว่าคอร์สไหนมีเด็กเรียนอยู่เท่าไร และตัวเองสอนไปแล้วกี่ครั้ง
  if (sess.role === ROLE.TRAINER) {
    const me = readAll(SHEET.TRAINERS)
      .find(t => String(t.userId) === String(sess.userId));

    const mine = me
      ? sessions.filter(x => String(x.trainerId) === String(me.id))
      : [];

    const byCourse = {};
    enrollments.forEach(e => {
      const k = String(e.courseId);
      if (!byCourse[k]) byCourse[k] = { enrolled: 0, active: 0 };
      byCourse[k].enrolled++;
      if (String(e.status) !== 'closed') byCourse[k].active++;
    });

    const enrollCourse = {};
    enrollments.forEach(e => { enrollCourse[String(e.id)] = String(e.courseId); });

    const myByCourse = {};
    mine.forEach(x => {
      const k = enrollCourse[String(x.enrollmentId)] || '';
      if (!myByCourse[k]) myByCourse[k] = { done: 0, upcoming: 0 };
      if (x.status === SESSION_STATUS.COMPLETED) myByCourse[k].done++;
      if (x.status === SESSION_STATUS.SCHEDULED) myByCourse[k].upcoming++;
    });

    const list = courses
      .filter(c => isTrue(c.active) || myByCourse[String(c.id)])
      .map(c => {
        const k  = String(c.id);
        const st = byCourse[k]   || { enrolled: 0, active: 0 };
        const my = myByCourse[k] || { done: 0, upcoming: 0 };
        return {
          id:            c.id,
          name:          c.name,
          description:   c.description,
          category:      c.category,
          totalSessions: Number(c.totalSessions) || 0,
          durationMin:   Number(c.durationMin) || 60,
          active:        isTrue(c.active),
          enrolled:      st.active,
          myDone:        my.done,
          myUpcoming:    my.upcoming,
          teaching:      (my.done + my.upcoming) > 0,
        };
      });

    // คอร์สที่ตัวเองสอนอยู่ขึ้นก่อน
    list.sort((a, b) => (b.teaching - a.teaching) ||
                        String(a.name).localeCompare(String(b.name), 'th'));

    return { courses: list, enrollments: [], children: [],
             canEdit: false, mode: 'trainer' };
  }

  if (!isAdmin) {
    return { courses: [], enrollments: rows, children: [],
             canEdit: false, mode: 'parent' };
  }

  // ฝั่งผู้ดูแลระบบต้องเห็นว่าคอร์สไหนมีคนเรียนอยู่กี่คน เพื่อรู้ว่าลบได้ไหม
  const enrollCount = {};
  enrollments.forEach(e => {
    const k = String(e.courseId);
    enrollCount[k] = (enrollCount[k] || 0) + 1;
  });

  const catalog = courses.map(c => Object.assign({}, c, {
    active:        isTrue(c.active),
    price:         Number(c.price) || 0,
    trainerFee:    Number(c.trainerFee) || 0,
    totalSessions: Number(c.totalSessions) || 0,
    durationMin:   Number(c.durationMin) || 0,
    enrolled:      enrollCount[String(c.id)] || 0,
  }));

  return {
    courses:     catalog,
    enrollments: rows,
    children:    children.map(c => ({ id: c.id, name: c.name, nickname: c.nickname })),
    canEdit:     true,
    mode:        'admin',
  };
}

// ── บันทึกคอร์ส ─────────────────────────────────────────────
function saveCourse(sess, p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('กรอกชื่อคอร์สก่อน');

  const total = Number(p.totalSessions) || 0;
  if (total < 1) throw new Error('จำนวนครั้งต้องมากกว่าศูนย์');

  const price = Number(p.price) || 0;
  const fee   = Number(p.trainerFee) || 0;
  if (price < 0 || fee < 0) throw new Error('ราคาและค่าสอนต้องไม่ติดลบ');

  // ค่าสอนรวมทุกครั้งไม่ควรเกินราคาคอร์ส ไม่งั้นศูนย์ขาดทุนทุกคอร์สที่ขาย
  if (fee * total > price && price > 0) {
    throw new Error('ค่าสอนรวม ' + (fee * total).toLocaleString() +
                    ' บาท มากกว่าราคาคอร์ส ' + price.toLocaleString() + ' บาท');
  }

  const fields = {
    name:          name,
    description:   String(p.description || '').trim(),
    category:      String(p.category || '').trim(),
    totalSessions: total,
    price:         price,
    trainerFee:    fee,
    durationMin:   Number(p.durationMin) || 60,
    active:        p.active === false ? false : true,
  };

  if (p.id) {
    updateRow(SHEET.COURSES, Object.assign({ id: p.id }, fields));
    audit(sess.userId, 'UPDATE', 'course', p.id);
    return { id: p.id };
  }

  const row = insertRow(SHEET.COURSES, fields);
  audit(sess.userId, 'CREATE', 'course', row.id);
  return { id: row.id };
}

// ── เปิดหรือปิดการขายคอร์ส ──────────────────────────────────
// ใช้แทนการลบ เพราะคอร์สที่เคยขายแล้วต้องคงอยู่เพื่ออ้างอิงประวัติ
function toggleCourse(sess, p) {
  const course = readOne(SHEET.COURSES, p.id);
  if (!course) throw new Error('ไม่พบคอร์ส');

  const next = !isTrue(course.active);
  updateRow(SHEET.COURSES, { id: p.id, active: next });
  audit(sess.userId, next ? 'ACTIVATE' : 'DEACTIVATE', 'course', p.id);
  return { active: next };
}

// ── ลบคอร์ส ─────────────────────────────────────────────────
function removeCourse(sess, p) {
  const used = readAll(SHEET.ENROLLMENTS)
    .filter(e => String(e.courseId) === String(p.id));

  if (used.length) {
    throw new Error('ลบไม่ได้เพราะมีการลงทะเบียนแล้ว ' + used.length +
                    ' รายการ ปิดการขายแทนได้');
  }

  deleteRow(SHEET.COURSES, p.id);
  audit(sess.userId, 'DELETE', 'course', p.id);
  return { success: true };
}

// ── บันทึกการลงทะเบียน ──────────────────────────────────────
function saveEnrollment(sess, p) {
  if (!p.childId)  throw new Error('เลือกเด็กก่อน');
  if (!p.courseId) throw new Error('เลือกคอร์สก่อน');

  const child  = readOne(SHEET.CHILDREN, p.childId);
  const course = readOne(SHEET.COURSES, p.courseId);
  if (!child)  throw new Error('ไม่พบเด็กที่เลือก');
  if (!course) throw new Error('ไม่พบคอร์สที่เลือก');

  const total = Number(p.totalSessions) || Number(course.totalSessions) || 0;
  if (total < 1) throw new Error('จำนวนครั้งต้องมากกว่าศูนย์');

  if (p.id) {
    // ลดจำนวนครั้งต่ำกว่าที่นัดไปแล้วไม่ได้ ยอดคงเหลือจะติดลบ
    const used = readAll(SHEET.SESSIONS)
      .filter(s => String(s.enrollmentId) === String(p.id) &&
                   s.status !== SESSION_STATUS.CANCELLED).length;

    if (total < used) {
      throw new Error('ลดจำนวนครั้งเหลือ ' + total + ' ไม่ได้ เพราะนัดไปแล้ว ' +
                      used + ' ครั้ง');
    }
  } else {
    // ลงคอร์สเดิมซ้ำได้เฉพาะเมื่อรายการก่อนหน้าเรียนจบหรือถูกปิดแล้ว
    // ถ้ามีสองรายการเปิดพร้อมกัน ตอนลงนัดจะไม่รู้ว่าต้องหักครั้งจากรายการไหน
    const sessions = readAll(SHEET.SESSIONS);

    const open = readAll(SHEET.ENROLLMENTS).filter(e => {
      if (String(e.childId)  !== String(p.childId))  return false;
      if (String(e.courseId) !== String(p.courseId)) return false;
      if (String(e.status) === 'closed') return false;

      const done = sessions.filter(s =>
        String(s.enrollmentId) === String(e.id) &&
        s.status === SESSION_STATUS.COMPLETED).length;

      return done < (Number(e.totalSessions) || 0);
    });

    if (open.length) {
      throw new Error((child.nickname || child.name) + ' กำลังเรียนคอร์สนี้อยู่แล้ว ' +
                      'ปิดรายการเดิมก่อนจึงจะลงใหม่ได้');
    }
  }

  const price = Number(p.price);
  if (isNaN(price) || price < 0) throw new Error('ราคาต้องเป็นตัวเลขและไม่ติดลบ');

  const fields = {
    childId:       String(p.childId),
    courseId:      String(p.courseId),
    totalSessions: total,
    price:         price,
    notes:         String(p.notes || '').trim(),
  };

  if (p.id) {
    // แก้ไขรายการเดิมไม่แตะวันที่ลงทะเบียน เพราะเป็นวันที่เกิดขึ้นจริงไปแล้ว
    updateRow(SHEET.ENROLLMENTS, Object.assign({ id: p.id }, fields));
    audit(sess.userId, 'UPDATE', 'enrollment', p.id);
    return { id: p.id };
  }

  // วันที่ลงทะเบียนคือวันที่กดบันทึก ไม่ต้องให้กรอก
  fields.startDate = todayTH();
  fields.status    = 'active';

  const row = insertRow(SHEET.ENROLLMENTS, fields);
  audit(sess.userId, 'CREATE', 'enrollment', row.id);
  return { id: row.id };
}

// ── ปิดหรือเปิดรายการลงทะเบียน ──────────────────────────────
// ใช้กับรายการที่เริ่มเรียนไปแล้วแต่เลิกกลางคัน
function closeEnrollment(sess, p) {
  const row = readOne(SHEET.ENROLLMENTS, p.id);
  if (!row) throw new Error('ไม่พบรายการลงทะเบียน');

  const next = String(row.status) === 'closed' ? 'active' : 'closed';
  updateRow(SHEET.ENROLLMENTS, { id: p.id, status: next });
  audit(sess.userId, next === 'closed' ? 'CLOSE' : 'REOPEN', 'enrollment', p.id);
  return { closed: next === 'closed' };
}

// ── ลบการลงทะเบียน ──────────────────────────────────────────
// ลบได้เฉพาะรายการที่ยังไม่มีนัดหมายเลยแม้แต่ครั้งเดียว
function removeEnrollment(sess, p) {
  const used = readAll(SHEET.SESSIONS)
    .filter(s => String(s.enrollmentId) === String(p.id));

  if (used.length) {
    throw new Error('ลบไม่ได้เพราะมีนัดหมายแล้ว ' + used.length +
                    ' ครั้ง ใช้ปิดรายการแทนเพื่อเก็บประวัติไว้');
  }

  deleteRow(SHEET.ENROLLMENTS, p.id);
  audit(sess.userId, 'DELETE', 'enrollment', p.id);
  return { success: true };
}
