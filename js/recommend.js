// 記録から好みを分析し、茶葉を提案する
// 評価★4〜5はプラス、★1〜2はマイナスとして、味タグと茶葉タイプごとに点数を積み上げる

const Recommend = (() => {
  const DAY = 24 * 60 * 60 * 1000;

  function profile() {
    const tags = {}, types = {};
    let count = 0;
    Store.notes.forEach(note => {
      const w = (note.rating || 3) - 3;
      if (!w) return;
      count++;
      const tea = note.teaId && Store.tea(note.teaId);
      const noteTags = new Set([...(note.tags || []), ...(tea ? tea.tags || [] : [])]);
      noteTags.forEach(t => { tags[t] = (tags[t] || 0) + w; });
      const type = tea ? tea.type : note.teaType;
      if (type) types[type] = (types[type] || 0) + w;
    });
    return { tags, types, count };
  }

  function likedTags(p, k = 3) {
    return Object.entries(p.tags).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, k).map(([t]) => t);
  }

  function tagScore(tags, p) {
    if (!tags || !tags.length) return 0;
    return tags.reduce((s, t) => s + (p.tags[t] || 0), 0) / Math.sqrt(tags.length);
  }

  function matchReason(tags, p) {
    const liked = likedTags(p, 5);
    const hit = (tags || []).filter(t => liked.includes(t)).slice(0, 2);
    return hit.length ? `「${hit.join('」「')}」がお好きな傾向から` : '';
  }

  // 在庫の中から今日の一杯を選ぶ
  function fromStock(limit = 3) {
    const p = profile();
    return Store.teas
      .filter(t => Number(t.stock) > 0)
      .map(t => {
        const notes = Store.notesFor(t.id);
        const avg = notes.length ? notes.reduce((s, n) => s + n.rating, 0) / notes.length : 0;
        const idleDays = t.lastBrewedAt ? Math.floor((Date.now() - t.lastBrewedAt) / DAY) : null;
        let score = tagScore(t.tags, p) + (p.types[t.type] || 0) * 0.5;
        if (avg) score += (avg - 3);
        score += idleDays == null ? 0.5 : Math.min(idleDays, 14) / 14;
        const reasons = [];
        if (avg >= 4) reasons.push(`お気に入り（平均★${avg.toFixed(1)}）`);
        const m = matchReason(t.tags, p);
        if (m) reasons.push(m);
        if (idleDays != null && idleDays >= 7) reasons.push(`${idleDays}日ぶりにいかが？`);
        if (idleDays == null) reasons.push('まだ淹れていない茶葉です');
        return { tea: t, score, reason: reasons[0] || '在庫からのおすすめ' };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // まだ持っていない種類から次に試したい茶葉を提案する
  function discover(limit = 3) {
    const p = profile();
    if (p.count < 2) {
      return CATALOG.filter(c => c.beginner).slice(0, limit)
        .map(item => ({ item, reason: 'はじめての方にも飲みやすい一杯' }));
    }
    const ownedTypes = new Set(Store.teas.map(t => t.type));
    // 登録済み・記録済みの茶葉と同じものは提案しない（「ウバ（セイロン）」→「ウバ」で照合）
    const tried = [...Store.teas.map(t => t.name), ...Store.notes.map(n => n.teaName)].filter(Boolean).map(s => s.replace(/\s/g, ''));
    const isTried = item => {
      const core = item.name.replace(/（.*?）/g, '').replace(/\s/g, '');
      return tried.some(name => name.includes(core));
    };
    return CATALOG
      .filter(item => !isTried(item))
      .map(item => {
        let score = tagScore(item.tags, p) + (p.types[item.type] || 0) * 0.5;
        const owned = ownedTypes.has(item.type);
        if (owned) score -= 1;
        const reason = matchReason(item.tags, p) || (owned ? '' : 'まだ試していないタイプ');
        return { item, score, reason: reason || '新しい味の発見に' };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  return { profile, likedTags, fromStock, discover };
})();
