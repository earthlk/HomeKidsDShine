// ============================================================
// Little Stars — Config.gs
// ค่าคงที่ทั้งหมดของระบบ รวมไว้ที่เดียว
// ============================================================

// ── Spreadsheet ─────────────────────────────────────────────
// ⚠️ หลังรัน createNewSpreadsheet() ใน Setup.gs แล้ว
//    ให้เอา ID ที่ได้จาก Log มาใส่ตรงนี้
const SPREADSHEET_ID = 'ใส่_ID_ชีตใหม่_ที่นี่';

// ID ชีตเก่า — ใช้ตอน migrate ข้อมูลเท่านั้น ไม่ได้ใช้ในระบบจริง
const OLD_SPREADSHEET_ID = '17zBt9UHieSkprg28hZ7abTBKoV7mO9nzHHMz8UAJUV4';

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
  ],
  [SHEET.SESSIONS]: [
    'id', 'enrollmentId', 'trainerId', 'date', 'startTime', 'endTime',
    'status', 'location', 'notes', 'cancelReason',
    'createdAt', 'updatedAt',
  ],
  [SHEET.ACTIVITIES]: [
    'id', 'sessionId', 'trainerId', 'summary', 'skills', 'rating',
    'nextGoal', 'createdAt', 'updatedAt',
  ],
  [SHEET.PAYMENTS]: [
    'id', 'sessionId', 'trainerId', 'amount', 'status',
    'method', 'proofPhotoId', 'paidAt', 'note',
    'createdAt', 'updatedAt',
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

const ROLE = { ADMIN: 'admin', TRAINER: 'trainer', PARENT: 'parent' };

// ── อายุ session token (วินาที) ─────────────────────────────
const SESSION_TTL = 12 * 60 * 60;   // 12 ชั่วโมง

// ── OAuth (ยังไม่เปิดใช้ใน Phase 1 — เก็บไว้ต่อ Phase หลัง) ──
const LINE_LOGIN_CLIENT_ID     = '2010560028';
const LINE_LOGIN_CLIENT_SECRET = '';   // เติมตอนเปิดใช้ LINE Login
const LINE_OA_ACCESS_TOKEN     = '';   // เติมตอนเปิดใช้แจ้งเตือน
const GOOGLE_CLIENT_ID         = '95133922597-jdq0a4i4jc19thdjf32nrtjl2g2qlvbj.apps.googleusercontent.com';
