/* ------------------------------------------------------------------
 * audio.js — เสียงพูด (Web Speech API) + เสียงประกอบ (Web Audio API)
 * iOS/iPadOS ต้องปลดล็อกเสียงด้วยการแตะครั้งแรกก่อน จึงมี unlock()
 * ------------------------------------------------------------------ */
(function () {
  let ctx = null;
  let unlocked = false;
  let voices = [];
  let rate = 0.85;

  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
  }
  loadVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = lang.toLowerCase();
    const base = want.split('-')[0];
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase() === want) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().replace('_', '-') === want) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base)) ||
      null
    );
  }

  function unlock() {
    if (unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = ctx || new AC();
        if (ctx.state === 'suspended') ctx.resume();
        // เสียงเงียบสั้น ๆ เพื่อปลดล็อกลำโพงบน iOS
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(g).connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.02);
      }
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      unlocked = true;
    } catch (e) {
      /* เงียบไว้ ไม่ให้แอปพัง */
    }
  }

  /* ----- เสียงพูด ----- */
  function speak(text, lang = 'th-TH', onEnd) {
    if (!('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return false;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      u.pitch = 1.15;
      const v = pickVoice(lang);
      if (v) u.voice = v;
      if (onEnd) u.onend = onEnd;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      if (onEnd) onEnd();
      return false;
    }
  }

  function hasVoiceFor(lang) {
    return !!pickVoice(lang);
  }

  function setRate(r) { rate = r; }

  /* ----- เสียงประกอบสังเคราะห์ ----- */
  function tone(freq, start, dur, type = 'sine', vol = 0.18) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }

  const sfx = {
    ding() { tone(880, 0, 0.18, 'triangle'); tone(1320, 0.08, 0.25, 'triangle'); },
    cheer() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.16));
    },
    pop() { tone(660, 0, 0.09, 'sine', 0.12); },
    swoosh() { tone(320, 0, 0.12, 'sine', 0.08); tone(480, 0.06, 0.12, 'sine', 0.08); },
    tick() { tone(1200, 0, 0.04, 'square', 0.05); },
  };

  window.KH_AUDIO = { unlock, speak, sfx, setRate, hasVoiceFor, get unlocked() { return unlocked; } };
})();
