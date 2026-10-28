// ============================================================
// Homey Kids D Shine — Users.gs
// บัญชีผู้ใช้งาน
// ============================================================
//
// บัญชีผู้ใช้เก็บแค่ข้อมูลที่ใช้เข้าระบบ ส่วนข้อมูลตัวบุคคลอยู่คนละชีต
// ผู้ฝึกสอนอยู่ในชีต Trainers ผู้ปกครองอยู่ในชีต Parents
// สองฝั่งผูกกันด้วย userId
//
// ============================================================

function getUsers(sess) {
  const users    = readAll(SHEET.USERS);
  const trainers = readAll(SHEET.TRAINERS);
  const parents  = readAll(SHEET.PARENTS);

  // บอกว่าบัญชีไหนผูกกับข้อมูลตัวบุคคลแล้วบ้าง
  // บัญชีผู้ฝึกสอนที่ยังไม่มีข้อมูลจะลงนัดให้ไม่ได้ ต้องเห็นตั้งแต่หน้านี้
  const trainerBy = {};
  trainers.forEach(t => { if (t.userId) trainerBy[String(t.userId)] = t.name; });

  const parentBy = {};
  parents.forEach(p => { if (p.userId) parentBy[String(p.userId)] = p.name; });

  const rows = users.map(u => ({
    id:        u.id,
    email:     u.email,
    name:      u.name,
    phone:     u.phone,
    role:      u.role,
    active:    isTrue(u.active),
    // บัญชีที่ยังไม่ยืนยันอีเมลยังเข้าระบบไม่ได้ ต้องเห็นจากหน้ารายการ
    verified:  isVerified(u),
    inviteExpires: String(u.inviteExpires || ''),
    linked:    u.role === ROLE.TRAINER ? (trainerBy[String(u.id)] || '')
             : u.role === ROLE.PARENT  ? (parentBy[String(u.id)]  || '')
             : '',
    hasLine:   !!u.lineUserId,
    hasGoogle: !!u.googleId,
    isSelf:    String(u.id) === String(sess.userId),
    createdAt: u.createdAt,
  }));

  rows.sort((a, b) => {
    const rank = { admin: 0, trainer: 1, parent: 2 };
    return (rank[a.role] - rank[b.role]) ||
           String(a.name).localeCompare(String(b.name), 'th');
  });

  return { users: rows };
}

// ── บันทึกบัญชีผู้ใช้ ───────────────────────────────────────
function saveUser(sess, p) {
  const name  = String(p.name || '').trim();
  const email = String(p.email || '').trim().toLowerCase();
  const role  = String(p.role || '').trim();

  if (!name)  throw new Error('กรอกชื่อก่อน');
  if (!email) throw new Error('กรอกอีเมลก่อน');
  if (email.indexOf('@') < 1) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if ([ROLE.ADMIN, ROLE.TRAINER, ROLE.PARENT].indexOf(role) < 0) {
    throw new Error('เลือกสิทธิ์การใช้งานก่อน');
  }

  const all = readAll(SHEET.USERS);

  // อีเมลซ้ำไม่ได้ เพราะใช้เป็นตัวระบุตอนเข้าสู่ระบบ
  const dup = all.find(u => String(u.email).trim().toLowerCase() === email &&
                            String(u.id) !== String(p.id || ''));
  if (dup) throw new Error('อีเมลนี้มีคนใช้แล้ว');

  const fields = {
    name:  name,
    email: email,
    phone: String(p.phone || '').trim(),
    role:  role,
  };

  if (p.id) {
    const current = all.find(u => String(u.id) === String(p.id));
    if (!current) throw new Error('ไม่พบบัญชีผู้ใช้');

    // ห้ามลดสิทธิ์ตัวเองจนออกจากระบบไม่ได้ และห้ามเหลือผู้ดูแลระบบศูนย์คน
    if (current.role === ROLE.ADMIN && role !== ROLE.ADMIN) {
      guardLastAdmin(all, p.id);
    }

    updateRow(SHEET.USERS, Object.assign({ id: p.id }, fields));

    // เปลี่ยนสิทธิ์แล้วต้องปลดของเดิมทิ้ง ไม่งั้นข้อมูลจะผูกค้างผิดประเภท
    if (current.role !== role) linkProfile(p.id, current.role, '');
    if (p.linkId !== undefined) linkProfile(p.id, role, String(p.linkId || ''));

    audit(sess.userId, 'UPDATE', 'user', p.id);

    // แก้อีเมลของบัญชีที่ยังไม่ยืนยัน = ตอนสร้างพิมพ์ผิด ลิงก์เดิมไปผิดที่แล้ว
    // ส่งใหม่ให้อัตโนมัติ ไม่ต้องให้ผู้ดูแลระบบจำว่าต้องกดส่งอีกปุ่ม
    if (!isVerified(current) &&
        String(current.email).trim().toLowerCase() !== email) {
      const again = issueInvite(Object.assign({}, current, fields, { id: p.id }));
      return { id: p.id, invite: again };
    }

    return { id: p.id };
  }

  // ── บัญชีใหม่ ──────────────────────────────────────────────
  // ไม่ตั้งรหัสผ่านให้ เว้นช่องว่างไว้แล้วส่งลิงก์ยืนยันไปที่อีเมล
  // เจ้าตัวเป็นคนตั้งรหัสเอง ผู้ดูแลระบบจึงไม่เคยรู้รหัสของใคร
  const row = insertRow(SHEET.USERS, Object.assign(fields, {
    password:      '',
    active:        true,
    lineUserId:    '',
    googleId:      '',
    verified:      false,
    inviteToken:   '',
    inviteExpires: '',
  }));

  if (p.linkId) {
    try {
      linkProfile(row.id, role, String(p.linkId));
    } catch (err) {
      // ย้อนคืนบัญชีที่เพิ่งสร้าง ไม่ให้เหลือบัญชีที่ผูกไม่สำเร็จค้างไว้
      deleteRow(SHEET.USERS, row.id);
      throw err;
    }
  }

  // ออกลิงก์หลังผูกข้อมูลสำเร็จ ไม่งั้นอีเมลอาจออกไปแล้วบัญชีถูกย้อนคืนทิ้ง
  const invite = issueInvite(row);

  audit(sess.userId, 'CREATE', 'user', row.id);
  return { id: row.id, invite: invite };
}

// ── เปิดหรือปิดบัญชี ────────────────────────────────────────
function toggleUser(sess, p) {
  const all  = readAll(SHEET.USERS);
  const user = all.find(u => String(u.id) === String(p.id));
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');

  // ปิดบัญชีตัวเองแล้วจะเข้าระบบไม่ได้อีก
  if (String(p.id) === String(sess.userId)) {
    throw new Error('ปิดบัญชีตัวเองไม่ได้');
  }

  const next = !isTrue(user.active);
  if (!next && user.role === ROLE.ADMIN) guardLastAdmin(all, p.id);

  updateRow(SHEET.USERS, { id: p.id, active: next });
  audit(sess.userId, next ? 'ACTIVATE' : 'DEACTIVATE', 'user', p.id);
  return { active: next };
}

// รหัสผ่านเป็นของเจ้าของบัญชีเท่านั้น ผู้ดูแลระบบตั้งให้ไม่ได้
// บัญชีใหม่ตั้งรหัสเองผ่านลิงก์ยืนยันอีเมล ดู issueInvite ใน Invites.gs
// ลิงก์หายหรือหมดอายุ ผู้ดูแลระบบกดส่งใหม่ได้ด้วย resendInvite
// ลืมรหัสผ่าน เจ้าตัวกดขอลิงก์เองได้จากหน้าเข้าสู่ระบบ ดู requestReset ใน Invites.gs

// ── ตัดการเชื่อมบัญชี LINE หรือ Google ──────────────────────
function unlinkAccount(sess, p) {
  if (!readOne(SHEET.USERS, p.id)) throw new Error('ไม่พบบัญชีผู้ใช้');

  const field = p.provider === 'line' ? 'lineUserId' : 'googleId';
  const patch = { id: p.id };
  patch[field] = '';

  updateRow(SHEET.USERS, patch);
  audit(sess.userId, 'UNLINK_' + String(p.provider).toUpperCase(), 'user', p.id);
  return { success: true };
}

// ── ข้อมูลตัวบุคคลที่ผูกกับบัญชีได้ ─────────────────────────
// ลำดับงานจริงคือสร้างข้อมูลผู้ปกครองหรือผู้ฝึกสอนก่อน แล้วค่อยเปิดบัญชีให้
// การผูกจึงอยู่ที่ฟอร์มผู้ใช้งาน ไม่ใช่ในฟอร์มของแต่ละฝั่ง
function getLinkTargets(sess) {
  const pick = (rows) => rows.map(x => ({
    id:       x.id,
    name:     x.name,
    phone:    x.phone,
    linkedTo: String(x.userId || ''),
  })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));

  return {
    parent:  pick(readAll(SHEET.PARENTS)),
    trainer: pick(readAll(SHEET.TRAINERS)),
  };
}

// ── กันไม่ให้เหลือผู้ดูแลระบบศูนย์คน ────────────────────────
// ถ้าปิดคนสุดท้ายจะไม่มีใครเข้าไปแก้อะไรได้อีก ต้องแก้ที่ชีตโดยตรง
function guardLastAdmin(allUsers, excludeId) {
  const others = allUsers.filter(u =>
    u.role === ROLE.ADMIN && isTrue(u.active) &&
    String(u.id) !== String(excludeId));

  if (!others.length) {
    throw new Error('ต้องเหลือผู้ดูแลระบบอย่างน้อยหนึ่งคน สร้างคนใหม่ก่อนแล้วค่อยแก้บัญชีนี้');
  }
}
