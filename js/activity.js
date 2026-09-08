// ============================================================
// Homey Kids D Shine — activity.js
// บันทึกกิจกรรมการฝึกสอน
// ============================================================

const Activity = {

  data: { rows: [], byTrainer: [], isAdmin: false, isParent: false },
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
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลในระบบ ติดต่อผู้ดูแลศูนย์เพื่อผูกให้ก่อน')}</div>`;
      return;
    }

    this.data = res.data;
    this.paint(el);
  },

  paint(el) {
    const pending = this.data.rows.filter(r => !r.logged);
    const logged  = this.data.rows.filter(r => r.logged);

    // ผู้ปกครองเห็นเฉพาะบันทึกที่ครูเขียนแล้ว จึงไม่มีอะไรให้สลับ
    if (this.data.isParent) {
      this.tab = 'logged';
      el.innerHTML = '<div id="actList"></div>';
      this.paintList();
      return;
    }

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
      box.innerHTML = this.data.isParent
        ? UI.empty('ยังไม่มีบันทึกการเรียน',
            'เมื่อผู้ฝึกสอนบันทึกกิจกรรมหลังเรียนเสร็จ รายละเอียดจะขึ้นที่นี่')
        : pending
          ? UI.empty('บันทึกครบแล้ว', 'ไม่มีนัดที่รอบันทึก เมื่อถึงวันสอนครั้งถัดไปรายการจะขึ้นที่นี่')
          : UI.empty('ยังไม่มีบันทึก', 'เมื่อบันทึกกิจกรรมแล้ว ประวัติจะเก็บไว้ที่นี่และในหน้าคอร์ส');
      return;
    }

    // จัดกลุ่มคาบสอนที่มีเด็กหลายคน ครูจะได้บันทึกทีเดียวจบ
    const groups = this.groupRows(rows);

    box.innerHTML = groups.map(g => this.card(g)).join('');

    box.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = () => Activity.isParent()
        ? Activity.openDetail(b.dataset.open)
        : Activity.openForm(b.dataset.open);
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
               <span class="acard__v hrow__stars">${g.items.map(x =>
                   x.rating ? '★'.repeat(Number(x.rating)) : '—').join(' ')}</span>`
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

  isParent() { return !!this.data.isParent; },

  // ── มุมมองอ่านอย่างเดียวของผู้ปกครอง ──────────────────────
  // แยกบันทึกของคาบกับผลของบุตรหลานให้เห็นชัดว่าอันไหนเรื่องของใคร
  openDetail(key) {
    const g = this.groupRows(this.data.rows.filter(r => r.logged)).find(x => x.key === key);
    if (!g) return;

    const r = g.lead;

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(r.courseName)}</div>
      <p class="sheet__sub">
        ${UI.thaiDate(r.date)} ${UI.esc(r.startTime)} – ${UI.esc(r.endTime)}
        ${r.trainerName ? ' · ' + UI.esc(r.trainerName) : ''}
      </p>

      <div class="dsection">
        <h3 class="dsection__title">สิ่งที่ฝึกในคาบนี้</h3>
        <p class="dnote">${UI.esc(r.summary)}</p>
        ${r.skills ? `<p class="hrow__meta">ทักษะที่ฝึก ${UI.esc(r.skills)}</p>` : ''}
        ${r.nextGoal ? `<p class="hrow__meta">ครั้งหน้า ${UI.esc(r.nextGoal)}</p>` : ''}
      </div>

      ${g.items.map(x => `
        <div class="dsection">
          <h3 class="dsection__title">ผลของ ${UI.esc(x.childName)}</h3>
          ${x.rating ? `<p class="hrow__stars" style="margin:0 0 4px">${'★'.repeat(Number(x.rating))}</p>` : ''}
          <p class="dnote">${UI.esc(x.note) || 'ผู้ฝึกสอนไม่ได้เขียนหมายเหตุเพิ่มเติม'}</p>
        </div>`).join('')}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
      </div>`);

    People.bindSheet({ close: () => UI.closeSheet() });
  },


  // ── ฟอร์มบันทึก ───────────────────────────────────────────
  openForm(key) {
    const rows = this.data.rows.filter(r => r.logged !== (this.tab === 'pending'));
    const g    = this.groupRows(rows).find(x => x.key === key);
    if (!g) return;

    const r      = g.lead;
    const chosen = String(r.skills || '').split(',').map(x => x.trim()).filter(Boolean);

    UI.openSheet(`
      <div class="sheet__title">${r.logged ? 'แก้ไขบันทึก' : 'บันทึกกิจกรรม'}</div>
      <p class="sheet__sub">
        ${UI.esc(r.courseName)} · ${UI.thaiDate(r.date)} ${UI.esc(r.startTime)}
        · เด็ก ${g.items.length} คน
      </p>

      ${People.fgroup('บันทึกของคาบ', 'ใช้ร่วมกันทุกคนในคาบนี้')}
      <div class="field">
        <label class="field__label" for="a_summary">สรุปการฝึก</label>
        <textarea class="field__input" id="a_summary" rows="3"
          placeholder="วันนี้ฝึกอะไร ใช้อุปกรณ์อะไร ทำกิจกรรมอย่างไร">${UI.esc(r.summary)}</textarea>
      </div>

      <div class="field">
        <label class="field__label">ทักษะที่ฝึก</label>
        <div class="chipbar" id="a_skills">
          ${this.SKILLS.map(sk => `
            <button type="button" class="chipbtn${chosen.indexOf(sk) >= 0 ? ' is-on' : ''}"
              data-skill="${UI.esc(sk)}">${UI.esc(sk)}</button>`).join('')}
        </div>
      </div>

      ${People.finput('a_nextGoal', 'เป้าหมายครั้งหน้าของคาบ', r.nextGoal,
        'เช่น ฝึกกระโดดสองขาให้ต่อเนื่อง')}

      ${People.fgroup('ผลรายคน', 'เด็กแต่ละคนตอบสนองไม่เหมือนกัน บันทึกแยกกันได้')}
      ${g.items.map((x, i) => this.childBlock(x, i)).join('')}

      <div class="sheet__actions">
        ${r.logged && this.data.isAdmin
          ? `<button class="btn btn--danger" data-act="del" data-busy="กำลังลบ">ลบบันทึก</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    document.querySelectorAll('[data-skill]').forEach(b => {
      b.onclick = () => b.classList.toggle('is-on');
    });

    // ดาวของเด็กแต่ละคนแยกกัน จึงต้องอ้างอิงด้วยลำดับของคนนั้น
    document.querySelectorAll('[data-star]').forEach(b => {
      b.onclick = () => {
        const i = b.dataset.kid;
        const n = Number(b.dataset.star);
        document.getElementById('a_rating_' + i).value = n;
        document.querySelectorAll(`[data-kid="${i}"]`).forEach(x => {
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

  childBlock(x, i) {
    return `
      <div class="kidblock">
        <div class="kidblock__head">
          <span class="pcard__avatar pcard__avatar--sm">${UI.esc(People.initial({ name: x.childName }))}</span>
          <span class="kidblock__name">${UI.esc(x.childName)}</span>
          <div class="stars">
            ${[1, 2, 3, 4, 5].map(n => `
              <button type="button" class="star${Number(x.rating) >= n ? ' is-on' : ''}"
                data-kid="${i}" data-star="${n}" aria-label="${n} ดาว">★</button>`).join('')}
          </div>
        </div>

        ${x.alerts && x.alerts.length
          ? `<p class="acard__alert">${UI.esc(x.alerts.join(' · '))}</p>` : ''}

        <textarea class="field__input" id="a_note_${i}" rows="2"
          placeholder="พัฒนาการและสิ่งที่สังเกตเห็นของ${UI.esc(x.childName)}">${UI.esc(x.note)}</textarea>

        <input type="hidden" id="a_rating_${i}" value="${UI.esc(x.rating)}">
        <input type="hidden" id="a_session_${i}" value="${UI.esc(x.id)}">
      </div>`;
  },

  async submit(g) {
    const skills = Array.prototype.slice
      .call(document.querySelectorAll('[data-skill].is-on'))
      .map(b => b.dataset.skill);

    const payload = {
      summary:  People.val('a_summary'),
      skills:   skills.join(', '),
      nextGoal: People.val('a_nextGoal'),
      children: g.items.map((x, i) => ({
        sessionId: People.val('a_session_' + i),
        rating:    People.val('a_rating_' + i),
        note:      People.val('a_note_' + i),
      })),
    };

    if (!payload.summary) { UI.toast('เขียนสรุปการฝึกของคาบก่อน', 'error'); return; }

    const res = await API.call('saveActivity', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast('บันทึกแล้ว ' + res.data.count + ' คน');
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
