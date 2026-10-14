// 抽出タイマー：茶葉ごとの設定と、2煎目以降の時間延長に対応

const Timer = (() => {
  const s = { cfg: null, steep: 1, endAt: 0, remaining: null, running: false, done: false, consumed: false };
  const subs = new Set();
  let audioCtx = null;

  const emit = () => subs.forEach(f => f());

  function duration() {
    if (!s.cfg) return 0;
    return (Number(s.cfg.seconds) + Number(s.cfg.increment || 0) * (s.steep - 1)) * 1000;
  }

  function left() {
    if (!s.cfg) return 0;
    if (s.running) return Math.max(0, s.endAt - Date.now());
    return s.remaining ?? duration();
  }

  function setup(cfg) {
    s.cfg = { ...cfg };
    s.steep = 1;
    s.consumed = false;
    reset();
  }

  // 設定値の変更（停止中なら残り時間も新しい設定に合わせる）
  function update(patch) {
    if (!s.cfg) return;
    Object.assign(s.cfg, patch);
    if (!s.running) s.remaining = null;
  }

  function start() {
    if (!s.cfg || s.done) return;
    unlockAudio();
    askNotify();
    s.endAt = Date.now() + (s.remaining ?? duration());
    s.remaining = null;
    s.running = true;
    emit();
  }

  function pause() {
    if (!s.running) return;
    s.remaining = Math.max(0, s.endAt - Date.now());
    s.running = false;
    emit();
  }

  function reset() {
    s.running = false;
    s.remaining = null;
    s.done = false;
    emit();
  }

  function next() {
    s.steep++;
    reset();
  }

  function prev() {
    if (s.steep <= 1) return;
    s.steep--;
    reset();
  }

  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }

  function askNotify() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function alarm() {
    if (audioCtx) {
      [0, 0.35, 0.7].forEach(t => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, audioCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.25);
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t);
        o.stop(audioCtx.currentTime + t + 0.3);
      });
    }
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('お茶が入りました', { body: s.cfg ? s.cfg.label : '' }); } catch (e) { /* 一部環境では使えない */ }
    }
  }

  setInterval(() => {
    if (s.running && Date.now() >= s.endAt) {
      s.running = false;
      s.remaining = 0;
      s.done = true;
      alarm();
      emit();
    }
  }, 200);

  return {
    state: s, duration, left, setup, update, start, pause, reset, next, prev,
    markConsumed() { s.consumed = true; },
    subscribe: f => subs.add(f),
  };
})();
