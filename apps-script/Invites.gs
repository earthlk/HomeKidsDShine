// ============================================================
// Homey Kids D Shine — Invites.gs
// ยืนยันตัวตนทางอีเมล + ตั้งรหัสผ่านครั้งแรก
// ============================================================
//
// ของเดิมผู้ดูแลระบบตั้งรหัสแรกเข้าให้ แล้วบอกรหัสนั้นให้เจ้าตัวไปเปลี่ยนเอง
// ปัญหาคือผู้ดูแลระบบรู้รหัสของคนอื่น และรหัสเดินทางผ่านแชทหรือปากต่อปาก
// ตอนนี้เปลี่ยนเป็น: สร้างบัญชีแล้วระบบส่งลิงก์ไปที่อีเมล
// เจ้าตัวเปิดลิงก์แล้วตั้งรหัสเอง ไม่มีใครรู้รหัสนอกจากเจ้าตัว
//
// token ที่เก็บในชีตเป็นค่าที่ผ่าน hash แล้ว ของจริงอยู่ในอีเมลเท่านั้น
// ถ้าชีตรั่วก็ยังสวมบัญชีคนอื่นไม่ได้
// ============================================================

// ── สร้าง token ─────────────────────────────────────────────
// ยาว 40 ตัวอักษรฐานสิบหก เดาไม่ได้ในทางปฏิบัติ
function newInviteToken() {
  return Utilities.getUuid().replace(/-/g, '') +
         Utilities.getUuid().split('-')[0];
}

// ใส่คำนำหน้าก่อน hash เพื่อให้ค่าที่ได้ไม่มีทางชนกับ hash ของรหัสผ่าน
function hashToken(token) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, 'invite:' + String(token), Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ── บัญชีนี้ยืนยันแล้วหรือยัง ───────────────────────────────
// บัญชีที่สร้างก่อนมีระบบนี้จะไม่มีค่าในคอลัมน์ verified
// แต่มีรหัสผ่านอยู่แล้ว จึงถือว่ายืนยันแล้ว ไม่ต้องไป migrate ก่อนใช้งาน
function isVerified(user) {
  if (!user) return false;
  return isTrue(user.verified) || !!String(user.password || '').trim();
}

// ── ออกลิงก์ยืนยันใหม่ให้บัญชีหนึ่ง ─────────────────────────
// คืน { sent, link } — sent บอกว่าอีเมลออกไปแล้วหรือไม่
// ถ้าส่งไม่สำเร็จ (โควตาอีเมลหมด) ยังคืน link ให้ผู้ดูแลระบบคัดลอกส่งเองได้
function issueInvite(user) {
  const token   = newInviteToken();
  const expires = Utilities.formatDate(
    new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000), TZ, 'yyyy-MM-dd HH:mm:ss'
  );

  updateRow(SHEET.USERS, {
    id:            user.id,
    verified:      false,
    inviteToken:   hashToken(token),
    inviteExpires: expires,
  });

  const link = String(SITE_URL).replace(/\/+$/, '/') + '?invite=' + token;

  let sent = false;
  try {
    sendInviteEmail(user, link);
    sent = true;
  } catch (err) {
    Logger.log('ส่งอีเมลยืนยันไม่สำเร็จ ' + user.email + ': ' + err.message);
  }

  return { sent: sent, link: link, expires: expires };
}

// ── จดหมายยืนยัน ────────────────────────────────────────────
function sendInviteEmail(user, link) {
  const roleWord = {
    admin:   'ผู้ดูแลระบบ',
    trainer: 'ผู้ฝึกสอน',
    parent:  'ผู้ปกครอง',
  }[user.role] || user.role;

  const subject = 'ยืนยันอีเมลเพื่อเปิดใช้งานบัญชี ' + CENTER_NAME;

  const text =
    'สวัสดีค่ะ คุณ' + user.name + '\n\n' +
    'ศูนย์ ' + CENTER_NAME + ' เปิดบัญชีสำหรับคุณไว้แล้ว ในสิทธิ์' + roleWord + '\n' +
    'เปิดลิงก์ข้างล่างเพื่อยืนยันอีเมลและตั้งรหัสผ่านของตัวเอง\n\n' +
    link + '\n\n' +
    'ลิงก์นี้ใช้ได้ภายใน ' + INVITE_TTL_HOURS + ' ชั่วโมง ถ้าหมดอายุแล้วแจ้งผู้ดูแลศูนย์ให้ส่งใหม่\n' +
    'ถ้าไม่ได้เป็นผู้ขอเปิดบัญชีนี้ ไม่ต้องทำอะไร บัญชีจะยังเปิดใช้งานไม่ได้\n';

  const html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;' +
    'background:#FFF9ED;padding:28px 16px;color:#3D2F22;line-height:1.7">' +
      '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;' +
      'border:1px solid #E9DDC8;border-radius:20px;padding:28px">' +

        '<p style="margin:0 0 4px;font-size:13px;color:#98876F">' + CENTER_NAME + '</p>' +
        '<h1 style="margin:0 0 18px;font-size:21px;color:#A96246">ยืนยันอีเมลเพื่อเปิดใช้งานบัญชี</h1>' +

        '<p style="margin:0 0 14px">สวัสดีค่ะ คุณ' + escHtml(user.name) + '</p>' +
        '<p style="margin:0 0 20px">ศูนย์เปิดบัญชีสำหรับคุณไว้แล้ว ในสิทธิ์<strong>' + roleWord + '</strong> ' +
        'กดปุ่มข้างล่างเพื่อยืนยันอีเมลและตั้งรหัสผ่านของตัวเอง</p>' +

        '<p style="margin:0 0 20px">' +
          '<a href="' + link + '" style="display:inline-block;background:#A96246;color:#FFFFFF;' +
          'text-decoration:none;font-weight:600;padding:13px 26px;border-radius:999px">' +
          'ยืนยันอีเมลและตั้งรหัสผ่าน</a>' +
        '</p>' +

        '<p style="margin:0 0 18px;font-size:13px;color:#6B5947">' +
          'ถ้าปุ่มกดไม่ได้ คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์<br>' +
          '<span style="word-break:break-all;color:#A96246">' + link + '</span></p>' +

        '<hr style="border:none;border-top:1px solid #F3EBDC;margin:20px 0">' +

        '<p style="margin:0;font-size:13px;color:#98876F">' +
          'ลิงก์นี้ใช้ได้ภายใน ' + INVITE_TTL_HOURS + ' ชั่วโมง ถ้าหมดอายุแล้วแจ้งผู้ดูแลศูนย์ให้ส่งใหม่<br>' +
          'ถ้าไม่ได้เป็นผู้ขอเปิดบัญชีนี้ ไม่ต้องทำอะไร บัญชีจะยังเปิดใช้งานไม่ได้</p>' +

      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to:       user.email,
    subject:  subject,
    body:     text,            // สำรองไว้ให้โปรแกรมอ่านอีเมลที่ไม่รับ HTML
    htmlBody: html,
    name:     CENTER_NAME,
  });
}

function escHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── หาบัญชีจาก token ────────────────────────────────────────
// คืน { user } หรือ { error } — ไม่ throw เพราะเส้นทางนี้เรียกได้โดยไม่ล็อกอิน
// ข้อความต้องไม่บอกว่าอีเมลไหนมีอยู่ในระบบ คนที่ถือลิงก์ผิดจะไม่ได้ข้อมูลอะไรเพิ่ม
function findByInvite(rawToken) {
  // ข้อความต้องใช้ได้ทั้งลิงก์เปิดบัญชีและลิงก์ลืมรหัสผ่าน จึงเลี่ยงคำว่า "ยืนยัน"
  const token = String(rawToken || '').trim();
  if (!token) return { error: 'ลิงก์นี้ไม่ถูกต้อง' };

  const hash = hashToken(token);
  const user = readAll(SHEET.USERS)
    .find(u => String(u.inviteToken || '').trim() === hash);

  if (!user) {
    return { error: 'ลิงก์นี้ใช้ไม่ได้แล้ว อาจถูกใช้ไปแล้ว หรือมีการขอลิงก์ใหม่ทับไปแล้ว' };
  }
  // ทั้งสองค่าเป็นรูปแบบ yyyy-MM-dd HH:mm:ss เทียบเป็น string ได้ตรงลำดับเวลา
  if (String(user.inviteExpires || '') && nowTH() > String(user.inviteExpires)) {
    return { error: 'ลิงก์นี้หมดอายุแล้ว กดลืมรหัสผ่านที่หน้าเข้าสู่ระบบเพื่อขอลิงก์ใหม่' };
  }
  if (!isTrue(user.active)) {
    return { error: 'บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ' };
  }
  return { user: user };
}

// ── ตรวจลิงก์ก่อนแสดงฟอร์มตั้งรหัส (เรียกได้โดยไม่ล็อกอิน) ──
// mode บอกว่าลิงก์นี้มาจากไหน ใช้เลือกข้อความบนหน้าจอ ไม่ได้ใช้ตัดสินสิทธิ์
// ดูจากว่าบัญชีมีรหัสผ่านอยู่แล้วหรือยัง ไม่ต้องเก็บชนิดของ token ไว้อีกคอลัมน์
//   ยังไม่มีรหัส = ลิงก์เปิดบัญชีครั้งแรก | มีรหัสแล้ว = ลิงก์ตั้งรหัสใหม่
function checkInvite(rawToken) {
  const found = findByInvite(rawToken);
  if (found.error) return { ok: false, message: found.error, code: 'BAD_INVITE' };

  return { ok: true, data: {
    name:  found.user.name,
    email: found.user.email,
    role:  found.user.role,
    mode:  String(found.user.password || '').trim() ? 'reset' : 'activate',
  } };
}

// ── ยืนยันอีเมลและตั้งรหัสผ่าน (เรียกได้โดยไม่ล็อกอิน) ──────
// ตั้งเสร็จแล้วเข้าสู่ระบบให้เลย ไม่ต้องให้พิมพ์รหัสที่เพิ่งตั้งอีกรอบ
function acceptInvite(rawToken, password, confirm) {
  const pw = String(password || '');
  if (pw.length < 8)  return { ok: false, message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' };
  if (pw !== String(confirm || '')) return { ok: false, message: 'รหัสผ่านสองช่องไม่ตรงกัน' };

  // ตรวจ token หลังตรวจรหัสผ่าน เพื่อไม่ให้ token ถูกใช้ทิ้งเพราะพิมพ์รหัสพลาด
  const found = findByInvite(rawToken);
  if (found.error) return { ok: false, message: found.error, code: 'BAD_INVITE' };

  const user    = found.user;
  const wasSet  = !!String(user.password || '').trim();   // มีรหัสเดิมอยู่ = ตั้งรหัสใหม่

  updateRow(SHEET.USERS, {
    id:            user.id,
    password:      hashPassword(pw),
    verified:      true,
    inviteToken:   '',     // ใช้ได้ครั้งเดียว
    inviteExpires: '',
  });

  // ตั้งรหัสใหม่แปลว่ารหัสเดิมอาจรั่ว เตะทุกเครื่องที่ค้างล็อกอินอยู่ออกให้หมด
  // ไม่งั้นคนที่แอบใช้บัญชีอยู่ยังใช้ต่อได้ทั้งที่เจ้าของเปลี่ยนรหัสแล้ว
  if (wasSet) revokeSessions(user.id);

  audit(user.id, wasSet ? 'RESET_PASSWORD' : 'VERIFY_EMAIL', 'user', user.id);
  return { ok: true, data: createSession(user) };
}

// ── ลืมรหัสผ่าน ─────────────────────────────────────────────
// เจ้าตัวกรอกอีเมลเอง ระบบส่งลิงก์ตั้งรหัสใหม่ไปให้
//
// ตอบกลับข้อความเดียวกันเสมอ ไม่ว่าจะมีอีเมลนี้ในระบบหรือไม่
// ถ้าตอบต่างกันคนนอกจะไล่เดาได้ว่าใครเป็นสมาชิกของศูนย์บ้าง
function requestReset(email) {
  const target = String(email || '').trim().toLowerCase();
  const same   = { ok: true, data: { message:
    'ถ้ามีบัญชีที่ใช้อีเมลนี้อยู่ ระบบส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว ' +
    'ลองตรวจกล่องจดหมายและโฟลเดอร์จดหมายขยะ' } };

  if (!target || target.indexOf('@') < 1) return same;

  // กันคนกดถล่มอีเมลคนอื่นเล่น กดซ้ำได้ทุก RESET_COOLDOWN_SEC วินาที
  const cache = CacheService.getScriptCache();
  const key   = 'rst_' + hashToken(target);
  if (cache.get(key)) return same;
  cache.put(key, '1', RESET_COOLDOWN_SEC);

  const user = readAll(SHEET.USERS)
    .find(u => String(u.email).trim().toLowerCase() === target);

  // ไม่มีบัญชี หรือบัญชีถูกปิด — เงียบไว้ ตอบข้อความเดิม
  if (!user || !isTrue(user.active)) return same;

  // บัญชีที่ยังไม่เคยตั้งรหัส ส่งลิงก์เปิดบัญชีให้แทน ผลลัพธ์เหมือนกันคือได้ตั้งรหัส
  if (!isVerified(user)) { issueInvite(user); return same; }

  issueReset(user);
  audit(user.id, 'REQUEST_RESET', 'user', user.id);
  return same;
}

// ออกลิงก์ตั้งรหัสใหม่ ใช้ช่อง token เดียวกับลิงก์เปิดบัญชี
// เพราะบัญชีหนึ่งจะอยู่ในสถานะใดสถานะหนึ่งเท่านั้น ไม่ต้องมีคอลัมน์แยก
function issueReset(user) {
  const token   = newInviteToken();
  const expires = Utilities.formatDate(
    new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000), TZ, 'yyyy-MM-dd HH:mm:ss'
  );

  updateRow(SHEET.USERS, {
    id:            user.id,
    inviteToken:   hashToken(token),
    inviteExpires: expires,
  });

  const link = String(SITE_URL).replace(/\/+$/, '/') + '?reset=' + token;

  let sent = false;
  try {
    sendResetEmail(user, link);
    sent = true;
  } catch (err) {
    Logger.log('ส่งอีเมลตั้งรหัสใหม่ไม่สำเร็จ ' + user.email + ': ' + err.message);
  }

  return { sent: sent, link: link, expires: expires };
}

function sendResetEmail(user, link) {
  const subject = 'ตั้งรหัสผ่านใหม่ของบัญชี ' + CENTER_NAME;

  const text =
    'สวัสดีค่ะ คุณ' + user.name + '\n\n' +
    'มีการขอตั้งรหัสผ่านใหม่ของบัญชีนี้ที่ ' + CENTER_NAME + '\n' +
    'เปิดลิงก์ข้างล่างเพื่อตั้งรหัสผ่านใหม่\n\n' +
    link + '\n\n' +
    'ลิงก์นี้ใช้ได้ภายใน ' + RESET_TTL_MINUTES + ' นาที\n' +
    'ถ้าไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ\n';

  const html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;' +
    'background:#FFF9ED;padding:28px 16px;color:#3D2F22;line-height:1.7">' +
      '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;' +
      'border:1px solid #E9DDC8;border-radius:20px;padding:28px">' +

        '<p style="margin:0 0 4px;font-size:13px;color:#98876F">' + CENTER_NAME + '</p>' +
        '<h1 style="margin:0 0 18px;font-size:21px;color:#A96246">ตั้งรหัสผ่านใหม่</h1>' +

        '<p style="margin:0 0 14px">สวัสดีค่ะ คุณ' + escHtml(user.name) + '</p>' +
        '<p style="margin:0 0 20px">มีการขอตั้งรหัสผ่านใหม่ของบัญชีนี้ ' +
        'กดปุ่มข้างล่างเพื่อตั้งรหัสผ่านใหม่ได้เลย</p>' +

        '<p style="margin:0 0 20px">' +
          '<a href="' + link + '" style="display:inline-block;background:#A96246;color:#FFFFFF;' +
          'text-decoration:none;font-weight:600;padding:13px 26px;border-radius:999px">' +
          'ตั้งรหัสผ่านใหม่</a>' +
        '</p>' +

        '<p style="margin:0 0 18px;font-size:13px;color:#6B5947">' +
          'ถ้าปุ่มกดไม่ได้ คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์<br>' +
          '<span style="word-break:break-all;color:#A96246">' + link + '</span></p>' +

        '<hr style="border:none;border-top:1px solid #F3EBDC;margin:20px 0">' +

        '<p style="margin:0;font-size:13px;color:#98876F">' +
          'ลิงก์นี้ใช้ได้ภายใน ' + RESET_TTL_MINUTES + ' นาที<br>' +
          'ถ้าไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>' +

      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: user.email, subject: subject, body: text, htmlBody: html, name: CENTER_NAME,
  });
}

// ── ผู้ดูแลระบบกดส่งลิงก์ยืนยันใหม่ ─────────────────────────
// ใช้ตอนอีเมลตกไปอยู่ในถังขยะ กรอกอีเมลผิด หรือลิงก์หมดอายุ
// ไม่ใช่การตั้งรหัสให้คนอื่น ผู้ดูแลระบบยังไม่รู้รหัสของใครอยู่ดี
function resendInvite(sess, p) {
  const user = readOne(SHEET.USERS, p.id);
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');
  if (isVerified(user)) throw new Error('บัญชีนี้ยืนยันอีเมลแล้ว ไม่ต้องส่งลิงก์ใหม่');
  if (!isTrue(user.active)) throw new Error('เปิดบัญชีนี้ก่อนแล้วค่อยส่งลิงก์ยืนยัน');

  const out = issueInvite(user);
  audit(sess.userId, 'RESEND_INVITE', 'user', user.id);
  return { sent: out.sent, link: out.link, email: user.email };
}
