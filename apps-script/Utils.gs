// ============================================================
// Little Stars — Utils.gs
// helper กลาง ใช้ร่วมกันทุก module
// ============================================================

// ── เปิด Spreadsheet ────────────────────────────────────────
// สคริปต์นี้เป็น Standalone ต้องเปิดด้วย ID เสมอ
function getSS() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const sheet = getSS().getSheetByName(name);
  if (!sheet) throw new Error('ไม่พบชีต: ' + name);
  return sheet;
}

// ── วันที่/เวลา (อ้างอิงเวลาไทยเสมอ) ────────────────────────

// วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD
function todayTH() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

// timestamp ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD HH:mm:ss
// ใช้รูปแบบนี้แทน ISO เพราะเรียงลำดับด้วยการเทียบ string ได้ตรง
function nowTH() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

// แปลงค่าจาก cell ให้เป็น string ที่ frontend ใช้ได้
// Google Sheets เก็บเวลาล้วนเป็น Date ของวันที่ 1899-12-30 ต้องแยกเคสนี้
function cellToValue(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    if (y === 1899) {
      // เป็นเวลาล้วน → HH:mm
      return Utilities.formatDate(val, TZ, 'HH:mm');
    }
    // มีทั้งวันและเวลา → คืนพร้อมเวลา, ถ้าเที่ยงคืนพอดีคืนแค่วันที่
    const hasTime = val.getHours() || val.getMinutes() || val.getSeconds();
    return Utilities.formatDate(val, TZ, hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  return val;
}

// ── สร้าง id ────────────────────────────────────────────────
function newId() {
  return Utilities.getUuid().split('-')[0].toUpperCase();
}

// ── อ่านทั้งชีตเป็น array ของ object ────────────────────────
function readAll(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values  = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h).trim());

  return values.slice(1)
    .filter(row => row.some(c => c !== '' && c !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cellToValue(row[i]); });
      return obj;
    });
}

// อ่านแถวเดียวตาม id
function readOne(sheetName, id) {
  return readAll(sheetName).find(r => String(r.id) === String(id)) || null;
}

// ── เขียนแถวใหม่ ────────────────────────────────────────────
// เขียนตามลำดับคอลัมน์ใน SCHEMA ไม่ใช่ตามลำดับ key ของ object
function insertRow(sheetName, obj) {
  const sheet   = getSheet(sheetName);
  const headers = SCHEMA[sheetName];
  if (!headers) throw new Error('ไม่มี schema ของชีต: ' + sheetName);

  const record = Object.assign({}, obj);
  if (!record.id) record.id = newId();
  if (headers.indexOf('createdAt') >= 0 && !record.createdAt) record.createdAt = nowTH();

  const row = headers.map(h => (record[h] === undefined || record[h] === null) ? '' : record[h]);
  sheet.appendRow(row);
  return record;
}

// ── แก้ไขแถวตาม id ──────────────────────────────────────────
// เขียนทั้งแถวครั้งเดียวด้วย setValues() ไม่วนเขียนทีละ cell
// (เดิมวนทีละ cell = 20 คอลัมน์ก็ 20 request ช้ามาก)
function updateRow(sheetName, obj) {
  if (!obj || !obj.id) throw new Error('updateRow ต้องมี id');

  const sheet   = getSheet(sheetName);
  const headers = SCHEMA[sheetName];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('ไม่พบข้อมูลในชีต: ' + sheetName);

  const idCol = headers.indexOf('id') + 1;
  const ids   = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();

  let rowIndex = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(obj.id)) { rowIndex = i + 2; break; }
  }
  if (rowIndex === -1) throw new Error('ไม่พบข้อมูล id: ' + obj.id);

  // อ่านแถวเดิมมาก่อน แล้วทับเฉพาะ field ที่ส่งมา
  const current = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const merged  = headers.map((h, i) => {
    if (h === 'updatedAt') return nowTH();
    return obj[h] !== undefined ? obj[h] : current[i];
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([merged]);
  return { success: true, id: obj.id };
}

// ── ลบแถวตาม id ─────────────────────────────────────────────
function deleteRow(sheetName, id) {
  const sheet   = getSheet(sheetName);
  const headers = SCHEMA[sheetName];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false };

  const idCol = headers.indexOf('id') + 1;
  const ids   = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return { success: true };
    }
  }
  return { success: false, message: 'ไม่พบข้อมูล' };
}

// ── บันทึก audit log ────────────────────────────────────────
// บันทึกเฉพาะการกระทำที่เปลี่ยนแปลงข้อมูล ไม่บันทึกการอ่าน
// (ของเดิมบันทึกทุกครั้งที่อ่านรูป ทำให้ log บวมเป็นพันแถว)
function audit(userId, action, target, targetId) {
  try {
    insertRow(SHEET.AUDIT, {
      id: newId(), userId, action, target,
      targetId: String(targetId || ''), at: nowTH(),
    });
  } catch (e) {
    Logger.log('audit error: ' + e.message);
  }
}

// ── แปลง array เป็น map ตาม key เพื่อ join เร็ว ──────────────
function indexBy(rows, key) {
  const map = {};
  rows.forEach(r => { map[String(r[key])] = r; });
  return map;
}

// จัดกลุ่มหลายแถวตาม key
function groupBy(rows, key) {
  const map = {};
  rows.forEach(r => {
    const k = String(r[key]);
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return map;
}
