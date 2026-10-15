// 線画アイコン（currentColor で色を継承）

const ICONS = (() => {
  const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return {
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>'),
    note: svg('<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6M9 8h3"/>'),
    leaf: svg('<path d="M4 20c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M4 20l9-9"/>'),
    news: svg('<path d="M4 5h13v14a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v10a1 1 0 0 1-2 0"/><path d="M7 9h7M7 13h7M7 16h4"/>'),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    chart: svg('<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    cup: svg('<path d="M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H16.5"/><path d="M3 21h16"/><path d="M8 3c-1 1.2 1 2 0 3.5M12 3c-1 1.2 1 2 0 3.5"/>'),
  };
})();
