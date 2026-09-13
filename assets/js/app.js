/* ------------------------------------------------------------------
 * app.js — ตัวควบคุมหลักของแอปฝึกเขียนตาม
 * ------------------------------------------------------------------ */
(function () {
  const { CATEGORIES, buildPool, displayForm } = window.KH_DATA;
  const AUDIO = window.KH_AUDIO;
  const $ = (id) => document.getElementById(id);

  /* ================= ค่าตั้งต้น ================= */
  const DEFAULTS = {
    level: 1,
    cats: ['consonants', 'numbers'],
    showSec: 5,
    guide: 'trace',
    rate: 0.85,
    listenOnly: false,
    autoNext: false,
    lines: true,
    pressure: true,
    autoClear: true,
    pen: 'auto',
    vowelStyle: 'or',
    color: '#2d3142',
    size: 14,
  };
  const LEVEL_PRESET = {
    1: { showSec: 6, guide: 'trace' },
    2: { showSec: 3, guide: 'faint' },
    3: { showSec: 0, guide: 'none' },
  };
  const LEVEL_NOTE = {
    1: 'ง่าย: ตัวอักษรพื้นฐาน แสดงนาน ๆ พร้อมตัวโปร่งให้ลากทับ',
    2: 'ปานกลาง: เพิ่มตัวอักษรและคำที่ยากขึ้น แสดงสั้นลง เหลือตัวอย่างจาง ๆ',
    3: 'ยาก: ครบทุกตัว เน้นฟังเสียงแล้วเขียนเอง ไม่มีตัวอย่างให้ดู',
  };

  const PALETTE = [
    '#2d3142', '#ee5a6f', '#ff7f50', '#ffb400',
    '#2ec4b6', '#4d9de0', '#7c5cff', '#ff6b9d',
    '#00a86b', '#8d6e63',
  ];

  const PRAISES = ['เก่งมาก!', 'สุดยอด!', 'สวยจัง!', 'เยี่ยมเลย!', 'เขียนสวยมาก!', 'ยอดเยี่ยม!', 'หนูทำได้!', 'ดีมากเลย!'];

  const LS_KEY = 'khaohom-writing-v1';
  let S = load();
  let score = S.__score || 0;
  let streak = S.__streak || 0;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      const merged = { ...DEFAULTS, ...raw };
      if (!Array.isArray(merged.cats) || !merged.cats.length) merged.cats = [...DEFAULTS.cats];
      return merged;
    } catch (e) { return { ...DEFAULTS }; }
  }
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...S, __score: score, __streak: streak }));
    } catch (e) { /* โหมดส่วนตัวของ Safari อาจเซฟไม่ได้ */ }
  }

  /* ================= องค์ประกอบหน้าจอ ================= */
  const charText = $('charText');
  const hintText = $('hintText');
  const catBadge = $('catBadge');
  const hiddenFace = $('hiddenFace');
  const timerWrap = $('timerWrap');
  const timerFill = $('timerFill');
  const timerLabel = $('timerLabel');
  const boardHint = $('boardHint');

  const board = new window.KH_Board($('boardWrap'), $('guideCanvas'), $('inkCanvas'));

  let pool = [];
  let current = null;
  let recent = [];
  let timerId = null;
  let rafId = null;
  let peeking = false;

  /* ================= สร้างตัวเลือกในแผงตั้งค่า ================= */
  function buildChips() {
    const box = $('catChips');
    box.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const b = document.createElement('button');
      b.className = 'chip' + (S.cats.includes(cat.id) ? ' is-active' : '');
      b.textContent = `${cat.emoji} ${cat.name}`;
      if (S.cats.includes(cat.id)) b.style.background = cat.color;
      b.addEventListener('click', () => {
        const i = S.cats.indexOf(cat.id);
        if (i >= 0) {
          if (S.cats.length === 1) { toast('ต้องเลือกอย่างน้อย 1 หมวดนะคะ'); return; }
          S.cats.splice(i, 1);
          b.classList.remove('is-active');
          b.style.background = '';
        } else {
          S.cats.push(cat.id);
          b.classList.add('is-active');
          b.style.background = cat.color;
        }
        AUDIO.sfx.pop();
        refreshPool();
        save();
      });
      box.appendChild(b);
    });
  }

  function buildColors() {
    const row = $('colorRow');
    row.innerHTML = '';
    PALETTE.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'color-btn' + (c === S.color ? ' is-active' : '');
      b.style.background = c;
      b.setAttribute('aria-label', 'สีปากกา ' + c);
      b.addEventListener('click', () => {
        S.color = c;
        board.color = c;
        board.eraser = false;
        $('eraserBtn').classList.remove('is-on');
        row.querySelectorAll('.color-btn').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        AUDIO.sfx.pop();
        save();
      });
      row.appendChild(b);
    });
  }

  function setSeg(segId, attr, value) {
    document.querySelectorAll(`#${segId} button`).forEach((b) => {
      b.classList.toggle('is-active', b.dataset[attr] === String(value));
    });
  }

  /* ================= คลังคำ ================= */
  function refreshPool() {
    pool = buildPool(S.cats, S.level);
    if (!pool.length) {
      pool = buildPool(CATEGORIES.map((c) => c.id), S.level);
    }
  }

  function pickNext() {
    if (pool.length <= 1) return pool[0];
    let item, guard = 0;
    do {
      item = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    } while (recent.includes(item.ch) && guard < 40);
    recent.push(item.ch);
    if (recent.length > Math.min(8, Math.floor(pool.length / 2))) recent.shift();
    return item;
  }

  /* ================= รอบการเล่น ================= */
  function shownChar(item) {
    return displayForm(item, S.vowelStyle);
  }

  function effectiveGuide() {
    return S.listenOnly ? 'none' : S.guide;
  }

  function newRound(speak = true) {
    stopTimers();
    peeking = false;
    current = pickNext();
    if (!current) return;

    catBadge.textContent = (CATEGORIES.find((c) => c.id === current.cat) || {}).name || '';
    catBadge.style.background = `linear-gradient(135deg, ${current.color}, ${shade(current.color, -18)})`;
    charText.textContent = shownChar(current);
    hintText.textContent = current.hint || '';

    board.accent = current.color;
    if (S.autoClear) board.clear();
    board.setGuide(shownChar(current), effectiveGuide());
    boardHint.classList.toggle('hide', !board.isEmpty());

    const secs = S.listenOnly ? 0 : S.showSec;
    if (secs > 0) {
      showChar(true);
      runTimer(secs);
    } else {
      showChar(false);
      timerWrap.classList.remove('show');
      timerLabel.textContent = '';
    }

    if (speak) sayCurrent();
    charText.classList.remove('pop-in');
    void charText.offsetWidth;
    charText.classList.add('pop-in');
  }

  function showChar(show) {
    charText.classList.toggle('is-hidden', !show);
    hintText.classList.toggle('is-hidden', !show);
    hiddenFace.classList.toggle('show', !show);
  }

  function runTimer(secs) {
    timerWrap.classList.add('show');
    const start = performance.now();
    const total = secs * 1000;
    timerLabel.textContent = 'ดูให้ดีนะ แล้วเขียนตาม…';
    const step = (now) => {
      const left = Math.max(0, 1 - (now - start) / total);
      timerFill.style.transform = `scaleX(${left})`;
      if (left > 0) {
        rafId = requestAnimationFrame(step);
      } else {
        timerFill.style.transform = 'scaleX(0)';
        timerLabel.textContent = 'ถึงตาหนูเขียนแล้ว! ✍️';
        showChar(false);
        AUDIO.sfx.swoosh();
      }
    };
    rafId = requestAnimationFrame(step);
  }

  function stopTimers() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    timerFill.style.transform = 'scaleX(1)';
  }

  function sayCurrent() {
    if (!current) return;
    AUDIO.unlock();
    const ok = AUDIO.speak(current.say, current.lang);
    if (!ok) {
      AUDIO.sfx.ding();
      toast('อุปกรณ์นี้ยังไม่มีเสียงอ่าน ลองใช้ Safari บน iPad นะคะ');
    }
  }

  function peek(ms = 1600) {
    if (peeking || !current) return;
    peeking = true;
    stopTimers();
    showChar(true);
    board.setGuide(shownChar(current), S.guide === 'none' ? 'faint' : S.guide);
    timerWrap.classList.add('show');
    timerLabel.textContent = 'ดูแวบเดียวนะ 👀';
    const start = performance.now();
    const step = (now) => {
      const left = Math.max(0, 1 - (now - start) / ms);
      timerFill.style.transform = `scaleX(${left})`;
      if (left > 0) { rafId = requestAnimationFrame(step); return; }
      showChar(false);
      board.setGuide(shownChar(current), effectiveGuide());
      timerLabel.textContent = 'เขียนต่อเลย ✍️';
      peeking = false;
    };
    rafId = requestAnimationFrame(step);
    AUDIO.sfx.tick();
  }

  /* ================= กดว่าเขียนเสร็จ ================= */
  function done() {
    if (board.isEmpty()) {
      toast('ลองเขียนลงกระดานก่อนนะคะ ✍️');
      AUDIO.sfx.pop();
      return;
    }
    stopTimers();
    timerWrap.classList.remove('show');
    score++;
    streak++;
    $('scoreVal').textContent = score;
    $('streakVal').textContent = streak;
    save();

    praise(PRAISES[Math.floor(Math.random() * PRAISES.length)]);
    confettiBurst();
    AUDIO.sfx.cheer();

    // เฉลยให้เห็นตัวจริงสักครู่
    showChar(true);
    if (current) board.setGuide(shownChar(current), S.guide === 'none' ? 'faint' : S.guide);

    timerId = setTimeout(() => {
      if (S.autoNext) newRound(true);
      else if (current) board.setGuide(shownChar(current), effectiveGuide());
    }, 1500);
  }

  /* ================= เอฟเฟกต์ ================= */
  let toastId = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastId);
    toastId = setTimeout(() => t.classList.remove('show'), 2300);
  }

  function praise(text) {
    const p = $('praise');
    $('praiseText').textContent = text;
    p.classList.remove('show');
    void p.offsetWidth;
    p.classList.add('show');
  }

  const cc = $('confetti');
  const cctx = cc.getContext('2d');
  let bits = [];
  let confRaf = null;
  function sizeConfetti() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cc.width = innerWidth * dpr;
    cc.height = innerHeight * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeConfetti();
  addEventListener('resize', sizeConfetti);

  function confettiBurst() {
    const colors = ['#7c5cff', '#ff6b9d', '#ffa62b', '#2ec4b6', '#4d9de0', '#ffd93d'];
    for (let i = 0; i < 90; i++) {
      bits.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 220,
        y: innerHeight / 2,
        vx: (Math.random() - 0.5) * 13,
        vy: -Math.random() * 15 - 5,
        s: 6 + Math.random() * 9,
        c: colors[(Math.random() * colors.length) | 0],
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        life: 1,
      });
    }
    if (!confRaf) confRaf = requestAnimationFrame(stepConfetti);
  }

  function stepConfetti() {
    cctx.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.vy += 0.42;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      b.life -= 0.008;
      cctx.save();
      cctx.globalAlpha = Math.max(0, b.life);
      cctx.translate(b.x, b.y);
      cctx.rotate(b.r);
      cctx.fillStyle = b.c;
      cctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.62);
      cctx.restore();
    });
    bits = bits.filter((b) => b.life > 0 && b.y < innerHeight + 60);
    if (bits.length) {
      confRaf = requestAnimationFrame(stepConfetti);
    } else {
      cctx.clearRect(0, 0, innerWidth, innerHeight);
      confRaf = null;
    }
  }

  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    const cl = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${cl((n >> 16) & 255)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
  }

  /* ================= ผูกปุ่มทั้งหมด ================= */
  function bindUI() {
    // เริ่มเล่น
    $('startBtn').addEventListener('click', () => {
      AUDIO.unlock();
      $('welcome').classList.add('hide');
      setTimeout(() => { $('welcome').style.display = 'none'; }, 500);
      newRound(true);
    });

    $('sayBtn').addEventListener('click', sayCurrent);
    $('peekBtn').addEventListener('click', () => peek());
    $('nextBtn').addEventListener('click', () => { AUDIO.sfx.pop(); newRound(true); });
    $('doneBtn').addEventListener('click', done);

    // ฟังอย่างเดียว
    $('listenOnlyBtn').addEventListener('click', () => {
      S.listenOnly = !S.listenOnly;
      $('optListen').checked = S.listenOnly;
      applyListenOnly();
      save();
    });
    $('optListen').addEventListener('change', (e) => {
      S.listenOnly = e.target.checked;
      applyListenOnly();
      save();
    });

    // เต็มจอ
    $('fullBtn').addEventListener('click', () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().catch(() => toast('อุปกรณ์นี้ไม่รองรับเต็มจอ ลองกด “เพิ่มไปหน้าโฮม” แทนค่ะ'));
      } else if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        toast('บน iPad เพิ่มเว็บไปหน้าโฮมจะได้เต็มจอเลยค่ะ 📱');
      }
    });

    // แผงตั้งค่า
    const openS = () => { $('settings').classList.add('open'); $('scrim').classList.add('show'); };
    const closeS = () => { $('settings').classList.remove('open'); $('scrim').classList.remove('show'); };
    $('settingsBtn').addEventListener('click', openS);
    $('closeSettings').addEventListener('click', closeS);
    $('scrim').addEventListener('click', closeS);

    // ระดับความยาก
    document.querySelectorAll('#levelSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.level = +b.dataset.level;
        const preset = LEVEL_PRESET[S.level];
        S.showSec = preset.showSec;
        S.guide = preset.guide;
        applyLevel();
        refreshPool();
        newRound(true);
        save();
        AUDIO.sfx.pop();
      });
    });

    // ตัวอย่างให้เขียนทับ
    document.querySelectorAll('#guideSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.guide = b.dataset.guide;
        setSeg('guideSeg', 'guide', S.guide);
        if (current) board.setGuide(shownChar(current), effectiveGuide());
        save();
      });
    });

    // รูปแบบสระ / วรรณยุกต์
    document.querySelectorAll('#vowelSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.vowelStyle = b.dataset.vowel;
        setSeg('vowelSeg', 'vowel', S.vowelStyle);
        if (current) {
          charText.textContent = shownChar(current);
          board.setGuide(shownChar(current), effectiveGuide());
        }
        AUDIO.sfx.pop();
        save();
      });
    });

    // รับสัมผัสจาก
    document.querySelectorAll('#penSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.pen = b.dataset.pen;
        board.penOnly = S.pen;
        setSeg('penSeg', 'pen', S.pen);
        save();
      });
    });

    // เวลาแสดง
    $('showSec').addEventListener('input', (e) => {
      S.showSec = +e.target.value;
      $('showSecVal').textContent = S.showSec;
      save();
    });

    // ความเร็วเสียง
    $('rateRange').addEventListener('input', (e) => {
      S.rate = +e.target.value;
      $('rateVal').textContent = S.rate.toFixed(2);
      AUDIO.setRate(S.rate);
      save();
    });

    // สวิตช์ต่าง ๆ
    $('optAutoNext').addEventListener('change', (e) => { S.autoNext = e.target.checked; save(); });
    $('optLines').addEventListener('change', (e) => {
      S.lines = e.target.checked; board.showLines = S.lines; board.drawGuide(); save();
    });
    $('optPressure').addEventListener('change', (e) => { S.pressure = e.target.checked; board.usePressure = S.pressure; save(); });
    $('optAutoClear').addEventListener('change', (e) => { S.autoClear = e.target.checked; save(); });

    $('resetScore').addEventListener('click', () => {
      score = 0; streak = 0;
      $('scoreVal').textContent = '0';
      $('streakVal').textContent = '0';
      save();
      toast('ล้างคะแนนแล้วค่ะ');
    });

    // เครื่องมือปากกา
    document.querySelectorAll('.size-btn').forEach((b) => {
      b.addEventListener('click', () => {
        S.size = +b.dataset.size;
        board.size = S.size;
        document.querySelectorAll('.size-btn').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        AUDIO.sfx.pop();
        save();
      });
    });

    $('eraserBtn').addEventListener('click', () => {
      board.eraser = !board.eraser;
      $('eraserBtn').classList.toggle('is-on', board.eraser);
      AUDIO.sfx.pop();
    });
    $('undoBtn').addEventListener('click', () => { if (board.undo()) AUDIO.sfx.tick(); });
    $('redoBtn').addEventListener('click', () => { if (board.redo()) AUDIO.sfx.tick(); });
    $('clearBtn').addEventListener('click', () => {
      board.clear();
      boardHint.classList.remove('hide');
      AUDIO.sfx.swoosh();
    });
    $('saveBtn').addEventListener('click', saveImage);

    board.onStrokeStart = () => { boardHint.classList.add('hide'); };

    // ปุ่มลัดบนคีย์บอร์ด (เผื่อใช้กับ Magic Keyboard)
    addEventListener('keydown', (e) => {
      if (e.target.matches('input,textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); newRound(true); }
      else if (e.key === 'r' || e.key === 'R') sayCurrent();
      else if (e.key === 'p' || e.key === 'P') peek();
      else if (e.key === 'c' || e.key === 'C') board.clear();
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? board.redo() : board.undo(); }
    });

    // กันหน้าเว็บเลื่อน/ซูมขณะเขียน
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  }

  function saveImage() {
    try {
      const url = board.toDataURL();
      const a = document.createElement('a');
      a.href = url;
      a.download = `ผลงาน-${(current && current.ch) || 'เขียน'}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('บันทึกรูปแล้วค่ะ 💾');
    } catch (e) {
      toast('บันทึกไม่สำเร็จ ลองกดค้างที่กระดานเพื่อบันทึกรูปแทนค่ะ');
    }
  }

  function applyListenOnly() {
    $('listenOnlyBtn').classList.toggle('is-on', S.listenOnly);
    if (current) {
      board.setGuide(shownChar(current), effectiveGuide());
      if (S.listenOnly) {
        stopTimers();
        showChar(false);
        timerWrap.classList.remove('show');
      }
    }
    toast(S.listenOnly ? 'โหมดฟังอย่างเดียว 👂 ตั้งใจฟังแล้วเขียนเลย!' : 'กลับมาแสดงตัวอักษรแล้วค่ะ 👀');
  }

  function applyLevel() {
    setSeg('levelSeg', 'level', S.level);
    setSeg('guideSeg', 'guide', S.guide);
    $('levelVal').textContent = S.level;
    $('levelNote').textContent = LEVEL_NOTE[S.level];
    $('showSec').value = S.showSec;
    $('showSecVal').textContent = S.showSec;
  }

  /* ================= เริ่มต้น ================= */
  function init() {
    buildChips();
    buildColors();

    board.color = S.color;
    board.size = S.size;
    board.penOnly = S.pen;
    board.usePressure = S.pressure;
    board.showLines = S.lines;

    $('optListen').checked = S.listenOnly;
    $('optAutoNext').checked = S.autoNext;
    $('optLines').checked = S.lines;
    $('optPressure').checked = S.pressure;
    $('optAutoClear').checked = S.autoClear;
    $('rateRange').value = S.rate;
    $('rateVal').textContent = (+S.rate).toFixed(2);
    AUDIO.setRate(S.rate);
    $('listenOnlyBtn').classList.toggle('is-on', S.listenOnly);
    $('scoreVal').textContent = score;
    $('streakVal').textContent = streak;

    document.querySelectorAll('.size-btn').forEach((b) =>
      b.classList.toggle('is-active', +b.dataset.size === S.size)
    );
    setSeg('penSeg', 'pen', S.pen);
    setSeg('vowelSeg', 'vowel', S.vowelStyle);
    applyLevel();
    refreshPool();
    bindUI();

    // เตรียมรอบแรกไว้เบื้องหลัง (ยังไม่ออกเสียงจนกว่าจะกดเริ่ม)
    newRound(false);
    board.drawGuide();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ไม่เป็นไร */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
