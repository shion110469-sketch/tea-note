// 抽出タイマー：茶葉ごとの蒸らし時間を計り、終わったらチャイムとバイブで知らせる

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

  // スタートボタンの操作中に呼ばれる（音の再生許可はこのときに得る）
  function start() {
    if (!s.cfg || s.done) return;
    askNotify();
    const ms = s.remaining ?? duration();
    s.endAt = Date.now() + ms;
    s.remaining = null;
    s.running = true;
    Chime.schedule(ms);
    emit();
  }

  function pause() {
    if (!s.running) return;
    s.remaining = Math.max(0, s.endAt - Date.now());
    s.running = false;
    Chime.stop();
    emit();
  }

  function reset() {
    Chime.stop();
    Buzz.stop();
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
    Chime.ensureRinging();
    Buzz.start();
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

const RING_LIMIT_SEC = 60; // 閉じるまで鳴らし続ける上限

// 完了チャイム（Web Audio）
// - iPhone ではマナーモード（消音スイッチ）に従い、マナーモード中は鳴らない
// - スタート時に終了時刻へ再生を予約するので、タイマー処理が遅れても時間どおりに鳴る
const Chime = (() => {
  let ctx = null, buffer = null, source = null, startAt = 0;

  // 「ピン・ポン」と鳴るベル風の音（2秒で1回。ループ再生で繰り返す）
  function makeBuffer() {
    const rate = ctx.sampleRate;
    const b = ctx.createBuffer(1, rate * 2, rate);
    const out = b.getChannelData(0);
    const bell = (freq, at) => {
      const from = Math.floor(at * rate);
      for (let i = 0; from + i < out.length; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 3.2) * Math.min(1, t * 200);
        out[from + i] += env * (0.55 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 2.01 * t));
      }
    };
    bell(1318.5, 0);    // ミ
    bell(1046.5, 0.4);  // ド
    return b;
  }

  function ready() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!buffer) buffer = makeBuffer();
    return true;
  }

  function playAt(at) {
    stop();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    source.connect(gain).connect(ctx.destination);
    source.start(at);
    source.stop(at + RING_LIMIT_SEC);
    startAt = at;
  }

  function schedule(ms) {
    try {
      if (!ready()) return;
      // iPhone で音を出せる状態にするため、操作中に無音を一度鳴らす
      const unlock = ctx.createBufferSource();
      unlock.buffer = ctx.createBuffer(1, 1, 22050);
      unlock.connect(ctx.destination);
      unlock.start(0);
      playAt(ctx.currentTime + ms / 1000);
    } catch (e) { /* 再生できない環境では無音 */ }
  }

  // 終了時に呼ぶ。画面が裏に回っていた等で予約がずれていたら、今すぐ鳴らし直す
  function ensureRinging() {
    try {
      if (!ready()) return;
      if (!source || startAt - ctx.currentTime > 0.3) playAt(ctx.currentTime);
    } catch (e) { /* 再生できない環境では無音 */ }
  }

  function stop() {
    if (!source) return;
    try { source.stop(); } catch (e) { /* 再生前でも止められる */ }
    source.disconnect();
    source = null;
  }

  return { schedule, ensureRinging, stop };
})();

// 完了時のバイブ
// - Android：Vibration API で振動させる
// - iPhone：Web には振動の機能がないため、iOS 18 以降で使える「スイッチ切り替え時の軽い振動」で代用する
const Buzz = (() => {
  let loop = null, stopTimer = null;

  function iosTick() {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  }

  function once() {
    if (navigator.vibrate) { navigator.vibrate([400, 150, 400]); return; }
    [0, 180, 360].forEach(t => setTimeout(iosTick, t));
  }

  function start() {
    stop();
    once();
    loop = setInterval(once, 2000);            // チャイムに合わせて2秒ごと
    stopTimer = setTimeout(stop, RING_LIMIT_SEC * 1000);
  }

  function stop() {
    clearInterval(loop);
    clearTimeout(stopTimer);
    loop = stopTimer = null;
    if (navigator.vibrate) navigator.vibrate(0);
  }

  return { start, stop };
})();
