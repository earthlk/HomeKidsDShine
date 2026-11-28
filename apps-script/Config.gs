// ============================================================
// Homey Kids D Shine — Config.gs
// ค่าคงที่ทั้งหมดของระบบ รวมไว้ที่เดียว
// ============================================================

// ── Spreadsheet ─────────────────────────────────────────────
// ⚠️ หลังรัน createNewSpreadsheet() ใน Setup.gs แล้ว
//    ให้เอา ID ที่ได้จาก Log มาใส่ตรงนี้
const SPREADSHEET_ID = 'ใส่_ID_ชีตใหม่_ที่นี่';

// ── เวอร์ชันของโค้ดหลังบ้าน ─────────────────────────────────
// เปิด URL ที่ลงท้ายด้วย /exec ในเบราว์เซอร์แล้วจะเห็นค่านี้
// ใช้ตอบคำถามว่า "วางโค้ดแล้วแต่ Deploy เวอร์ชันใหม่หรือยัง"
// เพราะ Apps Script ยังเสิร์ฟโค้ดเวอร์ชันเดิมจนกว่าจะกด Deploy ใหม่
// เพิ่มเลขนี้ทุกครั้งที่แก้โค้ดหลังบ้าน
const APP_VERSION = 'phase9.0';

// ── Timezone ────────────────────────────────────────────────
// ทุกวันที่ในระบบต้องอ้างอิงเวลาไทย ห้ามใช้ toISOString() ตรง ๆ
const TZ = 'Asia/Bangkok';

// ── ชื่อชีต ─────────────────────────────────────────────────
const SHEET = {
  USERS:        'Users',
  PARENTS:      'Parents',
  CHILDREN:     'Children',
  TRAINERS:     'Trainers',
  COURSES:      'Courses',
  ENROLLMENTS:  'Enrollments',
  SESSIONS:     'Sessions',
  ACTIVITIES:   'Activities',
  PAYMENTS:     'Payments',
  PAYOUTS:      'Payouts',
  FEEPAYMENTS:  'FeePayments',
  SETTINGS:     'Settings',
  RECEIPTS:     'Receipts',
  PHOTOS:       'Photos',
  CONSENT:      'PdpaConsent',
  REQUESTS:     'PdpaRequests',
  AUDIT:        'AuditLog',
};

// ── โครงสร้างคอลัมน์ของแต่ละชีต ─────────────────────────────
// ลำดับในนี้คือลำดับคอลัมน์จริงในชีต
const SCHEMA = {
  [SHEET.USERS]: [
    'id', 'email', 'password', 'role', 'name', 'phone',
    'active', 'lineUserId', 'googleId', 'createdAt', 'updatedAt',
    // การยืนยันตัวตนทางอีเมล — ผู้ดูแลระบบไม่ได้ตั้งรหัสผ่านให้แล้ว
    // สร้างบัญชีแล้วระบบส่งลิงก์ไปที่อีเมล เจ้าตัวเปิดลิงก์แล้วตั้งรหัสเอง
    // inviteToken เก็บเป็นค่าที่ผ่านการ hash แล้ว ของจริงอยู่ในอีเมลเท่านั้น
    'verified', 'inviteToken', 'inviteExpires',
  ],
  [SHEET.PARENTS]: [
    'id', 'userId', 'name', 'nickname', 'phone', 'phoneAlt',
    'email', 'lineId', 'address', 'receiptName', 'taxId',
    'createdAt', 'updatedAt',
  ],
  [SHEET.CHILDREN]: [
    'id', 'parentId', 'parentRelation', 'name', 'nickname', 'dob', 'gender',
    'weight', 'height', 'bloodType', 'medicalConditions',
    'foodAllergy', 'drugAllergy', 'medications', 'physicalLimitation',
    'emergencyName', 'emergencyPhone', 'emergencyRelation',
    'doctorName', 'doctorPhone',
    'school', 'trainingGoal', 'notes',
    'createdAt', 'updatedAt',
  ],
  [SHEET.TRAINERS]: [
    'id', 'userId', 'name', 'phone', 'specialization', 'active',
    'createdAt', 'updatedAt',
    // คอร์สที่ผู้ฝึกสอนคนนี้รับสอน เก็บเป็นรายการ id คั่นด้วยจุลภาค
    // ลงนัดได้เฉพาะผู้ฝึกสอนที่มีคอร์สนั้นอยู่ในรายการ
    'courseIds',
    // บัญชีรับค่าสอน ใช้ในหน้าการเงิน
    'bankName', 'bankAccountNo', 'bankAccountName',
    // อัตราค่าสอนเฉพาะของคนนี้ เก็บเป็น courseId:จำนวนเงิน คั่นด้วยจุลภาค
    // คอร์สไหนไม่ได้ระบุไว้ ใช้ trainerFee ของคอร์สนั้นเป็นค่าตั้งต้น
    'feeOverrides',
  ],
  [SHEET.COURSES]: [
    'id', 'name', 'description', 'category',
    'totalSessions', 'price', 'trainerFee', 'durationMin', 'active',
    'createdAt', 'updatedAt',
  ],
  [SHEET.ENROLLMENTS]: [
    'id', 'childId', 'courseId', 'totalSessions',
    'startDate', 'expireDate', 'status', 'notes',
    'createdAt', 'updatedAt',
    // ราคาที่ตกลงกันจริงของรายการนี้ อาจต่างจากราคาตั้งของคอร์ส
    // เช่น ลดให้พี่น้อง หรือซื้อจำนวนครั้งไม่เท่าแพ็กเกจมาตรฐาน
    'price',
    // ── ผู้สอนประจำ (Phase 8) ──────────────────────────────
    // ผู้สอนไม่ได้ผูกกับคอร์ส เพราะคอร์สเดียวกันเด็กคนละคนอาจคนละครู
    // แต่ผูกกับการลงทะเบียน คือเด็กคนนี้ในคอร์สนี้ใครสอน
    // คาบไหนที่ trainerId ไม่ตรงกับตรงนี้ คือคาบที่มีคนสอนแทน
    // ว่าง = ยังไม่ได้กำหนด ให้อนุมานจากผู้สอนที่ลงคาบให้มากที่สุด
    'trainerId',
  ],
  [SHEET.SESSIONS]: [
    'id', 'enrollmentId', 'trainerId', 'date', 'startTime', 'endTime',
    'status', 'location', 'notes', 'cancelReason',
    'createdAt', 'updatedAt',
    // รอบจ่ายค่าสอนที่คาบนี้ถูกรวมเข้าไปแล้ว ว่าง = ยังไม่ได้จ่าย
    // เด็กหลายคนในคาบเดียวกันจะได้ payoutId เดียวกันทุกแถว
    'payoutId',
    // ── การเช็กชื่อ (Phase 7) ──────────────────────────────
    // หนึ่งแถวในชีตนี้คือเด็กหนึ่งคนในคาบหนึ่งคาบอยู่แล้ว
    // การมาเรียนจึงเก็บเป็นคอลัมน์ตรงนี้ได้เลย ไม่ต้องมีชีตแยก
    //
    // attendance ว่าง = ยังไม่มีใครเช็ก ซึ่งต่างจากขาดเรียน
    // คาบที่ผ่านวันไปแล้วแต่ยังว่างอยู่จะขึ้นในรายการค้างเช็ก
    'attendance', 'attendanceNote', 'attendanceAt',
    // ขาดเรียนแล้วจะได้ makeupStatus เป็น pending รอผู้ดูแลระบบตัดสิน
    // ระบบไม่ตัดสินเอง เพราะแต่ละเคสเงื่อนไขไม่เหมือนกัน
    'makeupStatus', 'makeupOfId', 'decidedAt', 'decidedBy',
  ],
  [SHEET.ACTIVITIES]: [
    // summary, skills, nextGoal เป็นบันทึกของคาบ ทุกคนในคาบได้ค่าเดียวกัน
    // rating กับ note เป็นผลรายคน เพราะเด็กแต่ละคนตอบสนองไม่เหมือนกัน
    'id', 'sessionId', 'trainerId', 'summary', 'skills', 'rating',
    'nextGoal', 'createdAt', 'updatedAt',
    'note',
  ],
  // ชีตเดิมจากตอนออกแบบครั้งแรก คิดเป็นรายนัด ไม่ได้ใช้งานจริง
  // ของจริงใช้ Payouts ข้างล่างแทน เพราะจ่ายเป็นรอบและคิดเป็นรายคาบ ไม่ใช่รายเด็ก
  // ไม่ลบทิ้งเพื่อไม่ให้คอลัมน์ของชีตอื่นเลื่อน
  [SHEET.PAYMENTS]: [
    'id', 'sessionId', 'trainerId', 'amount', 'status',
    'method', 'proofPhotoId', 'paidAt', 'note',
    'createdAt', 'updatedAt',
  ],

  // รอบจ่ายค่าสอน หนึ่งแถวคือการจ่ายหนึ่งครั้งให้ผู้สอนหนึ่งคน
  // amount เก็บยอดที่คิดได้ตอนปิดรอบ ไม่คำนวณใหม่ตอนเปิดดู
  // เพราะอัตราค่าสอนอาจถูกแก้ทีหลัง แล้วยอดที่จ่ายไปแล้วจะเพี้ยน
  [SHEET.PAYOUTS]: [
    'id', 'trainerId', 'periodStart', 'periodEnd',
    'classCount', 'amount', 'status',
    'method', 'reference', 'note',
    'paidAt', 'paidBy', 'createdAt', 'updatedAt',
  ],

  // เงินที่รับจากผู้ปกครอง หนึ่งแถวคือรับเงินหนึ่งครั้ง
  // ผูกกับรายการลงทะเบียน เพราะราคาตกลงกันที่ระดับนั้น ไม่ใช่ระดับคอร์ส
  // แบ่งจ่ายได้ไม่จำกัดงวด ยอดค้างคำนวณจาก price ลบผลรวมของแถวในชีตนี้
  // ไม่เก็บสถานะไว้ในคอลัมน์ เพราะสถานะที่เก็บไว้จะไม่ตรงกับยอดจริงทันทีที่มีการรับเงินเพิ่ม
  [SHEET.FEEPAYMENTS]: [
    'id', 'enrollmentId', 'amount', 'method', 'reference', 'note',
    'paidAt', 'recordedBy', 'createdAt', 'updatedAt',
  ],

  // ค่าตั้งของศูนย์ เก็บเป็นคู่ชื่อ-ค่า ไม่ใช่คอลัมน์ละเรื่อง
  // เพิ่มค่าใหม่ได้โดยไม่ต้องแตะ schema และไม่ทำให้คอลัมน์เดิมเลื่อน
  // ใช้ id เป็นชื่อค่า เช่น promptpayId จะได้ readOne/updateRow ได้เลย
  [SHEET.SETTINGS]: [
    'id', 'value', 'updatedAt',
  ],
  [SHEET.RECEIPTS]: [
    'id', 'enrollmentId', 'receiptNo', 'amount', 'issuedAt', 'issuedBy',
    'createdAt', 'updatedAt',
  ],
  [SHEET.PHOTOS]: [
    'id', 'fileId', 'fileUrl', 'thumbUrl', 'fileName', 'mimeType',
    'category', 'linkedId', 'uploadedBy', 'uploadedAt', 'deleted',
  ],
  [SHEET.CONSENT]: [
    'id', 'userId', 'userName', 'status', 'version',
    'userAgent', 'grantedAt', 'revokedAt',
  ],
  [SHEET.REQUESTS]: [
    'id', 'userId', 'userName', 'requestType', 'reason', 'status',
    'requestedAt', 'processedAt', 'processedBy', 'notes',
  ],
  [SHEET.AUDIT]: [
    'id', 'userId', 'action', 'target', 'targetId', 'at',
  ],
};

// ── สถานะที่ใช้ในระบบ ───────────────────────────────────────
const SESSION_STATUS = {
  SCHEDULED: 'scheduled',   // นัดแล้ว ยังไม่ถึงวัน หรือถึงแล้วแต่ยังไม่บันทึก
  COMPLETED: 'completed',   // สอนแล้ว + บันทึกกิจกรรมแล้ว
  CANCELLED: 'cancelled',   // ยกเลิก
};

// สถานะของรอบจ่ายค่าสอน
// ปิดรอบแล้วยอดจะถูกตรึงไว้ ยกเลิกได้เฉพาะรอบที่ยังไม่ได้โอน
const PAYOUT_STATUS = {
  PENDING: 'pending',   // ปิดรอบแล้ว รอโอน
  PAID:    'paid',      // โอนแล้ว มีเลขอ้างอิง
};

// สถานะการชำระค่าคอร์สของผู้ปกครอง คำนวณจากยอดที่รับมาแล้วเทียบกับราคา
// ไม่ได้เก็บเป็นคอลัมน์ เพราะต้องเปลี่ยนตามทุกครั้งที่รับเงินเพิ่ม
const FEE_STATUS = {
  NOPRICE: 'noprice',   // ยังไม่ได้ตั้งราคา คิดยอดค้างไม่ได้
  UNPAID:  'unpaid',    // ตั้งราคาแล้ว แต่ยังไม่ได้รับเงินเลย
  PARTIAL: 'partial',   // รับมาบางส่วน
  PAID:    'paid',      // ครบแล้ว
};

// ── การมาเรียนของเด็กรายคน ──────────────────────────────────
// ค่าว่างแปลว่ายังไม่มีใครเช็ก ไม่ใช่ขาดเรียน สองอย่างนี้ต้องแยกให้ขาด
const ATTENDANCE = {
  PRESENT: 'present',   // มาเรียน
  LATE:    'late',      // มาสาย แต่ได้เรียน นับว่าใช้คาบ
  ABSENT:  'absent',    // ไม่มา
};

// ── ผลการตัดสินของคาบที่ขาด ─────────────────────────────────
// ระบบไม่ตัดสินเอง ขาดแล้วเข้าคิว pending ให้ผู้ดูแลระบบเลือกเป็นเคส ๆ
// ศูนย์เล็กแต่ละเคสเงื่อนไขไม่เหมือนกัน กฎเดียวจะผิดเสมอกับอีกครึ่งหนึ่งของเคส
const MAKEUP = {
  PENDING:     'pending',       // ขาดแล้ว ยังไม่ตัดสิน
  CREDITED:    'credited',      // คืนคาบให้ ยังไม่ได้นัดใหม่
  RESCHEDULED: 'rescheduled',   // คืนคาบและนัดใหม่ให้แล้ว
  CHARGED:     'charged',       // ตัดคาบไปเลย
};

const ROLE = { ADMIN: 'admin', TRAINER: 'trainer', PARENT: 'parent' };

// ── อายุ session token (วินาที) ─────────────────────────────
const SESSION_TTL = 12 * 60 * 60;   // 12 ชั่วโมง

// ── การยืนยันตัวตนทางอีเมล ──────────────────────────────────
// ชื่อศูนย์และที่อยู่หน้าเว็บ ใช้ประกอบลิงก์และหัวจดหมายในอีเมลยืนยัน
//
// ⚠️ SITE_URL คือที่อยู่ของ "หน้าเว็บ" ที่ index.html วางอยู่
//    ไม่ใช่ URL ที่ลงท้ายด้วย /exec ของ Apps Script
//    เพราะ /exec ตอบกลับเป็น JSON ของ API คนที่กดลิงก์ในอีเมลจะเห็นแค่ตัวหนังสือ
//    ไม่ใช่ฟอร์มตั้งรหัสผ่าน ค่านี้ต้องตรงกับค่า SITE_URL ใน js/config.js
const CENTER_NAME = 'Homey Kids D Shine';
const SITE_URL    = 'https://earthlk.github.io/HomeKidsDShine/';

// ลิงก์ยืนยันมีอายุ 72 ชั่วโมง หมดแล้วให้ผู้ดูแลระบบกดส่งใหม่
const INVITE_TTL_HOURS = 72;

// ลิงก์ลืมรหัสผ่านอายุสั้นกว่ามาก เพราะเจ้าตัวเป็นคนกดขอเองและกดแล้วเปิดเลย
// ยิ่งอายุสั้น ยิ่งเหลือเวลาให้คนอื่นที่บังเอิญเห็นอีเมลเอาไปใช้น้อยลง
const RESET_TTL_MINUTES = 60;

// ขอลิงก์ลืมรหัสผ่านซ้ำได้ทุกกี่วินาที กันคนยิงถล่มอีเมลคนอื่นเล่น
const RESET_COOLDOWN_SEC = 120;

// ── OAuth (ยังไม่เปิดใช้ใน Phase 1 — เก็บไว้ต่อ Phase หลัง) ──
const LINE_LOGIN_CLIENT_ID     = '2010560028';
const LINE_LOGIN_CLIENT_SECRET = '';   // เติมตอนเปิดใช้ LINE Login
const LINE_OA_ACCESS_TOKEN     = '';   // เติมตอนเปิดใช้แจ้งเตือน
const GOOGLE_CLIENT_ID         = '95133922597-jdq0a4i4jc19thdjf32nrtjl2g2qlvbj.apps.googleusercontent.com';
