// オフライン対応（Service Worker）の登録と、新しい版への自動切り替え
// ホーム画面のアプリはバックグラウンドから戻っても古いプログラムのまま動き続けるため、
// 戻ったときに新しい版を確認し、切り替わったら読み込み直す。

(() => {
  // アプリ版（Android）は中身をアプリに同梱しているので、Service Worker は使わない（更新はストアから）
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || Platform.native) return;

  const hadController = !!navigator.serviceWorker.controller; // 初回インストール時は読み込み直さない
  let reloading = false;

  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});

  // タイマー作動中・入力中・オンボーディング表示中は勝手に読み込み直さない
  function busy() {
    const t = typeof Timer !== 'undefined' ? Timer.state : {};
    return t.running || t.done
      || document.getElementById('sheet-root').childElementCount > 0
      || !!document.getElementById('paywall')
      || !document.getElementById('onboarding').hidden;
  }

  function reload() {
    if (reloading) return;
    reloading = true;
    try { sessionStorage.setItem('teanote.updated', '1'); } catch (e) { /* 保存できなくても続行 */ }
    location.reload();
  }

  function showBar() {
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.innerHTML = '<span>新しいバージョンがあります</span><button type="button">更新</button>';
    bar.querySelector('button').addEventListener('click', reload);
    document.body.appendChild(bar);
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (busy()) showBar(); else reload();
  });
})();
