// 抽出タイマー：茶葉ごとの蒸らし時間を計り、終わったらチャイムを鳴らす

const Timer = (() => {
  const s = { cfg: null, endAt: 0, remaining: null, running: false, done: false, consumed: false };
  const subs = new Set();
  const emit = () => subs.forEach(f => f());

  function duration() {
    return s.cfg ? Number(s.cfg.seconds) * 1000 : 0;
  }

  function left() {
    if (!s.cfg) return 0;
    if (s.running) return Math.max(0, s.endAt - Date.now());
    return s.remaining ?? duration();
  }

  function setup(cfg) {
    s.cfg = { ...cfg };
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
    Chime.unlock();
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
    Chime.stop();
    s.running = false;
    s.remaining = null;
    s.done = false;
    emit();
  }

  function askNotify() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function alarm() {
    Chime.play();
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
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
    state: s, duration, left, setup, update, start, pause, reset,
    markConsumed() { s.consumed = true; },
    subscribe: f => subs.add(f),
  };
})();

// 完了チャイム
// iPhone はマナーモード中に Web Audio の音が消えるため、<audio> 要素で再生する。
// また、操作をきっかけにしない再生はブロックされるので、スタートを押したときに無音を再生して再生許可を得ておく。
const Chime = (() => {
  const RATE = 22050;
  const MAX_RING_MS = 60 * 1000; // 閉じるまで鳴らし続ける上限
  let player = null, chimeUrl = null, silentUrl = null, stopTimer = null;

  // 16bit モノラルの WAV を作る
  function wav(samples) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  // 「ピン・ポン」と鳴るベル風の音（2秒で1回。ループ再生で繰り返す）
  function makeChime() {
    const out = new Float32Array(RATE * 2);
    const bell = (freq, at) => {
      const start = Math.floor(at * RATE);
      for (let i = 0; start + i < out.length; i++) {
        const t = i / RATE;
        const env = Math.exp(-t * 3.2) * Math.min(1, t * 200);
        out[start + i] += env * (0.55 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 2.01 * t));
      }
    };
    bell(1318.5, 0);    // ミ
    bell(1046.5, 0.4);  // ド
    return wav(Array.from(out));
  }

  function ensure() {
    if (player) return;
    player = new Audio();
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
    chimeUrl = makeChime();
    silentUrl = wav(new Array(Math.floor(RATE * 0.2)).fill(0));
  }

  function unlock() {
    try {
      ensure();
      player.loop = false;
      player.src = silentUrl;
      player.play().catch(() => {});
    } catch (e) { /* 再生できない環境では無音 */ }
  }

  function play() {
    try {
      ensure();
      clearTimeout(stopTimer);
      player.src = chimeUrl;
      player.loop = true;
      player.currentTime = 0;
      player.play().catch(() => {});
      stopTimer = setTimeout(stop, MAX_RING_MS);
    } catch (e) { /* 再生できない環境では無音 */ }
  }

  function stop() {
    clearTimeout(stopTimer);
    if (player) { player.loop = false; player.pause(); }
  }

  return { unlock, play, stop };
})();
