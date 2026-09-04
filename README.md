# Little Stars

ระบบจัดการศูนย์ฝึกเด็กเล็ก — ตารางนัด บันทึกกิจกรรม คอร์ส และการเงิน
หน้าเว็บเป็น static site บน GitHub Pages ส่วนหลังบ้านเป็น Google Apps Script
ที่ใช้ Google Sheets เป็นฐานข้อมูล

**สถานะ:** Phase 1 — เข้าสู่ระบบ โครงหน้าแอป และเมนูตามสิทธิ์

---

## โครงสร้าง

```
index.html              หน้าหลัก
css/tokens.css          ตัวแปรสี ฟอนต์ ระยะห่าง
css/app.css             สไตล์หลัก
js/config.js            ตั้งค่า GAS_URL ← ต้องแก้ก่อนใช้
js/api.js               ตัวเรียกหลังบ้านตัวเดียวของทั้งระบบ
js/ui.js                toast กล่องซ้อน ไอคอน วันที่ไทย
js/auth.js              หน้าเข้าสู่ระบบ
js/app.js               โครงหน้า เมนู ทะเบียนหน้า

apps-script/            วางในโปรเจ็กต์ Apps Script (ไม่ถูก Pages ใช้งาน)
├── Config.gs           ค่าคงที่ + โครงสร้างคอลัมน์ทุกชีต
├── Utils.gs            อ่าน/เขียนชีต วันที่ audit
├── Auth.gs             เข้าสู่ระบบ session สิทธิ์
├── Main.gs             รับ request + ตารางเส้นทาง
└── Setup.gs            รันครั้งเดียวตอนติดตั้ง
```

---

## ติดตั้ง

### 1. สร้าง repo

สร้าง repo ใหม่บน GitHub ชื่ออะไรก็ได้ ตัวอย่างนี้ใช้ `littlestars`
ตั้งเป็น Public เพราะ GitHub Pages ต้องการ (แผน Free)

อัปโหลดไฟล์ทั้งหมดจากโฟลเดอร์นี้ขึ้นไปที่ root ของ repo
จะลากวางผ่านหน้าเว็บ GitHub หรือใช้ command line ก็ได้:

```bash
git init
git add .
git commit -m "ตั้งต้นระบบ Phase 1"
git branch -M main
git remote add origin https://github.com/USERNAME/littlestars.git
git push -u origin main
```

### 2. เปิด GitHub Pages

Settings → Pages → Source เลือก `Deploy from a branch`
Branch เลือก `main` โฟลเดอร์ `/ (root)` แล้ว Save

รอสักครู่จะได้ URL หน้าตาแบบ `https://USERNAME.github.io/littlestars/`

### 3. สร้างโปรเจ็กต์ Apps Script ใหม่

เปิด script.google.com สร้างโปรเจ็กต์ใหม่ **อย่าใช้โปรเจ็กต์เดิม**
เพราะโค้ดชุดเก่ามีฟังก์ชันชื่อซ้ำกัน เช่น `getSS` `newId` `login` `hashPassword`
ถ้าอยู่โปรเจ็กต์เดียวกันตัวที่โหลดทีหลังจะทับ แล้วหาสาเหตุยาก

สร้างไฟล์ 5 ตัวตามชื่อในโฟลเดอร์ `apps-script/` แล้ววางเนื้อหาลงไป

### 4. สร้างชีตใหม่

รันฟังก์ชัน `createNewSpreadsheet` แล้วดู Log
เอา ID ที่ได้ไปใส่ในตัวแปร `SPREADSHEET_ID` ใน `Config.gs`

### 5. สร้างบัญชีผู้ดูแลระบบ

รัน `createAdminUser` จะได้ `admin@littlestars.com` / `Admin@1234`
เปลี่ยนรหัสผ่านทันทีหลังเข้าใช้งานครั้งแรก

### 6. ตรวจว่าติดตั้งครบ

รัน `checkSetup` ควรขึ้น ✅ ครบทุกชีต

### 7. ย้ายข้อมูลจากชีตเก่า (ถ้าต้องการ)

รัน `migrateFromOldSheet` ครั้งแรกเป็นโหมดทดลอง แสดงว่าจะย้ายอะไรบ้าง
ตรวจ Log แล้วแก้ `DRY_RUN` เป็น `false` แล้วรันซ้ำ

ย้ายเฉพาะผู้ปกครองที่มีเด็กในสังกัด เด็กทุกคน และคอร์สทุกคอร์ส
ไม่ย้ายนัดหมายเก่า log และ consent เพราะเริ่มนับใหม่จะสะอาดกว่า

### 8. Deploy เป็น Web App

Deploy → New deployment → ประเภท Web app

| ตั้งค่า | ค่าที่ต้องเลือก |
|---|---|
| Execute as | Me |
| Who has access | Anyone |

คัดลอก URL ที่ลงท้ายด้วย `/exec`

> ทุกครั้งที่แก้โค้ดฝั่ง Apps Script ต้อง Deploy ใหม่ (หรือเลือก Manage deployments
> แล้วกด Edit → New version) ไม่งั้นหน้าเว็บยังเรียกโค้ดตัวเก่าอยู่

### 9. ตั้งค่าหน้าเว็บ

แก้ `js/config.js`:

```js
GAS_URL:  'URL จากขั้นที่ 8',
SITE_URL: 'https://USERNAME.github.io/littlestars/',
```

commit แล้ว push

### 10. ทดสอบ

เปิด URL จากขั้นที่ 2 เข้าสู่ระบบด้วยบัญชีจากขั้นที่ 5
ควรเห็นเมนูซ้าย 9 รายการ และหน้าภาพรวมขึ้นข้อความทักทาย

หน้าอื่นจะขึ้นว่า "อยู่ระหว่างพัฒนา" ซึ่งถูกต้องตามแผน Phase 1

---

## เมื่อเปิดใช้ OAuth ใน Phase หลัง

URL ของ repo ใหม่ต่างจากเดิม ต้องไปแก้ค่าที่ลงทะเบียนไว้ทั้งสองที่:

- **LINE Developers** → Channel ของ LINE Login → Callback URL
- **Google Cloud Console** → Credentials → OAuth client → Authorized JavaScript origins

ใส่ URL ใหม่เพิ่มเข้าไป (เก็บของเดิมไว้ก็ได้ ไม่ต้องลบ)

---

## กฎที่ยึดในโค้ดชุดนี้

1. ฟังก์ชันหนึ่งชื่อประกาศได้ครั้งเดียว ไม่มีการเขียนทับภายหลัง
2. เรียกหลังบ้านผ่าน `API.call()` ตัวเดียว ผลลัพธ์เป็น `{ ok, data, message }` เสมอ
   ผู้เรียกต้องเช็ค `res.ok` ก่อนใช้ `res.data` ทุกครั้ง
3. วันที่ใช้ `todayTH()` ฝั่งหลังบ้าน และ `UI.today()` ฝั่งหน้าเว็บ ห้ามใช้ `toISOString()`
   เพราะให้เวลา UTC ซึ่งก่อนเจ็ดโมงเช้าจะได้วันของเมื่อวาน
4. เก็บ session ทั้งใน CacheService และ ScriptProperties
   เพราะ CacheService ลบข้อมูลทิ้งได้ตลอดเมื่อหน่วยความจำเต็ม
5. `audit()` บันทึกเฉพาะการเปลี่ยนแปลงข้อมูล ไม่บันทึกการอ่าน
6. คอมเมนต์ภาษาไทย
7. เพิ่มหน้าใหม่โดยลงทะเบียนใน `PAGES` ของ `app.js` และ `ROUTES` ของ `Main.gs`
   ไม่แก้ไฟล์อื่น

---

## แผน Phase ถัดไป

| Phase | เนื้อหา | ไฟล์ที่จะเพิ่ม |
|---|---|---|
| 2 | ผู้ปกครองและเด็ก | `People.gs` + `js/people.js` |
| 3 | คอร์สและการลงทะเบียน | `Courses.gs` + `js/courses.js` |
| 4 | ตารางนัด | `Sessions.gs` + `js/calendar.js` |
| 5 | บันทึกกิจกรรม | `Activities.gs` + `js/activity.js` |
| 6 | การเงิน | `Finance.gs` + `js/finance.js` |
| 7 | สรุปการเรียนและใบเสร็จ | `Reports.gs` + `js/reports.js` |
| 8 | รูปภาพและ PDPA | `Photos.gs` `Pdpa.gs` + `js/privacy.js` |
