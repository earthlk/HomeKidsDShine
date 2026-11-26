// ============================================================
// Homey Kids D Shine — Finance.gs
// ค่าสอนของผู้ฝึกสอน และรอบการจ่าย
// ============================================================
//
// หลักคิดสำคัญสองข้อ
//
// 1. ค่าสอนคิด "ต่อคาบ" ไม่ใช่ต่อเด็ก
//    ชีต Sessions เก็บหนึ่งแถวต่อเด็กหนึ่งคน เด็กห้าคนในคาบเดียวกัน
//    จึงเป็นห้าแถว แต่ผู้สอนสอนรอบเดียว ต้องได้ค่าสอนรอบเดียว
//    จึงต้องรวมแถวที่ ผู้สอน + คอร์ส + วัน + เวลาเริ่ม + เวลาจบ ตรงกันทั้งหมด
//    ให้เป็นคาบเดียวก่อน แล้วค่อยคิดเงิน
//
// 2. ยอดที่จ่ายไปแล้วต้องไม่เปลี่ยนตามหลัง
//    ปิดรอบแล้วเก็บยอดลงชีต Payouts เลย ไม่คำนวณใหม่ตอนเปิดดู
//    ถ้าคำนวณใหม่ วันไหนแก้อัตราค่าสอน ยอดที่จ่ายไปเมื่อเดือนก่อนจะเพี้ยนตาม
//
// ============================================================

// ── แปลง courseId:จำนวนเงิน เป็น map ────────────────────────
function parseFeeOverrides(value) {
  const map = {};
  String(value || '').split(',').forEach(part => {
    const bits = String(part).split(':');
    if (bits.length !== 2) return;
    const id  = bits[0].trim();
    const amt = Number(String(bits[1]).replace(/[^0-9.]/g, ''));
    if (id && amt >= 0 && !isNaN(amt)) map[id] = amt;
  });
  return map;
}

function buildFeeOverrides(obj) {
  return Object.keys(obj || {})
    .filter(id => obj[id] !== '' && obj[id] !== null && !isNaN(Number(obj[id])))
    .map(id => id + ':' + Number(obj[id]))
    .join(',');
}

// อัตราค่าสอนของผู้สอนคนหนึ่งในคอร์สหนึ่ง
// มีค่าเฉพาะตัวใช้ค่านั้น ไม่มีก็ใช้ค่าตั้งต้นของคอร์ส
function feeFor(trainer, course) {
  const own = parseFeeOverrides(trainer && trainer.feeOverrides);
  const id  = String((course && course.id) || '');
  if (Object.prototype.hasOwnProperty.call(own, id)) return Number(own[id]);
  return Number((course && course.trainerFee) || 0);
}

// ── รวมแถวนัดให้เป็นคาบ ─────────────────────────────────────
// คืน array ของคาบ เรียงจากใหม่ไปเก่า
function groupToClasses(rows, enrollMap, courseMap, childMap, trainerMap) {
  const bucket = {};

  rows.forEach(s => {
    const enr = enrollMap[String(s.enrollmentId)] || {};
    const key = [
      String(s.trainerId), String(enr.courseId),
      String(s.date), String(s.startTime), String(s.endTime),
    ].join('|');

    if (!bucket[key]) {
      const course  = courseMap[String(enr.courseId)] || {};
      const trainer = trainerMap[String(s.trainerId)] || {};
      bucket[key] = {
        key:         key,
        trainerId:   String(s.trainerId),
        trainerName: trainer.name || '',
        courseId:    String(enr.courseId),
        courseName:  course.name || '',
        date:        s.date,
        startTime:   s.startTime,
        endTime:     s.endTime,
        location:    s.location || '',
        children:    [],
        sessionIds:  [],
        payoutId:    String(s.payoutId || ''),
        fee:         feeFor(trainer, course),
      };
    }

    const child = childMap[String(enr.childId)] || {};
    bucket[key].children.push(child.nickname || child.name || '');
    bucket[key].sessionIds.push(String(s.id));

    // ปกติทุกแถวในคาบเดียวกันมี payoutId เท่ากัน แถวที่มีค่าถือเป็นตัวตัดสิน
    // เผื่อกรณีมีเด็กถูกเพิ่มเข้าคาบหลังปิดรอบไปแล้ว จะได้ไม่นับคาบนั้นซ้ำ
    if (!bucket[key].payoutId && s.payoutId) bucket[key].payoutId = String(s.payoutId);
  });

  const out = Object.keys(bucket).map(k => bucket[k]);
  out.sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    String(b.startTime).localeCompare(String(a.startTime)));
  return out;
}

// ── หน้าการเงิน ─────────────────────────────────────────────
// Admin เห็นทุกคน ผู้ฝึกสอนเห็นเฉพาะของตัวเอง กรองที่หลังบ้านไม่ใช่ที่หน้าจอ
//
// ช่วงวันที่ใช้กับ "รายการที่จ่ายแล้ว" เท่านั้น
// ส่วนคาบที่ค้างจ่ายส่งไปทั้งหมดเสมอ ไม่ตัดตามช่วงวัน
// เพราะถ้าตัด คาบเก่าที่ตกหล่นจะหายไปจากสายตาแล้วไม่มีใครรู้ว่ายังไม่ได้จ่าย
function getFinanceBoard(sess, p) {
  const from = String((p && p.from) || '');
  const to   = String((p && p.to)   || '');

  const trainers = readAll(SHEET.TRAINERS);
  const courses  = readAll(SHEET.COURSES);

  let myTrainerId = '';
  if (sess.role === ROLE.TRAINER) {
    const me = trainers.find(t => String(t.userId) === String(sess.userId));
    if (!me) {
      return { isTrainer: true, noProfile: true, classes: [], payouts: [], trainers: [] };
    }
    myTrainerId = String(me.id);
  }

  // คาบที่สอนและบันทึกกิจกรรมแล้ว และยังไม่เคยอยู่ในรายการจ่ายไหน
  let rows = readAll(SHEET.SESSIONS).filter(s =>
    s.status === SESSION_STATUS.COMPLETED && !String(s.payoutId || '').trim());

  if (myTrainerId) rows = rows.filter(s => String(s.trainerId) === myTrainerId);

  const classes = groupToClasses(
    rows,
    indexBy(readAll(SHEET.ENROLLMENTS), 'id'),
    indexBy(courses, 'id'),
    indexBy(readAll(SHEET.CHILDREN), 'id'),
    indexBy(trainers, 'id')
  );

  // รายการที่จ่ายแล้วในช่วงที่เลือก ดูจากวันที่ของคาบในรายการ
  let payouts = readAll(SHEET.PAYOUTS);
  if (myTrainerId) payouts = payouts.filter(x => String(x.trainerId) === myTrainerId);
  if (from) payouts = payouts.filter(x => String(x.periodEnd)   >= from);
  if (to)   payouts = payouts.filter(x => String(x.periodStart) <= to);

  const trainerMap = indexBy(trainers, 'id');
  const payoutRows = payouts.map(x => {
    const t = trainerMap[String(x.trainerId)] || {};
    return {
      id:          x.id,
      trainerId:   x.trainerId,
      trainerName: t.name || '',
      periodStart: x.periodStart,
      periodEnd:   x.periodEnd,
      classCount:  Number(x.classCount || 0),
      amount:      Number(x.amount || 0),
      status:      x.status,
      method:      x.method,
      reference:   x.reference,
      note:        x.note,
      paidAt:      x.paidAt,
      // เลขบัญชีให้เฉพาะผู้ดูแลระบบ ผู้สอนรู้บัญชีตัวเองอยู่แล้ว
      bank: sess.role === ROLE.ADMIN ? {
        name:    t.bankName || '',
        no:      t.bankAccountNo || '',
        accName: t.bankAccountName || '',
      } : null,
    };
  });

  payoutRows.sort((a, b) =>
    String(b.paidAt || b.periodEnd).localeCompare(String(a.paidAt || a.periodEnd)));

  return {
    isTrainer: sess.role === ROLE.TRAINER,
    today:     todayTH(),
    classes:   classes,
    payouts:   payoutRows,
    trainers:  trainers
      .filter(t => t.active === '' || isTrue(t.active))
      .map(t => ({ id: t.id, name: t.name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'th')),
  };
}

// ── บันทึกการจ่ายค่าสอน ─────────────────────────────────────
// รับรายการคาบที่ผู้ดูแลระบบติ๊กเลือกมา ไม่ได้กวาดทั้งช่วงวันเอง
// เพราะบางคาบอาจยังติดปัญหา รอเคลียร์กับครูก่อน แล้วค่อยจ่ายทีหลัง
//
// ติ๊กเลือกแล้วจ่ายจบในขั้นตอนเดียว ไม่มีสถานะ "ปิดรอบแล้วรอโอน" คั่นกลาง
// เพราะในทางปฏิบัติคนกดปิดรอบคือคนโอนเงิน กดสองรอบไม่ได้เพิ่มอะไร
// ถ้าจ่ายผิดให้ยกเลิกรายการ คาบจะกลับไปอยู่ในยอดค้างจ่ายเหมือนเดิม
//
// sessionIds คือแถวของเด็กทุกคนในคาบที่เลือก หน้าเว็บส่งมาให้ครบแล้ว
// แต่ยังต้องตรวจซ้ำทุกแถวที่นี่ เพราะหน้าเว็บแก้ค่าที่ส่งมาได้
function createPayout(sess, p) {
  const trainerId = String(p.trainerId || '').trim();
  if (!trainerId) throw new Error('เลือกผู้ฝึกสอนก่อน');

  const method = String(p.method || '').trim();
  if (['transfer', 'cash'].indexOf(method) < 0) throw new Error('เลือกวิธีจ่ายก่อน');

  const reference = String(p.reference || '').trim();
  if (method === 'transfer' && !reference) {
    throw new Error('ใส่เลขอ้างอิงการโอนก่อน ดูได้จากสลิป');
  }

  const trainer = readOne(SHEET.TRAINERS, trainerId);
  if (!trainer) throw new Error('ไม่พบผู้ฝึกสอน');

  const want = {};
  [].concat(p.sessionIds || []).forEach(id => { want[String(id)] = true; });
  if (!Object.keys(want).length) throw new Error('เลือกคาบที่จะจ่ายอย่างน้อยหนึ่งคาบ');

  const rows = readAll(SHEET.SESSIONS).filter(s => want[String(s.id)]);

  // แถวที่ส่งมาแต่หาไม่เจอ แปลว่าถูกลบไปแล้วระหว่างที่เปิดหน้าค้างไว้
  if (rows.length !== Object.keys(want).length) {
    throw new Error('มีคาบที่เลือกไว้ถูกลบไปแล้ว กดรีเฟรชแล้วเลือกใหม่');
  }

  rows.forEach(s => {
    if (String(s.trainerId) !== trainerId) {
      throw new Error('มีคาบที่ไม่ใช่ของ' + trainer.name + 'ปนมา กดรีเฟรชแล้วเลือกใหม่');
    }
    if (s.status !== SESSION_STATUS.COMPLETED) {
      throw new Error('มีคาบที่ยังไม่ได้บันทึกกิจกรรมปนมา จ่ายได้เฉพาะคาบที่สอนแล้ว');
    }
    if (String(s.payoutId || '').trim()) {
      throw new Error('มีคาบที่จ่ายไปแล้ว กดรีเฟรชแล้วเลือกใหม่');
    }
  });

  const courses  = readAll(SHEET.COURSES);
  const classes  = groupToClasses(
    rows,
    indexBy(readAll(SHEET.ENROLLMENTS), 'id'),
    indexBy(courses, 'id'),
    indexBy(readAll(SHEET.CHILDREN), 'id'),
    indexBy([trainer], 'id')
  );

  // ช่วงวันของรอบมาจากคาบที่เลือกจริง ไม่ใช่ช่วงที่กรองหน้าจอไว้
  // ใบสรุปจะได้ตรงกับของที่จ่ายจริง ไม่ใช่ช่วงที่บังเอิญเปิดดูอยู่
  const dates = classes.map(c => String(c.date)).sort();
  const from  = dates[0];
  const to    = dates[dates.length - 1];

  const amount = classes.reduce((sum, c) => sum + Number(c.fee || 0), 0);

  const payout = insertRow(SHEET.PAYOUTS, {
    trainerId:   trainerId,
    periodStart: from,
    periodEnd:   to,
    classCount:  classes.length,
    amount:      amount,
    status:      PAYOUT_STATUS.PAID,
    method:      method,
    reference:   method === 'cash' ? '' : reference,
    note:        String(p.note || '').trim(),
    paidAt:      nowTH(),
    paidBy:      String(sess.userId),
  });

  // ติดหมายเลขรอบให้ทุกแถวของทุกคาบที่รวมเข้ามา
  // ถ้าขั้นนี้พลาดกลางคัน จะมีคาบที่ยังไม่ติดหมายเลขค้างอยู่
  // รอบถัดไปจะเก็บคาบเหล่านั้นไปเอง ไม่หายไปไหน
  classes.forEach(c => {
    c.sessionIds.forEach(id => updateRow(SHEET.SESSIONS, { id: id, payoutId: payout.id }));
  });

  audit(sess.userId, 'PAY_TRAINER', 'payout', payout.id);
  return { id: payout.id, classCount: classes.length, amount: amount, trainerName: trainer.name };
}

// ── แก้ไขข้อมูลการจ่ายที่บันทึกไปแล้ว ───────────────────────
// ใช้ตอนกรอกเลขอ้างอิงผิด หรือจำวิธีจ่ายสลับกัน
// แก้ได้เฉพาะรายละเอียดการจ่าย ไม่แตะยอดเงินกับรายการคาบ
// ถ้าจ่ายผิดคนหรือผิดคาบต้องยกเลิกรายการแล้วทำใหม่
function markPayoutPaid(sess, p) {
  const payout = readOne(SHEET.PAYOUTS, p.id);
  if (!payout) throw new Error('ไม่พบรายการจ่าย');

  const method = String(p.method || '').trim();
  if (['transfer', 'cash'].indexOf(method) < 0) throw new Error('เลือกวิธีจ่ายก่อน');

  const reference = String(p.reference || '').trim();
  if (method === 'transfer' && !reference) {
    throw new Error('ใส่เลขอ้างอิงการโอนก่อน ดูได้จากสลิป');
  }

  updateRow(SHEET.PAYOUTS, {
    id:        p.id,
    status:    PAYOUT_STATUS.PAID,
    method:    method,
    reference: method === 'cash' ? '' : reference,
    note:      String(p.note || '').trim(),
  });

  audit(sess.userId, 'EDIT_PAYOUT', 'payout', p.id);
  return { success: true };
}

// ── ยกเลิกรายการจ่าย ────────────────────────────────────────
// คืนคาบทั้งหมดกลับเข้ายอดค้างจ่าย ใช้ตอนจ่ายผิดคนหรือเลือกคาบผิด
// ยกเลิกได้แม้บันทึกว่าจ่ายแล้ว เพราะไม่มีสถานะกลางให้แก้อีกทาง
// ตัวรายการหายไปเลย ไม่เก็บไว้เป็นประวัติ ร่องรอยอยู่ใน AuditLog
function cancelPayout(sess, p) {
  const payout = readOne(SHEET.PAYOUTS, p.id);
  if (!payout) throw new Error('ไม่พบรายการจ่าย');

  readAll(SHEET.SESSIONS)
    .filter(s => String(s.payoutId || '') === String(p.id))
    .forEach(s => updateRow(SHEET.SESSIONS, { id: s.id, payoutId: '' }));

  deleteRow(SHEET.PAYOUTS, p.id);
  audit(sess.userId, 'CANCEL_PAYOUT', 'payout', p.id);
  return { success: true };
}

// ── รายละเอียดของรายการจ่ายหนึ่งรายการ ──────────────────────
// แจกแจงว่ารายการนี้จ่ายคาบไหนบ้าง ผู้สอนเปิดดูของตัวเองได้
function getPayoutDetail(sess, p) {
  const payout = readOne(SHEET.PAYOUTS, p.id);
  if (!payout) throw new Error('ไม่พบรายการจ่าย');

  const trainers = readAll(SHEET.TRAINERS);
  const trainer  = indexBy(trainers, 'id')[String(payout.trainerId)] || {};

  if (sess.role === ROLE.TRAINER && String(trainer.userId) !== String(sess.userId)) {
    throw new Error('ดูได้เฉพาะรายการจ่ายของตัวเอง');
  }
  if (sess.role === ROLE.PARENT) throw new Error('บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้');

  const rows = readAll(SHEET.SESSIONS)
    .filter(s => String(s.payoutId || '') === String(p.id));

  const classes = groupToClasses(
    rows,
    indexBy(readAll(SHEET.ENROLLMENTS), 'id'),
    indexBy(readAll(SHEET.COURSES), 'id'),
    indexBy(readAll(SHEET.CHILDREN), 'id'),
    indexBy(trainers, 'id')
  );

  return {
    payout: {
      id:          payout.id,
      trainerName: trainer.name || '',
      periodStart: payout.periodStart,
      periodEnd:   payout.periodEnd,
      classCount:  Number(payout.classCount || 0),
      amount:      Number(payout.amount || 0),
      status:      payout.status,
      method:      payout.method,
      reference:   payout.reference,
      note:        payout.note,
      paidAt:      payout.paidAt,
      bank: {
        name:    trainer.bankName || '',
        no:      trainer.bankAccountNo || '',
        accName: trainer.bankAccountName || '',
      },
    },
    // ยอดรวมของคาบที่แจกแจงอาจไม่เท่า amount ถ้ามีการแก้อัตราค่าสอนหลังปิดรอบ
    // ตัวเลขที่ถือเป็นจริงคือ amount ที่ตรึงไว้ตอนปิดรอบ
    classes: classes,
  };
}

// ════════════════════════════════════════════════════════════
// เงินเข้า — ค่าคอร์สที่รับจากผู้ปกครอง
// ════════════════════════════════════════════════════════════
//
// ตัวตั้งหนี้คือ "รายการลงทะเบียน" ไม่ใช่คอร์ส
// เพราะราคาตกลงกันเป็นรายคน ลดให้พี่น้องหรือซื้อไม่เต็มแพ็กเกจได้
//
// แบ่งจ่ายกี่งวดก็ได้ แต่ละงวดเป็นหนึ่งแถวในชีต FeePayments
// ยอดค้าง = ราคา ลบ ผลรวมของงวดที่รับมาแล้ว คำนวณสดทุกครั้ง ไม่เก็บเป็นคอลัมน์
//
// ── สถานะการชำระของรายการหนึ่ง ─────────────────────────────
// ⚠️ ราคาเป็นศูนย์ไม่ได้แปลว่าจ่ายครบ แปลว่ายังไม่ได้ตั้งราคา
// รายการที่ลงทะเบียนก่อนมีคอลัมน์ price หรือคอร์สที่ยังไม่ได้ใส่ราคาจะเข้าเคสนี้
// ถ้าปล่อยให้ตกไปอยู่กับ "ครบแล้ว" เงินที่ควรเก็บจะหายไปเงียบ ๆ โดยไม่มีใครรู้
function feeStatusOf(price, paid) {
  if (Number(price) <= 0)           return FEE_STATUS.NOPRICE;
  if (Number(paid)  <= 0)           return FEE_STATUS.UNPAID;
  if (Number(paid) >= Number(price)) return FEE_STATUS.PAID;
  return FEE_STATUS.PARTIAL;
}

// ── หน้ารับเงิน ─────────────────────────────────────────────
// Admin เห็นทุกคน ผู้ปกครองเห็นเฉพาะบุตรหลานของตัวเอง
function getIncomeBoard(sess, p) {
  const enrollments = readAll(SHEET.ENROLLMENTS);
  const children    = readAll(SHEET.CHILDREN);
  const parents     = readAll(SHEET.PARENTS);
  const courses     = readAll(SHEET.COURSES);
  const payments    = readAll(SHEET.FEEPAYMENTS);

  let visible = enrollments;

  if (sess.role === ROLE.PARENT) {
    const myParentIds = parents
      .filter(x => String(x.userId) === String(sess.userId))
      .map(x => String(x.id));

    const myChildIds = children
      .filter(c => myParentIds.indexOf(String(c.parentId)) >= 0)
      .map(c => String(c.id));

    visible = enrollments.filter(e => myChildIds.indexOf(String(e.childId)) >= 0);
  }

  const childMap  = indexBy(children, 'id');
  const parentMap = indexBy(parents, 'id');
  const courseMap = indexBy(courses, 'id');
  const byEnroll  = groupBy(payments, 'enrollmentId');

  const rows = visible.map(e => {
    const child  = childMap[String(e.childId)]     || {};
    const parent = parentMap[String(child.parentId)] || {};
    const course = courseMap[String(e.courseId)]   || {};

    // ราคาที่ตกลงกันจริงของรายการนี้ ถ้าไม่ได้ระบุใช้ราคาตั้งของคอร์ส
    const price = Number(e.price !== '' && e.price !== null && e.price !== undefined
      ? e.price : (course.price || 0));

    const mine = (byEnroll[String(e.id)] || []).slice()
      .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));

    const paid = mine.reduce((sum, x) => sum + Number(x.amount || 0), 0);

    return {
      id:          e.id,
      childId:     e.childId,
      childName:   child.nickname || child.name || '',
      childFull:   child.name || '',
      parentName:  parent.name || '',
      courseName:  course.name || '',
      startDate:   e.startDate,
      price:       price,
      paid:        paid,
      due:         Math.max(0, price - paid),
      status:      feeStatusOf(price, paid),
      // ประวัติการจ่าย ผู้ปกครองดูของตัวเองได้ ไม่ต้องรอถาม
      payments: mine.map(x => ({
        id:        x.id,
        amount:    Number(x.amount || 0),
        method:    x.method,
        reference: x.reference,
        note:      x.note,
        paidAt:    x.paidAt,
      })),
    };
  });

  // รายการที่ยังไม่ได้ตั้งราคาอยู่บนสุด เพราะต้องแก้ก่อนถึงจะเก็บเงินได้
  // ถัดมาค้างมากอยู่บน แล้วค่อยเรียงตามวันที่ลงทะเบียน
  const rank = (r) => r.status === FEE_STATUS.NOPRICE ? 0 : 1;
  rows.sort((a, b) =>
    (rank(a) - rank(b)) ||
    (b.due - a.due) ||
    String(b.startDate).localeCompare(String(a.startDate)));

  return {
    isParent: sess.role === ROLE.PARENT,
    today:    todayTH(),
    rows:     rows,
  };
}

// ── บันทึกรับเงินหนึ่งงวด ───────────────────────────────────
function recordPayment(sess, p) {
  const enrollment = readOne(SHEET.ENROLLMENTS, p.enrollmentId);
  if (!enrollment) throw new Error('ไม่พบรายการลงทะเบียน');

  const amount = Number(p.amount);
  if (!amount || isNaN(amount) || amount <= 0) throw new Error('ใส่จำนวนเงินที่รับก่อน');

  // ไม่มีราคาก็ไม่รู้ว่ารับครบหรือยัง ต้องไปตั้งราคาที่รายการลงทะเบียนก่อน
  const priceCheck = Number(enrollment.price !== '' && enrollment.price !== null &&
    enrollment.price !== undefined ? enrollment.price
    : ((readOne(SHEET.COURSES, enrollment.courseId) || {}).price || 0));
  if (priceCheck <= 0) {
    throw new Error('รายการนี้ยังไม่ได้ตั้งราคา แก้ราคาที่หน้าคอร์ส > รายการลงทะเบียน ก่อน');
  }

  const method = String(p.method || '').trim();
  if (['transfer', 'cash'].indexOf(method) < 0) throw new Error('เลือกวิธีรับเงินก่อน');

  const reference = String(p.reference || '').trim();
  if (method === 'transfer' && !reference) {
    throw new Error('ใส่เลขอ้างอิงการโอนก่อน ดูได้จากสลิป');
  }

  const paidAt = String(p.paidAt || '').trim() || todayTH();
  if (paidAt > todayTH()) throw new Error('วันที่รับเงินเป็นวันในอนาคตไม่ได้');

  // กันรับเกินราคาที่ตกลงไว้ ถ้าจะคืนเงินให้ลบงวดเดิมแล้วบันทึกใหม่
  const course = readOne(SHEET.COURSES, enrollment.courseId) || {};
  const price  = Number(enrollment.price !== '' && enrollment.price !== null &&
    enrollment.price !== undefined ? enrollment.price : (course.price || 0));

  const already = readAll(SHEET.FEEPAYMENTS)
    .filter(x => String(x.enrollmentId) === String(p.enrollmentId))
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);

  if (already + amount > price) {
    throw new Error('รับเกินยอดที่ต้องชำระ เหลือค้างอีก ' + (price - already) + ' บาท');
  }

  const row = insertRow(SHEET.FEEPAYMENTS, {
    enrollmentId: String(p.enrollmentId),
    amount:       amount,
    method:       method,
    reference:    method === 'cash' ? '' : reference,
    note:         String(p.note || '').trim(),
    paidAt:       paidAt,
    recordedBy:   String(sess.userId),
  });

  audit(sess.userId, 'RECORD_PAYMENT', 'enrollment', p.enrollmentId);
  return { id: row.id, paid: already + amount, due: Math.max(0, price - already - amount) };
}

// ── ลบงวดที่บันทึกผิด ───────────────────────────────────────
// ไม่มีการแก้ไขงวด เพราะแก้แล้วประวัติจะไม่ตรงกับสลิปที่เก็บไว้
// ลบแล้วบันทึกใหม่ชัดเจนกว่า และ AuditLog จะเห็นทั้งสองรายการ
function removePayment(sess, p) {
  const all = readAll(SHEET.FEEPAYMENTS);
  const row = all.find(x => String(x.id) === String(p.id));
  if (!row) throw new Error('ไม่พบรายการรับเงิน');

  deleteRow(SHEET.FEEPAYMENTS, p.id);
  audit(sess.userId, 'DELETE_PAYMENT', 'enrollment', row.enrollmentId);
  return { success: true };
}

// ── คาบนี้อยู่ในรอบที่จ่ายเงินไปแล้วหรือยัง ─────────────────
// ใช้กันไม่ให้ลบบันทึกกิจกรรมของคาบที่จ่ายค่าสอนไปแล้ว
// เพราะลบแล้วนัดจะกลับเป็น "ยังไม่สอน" ทั้งที่จ่ายค่าสอนไปแล้ว
function paidPayoutOf(sessionId) {
  const row = readOne(SHEET.SESSIONS, sessionId);
  const id  = row && String(row.payoutId || '').trim();
  if (!id) return null;

  const payout = readOne(SHEET.PAYOUTS, id);
  if (!payout) return null;
  return payout.status === PAYOUT_STATUS.PAID ? payout : null;
}
