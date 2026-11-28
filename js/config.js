// ============================================================
// Homey Kids D Shine — config.js
// ค่าตั้งต้นฝั่งหน้าเว็บ แก้ที่นี่ที่เดียว
// ============================================================

const CONFIG = {
  // ที่อยู่หลังบ้าน — URL ที่ลงท้ายด้วย /exec จาก Deploy > New deployment > Web app
  // ทุกครั้งที่ Deploy เวอร์ชันใหม่โดยสร้าง deployment ใหม่ URL จะเปลี่ยน ต้องมาแก้ตรงนี้
  // (ถ้าใช้ Manage deployments > แก้ไขอันเดิม > New version จะได้ URL เดิม ไม่ต้องแก้)
  GAS_URL: 'https://script.google.com/macros/s/AKfycby6VlRSq83TK8wVgT6xrsT6cW90VN1kE6cOkaCWllONhgz1TztEkpnwJ5-0Ssnlm1bA/exec',

  // ที่อยู่ของ "หน้าเว็บ" นี้ คนละอันกับ GAS_URL ข้างบน
  // อันนี้คือที่ที่ index.html วางอยู่ ไม่ใช่ที่อยู่ของ API
  SITE_URL: 'https://earthlk.github.io/HomeKidsDShine/',

  // คีย์เก็บข้อมูลใน sessionStorage
  STORE_KEY: 'hk.session',
};
