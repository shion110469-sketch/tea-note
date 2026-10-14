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
  const MAX_PHOTOS = 3; // 1つの記録に付けられる写真の数

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
      news: viewNews,
    };
    const key = name + '/' + arg;
    // 記録タブを開き直したら、カレンダーは今月・日付の選択なしに戻す
    if (key !== lastRoute && name === 'notes') {
      calDay = '';
      calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      noteQuery = '';
    }
    view.innerHTML = (routes[name] || viewHome)();
    Photos.hydrate(view);
    const tab = { tea: 'teas' }[name] || name;
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

  const noteName = n => { const tea = n.teaId && Store.tea(n.teaId); return tea ? tea.name : n.teaName || ''; };

  function noteCard(n) {
    const photos = n.photos || [];
    return `
      <article class="card note-card" data-act="edit-note" data-id="${n.id}">
        <div class="row between">
          <h3>${esc(noteName(n) || '（紅茶の名前なし）')}</h3>
          <span class="stars">${stars(n.rating)}</span>
        </div>
        <p class="muted">${fmtDate(n.date)}・${esc(n.style || 'ストレート')}</p>
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
    const recent = [...Store.notes].sort((a, b) => b.date - a.date).slice(0, 3);
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
      ${low.length ? `<div class="alert" data-act="go" data-to="teas"><b>在庫が少なくなっています</b><span>${low.map(t => esc(t.name)).join('、')}</span></div>` : ''}

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
          </div>
        </article>`).join('')}</div>

      <h2 class="sec">最近の記録</h2>
      ${recent.length ? `<div class="stack">${recent.map(noteCard).join('')}</div>`
        : empty('飲んだ紅茶の感想を記録すると、好みに合わせた提案が届きます', '<button class="btn" data-act="new-note">最初の記録をつける</button>')}
    `;
  }

  // ---------- ニュース ----------
  // news.json は GitHub Actions が定期的に更新する（scripts/fetch-news.ps1）
  let news = null, newsState = 'idle', newsFilter = '';

  function loadNews() {
    if (newsState !== 'idle') return; // 失敗時は「再読み込み」ボタンで idle に戻す
    newsState = 'loading';
    fetch('news.json', { cache: 'no-cache' })
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
    const timeParam = (key, label) => `
      <div class="param param-time"><span>${label}</span>
        <span class="pin">${mmssPicker(c[key], `data-time-param="${key}"`, s.running)}<em>分:秒</em></span>
      </div>`;

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
        ${timeParam('seconds', '蒸らし')}
      </div>

      <div class="ring-wrap">
        <svg viewBox="0 0 240 240" class="ring" aria-hidden="true">
          <defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ring-stop-1"/><stop offset="1" class="ring-stop-2"/></linearGradient></defs>
          <circle cx="120" cy="120" r="110" class="ring-bg"/>
          <circle cx="120" cy="120" r="110" class="ring-fg" id="ring-fg" stroke-dasharray="${RING}" stroke-dashoffset="0"/>
        </svg>
        <div class="ring-center">
          <p class="ring-label">${esc(c.label)}</p>
          <p class="digits" id="timer-digits">0:00</p>
          <p class="muted">${esc(c.temp)}℃・${esc(c.amount)}${esc(c.unit)}・${esc(c.water)}ml</p>
        </div>
      </div>

      <div class="timer-btns">
        <button class="btn ghost" data-act="timer-reset">リセット</button>
        ${s.running
          ? '<button class="btn big" data-act="timer-pause">一時停止</button>'
          : `<button class="btn big" data-act="timer-start" ${s.done ? 'disabled' : ''}>${s.remaining != null && !s.done ? '再開' : 'スタート'}</button>`}
      </div>

      ${s.done ? `
        <div class="card done-panel">
          <h3>お茶が入りました</h3>
          ${tea && !s.consumed ? `<label class="check"><input type="checkbox" id="consume" checked> 在庫から ${esc(c.amount)}${esc(c.unit)} 減らす（現在 ${stockText(tea)}）</label>` : ''}
          <div class="row gap">
            <button class="btn" data-act="done-note">味を記録する</button>
            <button class="btn ghost" data-act="done-close">閉じる</button>
          </div>
        </div>` : ''}
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
        const text = normalize([noteName(n), n.memo, n.style, ...(n.tags || [])].join(' '));
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
    openSheet(isNew ? '味を記録する' : '記録を編集', `
      <form id="note-form" class="form">
        ${teaField}
        <div class="field"><span>評価</span>
          <div class="rating" id="rating">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-act="rate" data-v="${v}" class="${v <= n.rating ? 'on' : ''}">★</button>`).join('')}</div>
          <input type="hidden" name="rating" value="${n.rating}">
        </div>
        <div class="row gap">
          <label class="field grow"><span>飲み方</span>
            <select name="style">${['ストレート', 'ミルク', 'レモン', 'アイス', 'その他'].map(v => `<option ${n.style === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label class="field grow"><span>日付</span><input type="date" name="date" value="${toDateInput(n.date)}"></label>
        </div>
        <div class="field"><span>感じた味・香り</span>
          <div class="chips pick">${TAGS.map(t => `<button type="button" class="chip ${n.tags.includes(t) ? 'on' : ''}" data-act="toggle-chip" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>
        ${slider('aroma', '香り', '控えめ', '豊か')}
        ${slider('astringency', '渋み', '弱い', '強い')}
        ${slider('body', 'コク', '軽い', '濃い')}
        <label class="field"><span>メモ</span><textarea name="memo" rows="3" placeholder="香り、合わせたお菓子など">${esc(n.memo || '')}</textarea></label>
        <div class="field"><span>写真（${MAX_PHOTOS}枚まで）</span>
          <div class="thumbs edit" id="note-photos"></div>
        </div>
        <div class="row gap end">
          ${isNew ? '' : '<button type="button" class="btn ghost danger" data-act="delete-note">削除</button>'}
          <button class="btn">保存</button>
        </div>
      </form>`);

    const form = $('#note-form');
    const sel = form.elements.teaId;
    if (sel) sel.addEventListener('change', () => { $('#tea-name-field').hidden = sel.value !== '__other'; });

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
        + (total < MAX_PHOTOS ? `
          <label class="thumb thumb-add">${ICONS.camera}<span>追加</span><input type="file" accept="image/*" multiple hidden></label>` : '');
      Photos.hydrate(photoBox);
    }
    photoBox.addEventListener('click', e => {
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
      const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS - kept.length - added.length);
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
      Store.saveNote({
        id: n.id || uid(),
        teaId,
        teaName,
        photos,
        rating: Number(form.elements.rating.value),
        style: form.elements.style.value,
        date: form.elements.date.value ? new Date(form.elements.date.value + 'T12:00:00').getTime() : Date.now(),
        tags: $$('.chip.on', form).map(b => b.dataset.v),
        aroma: Number(form.elements.aroma.value),
        astringency: Number(form.elements.astringency.value),
        body: Number(form.elements.body.value),
        memo: form.elements.memo.value.trim(),
      });
      closeSheet();
      toast('記録しました');
      render();
    });
    form.dataset.id = n.id || '';
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
    'sheet-close': () => closeSheet(),
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
      openNoteForm({ teaId: c.teaId || null, teaName: c.teaId ? '' : c.label, style: c.style || 'ストレート' });
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  Timer.subscribe(() => {
    if (parseHash().name === 'timer') render(); else updateMiniTimer();
    if (Timer.state.done && parseHash().name !== 'timer') toast('お茶が入りました');
  });
  setInterval(() => { updateTimerDisplay(); updateMiniTimer(); }, 250);

  window.addEventListener('hashchange', () => { closeSheet(); render(); });
  render();
})();
