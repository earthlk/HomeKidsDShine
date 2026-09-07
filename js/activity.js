// ============================================================
// Homey Kids D Shine — activity.js
// บันทึกกิจกรรมการฝึกสอน
// ============================================================

const Activity = {

  data: { rows: [], byTrainer: [], isAdmin: false },
  tab:  'pending',

  // ทักษะที่ศูนย์ใช้ประเมินเป็นประจำ กดเลือกเร็วกว่าพิมพ์เอง
  SKILLS: ['การทรงตัว', 'กล้ามเนื้อมัดใหญ่', 'กล้ามเนื้อมัดเล็ก', 'การประสานงาน',
           'ความแข็งแรง', 'ความยืดหยุ่น', 'สมาธิ', 'การทำตามคำสั่ง',
           'ทักษะสังคม', 'ความมั่นใจ'],

  async render(el) {
    const res = await API.cached('getActivityBoard');
    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    // บัญชีผู้ฝึกสอนที่ยังไม่ผูกข้อมูล จะไม่รู้ว่าเป็นใครในระบบ
    if (res.data.needsProfile) {
      el.innerHTML = `<div class="card">${UI.empty('บัญชียังไม่พร้อมใช้งาน',
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน ติดต่อผู้ดูแลศูนย์เพื่อผูกให้ก่อน')}</div>`;
      return;
    }

    this.data = res.data;
    this.paint(el);
  },

  paint(el) {
    const pending = this.data.rows.filter(r => !r.logged);
    const logged  = this.data.rows.filter(r => r.logged);

    el.innerHTML = `
      ${this.data.isAdmin ? this.trainerSummary(pending) : ''}

      <div class="segbar" role="tablist">
        <button class="segbar__btn${this.tab === 'pending' ? ' is-on' : ''}"
          data-tab="pending" role="tab">
          รอบันทึก <span class="segbar__count">${pending.length}</span>
        </button>
        <button class="segbar__btn${this.tab === 'logged' ? ' is-on' : ''}"
          data-tab="logged" role="tab">
          บันทึกแล้ว <span class="segbar__count">${logged.length}</span>
        </button>
      </div>

      <div id="actList"></div>`;

    el.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { Activity.tab = b.dataset.tab; Activity.paint(el); };
    });

    this.paintList();
  },

  // สรุปว่าใครค้างบันทึกกี่รายการ เพื่อให้ตามงานถูกคน
  trainerSummary(pending) {
    if (!this.data.byTrainer.length) return '';

    return `<div class="card" style="margin-bottom:var(--sp-4)">
      <p class="dsection__title">ค้างบันทึก ${pending.length} รายการ</p>
      <div class="chipbar" style="margin:0">
        ${this.data.byTrainer.map(t => `
          <span class="chipbtn">
            ${UI.esc(t.name || 'ไม่ระบุผู้สอน')}
            <span class="chipbtn__n">${t.pending}</span>
            <span class="acard__meta">ค้างตั้งแต่ ${UI.thaiDate(t.oldest, 'short')}</span>
          </span>`).join('')}
      </div>
    </div>`;
  },

  paintList() {
    const box = document.getElementById('actList');
    if (!box) return;

    const pending = this.tab === 'pending';
    const rows    = this.data.rows.filter(r => r.logged !== pending);

    if (!rows.length) {
      box.innerHTML = pending
        ? UI.empty('บันทึกครบแล้ว', 'ไม่มีนัดที่รอบันทึก เมื่อถึงวันสอนครั้งถัดไปรายการจะขึ้นที่นี่')
        : UI.empty('ยังไม่มีบันทึก', 'เมื่อบันทึกกิจกรรมแล้ว ประวัติจะเก็บไว้ที่นี่และในหน้าคอร์ส');
      return;
    }

    // จัดกลุ่มคาบสอนที่มีเด็กหลายคน ครูจะได้บันทึกทีเดียวจบ
    const groups = this.groupRows(rows);

    box.innerHTML = groups.map(g => this.card(g)).join('');

    box.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = () => Activity.openForm(b.dataset.open);
    });
  },

  // คาบเดียวกันคือคอร์ส วันเวลา และผู้สอนตรงกัน
  groupRows(rows) {
    const map = {};
    const out = [];

    rows.forEach(r => {
      const key = [r.date, r.startTime, r.endTime, r.courseName, r.trainerId].join('|');
      if (!map[key]) { map[key] = { key: key, lead: r, items: [] }; out.push(map[key]); }
      map[key].items.push(r);
    });

    return out;
  },

  card(g) {
    const r    = g.lead;
    const many = g.items.length > 1;
    const late = this.daysLate(r.date);

    // รวมข้อควรระวังของเด็กทุกคนในคาบ ตัดที่ซ้ำออก
    const alerts = [];
    g.items.forEach(x => (x.alerts || []).forEach(a => {
      if (alerts.indexOf(a) < 0) alerts.push(a);
    }));

    return `
      <button class="acard acard--log" data-open="${UI.esc(g.key)}">
        <span class="acard__time">
          <span class="acard__from">${UI.esc(r.startTime)}</span>
          <span class="acard__to">${UI.esc(r.endTime)}</span>
        </span>

        <span class="acard__col">
          <span class="acard__name">${UI.esc(r.courseName || 'ไม่ระบุคอร์ส')}</span>
          <span class="acard__k">${UI.thaiDate(r.date, 'short')}</span>
          <span class="acard__v">${UI.esc(g.items.map(x => x.childName).join(', '))}</span>
        </span>

        <span class="acard__col">
          ${this.data.isAdmin
            ? `<span class="acard__k">ผู้ฝึกสอน</span>
               <span class="acard__v">${UI.esc(r.trainerName || '—')}</span>`
            : `<span class="acard__k">สถานที่</span>
               <span class="acard__v">${UI.esc(r.location || '—')}</span>`}
          ${many ? `<span class="acard__meta">กลุ่ม ${g.items.length} คน</span>` : ''}
        </span>

        <span class="acard__col">
          ${r.logged
            ? `<span class="acard__k">คะแนน</span>
               <span class="acard__v">${r.rating ? '★'.repeat(Number(r.rating)) : '—'}</span>`
            : `<span class="acard__k">ค้างมา</span>
               <span class="acard__v">${late}</span>`}
        </span>

        ${r.logged
          ? '<span class="pchip pchip--ok">บันทึกแล้ว</span>'
          : `<span class="pchip ${late === 'วันนี้' ? 'pchip--warn' : 'pchip--danger'}">รอบันทึก</span>`}

        ${r.summary || alerts.length ? `
          <span class="acard__foot">
            ${alerts.length ? `<span class="acard__alert">${UI.esc(alerts.join(' · '))}</span>` : ''}
            ${r.summary ? `<span class="acard__meta">${UI.esc(r.summary)}</span>` : ''}
          </span>` : ''}
      </button>`;
  },

  daysLate(date) {
    const today = UI.today();
    if (date === today) return 'วันนี้';

    const a = new Date(date + 'T00:00:00');
    const b = new Date(today + 'T00:00:00');
    const days = Math.round((b - a) / 86400000);

    return days === 1 ? 'เมื่อวาน' : days + ' วัน';
  },

  // ── ฟอร์มบันทึก ───────────────────────────────────────────
  openForm(key) {
    const rows = this.data.rows.filter(r => r.logged !== (this.tab === 'pending'));
    const g    = this.groupRows(rows).find(x => x.key === key);
    if (!g) return;

    const r      = g.lead;
    const many   = g.items.length > 1;
    const chosen = String(r.skills || '').split(',').map(x => x.trim()).filter(Boolean);

    UI.openSheet(`
      <div class="sheet__title">${r.logged ? 'แก้ไขบันทึก' : 'บันทึกกิจกรรม'}</div>
      <p class="sheet__sub">
        ${UI.esc(r.courseName)} · ${UI.thaiDate(r.date)} ${UI.esc(r.startTime)}
      </p>

      <div class="dsection">
        <h3 class="dsection__title">เด็กในคาบนี้ ${g.items.length} คน</h3>
        <div class="scard__kids" style="border:none;padding:0">
          ${g.items.map(x => `<span class="pchip">${UI.esc(x.childName)}</span>`).join('')}
        </div>
        ${many && !r.logged
          ? '<p class="fhint">บันทึกเดียวกันจะใช้กับเด็กทุกคนในคาบ แก้รายคนทีหลังได้</p>' : ''}
      </div>

      ${People.fgroup('สิ่งที่ฝึกวันนี้')}
      <div class="field">
        <label class="field__label" for="a_summary">สรุปการฝึก</label>
        <textarea class="field__input" id="a_summary" rows="4"
          placeholder="ทำอะไรบ้าง เด็กทำได้แค่ไหน มีอะไรเปลี่ยนแปลง">${UI.esc(r.summary)}</textarea>
      </div>

      <div class="field">
        <label class="field__label">ทักษะที่ฝึก</label>
        <div class="chipbar" id="a_skills">
          ${this.SKILLS.map(sk => `
            <button type="button" class="chipbtn${chosen.indexOf(sk) >= 0 ? ' is-on' : ''}"
              data-skill="${UI.esc(sk)}">${UI.esc(sk)}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label class="field__label">ความร่วมมือของเด็ก</label>
        <div class="stars" id="a_rating">
          ${[1, 2, 3, 4, 5].map(n => `
            <button type="button" class="star${Number(r.rating) >= n ? ' is-on' : ''}"
              data-star="${n}" aria-label="${n} ดาว">★</button>`).join('')}
        </div>
      </div>

      ${People.finput('a_nextGoal', 'เป้าหมายครั้งหน้า', r.nextGoal,
        'เช่น ฝึกกระโดดสองขาให้ต่อเนื่อง')}

      <input type="hidden" id="a_ratingValue" value="${UI.esc(r.rating)}">

      <div class="sheet__actions">
        ${r.logged && this.data.isAdmin
          ? `<button class="btn btn--danger" data-act="del" data-busy="กำลังลบ">ลบบันทึก</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    document.querySelectorAll('[data-skill]').forEach(b => {
      b.onclick = () => b.classList.toggle('is-on');
    });

    document.querySelectorAll('[data-star]').forEach(b => {
      b.onclick = () => {
        const n = Number(b.dataset.star);
        document.getElementById('a_ratingValue').value = n;
        document.querySelectorAll('[data-star]').forEach(x => {
          x.classList.toggle('is-on', Number(x.dataset.star) <= n);
        });
      };
    });

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Activity.submit(g),
      del:   () => Activity.remove(g.items[0].id),
    });
  },

  async submit(g) {
    const skills = Array.prototype.slice
      .call(document.querySelectorAll('[data-skill].is-on'))
      .map(b => b.dataset.skill);

    const payload = {
      sessionIds: g.items.map(x => x.id),
      summary:    People.val('a_summary'),
      skills:     skills.join(', '),
      rating:     People.val('a_ratingValue'),
      nextGoal:   People.val('a_nextGoal'),
    };

    if (!payload.summary) { UI.toast('เขียนสรุปสิ่งที่ฝึกก่อน', 'error'); return; }

    const res = await API.call('saveActivity', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast('บันทึกแล้ว ' + res.data.count + ' รายการ');
    UI.closeSheet();
    this.reload();
  },

  async remove(sessionId) {
    const res = await API.call('removeActivity', { sessionId });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast('ลบบันทึกแล้ว นัดกลับไปเป็นรอบันทึก');
    UI.closeSheet();
    this.reload();
  },

  async reload() {
    // บันทึกแล้วยอดสอนแล้วในหน้าคอร์สและตารางนัดเปลี่ยนตาม
    App.invalidate();
    await this.render(document.getElementById('page'));
  },
};

PAGES.activity = (el) => Activity.render(el);
