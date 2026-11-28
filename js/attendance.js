// ============================================================
// Homey Kids D Shine — attendance.js
// เช็กชื่อและคาบชดเชย
// ============================================================
//
// สองงานที่ต่างกันอยู่ในหน้าเดียว เพราะงานหนึ่งป้อนอีกงานหนึ่ง
//   ค้างเช็ก   คาบที่ผ่านวันไปแล้วแต่ยังไม่มีใครบอกว่าเด็กมาหรือไม่มา
//   รอตัดสิน   เช็กแล้วว่าขาด ผู้ดูแลระบบต้องเลือกว่าจะทำยังไงกับคาบนั้น
//
// การเช็กชื่อกดครั้งเดียวจบต่อเด็กหนึ่งคน ปุ่มสามปุ่มอยู่บนแถวเลย
// ไม่เปิดกล่อง ไม่ต้องกดยืนยัน เพราะงานนี้ทำวันละหลายสิบครั้ง
// กดผิดกดใหม่ได้ทันที ค่าล่าสุดทับของเดิม
//
// ส่วนการตัดสินคาบที่ขาดเปิดกล่อง เพราะมีผลต่อจำนวนคาบที่ผู้ปกครองจ่ายเงินมา
// และต้องเลือกจากสามทางที่ให้ผลต่างกัน ไม่ใช่งานที่ควรกดพลาดได้
//
// ผู้ฝึกสอนเห็นสองแท็บ ผู้ดูแลระบบเห็นสามแท็บ
// เพราะผู้ฝึกสอนกดอะไรไม่ได้เลยทั้งในรอตัดสินและตัดสินแล้ว
// สองแท็บที่กดไม่ได้เรียงกันคือ noise สำหรับคนที่เข้าหน้านี้วันละหลายรอบ
// จึงยุบเป็นแท็บประวัติอันเดียว ส่วนจำนวนที่รอตัดสินยังเห็นได้ที่แถบบนสุด
// ============================================================

const Attend = {

  board: null,
  tab:   'unchecked',   // unchecked = ค้างเช็ก | pending = รอตัดสิน
  query: '',            // decided = ตัดสินแล้ว | history = รวมสองอันหลัง (ผู้ฝึกสอน)

  MARK: {
    present: 'มา',
    late:    'สาย',
    absent:  'ขาด',
  },

  RESULT: {
    credited:    'คืนคาบให้',
    rescheduled: 'นัดชดเชยแล้ว',
    charged:     'ตัดคาบ',
  },

  // ── ทางเข้าหน้า ───────────────────────────────────────────
  async render(el) {
    el.innerHTML = `<div id="atBody">${UI.loading('กำลังรวมรายการ')}</div>`;
    const box = document.getElementById('atBody');

    const res = await API.cached('getAttendanceBoard');
    if (!res.ok) {
      box.innerHTML = `<div class="card"><div class="notice notice--error">${UI.esc(res.message)}</div></div>`;
      return;
    }

    this.board = res.data;

    if (this.board.noProfile) {
      box.innerHTML = UI.empty('ยังไม่ผูกข้อมูลผู้ฝึกสอน',
        'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลผู้ฝึกสอน จึงยังไม่มีคาบของตัวเอง แจ้งผู้ดูแลศูนย์ให้ผูกให้');
      return;
    }

    this.paint(box);
  },

  paint(box) {
    const b = this.board;

    box.innerHTML = `
      <div class="lstrip">
        <div class="lstrip__i">
          <span class="lstrip__k">วันนี้</span>
          <span class="lstrip__v">${(b.todayRows || []).length}</span>
          <span class="lstrip__n">คาบที่ยังไม่ได้เช็ก</span>
        </div>
        <div class="lstrip__i${b.unchecked.length ? ' lstrip__i--alert' : ''}">
          <span class="lstrip__k">ค้างมาจากวันก่อน</span>
          <span class="lstrip__v">${b.unchecked.length}</span>
          <span class="lstrip__n">ผ่านวันไปแล้วยังไม่เช็ก</span>
        </div>
        <div class="lstrip__i">
          <span class="lstrip__k">รอตัดสิน</span>
          <span class="lstrip__v${b.pending.length ? ' lstrip__v--warn' : ''}">${b.pending.length}</span>
          <span class="lstrip__n">${b.isTrainer ? 'รอผู้ดูแลระบบ' : 'ขาดแล้วยังไม่ตัดสิน'}</span>
        </div>
      </div>

      <div class="ftools">
        <div class="chipbar chipbar--tabs">
          ${this.tabs().map(([v, label]) => `<button class="chipbtn${this.tab === v ? ' is-on' : ''}"
              data-atab="${v}">${label}
              <span class="chipbtn__n">${this.listOf(v).length}</span></button>`).join('')}
        </div>
        ${b.isTrainer ? '' : `
          <div class="ftools__right">
            <input class="field__input ftools__q" id="at_q" type="search"
              placeholder="ค้นหาเด็ก คอร์ส ผู้สอน" value="${UI.esc(this.query)}">
          </div>`}
      </div>

      <div id="atList"></div>`;

    if (!b.isTrainer) {
      box.querySelector('#at_q').addEventListener('input', e => {
        Attend.query = e.target.value;
        Attend.paintList();
      });
    }

    box.querySelectorAll('[data-atab]').forEach(btn => {
      btn.onclick = () => {
        Attend.tab = btn.dataset.atab;
        box.querySelectorAll('[data-atab]').forEach(x =>
          x.classList.toggle('is-on', x.dataset.atab === Attend.tab));
        Attend.paintList();
      };
    });

    this.paintList();
  },

  tabs() {
    return this.board.isTrainer
      ? [['unchecked', 'ค้างเช็ก'], ['history', 'ประวัติ']]
      : [['unchecked', 'ค้างเช็ก'], ['pending', 'รอตัดสิน'], ['decided', 'ตัดสินแล้ว']];
  },

  // ประวัติของผู้ฝึกสอน = รอตัดสิน + ตัดสินแล้ว เรียงวันใหม่ขึ้นก่อน
  listOf(tab) {
    if (!this.board) return [];
    // แท็บค้างเช็กรวมของวันนี้กับของที่ค้างมาก่อนหน้าไว้ด้วยกัน
    // แต่ตอนแสดงผลจะคั่นหัวข้อให้เห็นว่าอันไหนเป็นอันไหน
    if (tab === 'unchecked') {
      return (this.board.todayRows || []).concat(this.board.unchecked || []);
    }
    if (tab !== 'history') return this.board[tab] || [];
    return (this.board.pending || []).concat(this.board.decided || [])
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },

  rows() {
    const list = this.listOf(this.tab);
    const q = this.query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(r => [r.childName, r.childFull, r.courseName, r.trainerName]
      .some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
  },

  find(id) {
    const all = (this.board.todayRows || [])
      .concat(this.board.unchecked || [], this.board.pending || [],
              this.board.decided || []);
    return all.find(r => String(r.id) === String(id));
  },

  // ── รายการ ────────────────────────────────────────────────
  paintList() {
    const box = document.getElementById('atList');
    if (!box) return;

    const list = this.rows();
    if (!list.length) { box.innerHTML = this.emptyFor(this.tab); return; }

    if (this.tab === 'unchecked') {
      // ของวันนี้ขึ้นก่อนเสมอ เพราะเป็นใบรายชื่อที่กำลังจะใช้
      // ของที่ค้างมาจากวันก่อนอยู่ล่าง เป็นของที่ต้องตามเก็บ
      const today = list.filter(r => String(r.date) === String(this.board.today));
      const old   = list.filter(r => String(r.date) !== String(this.board.today));
      const group = (title, note, rows) => rows.length ? `
        <h3 class="isec">${UI.esc(title)}<small>${UI.esc(note)}</small></h3>
        <div class="irows">${rows.map(r => this.row(r)).join('')}</div>` : '';

      box.innerHTML =
        group('วันนี้', today.length + ' คาบ', today) +
        group('ค้างมาจากวันก่อน', old.length + ' คาบ', old);
    } else {
      box.innerHTML = '<div class="irows">' +
        list.map(r => this.row(r)).join('') + '</div>';
    }

    box.querySelectorAll('[data-mark]').forEach(btn => {
      btn.onclick = () => Attend.mark(btn.dataset.id, btn.dataset.mark, btn);
    });
    box.querySelectorAll('[data-decide]').forEach(btn => {
      btn.onclick = () => Attend.openDecide(btn.dataset.decide);
    });
    box.querySelectorAll('[data-undo]').forEach(btn => {
      btn.onclick = () => Attend.undo(btn.dataset.undo);
    });
  },

  emptyFor(tab) {
    if (tab === 'unchecked') {
      return UI.empty('ไม่มีคาบที่ต้องเช็ก',
        'วันนี้ไม่มีคาบสอน และคาบที่ผ่านมาเช็กชื่อครบหมดแล้ว');
    }
    if (tab === 'pending') {
      return UI.empty('ไม่มีคาบรอตัดสิน',
        'เมื่อมีเด็กขาดเรียน คาบนั้นจะมารออยู่ที่นี่ให้เลือกว่าจะทำยังไง');
    }
    if (tab === 'history') {
      return UI.empty('ยังไม่มีคาบที่ขาด',
        'คาบที่เช็กว่าขาดจะเก็บไว้ที่นี่ พร้อมผลว่าผู้ดูแลระบบตัดสินยังไง');
    }
    return UI.empty('ยังไม่มีประวัติการตัดสิน',
      'คาบที่ตัดสินไปแล้วจะเก็บไว้ที่นี่ ย้อนกลับได้ถ้าเลือกผิด');
  },

  row(r) {
    const admin = !this.board.isTrainer;

    return `
      <div class="irow">
        <div class="irow__open irow__open--flat">
          <span class="irow__who">
            ${UI.esc(r.childName)}
            <small>${UI.esc(r.courseName)}${
              admin && r.trainerName ? ' · ' + UI.esc(r.trainerName) : ''}${
              r.makeupOfId ? ' · คาบชดเชย' : ''}</small>
            ${/* อาการแพ้และโรคประจำตัวต้องอยู่ตรงนี้ ไม่ใช่ให้ไปเปิดหน้าเด็กเอง
                 คนเช็กชื่อคือคนที่ยืนอยู่กับเด็ก และเป็นจังหวะเดียวที่ได้มองรายชื่อ */
              (r.alerts || []).length
                ? `<small class="warn">${UI.esc(r.alerts.join(' · '))}</small>` : ''}
          </span>
          <span class="irow__num">
            <b class="irow__when">${UI.esc(UI.thaiDate(r.date, 'short'))}</b>
            <small>${UI.esc(r.startTime)}–${UI.esc(r.endTime)}</small>
          </span>
        </div>
        ${this.action(r, admin)}
      </div>`;
  },

  action(r, admin) {
    // ค้างเช็ก — สามปุ่มบนแถว กดครั้งเดียวจบ
    if (this.tab === 'unchecked') {
      return `<span class="markset">
        ${Object.keys(this.MARK).map(k => `
          <button class="markbtn markbtn--${k}" data-mark="${k}"
            data-id="${UI.esc(r.id)}">${this.MARK[k]}</button>`).join('')}
      </span>`;
    }

    // รอตัดสิน — ผู้ดูแลระบบเท่านั้นที่เข้าแท็บนี้ได้
    if (this.tab === 'pending') {
      return `<button class="irow__act irow__act--go" data-decide="${UI.esc(r.id)}">ตัดสิน</button>`;
    }

    // ประวัติของผู้ฝึกสอน — ยังไม่ตัดสินกับตัดสินแล้วปนกัน แยกด้วยป้าย
    if (this.tab === 'history') {
      return `<span class="irow__tag">${
        r.makeupStatus && this.RESULT[r.makeupStatus]
          ? UI.esc(this.RESULT[r.makeupStatus])
          : 'รอผู้ดูแลระบบ'}</span>`;
    }

    // ตัดสินแล้ว
    return `<span class="irow__done">
      <span class="irow__tag">${UI.esc(this.RESULT[r.makeupStatus] || r.makeupStatus)}</span>
      ${admin ? `<button class="irow__act" data-undo="${UI.esc(r.id)}">ย้อนกลับ</button>` : ''}
    </span>`;
  },

  // ── เช็กชื่อ ──────────────────────────────────────────────
  // ไม่เปิดกล่อง ไม่ถามยืนยัน เพราะทำวันละหลายสิบครั้ง
  // ปิดเฉพาะปุ่มในแถวนั้นระหว่างรอ แถวอื่นยังกดต่อได้
  async mark(id, value, btn) {
    const set = btn.closest('.markset');
    set.classList.add('is-busy');

    const res = await API.call('markAttendance', { id: id, attendance: value });

    if (!res.ok) {
      set.classList.remove('is-busy');
      UI.toast(res.message, 'error');
      return;
    }

    const r = this.find(id);
    const name = r ? r.childName : '';

    await this.reload();
    UI.toast(value === 'absent'
      ? (this.board.isTrainer
          ? 'บันทึกว่า' + name + 'ขาดเรียน ผู้ดูแลระบบจะเป็นคนเลือกว่าจะคืนคาบหรือตัดคาบ'
          : 'บันทึกว่า' + name + 'ขาดเรียน ไปเลือกวิธีจัดการได้ที่แท็บรอตัดสิน')
      : 'บันทึกว่า' + name + this.MARK[value] + 'แล้ว');
  },

  // ── ตัดสินคาบที่ขาด ───────────────────────────────────────
  openDecide(id) {
    const r = this.find(id);
    if (!r) return;

    const trainers = this.board.trainers || [];

    UI.openSheet(`
      <div class="sheet__title">${UI.esc(r.childName)}ขาดเรียน</div>
      <p class="sheet__sub">${UI.esc(r.courseName)} ·
        ${UI.esc(UI.thaiDate(r.date))} ${UI.esc(r.startTime)}–${UI.esc(r.endTime)}</p>

      <div class="picks">
        ${[
          ['credited',    'คืนคาบให้',  'ได้คาบกลับไว้นัดใหม่ทีหลัง ยอดคงเหลือเพิ่มขึ้นหนึ่งคาบ'],
          ['rescheduled', 'นัดชดเชยเลย', 'คืนคาบแล้วลงนัดใหม่ให้ในขั้นตอนเดียว'],
          ['charged',     'ตัดคาบ',      'ถือว่าใช้คาบนี้ไปแล้ว ยอดคงเหลือไม่เปลี่ยน'],
        ].map(([v, title, desc], i) => `
          <label class="pick">
            <input type="radio" name="d_what" value="${v}"${i === 0 ? ' checked' : ''}>
            <span class="pick__b">
              <span class="pick__t">${title}</span>
              <span class="pick__d">${desc}</span>
            </span>
          </label>`).join('')}
      </div>

      <div id="d_when" class="is-hidden">
        ${People.fgroup('คาบชดเชย')}
        <div class="frow">
          ${People.finput('d_date', 'วันที่', UI.today(), '', 'date')}
          ${People.fselect('d_trainer', 'ผู้สอน',
            trainers.map(t => [t.id, t.name]), r.trainerId)}
        </div>
        <div class="frow">
          ${People.finput('d_start', 'เริ่ม', r.startTime, '', 'time')}
          ${People.finput('d_end', 'ถึง', r.endTime, '', 'time')}
        </div>
      </div>

      ${People.finput('d_note', 'หมายเหตุ', r.note, 'เช่น แม่โทรแจ้งว่าไม่สบาย')}

      <div class="sheet__actions">
        <button class="btn btn--ghost" data-act="close">ยกเลิก</button>
        <button class="btn btn--primary" data-act="save" data-busy="กำลังบันทึก">บันทึก</button>
      </div>`);

    // ช่องวันเวลาโผล่เฉพาะตอนเลือกนัดชดเชย อีกสองทางไม่ต้องกรอกอะไร
    const when = document.getElementById('d_when');
    document.querySelectorAll('[name="d_what"]').forEach(radio => {
      radio.onchange = () => {
        when.classList.toggle('is-hidden', radio.value !== 'rescheduled' || !radio.checked);
      };
    });

    People.bindSheet({
      close: () => UI.closeSheet(),
      save:  () => Attend.saveDecision(r),
    });
  },

  async saveDecision(r) {
    const picked = document.querySelector('[name="d_what"]:checked');
    const decision = picked ? picked.value : '';

    const payload = { id: r.id, decision: decision, note: People.val('d_note') };

    if (decision === 'rescheduled') {
      payload.date      = People.val('d_date');
      payload.startTime = People.val('d_start');
      payload.endTime   = People.val('d_end');
      payload.trainerId = People.val('d_trainer');

      if (!payload.date || !payload.startTime || !payload.endTime) {
        UI.toast('กรอกวันและเวลาของคาบชดเชยก่อน', 'error');
        return;
      }
    }

    const res = await API.call('decideMakeup', payload);
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    UI.closeSheet();
    App.invalidate();              // กระทบยอดคงเหลือในหน้าคอร์สและตารางนัดด้วย
    await this.reload();

    UI.toast(decision === 'rescheduled'
      ? 'ลงนัดชดเชยให้' + r.childName + 'แล้ว'
      : decision === 'credited'
      ? 'คืนคาบให้' + r.childName + 'แล้ว เหลือ ' + res.data.remaining + ' คาบ'
      : 'ตัดคาบของ' + r.childName + 'แล้ว');
  },

  async undo(id) {
    const r = this.find(id);
    if (!r) return;
    if (!confirm('ย้อนผลการตัดสินของ' + r.childName + '?\n' +
      'คาบจะกลับไปอยู่ในรายการรอตัดสิน')) return;

    const res = await API.call('undoMakeup', { id: id });
    if (!res.ok) { UI.toast(res.message, 'error'); return; }

    App.invalidate();
    await this.reload();

    UI.toast(res.data.madeCount
      ? 'ย้อนกลับแล้ว แต่คาบชดเชยที่ลงไว้ยังอยู่ ถ้าไม่ใช้ให้ไปยกเลิกที่ตารางนัด'
      : 'ย้อนกลับแล้ว คาบกลับไปอยู่ในรายการรอตัดสิน');
  },

  async reload() {
    API.clearCache('getAttendanceBoard');
    await this.render(document.getElementById('page'));
    App.refreshAlerts();
  },
};

PAGES.attendance = (el) => Attend.render(el);
