// 紅茶ノート Pro（月額・1週間無料）の状態と購入
// Web版はすべて無料なので常に有効。ストア版は Google Play の定期購入を RevenueCat で確認する。
// 最後に確認した状態を覚えておき、オフラインでもその状態で使えるようにする。

const Pro = (() => {
  const KEY = 'teanote.pro';
  const subs = new Set();
  let active = !Platform.store;
  let pkg = null; // 購入する商品（RevenueCat の Package）

  if (Platform.store) {
    try { active = localStorage.getItem(KEY) === '1'; } catch (e) { /* 既定は無料 */ }
  }

  function set(v) {
    active = !!v;
    try { localStorage.setItem(KEY, active ? '1' : '0'); } catch (e) { /* 覚えられなくても続行 */ }
    subs.forEach(f => f(active));
  }
  const fromInfo = info => set(!!(info && info.entitlements && info.entitlements.active && info.entitlements.active[STORE_CONFIG.entitlement]));
  const purchases = () => Platform.plugin('Purchases');

  async function init() {
    const p = purchases();
    if (!p || !STORE_CONFIG.revenuecatKey) return;
    try {
      await p.configure({ apiKey: STORE_CONFIG.revenuecatKey });
      p.addCustomerInfoUpdateListener(fromInfo);
      fromInfo((await p.getCustomerInfo()).customerInfo);
      const offerings = await p.getOfferings();
      const cur = offerings && offerings.current;
      pkg = cur && (cur.monthly || cur.availablePackages[0]) || null;
    } catch (e) { /* オフラインなどは前回の状態のまま */ }
  }

  return {
    get active() { return active; },
    subscribe: f => subs.add(f),
    // ストアに表示されている価格（取れなければ設定の価格）
    get price() { return (pkg && pkg.product && pkg.product.priceString) ? `月${pkg.product.priceString}` : STORE_CONFIG.price; },
    init,

    // 購入：成功したら true、やめたら false。失敗したらエラーを投げる
    async purchase() {
      if (Platform.mock) {
        if (!confirm('（テスト）1週間無料で Pro を始めますか？')) return false;
        set(true);
        return true;
      }
      const p = purchases();
      if (!p || !pkg) throw new Error('ストアに接続できませんでした。通信状態を確かめて、もう一度お試しください');
      try {
        const res = await p.purchasePackage({ aPackage: pkg });
        fromInfo(res.customerInfo);
        return active;
      } catch (e) {
        if (e && (e.userCancelled || e.code === '1' || e.code === 1)) return false; // 購入画面を閉じた
        throw new Error('購入できませんでした');
      }
    },

    // 機種変更・再インストール後に、購入済みの Pro を戻す
    async restore() {
      if (Platform.mock) { set(confirm('（テスト）購入済みとして戻しますか？')); return active; }
      const p = purchases();
      if (!p) throw new Error('ストアに接続できませんでした');
      fromInfo((await p.restorePurchases()).customerInfo);
      return active;
    },

    manage() {
      if (Platform.mock) { if (confirm('（テスト）Pro を解約した状態にしますか？')) set(false); return; }
      Platform.openExternal(STORE_CONFIG.manageUrl);
    },
  };
})();

Pro.init();
