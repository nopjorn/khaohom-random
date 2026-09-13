/* ------------------------------------------------------------------
 * board.js — กระดานเขียน 2 ชั้น
 *   ชั้นล่าง (guide) : เส้นบรรทัด + ตัวอักษรจาง ๆ ให้เขียนทับ
 *   ชั้นบน  (ink)    : ลายเส้นของเด็ก
 * รองรับ Pointer Events: แรงกด (pressure) และองศาเอียง (tilt) ของ
 * Apple Pencil / Apple Pencil Pro รวมถึงการกันฝ่ามือแตะโดน
 * ------------------------------------------------------------------ */
(function () {
  class Board {
    constructor(wrap, guideCanvas, inkCanvas, checkCanvas) {
      this.wrap = wrap;
      this.guide = guideCanvas;
      this.ink = inkCanvas;
      this.check = checkCanvas || null;
      this.gctx = guideCanvas.getContext('2d');
      this.ictx = inkCanvas.getContext('2d');
      this.cctx = this.check ? this.check.getContext('2d') : null;

      this.strokes = [];
      this.redoStack = [];
      this.current = null;
      this.activeId = null;

      this.color = '#2d3436';
      this.size = 14;
      this.eraser = false;
      this.penOnly = 'auto';      // 'auto' | 'on' | 'off'
      this.sawPen = false;
      this.usePressure = true;

      this.guideText = '';
      this.guideMode = 'trace';   // 'trace' | 'faint' | 'none'
      this.showLines = true;
      this.guideFont = '"Mali", "Sarabun", "Noto Sans Thai", sans-serif';
      this.accent = '#ee5a6f';

      this.onStrokeStart = null;
      this.onStrokeEnd = null;

      this._bind();
      this.resize();
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.wrap);
    }

    /* ---------- ขนาด / ความคมชัด ---------- */
    resize() {
      const r = this.wrap.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      [this.guide, this.ink, this.check].filter(Boolean).forEach((c) => {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
        c.style.width = r.width + 'px';
        c.style.height = r.height + 'px';
      });
      [this.gctx, this.ictx, this.cctx].filter(Boolean).forEach((c) => c.setTransform(dpr, 0, 0, dpr, 0, 0));
      this.w = r.width;
      this.h = r.height;
      this.drawGuide();
      this.redraw();
    }

    /* ---------- ชั้นตัวอย่าง ---------- */
    setGuide(text, mode) {
      this.guideText = text || '';
      if (mode) this.guideMode = mode;
      this.drawGuide();
    }

    setGuideMode(mode) { this.guideMode = mode; this.drawGuide(); }

    drawGuide() {
      const ctx = this.gctx;
      if (!this.w) return;
      ctx.clearRect(0, 0, this.w, this.h);

      const midY = this.h / 2;
      if (this.showLines) {
        const top = midY - this.h * 0.28;
        const bottom = midY + this.h * 0.28;
        // บรรทัดบน/ล่าง
        ctx.save();
        ctx.strokeStyle = 'rgba(99,110,150,0.28)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        [top, bottom].forEach((y) => {
          ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(this.w - 24, y); ctx.stroke();
        });
        // เส้นกึ่งกลางประ
        ctx.strokeStyle = 'rgba(99,110,150,0.22)';
        ctx.setLineDash([10, 12]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(24, midY); ctx.lineTo(this.w - 24, midY); ctx.stroke();
        ctx.restore();
      }

      if (!this.guideText || this.guideMode === 'none') return;

      ctx.save();
      const fontSize = this._fitText(ctx, this.guideText);

      if (this.guideMode === 'trace') {
        // ตัวโปร่ง: ไส้จาง ๆ + เส้นขอบชัด ให้ลากทับได้ง่าย
        ctx.fillStyle = this._alpha(this.accent, 0.12);
        ctx.fillText(this.guideText, this.w / 2, midY);
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, fontSize * 0.016);
        ctx.setLineDash([]);
        ctx.strokeStyle = this._alpha(this.accent, 0.5);
        ctx.strokeText(this.guideText, this.w / 2, midY);
      } else if (this.guideMode === 'faint') {
        ctx.fillStyle = this._alpha(this.accent, 0.14);
        ctx.fillText(this.guideText, this.w / 2, midY);
      }
      ctx.restore();
    }

    /* ตั้งฟอนต์ให้ตัวอักษรพอดีกับกระดาน แล้วคืนขนาดที่ใช้ */
    _fitText(ctx, text) {
      let fontSize = this.h * 0.52;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fit = () => {
        ctx.font = `700 ${fontSize}px ${this.guideFont}`;
        return ctx.measureText(text).width;
      };
      const width = fit();
      const maxW = this.w * 0.82;
      if (width > maxW) { fontSize *= maxW / width; fit(); }
      return fontSize;
    }

    /* ภาพตัวอักษรที่ถูกต้อง (ทึบล้วน) ไว้ให้ตัวตรวจลายมือเทียบ */
    targetCanvas(text) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(this.w));
      c.height = Math.max(1, Math.round(this.h));
      const ctx = c.getContext('2d');
      this._fitText(ctx, text);
      ctx.fillStyle = '#000';
      ctx.fillText(text, c.width / 2, c.height / 2);
      return c;
    }

    /* วาดเฉลยทับลายมือชั่วคราว ให้เห็นว่าตรงไหนตรง ตรงไหนเพี้ยน */
    showAnswer(text, color) {
      if (!this.check || !this.w) return;
      const ctx = this.cctx;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.save();
      const fontSize = this._fitText(ctx, text);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.5, fontSize * 0.02);
      ctx.strokeStyle = color;
      ctx.setLineDash([]);
      ctx.strokeText(text, this.w / 2, this.h / 2);
      ctx.restore();
    }

    clearAnswer() {
      if (this.check && this.w) this.cctx.clearRect(0, 0, this.w, this.h);
    }

    _alpha(hex, a) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    /* ---------- การวาด ---------- */
    _bind() {
      const c = this.ink;
      c.style.touchAction = 'none';
      c.addEventListener('pointerdown', (e) => this._down(e));
      c.addEventListener('pointermove', (e) => this._move(e));
      c.addEventListener('pointerup', (e) => this._up(e));
      c.addEventListener('pointercancel', (e) => this._up(e));
      c.addEventListener('pointerleave', (e) => this._up(e));
      // กันท่าทางซูม/เลื่อนของ Safari ขณะเขียน
      ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
        c.addEventListener(t, (e) => e.preventDefault())
      );
    }

    _accept(e) {
      if (e.pointerType === 'pen') { this.sawPen = true; return true; }
      if (this.penOnly === 'on') return false;
      if (this.penOnly === 'auto' && this.sawPen && e.pointerType === 'touch') return false;
      return true;
    }

    _pos(e) {
      const r = this.ink.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _width(e) {
      let w = this.size;
      if (this.usePressure && e.pointerType === 'pen') {
        const p = e.pressure > 0 ? e.pressure : 0.5;
        w = this.size * (0.35 + 1.15 * p);
        // เอียงปากกามาก = เส้นหนาขึ้นเล็กน้อย (เหมือนดินสอตะแคง)
        const tilt = Math.min(1, (Math.abs(e.tiltX || 0) + Math.abs(e.tiltY || 0)) / 120);
        w *= 1 + tilt * 0.45;
      }
      return Math.max(1.5, w);
    }

    _down(e) {
      if (!this._accept(e)) return;
      if (this.activeId !== null) return;
      e.preventDefault();
      this.activeId = e.pointerId;
      try { this.ink.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      const p = this._pos(e);
      this.current = {
        color: this.color,
        eraser: this.eraser,
        pts: [{ ...p, w: this._width(e) }],
      };
      this.redoStack = [];
      if (this.onStrokeStart) this.onStrokeStart();
    }

    _move(e) {
      if (this.activeId !== e.pointerId || !this.current) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach((ev) => {
        const p = this._pos(ev);
        const pts = this.current.pts;
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 0.7) return;
        pts.push({ ...p, w: this._width(ev) });
        this._drawSegment(this.current, pts.length - 1);
      });
    }

    _up(e) {
      if (this.activeId !== e.pointerId) return;
      this.activeId = null;
      try { this.ink.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
      if (this.current && this.current.pts.length) {
        if (this.current.pts.length === 1) this._drawDot(this.current);
        this.strokes.push(this.current);
      }
      this.current = null;
      if (this.onStrokeEnd) this.onStrokeEnd();
    }

    _style(ctx, stroke) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (stroke.eraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
      }
    }

    _drawDot(stroke) {
      const ctx = this.ictx;
      const p = stroke.pts[0];
      this._style(ctx, stroke);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.w / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* วาดช่วงเส้นแบบเรียบด้วยเส้นโค้งผ่านจุดกึ่งกลาง */
    _drawSegment(stroke, i) {
      const ctx = this.ictx;
      const pts = stroke.pts;
      if (i < 1) return;
      const p0 = pts[i - 2] || pts[i - 1];
      const p1 = pts[i - 1];
      const p2 = pts[i];
      this._style(ctx, stroke);
      ctx.lineWidth = (p1.w + p2.w) / 2;
      ctx.beginPath();
      const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      ctx.moveTo(m0.x, m0.y);
      ctx.quadraticCurveTo(p1.x, p1.y, m1.x, m1.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    redraw() {
      if (!this.w) return;
      this.ictx.clearRect(0, 0, this.w, this.h);
      this.strokes.forEach((s) => {
        if (s.pts.length === 1) { this._drawDot(s); return; }
        for (let i = 1; i < s.pts.length; i++) this._drawSegment(s, i);
      });
    }

    undo() {
      if (!this.strokes.length) return false;
      this.redoStack.push(this.strokes.pop());
      this.redraw();
      return true;
    }

    redo() {
      if (!this.redoStack.length) return false;
      this.strokes.push(this.redoStack.pop());
      this.redraw();
      return true;
    }

    clear() {
      this.strokes = [];
      this.redoStack = [];
      this.current = null;
      this.redraw();
    }

    isEmpty() { return this.strokes.length === 0; }

    /* รวมสองชั้นเป็นภาพเดียว (ใช้บันทึกผลงาน) */
    toDataURL(bg = '#ffffff') {
      const out = document.createElement('canvas');
      out.width = this.ink.width;
      out.height = this.ink.height;
      const o = out.getContext('2d');
      o.fillStyle = bg;
      o.fillRect(0, 0, out.width, out.height);
      o.drawImage(this.guide, 0, 0);
      o.drawImage(this.ink, 0, 0);
      if (this.check) o.drawImage(this.check, 0, 0);
      return out.toDataURL('image/png');
    }
  }

  window.KH_Board = Board;
})();
