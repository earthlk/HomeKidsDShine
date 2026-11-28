// ============================================================
// Homey Kids D Shine — courses.js
// คอร์สและการลงทะเบียน
// ============================================================

const Courses = {

  data:   { courses: [], enrollments: [], children: [], canEdit: false },
  tab:    'enrollments',  // ผู้ใช้เข้ามาดูความคืบหน้าของเด็กบ่อยกว่าดูรายการคอร์ส
  query:  '',
  state:  'all',          // ตัวกรองตามสถานะของรายการลงทะเบียน
  cat:    'all',          // ตัวกรองตามหมวดของคอร์ส

  async render(el) {
    const res = await API.cached('getCourseBoard');
    if (!res.ok) {
      el.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.data = res.data;
    this.paint(el);
  },

  paint(el) {
    const d = this.data;

    // ผู้ปกครองเห็นเฉพาะคอร์สของบุตรหลาน ไม่ต้องมีแท็บให้สลับ
    // ผู้ฝึกสอนเห็นแค่ภาพรวมคอร์ส หลังบ้านไม่ส่งรายการลงทะเบียนรายคนมา
    // จึงไม่ต้องมีแท็บให้สลับ เพราะอีกแท็บจะว่างเปล่าเสมอ
    if (d.mode === 'trainer') this.tab = 'catalog';

    const tabs = d.canEdit ? `
      <div class="segbar" role="tablist">
        <button class="segbar__btn${this.tab === 'enrollments' ? ' is-on' : ''}"
          data-tab="enrollments" role="tab">
          กำลังเรียน <span class="segbar__count">${d.enrollments.length}</span>
        </button>
        <button class="segbar__btn${this.tab === 'catalog' ? ' is-on' : ''}"
          data-tab="catalog" role="tab">
          รายการคอร์ส <span class="segbar__count">${d.courses.length}</span>
        </button>
        <button class="segbar__btn${this.tab === 'byTrainer' ? ' is-on' : ''}"
          data-tab="byTrainer" role="tab">
          ตามผู้สอน <span class="segbar__count">${(d.byTrainer || []).length}</span>
        </button>
      </div>` : '';

    const actions = d.canEdit ? `
      <div class="toolbar__actions">
        <button class="btn btn--ghost" data-act="new-course">เพิ่มคอร์ส</button>
        <button class="btn btn--primary" data-act="new-enroll">ลงทะเบียน</button>
      </div>` : '';

    // ผู้ฝึกสอนกับผู้ปกครองเห็นเฉพาะข้อมูลของตัวเองอยู่แล้ว จำนวนไม่มาก
    // ช่องค้นหาจึงเป็นของเกินที่กินพื้นที่เปล่า ๆ
    const search = d.canEdit ? `
      <div class="toolbar">
        <input class="field__input toolbar__search" id="courseSearch"
          type="search" placeholder="ค้นหาจากชื่อเด็กหรือชื่อคอร์ส"
          value="${UI.esc(this.query)}">
        ${actions}
      </div>` : '';

    el.innerHTML = `
      ${search}
      ${tabs}
      ${d.canEdit && this.tab === 'enrollments' ? this.filterBar() : ''}
      ${d.canEdit && this.tab === 'catalog'     ? this.catBar()    : ''}
      <div id="courseList"></div>`;

    const box = el.querySelector('#courseSearch');
    if (box) box.addEventListener('input', e => {
      Courses.query = e.target.value;
      Courses.paintList();
    });

    el.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => {
        Courses.cat = b.dataset.cat;
        el.querySelectorAll('[data-cat]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.cat === Courses.cat));
        Courses.paintList();
      };
    });

    el.querySelectorAll('[data-state]').forEach(b => {
      b.onclick = () => {
        Courses.state = b.dataset.state;
        el.querySelectorAll('[data-state]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.state === Courses.state));
        Courses.paintList();
      };
    });

    el.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { Courses.tab = b.dataset.tab; Courses.paint(el); };
    });

    el.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'new-course') Courses.openCourseForm();
        if (b.dataset.act === 'new-enroll') Courses.openEnrollForm();
      };
    });

    this.paintList();
  },

  // แถบกรองตามสถานะ นับจำนวนในแต่ละกลุ่มให้เห็นเลยว่ามีกี่รายการ
  filterBar() {
    const all  = this.data.enrollments;
    const noT  = all.filter(e => !e.trainerId && e.state !== 'closed').length;
    const groups = [
      ['all',       'ทั้งหมด',    all.length],
      ['active',    'กำลังเรียน', all.filter(e => e.state === 'active').length],
      ['completed', 'เรียนจบ',    all.filter(e => e.state === 'completed').length],
      ['closed',    'ปิดรายการ',  all.filter(e => e.state === 'closed').length],
    ];

    // ขึ้นเฉพาะตอนที่มีจริง เพราะเป็นของค้างที่ต้องเคลียร์ ไม่ใช่ตัวกรองถาวร
    if (noT) groups.push(['noTrainer', 'ยังไม่มีผู้สอน', noT]);

    return '<div class="chipbar">' + groups.map(([v, label, n]) =>
      `<button class="chipbtn${this.state === v ? ' is-on' : ''}" data-state="${v}">
        ${label} <span class="chipbtn__n">${n}</span>
      </button>`).join('') + '</div>';
  },

  // แถบกรองตามหมวด สร้างจากหมวดที่มีอยู่จริง ไม่ได้กำหนดตายตัว
  // คอร์สที่ไม่ได้ระบุหมวดจะรวมอยู่ในกลุ่มไม่ระบุหมวด
  catBar() {
    const counts = {};
    this.data.courses.forEach(c => {
      const k = String(c.category || '').trim() || '—';
      counts[k] = (counts[k] || 0) + 1;
    });

    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'th'));
    if (names.length < 2) return '';     // มีหมวดเดียวก็ไม่ต้องมีตัวกรอง

    const groups = [['all', 'ทั้งหมด', this.data.courses.length]]
      .concat(names.map(n => [n, n === '—' ? 'ไม่ระบุหมวด' : n, counts[n]]));

    return '<div class="chipbar">' + groups.map(([v, label, n]) =>
      `<button class="chipbtn${this.cat === v ? ' is-on' : ''}" data-cat="${UI.esc(v)}">
        ${UI.esc(label)} <span class="chipbtn__n">${n}</span>
      </button>`).join('') + '</div>';
  },

  paintList() {
    const box = document.getElementById('courseList');
    if (!box) return;

    if (this.tab === 'catalog')   { this.paintCatalog(box); return; }
    if (this.tab === 'byTrainer') { this.paintTrainers(box); return; }

    const rows = this.filterRows(this.data.enrollments);
    // แยกกรณีไม่มีข้อมูลเลย กับกรองแล้วไม่เจอ เพราะทางแก้ต่างกัน
    if (!rows.length) {
      box.innerHTML = this.data.enrollments.length
        ? UI.empty('ไม่พบรายการที่ค้นหา', 'ลองพิมพ์คำอื่น หรือเปลี่ยนตัวกรองสถานะ')
        : UI.empty('ยังไม่มีการลงทะเบียน',
            this.data.canEdit
              ? 'กดปุ่มลงทะเบียนเพื่อจับคู่เด็กกับคอร์ส ระบบจะเริ่มนับจำนวนครั้งให้อัตโนมัติ'
              : 'ติดต่อผู้ดูแลศูนย์เพื่อลงทะเบียนคอร์ส');
      return;
    }

    box.innerHTML = '<div class="pgrid">' +
      rows.map(e => this.enrollCard(e)).join('') + '</div>';

    box.querySelectorAll('[data-history]').forEach(c => {
      c.onclick = () => Courses.openHistory(c.dataset.history);
    });

    // ลงนัดจากหน้าคอร์สได้เลย ไม่ต้องข้ามไปหน้าปฏิทินแล้วค้นหาเด็กใหม่
    box.querySelectorAll('[data-book]').forEach(b => {
      b.onclick = (ev) => { ev.stopPropagation(); Courses.book(b.dataset.book); };
    });

    box.querySelectorAll('[data-trainer]').forEach(b => {
      b.onclick = (ev) => { ev.stopPropagation(); Courses.openTrainerForm(b.dataset.trainer); };
    });
  },

  filterRows(rows) {
    const q = this.query.trim().toLowerCase();
    return rows.filter(e => {
      if (this.state === 'noTrainer') {
        if (e.trainerId || e.state === 'closed') return false;
      } else if (this.state !== 'all' && e.state !== this.state) return false;
      if (!q) return true;
      return [e.childName, e.childFullName, e.courseName, e.trainerName]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0);
    });
  },

  // ── การ์ดการลงทะเบียน ─────────────────────────────────────
  enrollCard(e) {
    const total = e.totalSessions || 1;

    // เตือนเมื่อเหลือน้อย เพราะเป็นจังหวะที่ต้องชวนต่อคอร์ส
    const low = e.state === 'active' && e.remaining > 0 && e.remaining <= 2;

    return `
      <article class="ecard ${low ? 'ecard--low' : ''}${e.state === 'closed' ? ' ecard--closed' : ''}"
        data-history="${UI.esc(e.id)}">
        <div class="ecard__head">
          <div>
            <h3 class="ecard__child">${UI.esc(e.childName)}</h3>
            <p class="ecard__course">${UI.esc(e.courseName)}</p>
            ${/* ค่าที่ระบบเดามาจากคาบที่ลงไว้ไม่ติดป้ายบนการ์ด เพราะเกือบทุกใบจะติด
                  แล้วกลายเป็นข้อความที่ทุกคนเรียนรู้ที่จะมองข้าม
                  คำอธิบายไปอยู่ในกล่องเปลี่ยนผู้สอน ตรงจุดที่ต้องตัดสินใจจริง */
              this.data.canEdit ? `<p class="ecard__trainer">${
              e.trainerId
                ? 'ผู้สอน ' + UI.esc(e.trainerName) +
                  (e.subCount ? ` · <span class="ecard__sub">มีคนสอนแทน ${e.subCount} คาบ</span>` : '')
                : '<span class="ecard__sub">ยังไม่ได้กำหนดผู้สอน</span>'
            }</p>` : ''}
          </div>
          ${this.stateChip(e.state)}
        </div>

        <div class="bar" role="img"
          aria-label="สอนแล้ว ${e.done} จาก ${total} ครั้ง">
          <span class="bar__done" style="width:${(e.done / total) * 100}%"></span>
          <span class="bar__booked" style="width:${(e.booked / total) * 100}%"></span>
        </div>

        <div class="tally">
          <div class="tally__item">
            <span class="tally__num tally__num--done">${e.done}</span>
            <span class="tally__label">สอนแล้ว</span>
          </div>
          <div class="tally__item">
            <span class="tally__num tally__num--booked">${e.booked}</span>
            <span class="tally__label">นัดแล้ว</span>
          </div>
          <div class="tally__item">
            <span class="tally__num${low ? ' tally__num--low' : ''}">${e.remaining}</span>
            <span class="tally__label">คงเหลือ</span>
          </div>
          <div class="tally__item">
            <span class="tally__num tally__num--muted">${total}</span>
            <span class="tally__label">ทั้งหมด</span>
          </div>
        </div>

        <div class="ecard__bottom">
          <p class="ecard__foot">
            ${/* ไม่ต้องบอกเปอร์เซ็นต์ซ้ำ แถบข้างบนบอกไปแล้ว
                 บรรทัดนี้เก็บไว้ให้ข้อมูลที่แถบบอกไม่ได้ */''}
            ${e.startDate ? 'ลงทะเบียน ' + UI.thaiDate(e.startDate, 'short') : ''}
            ${e.price ? ' · ' + e.price.toLocaleString() + ' บาท' : ''}
          </p>
          <span class="ecard__btns">
            ${this.data.canEdit && e.state !== 'closed'
              ? `<button class="btn btn--ghost btn--sm" data-trainer="${UI.esc(e.id)}">${
                  e.trainerId ? 'เปลี่ยนผู้สอน' : 'กำหนดผู้สอน'}</button>`
              : ''}
            ${this.data.canEdit && e.state === 'active' && e.remaining > 0
              ? `<button class="btn btn--ghost btn--sm" data-book="${UI.esc(e.id)}">ลงนัด</button>`
              : ''}
          </span>
        </div>
      </article>`;
  },

  // นัดเพิ่มได้เมื่อรายการยังเปิดอยู่และยังเหลือครั้ง
  // เงื่อนไขเดียวกับที่หลังบ้านตรวจ จะได้ไม่ขึ้นปุ่มที่กดแล้วโดนปฏิเสธ
  canBook(e) {
    return this.data.canEdit && e.state === 'active' && e.remaining > 0;
  },

  // ── มุมมองตามผู้สอน ───────────────────────────────────────
  // คำถามที่หน้านี้ต้องตอบคือใครงานล้นใครยังว่าง และแต่ละคนถืออะไรอยู่
  // จึงเรียงตามจำนวนเด็ก และให้คนที่ยังไม่มีงานอยู่ท้ายแต่ยังต้องเห็น
  // ไม่ใช้ค่าเฉลี่ยหรือคะแนนรวม เพราะคนแบ่งงานต้องเห็นของจริงว่าถืออะไร
  paintTrainers(box) {
    const list = this.data.byTrainer || [];
    if (!list.length) {
      box.innerHTML = UI.empty('ยังไม่มีผู้ฝึกสอน',
        'เพิ่มผู้ฝึกสอนในหน้าผู้ฝึกสอนก่อน แล้วค่อยกำหนดว่าใครสอนคอร์สไหน');
      return;
    }

    const q = this.query.trim().toLowerCase();
    const rows = q
      ? list.filter(t => [t.name].concat(t.courses.map(c => c.name))
          .some(v => String(v || '').toLowerCase().indexOf(q) >= 0))
      : list;

    if (!rows.length) {
      box.innerHTML = UI.empty('ไม่พบผู้สอนที่ค้นหา', 'ลองพิมพ์ชื่อผู้สอนหรือชื่อคอร์ส');
      return;
    }

    box.innerHTML = '<div class="pgrid">' + rows.map(t => {
      const idle = t.kids === 0;

      return `
      <article class="ccard${idle ? ' ccard--off' : ''}">
        <div class="ecard__head">
          <div>
            <h3 class="ecard__child">${UI.esc(t.name)}</h3>
            <p class="ecard__course">${t.assigned
              ? (idle ? 'ยังไม่ได้ถือคอร์สไหนเลย'
                      : `ถือ ${t.courses.length} คอร์ส · เด็ก ${t.kids} คน`)
              : 'การลงทะเบียนที่ยังไม่ได้ระบุว่าใครสอน'}</p>
          </div>
          ${idle ? '<span class="pchip pchip--ok">ว่างรับงาน</span>' : ''}
          ${!t.assigned ? '<span class="pchip pchip--warn">ต้องกำหนดผู้สอน</span>' : ''}
        </div>

        ${t.courses.length ? `<div class="tlist">
          ${t.courses.map(c => {
            const total = c.total || 1;
            return `
            <div class="prog">
              <div class="prog__k">
                <span class="prog__name">${UI.esc(c.name)}</span>
                <span class="prog__n">เด็ก ${c.kids} · ${c.done}/${c.total} คาบ</span>
              </div>
              <div class="bar" role="img"
                aria-label="${UI.esc(c.name)} สอนแล้ว ${c.done} จาก ${c.total} คาบ">
                <span class="bar__done" style="width:${(c.done / total) * 100}%"></span>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <div class="tally">
          <div class="tally__item">
            <span class="tally__num">${t.courses.length}</span>
            <span class="tally__label">คอร์ส</span>
          </div>
          <div class="tally__item">
            <span class="tally__num">${t.kids}</span>
            <span class="tally__label">เด็ก</span>
          </div>
          <div class="tally__item">
            <span class="tally__num tally__num--booked">${t.upcoming}</span>
            <span class="tally__label">นัดข้างหน้า</span>
          </div>
          <div class="tally__item">
            <span class="tally__num tally__num--muted">${Math.max(0, t.total - t.done)}</span>
            <span class="tally__label">ยังต้องสอน</span>
          </div>
        </div>

        ${!t.assigned ? `<div class="ccard__actions">
          <button class="btn btn--ghost btn--sm" data-unassigned="1">ดูรายการที่ยังไม่มีผู้สอน</button>
        </div>` : ''}
      </article>`;
    }).join('') + '</div>';

    box.querySelectorAll('[data-unassigned]').forEach(b => {
      b.onclick = () => {
        Courses.tab   = 'enrollments';
        Courses.state = 'noTrainer';
        Courses.query = '';
        Courses.paint(document.getElementById('page'));
      };
    });
  },

  // ── เปลี่ยนผู้สอนประจำ ────────────────────────────────────
  // สองทางเลือกที่ต่างกันจริง จึงให้เห็นผลก่อนเลือก ไม่ใช่เดาจากชื่อปุ่ม
  openTrainerForm(id) {
    const e = this.data.enrollments.find(x => String(x.id) === String(id));
    if (!e) return;

    const options = (this.data.trainers || []).map(t =>
      `<option value="${UI.esc(t.id)}"${String(t.id) === String(e.trainerId) ? ' selected' : ''}>
        ${UI.esc(t.name)}</option>`).join('');

    // คาบที่นัดไว้ข้างหน้ามีกี่คาบ บอกให้รู้ก่อนว่าจะกระทบเท่าไร
    const today = UI.today();
    const ahead = (e.history || []).filter(h =>
      h.status === 'scheduled' && String(h.date) >= today).length;

    UI.openSheet(`
      <div class="dhead">
        <div>
          <h2 class="dhead__name">เปลี่ยนผู้สอนประจำ</h2>
          <p class="dhead__sub">${UI.esc(e.childName)} · ${UI.esc(e.courseName)}</p>
        </div>
      </div>

      <div class="field">
        <label class="field__label" for="t_trainer">ผู้สอนประจำ</label>
        <select class="field__input" id="t_trainer">
          <option value="">— เลือกผู้สอน —</option>
          ${options}
        </select>
        ${e.trainerId && !e.trainerSet
          ? `<p class="fhint">ตอนนี้ยังไม่เคยกำหนดไว้ ระบบเดาจากคาบที่ลงไว้ว่าเป็น
             ${UI.esc(e.trainerName)} กดบันทึกเพื่อยืนยันให้เป็นค่าจริง</p>` : ''}
      </div>

      <div class="picks">
        <label class="pick">
          <input type="radio" name="t_scope" value="future" checked>
          <span class="pick__b">
            <span class="pick__t">ย้ายคาบที่นัดไว้ข้างหน้าไปด้วย</span>
            <span class="pick__d">${ahead
              ? `คาบที่ยังไม่ถึง ${ahead} คาบจะเปลี่ยนเป็นผู้สอนคนใหม่
                 คาบไหนชนตารางของเขาจะข้ามไว้แล้วบอกให้รู้`
              : 'ตอนนี้ยังไม่มีคาบที่นัดไว้ข้างหน้า มีผลกับคาบที่นัดใหม่หลังจากนี้'}</span>
          </span>
        </label>
        <label class="pick">
          <input type="radio" name="t_scope" value="only">
          <span class="pick__b">
            <span class="pick__t">เปลี่ยนเฉพาะผู้สอนประจำ</span>
            <span class="pick__d">คาบที่นัดไว้แล้วยังเป็นของคนเดิม
              ใช้ตอนที่คนเดิมรับสอนให้จบรอบนี้ก่อน แล้วค่อยส่งต่อ</span>
          </span>
        </label>
      </div>

      <p class="fhint">คาบที่สอนไปแล้วไม่เปลี่ยน เพราะเป็นประวัติและผูกกับค่าสอนที่จ่ายไปแล้ว
        ถ้าแค่วันเดียวที่มีคนสอนแทน ให้ไปแก้ผู้สอนที่คาบนั้นในหน้าตารางนัดแทน</p>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Courses.saveTrainer(e.id),
    });
  },

  async saveTrainer(id) {
    const trainerId = People.val('t_trainer');
    if (!trainerId) { UI.toast('เลือกผู้สอนก่อน', 'error'); return; }

    const scope = document.querySelector('[name="t_scope"]:checked');
    const res = await API.call('setEnrollmentTrainer', {
      enrollmentId: id,
      trainerId:    trainerId,
      applyFuture:  !scope || scope.value === 'future',
    });

    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();

    // บอกผลตรง ๆ ว่าย้ายได้กี่คาบและคาบไหนย้ายไม่ได้เพราะอะไร
    // ถ้าเงียบไป คนสั่งจะเข้าใจว่าย้ายครบแล้วทั้งที่ยังมีคาบค้างอยู่กับคนเดิม
    const d = res.data;
    if (d.skipped && d.skipped.length) {
      UI.toast(`ย้ายให้ ${d.moved} คาบ อีก ${d.skipped.length} คาบย้ายไม่ได้ ` +
        `เพราะ${d.skipped[0].why} ต้องไปแก้รายคาบในหน้าตารางนัด`, 'error');
    } else {
      UI.toast(`ผู้สอนประจำเป็น ${d.trainerName} แล้ว` +
        (d.moved ? ` · ย้ายคาบที่นัดไว้ ${d.moved} คาบ` : ''));
    }

    App.invalidate();
    await this.render(document.getElementById('page'));
  },

  // ── รายการคอร์ส ───────────────────────────────────────────
  // ใช้ร่วมกันทั้งผู้ดูแลระบบและผู้ฝึกสอน ต่างกันแค่จะแสดงเรื่องเงินไหม
  paintCatalog(box) {
    const q = this.query.trim().toLowerCase();

    const rows = this.data.courses.filter(c => {
      const cat = String(c.category || '').trim() || '—';
      if (this.data.canEdit && this.cat !== 'all' && cat !== this.cat) return false;
      if (!q) return true;
      return [c.name, c.category, c.description]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0);
    });

    if (!rows.length) {
      box.innerHTML = this.data.courses.length
        ? UI.empty('ไม่พบคอร์สที่ค้นหา', 'ลองพิมพ์คำอื่น หรือเปลี่ยนตัวกรองหมวด')
        : UI.empty('ยังไม่มีคอร์ส', this.data.canEdit
            ? 'เพิ่มคอร์สแรกเพื่อเริ่มรับลงทะเบียน กำหนดจำนวนครั้ง ราคา และค่าสอนต่อครั้ง'
            : 'เมื่อศูนย์เปิดคอร์สแล้ว รายการจะขึ้นที่นี่');
      return;
    }

    // ผู้ฝึกสอนไม่เห็นราคาและค่าสอน เพราะเป็นเรื่องการเงินของศูนย์
    // แต่ต้องเห็นว่าคอร์สนี้ตัวเองสอนเด็กอยู่กี่คน
    const money = this.data.canEdit;

    box.innerHTML = '<div class="pgrid">' + rows.map(c => `
      <article class="ccard ${c.active ? '' : 'ccard--off'}${money ? '' : ' ccard--tap'}"
        ${money ? '' : `data-detail="${UI.esc(c.id)}"`}>
        <div class="ecard__head">
          <div>
            <h3 class="ecard__child">${UI.esc(c.name)}</h3>
            <p class="ecard__course">${UI.esc(c.category || 'ไม่ระบุหมวด')}</p>
          </div>
          ${c.active ? '' : '<span class="pchip pchip--muted">ปิดการขาย</span>'}
          ${!money && c.teaching ? '<span class="pchip pchip--ok">สอนอยู่</span>' : ''}
        </div>

        ${c.description ? `<p class="ccard__desc">${UI.esc(c.description)}</p>` : ''}

        ${money && c.activeKids ? `
          <div class="prog">
            <div class="prog__k">
              <span class="prog__name">ความคืบหน้ารวมของเด็กที่กำลังเรียน</span>
              <span class="prog__n">${c.doneSessions}/${c.totalPlanned} คาบ</span>
            </div>
            <div class="bar" role="img"
              aria-label="สอนไปแล้ว ${c.doneSessions} จาก ${c.totalPlanned} คาบ">
              <span class="bar__done"
                style="width:${(c.doneSessions / (c.totalPlanned || 1)) * 100}%"></span>
            </div>
          </div>
          <p class="ccard__who">${c.trainers.length
            ? 'ผู้สอน ' + c.trainers.map(t => UI.esc(t.name || 'ยังไม่กำหนด') +
                ' (' + t.kids + ')').join(' · ')
            : 'ยังไม่ได้กำหนดผู้สอน'}</p>
        ` : ''}

        <div class="tally">
          <div class="tally__item">
            <span class="tally__num">${c.totalSessions}</span>
            <span class="tally__label">ครั้ง</span>
          </div>
          <div class="tally__item">
            <span class="tally__num">${c.durationMin}</span>
            <span class="tally__label">นาที/ครั้ง</span>
          </div>
          ${money ? `
            <div class="tally__item">
              <span class="tally__num">${(c.price || 0).toLocaleString()}</span>
              <span class="tally__label">ราคา</span>
            </div>
            <div class="tally__item">
              <span class="tally__num tally__num--muted">${(c.trainerFee || 0).toLocaleString()}</span>
              <span class="tally__label">ค่าสอน/ครั้ง</span>
            </div>`
          : `
            <div class="tally__item">
              <span class="tally__num tally__num--done">${c.myDone || 0}</span>
              <span class="tally__label">สอนแล้ว</span>
            </div>
            <div class="tally__item">
              <span class="tally__num tally__num--booked">${c.myUpcoming || 0}</span>
              <span class="tally__label">นัดหน้า</span>
            </div>
            <div class="tally__item">
              <span class="tally__num tally__num--muted">${c.enrolled || 0}</span>
              <span class="tally__label">เด็ก</span>
            </div>`}
        </div>

        ${money ? `
          <p class="ecard__foot">
            กำลังเรียน ${c.activeKids} คน · เหลือให้ศูนย์
            ${((c.price || 0) - (c.trainerFee || 0) * c.totalSessions).toLocaleString()} บาทต่อคอร์ส
          </p>

          <div class="ccard__actions">
            <button class="btn btn--ghost btn--sm" data-toggle="${UI.esc(c.id)}">
              ${c.active ? 'ปิดการขาย' : 'เปิดการขาย'}
            </button>
            <button class="btn btn--ghost btn--sm" data-edit="${UI.esc(c.id)}">แก้ไข</button>
          </div>` : ''}
      </article>`).join('') + '</div>';

    box.querySelectorAll('[data-detail]').forEach(b => {
      b.onclick = () => Courses.openCourseDetail(b.dataset.detail);
    });

    box.querySelectorAll('[data-detail]').forEach(b => {
      b.onclick = () => Courses.openMyCourse(b.dataset.detail);
    });

    box.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => Courses.openCourseForm(
        Courses.data.courses.find(c => String(c.id) === String(b.dataset.edit)));
    });

    box.querySelectorAll('[data-toggle]').forEach(b => {
      b.onclick = () => UI.run(b, 'กำลังบันทึก', async () => {
        const res = await API.call('toggleCourse', { id: b.dataset.toggle });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast(res.data.active ? 'เปิดการขายแล้ว' : 'ปิดการขายแล้ว');
        Courses.reload();
      });
    });
  },

  // ── รายละเอียดคอร์สสำหรับผู้ฝึกสอน ────────────────────────
  openCourseDetail(id) {
    const c = this.data.courses.find(x => String(x.id) === String(id));
    if (!c) return;

    const kids = c.students || [];

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(c.name)}</div>
      <p class="sheet__sub">${UI.esc(c.category || 'ไม่ระบุหมวด')}</p>

      ${c.description ? `<p class="dnote">${UI.esc(c.description)}</p>` : ''}

      <div class="tally tally--wide">
        <div class="tally__item">
          <span class="tally__num">${c.totalSessions}</span>
          <span class="tally__label">ครั้งต่อคอร์ส</span>
        </div>
        <div class="tally__item">
          <span class="tally__num">${c.durationMin}</span>
          <span class="tally__label">นาทีต่อครั้ง</span>
        </div>
        <div class="tally__item">
          <span class="tally__num tally__num--done">${c.myDone || 0}</span>
          <span class="tally__label">ฉันสอนไปแล้ว</span>
        </div>
        <div class="tally__item">
          <span class="tally__num tally__num--booked">${c.myUpcoming || 0}</span>
          <span class="tally__label">นัดข้างหน้า</span>
        </div>
      </div>

      <div class="dsection">
        <h3 class="dsection__title">
          เด็กที่ฉันสอนในคอร์สนี้ ${kids.length} คน
        </h3>
        ${kids.length ? kids.map(k => `
          <div class="drow2">
            <span class="drow2__k">${UI.esc(k.name)}</span>
            <span class="drow2__v">สอนแล้ว ${k.done} ครั้ง${k.upcoming ? ' · นัดอีก ' + k.upcoming : ''}</span>
          </div>`).join('')
        : `<p class="fhint">ยังไม่มีนัดในคอร์สนี้
             ${c.enrolled ? ' แต่มีเด็กลงทะเบียนอยู่ ' + c.enrolled + ' คน' : ''}</p>`}
      </div>

      <div class="dsection">
        <h3 class="dsection__title">ภาพรวมคอร์ส</h3>
        <div class="drow2">
          <span class="drow2__k">เด็กที่กำลังเรียน</span>
          <span class="drow2__v">${c.enrolled || 0} คน (รวมของผู้ฝึกสอนคนอื่น)</span>
        </div>
        <div class="drow2">
          <span class="drow2__k">สถานะคอร์ส</span>
          <span class="drow2__v">${c.active ? 'เปิดรับลงทะเบียน' : 'ปิดการขายแล้ว'}</span>
        </div>
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
      </div>`);

    People.bindSheet({ close: () => UI.closeSheet() });
  },

  // ── รายละเอียดคอร์สสำหรับผู้ฝึกสอน ────────────────────────
  async openMyCourse(id) {
    UI.openSheet(UI.loading());

    const res = await API.cached('getMyCourseDetail', { id });
    if (!res.ok) { UI.closeSheet(); UI.toast(res.message, 'error'); return; }

    const d = res.data;

    const rows = d.kids.length ? d.kids.map(k => `
      <div class="hrow">
        <span class="pcard__avatar pcard__avatar--sm">${UI.esc(People.initial({ name: k.childName }))}</span>
        <div class="hrow__main">
          <p class="hrow__date">
            ${UI.esc(k.childName)}
            ${k.pending ? `<span class="pchip pchip--warn">รอบันทึก ${k.pending}</span>` : ''}
          </p>
          <p class="hrow__meta">
            เราสอนไปแล้ว ${k.myDone} ครั้ง · คอร์สนี้เรียนไป ${k.done} จาก ${k.total} ครั้ง
            ${k.remaining ? ' · เหลือ ' + k.remaining : ' · ครบแล้ว'}
          </p>
          ${k.nextDate
            ? `<p class="hrow__meta">นัดถัดไป ${UI.thaiDate(k.nextDate, 'short')} ${UI.esc(k.nextTime)}</p>`
            : '<p class="hrow__meta">ยังไม่มีนัดถัดไป</p>'}
          ${k.alerts && k.alerts.length
            ? `<p class="acard__alert">${UI.esc(k.alerts.join(' · '))}</p>` : ''}
        </div>
      </div>`).join('')
      : UI.empty('ยังไม่มีเด็กในคอร์สนี้', 'เมื่อได้รับมอบหมายให้สอนคอร์สนี้ รายชื่อจะขึ้นที่นี่');

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(d.name)}</div>
      <p class="sheet__sub">
        ${UI.esc(d.category || 'ไม่ระบุหมวด')} · ${d.totalSessions} ครั้ง · ครั้งละ ${d.durationMin} นาที
      </p>

      ${d.description ? `<p class="dnote">${UI.esc(d.description)}</p>` : ''}

      <div class="dsection">
        <h3 class="dsection__title">เด็กที่เราสอนในคอร์สนี้ ${d.kids.length} คน</h3>
        ${rows}
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ปิด</button>
      </div>`);

    People.bindSheet({ close: () => UI.closeSheet() });
  },

  // ── ประวัติการฝึก ─────────────────────────────────────────
  // ข้อมูลมาพร้อมตอนโหลดหน้าแล้ว จึงเปิดได้ทันทีโดยไม่ต้องยิงคำขอใหม่
  openHistory(id) {
    const e = this.data.enrollments.find(x => String(x.id) === String(id));
    if (!e) return;

    const rows = e.history || [];
    // นัดที่ยังไม่ถึงและยังไม่มีบันทึกกิจกรรม แก้ไขได้จากตรงนี้เลย
    // ไม่ต้องข้ามไปหน้าตารางนัดแล้วไล่หาว่านัดไหน
    const list = rows.length ? rows.map((s, i) => `
      <div class="hrow hrow--${UI.esc(s.status)}">
        <span class="hrow__no">${i + 1}</span>
        <div class="hrow__main">
          <p class="hrow__date">
            ${UI.thaiDate(s.date, 'short')}${s.startTime ? ' · ' + UI.esc(s.startTime) : ''}
            ${s.trainerName ? ' · ' + UI.esc(s.trainerName) : ''}
            ${s.rating ? '<span class="hrow__stars">' + '★'.repeat(Number(s.rating)) + '</span>' : ''}
          </p>

          ${s.summary ? `<p class="hrow__note">${UI.esc(s.summary)}</p>` : ''}
          ${s.skills ? `<p class="hrow__meta">ทักษะที่ฝึก ${UI.esc(s.skills)}</p>` : ''}

          ${s.note ? `<p class="hrow__own">${UI.esc(s.note)}</p>` : ''}
          ${s.nextGoal ? `<p class="hrow__meta">ครั้งหน้า ${UI.esc(s.nextGoal)}</p>` : ''}
          ${s.cancelReason ? `<p class="hrow__note">ยกเลิก: ${UI.esc(s.cancelReason)}</p>` : ''}
        </div>
        ${this.sessionChip(s.status)}
        ${this.data.canEdit && s.status === 'scheduled' && !s.hasLog
          ? `<button class="btn btn--ghost btn--sm" data-editsess="${UI.esc(s.id)}">แก้ไข</button>`
          : ''}
      </div>`).join('')
      : UI.empty('ยังไม่มีการฝึก',
          'เมื่อลงนัดในตารางแล้ว รายการจะขึ้นที่นี่พร้อมบันทึกของผู้ฝึกสอน');

    // ปุ่มที่แสดงขึ้นกับว่ามีการดำเนินการไปแล้วหรือยัง
    // ยังไม่มีนัดเลย ลบทิ้งได้ ถ้าเริ่มเรียนแล้วต้องปิดรายการเพื่อเก็บประวัติ
    let danger = '';
    if (this.data.canEdit) {
      if (e.canDelete) {
        danger = `<button class="btn btn--danger" data-act="del">ลบ</button>`;
      } else if (e.state === 'closed') {
        danger = `<button class="btn btn--ghost" data-act="reopen"
          data-busy="กำลังเปิด">เปิดรายการอีกครั้ง</button>`;
      } else {
        danger = `<button class="btn btn--danger" data-act="close"
          data-busy="กำลังปิด">ปิดรายการ</button>`;
      }
    }

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(e.childName)} · ${UI.esc(e.courseName)}</div>

      <div class="tally tally--wide">
        <div class="tally__item">
          <span class="tally__num tally__num--done">${e.done}</span>
          <span class="tally__label">สอนแล้ว</span>
        </div>
        <div class="tally__item">
          <span class="tally__num tally__num--booked">${e.booked}</span>
          <span class="tally__label">นัดแล้ว</span>
        </div>
        <div class="tally__item">
          <span class="tally__num">${e.remaining}</span>
          <span class="tally__label">คงเหลือ</span>
        </div>
        <div class="tally__item">
          <span class="tally__num tally__num--muted">${e.totalSessions}</span>
          <span class="tally__label">ทั้งหมด</span>
        </div>
      </div>

      ${e.notes ? `<p class="fhint">${UI.esc(e.notes)}</p>` : ''}

      <div class="dsection"><h3 class="dsection__title">ประวัติการฝึก</h3>${list}</div>

      <div class="sheet__actions">
        ${danger}
        <button class="btn btn--ghost" data-act="close-sheet">ย้อนกลับ</button>
        ${this.data.canEdit ? `<button class="btn btn--ghost" data-act="edit">แก้ไขรายการ</button>` : ''}
        ${this.data.canEdit && e.state === 'active' && e.remaining > 0
          ? `<button class="btn btn--primary" data-act="book">ลงนัด</button>` : ''}
      </div>`);

    document.querySelectorAll('[data-editsess]').forEach(b => {
      b.onclick = () => {
        const row = rows.find(x => String(x.id) === String(b.dataset.editsess));
        if (!row) return;
        UI.closeSheet();
        // เติมชื่อเด็กและคอร์สให้ เพราะฟอร์มใช้แสดงหัวข้อรายการที่ล็อกไว้
        Cal.openForm(Object.assign({}, row, {
          childName:  e.childName,
          courseName: e.courseName,
        }), { after: () => Courses.render(document.getElementById('page')) });
      };
    });

    People.bindSheet({
      'close-sheet': () => UI.closeSheet(),
      edit:   () => { UI.closeSheet(); Courses.openEnrollForm(e); },
      del:    () => Courses.confirmRemoveEnroll(e),
      book:   () => { UI.closeSheet(); Courses.book(e.id); },
      close:  () => Courses.toggleClose(e.id, 'ปิดรายการแล้ว'),
      reopen: () => Courses.toggleClose(e.id, 'เปิดรายการอีกครั้งแล้ว'),
    });
  },

  async toggleClose(id, message) {
    const res = await API.call('closeEnrollment', { id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }
    UI.toast(message);
    UI.closeSheet();
    this.reload();
  },

  // เปิดฟอร์มลงนัดของหน้าปฏิทิน โดยเลือกรายการนี้ไว้ให้แล้ว
  // บันทึกเสร็จกลับมาโหลดหน้าคอร์สใหม่ ยอดคงเหลือจะได้ตรงทันที
  book(enrollmentId) {
    Cal.openForm(null, {
      enrollment: enrollmentId,
      after: () => Courses.render(document.getElementById('page')),
    });
  },

  // ── ฟอร์มคอร์ส ────────────────────────────────────────────
  openCourseForm(c) {
    c = c || {};
    UI.openSheet(`
      <div class="sheet__title">${c.id ? 'แก้ไขคอร์ส' : 'เพิ่มคอร์ส'}</div>
      ${c.id ? `<p class="sheet__sub">${UI.esc(c.name)}</p>` : ''}

      ${People.fgroup('รายละเอียดคอร์ส')}
      ${People.finput('k_name', 'ชื่อคอร์ส', c.name, 'เช่น เสริมพัฒนาการกล้ามเนื้อมัดใหญ่')}
      <div class="field">
        <label class="field__label" for="k_description">คำอธิบาย</label>
        <textarea class="field__input" id="k_description" rows="2">${UI.esc(c.description)}</textarea>
      </div>
      <div class="frow">
        ${People.finput('k_category', 'หมวด', c.category, 'เช่น พัฒนาการ')}
        ${People.finput('k_durationMin', 'เวลาต่อครั้ง (นาที)', c.durationMin || 60, '', 'number')}
      </div>

      ${People.fgroup('จำนวนครั้งและราคา', 'ค่าสอนรวมทุกครั้งต้องไม่เกินราคาคอร์ส')}
      <div class="frow">
        ${People.finput('k_totalSessions', 'จำนวนครั้ง', c.totalSessions, '', 'number')}
        ${People.finput('k_price', 'ราคาคอร์ส (บาท)', c.price, '', 'number')}
      </div>
      ${People.finput('k_trainerFee', 'ค่าสอนต่อครั้ง (บาท)', c.trainerFee, '', 'number')}
      <p class="fhint" id="k_margin"></p>

      <div class="sheet__actions">
        ${c.id ? `<button class="btn btn--danger" data-act="del">ลบ</button>` : ''}
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    // คำนวณส่วนต่างให้เห็นทันทีระหว่างกรอก ไม่ต้องรอกดบันทึกแล้วโดนปฏิเสธ
    const recalc = () => {
      const total = Number(People.val('k_totalSessions')) || 0;
      const price = Number(People.val('k_price')) || 0;
      const fee   = Number(People.val('k_trainerFee')) || 0;
      const left  = price - fee * total;
      const hint  = document.getElementById('k_margin');
      if (!hint) return;

      if (!total || !price) { hint.textContent = ''; return; }
      hint.textContent = 'ค่าสอนรวม ' + (fee * total).toLocaleString() +
        ' บาท · เหลือให้ศูนย์ ' + left.toLocaleString() + ' บาท';
      hint.style.color = left < 0 ? 'var(--coral)' : '';
    };

    ['k_totalSessions', 'k_price', 'k_trainerFee'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', recalc);
    });
    recalc();

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Courses.submitCourse(c.id, c.active),
      del:   () => Courses.confirmRemoveCourse(c),
    });
  },

  async submitCourse(id, active) {
    const payload = {
      id,
      name:          People.val('k_name'),
      description:   People.val('k_description'),
      category:      People.val('k_category'),
      durationMin:   People.val('k_durationMin'),
      totalSessions: People.val('k_totalSessions'),
      price:         People.val('k_price'),
      trainerFee:    People.val('k_trainerFee'),
      active:        id ? active : true,
    };

    const res = await API.call('saveCourse', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มคอร์สแล้ว');
    UI.closeSheet();
    this.reload();
  },

  // ── ฟอร์มลงทะเบียน ────────────────────────────────────────
  openEnrollForm(e) {
    e = e || {};
    const editing = !!e.id;

    // คอร์สที่ปิดการขายแล้วเลือกใหม่ไม่ได้ แต่รายการเดิมยังแก้ไขได้
    const pickable = this.data.courses.filter(c =>
      c.active || String(c.id) === String(e.courseId));

    const childOpts = this.data.children.map(c =>
      `<option value="${UI.esc(c.id)}"${String(e.childId) === String(c.id) ? ' selected' : ''}>
        ${UI.esc(c.nickname || c.name)}${c.nickname ? ' · ' + UI.esc(c.name) : ''}</option>`).join('');

    const courseOpts = pickable.map(c =>
      `<option value="${UI.esc(c.id)}" data-sessions="${c.totalSessions}" data-price="${c.price}" data-fee="${c.trainerFee}"${String(e.courseId) === String(c.id) ? ' selected' : ''}>
        ${UI.esc(c.name)} · ${c.totalSessions} ครั้ง</option>`).join('');

    UI.openSheet(`
      <div class="sheet__title">${editing ? 'แก้ไขการลงทะเบียน' : 'ลงทะเบียนคอร์ส'}</div>
      ${editing ? `<p class="sheet__sub">${UI.esc(e.childName)} · ${UI.esc(e.courseName)}</p>` : ''}

      ${People.fgroup('เลือกเด็กและคอร์ส')}
      <div class="field">
        <label class="field__label" for="n_childId">เด็ก</label>
        <select class="field__input" id="n_childId"${editing ? ' disabled' : ''}>
          <option value="">เลือกเด็ก</option>${childOpts}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="n_courseId">คอร์ส</label>
        <select class="field__input" id="n_courseId"${editing ? ' disabled' : ''}>
          <option value="">เลือกคอร์ส</option>${courseOpts}
        </select>
      </div>
      ${editing ? '<p class="fhint">เปลี่ยนเด็กหรือคอร์สไม่ได้ ถ้าลงผิดให้ลบรายการนี้แล้วลงใหม่</p>' : ''}

      ${People.fgroup('เงื่อนไข', 'ราคาและจำนวนครั้งเติมจากคอร์สให้ แก้ได้ถ้าตกลงกันเป็นอย่างอื่น')}
      <div class="frow">
        ${People.finput('n_totalSessions', 'จำนวนครั้ง', e.totalSessions, '', 'number')}
        ${People.finput('n_price', 'ราคา (บาท)', e.price, '', 'number')}
      </div>
      <p class="fhint" id="n_hint"></p>
      <p class="fhint" id="n_margin"></p>
      <div class="field">
        <label class="field__label" for="n_notes">หมายเหตุ</label>
        <textarea class="field__input" id="n_notes" rows="2">${UI.esc(e.notes)}</textarea>
      </div>

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    // เลือกคอร์สแล้วเติมจำนวนครั้งและราคาให้อัตโนมัติ แก้ทีหลังได้
    const course = document.getElementById('n_courseId');
    if (course && !editing) {
      course.onchange = () => {
        const opt = course.options[course.selectedIndex];
        if (!opt) return;
        const sess  = document.getElementById('n_totalSessions');
        const price = document.getElementById('n_price');
        if (sess)  sess.value  = opt.dataset.sessions || '';
        if (price) price.value = opt.dataset.price || '';
        showHint();
        showMargin();
      };
    }

    // บอกราคาต่อครั้งและส่วนต่างจากราคาตั้ง เพื่อให้เห็นว่ากำลังลดให้เท่าไร
    const showHint = () => {
      const hint = document.getElementById('n_hint');
      if (!hint) return;

      const opt   = course ? course.options[course.selectedIndex] : null;
      const base  = Number((opt && opt.dataset.price) || e.coursePrice || 0);
      const price = Number(People.val('n_price')) || 0;
      const times = Number(People.val('n_totalSessions')) || 0;

      if (!price || !times) { hint.textContent = ''; return; }

      const per  = Math.round(price / times);
      const diff = price - base;
      hint.textContent = 'ตกครั้งละ ' + per.toLocaleString() + ' บาท' +
        (base && diff ? ' · ' + (diff < 0 ? 'ลดจากราคาตั้ง ' : 'สูงกว่าราคาตั้ง ') +
          Math.abs(diff).toLocaleString() + ' บาท' : '');
      hint.style.color = diff < 0 ? 'var(--clay)' : '';
    };

    // ค่าสอนยึดตามอัตราของคอร์สเสมอ ส่วนลดที่ให้ผู้ปกครองกินกำไรของศูนย์
    // ไม่ใช่กินค่าแรงครู เพราะครูสอนงานเท่าเดิม
    const showMargin = () => {
      const box = document.getElementById('n_margin');
      if (!box) return;

      const opt   = course ? course.options[course.selectedIndex] : null;
      const fee   = Number((opt && opt.dataset.fee) || e.trainerFee || 0);
      const times = Number(People.val('n_totalSessions')) || 0;
      const price = Number(People.val('n_price')) || 0;

      if (!fee || !times) { box.textContent = ''; return; }

      const cost = fee * times;
      const left = price - cost;

      box.textContent = 'ค่าสอนครูครั้งละ ' + fee.toLocaleString() +
        ' บาท รวม ' + cost.toLocaleString() + ' บาท · ' +
        (left < 0 ? 'ศูนย์ขาดทุน ' + Math.abs(left).toLocaleString()
                  : 'เหลือให้ศูนย์ ' + left.toLocaleString()) + ' บาท';
      box.style.color = left < 0 ? 'var(--coral)' : '';
    };

    ['n_totalSessions', 'n_price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { showHint(); showMargin(); });
    });
    showHint();
    showMargin();

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Courses.submitEnroll(e.id, e.childId, e.courseId),
    });
  },

  async submitEnroll(id, lockedChild, lockedCourse) {
    // ช่องที่ถูกปิดไว้ไม่ส่งค่ากลับมา ต้องใช้ค่าเดิมแทน
    const payload = {
      id,
      childId:       id ? lockedChild  : People.val('n_childId'),
      courseId:      id ? lockedCourse : People.val('n_courseId'),
      totalSessions: People.val('n_totalSessions'),
      price:         People.val('n_price'),
      notes:         People.val('n_notes'),
    };

    if (!payload.childId)  { UI.toast('เลือกเด็กก่อน', 'error'); return; }
    if (!payload.courseId) { UI.toast('เลือกคอร์สก่อน', 'error'); return; }

    const res = await API.call('saveEnrollment', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.toast(id ? 'บันทึกการแก้ไขแล้ว' : 'ลงทะเบียนแล้ว');
    UI.closeSheet();
    this.reload();
  },

  // ── ยืนยันการลบ ───────────────────────────────────────────
  confirmRemoveCourse(c) {
    UI.openSheet(`
      <div class="sheet__title">ลบคอร์ส</div>
      <p>ลบ <strong>${UI.esc(c.name)}</strong> ออกจากระบบ การลบย้อนกลับไม่ได้</p>
      <p class="fhint">ถ้าเคยมีคนลงทะเบียนแล้ว ระบบจะไม่ให้ลบ ใช้การปิดการขายแทน</p>
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--danger" data-act="go" data-busy="กำลังลบ">ลบคอร์ส</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      go: async () => {
        const res = await API.call('removeCourse', { id: c.id });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('ลบคอร์สแล้ว');
        UI.closeSheet();
        Courses.reload();
      },
    });
  },

  confirmRemoveEnroll(e) {
    UI.openSheet(`
      <div class="sheet__title">ลบการลงทะเบียน</div>
      <p>ลบรายการของ <strong>${UI.esc(e.childName)}</strong>
         ในคอร์ส ${UI.esc(e.courseName)} การลบย้อนกลับไม่ได้</p>
      <p class="fhint">ลบได้เพราะยังไม่มีนัดหมายในรายการนี้</p>
      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--danger" data-act="go" data-busy="กำลังลบ">ลบรายการ</button>
      </div>`);

    People.bindSheet({
      close: () => UI.closeSheet(),
      go: async () => {
        const res = await API.call('removeEnrollment', { id: e.id });
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('ลบรายการแล้ว');
        UI.closeSheet();
        Courses.reload();
      },
    });
  },

  // ── ป้ายสถานะ ─────────────────────────────────────────────
  // สถานะคำนวณจากข้อมูลจริง ไม่ได้ให้คนเลือกเอง
  stateChip(state) {
    const map = {
      active:    ['', 'กำลังเรียน'],
      completed: ['pchip--ok', 'เรียนจบ'],
      closed:    ['pchip--muted', 'ปิดรายการ'],
    };
    const [cls, label] = map[state] || ['', state];
    return `<span class="pchip ${cls}">${UI.esc(label)}</span>`;
  },

  sessionChip(status) {
    const map = {
      completed: ['pchip--ok', 'สอนแล้ว'],
      scheduled: ['pchip--warn', 'นัดแล้ว'],
      cancelled: ['pchip--muted', 'ยกเลิก'],
    };
    const [cls, label] = map[status] || ['', status];
    return `<span class="pchip ${cls}">${UI.esc(label)}</span>`;
  },

  async reload() {
    App.invalidate();
    await this.render(document.getElementById('page'));
  },
};

PAGES.courses = (el) => Courses.render(el);
