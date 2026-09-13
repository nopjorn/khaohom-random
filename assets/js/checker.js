/* ------------------------------------------------------------------
 * checker.js — ตรวจลายมือด้วยการเทียบรูปร่าง (ทำงานในเครื่องล้วน ๆ)
 * ------------------------------------------------------------------
 * วิธีทำงาน
 *   1. แปลงทั้ง "ตัวอย่างที่ถูกต้อง" และ "ลายมือเด็ก" เป็นแผนที่ความหนาแน่น
 *      40x40 ช่อง โดยย่อ-ขยายให้พอดีกรอบและจัดกึ่งกลาง เด็กจึงเขียนใหญ่/เล็ก/
 *      เยื้องตรงไหนก็ได้ ไม่ถูกหักคะแนน
 *   2. เบลอเล็กน้อย เพื่อไม่ให้เส้นเบี้ยวไปนิดเดียวแล้วคะแนนตก
 *   3. หารด้วยผลรวม ทำให้ปากกาหนาหรือบางไม่มีผลต่อคะแนน
 *   4. คิดคะแนนจาก histogram intersection ผสมกับ soft IoU
 *
 * เกณฑ์ผ่านได้จากการทดลองกับลายมือจำลองหลายแบบ (เขียนเป๊ะ เบี้ยวน้อย
 * เบี้ยวมาก ผิดตัว เขียนมั่ว ขีดเส้นเดียว) ดูสรุปได้ใน README
 *
 * ข้อจำกัดที่ต้องรู้: ตรวจเฉพาะ "รูปร่างโดยรวม" ไม่ได้ตรวจลำดับเส้น
 * และตัวที่รูปร่างใกล้กันมาก (ค/ด, ต/ด, บ/ป) อาจตัดสินพลาดได้
 * ------------------------------------------------------------------ */
(function () {
  const N = 40;        // ความละเอียดแผนที่ที่ใช้เทียบ
  const PAD = 3;       // ขอบว่างรอบตัวอักษร
  const ALPHA = 40;    // ความทึบขั้นต่ำที่นับว่าเป็นเส้น
  const NEAR = 2;      // ระยะที่ถือว่า "เส้นทับกัน" ตอนดูความครบถ้วน

  /* เกณฑ์ตัดสินสำเร็จรูป: [ถูกต้องเลย, ใกล้เคียง] */
  const LEVELS = {
    easy:   [0.58, 0.45],
    normal: [0.65, 0.52],
    strict: [0.72, 0.60],
  };

  /* รับได้ทั้งชื่อระดับ ('easy') และเกณฑ์ที่ตั้งเอง ({ great: 0.6, close: 0.5 }) */
  function resolveLevel(level) {
    if (level && typeof level === 'object') {
      const great = Math.min(0.98, Math.max(0.05, +level.great || LEVELS.easy[0]));
      const close = Math.min(great, Math.max(0.02, +level.close || LEVELS.easy[1]));
      return [great, close];
    }
    return LEVELS[level] || LEVELS.easy;
  }

  /* ---- แผนที่ความหนาแน่นของหมึก (คงสัดส่วน จัดกึ่งกลาง) ---- */
  function density(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return null;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = -1, maxY = -1, pixels = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] <= ALPHA) continue;
        pixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const span = N - PAD * 2;
    const sc = span / Math.max(bw, bh);
    const ox = PAD + (span - bw * sc) / 2;
    const oy = PAD + (span - bh * sc) / 2;

    const map = new Float32Array(N * N);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (d[(y * w + x) * 4 + 3] <= ALPHA) continue;
        const gx = Math.min(N - 1, Math.floor(ox + (x - minX) * sc));
        const gy = Math.min(N - 1, Math.floor(oy + (y - minY) * sc));
        map[gy * N + gx] += 1;
      }
    }
    return { map, pixels, bw, bh, srcW: w, srcH: h };
  }

  function blur(m, times) {
    let cur = m;
    for (let t = 0; t < times; t++) {
      const out = new Float32Array(N * N);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          let sum = 0, weight = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const X = x + dx, Y = y + dy;
              if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
              const wgt = dx === 0 && dy === 0 ? 4 : 1;
              sum += cur[Y * N + X] * wgt;
              weight += wgt;
            }
          }
          out[y * N + x] = sum / weight;
        }
      }
      cur = out;
    }
    return cur;
  }

  function normalize(m) {
    let sum = 0;
    for (let i = 0; i < m.length; i++) sum += m[i];
    const out = new Float32Array(m.length);
    if (sum > 0) for (let i = 0; i < m.length; i++) out[i] = m[i] / sum;
    return out;
  }

  /* สัดส่วนของช่องที่มีหมึกใน a ซึ่งมีหมึกของ b อยู่ใกล้ ๆ (ใช้บอกว่าเขียนครบ/เกิน) */
  function nearRatio(a, b) {
    let total = 0, hit = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (a[y * N + x] <= 0) continue;
        total++;
        let found = false;
        for (let dy = -NEAR; dy <= NEAR && !found; dy++) {
          for (let dx = -NEAR; dx <= NEAR && !found; dx++) {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
            if (b[Y * N + X] > 0) found = true;
          }
        }
        if (found) hit++;
      }
    }
    return total ? hit / total : 0;
  }

  /* ------------------------------------------------------------------
   * check(inkCanvas, targetCanvas, level)
   *   verdict: 'great' ถูกต้อง | 'close' ใกล้เคียง | 'retry' ยังไม่เหมือน
   *            'empty' ยังไม่ได้เขียน | 'too-small' เขียนเล็กเกินไป
   * ------------------------------------------------------------------ */
  function check(inkCanvas, targetCanvas, level) {
    const target = density(targetCanvas);
    const ink = density(inkCanvas);
    if (!target) return { verdict: 'no-target', score: 0, percent: 0, stars: 0 };
    if (!ink) return { verdict: 'empty', score: 0, percent: 0, stars: 0 };

    // เล็กเกินกว่าจะเทียบได้ เช่น แตะจุดเดียวหรือขีดสั้นจิ๋ว
    const area = (ink.bw / ink.srcW) * (ink.bh / ink.srcH);
    if (ink.pixels < 300 || area < 0.005) {
      return { verdict: 'too-small', score: 0, percent: 0, stars: 0 };
    }

    const a = normalize(blur(ink.map, 2));
    const b = normalize(blur(target.map, 2));
    let mn = 0, mx = 0;
    for (let i = 0; i < a.length; i++) {
      mn += Math.min(a[i], b[i]);
      mx += Math.max(a[i], b[i]);
    }
    const hist = mn;                    // ความหนาแน่นตรงกันแค่ไหน
    const siou = mx ? mn / mx : 0;      // ทับกันแค่ไหนเมื่อเทียบกับพื้นที่รวม
    const score = (hist + siou) / 2;

    const [passGreat, passClose] = resolveLevel(level);
    const verdict = score >= passGreat ? 'great' : score >= passClose ? 'close' : 'retry';

    return {
      verdict,
      score: +score.toFixed(4),
      percent: Math.max(0, Math.min(100, Math.round(score * 125))),  // แปลงเป็น % ให้ดูเข้าใจง่าย
      stars: verdict === 'great' ? 3 : verdict === 'close' ? 2 : 1,
      complete: +nearRatio(target.map, ink.map).toFixed(3),   // เขียนครบไหม
      neat: +nearRatio(ink.map, target.map).toFixed(3),       // มีเส้นเกินไหม
    };
  }

  /* ------------------------------------------------------------------
   * findHead(targetCanvas) — หา "หัว" ของตัวอักษรไทย
   * ตัวอักษรไทยเริ่มเขียนจากหัวเสมอ หัวคือรูวงกลมเล็ก ๆ ที่ปิดล้อมอยู่ในตัวอักษร
   * จึงหาได้ด้วยการไล่ระบายพื้นหลังจากขอบเข้ามา ส่วนที่เหลือคือรูในตัวอักษร
   * แล้วเลือกรูที่เล็กและกลมที่สุด คืนพิกัดเป็นสัดส่วน 0..1 ของ canvas
   * ถ้าไม่เจอรูที่เข้าเกณฑ์ (เช่น ตัวเลข A-Z หรือคำยาว ๆ) คืน null
   * ------------------------------------------------------------------ */
  function findHead(canvas) {
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return null;
    const step = Math.max(1, Math.round(H / 140));        // ย่อความละเอียดให้คำนวณเร็ว
    const w = Math.floor(W / step);
    const h = Math.floor(H / step);
    const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;

    const ink = new Uint8Array(w * h);
    let minX = w, minY = h, maxX = -1, maxY = -1, inkCount = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = src[((y * step) * W + x * step) * 4 + 3];
        if (a > ALPHA) {
          ink[y * w + x] = 1;
          inkCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || !inkCount) return null;
    const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);

    // ระบายพื้นหลังจากขอบเข้ามา ช่องที่ไม่โดนระบายคือรูในตัวอักษร
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
    for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (seen[i] || ink[i]) continue;
      seen[i] = 1;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }

    // จัดกลุ่มรู แล้วเลือกรูที่เล็ก กลม และอยู่ค่อนไปทางขอบตัวอักษร
    let best = null;
    for (let y0 = 0; y0 < h; y0++) {
      for (let x0 = 0; x0 < w; x0++) {
        const i0 = y0 * w + x0;
        if (seen[i0] || ink[i0]) continue;
        let area = 0, sx = 0, sy = 0;
        let hx0 = x0, hx1 = x0, hy0 = y0, hy1 = y0;
        const q = [x0, y0];
        seen[i0] = 1;
        while (q.length) {
          const y = q.pop();
          const x = q.pop();
          area++; sx += x; sy += y;
          if (x < hx0) hx0 = x; if (x > hx1) hx1 = x;
          if (y < hy0) hy0 = y; if (y > hy1) hy1 = y;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h) return;
            const i = Y * w + X;
            if (seen[i] || ink[i]) return;
            seen[i] = 1;
            q.push(X, Y);
          });
        }
        const ratio = area / bboxArea;
        const bw = hx1 - hx0 + 1;
        const bh = hy1 - hy0 + 1;
        const roundness = Math.min(bw, bh) / Math.max(bw, bh);
        // หัวต้องเป็นรูเล็ก ๆ ค่อนข้างกลม ไม่ใช่ช่องว่างใหญ่กลางตัวอักษร
        if (ratio > 0.055 || ratio < 0.0008 || roundness < 0.45) continue;
        if (!best || area < best.area) {
          best = { area, x: (sx / area) * step, y: (sy / area) * step };
        }
      }
    }
    if (!best) return null;
    return { x: best.x / W, y: best.y / H, size: Math.sqrt(best.area) * step / H };
  }

  window.KH_Checker = { check, findHead, LEVELS, resolveLevel };
})();
