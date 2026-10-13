// バーコード読み取り
// 対応ブラウザでは標準の BarcodeDetector を使い、未対応なら html5-qrcode を読み込んで使う

const Scanner = (() => {
  const LIB_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  let stream = null, loop = null, lib = null, found = false, session = 0;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Html5Qrcode) return resolve();
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error('読み取りライブラリを読み込めませんでした'));
      document.head.appendChild(el);
    });
  }

  async function nativeFormats() {
    if (!('BarcodeDetector' in window)) return [];
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      return ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(f => supported.includes(f));
    } catch (e) { return []; }
  }

  // container: 映像を表示する要素（id 必須）
  async function start(container, onCode, onStatus) {
    stop();
    found = false;
    const my = ++session;
    const cancelled = () => my !== session;
    const accept = code => {
      if (found || !code) return;
      found = true;
      stop();
      onCode(String(code).trim());
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onStatus('この環境ではカメラが使えません。番号を手入力してください。');
      return;
    }

    try {
      const formats = await nativeFormats();
      if (formats.length) {
        const detector = new BarcodeDetector({ formats });
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // 起動を待つ間に画面が閉じられていたら、カメラをすぐ止める
        if (cancelled()) { media.getTracks().forEach(t => t.stop()); return; }
        stream = media;
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.srcObject = stream;
        container.prepend(video);
        await video.play();
        onStatus('バーコードを枠に合わせてください');
        loop = setInterval(async () => {
          try {
            const codes = await detector.detect(video);
            if (codes.length) accept(codes[0].rawValue);
          } catch (e) { /* 次のフレームで再試行 */ }
        }, 250);
        return;
      }

      onStatus('カメラを準備しています…');
      await loadScript(LIB_URL);
      if (cancelled()) return;
      const F = window.Html5QrcodeSupportedFormats;
      lib = new window.Html5Qrcode(container.id, {
        verbose: false,
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      });
      await lib.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 120 } }, accept, () => {});
      if (cancelled()) { stop(); return; }
      onStatus('バーコードを枠に合わせてください');
    } catch (e) {
      if (cancelled()) return;
      stop();
      onStatus('カメラを起動できませんでした。番号を手入力してください。');
    }
  }

  function stop() {
    session++;
    if (loop) { clearInterval(loop); loop = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (lib) {
      const l = lib;
      lib = null;
      l.stop().then(() => l.clear()).catch(() => {});
    }
  }

  // 公開データベース（Open Food Facts）で商品名を調べる。見つからなければ null
  async function lookup(code) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ja,brands`, { signal: ctrl.signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 1 || !data.product) return null;
      const name = data.product.product_name_ja || data.product.product_name || '';
      const brand = (data.product.brands || '').split(',')[0].trim();
      return name || brand ? { name, brand } : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return { start, stop, lookup };
})();
