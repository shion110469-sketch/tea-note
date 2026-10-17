// 動いている場所（Web版／Androidアプリ）と、アプリ版の設定
// - Web版（GitHub Pages）：すべての機能が無料。有料プラン・購入リンクは出さない
// - ストア版（Androidアプリ）：紅茶ノート Pro（月額）と購入リンク（PR）を出す
//   ブラウザで確かめるときは、localhost で URL に ?store を付けるとストア版として動く（購入は試しの動作）

const STORE_CONFIG = {
  revenuecatKey: '',          // RevenueCat の Google Play 用の公開キー（goog_ で始まる）
  entitlement: 'pro',         // RevenueCat で作る権利（Entitlement）の名前
  amazonTag: '',              // Amazonアソシエイトのトラッキング ID（例：teanote-22）
  newsUrl: '',                // 商用で使えるニュースの JSON（取得元が決まるまで空＝ニュースタブを出さない）
  privacyUrl: 'https://teanote-app.github.io/privacy.html',
  manageUrl: 'https://play.google.com/store/account/subscriptions?package=jp.teanote.app',
  price: '月350円',
  trial: '1週間',
};

const Platform = (() => {
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const mock = !native && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('store');
  const store = native || mock;
  return {
    native,
    mock,
    store,
    news: !store || !!STORE_CONFIG.newsUrl,
    newsUrl: store ? STORE_CONFIG.newsUrl : 'news.json',
    // プラグインは、アプリ版だけで読み込む js/native.js（scripts/native-entry.js から作る）が用意する
    plugin: name => (native && window.NativePlugins ? window.NativePlugins[name] || null : null),
    // 外部のサイトを開く（アプリ版はスマホのブラウザで開く）
    openExternal(url) {
      const browser = this.plugin('Browser');
      if (browser) browser.open({ url }).catch(() => window.open(url, '_blank'));
      else window.open(url, '_blank', 'noopener');
    },
  };
})();

// 以前の URL（shion110469-sketch.github.io/tea-note/）で開いたときは、新しい URL への引っ越しを案内する。
// データは URL ごとに別々に保存されるので、バックアップを書き出して新しい URL で読み込んでもらう
const NEW_HOME = 'https://teanote-app.github.io/';
if (location.hostname === 'shion110469-sketch.github.io') {
  const bar = document.createElement('div');
  bar.className = 'move-bar';
  bar.innerHTML = '<b>紅茶ノートは新しいURLに移りました</b>'
    + '<span>「茶葉・在庫」の「データのバックアップ」で書き出してから、新しいURLで開いて読み込んでください。</span>'
    + `<a href="${NEW_HOME}" target="_blank" rel="noopener">新しいURLを開く</a>`;
  document.body.prepend(bar);
}

// ストア版ではニュースタブを出さない（取得元が決まるまで）
if (!Platform.news) {
  const tab = document.querySelector('.tabbar [data-tab="news"]');
  if (tab) tab.remove();
}
