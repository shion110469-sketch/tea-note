// 記録の写真
// localStorage は容量が小さい（数MB）ため、写真は縮小してから IndexedDB に保存する。

const Photos = (() => {
  const DB = 'teanote', STORE = 'photos';
  const MAX_SIDE = 1280, QUALITY = 0.8;
  const urls = new Map(); // id → 表示用の object URL
  let dbp = null;

  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  const put = (id, blob) => tx('readwrite', s => s.put(blob, id));
  const get = id => tx('readonly', s => s.get(id));
  function del(id) {
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    return tx('readwrite', s => s.delete(id));
  }

  // 撮った写真・選んだ画像を長辺 1280px の JPEG に縮小する
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(src);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/jpeg', QUALITY);
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('画像を読み込めませんでした')); };
      img.src = src;
    });
  }

  // 表示用の URL（保存前の写真は blob を直接渡す）
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    const blob = await get(id);
    if (!blob) return '';
    const u = URL.createObjectURL(blob);
    urls.set(id, u);
    return u;
  }

  // 画面内の <img data-photo="id"> に画像を入れる
  function hydrate(root = document) {
    root.querySelectorAll('img[data-photo]:not([src])').forEach(async img => {
      try {
        const u = await url(img.dataset.photo);
        if (u) img.src = u; else img.closest('.thumb')?.remove();
      } catch (e) { /* 読めない写真は表示しない */ }
    });
  }

  // バックアップ用：写真を data URL にして書き出す／読み込む
  const toDataURL = blob => new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });

  async function exportAll(ids) {
    const out = {};
    for (const id of ids) {
      const blob = await get(id);
      if (blob) out[id] = await toDataURL(blob);
    }
    return out;
  }

  async function importAll(map) {
    await tx('readwrite', s => s.clear());
    urls.forEach(u => URL.revokeObjectURL(u));
    urls.clear();
    for (const [id, dataUrl] of Object.entries(map || {})) {
      const blob = await (await fetch(dataUrl)).blob();
      await put(id, blob);
    }
  }

  return { put, del, shrink, url, hydrate, exportAll, importAll };
})();
