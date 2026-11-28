// ============================================================
// Homey Kids D Shine — Settings.gs
// ค่าตั้งของศูนย์ และ QR พร้อมเพย์แบบล็อคยอด
// ============================================================
//
// เก็บเป็นคู่ชื่อ-ค่าในชีต Settings ไม่ใช่คอลัมน์ละเรื่อง
// เพิ่มค่าใหม่ทีหลังได้โดยไม่ต้องแตะ schema และคอลัมน์เดิมไม่เลื่อน
// ============================================================

// รายการค่าที่ระบบรู้จัก ค่าที่ไม่อยู่ในนี้จะถูกปฏิเสธ
// กันคนยิงคำสั่งมาเขียนค่าแปลก ๆ ลงชีต
var SETTING_KEYS = {
  promptpayId:   true,   // เบอร์มือถือ หรือเลขประจำตัวผู้เสียภาษี
  promptpayName: true,   // ชื่อที่จะขึ้นในแอปธนาคารของคนโอน
  centerPhone:   true,
  centerAddress: true,
  taxId:         true,
};

// ── อ่านค่าทั้งหมด ──────────────────────────────────────────
function readSettings() {
  const out = {};
  Object.keys(SETTING_KEYS).forEach(k => { out[k] = ''; });

  readAll(SHEET.SETTINGS).forEach(row => {
    const k = String(row.id || '').trim();
    if (SETTING_KEYS[k]) out[k] = String(row.value === null || row.value === undefined
      ? '' : row.value);
  });
  return out;
}

function getSettings(sess) {
  const all = readSettings();

  // ผู้ปกครองต้องเห็นพร้อมเพย์เพื่อสแกนจ่าย แต่ไม่ต้องเห็นเลขผู้เสียภาษีของศูนย์
  if (sess.role !== ROLE.ADMIN) {
    return {
      promptpayId:   all.promptpayId,
      promptpayName: all.promptpayName,
      readOnly:      true,
    };
  }
  return Object.assign({ readOnly: false }, all);
}

// ── บันทึกค่า ───────────────────────────────────────────────
function saveSettings(sess, p) {
  const incoming = p || {};
  const current  = indexBy(readAll(SHEET.SETTINGS), 'id');
  let saved = 0;

  Object.keys(incoming).forEach(k => {
    if (!SETTING_KEYS[k]) return;   // ไม่รู้จัก ข้ามไปเงียบ ๆ

    let value = String(incoming[k] === null || incoming[k] === undefined
      ? '' : incoming[k]).trim();

    // พร้อมเพย์รับเฉพาะตัวเลข เบอร์ที่คนกรอกมักมีขีดกับเว้นวรรคปน
    if (k === 'promptpayId' || k === 'taxId' || k === 'centerPhone') {
      value = value.replace(/[^0-9]/g, '');
    }

    if (k === 'promptpayId' && value && !isPromptPayId(value)) {
      throw new Error('พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก');
    }

    if (current[k]) updateRow(SHEET.SETTINGS, { id: k, value: value });
    else            insertRow(SHEET.SETTINGS, { id: k, value: value });
    saved++;
  });

  if (!saved) throw new Error('ไม่มีค่าที่บันทึกได้');
  audit(sess.userId, 'SAVE_SETTINGS', 'settings', Object.keys(incoming).join(','));
  return readSettings();
}

function isPromptPayId(value) {
  const v = String(value).replace(/[^0-9]/g, '');
  return v.length === 10 || v.length === 13;
}

// ════════════════════════════════════════════════════════════
// QR พร้อมเพย์แบบล็อคยอด
// ════════════════════════════════════════════════════════════
//
// รูปแบบตามมาตรฐาน EMVCo ที่ธนาคารไทยใช้ร่วมกัน
// สายอักขระประกอบจากบล็อก "รหัส 2 หลัก + ความยาว 2 หลัก + เนื้อหา" ต่อกันไป
// ปิดท้ายด้วย CRC16 ของทุกอย่างก่อนหน้า ถ้า CRC ผิดแอปธนาคารจะไม่ยอมอ่าน
//
// ล็อคยอดคือใส่บล็อก 54 (จำนวนเงิน) ลงไป
// แอปธนาคารจะกรอกยอดให้เองและแก้ไม่ได้ คนโอนจึงโอนผิดยอดไม่ได้
// ============================================================

function tlv(id, value) {
  const v = String(value);
  // ความยาวเป็นเลขสองหลักเสมอ 5 ตัวอักษรต้องเขียนเป็น 05 ไม่ใช่ 5
  const len = ('00' + v.length).slice(-2);
  return String(id) + len + v;
}

// แปลงเลขพร้อมเพย์เป็นรูปแบบที่มาตรฐานกำหนด พร้อมบอกว่าเป็นประเภทไหน
//   เบอร์มือถือ 10 หลัก  → แท็ก 01 · 0812345678 กลายเป็น 0066812345678
//   เลขผู้เสียภาษี 13 หลัก → แท็ก 02 · ใช้ตามนั้น
//
// ⚠️ ต้องดูประเภทจากเลขที่คนกรอก ไม่ใช่จากเลขที่แปลงแล้ว
// เพราะแปลงเสร็จทั้งสองแบบยาว 13 หลักเท่ากัน แยกจากกันไม่ออกอีก
function promptPayTarget(id) {
  const v = String(id).replace(/[^0-9]/g, '');
  if (v.length === 13) return { tag: '02', value: v };
  if (v.length === 10) return { tag: '01', value: '0066' + v.slice(1) };
  throw new Error('เลขพร้อมเพย์ไม่ถูกต้อง');
}

function promptPayPayload(id, amount) {
  const target = promptPayTarget(id);
  const amt    = Number(amount);

  // ── บล็อก 29 ข้อมูลผู้รับเงินของพร้อมเพย์ ──
  // ขึ้นต้นด้วยรหัสประจำระบบพร้อมเพย์ แล้วตามด้วยเลขผู้รับตามประเภท
  const merchant = tlv('00', 'A000000677010111') + tlv(target.tag, target.value);

  // ลำดับฟิลด์ตามที่เครื่องมือสร้าง QR พร้อมเพย์ในไทยใช้กันทั่วไป
  // คือ 00 01 29 58 53 54 — ประเทศมาก่อนสกุลเงิน
  // ตัวอ่านทำงานแบบ TLV จึงไม่ควรสนลำดับ แต่แอปธนาคารถูกทดสอบกับลำดับนี้
  let out = '';
  out += tlv('00', '01');                      // เวอร์ชันของรูปแบบ
  // 11 = QR ใช้ซ้ำได้ 12 = ใช้ครั้งเดียว ล็อคยอดแล้วถือว่าใช้ครั้งเดียว
  out += tlv('01', amt > 0 ? '12' : '11');
  out += tlv('29', merchant);
  out += tlv('58', 'TH');                      // ประเทศ
  out += tlv('53', '764');                     // สกุลเงิน บาท ตาม ISO 4217
  if (amt > 0) out += tlv('54', amt.toFixed(2));

  // CRC คิดจากสายอักขระที่มี "6304" ต่อท้ายแล้ว แต่ยังไม่มีตัวเลข CRC
  out += '6304';
  return out + crc16(out);
}

// CRC-16/CCITT-FALSE — ตัวตั้งต้น 0xFFFF พหุนาม 0x1021
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return ('000' + crc.toString(16).toUpperCase()).slice(-4);
}

// ── ขอ payload สำหรับรายการหนึ่ง ────────────────────────────
// คิดยอดที่หลังบ้าน ไม่รับยอดจากหน้าเว็บ
// ไม่งั้นใครแก้ค่าที่ส่งมาก็สร้าง QR ยอดเท่าไหร่ก็ได้ในนามศูนย์
function getPayQR(sess, p) {
  const all = readSettings();
  if (!all.promptpayId) {
    throw new Error('ยังไม่ได้ตั้งพร้อมเพย์ของศูนย์ ตั้งที่หน้าการเงิน > ตั้งค่าการรับเงิน');
  }

  const enrollment = readOne(SHEET.ENROLLMENTS, p.enrollmentId);
  if (!enrollment) throw new Error('ไม่พบรายการลงทะเบียน');

  // ผู้ปกครองขอได้เฉพาะของบุตรหลานตัวเอง
  if (sess.role === ROLE.PARENT) {
    const child = readOne(SHEET.CHILDREN, enrollment.childId) || {};
    const mine  = readAll(SHEET.PARENTS)
      .filter(x => String(x.userId) === String(sess.userId))
      .map(x => String(x.id));
    if (mine.indexOf(String(child.parentId)) < 0) {
      throw new Error('ดูได้เฉพาะรายการของบุตรหลานตัวเอง');
    }
  }

  const course = readOne(SHEET.COURSES, enrollment.courseId) || {};
  const price  = Number(enrollment.price !== '' && enrollment.price !== null &&
    enrollment.price !== undefined ? enrollment.price : (course.price || 0));
  if (price <= 0) throw new Error('รายการนี้ยังไม่ได้ตั้งราคา สร้าง QR ไม่ได้');

  const paid = readAll(SHEET.FEEPAYMENTS)
    .filter(x => String(x.enrollmentId) === String(p.enrollmentId))
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);

  // ยอดที่ขอมาต้องไม่เกินยอดค้าง แบ่งจ่ายได้แต่จ่ายเกินไม่ได้
  const due = Math.max(0, price - paid);
  if (due <= 0) throw new Error('รายการนี้ชำระครบแล้ว');

  let amount = Number(p.amount);
  if (!amount || isNaN(amount) || amount <= 0) amount = due;
  if (amount > due) throw new Error('ยอดเกินที่ค้างอยู่ ค้างอีก ' + due + ' บาท');

  return {
    payload: promptPayPayload(all.promptpayId, amount),
    amount:  amount,
    due:     due,
    name:    all.promptpayName || '',
    // โชว์แบบปิดบังบางส่วน ให้พอตรวจได้ว่าโอนถูกบัญชี แต่ไม่ประกาศเลขเต็ม
    idMask:  maskPromptPay(all.promptpayId),
  };
}

function maskPromptPay(id) {
  const v = String(id).replace(/[^0-9]/g, '');
  if (v.length < 4) return v;
  return v.slice(0, 3) + 'xxx' + v.slice(-4);
}
