// 画面の描画と操作

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtTime = ms => { const sec = Math.ceil(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
  const toDateInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const presetById = id => BREW_PRESETS.find(p => p.id === id);
  const guideById = id => GUIDES.find(g => g.id === id);
  const isLow = t => Number(t.lowAt) > 0 && Number(t.stock) <= Number(t.lowAt);
  const RING = 2 * Math.PI * 110;
  const MAX_PHOTOS = 3; // 1つの記録に付けられる写真の数（Pro）
  const FREE_PHOTOS = 1; // 無料で付けられる写真の数（ストア版）
  const photoLimit = () => (Pro.active ? MAX_PHOTOS : FREE_PHOTOS);

  // 蒸らし時間の入力：「分」と「秒」を別々に選ぶ（1秒単位、最長 15:59）
  // attrs: data-time-param（タイマーの設定名）か data-field（フォームの hidden 入力名）を付ける
  const MAX_MIN = 15;
  function mmssPicker(sec, attrs, disabled = false) {
    const total = Math.max(1, Math.round(Number(sec) || 0));
    const m = Math.min(MAX_MIN, Math.floor(total / 60)), s = total % 60;
    const opts = (n, cur, pad) => Array.from({ length: n }, (_, i) =>
      `<option value="${i}" ${i === cur ? 'selected' : ''}>${pad ? String(i).padStart(2, '0') : i}</option>`).join('');
    const dis = disabled ? 'disabled' : '';
    return `<span class="mmss" data-mmss ${attrs}>`
      + `<select data-part="m" aria-label="分" ${dis}>${opts(MAX_MIN + 1, m)}</select><b>:</b>`
      + `<select data-part="s" aria-label="秒" ${dis}>${opts(60, s, true)}</select></span>`;
  }
  const mmssValue = wrap => Math.max(1, Number($('[data-part=m]', wrap).value) * 60 + Number($('[data-part=s]', wrap).value));
  function setMmss(wrap, sec) {
    $('[data-part=m]', wrap).value = String(Math.min(MAX_MIN, Math.floor(sec / 60)));
    $('[data-part=s]', wrap).value = String(sec % 60);
  }

  const view = $('#view');
  let lastRoute = '';

  // ---------- ルーティング ----------
  function parseHash() {
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: name || 'home', arg: arg ? decodeURIComponent(arg) : '' };
  }
  const go = path => { location.hash = '#/' + path; };

  function render() {
    const { name, arg } = parseHash();
    const routes = {
      home: viewHome, timer: viewTimer, notes: viewNotes, teas: viewTeas,
      tea: () => viewTeaDetail(arg), guide: () => (arg ? viewGuideDetail(arg) : viewGuides()),
      news: Platform.news ? viewNews : viewHome, stats: viewStats,
    };
    const key = name + '/' + arg;
    // 記録タブを開き直したら、カレンダーは今月・日付の選択なしに戻す
    if (key !== lastRoute && name === 'notes') {
      calDay = '';
      calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      noteQuery = '';
    }
    view.innerHTML = (routes[name] || viewHome)();
    view.dataset.route = name; // 画面ごとの見た目の調整に使う（style.css）
    Photos.hydrate(view);
    const tab = { tea: 'teas', stats: 'notes' }[name] || name;
    $$('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    if (key !== lastRoute) { view.scrollTop = 0; lastRoute = key; }
    if (name === 'timer') updateTimerDisplay();
    updateMiniTimer();
  }

  // ---------- 共通パーツ ----------
  const chips = (tags, cls = '') => (tags || []).map(t => `<span class="chip ${cls}">${esc(t)}</span>`).join('');
  const empty = (text, btn = '') => `<div class="empty"><p>${text}</p>${btn}</div>`;
  const stockText = t => `${Number(t.stock) || 0}${esc(t.unit)}`;

  function stockBadge(t) {
    if (!(Number(t.stock) > 0)) return '<span class="badge out">在庫なし</span>';
    if (isLow(t)) return '<span class="badge low">残りわずか</span>';
    return '';
  }

  function teaCard(t) {
    const max = Math.max(Number(t.lowAt) * 4 || 0, Number(t.stock) || 0, 1);
    const pct = Math.min(100, (Number(t.stock) || 0) / max * 100);
    return `
      <article class="card tea-card" data-act="open-tea" data-id="${t.id}">
        <div class="row between">
          <div>
            <h3>${esc(t.name)}</h3>
            <p class="muted">${esc([t.brand, t.type].filter(Boolean).join('・'))}</p>
          </div>
          <button class="btn small" data-act="brew" data-id="${t.id}">淹れる</button>
        </div>
        <div class="stock">
          <div class="bar"><span style="width:${pct}%" class="${isLow(t) ? 'low' : ''}"></span></div>
          <span class="stock-num">${stockText(t)}</span>${stockBadge(t)}
        </div>
      </article>`;
  }

  // 購入リンク（ストア版のみ。Amazonの検索結果を開く・PR表記つき）
  const amazonUrl = words => `https://www.amazon.co.jp/s?k=${encodeURIComponent(words)}${STORE_CONFIG.amazonTag ? `&tag=${encodeURIComponent(STORE_CONFIG.amazonTag)}` : ''}`;
  const buyBtn = (words, label = 'Amazonで探す') => (Platform.store
    ? `<button class="btn small ghost buy" data-act="open-url" data-url="${esc(amazonUrl(words))}"><span class="pr">PR</span>${esc(label)}</button>` : '');
  const prNote = () => (Platform.store ? '<p class="pr-note">PR：Amazonのアソシエイトとして、紅茶ノートは適格販売により収入を得ています。</p>' : '');

  const noteName = n => { const tea = n.teaId && Store.tea(n.teaId); return tea ? tea.name : n.teaName || ''; };

  // 評価トップ3の順位付け用の点数：プロは総合点、ノーマルは★をおおよその点数に置き換える
  const STAR_POINTS = { 5: 95, 4: 82, 3: 67, 2: 50, 1: 20 };
  const notePoints = n => (n.mode === 'pro' && n.pro ? n.pro.score : STAR_POINTS[n.rating] || 0);

  // ホームの記録欄の表示（最近／トップ3）を覚えておく
  function getHomeNotesMode() {
    try { return localStorage.getItem('teanote.homeNotes') === 'top' ? 'top' : 'recent'; } catch (e) { return 'recent'; }
  }

  // ---------- プロのテイスティング評価 ----------
  const readQuality = form => Object.fromEntries(PRO.quality.map(([k]) => [k, Number(form.elements['q_' + k].value)]));
  const proScore = q => PRO.quality.reduce((s, [k]) => s + Number(q[k] || 0), 0) * 2; // 50点満点 → 100点満点
  const scoreToStars = s => (s >= 90 ? 5 : s >= 75 ? 4 : s >= 60 ? 3 : s >= 40 ? 2 : 1);
  // 香りの表現と味の強さから、好みの分析に使う味タグを作る
  function proTags(p) {
    const tags = new Set(PRO.aromas.filter(a => a.tag && p.aromaNotes.includes(a.v)).map(a => a.tag));
    const f = p.profile;
    if (f.astringency >= 4) tags.add('渋み');
    if (f.body >= 4) tags.add('コク');
    if (f.sweetness >= 4) tags.add('甘い');
    if (f.astringency <= 2 && f.bitterness <= 2) tags.add('マイルド');
    return [...tags];
  }
  const liquorHex = name => (PRO.liquors.find(l => l.name === name) || {}).hex;

  // 品質評価（外観・水色・香り・味・余韻）のレーダーチャート
  function radar(q) {
    const C = 60, R = 40, N = PRO.quality.length;
    const pt = (i, r) => {
      const a = (-90 + (360 / N) * i) * Math.PI / 180;
      return [C + r * Math.cos(a), C + r * Math.sin(a)];
    };
    const poly = r => PRO.quality.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
    const data = PRO.quality.map(([k], i) => pt(i, R * Math.max(0, Math.min(10, q[k] || 0)) / 10).map(v => v.toFixed(1)).join(',')).join(' ');
    return `<svg class="radar" viewBox="0 0 120 120" role="img" aria-label="品質評価：${PRO.quality.map(([k, l]) => `${l}${q[k]}`).join('、')}">
      <polygon points="${poly(R)}" class="radar-grid"/><polygon points="${poly(R / 2)}" class="radar-grid"/>
      ${PRO.quality.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}" class="radar-grid"/>`).join('')}
      <polygon points="${data}" class="radar-data"/>
      ${PRO.quality.map(([, label], i) => { const [x, y] = pt(i, R + 11); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" class="radar-label">${label}</text>`; }).join('')}
    </svg>`;
  }

  // 抽出条件を「98℃・3g・160ml・3:20」の形にする（記録していない項目は省く）
  function brewText(n) {
    const b = n.brew || (n.pro && n.pro.brew) || {};
    const tea = n.teaId && Store.tea(n.teaId);
    const unit = (tea && tea.unit) || 'g';
    return [b.temp != null && `${b.temp}℃`, b.amount != null && `${b.amount}${unit}`, b.water != null && `${b.water}ml`, b.seconds && fmtTime(b.seconds * 1000)]
      .filter(Boolean).join('・');
  }

  function proSummary(n) {
    const p = n.pro;
    const brew = brewText(n);
    return `
        <div class="pro-sum">
          ${radar(p.quality || {})}
          <div class="pro-facts">
            ${p.liquor ? `<p><span class="swatch" style="background:${liquorHex(p.liquor)}"></span>水色：${esc(p.liquor)}${p.clarity ? `（${esc(p.clarity)}）` : ''}</p>` : ''}
            ${p.leafColor ? `<p>茶殻：${esc(p.leafColor)}</p>` : ''}
            ${brew ? `<p>抽出：${brew}</p>` : ''}
            ${p.aromaNotes && p.aromaNotes.length ? `<div class="chips">${chips(p.aromaNotes.slice(0, 5))}</div>` : ''}
          </div>
        </div>`;
  }

  function noteCard(n) {
    const photos = n.photos || [];
    const isPro = n.mode === 'pro' && n.pro;
    if (isPro) return `
      <article class="card note-card pro-card" data-act="edit-note" data-id="${n.id}">
        <div class="row between">
          <h3>${esc(noteName(n) || '（紅茶の名前なし）')}</h3>
          <span class="pro-score"><em>PRO</em>${n.pro.score}<small>点</small></span>
        </div>
        <p class="muted">${fmtDate(n.date)}・${esc(n.style || 'ストレート')}${n.pro.grade ? `・${esc(n.pro.grade.replace(/（.*）/, ''))}` : ''}</p>
        ${proSummary(n)}
        ${photos.length ? `<div class="thumbs">${photos.map(id => `
          <button type="button" class="thumb" data-act="view-photo" data-photo-id="${esc(id)}" aria-label="写真を大きく見る"><img data-photo="${esc(id)}" alt=""></button>`).join('')}</div>` : ''}
        ${n.memo ? `<p class="memo">${esc(n.memo)}</p>` : ''}
      </article>`;
    return `
      <article class="card note-card" data-act="edit-note" data-id="${n.id}">
        <div class="row between">
          <h3>${esc(noteName(n) || '（紅茶の名前なし）')}</h3>
          <span class="stars">${stars(n.rating)}</span>
        </div>
        <p class="muted">${fmtDate(n.date)}・${esc(n.style || 'ストレート')}</p>
        ${brewText(n) ? `<p class="muted">抽出：${brewText(n)}</p>` : ''}
        ${photos.length ? `<div class="thumbs">${photos.map(id => `
          <button type="button" class="thumb" data-act="view-photo" data-photo-id="${esc(id)}" aria-label="写真を大きく見る"><img data-photo="${esc(id)}" alt=""></button>`).join('')}</div>` : ''}
        ${n.tags && n.tags.length ? `<div class="chips">${chips(n.tags)}</div>` : ''}
        ${n.memo ? `<p class="memo">${esc(n.memo)}</p>` : ''}
      </article>`;
  }

  // ---------- ホーム ----------
  function viewHome() {
    const low = Store.teas.filter(t => isLow(t) || (t.stock !== '' && Number(t.stock) <= 0));
    const stockRecs = Recommend.fromStock(3);
    const discover = Recommend.discover(3);
    const homeNotes = getHomeNotesMode();
    const picked = homeNotes === 'top'
      ? [...Store.notes].sort((a, b) => notePoints(b) - notePoints(a) || b.date - a.date).slice(0, 3)
      : [...Store.notes].sort((a, b) => b.date - a.date).slice(0, 3);
    const d = new Date(), h = d.getHours();
    const greet = h < 4 ? 'こんばんは' : h < 11 ? 'おはようございます' : h < 17 ? 'こんにちは' : 'こんばんは';
    const week = '日月火水木金土'[d.getDay()];
    return `
      <section class="hero">
        <span class="hero-cup">${ICONS.cup}</span>
        <p class="eyebrow">${d.getMonth() + 1}月${d.getDate()}日（${week}）</p>
        <h1>${greet}。<br>今日の一杯を選びましょう</h1>
      </section>
      <div class="quick">
        <button data-act="go" data-to="timer"><span class="qi">${ICONS.timer}</span>タイマー</button>
        <button data-act="new-tea"><span class="qi">${ICONS.leaf}</span>茶葉を登録</button>
        <button data-act="new-note"><span class="qi">${ICONS.note}</span>味を記録</button>
      </div>
      ${low.length ? `<div class="alert" data-act="go" data-to="teas"><b>在庫が少なくなっています</b><span>${low.map(t => esc(t.name)).join('、')}</span>
        ${Platform.store ? `<div class="buy-row">${low.slice(0, 3).map(t => buyBtn([t.brand, t.name].filter(Boolean).join(' '), `${t.name}を買い足す`)).join('')}</div>` : ''}</div>` : ''}

      <h2 class="sec">在庫からのおすすめ</h2>
      ${stockRecs.length ? `<div class="hscroll">${stockRecs.map(r => `
        <article class="card rec-card">
          <p class="reason">${esc(r.reason)}</p>
          <h3>${esc(r.tea.name)}</h3>
          <p class="muted">${esc(r.tea.type || '')}・残り${stockText(r.tea)}</p>
          <button class="btn small" data-act="brew" data-id="${r.tea.id}">淹れる</button>
        </article>`).join('')}</div>`
        : empty('茶葉を登録すると、在庫からおすすめを選びます', '<button class="btn" data-act="new-tea">茶葉を登録</button>')}

      <h2 class="sec">次に試したい茶葉</h2>
      <div class="stack">${discover.map(({ item, reason }) => `
        <article class="card disc-card">
          <p class="reason">${esc(reason)}</p>
          <h3>${esc(item.name)}</h3>
          <p>${esc(item.desc)}</p>
          <div class="chips">${chips(item.tags)}</div>
          <div class="row gap">
            <button class="btn small ghost" data-act="brew-preset" data-preset="${item.preset}" data-label="${esc(item.name)}">淹れ方でタイマー</button>
            ${item.guide ? `<button class="btn small ghost" data-act="go" data-to="guide/${item.guide}">ガイドを見る</button>` : ''}
            ${buyBtn(`${item.name} 紅茶 茶葉`)}
          </div>
        </article>`).join('')}</div>

      <div class="row between sec-row">
        <h2 class="sec">${homeNotes === 'top' ? '評価トップ3' : '最近の記録'}</h2>
        <div class="seg seg-sm" role="tablist" aria-label="記録の表示">
          <button type="button" role="tab" data-act="home-notes" data-v="recent" aria-selected="${homeNotes !== 'top'}">最近</button>
          <button type="button" role="tab" data-act="home-notes" data-v="top" aria-selected="${homeNotes === 'top'}">トップ3</button>
        </div>
      </div>
      ${!picked.length
        ? empty('飲んだ紅茶の感想を記録すると、好みに合わせた提案が届きます', '<button class="btn" data-act="new-note">最初の記録をつける</button>')
        : homeNotes === 'top'
          ? `<div class="stack">${picked.map((n, i) => `<div class="ranked"><span class="rank rank-${i + 1}" aria-label="${i + 1}位">${i + 1}</span>${noteCard(n)}</div>`).join('')}</div>`
          : `<div class="stack">${picked.map(noteCard).join('')}</div>`}
      ${prNote()}
    `;
  }

  // ---------- ニュース ----------
  // news.json は GitHub Actions が定期的に更新する（scripts/fetch-news.ps1）
  let news = null, newsState = 'idle', newsFilter = '';

  function loadNews() {
    if (newsState !== 'idle') return; // 失敗時は「再読み込み」ボタンで idle に戻す
    newsState = 'loading';
    fetch(Platform.newsUrl, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { news = d; newsState = 'ok'; })
      .catch(() => { newsState = 'error'; })
      .finally(() => { if (parseHash().name === 'news') render(); });
  }

  function relTime(iso) {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return `${Math.max(min, 1)}分前`;
    if (min < 60 * 24) return `${Math.floor(min / 60)}時間前`;
    if (min < 60 * 24 * 7) return `${Math.floor(min / 1440)}日前`;
    return fmtDate(iso);
  }

  function newsItem(it) {
    if (!/^https?:\/\//.test(it.url || '')) return '';
    return `
      <a class="card news-item" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">
        <p class="news-meta"><span>${esc(it.source || '')}</span><span>${relTime(it.publishedAt)}</span></p>
        <h3>${esc(it.title)}</h3>
      </a>`;
  }

  function viewNews() {
    loadNews();
    const head = '<div class="page-head"><h1>紅茶のニュース</h1></div>';
    if (newsState === 'loading' || newsState === 'idle') return head + '<p class="muted">読み込み中…</p>';
    if (newsState === 'error' || !news.items) {
      return head + empty('ニュースを読み込めませんでした', '<button class="btn" data-act="news-retry">再読み込み</button>');
    }
    const topics = [...new Set(news.items.map(i => i.query).filter(Boolean))];
    const items = news.items.filter(i => !newsFilter || i.query === newsFilter);
    return `
      ${head}
      <div class="chips pick">
        <button class="chip ${newsFilter ? '' : 'on'}" data-act="news-filter" data-q="">すべて</button>
        ${topics.map(t => `<button class="chip ${newsFilter === t ? 'on' : ''}" data-act="news-filter" data-q="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="stack">${items.map(newsItem).join('')}</div>
      <p class="muted center">${esc(news.source || '')}より・${relTime(news.updatedAt)}に更新<br>記事は各配信元のサイトで開きます</p>
    `;
  }

  // ---------- タイマー ----------
  function cfgFromTea(t) {
    const b = t.brew || presetById(FORMS[t.form] ? FORMS[t.form].preset : 'leaf');
    return { src: 'tea:' + t.id, teaId: t.id, label: t.name, unit: t.unit || 'g', temp: b.temp, amount: b.amount, water: b.water, seconds: b.seconds };
  }
  function cfgFromPreset(id, label) {
    const p = presetById(id) || BREW_PRESETS[0];
    return { src: 'preset:' + p.id, teaId: null, label: label || p.name, unit: p.unit, temp: p.temp, amount: p.amount, water: p.water, seconds: p.seconds, style: p.style };
  }

  function viewTimer() {
    if (!Timer.state.cfg) Timer.setup(cfgFromPreset('leaf'));
    const s = Timer.state, c = s.cfg;
    const tea = c.teaId && Store.tea(c.teaId);
    const opts = `
      ${Store.teas.length ? `<optgroup label="マイ茶葉">${Store.teas.map(t => `<option value="tea:${t.id}" ${c.src === 'tea:' + t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="基本の淹れ方">${BREW_PRESETS.map(p => `<option value="preset:${p.id}" ${c.src === 'preset:' + p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`;
    const param = (key, label, unit, step = 1) => `
      <label class="param"><span>${label}</span>
        <span class="pin"><input type="number" inputmode="decimal" step="${step}" min="0" data-param="${key}" value="${esc(c[key])}" ${s.running ? 'disabled' : ''}><em>${unit}</em></span>
      </label>`;
    // 真ん中の数字をタップして蒸らし時間を変える（止まっているときだけ）。
    // 数字の左半分（分）と右半分（秒）に、見えない選択欄を重ねている
    const editable = !s.running && !s.done;

    return `
      <div class="page-head"><h1>タイマー</h1></div>
      <label class="field">
        <span>茶葉・淹れ方</span>
        <select id="timer-src" ${s.running ? 'disabled' : ''}>${opts}</select>
      </label>
      <div class="params">
        ${param('temp', '温度', '℃')}
        ${param('amount', '茶葉', esc(c.unit), 0.5)}
        ${param('water', 'お湯', 'ml', 10)}
      </div>

      <div class="ring-wrap ${s.done ? 'is-done' : ''}">
        <svg viewBox="0 0 240 240" class="ring" aria-hidden="true">
          <defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ring-stop-1"/><stop offset="1" class="ring-stop-2"/></linearGradient></defs>
          <circle cx="120" cy="120" r="110" class="ring-bg"/>
          <circle cx="120" cy="120" r="110" class="ring-fg" id="ring-fg" stroke-dasharray="${RING}" stroke-dashoffset="0"/>
        </svg>
        <div class="ring-center">
          <p class="ring-label">${esc(c.label)}</p>
          <div class="digits-wrap">
            <p class="digits" id="timer-digits">0:00</p>
            ${editable ? `<span class="mmss-over">${mmssPicker(c.seconds, 'data-time-param="seconds"')}</span>` : ''}
          </div>
          <p class="muted">${esc(c.temp)}℃・${esc(c.amount)}${esc(c.unit)}・${esc(c.water)}ml</p>
          ${editable ? '<p class="tap-hint">数字をタップして変更</p>' : ''}
        </div>
        ${s.done ? `
          <div class="done-over" role="group" aria-label="お茶が入りました">
            <p class="done-title">お茶が入りました</p>
            ${tea && !s.consumed ? `<label class="check"><input type="checkbox" id="consume" checked>在庫から ${esc(c.amount)}${esc(c.unit)} 減らす<small>（残り ${stockText(tea)}）</small></label>` : ''}
            <div class="done-btns">
              <button class="btn small" data-act="done-note">味を記録する</button>
              <button class="btn small ghost" data-act="done-close">閉じる</button>
            </div>
          </div>` : ''}
      </div>

      <div class="timer-btns" ${s.done ? 'hidden' : ''}>
        <button class="btn ghost" data-act="timer-reset">リセット</button>
        ${s.running
          ? '<button class="btn big" data-act="timer-pause">一時停止</button>'
          : `<button class="btn big" data-act="timer-start">${s.remaining != null ? '再開' : 'スタート'}</button>`}
      </div>
    `;
  }

  function updateTimerDisplay() {
    const digits = $('#timer-digits'), ring = $('#ring-fg');
    if (!digits || !Timer.state.cfg) return;
    const left = Timer.left(), total = Timer.duration() || 1;
    digits.textContent = fmtTime(left);
    ring.setAttribute('stroke-dashoffset', String(RING * (1 - left / total)));
  }

  function updateMiniTimer() {
    const bar = $('#mini-timer'), s = Timer.state;
    const show = s.cfg && (s.running || s.done) && parseHash().name !== 'timer';
    bar.hidden = !show;
    if (show) bar.innerHTML = `<span>${ICONS.timer}</span><b>${esc(s.cfg.label)}</b><span class="mt">${s.done ? 'できあがり' : fmtTime(Timer.left())}</span>`;
  }

  // タイマー完了後、在庫を減らす（1回の抽出につき1回だけ）
  function applyConsume() {
    const c = Timer.state.cfg, box = $('#consume');
    if (c && c.teaId && box && box.checked && !Timer.state.consumed) {
      Store.adjustStock(c.teaId, -Number(c.amount || 0));
      Timer.markConsumed();
      toast('在庫を減らしました');
    }
  }

  // ---------- 記録 ----------
  // カレンダーの表示中の月（1日）と、選んだ日（'YYYY-MM-DD'。未選択なら空）
  let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let calDay = '';

  function calendar() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const counts = {};
    let monthCount = 0;
    Store.notes.forEach(n => {
      const k = toDateInput(n.date);
      counts[k] = (counts[k] || 0) + 1;
      const d = new Date(n.date);
      if (d.getFullYear() === y && d.getMonth() === m) monthCount++;
    });
    const today = toDateInput(Date.now());
    const blanks = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < blanks; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const key = toDateInput(new Date(y, m, d));
      const n = counts[key] || 0;
      const cls = ['cal-day', n ? 'has' : '', key === today ? 'today' : '', key === calDay ? 'sel' : ''].join(' ');
      cells.push(`<button class="${cls}" data-act="cal-day" data-day="${key}" aria-label="${m + 1}月${d}日${n ? `、${n}件の記録` : ''}">
        <span class="cal-num">${d}</span>${n ? `<span class="cal-mark">${n > 1 ? n : ''}</span>` : ''}</button>`);
    }
    return `
      <div class="card cal">
        <div class="cal-head">
          <button class="cal-nav" data-act="cal-move" data-step="-1" aria-label="前の月">‹</button>
          <div class="cal-title"><b>${y}年${m + 1}月</b><span>${monthCount ? `${monthCount}杯` : '記録なし'}</span></div>
          <button class="cal-nav" data-act="cal-move" data-step="1" aria-label="次の月">›</button>
        </div>
        <div class="cal-grid cal-week">${'日月火水木金土'.split('').map(w => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>`;
  }

  // 記録の検索・並べ替え
  let noteQuery = '', noteSort = 'new';
  const NOTE_SORTS = {
    new: ['新しい順', (a, b) => b.date - a.date],
    old: ['古い順', (a, b) => a.date - b.date],
    high: ['★が高い順', (a, b) => b.rating - a.rating || b.date - a.date],
    low: ['★が低い順', (a, b) => a.rating - b.rating || b.date - a.date],
  };
  // 全角／半角・カタカナ／ひらがなの違いを無視して比べる
  const normalize = s => String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

  function noteListHTML() {
    const words = normalize(noteQuery).split(/\s+/).filter(Boolean);
    const notes = Store.notes
      .filter(n => !calDay || toDateInput(n.date) === calDay)
      .filter(n => {
        if (!words.length) return true;
        const p = n.mode === 'pro' && n.pro ? n.pro : {};
        const text = normalize([noteName(n), n.memo, n.style, ...(n.tags || []), p.grade, p.liquor, p.leafColor, ...(p.aromaNotes || [])].join(' '));
        return words.every(w => text.includes(w));
      })
      .sort(NOTE_SORTS[noteSort][1]);
    if (notes.length) return `<p class="muted">${notes.length}件</p><div class="stack">${notes.map(noteCard).join('')}</div>`;
    if (words.length) return empty('条件に合う記録はありません');
    return empty(calDay ? 'この日の記録はありません' : 'まだ記録がありません', calDay ? '<button class="btn" data-act="new-note">この日の記録をつける</button>' : '');
  }

  function viewNotes() {
    const p = Recommend.profile();
    const liked = Recommend.likedTags(p, 4);
    const [, dm, dd] = calDay.split('-').map(Number);
    return `
      <div class="page-head"><h1>テイスティング記録</h1><button class="btn small" data-act="new-note">＋ 記録</button></div>
      ${calendar()}
      <div class="card profile">
        <h3>あなたの好み</h3>
        ${liked.length ? `<div class="chips">${chips(liked, 'accent')}</div><p class="muted">★4以上の記録から分析しています</p>`
          : '<p class="muted">★をつけた記録が増えると、好みの傾向を分析します</p>'}
      </div>
      <button class="card stats-link" data-act="go" data-to="stats">
        <span class="qi">${ICONS.chart}</span>
        <span class="grow"><b>統計を見る</b><small>月ごとの杯数・よく飲む紅茶・好きな味</small></span>
        ${Pro.active ? '<span class="chev">›</span>' : '<em class="pro-tag">PRO</em>'}
      </button>
      ${calDay ? `
        <div class="row between sec-row">
          <h2 class="sec">${dm}月${dd}日の記録</h2>
          <button class="btn small ghost" data-act="cal-clear">すべて表示</button>
        </div>` : '<h2 class="sec">すべての記録</h2>'}
      ${Store.notes.length ? `
        <div class="note-tools">
          <input type="search" id="note-q" value="${esc(noteQuery)}" placeholder="名前・メモ・味で検索" aria-label="記録を検索">
          <select id="note-sort" aria-label="並べ替え">${Object.entries(NOTE_SORTS).map(([k, [label]]) => `<option value="${k}" ${k === noteSort ? 'selected' : ''}>${label}</option>`).join('')}</select>
        </div>` : ''}
      <div id="note-list">${noteListHTML()}</div>
    `;
  }

  function refreshNoteList() {
    const list = $('#note-list');
    if (!list) return;
    list.innerHTML = noteListHTML();
    Photos.hydrate(list);
  }

  function openNoteForm(note = {}) {
    const isNew = !note.id;
    const n = { rating: 4, tags: [], style: 'ストレート', aroma: 3, astringency: 3, body: 3, date: Date.now(), ...note };
    const teas = Store.teas;
    const linked = n.teaId && Store.tea(n.teaId);
    const isOther = !linked && !!n.teaName;
    // 在庫に茶葉があれば「在庫から選ぶ」、なければ名前の入力欄だけ
    const teaField = teas.length ? `
        <label class="field"><span>在庫から選ぶ</span>
          <select name="teaId">
            <option value="" disabled ${!linked && !isOther ? 'selected' : ''}>選んでください</option>
            <optgroup label="在庫の茶葉">${teas.map(t => `<option value="${t.id}" ${linked && linked.id === t.id ? 'selected' : ''}>${esc(t.name)}（残り${stockText(t)}）</option>`).join('')}</optgroup>
            <option value="__other" ${isOther ? 'selected' : ''}>在庫にない紅茶（名前を入力）</option>
          </select>
        </label>
        <label class="field" id="tea-name-field" ${isOther ? '' : 'hidden'}><span>紅茶の名前</span>
          <input name="teaName" value="${esc(n.teaName || '')}" placeholder="例：カフェで飲んだアッサム">
        </label>` : `
        <label class="field"><span>飲んだ紅茶</span>
          <input name="teaName" value="${esc(n.teaName || '')}" placeholder="例：アッサム、カフェで飲んだ紅茶">
          <span class="hint">在庫に茶葉がまだありません。「茶葉・在庫」タブで登録すると、ここから選べるようになります。</span>
        </label>`;
    const slider = (key, label, lo, hi) => `
      <label class="slider"><span>${label}</span>
        <input type="range" min="1" max="5" step="1" name="${key}" value="${n[key]}">
        <span class="scale"><em>${lo}</em><em>${hi}</em></span>
      </label>`;

    // ノーマル／プロ：過去の記録は記録したときのモード、新しい記録は前回使ったモード
    let lastMode = 'normal';
    try { lastMode = localStorage.getItem('teanote.noteMode') || 'normal'; } catch (e) { /* 既定はノーマル */ }
    // プロは Pro の機能（Pro をやめた後も、プロで記録済みのものは編集できる）
    const wasPro = n.mode === 'pro';
    const mode = isNew ? (lastMode === 'pro' && !Pro.active ? 'normal' : lastMode) : (n.mode || 'normal');

    // 抽出条件の初期値：記録済みの条件 → タイマーから記録したときの条件 → 茶葉の淹れ方
    const P = n.pro || {};
    const brew = n.brew || P.brew || (linked && linked.brew) || {};
    const q = { appearance: 7, liquor: 7, aroma: 7, taste: 7, finish: 7, ...(P.quality || {}) };
    const prof = { astringency: 3, bitterness: 2, sweetness: 3, body: 3, acidity: 2, aromaStrength: 3, ...(P.profile || {}) };
    const pickOne = (name, items, current, render) => `
      <div class="chips pick" data-pick="${name}">${items.map(it => {
        const v = typeof it === 'string' ? it : it.name;
        return `<button type="button" class="chip ${current === v ? 'on' : ''}" data-act="pick-one" data-v="${esc(v)}">${render ? render(it) : esc(v)}</button>`;
      }).join('')}<input type="hidden" name="${name}" value="${esc(current || '')}"></div>`;
    const proNum = (name, label, val, unit, step = 1) => `
      <label class="field"><span>${label}</span><span class="pin"><input type="number" inputmode="decimal" min="0" step="${step}" name="${name}" value="${esc(val ?? '')}"><em>${unit}</em></span></label>`;
    // 抽出条件（ノーマル・プロ共通）。蒸らしは選ぶまで空欄扱い
    const brewForm = `
        <section class="pro-sec">
          <h4>抽出条件</h4>
          <div class="grid4">
            ${proNum('p_temp', '温度', brew.temp, '℃')}
            ${proNum('p_amount', '茶葉', brew.amount, esc((linked && linked.unit) || 'g'), 0.5)}
            ${proNum('p_water', 'お湯', brew.water, 'ml', 10)}
            <div class="field"><span>蒸らし</span><span class="pin">${mmssPicker(brew.seconds || 180, 'data-field="p_seconds"')}</span>
              <input type="hidden" name="p_seconds" value="${esc(brew.seconds || '')}"></div>
          </div>
          <p class="hint">空欄の項目は記録しません。</p>
        </section>`;
    const proForm = `
        <section class="pro-sec">
          <h4>茶葉（外観）</h4>
          <label class="field"><span>グレード</span>
            <select name="p_grade"><option value="">選択しない</option>${PRO.grades.map(g => `<option ${P.grade === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
          </label>
        </section>
        <section class="pro-sec">
          <h4>水色（すいしょく）</h4>
          ${pickOne('p_liquor', PRO.liquors, P.liquor, it => `<span class="swatch" style="background:${it.hex}"></span>${esc(it.name)}`)}
          ${pickOne('p_clarity', PRO.clarity, P.clarity)}
        </section>
        <section class="pro-sec">
          <h4>香りの表現</h4>
          <div class="chips pick" id="pro-aroma">${PRO.aromas.map(a => `<button type="button" class="chip ${(P.aromaNotes || []).includes(a.v) ? 'on' : ''}" data-act="toggle-chip" data-v="${esc(a.v)}">${esc(a.v)}</button>`).join('')}</div>
        </section>
        <section class="pro-sec">
          <h4>茶殻（葉底）の色</h4>
          ${pickOne('p_leaf', PRO.leafColors, P.leafColor)}
        </section>
        <section class="pro-sec">
          <h4>品質評価 <span class="pro-total" id="pro-total">${proScore(q)}点</span></h4>
          ${PRO.quality.map(([k, label]) => `
            <label class="slider q-slider"><span>${label}</span>
              <input type="range" min="1" max="10" step="1" name="q_${k}" value="${q[k]}">
              <b class="q-val">${q[k]}</b>
            </label>`).join('')}
          <p class="hint">各10点で採点し、合計を100点満点に換算します。★は総合点から自動で付きます。</p>
        </section>
        <section class="pro-sec">
          <h4>味の特徴（強さ）</h4>
          ${PRO.profile.map(([k, label, lo, hi]) => `
            <label class="slider"><span>${label}</span>
              <input type="range" min="1" max="5" step="1" name="f_${k}" value="${prof[k]}">
              <span class="scale"><em>${lo}</em><em>${hi}</em></span>
            </label>`).join('')}
        </section>`;

    openSheet(isNew ? '味を記録する' : '記録を編集', `
      <form id="note-form" class="form" data-mode="${mode}" data-was-pro="${wasPro ? '1' : ''}">
        <div class="seg" role="tablist" aria-label="記録のモード">
          <button type="button" role="tab" data-act="note-mode" data-mode="normal" aria-selected="${mode === 'normal'}">ノーマル</button>
          <button type="button" role="tab" data-act="note-mode" data-mode="pro" aria-selected="${mode === 'pro'}">プロ${Pro.active || wasPro ? '' : '<em class="pro-tag">PRO</em>'}</button>
        </div>
        <p class="hint mode-hint normal-only">★と味のタグで気軽に記録します。</p>
        <p class="hint mode-hint pro-only">水色・香り・品質評価などを本格的に記録します（100点満点）。</p>
        ${teaField}
        <div class="field normal-only"><span>評価</span>
          <div class="rating" id="rating">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-act="rate" data-v="${v}" class="${v <= n.rating ? 'on' : ''}">★</button>`).join('')}</div>
          <input type="hidden" name="rating" value="${n.rating}">
        </div>
        <div class="row gap">
          <label class="field grow"><span>飲み方</span>
            <select name="style">${['ストレート', 'ミルク', 'レモン', 'アイス', 'その他'].map(v => `<option ${n.style === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label class="field grow"><span>日付</span><input type="date" name="date" value="${toDateInput(n.date)}"></label>
        </div>
        ${brewForm}
        <div class="normal-only form">
          <div class="field"><span>感じた味・香り</span>
            <div class="chips pick" id="normal-tags">${TAGS.map(t => `<button type="button" class="chip ${n.tags.includes(t) ? 'on' : ''}" data-act="toggle-chip" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          </div>
          ${slider('aroma', '香り', '控えめ', '豊か')}
          ${slider('astringency', '渋み', '弱い', '強い')}
          ${slider('body', 'コク', '軽い', '濃い')}
        </div>
        <div class="pro-only form">${proForm}</div>
        <label class="field"><span>メモ</span><textarea name="memo" rows="3" placeholder="香り、合わせたお菓子など">${esc(n.memo || '')}</textarea></label>
        <div class="field"><span>写真（${Pro.active ? `${MAX_PHOTOS}枚まで` : `${FREE_PHOTOS}枚まで・Proは${MAX_PHOTOS}枚`}）</span>
          <div class="thumbs edit" id="note-photos"></div>
        </div>
        <div class="row gap end">
          ${isNew ? '' : '<button type="button" class="btn ghost danger" data-act="delete-note">削除</button>'}
          <button class="btn">保存</button>
        </div>
      </form>`);

    const form = $('#note-form');
    const sel = form.elements.teaId;
    if (sel) sel.addEventListener('change', () => {
      $('#tea-name-field').hidden = sel.value !== '__other';
      // 抽出条件が空なら、選んだ茶葉の淹れ方で埋める
      const t = Store.tea(sel.value);
      const els = ['p_temp', 'p_amount', 'p_water'].map(k => form.elements[k]);
      if (t && t.brew && els.every(el => el.value === '')) {
        [els[0].value, els[1].value, els[2].value] = [t.brew.temp, t.brew.amount, t.brew.water];
        form.elements.p_seconds.value = t.brew.seconds;
        setMmss($('[data-field="p_seconds"]', form), t.brew.seconds);
      }
    });
    // 品質評価のスライダーを動かしたら、点数と合計を更新
    form.addEventListener('input', e => {
      if (!e.target.name || !e.target.name.startsWith('q_')) return;
      e.target.nextElementSibling.textContent = e.target.value;
      $('#pro-total').textContent = proScore(readQuality(form)) + '点';
    });

    // 写真：保存済み（kept）と、この画面で追加したもの（added）を分けて持ち、保存時に反映する
    const kept = [...(n.photos || [])];
    const added = []; // { id, blob, url }
    const photoBox = $('#note-photos');
    function renderPhotos() {
      const total = kept.length + added.length;
      photoBox.innerHTML = kept.map(id => `
          <span class="thumb"><img data-photo="${esc(id)}" alt="記録の写真"><button type="button" class="thumb-del" data-kind="kept" data-id="${esc(id)}" aria-label="写真を外す">×</button></span>`).join('')
        + added.map(p => `
          <span class="thumb"><img src="${p.url}" alt="追加する写真"><button type="button" class="thumb-del" data-kind="added" data-id="${p.id}" aria-label="写真を外す">×</button></span>`).join('')
        + (total < photoLimit() ? `
          <label class="thumb thumb-add">${ICONS.camera}<span>追加</span><input type="file" accept="image/*" multiple hidden></label>`
          : total < MAX_PHOTOS ? `
          <button type="button" class="thumb thumb-add thumb-lock" aria-label="Pro で写真を追加">${ICONS.camera}<span>PRO</span></button>` : '');
      Photos.hydrate(photoBox);
    }
    photoBox.addEventListener('click', e => {
      if (e.target.closest('.thumb-lock')) { openPaywall('photos', renderPhotos); return; }
      const del = e.target.closest('.thumb-del');
      if (!del) return;
      e.preventDefault();
      if (del.dataset.kind === 'kept') kept.splice(kept.indexOf(del.dataset.id), 1);
      else {
        const i = added.findIndex(p => p.id === del.dataset.id);
        URL.revokeObjectURL(added[i].url);
        added.splice(i, 1);
      }
      renderPhotos();
    });
    photoBox.addEventListener('change', async e => {
      const files = [...(e.target.files || [])].slice(0, photoLimit() - kept.length - added.length);
      for (const f of files) {
        try {
          const blob = await Photos.shrink(f);
          added.push({ id: uid(), blob, url: URL.createObjectURL(blob) });
        } catch (err) { toast(err.message); }
      }
      renderPhotos();
    });
    renderPhotos();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const choice = sel ? sel.value : '';
      const teaId = choice && choice !== '__other' ? choice : null;
      const teaName = teaId ? '' : (form.elements.teaName ? form.elements.teaName.value.trim() : '');
      if (!teaId && !teaName) {
        toast(sel ? '在庫から選ぶか、「在庫にない紅茶」を選んで名前を入力してください' : '飲んだ紅茶の名前を入力してください');
        return;
      }
      // 写真の保存と、外した写真の削除
      let photos = [...kept];
      try {
        for (const p of added) { await Photos.put(p.id, p.blob); photos.push(p.id); }
        for (const id of (n.photos || []).filter(id => !kept.includes(id))) await Photos.del(id);
      } catch (err) {
        toast('写真を保存できませんでした');
        photos = [...kept];
      }
      const mode = form.dataset.mode;
      try { localStorage.setItem('teanote.noteMode', mode); } catch (err) { /* 覚えられなくても続行 */ }
      const common = {
        id: n.id || uid(),
        mode,
        teaId,
        teaName,
        photos,
        style: form.elements.style.value,
        date: form.elements.date.value ? new Date(form.elements.date.value + 'T12:00:00').getTime() : Date.now(),
        memo: form.elements.memo.value.trim(),
      };
      // 抽出条件（ノーマル・プロ共通）
      const num = k => (form.elements[k].value === '' ? null : Number(form.elements[k].value));
      common.brew = { temp: num('p_temp'), amount: num('p_amount'), water: num('p_water'), seconds: num('p_seconds') };
      if (mode === 'pro') {
        const pro = {
          brew: common.brew,
          grade: form.elements.p_grade.value,
          liquor: form.elements.p_liquor.value,
          clarity: form.elements.p_clarity.value,
          aromaNotes: $$('#pro-aroma .chip.on', form).map(b => b.dataset.v),
          leafColor: form.elements.p_leaf.value,
          quality: readQuality(form),
          profile: Object.fromEntries(PRO.profile.map(([k]) => [k, Number(form.elements['f_' + k].value)])),
        };
        pro.score = proScore(pro.quality);
        // 好みの分析・並べ替え用に、★・味タグ・香り/渋み/コクも合わせて持つ
        Store.saveNote({
          ...common, pro,
          rating: scoreToStars(pro.score),
          tags: proTags(pro),
          aroma: pro.profile.aromaStrength, astringency: pro.profile.astringency, body: pro.profile.body,
        });
      } else {
        Store.saveNote({
          ...common,
          pro: n.pro, // プロで記録していた内容は残しておく（プロに戻せば使える）
          rating: Number(form.elements.rating.value),
          tags: $$('#normal-tags .chip.on', form).map(b => b.dataset.v),
          aroma: Number(form.elements.aroma.value),
          astringency: Number(form.elements.astringency.value),
          body: Number(form.elements.body.value),
        });
      }
      closeSheet();
      toast('記録しました');
      render();
    });
    form.dataset.id = n.id || '';
  }

  // ---------- 統計（Pro） ----------
  const hbar = (label, v, max, right) => `
    <div class="hbar"><span class="hbar-label">${label}</span>
      <span class="hbar-track"><span style="width:${max ? Math.round(v / max * 100) : 0}%"></span></span>
      <span class="hbar-val">${right}</span></div>`;
  const avgOf = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  // ★4以上の記録によく出てくる味タグ（多い順）
  function tagRank(notes) {
    const c = {};
    notes.filter(n => n.rating >= 4).forEach(n => (n.tags || []).forEach(t => { c[t] = (c[t] || 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }

  function viewStats() {
    const head = '<button class="back" data-act="go" data-to="notes">‹ 記録</button><div class="page-head"><h1>統計</h1></div>';
    if (!Pro.active) return head + `
      <div class="card pro-lock">
        <span class="qi">${ICONS.chart}</span>
        <p class="eyebrow">PRO</p>
        <h3>記録を、グラフでふり返る</h3>
        <p class="muted">月ごとの杯数、よく飲む紅茶、好きな味の傾向や、その変化を見られます。</p>
        <button class="btn" data-act="paywall" data-reason="stats">${STORE_CONFIG.trial}無料で試す</button>
      </div>`;
    const notes = Store.notes;
    if (!notes.length) return head + empty('記録をつけると、ここに統計が表示されます', '<button class="btn" data-act="new-note">味を記録</button>');

    const now = new Date();
    const thisMonth = notes.filter(n => { const d = new Date(n.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
    const names = new Set(notes.map(n => normalize(noteName(n))).filter(Boolean));

    // 月ごとの杯数（直近6か月）
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    const perMonth = months.map(m => notes.filter(n => { const d = new Date(n.date); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); }));
    const maxMonth = Math.max(1, ...perMonth.map(a => a.length));

    // よく飲む紅茶（上位5つ）
    const byTea = {};
    notes.forEach(n => {
      const name = noteName(n) || '（名前なし）';
      (byTea[name] = byTea[name] || []).push(n.rating);
    });
    const topTeas = Object.entries(byTea).sort((a, b) => b[1].length - a[1].length || avgOf(b[1]) - avgOf(a[1])).slice(0, 5);

    // 好きな味、飲み方
    const tags = tagRank(notes).slice(0, 6);
    const styles = {};
    notes.forEach(n => { const s = n.style || 'ストレート'; styles[s] = (styles[s] || 0) + 1; });
    const styleList = Object.entries(styles).sort((a, b) => b[1] - a[1]);

    // 好みの変化：直近3か月と、それより前の好きな味を比べる
    const cut = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    const recentTags = tagRank(notes.filter(n => n.date >= cut)).slice(0, 3).map(([t]) => t);
    const olderTags = tagRank(notes.filter(n => n.date < cut)).slice(0, 3).map(([t]) => t);

    const pros = notes.filter(n => n.mode === 'pro' && n.pro);
    const best = pros.length ? pros.reduce((a, b) => (b.pro.score > a.pro.score ? b : a)) : null;

    return `
      ${head}
      <div class="stat-grid">
        <div class="stat"><b>${notes.length}</b><span>これまでの杯数</span></div>
        <div class="stat"><b>${thisMonth}</b><span>今月の杯数</span></div>
        <div class="stat"><b>${names.size}</b><span>飲んだ紅茶の種類</span></div>
        <div class="stat"><b>${avgOf(notes.map(n => n.rating)).toFixed(1)}</b><span>平均の★</span></div>
      </div>

      <div class="card">
        <h3>月ごとの杯数</h3>
        <div class="mbars">${months.map((m, i) => {
          const list = perMonth[i];
          return `<div class="mbar"><b>${list.length || ''}</b>
            <span class="mbar-col"><span style="height:${Math.round(list.length / maxMonth * 100)}%"></span></span>
            <em>${m.getMonth() + 1}月</em><small>${list.length ? '★' + avgOf(list.map(n => n.rating)).toFixed(1) : ''}</small></div>`;
        }).join('')}</div>
      </div>

      <div class="card">
        <h3>よく飲む紅茶</h3>
        ${topTeas.map(([name, r]) => hbar(esc(name), r.length, topTeas[0][1].length, `${r.length}杯・★${avgOf(r).toFixed(1)}`)).join('')}
      </div>

      <div class="card">
        <h3>好きな味</h3>
        ${tags.length ? tags.map(([t, c]) => hbar(esc(t), c, tags[0][1], `${c}回`)).join('') + '<p class="hint">★4以上の記録で、よく選んだ味です。</p>'
          : '<p class="muted">★4以上の記録に味のタグを付けると表示されます。</p>'}
        ${recentTags.length && olderTags.length ? `
          <div class="trend">
            <p><b class="trend-label">以前</b>${chips(olderTags)}</p>
            <p><b class="trend-label">最近3か月</b>${chips(recentTags, 'accent')}</p>
          </div>` : ''}
      </div>

      <div class="card">
        <h3>飲み方</h3>
        ${styleList.map(([s, c]) => hbar(esc(s), c, notes.length, `${Math.round(c / notes.length * 100)}%`)).join('')}
      </div>

      ${pros.length ? `
        <div class="card">
          <h3>プロの記録</h3>
          <div class="kv">
            <span>記録の数</span><b>${pros.length}件</b>
            <span>平均点</span><b>${avgOf(pros.map(n => n.pro.score)).toFixed(1)}点</b>
            <span>最高点</span><b>${best.pro.score}点（${esc(noteName(best) || '名前なし')}）</b>
          </div>
        </div>` : ''}
    `;
  }

  // ---------- 茶葉・在庫 ----------
  function viewTeas() {
    const teas = [...Store.teas].sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name, 'ja'));
    const lowCount = teas.filter(isLow).length;
    return `
      <div class="page-head"><h1>茶葉・在庫</h1>
        <button class="btn small" data-act="new-tea">＋ 追加</button>
      </div>
      <p class="muted">${teas.length}種類${lowCount ? `・残りわずか ${lowCount}件` : ''}</p>
      ${teas.length ? `<div class="stack">${teas.map(teaCard).join('')}</div>`
        : empty('持っている茶葉を登録しましょう', '<button class="btn" data-act="new-tea">茶葉を登録</button>')}
      <details class="backup">
        <summary>データのバックアップ（茶葉・在庫・記録・写真）</summary>
        <p>登録した<b>茶葉・在庫の量・テイスティング記録（写真を含む）</b>を、まとめて1つのファイルに保存したり、そのファイルから元に戻したりできます。</p>
        <p class="muted">現在のデータ：茶葉 ${Store.teas.length}種類・記録 ${Store.notes.length}件</p>
        <div class="backup-why">
          <b>なぜ必要？</b>
          データはこのスマホのアプリの中だけに保存されています。ホーム画面のアイコンを削除したとき、ブラウザのデータを消去したとき、機種変更したときは消えてしまうため、ときどき書き出しておくと安心です。
        </div>
        <dl class="backup-how">
          <dt>書き出す</dt><dd>今のデータをファイル（tea-note-日付.json）に保存します。iPhone は「ファイル」アプリなどに保存できます。</dd>
          <dt>読み込む</dt><dd>書き出したファイルからデータを戻します。今のデータは置き換わります。</dd>
        </dl>
        <div class="row gap">
          <button class="btn small ghost" data-act="export">書き出す</button>
          <label class="btn small ghost">読み込む<input type="file" accept="application/json" id="import-file" hidden></label>
        </div>
      </details>
    `;
  }

  function viewTeaDetail(id) {
    const t = Store.tea(id);
    if (!t) return empty('茶葉が見つかりません', '<button class="btn" data-act="go" data-to="teas">一覧へ戻る</button>');
    const notes = Store.notesFor(t.id).sort((a, b) => b.date - a.date);
    const avg = notes.length ? (notes.reduce((s, n) => s + n.rating, 0) / notes.length).toFixed(1) : null;
    const b = t.brew || {};
    return `
      <button class="back" data-act="go" data-to="teas">‹ 茶葉一覧</button>
      <section class="detail-head">
        <p class="eyebrow">${esc([t.type, FORMS[t.form] ? FORMS[t.form].label : ''].filter(Boolean).join('・'))}</p>
        <h1>${esc(t.name)}</h1>
        ${t.brand ? `<p class="muted">${esc(t.brand)}</p>` : ''}
        ${t.tags && t.tags.length ? `<div class="chips">${chips(t.tags)}</div>` : ''}
      </section>

      <div class="card">
        <div class="row between"><h3>在庫</h3>${stockBadge(t)}</div>
        <p class="big-num">${stockText(t)}</p>
        <div class="row gap">
          <button class="btn small ghost" data-act="stock-use" data-id="${t.id}">−1杯分</button>
          <button class="btn small ghost" data-act="stock-add" data-id="${t.id}">補充する</button>
          ${buyBtn([t.brand, t.name].filter(Boolean).join(' '), '買い足す')}
        </div>
        ${t.lowAt ? `<p class="muted">${esc(t.lowAt)}${esc(t.unit)}以下で「残りわずか」表示</p>` : ''}
      </div>

      <div class="card">
        <div class="row between"><h3>淹れ方</h3><button class="btn small" data-act="brew" data-id="${t.id}">淹れる</button></div>
        <div class="kv">
          <span>温度</span><b>${esc(b.temp)}℃</b>
          <span>茶葉</span><b>${esc(b.amount)}${esc(t.unit)}</b>
          <span>お湯</span><b>${esc(b.water)}ml</b>
          <span>蒸らし</span><b>${fmtTime((b.seconds || 0) * 1000)}</b>
        </div>
      </div>

      <h2 class="sec">記録 ${avg ? `<small>平均★${avg}</small>` : ''}</h2>
      ${notes.length ? `<div class="stack">${notes.map(noteCard).join('')}</div>` : empty('この茶葉の記録はまだありません')}
      <button class="btn ghost wide" data-act="new-note" data-tea="${t.id}">この茶葉の味を記録</button>

      ${t.memo ? `<p class="memo">${esc(t.memo)}</p>` : ''}
      <div class="row gap end">
        <button class="btn ghost danger" data-act="delete-tea" data-id="${t.id}">削除</button>
        <button class="btn ghost" data-act="edit-tea" data-id="${t.id}">編集</button>
      </div>
      ${prNote()}
    `;
  }

  function openTeaForm(tea = {}) {
    const isNew = !tea.id;
    const form0 = tea.form || 'leaf';
    const p = presetById(FORMS[form0].preset);
    const t = { type: 'その他', form: form0, unit: p.unit, stock: '', lowAt: '', tags: [], brew: { temp: p.temp, amount: p.amount, water: p.water, seconds: p.seconds }, ...tea };
    const num = (name, label, val, unit, step = 1) => `
      <label class="field"><span>${label}</span><span class="pin"><input type="number" inputmode="decimal" min="0" step="${step}" name="${name}" value="${esc(val)}"><em>${unit}</em></span></label>`;
    openSheet(isNew ? '茶葉を登録' : '茶葉を編集', `
      <form id="tea-form" class="form">
        <label class="field"><span>名前 *</span><input name="name" required value="${esc(t.name || '')}" placeholder="例：ダージリン セカンドフラッシュ"></label>
        <label class="field"><span>ブランド・お店</span><input name="brand" value="${esc(t.brand || '')}"></label>
        <div class="row gap">
          <label class="field grow"><span>種類</span><select name="type">${TEA_TYPES.map(v => `<option ${t.type === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field grow"><span>形状</span><select name="form">${Object.entries(FORMS).map(([k, f]) => `<option value="${k}" ${t.form === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
        </div>
        <div class="row gap">
          ${num('stock', '在庫', t.stock, `<span class="unit-label">${esc(t.unit)}</span>`, 0.5)}
          ${num('lowAt', 'お知らせ', t.lowAt, `<span class="unit-label">${esc(t.unit)}</span>以下`, 0.5)}
        </div>
        <div class="field"><span>味の特徴</span>
          <div class="chips pick">${TAGS.map(v => `<button type="button" class="chip ${t.tags.includes(v) ? 'on' : ''}" data-act="toggle-chip" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
        </div>
        <fieldset class="brew-set">
          <legend>淹れ方（形状を変えると目安に戻ります）</legend>
          <div class="grid3">
            ${num('temp', '温度', t.brew.temp, '℃')}
            ${num('amount', '茶葉', t.brew.amount, `<span class="unit-label">${esc(t.unit)}</span>`, 0.5)}
            ${num('water', 'お湯', t.brew.water, 'ml', 10)}
            <div class="field"><span>蒸らし</span><span class="pin">${mmssPicker(t.brew.seconds, 'data-field="seconds"')}<em>分:秒</em></span>
              <input type="hidden" name="seconds" value="${esc(t.brew.seconds)}"></div>
          </div>
        </fieldset>
        <label class="field"><span>メモ</span><textarea name="memo" rows="2">${esc(t.memo || '')}</textarea></label>
        <div class="row gap end"><button class="btn">保存</button></div>
      </form>`);

    const form = $('#tea-form');
    form.elements.form.addEventListener('change', () => {
      const np = presetById(FORMS[form.elements.form.value].preset);
      ['temp', 'amount', 'water', 'seconds'].forEach(k => { form.elements[k].value = np[k]; });
      setMmss($('[data-field="seconds"]', form), np.seconds);
      $$('.unit-label', form).forEach(el => { el.textContent = np.unit; });
      form.dataset.unit = np.unit;
    });
    form.dataset.unit = t.unit;
    form.dataset.teaId = tea.id || '';
    form.addEventListener('submit', e => {
      e.preventDefault();
      const unit = form.dataset.unit;
      const saved = Store.saveTea({
        ...tea,
        id: tea.id || uid(),
        name: form.elements.name.value.trim(),
        brand: form.elements.brand.value.trim(),
        type: form.elements.type.value,
        form: form.elements.form.value,
        unit,
        stock: form.elements.stock.value === '' ? 0 : Number(form.elements.stock.value),
        lowAt: form.elements.lowAt.value === '' ? 0 : Number(form.elements.lowAt.value),
        tags: $$('.chip.on', form).map(b => b.dataset.v),
        brew: {
          temp: Number(form.elements.temp.value), amount: Number(form.elements.amount.value), water: Number(form.elements.water.value),
          seconds: Number(form.elements.seconds.value),
        },
        memo: form.elements.memo.value.trim(),
        createdAt: tea.createdAt || Date.now(),
      });
      closeSheet();
      toast(isNew ? '登録しました' : '保存しました');
      go('tea/' + saved.id);
      render();
    });
  }

  function openRestock(id) {
    const tea = Store.tea(id);
    openSheet('在庫を補充', `
      <form id="restock" class="form">
        <label class="field"><span>${esc(tea.name)}（現在 ${stockText(tea)}）</span>
          <span class="pin"><input type="number" name="add" min="0" step="0.5" inputmode="decimal" value="${tea.unit === '袋' ? 10 : 50}"><em>${esc(tea.unit)}</em></span>
        </label>
        <div class="row gap end"><button class="btn">追加</button></div>
      </form>`);
    $('#restock').addEventListener('submit', e => {
      e.preventDefault();
      Store.adjustStock(id, Number(e.target.elements.add.value || 0));
      closeSheet();
      render();
    });
  }

  // ---------- ガイド ----------
  function viewGuides() {
    return `
      <div class="page-head"><h1>楽しみ方ガイド</h1></div>
      <p class="muted">はじめての方にもわかりやすく、紅茶の楽しみ方を紹介します。</p>
      <div class="guide-grid">${GUIDES.map((g, i) => `
        <article class="card guide-card" data-act="go" data-to="guide/${g.id}">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <h3>${esc(g.title)}</h3>
          <p class="muted">${esc(g.lead)}</p>
        </article>`).join('')}</div>
      <button class="btn ghost wide" data-act="show-onboarding">アプリの使い方をもう一度見る</button>
      ${Platform.store ? `
        <div class="card pro-plan">
          <div class="row between">
            <div><p class="eyebrow">TEA NOTE PRO</p><h3>紅茶ノート Pro</h3>
              <p class="muted">${Pro.active ? '利用中です' : `${STORE_CONFIG.trial}無料・その後${Pro.price}`}</p></div>
            <button class="btn small" data-act="paywall">${Pro.active ? '管理' : '詳しく見る'}</button>
          </div>
        </div>
        <button class="linklike" data-act="open-url" data-url="${esc(STORE_CONFIG.privacyUrl)}">プライバシーポリシー</button>` : ''}
    `;
  }

  function viewGuideDetail(id) {
    const g = guideById(id);
    if (!g) return viewGuides();
    const related = CATALOG.filter(c => c.guide === g.id);
    const tag = g.ordered ? 'ol' : 'ul';
    return `
      <button class="back" data-act="go" data-to="guide">‹ ガイド一覧</button>
      <section class="detail-head"><p class="eyebrow">GUIDE</p><h1>${esc(g.title)}</h1><p>${esc(g.lead)}</p></section>
      <div class="card">
        <h3>${esc(g.listTitle)}</h3>
        <${tag} class="guide-list">${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</${tag}>
      </div>
      <div class="card tips"><h3>ポイント</h3><ul>${g.tips.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>
      ${g.preset ? `<button class="btn wide" data-act="brew-preset" data-preset="${g.preset}" data-label="${esc(g.title)}">この淹れ方でタイマーを使う</button>` : ''}
      ${related.length ? `<h2 class="sec">このガイドに合う茶葉</h2><div class="stack">${related.map(c => `
        <article class="card"><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p><div class="chips">${chips(c.tags)}</div></article>`).join('')}</div>` : ''}
    `;
  }

  // ---------- 紅茶ノート Pro の案内 ----------
  // 記録の入力中にも開けるように、シートとは別の層に重ねて表示する
  const PRO_FEATURES = [
    ['プロのテイスティング記録', '水色・香り・品質を100点満点で採点し、レーダーチャートで比べられます'],
    [`写真を${MAX_PHOTOS}枚まで`, `1つの記録に写真を${MAX_PHOTOS}枚まで付けられます（無料は${FREE_PHOTOS}枚）`],
    ['統計', '月ごとの杯数、よく飲む紅茶、好きな味とその変化をグラフで見られます'],
  ];
  const PAYWALL_REASONS = {
    'pro-note': 'プロの記録は Pro の機能です',
    photos: `写真を${FREE_PHOTOS + 1}枚以上付けるには Pro が必要です`,
    stats: '統計は Pro の機能です',
  };
  let paywallThen = null; // Pro になったあとに続ける操作

  function openPaywall(reason, then) {
    closePaywall();
    paywallThen = then || null;
    const el = document.createElement('div');
    el.id = 'paywall';
    el.className = 'paywall';
    el.innerHTML = `
      <div class="sheet-backdrop" data-act="paywall-close"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="紅茶ノート Pro">
        <div class="sheet-head"><span></span><button class="icon-btn" data-act="paywall-close" aria-label="閉じる">×</button></div>
        <div class="pw-hero">
          <span class="pw-cup">${ICONS.cup}</span>
          <p class="eyebrow">TEA NOTE PRO</p>
          <h2>紅茶ノート Pro</h2>
          ${PAYWALL_REASONS[reason] ? `<p class="pw-reason">${PAYWALL_REASONS[reason]}</p>` : ''}
        </div>
        <ul class="pw-list">${PRO_FEATURES.map(([t, d]) => `<li>${ICONS.check}<div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join('')}</ul>
        ${Pro.active ? `
          <p class="pw-on">Pro を利用中です。ありがとうございます。</p>
          <button class="btn ghost wide" data-act="pro-manage">定期購入の管理・解約</button>` : `
          <button class="btn ghost wide" data-act="pro-restore">購入済みの方はこちら（復元）</button>`}
        <button class="linklike" data-act="open-url" data-url="${esc(STORE_CONFIG.privacyUrl)}">プライバシーポリシー</button>
        ${Pro.active ? '' : `
          <div class="pw-cta">
            <button class="btn big wide" data-act="pro-buy">${STORE_CONFIG.trial}無料で試す</button>
            <p class="pw-terms">無料期間のあとは${esc(Pro.price)}（自動更新）。無料期間中に解約すれば、料金はかかりません。解約は Google Play の「定期購入」からいつでもできます。</p>
          </div>`}
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('locked');
  }
  function closePaywall() {
    const el = $('#paywall');
    paywallThen = null;
    if (!el) return;
    el.remove();
    if (!$('#sheet-root').childElementCount) document.body.classList.remove('locked');
  }
  function unlocked(msg) {
    const then = paywallThen;
    closePaywall();
    toast(msg);
    render();
    if (then) then();
  }

  // ---------- シート・トースト ----------
  let sheetOnClose = null;
  function openSheet(title, body, onClose) {
    closeSheet();
    sheetOnClose = onClose || null;
    $('#sheet-root').innerHTML = `
      <div class="sheet-backdrop" data-act="sheet-close"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="sheet-close" aria-label="閉じる">×</button></div>
        <div class="sheet-body">${body}</div>
      </div>`;
    document.body.classList.add('locked');
  }
  function closeSheet() {
    if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
    $('#sheet-root').innerHTML = '';
    document.body.classList.remove('locked');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ---------- 操作 ----------
  const actions = {
    'go': el => go(el.dataset.to),
    'open-tea': el => go('tea/' + el.dataset.id),
    'brew': el => { Timer.setup(cfgFromTea(Store.tea(el.dataset.id))); go('timer'); render(); },
    'brew-preset': el => { Timer.setup(cfgFromPreset(el.dataset.preset, el.dataset.label)); go('timer'); render(); },
    'new-tea': () => openTeaForm(),
    'edit-tea': el => openTeaForm(Store.tea(el.dataset.id)),
    'delete-tea': el => {
      const t = Store.tea(el.dataset.id);
      if (t && confirm(`「${t.name}」を削除しますか？（記録は残ります）`)) { Store.deleteTea(t.id); go('teas'); toast('削除しました'); }
    },
    'stock-use': el => {
      const t = Store.tea(el.dataset.id);
      Store.adjustStock(t.id, -Number((t.brew && t.brew.amount) || 1));
      render();
    },
    'stock-add': el => openRestock(el.dataset.id),
    'new-note': el => {
      const init = el.dataset.tea ? { teaId: el.dataset.tea } : {};
      // 記録タブでカレンダーの日付を選んでいるときは、その日付で記録する
      if (parseHash().name === 'notes' && calDay) init.date = new Date(calDay + 'T12:00:00').getTime();
      openNoteForm(init);
    },
    'cal-move': el => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(el.dataset.step), 1);
      render();
    },
    'cal-day': el => { calDay = calDay === el.dataset.day ? '' : el.dataset.day; render(); },
    'cal-clear': () => { calDay = ''; render(); },
    'edit-note': el => openNoteForm(Store.note(el.dataset.id)),
    'delete-note': () => {
      const id = $('#note-form').dataset.id;
      if (!id || !confirm('この記録を削除しますか？（写真も削除されます）')) return;
      (Store.note(id).photos || []).forEach(p => Photos.del(p).catch(() => {}));
      Store.deleteNote(id);
      closeSheet();
      render();
      toast('削除しました');
    },
    'view-photo': el => {
      openSheet('写真', `<img class="photo-full" data-photo="${esc(el.dataset.photoId)}" alt="記録の写真">`);
      Photos.hydrate($('#sheet-root'));
    },
    'rate': el => {
      const v = Number(el.dataset.v);
      $("#note-form").elements.rating.value = v;
      $$('#rating button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) <= v));
    },
    'toggle-chip': el => el.classList.toggle('on'),
    // 1つだけ選ぶチップ（もう一度押すと選択を外す）
    'pick-one': el => {
      const box = el.closest('[data-pick]');
      const on = !el.classList.contains('on');
      $$('.chip', box).forEach(c => c.classList.remove('on'));
      el.classList.toggle('on', on);
      box.querySelector('input[type=hidden]').value = on ? el.dataset.v : '';
    },
    'home-notes': el => {
      try { localStorage.setItem('teanote.homeNotes', el.dataset.v); } catch (e) { /* 覚えられなくても表示は切り替える */ }
      render();
    },
    'note-mode': el => {
      const form = $('#note-form');
      const apply = () => {
        form.dataset.mode = el.dataset.mode;
        $$('[data-act="note-mode"]', form).forEach(b => b.setAttribute('aria-selected', String(b === el)));
        const tag = $('.pro-tag', el);
        if (tag) tag.remove();
      };
      if (el.dataset.mode === 'pro' && !Pro.active && !form.dataset.wasPro) openPaywall('pro-note', apply);
      else apply();
    },
    'sheet-close': () => closeSheet(),
    'paywall': el => openPaywall(el.dataset.reason),
    'paywall-close': () => closePaywall(),
    'pro-buy': async el => {
      el.disabled = true;
      try {
        if (await Pro.purchase()) unlocked('Pro を始めました');
      } catch (e) { toast(e.message); } finally { el.disabled = false; }
    },
    'pro-restore': async el => {
      el.disabled = true;
      try {
        if (await Pro.restore()) unlocked('Pro を戻しました');
        else toast('購入済みの Pro が見つかりませんでした');
      } catch (e) { toast(e.message); } finally { el.disabled = false; }
    },
    'pro-manage': () => Pro.manage(),
    'open-url': el => Platform.openExternal(el.dataset.url),
    'show-onboarding': () => window.showOnboarding && window.showOnboarding(),
    'news-filter': el => { newsFilter = el.dataset.q; render(); },
    'news-retry': () => { newsState = 'idle'; render(); },
    'timer-start': () => Timer.start(),
    'timer-pause': () => Timer.pause(),
    'timer-reset': () => Timer.reset(),
    'done-close': () => { applyConsume(); Timer.reset(); },
    'done-note': () => {
      applyConsume();
      const c = Timer.state.cfg;
      Timer.reset();
      openNoteForm({
        teaId: c.teaId || null, teaName: c.teaId ? '' : c.label, style: c.style || 'ストレート',
        brew: { temp: c.temp, amount: c.amount, water: c.water, seconds: c.seconds }, // プロの抽出条件に使う
      });
    },
    'export': async () => {
      // 茶葉・記録に加えて、記録の写真もまとめて1つのファイルにする
      const data = JSON.parse(Store.exportJSON());
      try {
        data.photos = await Photos.exportAll(Store.notes.flatMap(n => n.photos || []));
      } catch (e) {
        toast('写真を含めずに書き出しました');
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tea-note-${toDateInput(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    // カード内のボタンを押したときに、カード自体の動作が走らないようにする
    e.stopPropagation();
    if (el.tagName === 'BUTTON' && el.type !== 'submit') e.preventDefault();
    actions[el.dataset.act](el);
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'timer-src') {
      const [kind, id] = e.target.value.split(':');
      Timer.setup(kind === 'tea' ? cfgFromTea(Store.tea(id)) : cfgFromPreset(id));
      render();
    } else if (e.target.dataset.part) {
      // 分・秒の選択（タイマーの設定、または茶葉フォームの hidden 入力に反映）
      const wrap = e.target.closest('[data-mmss]');
      const sec = mmssValue(wrap);
      if (wrap.dataset.timeParam) { Timer.update({ [wrap.dataset.timeParam]: sec }); render(); }
      else if (wrap.dataset.field) wrap.closest('form').elements[wrap.dataset.field].value = sec;
    } else if (e.target.dataset.param) {
      Timer.update({ [e.target.dataset.param]: Number(e.target.value) || 0 });
      render();
    } else if (e.target.id === 'import-file' && e.target.files[0]) {
      e.target.files[0].text().then(async text => {
        if (!confirm('今のデータを読み込んだデータで置き換えます。よろしいですか？')) return;
        try {
          Store.importJSON(text);
          const { photos } = JSON.parse(text);
          if (photos) await Photos.importAll(photos); // 写真を含まない古いファイルなら写真はそのまま
          toast('読み込みました');
          render();
        } catch (err) { toast('読み込めませんでした：' + err.message); }
      });
    } else if (e.target.id === 'note-sort') {
      noteSort = e.target.value;
      refreshNoteList();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'note-q') {
      noteQuery = e.target.value;
      refreshNoteList();
    }
  });

  $('#mini-timer').addEventListener('click', () => go('timer'));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#paywall')) closePaywall(); else closeSheet();
  });
  // Pro の状態が変わったら（購入・解約・ストアでの確認）表示を更新する
  Pro.subscribe(() => render());

  Timer.subscribe(() => {
    if (parseHash().name === 'timer') render(); else updateMiniTimer();
    if (Timer.state.done && parseHash().name !== 'timer') toast('お茶が入りました');
  });
  setInterval(() => { updateTimerDisplay(); updateMiniTimer(); }, 250);

  window.addEventListener('hashchange', () => { closePaywall(); closeSheet(); render(); });
  render();
})();
