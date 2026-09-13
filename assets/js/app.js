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
    pressure: true,
    autoClear: true,
    pen: 'auto',
    vowelStyle: 'or',
    check: true,
    strict: 'easy',
    session: false,
    setLen: 10,
    stroke: true,
    customGreat: 73,      // % ที่ถือว่าถูกต้อง (ตัวเลขเดียวกับที่โชว์ในผลตรวจ)
    customClose: 56,      // % ที่ถือว่าใกล้เคียง
    font: 'mali',
    fontScale: 52,        // % ของความสูงกระดาน
    lineStyle: 'two',
    mirror: false,
    sfx: true,
    repeatSec: 0,
    voice: '',
    color: '#2d3142',
    size: 14,
  };

  const FONTS = {
    mali: '"Mali", "Sarabun", "Noto Sans Thai", sans-serif',
    itim: '"Itim", "Mali", "Noto Sans Thai", sans-serif',
    sarabun: '"Sarabun", "Noto Sans Thai", sans-serif',
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
      // เวอร์ชันก่อนหน้าเก็บเส้นบรรทัดเป็น true/false
      if (raw.lines === false && !raw.lineStyle) merged.lineStyle = 'none';
      delete merged.lines;
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

  const board = new window.KH_Board($('boardWrap'), $('guideCanvas'), $('inkCanvas'), $('checkCanvas'));
  const CHECKER = window.KH_Checker;
  const STATS = window.KH_Stats;

  let pool = [];
  let focusPool = [];        // ฝึกเฉพาะตัวที่ยังไม่คล่อง
  let setCount = 0;
  let setResults = [];
  const headCache = new Map();
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
        focusPool = [];
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
    const src = focusPool.length ? focusPool : pool;
    if (src.length <= 1) return src[0];
    const pool0 = pool;
    pool = src;
    const got = pickFrom(src);
    pool = pool0;
    return got;
  }

  function pickFrom(pool) {
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

  /* หาตำแหน่งหัวของตัวอักษร (เฉพาะตัวเดียว ไม่ใช่คำ) แล้วจำไว้ใช้ซ้ำ */
  function headOf(text) {
    if (!S.stroke || !CHECKER || !CHECKER.findHead) return null;
    if (!text || [...text].length > 1) return null;
    const key = `${text}|${S.font}|${S.fontScale}`;
    if (!headCache.has(key)) {
      try {
        headCache.set(key, CHECKER.findHead(board.targetCanvas(text)));
      } catch (e) {
        headCache.set(key, null);
      }
    }
    return headCache.get(key);
  }

  function applyStartDot() {
    const head = headOf(current ? shownChar(current) : '');
    board.startDot = head && board.w ? { x: head.x * board.w, y: head.y * board.h } : null;
  }

  function effectiveGuide() {
    return S.listenOnly ? 'none' : S.guide;
  }

  function newRound(speak = true) {
    stopTimers();
    stopRepeat();
    peeking = false;
    current = pickNext();
    if (!current) return;

    // ซ่อนก่อนเปลี่ยนข้อความเสมอ ไม่งั้นตัวใหม่จะโผล่ให้เห็นระหว่างเฟดออก
    const secs = S.listenOnly ? 0 : S.showSec;
    if (secs <= 0) showChar(false, true);

    catBadge.textContent = (CATEGORIES.find((c) => c.id === current.cat) || {}).name || '';
    catBadge.style.background = `linear-gradient(135deg, ${current.color}, ${shade(current.color, -18)})`;
    charText.textContent = shownChar(current);
    hintText.textContent = current.hint || '';

    board.accent = current.color;
    hideResult();
    if (S.autoClear) board.clear();
    applyStartDot();
    board.setGuide(shownChar(current), effectiveGuide());
    boardHint.classList.toggle('hide', !board.isEmpty());

    charText.classList.remove('pop-in');
    if (secs > 0) {
      showChar(true);
      // เด้งตัวอักษรเฉพาะตอนที่แสดงจริงเท่านั้น
      void charText.offsetWidth;
      charText.classList.add('pop-in');
      runTimer(secs);
    } else {
      timerWrap.classList.remove('show');
      timerLabel.textContent = '';
    }

    if (speak) sayCurrent();
    scheduleRepeat();
  }

  /* show = แสดงหรือซ่อนตัวอักษร, instant = ซ่อนทันทีโดยไม่ต้องเฟด */
  function showChar(show, instant) {
    if (!show) charText.classList.remove('pop-in');
    if (instant) {
      charText.classList.add('no-anim');
      hintText.classList.add('no-anim');
    }
    charText.classList.toggle('is-hidden', !show);
    hintText.classList.toggle('is-hidden', !show);
    hiddenFace.classList.toggle('show', !show);
    if (instant) {
      void charText.offsetWidth;
      charText.classList.remove('no-anim');
      hintText.classList.remove('no-anim');
    }
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

  let repeatId = null;
  function stopRepeat() {
    if (repeatId) { clearTimeout(repeatId); repeatId = null; }
  }
  function scheduleRepeat() {
    stopRepeat();
    if (!S.repeatSec || !current) return;
    const tick = () => {
      if (!current) return;
      sayCurrent();
      repeatId = setTimeout(tick, S.repeatSec * 1000);
    };
    repeatId = setTimeout(tick, S.repeatSec * 1000);
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
  const GREAT = ['ถูกต้อง! เก่งมาก', 'เขียนสวยมาก!', 'เยี่ยมไปเลย!', 'ถูกต้องค่ะ!', 'สุดยอด!'];
  const CLOSE = ['ใกล้เคียงแล้ว!', 'เกือบได้แล้ว!', 'ดีขึ้นเยอะเลย!', 'อีกนิดเดียว!'];
  const RETRY = ['ลองอีกครั้งนะ', 'ดูตัวอย่างแล้วลองใหม่นะคะ', 'ไม่เป็นไร ลองอีกทีค่ะ'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* เกณฑ์ที่ใช้ตรวจ: ชื่อระดับ หรือค่าที่ผู้ใช้ตั้งเอง (แปลง % กลับเป็นคะแนน) */
  function checkLevel() {
    if (S.strict !== 'custom') return S.strict;
    return { great: S.customGreat / 125, close: S.customClose / 125 };
  }

  function hideResult() {
    $('resultBox').className = 'result';
    board.clearAnswer();
  }

  function showResult(kind, stars, text, sub) {
    const box = $('resultBox');
    box.className = `result show ${kind}`;
    $('resultStars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    $('resultText').textContent = text;
    $('resultSub').textContent = sub || '';
  }

  /* ตัวอักษรไทยส่วนใหญ่เขียนทีเดียวจบ บางตัวมีสองเส้น ที่เหลือเผื่อไว้กว้าง ๆ */
  const MULTI_STROKE = { 'ญ': 2, 'ฐ': 2, 'ฒ': 2, 'ณ': 2, 'ฎ': 2, 'ฏ': 2, 'ฬ': 2, 'ฆ': 2, 'ฌ': 2, 'ษ': 2, 'ศ': 2 };
  function expectedStrokes(text) {
    const chars = [...(text || '')];
    if (!chars.length) return 3;
    if (chars.length > 1) return chars.length * 2;
    const ch = chars[0];
    if (MULTI_STROKE[ch]) return MULTI_STROKE[ch];
    return /[\u0E00-\u0E7F]/.test(ch) ? 1 : 3;    // ไทย 1 เส้น ตัวเลข/อังกฤษเผื่อ 3
  }

  /* คำแนะนำการลากเส้น — เป็นคำแนะนำเท่านั้น ไม่มีผลกับดาว */
  function strokeHints(text) {
    if (!S.stroke) return [];
    const strokes = board.strokes;
    if (!strokes.length) return [];
    const hints = [];

    const head = headOf(text);
    if (head && board.w) {
      const p = strokes[0].pts[0];
      const dist = Math.hypot(p.x - head.x * board.w, p.y - head.y * board.h) / board.h;
      if (dist > 0.25) hints.push('คราวหน้าเริ่มเขียนจากหัว 🌀 ก่อนนะคะ');
    }
    if (strokes.length > expectedStrokes(text) + 2) {
      hints.push('ลองเขียนต่อเนื่อง ไม่ยกปากกาบ่อย ๆ นะคะ');
    }
    return hints;
  }

  /* ---------- ชุดฝึกและสถิติ ---------- */
  function updateSetChip() {
    const chip = $('setChip');
    chip.hidden = !S.session;
    if (!S.session) return;
    $('setNow').textContent = Math.min(setCount, S.setLen);
    $('setTotal').textContent = S.setLen;
    $('setFill').style.width = `${Math.min(100, (setCount / S.setLen) * 100)}%`;
  }

  function recordResult(verdict) {
    const ch = current ? current.ch : '';
    if (STATS) STATS.record(ch, verdict);
    if (!S.session) return;
    setResults.push({ ch, verdict, hint: current ? current.hint : '' });
    setCount++;
    updateSetChip();
    if (setCount >= S.setLen) {
      timerId = setTimeout(showSummary, 1500);
    }
  }

  function startSet() {
    setCount = 0;
    setResults = [];
    updateSetChip();
  }

  function showSummary() {
    const great = setResults.filter((r) => r.verdict === 'great').length;
    const close = setResults.filter((r) => r.verdict === 'close').length;
    const retry = setResults.filter((r) => r.verdict === 'retry').length;
    const plain = setResults.filter((r) => r.verdict === 'done').length;
    const stars = great * 3 + close * 2 + retry;
    const max = setResults.length * 3;
    const todo = [...new Set(setResults.filter((r) => r.verdict === 'close' || r.verdict === 'retry').map((r) => r.ch))];

    const ratio = max ? stars / max : 1;
    $('sumEmoji').textContent = ratio > 0.85 ? '🏆' : ratio > 0.6 ? '🎉' : '💪';
    $('sumTitle').textContent = ratio > 0.85 ? 'เก่งมากเลย!' : ratio > 0.6 ? 'จบชุดแล้ว เยี่ยม!' : 'จบชุดแล้ว สู้ต่อนะ!';
    $('sumStars').textContent = plain && !max ? '⭐'.repeat(Math.min(5, plain)) : `⭐ ${stars} / ${max} ดาว`;
    $('sumGreat').textContent = great + plain;
    $('sumClose').textContent = close;
    $('sumRetry').textContent = retry;
    $('sumChars').innerHTML = todo.length
      ? todo.map((c) => `<span>${c}</span>`).join('')
      : '<span style="background:#d8fff2">ครบทุกตัวเลย! 🎊</span>';
    $('sumFocus').style.display = todo.length ? '' : 'none';
    $('sumFocus').dataset.chars = todo.join('');
    $('summary').hidden = false;
    AUDIO.sfx.cheer();
    confettiBurst();
  }

  function setFocus(chars) {
    const want = [...chars];
    focusPool = pool.filter((it) => want.includes(it.ch));
    if (!focusPool.length) {
      // ตัวที่ต้องฝึกอาจอยู่นอกหมวด/ระดับที่เลือกไว้ จึงดึงมาจากคลังทั้งหมด
      focusPool = buildPool(CATEGORIES.map((c) => c.id), 3).filter((it) => want.includes(it.ch));
    }
    return focusPool.length;
  }

  function done() {
    if (board.isEmpty()) {
      toast('ลองเขียนลงกระดานก่อนนะคะ ✍️');
      AUDIO.sfx.pop();
      return;
    }
    stopTimers();
    stopRepeat();
    timerWrap.classList.remove('show');

    if (!S.check || !current || !CHECKER) {
      reward(pick(GREAT));
      recordResult('done');
      return;
    }

    const target = board.targetCanvas(shownChar(current));
    const r = CHECKER.check(board.ink, target, checkLevel());

    if (r.verdict === 'too-small') {
      toast('เขียนตัวใหญ่ขึ้นอีกนิดนะคะ จะได้ตรวจให้ได้ 🔍');
      AUDIO.sfx.pop();
      return;
    }

    // ทาบเฉลยให้เห็นว่าต่างกันตรงไหน
    const color = r.verdict === 'great' ? 'rgba(15,155,125,.72)'
      : r.verdict === 'close' ? 'rgba(224,135,0,.7)' : 'rgba(124,92,255,.65)';
    board.showAnswer(shownChar(current), color);

    const tips = strokeHints(shownChar(current));
    const pct = `เหมือนตัวอย่าง ${r.percent}%`;
    if (r.verdict === 'great') {
      showResult('great', 3, pick(GREAT), tips[0] ? `${pct} · ${tips[0]}` : pct);
      reward(pick(GREAT));
    } else if (r.verdict === 'close') {
      let hint = pct;
      if (r.complete < r.neat - 0.12) hint = `${pct} · ยังเขียนไม่ครบนิดหน่อย`;
      else if (r.neat < r.complete - 0.12) hint = `${pct} · มีเส้นเกินออกมา`;
      showResult('close', 2, pick(CLOSE), tips[0] ? `${hint} · ${tips[0]}` : hint);
      showChar(true);
      score++;
      streak++;
      updateScore();
      AUDIO.sfx.ding();
    } else {
      showResult('retry', 1, pick(RETRY), tips[0] ? `${pct} · ${tips[0]}` : `${pct} · ดูเส้นเฉลยบนกระดานนะคะ`);
      showChar(true);
      streak = 0;
      updateScore();
      AUDIO.sfx.pop();
    }

    recordResult(r.verdict);

    if (S.autoNext && r.verdict !== 'retry' && setCount < S.setLen) {
      timerId = setTimeout(() => newRound(true), 2200);
    }
  }

  /* ให้รางวัลเมื่อเขียนถูก */
  function reward(text) {
    score++;
    streak++;
    updateScore();
    praise(text);
    confettiBurst();
    AUDIO.sfx.cheer();

    showChar(true);
    if (current) board.setGuide(shownChar(current), S.guide === 'none' ? 'faint' : S.guide);

    if (!S.check) {
      timerId = setTimeout(() => {
        if (S.autoNext) newRound(true);
        else if (current) board.setGuide(shownChar(current), effectiveGuide());
      }, 1500);
    }
  }

  function updateScore() {
    $('scoreVal').textContent = score;
    $('streakVal').textContent = streak;
    save();
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
    $('scrim').addEventListener('click', () => {
      closeS();
      $('statsPanel').classList.remove('open');
      $('scrim').classList.remove('show');
    });

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

    // ---- ตัวอักษรและกระดาน ----
    document.querySelectorAll('#fontSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.font = b.dataset.font;
        setSeg('fontSeg', 'font', S.font);
        applyFont();
        AUDIO.sfx.pop();
        save();
      });
    });
    document.querySelectorAll('#lineSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.lineStyle = b.dataset.line;
        setSeg('lineSeg', 'line', S.lineStyle);
        board.lineStyle = S.lineStyle;
        board.drawGuide();
        AUDIO.sfx.pop();
        save();
      });
    });
    $('fontScale').addEventListener('input', (e) => {
      S.fontScale = +e.target.value;
      $('fontScaleVal').textContent = S.fontScale;
      board.fontScale = S.fontScale / 100;
      headCache.clear();
      applyStartDot();
      board.drawGuide();
      save();
    });
    $('optMirror').addEventListener('change', (e) => {
      S.mirror = e.target.checked;
      applyMirror();
      save();
    });

    // ---- เสียง ----
    $('optSfx').addEventListener('change', (e) => {
      S.sfx = e.target.checked;
      AUDIO.setSfx(S.sfx);
      if (S.sfx) AUDIO.sfx.ding();
      save();
    });
    $('repeatSec').addEventListener('input', (e) => {
      S.repeatSec = +e.target.value;
      applyRepeatLabel();
      scheduleRepeat();
      save();
    });
    $('voiceSel').addEventListener('change', (e) => {
      S.voice = e.target.value;
      AUDIO.setVoice(S.voice);
      sayCurrent();
      save();
    });

    // ---- ชุดฝึก ----
    $('optSession').addEventListener('change', (e) => {
      S.session = e.target.checked;
      startSet();
      save();
      toast(S.session ? `ฝึกเป็นชุดละ ${S.setLen} ตัวนะคะ 🎯` : 'ปิดโหมดฝึกเป็นชุดแล้วค่ะ');
    });
    document.querySelectorAll('#setLenSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.setLen = +b.dataset.len;
        setSeg('setLenSeg', 'len', S.setLen);
        startSet();
        AUDIO.sfx.pop();
        save();
      });
    });

    // ---- ตัวช่วยลำดับเส้น ----
    $('optStroke').addEventListener('change', (e) => {
      S.stroke = e.target.checked;
      applyStartDot();
      board.drawGuide();
      save();
    });

    // ---- หน้าสถิติ ----
    const openStats = () => {
      renderStats();
      $('settings').classList.remove('open');
      $('statsPanel').classList.add('open');
      $('scrim').classList.add('show');
    };
    const closeStats = () => {
      $('statsPanel').classList.remove('open');
      $('scrim').classList.remove('show');
    };
    $('statsBtn').addEventListener('click', openStats);
    $('closeStats').addEventListener('click', closeStats);
    $('resetStats').addEventListener('click', () => {
      if (STATS) STATS.reset();
      renderStats();
      toast('ล้างสถิติแล้วค่ะ');
    });
    $('practiceBtn').addEventListener('click', () => {
      const n = setFocus($('practiceBtn').dataset.chars || '');
      closeStats();
      if (!n) { toast('ไม่พบตัวอักษรเหล่านั้นในคลังค่ะ'); return; }
      startSet();
      newRound(true);
      toast(`ฝึกเฉพาะ ${n} ตัวที่ยังไม่คล่องนะคะ 🎯`);
    });

    // ---- สรุปผลชุดฝึก ----
    const hideSummary = () => { $('summary').hidden = true; };
    $('sumAgain').addEventListener('click', () => {
      hideSummary();
      focusPool = [];
      startSet();
      newRound(true);
    });
    $('sumFocus').addEventListener('click', () => {
      const n = setFocus($('sumFocus').dataset.chars || '');
      hideSummary();
      startSet();
      newRound(true);
      toast(n ? `ฝึกเฉพาะ ${n} ตัวที่ยังไม่คล่องนะคะ 🎯` : 'ไม่พบตัวอักษรเหล่านั้นค่ะ');
    });
    $('sumClose2').addEventListener('click', () => {
      hideSummary();
      focusPool = [];
      startSet();
    });

    // ---- คืนค่าเริ่มต้น ----
    $('resetAll').addEventListener('click', () => {
      S = { ...DEFAULTS, cats: [...DEFAULTS.cats] };
      focusPool = [];
      headCache.clear();
      save();
      applyAll();
      startSet();
      refreshPool();
      newRound(false);
      toast('คืนค่าเริ่มต้นให้แล้วค่ะ ✨');
    });

    // ตรวจลายมือ
    $('optCheck').addEventListener('change', (e) => {
      S.check = e.target.checked;
      applyCheckMode();
      save();
      toast(S.check ? 'จะตรวจให้ว่าเขียนถูกไหมนะคะ 🔍' : 'ปิดการตรวจแล้ว เขียนเล่นได้สบาย ๆ ค่ะ');
    });
    document.querySelectorAll('#strictSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        S.strict = b.dataset.strict;
        setSeg('strictSeg', 'strict', S.strict);
        applyStrict();
        AUDIO.sfx.pop();
        save();
      });
    });
    $('rangeGreat').addEventListener('input', (e) => {
      S.customGreat = +e.target.value;
      if (S.customClose > S.customGreat) S.customClose = S.customGreat;
      applyStrict();
      save();
    });
    $('rangeClose').addEventListener('input', (e) => {
      S.customClose = +e.target.value;
      if (S.customClose > S.customGreat) S.customGreat = S.customClose;
      applyStrict();
      save();
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

    board.onStrokeStart = () => {
      boardHint.classList.add('hide');
      hideResult();
    };

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

  function applyCheckMode() {
    $('doneBtn').textContent = S.check ? 'ตรวจให้หน่อย 🔍' : 'เขียนเสร็จแล้ว! ✅';
    if (!S.check) hideResult();
  }

  function applyLevel() {
    setSeg('levelSeg', 'level', S.level);
    setSeg('guideSeg', 'guide', S.guide);
    $('levelVal').textContent = S.level;
    $('levelNote').textContent = LEVEL_NOTE[S.level];
    $('showSec').value = S.showSec;
    $('showSecVal').textContent = S.showSec;
  }

  function applyStrict() {
    setSeg('strictSeg', 'strict', S.strict);
    $('customBox').hidden = S.strict !== 'custom';
    $('rangeGreat').value = S.customGreat;
    $('rangeClose').value = S.customClose;
    $('greatVal').textContent = S.customGreat;
    $('closeVal').textContent = S.customClose;
  }

  function applyFont() {
    headCache.clear();
    const family = FONTS[S.font] || FONTS.mali;
    board.guideFont = family;
    document.documentElement.style.setProperty('--char-font', family);
    setSeg('fontSeg', 'font', S.font);
    board.drawGuide();
  }

  function applyRepeatLabel() {
    $('repeatLabel').textContent = S.repeatSec ? 'อ่านซ้ำอัตโนมัติทุก' : 'อ่านซ้ำอัตโนมัติ:';
    $('repeatVal').textContent = S.repeatSec ? `${S.repeatSec} วินาที` : 'ปิด';
  }

  function applyMirror() {
    document.querySelector('.stage').classList.toggle('mirror', !!S.mirror);
    $('optMirror').checked = !!S.mirror;
  }

  /* รายชื่อเสียงอ่านภาษาไทยในเครื่อง (บาง iPad โหลดช้า จึงเรียกซ้ำได้) */
  function fillVoices() {
    const sel = $('voiceSel');
    if (!sel || !AUDIO.listVoices) return;
    const list = AUDIO.listVoices('th');
    const current = S.voice;
    sel.innerHTML = '<option value="">อัตโนมัติ</option>';
    list.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = v.name;
      sel.appendChild(o);
    });
    sel.value = list.some((v) => v.name === current) ? current : '';
    sel.parentElement.style.display = list.length ? '' : 'none';
  }

  /* ใส่ค่าที่ตั้งไว้ลงทุกส่วนของแอป */
  function applyAll() {
    board.color = S.color;
    board.size = S.size;
    board.penOnly = S.pen;
    board.usePressure = S.pressure;
    board.lineStyle = S.lineStyle;
    board.fontScale = S.fontScale / 100;

    $('optListen').checked = S.listenOnly;
    $('optAutoNext').checked = S.autoNext;
    $('optPressure').checked = S.pressure;
    $('optAutoClear').checked = S.autoClear;
    $('optCheck').checked = S.check;
    $('optSfx').checked = S.sfx;
    $('optSession').checked = S.session;
    $('optStroke').checked = S.stroke;
    $('rateRange').value = S.rate;
    $('rateVal').textContent = (+S.rate).toFixed(2);
    $('fontScale').value = S.fontScale;
    $('fontScaleVal').textContent = S.fontScale;
    $('repeatSec').value = S.repeatSec;
    applyRepeatLabel();
    $('listenOnlyBtn').classList.toggle('is-on', S.listenOnly);

    AUDIO.setRate(S.rate);
    AUDIO.setSfx(S.sfx);
    AUDIO.setVoice(S.voice);

    document.querySelectorAll('.size-btn').forEach((b) =>
      b.classList.toggle('is-active', +b.dataset.size === S.size)
    );
    document.querySelectorAll('#colorRow .color-btn').forEach((b, i) =>
      b.classList.toggle('is-active', PALETTE[i] === S.color)
    );
    document.querySelectorAll('#catChips .chip').forEach((b, i) => {
      const on = S.cats.includes(CATEGORIES[i].id);
      b.classList.toggle('is-active', on);
      b.style.background = on ? CATEGORIES[i].color : '';
    });

    setSeg('penSeg', 'pen', S.pen);
    setSeg('setLenSeg', 'len', S.setLen);
    setSeg('vowelSeg', 'vowel', S.vowelStyle);
    setSeg('lineSeg', 'line', S.lineStyle);
    applyStrict();
    applyCheckMode();
    applyFont();
    applyMirror();
    applyLevel();
    updateSetChip();
    updateScore();
  }

  /* ================= หน้าสถิติ ================= */
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  function renderStats() {
    if (!STATS) return;
    const days = STATS.lastDays(7);
    const totals = STATS.totals();
    const today = days[days.length - 1];
    $('stToday').textContent = today.done;
    $('stStreak').textContent = STATS.dayStreak();
    $('stTotal').textContent = totals.done;

    const max = Math.max(1, ...days.map((d) => d.done));
    const H = 96;   // ความสูงสูงสุดของแท่ง เหลือที่ให้ป้ายตัวเลขด้านบน
    $('chartBars').innerHTML = days.map((d) => {
      const h = d.done ? Math.max(3, Math.round((d.done / max) * H)) : 3;
      const cls = `bar${d.done ? '' : ' is-empty'}${d.isToday ? ' is-today' : ''}`;
      return `<div class="${cls}" title="${d.date} · ${d.done} ตัว">` +
             `${d.done ? `<b>${d.done}</b>` : ''}<i style="height:${h}px"></i></div>`;
    }).join('');
    $('chartLabels').innerHTML = days.map((d) =>
      `<span class="${d.isToday ? 'is-today' : ''}">${DOW[d.day]}</span>`).join('');

    const week = days.reduce((sum, d) => sum + d.done, 0);
    $('chartNote').textContent = week
      ? `7 วันนี้ฝึกไปแล้ว ${week} ตัว · วันนี้ ${today.done} ตัว`
      : 'ยังไม่มีข้อมูลใน 7 วันนี้ เริ่มฝึกกันเลยค่ะ';

    const need = STATS.needPractice(10);
    $('practiceList').innerHTML = need.length
      ? need.map((n) => `<div class="practice-item"><b>${n.ch}</b><span>${Math.round(n.rate * 100)}%</span></div>`).join('')
      : '<p class="empty-note">ยังไม่มีตัวที่ต้องฝึกเพิ่มเลยค่ะ เก่งมาก! 🎉</p>';
    $('practiceBtn').style.display = need.length ? '' : 'none';
    $('practiceBtn').dataset.chars = need.map((n) => n.ch).join('');
  }

  /* ================= เลขเวอร์ชัน ================= */
  function showVersion() {
    const v = window.KH_VERSION || {};
    const num = $('versionNum');
    const meta = $('versionMeta');
    if (!num) return;
    if (v.build > 0) {
      num.textContent = `เวอร์ชัน 1.0.${v.build}`;
      meta.textContent = [v.commit, v.date].filter(Boolean).join(' · ');
    } else {
      num.textContent = 'เวอร์ชันสำหรับพัฒนา';
      meta.textContent = 'dev';
    }
  }

  /* แจ้งเตือนเมื่อมีไฟล์เวอร์ชันใหม่ถูกดาวน์โหลดไว้แล้ว */
  function watchForUpdate(reg) {
    const notify = (worker) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('มีเวอร์ชันใหม่แล้วค่ะ ปิดแล้วเปิดแอปใหม่อีกครั้งนะคะ ✨');
        }
      });
    };
    if (reg.installing) notify(reg.installing);
    reg.addEventListener('updatefound', () => {
      if (reg.installing) notify(reg.installing);
    });
  }

  /* ================= เริ่มต้น ================= */
  function init() {
    buildChips();
    buildColors();
    applyAll();
    fillVoices();
    showVersion();
    refreshPool();
    bindUI();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', fillVoices);
      setTimeout(fillVoices, 1200);
    }

    // เตรียมรอบแรกไว้เบื้องหลัง (ยังไม่ออกเสียงจนกว่าจะกดเริ่ม)
    newRound(false);
    board.drawGuide();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js')
        .then(watchForUpdate)
        .catch(() => { /* ไม่เป็นไร */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
