/*
 * Магазин: каталог классов карт, таблицы вероятностей, ожидаемая отдача и покупка в запас.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const E = () => NT.economy;
  const ui = () => NT.ui;

  let root = null, headAside = null, grid = null, info = null;
  const qty = {};
  C.classes.forEach((c) => { qty[c.id] = 1; });

  function mount(el) {
    root = el;
    headAside = h('div', { class: 'head-aside' });
    info = h('div', { class: 'shop-info' });
    grid = h('div', { class: 'shop-grid' });
    root.append(ui().pageHead('Магазин карт', 'Каждая карта активирует ровно один номер. Цена одинакова для SIM и eSIM — различается только характер узоров.', headAside), info, grid);
  }

  function update() {
    if (!root) return;
    const s = G().state;
    const ff = s.settings.formFactor;
    ui().preserveFocus(headAside, () => {
      U.clear(headAside).appendChild(ui().segmented(Object.keys(C.formFactors).map((id) => ({ value: id, label: C.formFactors[id].name, icon: id })), ff,
        (v) => G().setSetting('formFactor', v), 'Тип карты', 'seg-ff'));
    });
    const pv = NT.gen.validateProbabilities();
    U.clear(info).append(
      h('div', { class: 'info-pill' }, icon('coin'), 'Баланс: ', h('b', { class: 'mono' }, U.gbp(s.balance))),
      h('div', { class: 'info-pill ' + (pv.ok ? 'ok' : 'bad') }, icon(pv.ok ? 'check' : 'warn'), pv.ok ? 'Все таблицы вероятностей проверены: сумма каждой = 100%' : 'Ошибка конфигурации: ' + pv.problems.join('; ')),
      h('div', { class: 'info-pill' }, icon(ff), C.formFactors[ff].description));
    ui().preserveFocus(grid, () => {
      U.clear(grid);
      C.classes.forEach((c) => grid.appendChild(classCard(c, ff, s)));
    });
  }
  const icon = (n) => ui().icon(n);

  function classCard(c, ff, s) {
    const ins = E().classInsights(c.id, ff);
    const price = ins.price;
    const invSim = s.inventory[G().invKey('sim', c.id)], invEsim = s.inventory[G().invKey('esim', c.id)];
    const sum = C.rarities.reduce((a, r) => a + (c.probabilities[r.id] || 0), 0);
    const maxP = Math.max.apply(null, C.rarities.map((r) => c.probabilities[r.id] || 0));

    const table = h('table', { class: 'prob-table' },
      h('caption', { class: 'sr-only' }, 'Вероятности редкостей для класса «' + c.name + '»'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Редкость'), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Шкала')), h('th', { scope: 'col', class: 'num-col' }, 'Шанс'))));
    const tb = h('tbody');
    C.rarities.forEach((r) => {
      const p = c.probabilities[r.id] || 0;
      tb.appendChild(h('tr', null,
        h('td', null, ui().rarityBadge(r.id, 'sm')),
        h('td', { class: 'bar-col' }, h('div', { class: 'pbar r-bg-' + r.id, style: { width: Math.max(1.5, (p / maxP) * 100) + '%' } })),
        h('td', { class: 'num-col mono' }, U.pctRaw(p, 2))));
    });
    tb.appendChild(h('tr', { class: 'sum-row' }, h('td', null, 'Итого'), h('td'), h('td', { class: 'num-col mono ' + (Math.abs(sum - 100) < 1e-6 ? 'pos' : 'neg') }, U.pctRaw(sum, 2))));
    table.appendChild(tb);

    const ranges = h('details', { class: 'ranges' }, h('summary', null, 'Диапазоны стоимости номеров'),
      h('ul', { class: 'range-list' }, ins.valueRange.map((v) => h('li', null, ui().rarityBadge(v.rarity, 'sm'), h('span', { class: 'mono' }, U.gbpShort(v.min) + ' — ' + U.gbpShort(v.max))))),
      h('p', { class: 'hint' }, 'Точная цена зависит от оценки красоты внутри редкости, индивидуального разброса ±6% и текущего рынка.'));

    const q = qty[c.id];
    const total = price * q;
    const afford = total <= s.balance;
    const maxAfford = Math.max(0, Math.min(1000, Math.floor(s.balance / price)));
    const qtyId = 'qty-' + c.id;
    const input = h('input', { id: qtyId, class: 'input qty-input mono', type: 'number', min: '1', max: '1000', step: '1', value: String(q), inputmode: 'numeric', 'data-fk': 'qty-' + c.id, 'aria-label': 'Количество карт «' + c.short + '»' });
    input.addEventListener('change', () => { setQty(c.id, input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { setQty(c.id, input.value); buy(c.id); } });
    const rtpCls = c.targetRtp >= 1 ? 'pos' : c.targetRtp >= 0.9 ? 'warn-t' : 'neg';

    return h('article', { class: 'shop-card c-' + c.id, 'aria-label': c.name },
      h('div', { class: 'shop-card-head' },
        h('div', null, h('span', { class: 'cc-tier', 'aria-hidden': 'true' }, '●'.repeat(c.tier) + '○'.repeat(5 - c.tier)), h('h2', { class: 'shop-card-title' }, c.name)),
        h('div', { class: 'shop-price mono' }, U.gbp(price), h('span', { class: 'hint' }, U.rub(price) + ' · ' + C.formFactors[ff].short))),
      h('p', { class: 'shop-desc' }, c.description),
      h('div', { class: 'shop-stock' }, icon('sim'), 'В запасе: SIM ', h('b', { class: 'mono' }, U.num(invSim)), ' · eSIM ', h('b', { class: 'mono' }, U.num(invEsim))),
      table,
      h('div', { class: 'metric-grid' },
        metric('Средняя стоимость номера', '≈ ' + U.gbp(ins.expectedValue)),
        metric('Средняя отдача (RTP)', U.pct(ins.rtp, 0), rtpCls),
        metric('Шанс Epic и выше', U.pctRaw(ins.epicPlus, 2)),
        metric('Престиж серии', '×' + ins.prestige.toFixed(2).replace('.', ','))),
      ranges,
      h('div', { class: 'buy-box' },
        h('div', { class: 'qty' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Меньше', 'data-fk': 'dec-' + c.id, disabled: q <= 1, onclick: () => setQty(c.id, q - 1) }, icon('minus')),
          input,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Больше', 'data-fk': 'inc-' + c.id, disabled: q >= 1000, onclick: () => setQty(c.id, q + 1) }, icon('plus'))),
        h('div', { class: 'qty-quick', role: 'group', 'aria-label': 'Быстрый выбор количества' },
          [1, 5, 10, 50].map((n) => h('button', { type: 'button', class: 'chip-btn' + (q === n ? ' active' : ''), 'data-fk': 'qq-' + c.id + '-' + n, onclick: () => setQty(c.id, n) }, '×' + n)),
          maxAfford > 0 ? h('button', { type: 'button', class: 'chip-btn', 'data-fk': 'qq-' + c.id + '-max', onclick: () => setQty(c.id, maxAfford), title: 'Максимум по балансу' }, 'Макс') : null),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-fk': 'buy-' + c.id, disabled: !afford, onclick: () => buy(c.id) },
          'Купить ×' + q, h('span', { class: 'btn-price mono' }, U.gbp(total))),
        !afford ? h('p', { class: 'hint neg' }, 'Недостаточно средств: не хватает ' + U.gbp(total - s.balance)) : null,
        h('button', { type: 'button', class: 'btn btn-ghost btn-block', 'data-fk': 'go-' + c.id, onclick: () => { G().setSetting('selectedClass', c.id); ui().go('home'); } }, icon('spark'), 'Выбрать в генераторе')));
  }

  function metric(label, value, cls) {
    return h('div', { class: 'metric' }, h('span', { class: 'metric-label' }, label), h('span', { class: 'metric-value mono' + (cls ? ' ' + cls : '') }, value));
  }

  function setQty(id, v) {
    const n = Math.floor(Number(v));
    qty[id] = U.clamp(isFinite(n) ? n : 1, 1, 1000);
    update();
  }

  function buy(id) {
    const s = G().state;
    const q = qty[id];
    const r = G().buyCards(id, s.settings.formFactor, q);
    if (!r.ok) { ui().toast(r.error, 'danger'); ui().sound('error'); return; }
    ui().sound('buy');
    ui().toast('Куплено: ' + E().CLASS[id].name + ' (' + C.formFactors[s.settings.formFactor].short + ') × ' + q + ' за ' + U.gbp(r.total), 'success');
  }

  NT.views.shop = { mount, update, onShow: update };
})(window.NT = window.NT || {});
