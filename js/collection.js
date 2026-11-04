/*
 * Логика коллекции: поиск, фильтры, сортировка и сводка.
 * Отрисовка находится в views/collection-view.js.
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;

  const SORTS = {
    value_desc: 'Стоимость: сначала дорогие',
    value_asc: 'Стоимость: сначала дешёвые',
    rarity_desc: 'Редкость: сначала редкие',
    rarity_asc: 'Редкость: сначала обычные',
    date_desc: 'Дата: сначала новые',
    date_asc: 'Дата: сначала старые',
  };

  const seq = (n) => parseInt(n.id.slice(1), 10) || 0;

  /** «+000 77 777» → «77777»: префикс отбрасывается, остаются только цифры (не более 9). */
  function normalizeSearch(str) {
    let s = String(str || '').trim();
    if (s.charAt(0) === '+') s = s.replace(/^\+\s*0\s*0\s*0/, '');
    return s.replace(/\D/g, '').slice(0, 9);
  }

  function query(state, opts) {
    const o = opts || {};
    const E = NT.economy, G = NT.gen;
    let list = state.collection.slice();
    const q = normalizeSearch(o.search);
    if (q) list = list.filter((n) => n.body.indexOf(q) !== -1);
    if (o.rarity && o.rarity !== 'all') list = list.filter((n) => n.rarity === o.rarity);
    if (o.classId && o.classId !== 'all') list = list.filter((n) => n.classId === o.classId);
    if (o.status && o.status !== 'all') list = list.filter((n) => n.status === o.status);
    const values = new Map();
    list.forEach((n) => values.set(n.id, E.currentValue(state, n)));
    const v = (n) => values.get(n.id);
    const r = (n) => G.rarityIndex(n.rarity);
    const sorters = {
      value_desc: (a, b) => v(b) - v(a) || seq(b) - seq(a),
      value_asc: (a, b) => v(a) - v(b) || seq(a) - seq(b),
      rarity_desc: (a, b) => r(b) - r(a) || b.score - a.score || v(b) - v(a),
      rarity_asc: (a, b) => r(a) - r(b) || a.score - b.score || v(a) - v(b),
      date_desc: (a, b) => seq(b) - seq(a),
      date_asc: (a, b) => seq(a) - seq(b),
    };
    list.sort(sorters[o.sort] || sorters.date_desc);
    return { items: list, values, search: q };
  }

  function summary(state) {
    const E = NT.economy;
    const byRarity = {};
    C.rarities.forEach((r) => { byRarity[r.id] = 0; });
    let total = 0, listed = 0, listedValue = 0, offers = 0;
    for (const n of state.collection) {
      const val = E.currentValue(state, n);
      total += val;
      byRarity[n.rarity] += 1;
      if (n.status === 'listed') { listed += 1; listedValue += val; if (n.offer) offers += 1; }
    }
    return { count: state.collection.length, total, byRarity, listed, listedValue, offers };
  }

  NT.collection = { SORTS, normalizeSearch, query, summary };
})(window.NT = window.NT || {});
