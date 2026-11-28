// ============================================================
// Homey Kids D Shine — Dashboard.gs
// หน้าภาพรวม
// ============================================================
//
// หลักของหน้านี้: ทุกตัวเลขต้องกดเข้าไปทำอะไรต่อได้
// ถ้าเห็นแล้วไม่รู้ว่าต้องทำอะไร ตัวเลขนั้นไม่ควรอยู่บนหน้านี้
// จำนวนเด็กทั้งหมด จำนวนคอร์สทั้งหมด รายได้สะสม เป็นตัวเลขประเภทที่ดูแล้วจบ
// ไม่ได้บอกว่าวันนี้ต้องลงมือทำอะไร จึงไม่เอาขึ้นหน้าแรก
//
// ตัวเลขทุกตัวดึงจากฟังก์ชันของหน้าจริง ไม่คำนวณใหม่เอง
// ถ้าคำนวณใหม่ วันหนึ่งสูตรสองที่จะต่างกัน แล้วหน้าแรกกับหน้าจริงจะตอบไม่ตรงกัน
// ซึ่งแย่กว่าไม่มีหน้าแรกเลย เพราะคนจะเลิกเชื่อทั้งสองหน้า
//
// ค่าใช้จ่ายของการทำแบบนี้คือการอ่านชีตเดิมซ้ำหลายรอบในคำขอเดียว
// แก้ด้วยแคชระดับคำขอใน Utils.gs ซึ่งล้างทุกครั้งที่มีการเขียน
// ============================================================

function getDashboard(sess) {
  const today = todayTH();

  const base = {
    role:  sess.role,
    name:  sess.name,
    today: today,
  };

  if (sess.role === ROLE.ADMIN)   return Object.assign(base, adminBoard(sess, today));
  if (sess.role === ROLE.TRAINER) return Object.assign(base, trainerBoard(sess, today));
  return Object.assign(base, parentBoard(sess, today));
}

// ── ตารางของวันนี้ ──────────────────────────────────────────
// รวมคาบที่เวลาเดียวกันคอร์สเดียวกันผู้สอนคนเดียวกันเป็นแถวเดียว
// เพราะนั่นคือหนึ่งคาบสอนจริง ไม่ใช่สามคาบ แค่มีเด็กสามคน
function todayClasses(sess, today) {
  const rows = readAll(SHEET.SESSIONS)
    .filter(s => String(s.date) === today && s.status !== SESSION_STATUS.CANCELLED);

  if (!rows.length) return [];

  const childMap   = indexBy(readAll(SHEET.CHILDREN), 'id');
  const courseMap  = indexBy(readAll(SHEET.COURSES), 'id');
  const trainerMap = indexBy(readAll(SHEET.TRAINERS), 'id');
  const enrollMap  = indexBy(readAll(SHEET.ENROLLMENTS), 'id');

  const groups = {};
  rows.forEach(s => {
    // คาบไม่ได้เก็บ courseId ไว้เอง ต้องเดินผ่านใบลงทะเบียน
    // หนึ่งแถวในชีตคาบ = เด็กหนึ่งคนในคาบหนึ่งคาบ คอร์สจึงมาจากใบลงทะเบียนของเด็กคนนั้น
    const enr   = enrollMap[String(s.enrollmentId)] || {};
    const child = childMap[String(enr.childId)] || {};
    const key   = [s.trainerId, enr.courseId, s.startTime, s.endTime].join('|');

    if (!groups[key]) {
      groups[key] = {
        key:         key,
        startTime:   s.startTime,
        endTime:     s.endTime,
        courseName:  (courseMap[String(enr.courseId)] || {}).name || '',
        trainerId:   s.trainerId || '',
        trainerName: (trainerMap[String(s.trainerId)] || {}).name || '',
        location:    s.location || '',
        kids:        [],
        alerts:      [],
        checked:     0,
      };
    }

    const g = groups[key];

    g.kids.push(child.nickname || child.name || '');
    if (s.attendance) g.checked++;

    // ข้อควรระวังของทุกคนในคาบ รวมไว้ที่คาบ ตัดที่ซ้ำออก
    childAlerts(child).forEach(a => {
      if (g.alerts.indexOf(a) < 0) g.alerts.push(a);
    });
  });

  return Object.keys(groups).map(k => groups[k])
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
}

// จำนวนคาบที่ยังไม่ได้บันทึกกิจกรรม นับเป็น "คาบ" ไม่ใช่ "แถวเด็ก"
// เพราะหน้าบันทึกกิจกรรมรวมเด็กที่เรียนคาบเดียวกันเป็นรายการเดียว
// ถ้าหน้าแรกบอก 12 แล้วกดเข้าไปเห็น 11 รายการ คนจะเริ่มไม่เชื่อตัวเลขบนหน้าแรก
// คีย์ต้องตรงกับที่ js/activity.js ใช้จัดกลุ่มเป๊ะ ๆ
function unloggedClasses(activity) {
  const seen = {};
  let n = 0;
  activity.rows.forEach(r => {
    if (r.logged) return;
    const key = [r.date, r.startTime, r.endTime, r.courseName, r.trainerId].join('|');
    if (seen[key]) return;
    seen[key] = true;
    n++;
  });
  return n;
}

// ── ผู้ดูแลระบบ ─────────────────────────────────────────────
function adminBoard(sess, today) {
  const att      = getAttendanceBoard(sess, {});
  const activity = getActivityBoard(sess, {});
  const income   = getIncomeBoard(sess, {});
  const courses  = getCourseBoard(sess, {});

  // คาบที่จ่ายเงินมาแล้วแต่ยังไม่มีวัน เป็นหนี้ที่ศูนย์ติดผู้ปกครองอยู่
  // ไม่ใช่หนี้เงิน แต่เป็นหนี้คาบสอน และเป็นของค้างที่เงียบที่สุด
  // เพราะไม่มีใครทวง จนกว่าผู้ปกครองจะถามว่าทำไมยังไม่ได้เรียนสักที
  let unbooked = 0;
  let unbookedKids = 0;
  courses.enrollments.forEach(e => {
    if (e.state !== 'active') return;
    const left = Number(e.remaining) || 0;
    if (left > 0) { unbooked += left; unbookedKids++; }
  });

  const noTrainer = courses.enrollments
    .filter(e => !e.trainerId && e.state !== 'closed').length;

  // แท็บค้างชำระในหน้ารับเงินคือทุกรายการที่ยังไม่ครบ ซึ่งรวมรายการที่ยังไม่ตั้งราคา
  // ตัวเลขบนหน้าแรกต้องนับแบบเดียวกัน ไม่งั้นกดเข้าไปแล้วเห็นคนละจำนวน
  const unpaid   = income.rows.filter(r => r.status !== FEE_STATUS.PAID);
  const dueTotal = income.rows.reduce((s, r) => s + r.due, 0);
  const noPrice  = income.rows.filter(r => r.status === FEE_STATUS.NOPRICE).length;

  // ค่าสอนที่ค้างจ่าย ดูจากรอบที่สร้างแล้วแต่ยังไม่ได้ทำจ่าย
  const payoutDue = readAll(SHEET.PAYOUTS)
    .filter(p => String(p.status || '') !== 'paid' && String(p.status || '') !== 'cancelled');
  const payoutTotal = payoutDue.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // ลำดับความด่วนกำหนดเองที่นี่ ไม่เรียงตามจำนวน
  // เพราะจำนวนไม่ได้แปลว่าสำคัญกว่า บันทึกกิจกรรมค้าง 12 คาบ
  // ไม่ได้ด่วนกว่าเงินที่ยังเก็บไม่ได้ 17,000 บาท
  //   1 ตั้งราคา   ติดอยู่ตรงนี้คือเก็บเงินไม่ได้เลย
  //   2 เช็กชื่อ    ค้างอยู่คือค่าสอน คาบคงเหลือ และบันทึกกิจกรรมเดินต่อไม่ได้
  //   3-4 เงิน      เข้าและออก
  //   5 ตัดสินคาบ   กระทบจำนวนคาบที่ผู้ปกครองจ่ายมาแล้ว
  //   6 คาบที่ยังไม่นัด  ศูนย์ติดหนี้คาบสอนอยู่ แต่ยังไม่มีใครทวง
  //   7 ผู้สอน      งานจัดระเบียบ
  //   8 บันทึกกิจกรรม  สำคัญ แต่ช้าได้ที่สุดในกองนี้
  return {
    classes: todayClasses(sess, today),
    jobs: [
      { id: 'attend-unchecked', page: 'attendance', tab: 'unchecked', rank: 2,
        n: att.unchecked.length + att.todayRows.length,
        label: 'คาบที่ยังไม่ได้เช็กชื่อ',
        tone: att.unchecked.length ? 'alert' : 'warn',
        sub: att.unchecked.length
          ? 'ค้างมาจากวันก่อน ' + att.unchecked.length + ' คาบ' : 'ของวันนี้' },
      { id: 'attend-pending', page: 'attendance', tab: 'pending', rank: 5,
        n: att.pending.length, label: 'คาบที่เด็กขาด รอตัดสินว่าจะคืนคาบหรือตัดคาบ', tone: 'warn' },
      { id: 'activity', page: 'activity', tab: 'pending', rank: 8,
        n: unloggedClasses(activity),
        label: 'คาบที่สอนแล้วยังไม่ได้บันทึกกิจกรรม', tone: 'warn' },
      { id: 'noprice', page: 'income', tab: 'noprice', rank: 1,
        n: noPrice, label: 'รายการที่ยังไม่ได้ตั้งราคา เก็บเงินไม่ได้จนกว่าจะตั้ง', tone: 'alert' },
      { id: 'due', page: 'income', tab: 'due', rank: 3,
        n: unpaid.length, label: 'รายการที่ยังเก็บเงินไม่ครบ', tone: 'warn',
        sub: dueTotal ? 'รวม ' + Math.round(dueTotal).toLocaleString() + ' บาท' : '' },
      { id: 'payout', page: 'payouts', tab: 'due', rank: 4,
        n: payoutDue.length, label: 'รอบค่าสอนที่ยังไม่ได้จ่าย', tone: 'warn',
        sub: payoutTotal ? 'รวม ' + Math.round(payoutTotal).toLocaleString() + ' บาท' : '' },
      { id: 'unbooked', page: 'courses', tab: 'active', rank: 6,
        n: unbookedKids, label: 'เด็กที่จ่ายเงินมาแล้วแต่ยังมีคาบที่ไม่ได้นัด', tone: 'warn',
        sub: unbooked ? 'รวม ' + unbooked + ' คาบ' : '' },
      { id: 'notrainer', page: 'courses', tab: 'noTrainer', rank: 7,
        n: noTrainer, label: 'การลงทะเบียนที่ยังไม่ได้กำหนดผู้สอน', tone: 'warn' },
    ].filter(j => j.n > 0),
  };
}

// ── ผู้ฝึกสอน ───────────────────────────────────────────────
function trainerBoard(sess, today) {
  const att      = getAttendanceBoard(sess, {});
  const activity = getActivityBoard(sess, {});

  if (att.noProfile) {
    return { classes: [], jobs: [], noProfile: true };
  }

  // ของตัวเองเท่านั้น เทียบด้วย id ไม่ใช่ชื่อ เพราะชื่อซ้ำกันได้
  const me = readAll(SHEET.TRAINERS)
    .find(t => String(t.userId) === String(sess.userId));
  const mine = todayClasses(sess, today)
    .filter(c => me && String(c.trainerId) === String(me.id));

  return {
    classes: mine,
    jobs: [
      { id: 'attend-unchecked', page: 'attendance', tab: 'unchecked', rank: 1,
        n: att.unchecked.length + att.todayRows.length,
        label: 'คาบที่ยังไม่ได้เช็กชื่อ',
        tone: att.unchecked.length ? 'alert' : 'warn',
        sub: att.unchecked.length
          ? 'ค้างมาจากวันก่อน ' + att.unchecked.length + ' คาบ' : 'ของวันนี้' },
      { id: 'activity', page: 'activity', tab: 'pending', rank: 2,
        n: unloggedClasses(activity),
        label: 'คาบที่สอนแล้วยังไม่ได้บันทึกกิจกรรม', tone: 'warn' },
    ].filter(j => j.n > 0),
  };
}

// ── ผู้ปกครอง ───────────────────────────────────────────────
// ผู้ปกครองไม่มีงานค้างให้เคลียร์ สิ่งที่อยากรู้คือ
// นัดหน้าเมื่อไหร่ ลูกเรียนไปถึงไหนแล้ว และต้องจ่ายอะไรอีกไหม
function parentBoard(sess, today) {
  const people = getPeople(sess);
  const income = getIncomeBoard(sess, {});

  const myChildIds = people.children.map(c => String(c.id));
  const enrollMine = readAll(SHEET.ENROLLMENTS)
    .filter(e => myChildIds.indexOf(String(e.childId)) >= 0)
    .map(e => String(e.id));

  const childMap  = indexBy(people.children, 'id');
  const enrollMap = indexBy(readAll(SHEET.ENROLLMENTS), 'id');
  const courseMap = indexBy(readAll(SHEET.COURSES), 'id');

  const next = readAll(SHEET.SESSIONS)
    .filter(s => enrollMine.indexOf(String(s.enrollmentId)) >= 0 &&
                 s.status === SESSION_STATUS.SCHEDULED &&
                 String(s.date) >= today)
    .sort((a, b) => (String(a.date) + a.startTime)
      .localeCompare(String(b.date) + b.startTime))
    .slice(0, 5)
    .map(s => {
      const enr   = enrollMap[String(s.enrollmentId)] || {};
      const child = childMap[String(enr.childId)] || {};
      return {
        date:       s.date,
        startTime:  s.startTime,
        endTime:    s.endTime,
        childName:  child.nickname || child.name || '',
        courseName: (courseMap[String(enr.courseId)] || {}).name || '',
        location:   s.location || '',
        isToday:    String(s.date) === today,
      };
    });

  const due = income.rows.filter(r => r.due > 0);

  return {
    next:     next,
    children: people.children.map(c => ({
      id:      c.id,
      name:    c.nickname || c.name,
      courses: c.courses || [],
    })),
    due:      due.map(r => ({
      childName:  r.childName,
      courseName: r.courseName,
      due:        r.due,
      price:      r.price,
      paid:       r.paid,
    })),
    dueTotal: due.reduce((s, r) => s + r.due, 0),
  };
}
