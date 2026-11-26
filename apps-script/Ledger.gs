// ============================================================
// Homey Kids D Shine — Ledger.gs
// สรุปการเงิน — รายรับรายจ่ายของศูนย์ตามช่วงเวลา
// ============================================================
//
// ไฟล์นี้ไม่สร้างข้อมูลใหม่เลย อ่านจากของที่มีอยู่แล้วสองที่
//   รายรับ  — FeePayments  คือเงินค่าคอร์สที่รับจากผู้ปกครอง
//   รายจ่าย — Payouts      คือค่าสอนที่จ่ายให้ผู้ฝึกสอน
//
// ตั้งใจให้เพิ่มหมวดรายจ่ายอื่นทีหลังได้โดยไม่ต้องรื้อ
// ทุกแถวที่ส่งออกไปมีรูปร่างเดียวกันคือ { date, kind, who, what, amount, ... }
// ถ้าวันหนึ่งมีชีตค่าเช่าหรือค่าอุปกรณ์ ก็แค่แปลงให้เป็นรูปนี้แล้วต่อเข้า expense
//
// ไม่มีการคำนวณภาษีในนี้ และจะไม่มี เพราะอัตราและสิทธิลดหย่อนเปลี่ยนตามปี
// และขึ้นกับรูปแบบกิจการ หน้าที่ของไฟล์นี้คือรวมตัวเลขให้ถูกและส่งออกได้
// ส่วนการยื่นให้คนที่รู้เรื่องภาษีตัดสิน
// ============================================================

// ── ตัวช่วยเรื่องเดือน ──────────────────────────────────────
// คีย์เดือนเป็น YYYY-MM ตัดมาจากวันที่ตรง ๆ ไม่แปลงผ่าน Date
// เพราะ new Date('2026-01-05') ให้เวลา UTC แล้วบางเครื่องเลื่อนเป็นเดือนก่อน
function monthKey(iso) {
  return String(iso || '').slice(0, 7);
}

// ไล่เดือนจาก from ถึง to ให้ครบทุกเดือน รวมเดือนที่ไม่มีรายการเลย
// ต้องมีเดือนว่างด้วย ไม่งั้นตารางจะข้ามเดือนแล้วอ่านแนวโน้มผิด
function monthsBetween(from, to) {
  const out = [];
  let y = Number(String(from).slice(0, 4));
  let m = Number(String(from).slice(5, 7));
  const ey = Number(String(to).slice(0, 4));
  const em = Number(String(to).slice(5, 7));

  if (!y || !m || !ey || !em) return out;

  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 240) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function inRange(iso, from, to) {
  const d = String(iso || '').slice(0, 10);
  if (!d) return false;
  return d >= from && d <= to;
}

// ── สรุปการเงิน ─────────────────────────────────────────────
function getLedger(sess, p) {
  const today = todayTH();
  const from  = String(p && p.from ? p.from : today.slice(0, 8) + '01').slice(0, 10);
  const to    = String(p && p.to   ? p.to   : today).slice(0, 10);

  if (to < from) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');

  const inRows  = ledgerIncomeRows(from, to);
  const outRows = ledgerExpenseRows(from, to);

  // รวมยอดรายเดือน เดือนที่ไม่มีรายการก็ต้องมีแถวเป็นศูนย์
  const bucket = {};
  monthsBetween(from, to).forEach(k => { bucket[k] = { ym: k, income: 0, expense: 0 }; });

  inRows.forEach(r => {
    const k = monthKey(r.date);
    if (!bucket[k]) bucket[k] = { ym: k, income: 0, expense: 0 };
    bucket[k].income += r.amount;
  });
  outRows.forEach(r => {
    const k = monthKey(r.date);
    if (!bucket[k]) bucket[k] = { ym: k, income: 0, expense: 0 };
    bucket[k].expense += r.amount;
  });

  const months = Object.keys(bucket).sort().map(k => ({
    ym:      bucket[k].ym,
    income:  bucket[k].income,
    expense: bucket[k].expense,
    net:     bucket[k].income - bucket[k].expense,
  }));

  const sumIn  = inRows.reduce((n, r) => n + r.amount, 0);
  const sumOut = outRows.reduce((n, r) => n + r.amount, 0);

  const settings = readAll(SHEET.SETTINGS);
  const sMap = {};
  settings.forEach(r => { sMap[String(r.id)] = r.value; });

  return {
    from:  from,
    to:    to,
    today: today,
    income:  { total: sumIn,  count: inRows.length },
    expense: { total: sumOut, count: outRows.length },
    net:     sumIn - sumOut,
    months:  months,
    inRows:  inRows,
    outRows: outRows,
    center: {
      name:  CENTER_NAME,
      taxId: sMap.taxId || '',
    },
  };
}

// ── รายรับ — ค่าคอร์สที่รับจากผู้ปกครอง ─────────────────────
function ledgerIncomeRows(from, to) {
  const payments    = readAll(SHEET.FEEPAYMENTS);
  const enrollments = readAll(SHEET.ENROLLMENTS);
  const children    = readAll(SHEET.CHILDREN);
  const parents     = readAll(SHEET.PARENTS);
  const courses     = readAll(SHEET.COURSES);

  const enrollMap = indexBy(enrollments, 'id');
  const childMap  = indexBy(children, 'id');
  const parentMap = indexBy(parents, 'id');
  const courseMap = indexBy(courses, 'id');

  const rows = payments
    .filter(x => inRange(x.paidAt, from, to))
    .map(x => {
      const e      = enrollMap[String(x.enrollmentId)] || {};
      const child  = childMap[String(e.childId)]       || {};
      const parent = parentMap[String(child.parentId)] || {};
      const course = courseMap[String(e.courseId)]     || {};

      return {
        id:        x.id,
        date:      String(x.paidAt || '').slice(0, 10),
        kind:      'income',
        who:       parent.name || child.name || '',
        childName: child.nickname || child.name || '',
        what:      course.name || '',
        amount:    Number(x.amount || 0),
        method:    x.method || '',
        reference: x.reference || '',
        note:      x.note || '',
      };
    });

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return rows;
}

// ── รายจ่าย — ค่าสอนที่จ่ายให้ผู้ฝึกสอน ─────────────────────
function ledgerExpenseRows(from, to) {
  const payouts  = readAll(SHEET.PAYOUTS);
  const trainers = readAll(SHEET.TRAINERS);
  const trainerMap = indexBy(trainers, 'id');

  // นับเฉพาะรายการที่จ่ายแล้วจริง รายการที่ถูกยกเลิกถูกลบออกจากชีตไปแล้ว
  // ใช้วันที่จ่ายเป็นหลัก ถ้าไม่มีให้ถอยไปใช้วันที่สร้างรายการ
  const rows = payouts
    .filter(r => String(r.status) === PAYOUT_STATUS.PAID)
    .map(r => {
      const t = trainerMap[String(r.trainerId)] || {};
      return {
        id:         r.id,
        date:       String(r.paidAt || r.createdAt || '').slice(0, 10),
        kind:       'expense',
        category:   'ค่าสอน',
        who:        t.name || '',
        what:       'ค่าสอน ' + Number(r.classCount || 0) + ' คาบ',
        classCount: Number(r.classCount || 0),
        amount:     Number(r.amount || 0),
        method:     r.method || '',
        reference:  r.reference || '',
        note:       r.note || '',
        periodStart: r.periodStart,
        periodEnd:   r.periodEnd,
      };
    })
    .filter(r => inRange(r.date, from, to));

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return rows;
}
