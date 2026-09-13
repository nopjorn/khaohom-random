/* ------------------------------------------------------------------
 * stats.js — เก็บสถิติการฝึกไว้ในเครื่อง (localStorage)
 * ------------------------------------------------------------------
 *   days  : จำนวนที่ฝึกในแต่ละวัน ย้อนหลัง 60 วัน
 *   chars : สถิติรายตัวอักษร ใช้บอกว่าตัวไหนควรฝึกเพิ่ม
 * ------------------------------------------------------------------ */
(function () {
  const KEY = 'khaohom-stats-v1';
  const KEEP_DAYS = 60;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { days: raw.days || {}, chars: raw.chars || {} };
    } catch (e) {
      return { days: {}, chars: {} };
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* โหมดส่วนตัวอาจเซฟไม่ได้ */ }
  }

  const key = (d) => {
    const t = d || new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };

  /* บันทึกผลหนึ่งครั้ง verdict: great | close | retry | done (ตอนปิดการตรวจ) */
  function record(ch, verdict) {
    const data = load();
    const k = key();
    const day = data.days[k] || { done: 0, great: 0, close: 0, retry: 0 };
    day.done++;
    if (day[verdict] !== undefined) day[verdict]++;
    data.days[k] = day;

    if (ch) {
      const c = data.chars[ch] || { tries: 0, great: 0, close: 0, retry: 0 };
      c.tries++;
      if (c[verdict] !== undefined) c[verdict]++;
      data.chars[ch] = c;
    }

    // เก็บแค่ 60 วันล่าสุด
    const keys = Object.keys(data.days).sort();
    while (keys.length > KEEP_DAYS) delete data.days[keys.shift()];

    save(data);
    return day;
  }

  /* ข้อมูล 7 วันล่าสุด เรียงจากเก่าไปใหม่ */
  function lastDays(n = 7) {
    const data = load();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = key(d);
      const day = data.days[k] || { done: 0, great: 0, close: 0, retry: 0 };
      out.push({ date: k, day: d.getDay(), ...day, isToday: i === 0 });
    }
    return out;
  }

  /* จำนวนวันติดต่อกันที่ฝึก (นับถอยหลังจากวันนี้ หรือเมื่อวาน) */
  function dayStreak() {
    const data = load();
    let streak = 0;
    for (let i = 0; i < KEEP_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = data.days[key(d)];
      if (day && day.done > 0) streak++;
      else if (i > 0) break;          // วันนี้ยังไม่ได้ฝึกก็ยังนับต่อเนื่องของเมื่อวานได้
    }
    return streak;
  }

  /* ตัวอักษรที่ควรฝึกเพิ่ม เรียงจากอัตราผ่านต่ำสุด */
  function needPractice(limit = 8) {
    const data = load();
    return Object.entries(data.chars)
      .filter(([, c]) => c.tries >= 1 && c.great < c.tries)
      .map(([ch, c]) => ({ ch, ...c, rate: c.great / c.tries }))
      .sort((a, b) => a.rate - b.rate || b.tries - a.tries)
      .slice(0, limit);
  }

  function totals() {
    const data = load();
    let done = 0, great = 0;
    Object.values(data.days).forEach((d) => { done += d.done; great += d.great; });
    return { done, great, chars: Object.keys(data.chars).length };
  }

  function reset() {
    save({ days: {}, chars: {} });
  }

  window.KH_Stats = { record, lastDays, dayStreak, needPractice, totals, reset, todayKey: key };
})();
