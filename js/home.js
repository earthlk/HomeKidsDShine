// ============================================================
// Homey Kids D Shine — home.js
// หน้าภาพรวม
// ============================================================
//
// หน้านี้ตอบคำถามเดียว: วันนี้ต้องทำอะไร
//
// จึงไม่มีตัวเลขสรุปแบบ "เด็กทั้งหมด 24 คน" หรือ "รายได้เดือนนี้"
// ตัวเลขพวกนั้นดูแล้วจบ ไม่ได้บอกว่าต้องลงมือทำอะไร และพอขึ้นหน้าแรก
// ทุกวันก็กลายเป็นวอลเปเปอร์ที่ไม่มีใครอ่าน
//
// ของที่อยู่บนหน้านี้มีสองอย่างเท่านั้น
//   1. งานค้างที่เคลียร์ได้ กดแล้วไปถึงที่ที่ทำงานนั้นได้เลย
//   2. ตารางวันนี้ เพราะเป็นสิ่งที่ทุกคนเปิดมาดูอยู่แล้วทุกเช้า
// งานค้างที่เป็นศูนย์จะไม่ขึ้นเลย ไม่ใช่ขึ้นเลข 0
// ============================================================

const Home = {

  data: null,

  async render(el) {
    const res = await API.call('getDashboard', {});
    if (!res.ok) {
      el.innerHTML = `<div class="card">
        <div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.data = res.data;
    el.innerHTML = this.data.role === 'parent' ? this.parent() : this.staff();
    this.bind(el);
  },

  bind(el) {
    el.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const tab = b.dataset.tab;
        // ส่งแท็บที่ต้องการไปให้หน้าปลายทางเปิดให้ถูกอัน
        // ไม่งั้นกดจากงานค้าง "รอตัดสิน" แล้วไปโผล่แท็บ "ค้างเช็ก" ต้องกดซ้ำอีกที
        if (tab) App.pending = { page: b.dataset.go, tab: tab };
        App.go(b.dataset.go);
      };
    });
  },

  greet() {
    const h = new Date().getHours();
    const word = h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
    return `${word} ${UI.esc(Store.get('name') || '')}`;
  },

  // ── ผู้ดูแลระบบและผู้ฝึกสอน ───────────────────────────────
  staff() {
    const d = this.data;

    return `
      <div class="hhead">
        <h2 class="hhead__hi">${this.greet()}</h2>
        <p class="hhead__d">${UI.esc(UI.thaiDate(d.today))}</p>
      </div>

      ${this.jobsBlock(d.jobs)}
      ${this.classesBlock(d.classes)}`;
  },

  // ── งานค้าง ───────────────────────────────────────────────
  // ไม่ใช้การ์ดตัวเลขใหญ่เรียงกัน เพราะการ์ดขนาดเท่ากันแปดใบ
  // บอกว่าทุกอย่างสำคัญเท่ากัน ซึ่งไม่จริง
  // ใช้แถวเรียงลงมาแทน เรียงตามความด่วน อ่านไล่จากบนลงล่างได้
  jobsBlock(jobs) {
    if (!jobs || !jobs.length) {
      return `<div class="hdone">
        <p class="hdone__t">ไม่มีงานค้าง</p>
        <p class="hdone__d">เช็กชื่อ บันทึกกิจกรรม และการเงิน เคลียร์หมดแล้ว</p>
      </div>`;
    }

    // ลำดับมาจากหลังบ้าน ซึ่งเป็นที่ที่รู้ว่าแต่ละเรื่องด่วนแค่ไหนจริง ๆ
    const rows = jobs.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));

    return `
      <section class="hsec">
        <h3 class="hsec__h">ต้องเคลียร์ <span>${rows.length} เรื่อง</span></h3>
        <div class="jobs">
          ${rows.map(j => `
            <button class="job job--${UI.esc(j.tone)}"
              data-go="${UI.esc(j.page)}" data-tab="${UI.esc(j.tab || '')}">
              <span class="job__n">${j.n}</span>
              <span class="job__b">
                <span class="job__t">${UI.esc(j.label)}</span>
                ${j.sub ? `<span class="job__s">${UI.esc(j.sub)}</span>` : ''}
              </span>
              <span class="job__go" aria-hidden="true">›</span>
            </button>`).join('')}
        </div>
      </section>`;
  },

  // ── ตารางวันนี้ ───────────────────────────────────────────
  classesBlock(classes) {
    if (!classes || !classes.length) {
      return `<section class="hsec">
        <h3 class="hsec__h">ตารางวันนี้</h3>
        <p class="hempty">วันนี้ไม่มีคาบสอน</p>
      </section>`;
    }

    return `
      <section class="hsec">
        <h3 class="hsec__h">ตารางวันนี้ <span>${classes.length} คาบ</span></h3>
        <div class="tday">
          ${classes.map(c => `
            <button class="tday__r" data-go="attendance" data-tab="unchecked">
              <span class="tday__t">
                <b>${UI.esc(c.startTime)}</b><small>${UI.esc(c.endTime)}</small>
              </span>
              <span class="tday__m">
                <span class="tday__c">${UI.esc(c.courseName || 'ไม่ระบุคอร์ส')}</span>
                <small>${UI.esc(c.kids.join(', '))}</small>
                ${c.alerts.length
                  ? `<small class="warn">${UI.esc(c.alerts.join(' · '))}</small>` : ''}
              </span>
              <span class="tday__w">${UI.esc(c.trainerName || '—')}${
                c.location ? `<small>${UI.esc(c.location)}</small>` : ''}</span>
              <span class="tday__a">${c.checked >= c.kids.length
                ? '<span class="pchip pchip--ok">เช็กชื่อแล้ว</span>'
                : `<span class="pchip">เช็กแล้ว ${c.checked}/${c.kids.length}</span>`}</span>
            </button>`).join('')}
        </div>
      </section>`;
  },

  // ── ผู้ปกครอง ─────────────────────────────────────────────
  // ไม่มีงานค้างให้เคลียร์ คำถามคือนัดหน้าเมื่อไหร่ ลูกเรียนถึงไหน
  // และต้องจ่ายอะไรอีกไหม เรียงตามนั้น
  parent() {
    const d = this.data;

    return `
      <div class="hhead">
        <h2 class="hhead__hi">${this.greet()}</h2>
        <p class="hhead__d">${UI.esc(UI.thaiDate(d.today))}</p>
      </div>

      ${d.dueTotal ? `
        <section class="hsec">
          <button class="job job--warn" data-go="income">
            <span class="job__n">${UI.esc(this.money(d.dueTotal))}</span>
            <span class="job__b">
              <span class="job__t">ยอดค้างชำระ</span>
              <span class="job__s">${d.due.map(x =>
                UI.esc(x.childName + ' · ' + x.courseName)).join(' · ')}</span>
            </span>
            <span class="job__go" aria-hidden="true">›</span>
          </button>
        </section>` : ''}

      <section class="hsec">
        <h3 class="hsec__h">นัดถัดไป</h3>
        ${d.next.length ? `<div class="tday tday--next">
          ${d.next.map(n => `
            <button class="tday__r" data-go="calendar">
              <span class="tday__t">
                <b>${UI.esc(UI.thaiDate(n.date, 'short'))}</b>
                <small>${UI.esc(n.startTime)}</small>
              </span>
              <span class="tday__m">
                <span class="tday__c">${UI.esc(n.courseName)}</span>
                <small>${UI.esc(n.childName)}${
                  n.location ? ' · ' + UI.esc(n.location) : ''}</small>
              </span>
              <span class="tday__a">${n.isToday
                ? '<span class="pchip pchip--ok">วันนี้</span>' : ''}</span>
            </button>`).join('')}
        </div>` : '<p class="hempty">ยังไม่มีนัดที่ลงไว้ ติดต่อศูนย์เพื่อนัดวันเรียน</p>'}
      </section>

      <section class="hsec">
        <h3 class="hsec__h">ความคืบหน้า</h3>
        <div class="pgrid">
          ${d.children.map(c => `
            <article class="pcard">
              <div class="pcard__top">
                <div class="pcard__avatar">${UI.esc(People.initial({ name: c.name }))}</div>
                <div class="pcard__id"><h3 class="pcard__name">${UI.esc(c.name)}</h3></div>
              </div>
              ${c.courses.length ? `<div class="pcard__prog">
                ${c.courses.map(x => {
                  const total = x.total || 1;
                  return `<div class="prog">
                    <div class="prog__k">
                      <span class="prog__name">${UI.esc(x.courseName)}</span>
                      <span class="prog__n">${x.taught}/${x.total}</span>
                    </div>
                    <div class="bar" role="img"
                      aria-label="${UI.esc(x.courseName)} เรียนแล้ว ${x.taught} จาก ${x.total} ครั้ง">
                      <span class="bar__done" style="width:${(x.taught / total) * 100}%"></span>
                      <span class="bar__booked" style="width:${(x.booked / total) * 100}%"></span>
                    </div>
                  </div>`;
                }).join('')}
              </div>` : '<p class="pcard__none">ยังไม่ได้ลงคอร์ส</p>'}
            </article>`).join('')}
        </div>
      </section>`;
  },

  money(n) {
    return (Number(n) || 0).toLocaleString('th-TH');
  },
};
