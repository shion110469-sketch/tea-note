// 端末内（localStorage）にデータを保存する

const Store = (() => {
  const KEY = 'teanote.v1';
  let state = load();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.teas) && Array.isArray(s.notes)) return s;
    } catch (e) { /* 読めないときは空で始める */ }
    return { teas: [], notes: [] };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('保存に失敗しました', e); }
  }

  function upsert(list, item) {
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    save();
    return item;
  }

  return {
    get teas() { return state.teas; },
    get notes() { return state.notes; },
    tea: id => state.teas.find(t => t.id === id),
    note: id => state.notes.find(n => n.id === id),
    findByBarcode: code => state.teas.find(t => t.barcode && t.barcode === code),
    notesFor: teaId => state.notes.filter(n => n.teaId === teaId),

    saveTea: t => upsert(state.teas, t),
    saveNote: n => upsert(state.notes, n),
    deleteTea(id) { state.teas = state.teas.filter(t => t.id !== id); save(); },
    deleteNote(id) { state.notes = state.notes.filter(n => n.id !== id); save(); },

    // 在庫を増減する（マイナスにはしない）
    adjustStock(id, delta) {
      const t = this.tea(id);
      if (!t) return;
      t.stock = Math.max(0, Math.round((Number(t.stock || 0) + delta) * 10) / 10);
      if (delta < 0) t.lastBrewedAt = Date.now();
      save();
    },

    exportJSON: () => JSON.stringify(state, null, 2),
    importJSON(text) {
      const s = JSON.parse(text);
      if (!s || !Array.isArray(s.teas) || !Array.isArray(s.notes)) throw new Error('形式が正しくありません');
      state = { teas: s.teas, notes: s.notes };
      save();
    },
  };
})();
