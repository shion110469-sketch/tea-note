// 起動時の画面
// - 初めて開いた端末：オンボーディング（使い方とメリット）を表示
// - 2回目以降：アプリを新しく起動したときだけスプラッシュを表示
//   （バックグラウンドから戻ったときはページが読み込み直されないので表示されない）

(() => {
  const KEY = 'teanote.onboarded';
  const splash = document.getElementById('splash');
  const root = document.getElementById('onboarding');

  const SLIDES = [
    {
      icon: 'cup', eyebrow: 'WELCOME', title: '紅茶ノートへようこそ',
      text: '茶葉の在庫、淹れ方、味の記録をひとつのアプリに。毎日の一杯が、もっとおいしく楽しくなります。',
      points: ['在庫がひと目でわかる', 'おいしく淹れられる', '好みの紅茶が見つかる', '紅茶の最新ニュースが届く'],
    },
    {
      icon: 'leaf', eyebrow: 'STOCK', title: '茶葉と在庫を管理',
      text: '持っている茶葉を登録すると、残りの量がひと目でわかります。少なくなったらホームでお知らせします。',
      how: '「茶葉・在庫」タブの「＋ 追加」から登録',
    },
    {
      icon: 'timer', eyebrow: 'TIMER', title: 'タイマーでおいしく淹れる',
      text: '茶葉ごとに温度・量・蒸らし時間を保存。時間になったらチャイムでお知らせし、使った分は在庫から減らせます。',
      how: '茶葉の「淹れる」ボタンからスタート',
    },
    {
      icon: 'note', eyebrow: 'DISCOVER', title: '味を記録して、好みを発見',
      text: '★と味の特徴を記録すると、あなたの好みを分析して次に試したい茶葉を提案します。ガイドでは初心者向けの楽しみ方も紹介しています。',
      how: 'タイマー終了後の「味を記録する」から',
    },
    {
      icon: 'news', eyebrow: 'NEWS', title: '最新ニュースをチェック',
      text: '紅茶・和紅茶・アフタヌーンティーの新しいニュースを6時間ごとに自動で集めてお届けします。気になる記事はタップすると配信元のサイトで読めます。',
      how: '「ニュース」タブから。キーワードで絞り込みもできます',
    },
  ];

  // ストア版：ニュースの取得元が決まるまではニュースの紹介を出さず、最後に Pro を紹介する
  if (!Platform.news) {
    SLIDES[0].points = SLIDES[0].points.filter(p => !p.includes('ニュース'));
    SLIDES.splice(SLIDES.findIndex(s => s.icon === 'news'), 1);
  }
  if (Platform.store) {
    SLIDES[0].points.push('記録をグラフでふり返る');
    SLIDES.push({
      icon: 'chart', eyebrow: 'PRO', title: 'もっと深く楽しむなら Pro',
      text: '水色・香り・品質を100点満点で採点するプロの記録、写真3枚、記録をふり返る統計が使えます。最初の1週間は無料です。',
      how: '「記録」タブの「プロ」や「統計を見る」から',
    });
  }

  function isFirstLaunch() {
    try {
      if (localStorage.getItem(KEY) === '1') return false;
      // 以前から使っている端末（データがある）は初回扱いにしない
      if (localStorage.getItem('teanote.v1')) { localStorage.setItem(KEY, '1'); return false; }
      return true;
    } catch (e) {
      return false; // 保存できない環境では毎回出ないようにする
    }
  }

  function markDone() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* 保存できなくても続行 */ }
  }

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function showOnboarding() {
    const last = SLIDES.length - 1;
    root.innerHTML = `
      <div class="ob" role="dialog" aria-modal="true" aria-label="紅茶ノートの使い方">
        <div class="ob-top"><button class="ob-skip" type="button">スキップ</button></div>
        <div class="ob-track">
          ${SLIDES.map((s, i) => `
            <section class="ob-slide" aria-label="${i + 1} / ${SLIDES.length}">
              <div class="ob-art">${ICONS[s.icon]}</div>
              <p class="eyebrow">${s.eyebrow}</p>
              <h2>${s.title}</h2>
              <p class="ob-text">${s.text}</p>
              ${s.points ? `<ul class="ob-points">${s.points.map(p => `<li>${ICONS.check}${p}</li>`).join('')}</ul>` : ''}
              ${s.how ? `<p class="ob-how"><b>使い方</b>${s.how}</p>` : ''}
              ${i === last && !isStandalone() && !Platform.store ?'<p class="ob-tip">ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように使えます</p>' : ''}
            </section>`).join('')}
        </div>
        <div class="ob-bottom">
          <div class="ob-dots">${SLIDES.map((_, i) => `<span class="${i === 0 ? 'on' : ''}"></span>`).join('')}</div>
          <button class="btn big ob-next" type="button">次へ</button>
        </div>
      </div>`;
    root.hidden = false;
    document.body.classList.add('locked');

    const track = root.querySelector('.ob-track');
    const dots = [...root.querySelectorAll('.ob-dots span')];
    const next = root.querySelector('.ob-next');
    const index = () => Math.round(track.scrollLeft / track.clientWidth);
    let cur = 0, settle = null;

    function show(i) {
      cur = i;
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
      next.textContent = i === last ? 'はじめる' : '次へ';
    }

    // 「次へ」で移動。スクロールの吸着と重なって止まることがあるので、少し後に位置を補正する
    function goTo(i) {
      show(i);
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (index() !== i) track.scrollLeft = i * track.clientWidth;
        settle = null;
      }, 500);
    }

    // 移動中（settle あり）は途中の位置で表示を変えない
    track.addEventListener('scroll', () => { if (!settle) show(index()); }, { passive: true });
    // スワイプを始めたら補正を取りやめる
    track.addEventListener('touchstart', () => { clearTimeout(settle); settle = null; }, { passive: true });

    next.addEventListener('click', () => {
      // 移動中でなければ、実際のスクロール位置を正とする（スワイプで戻った場合など）
      const i = settle ? cur : index();
      if (i >= last) finish();
      else goTo(i + 1);
    });
    root.querySelector('.ob-skip').addEventListener('click', finish);
  }

  function finish() {
    markDone();
    root.classList.add('closing');
    setTimeout(() => {
      root.hidden = true;
      root.classList.remove('closing');
      root.innerHTML = '';
      document.body.classList.remove('locked');
    }, 250);
  }

  function hideSplash() {
    if (!splash) return;
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }

  // 新しい版への自動切り替えで読み込み直したとき（js/update.js）はスプラッシュを出さない
  let updated = false;
  try { updated = sessionStorage.getItem('teanote.updated') === '1'; sessionStorage.removeItem('teanote.updated'); } catch (e) { /* 読めなければ通常どおり */ }

  if (isFirstLaunch()) {
    if (splash) splash.remove();
    showOnboarding();
  } else if (updated) {
    if (splash) splash.remove();
  } else {
    setTimeout(hideSplash, 1100);
  }

  // ガイド画面の「使い方をもう一度見る」から呼ぶ
  window.showOnboarding = showOnboarding;
})();
