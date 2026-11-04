/*
 * Коллекция: карточки номеров, поиск по цифрам, фильтры, сортировки,
 * выставление на продажу, продажа и предложения коллекционеров.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const E = () => NT.economy;
  const ui = () => NT.ui;

  const DEFAULTS = { search: '', rarity: 'all', classId: 'all', status: 'all', sort: 'date_desc' };
  let filters = Object.assign({}, DEFAULTS);
  let limit = C.ui.collectionPageSize;
  let root = null;
  const refs = {};
  let searchTimer = 0;

  function select(id, label, options, key) {
    const sel = h('select', { id, class: 'input select', 'aria-label': label });
    options.forEach((o) => sel.appendChild(h('option', { value: o.value }, o.label)));
    sel.value = filters[key];
    sel.addEventListener('change', () => { filters[key] = sel.value; limit = C.ui.collectionPageSize; update(); });
    refs['sel_' + key] = sel;
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label), sel);
  }

  function mount(el) {
    root = el;
    refs.headAside = h('div', { class: 'head-aside' });
    refs.summary = h('div', { class: 'coll-summary' });
    refs.rarityChips = h('div', { class: 'rarity-chips', role: 'group', 'aria-label': 'Фильтр по редкости' });
    refs.search = h('input', { id: 'coll-search', class: 'input search-input mono', type: 'search', placeholder: 'Например, 777 или +000 12', autocomplete: 'off', inputmode: 'numeric', maxlength: '24', 'aria-describedby': 'coll-search-hint' });
    refs.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { filters.search = refs.search.value; limit = C.ui.collectionPageSize; update(); }, 140);
    });
    refs.searchHint = h('p', { id: 'coll-search-hint', class: 'hint' }, 'Поиск по цифрам номера, префикс +000 можно не вводить');
    const toolbar = h('div', { class: 'toolbar' },
      h('div', { class: 'field field-search' }, h('label', { class: 'field-label', for: 'coll-search' }, 'Поиск по цифрам'),
        h('div', { class: 'input-icon' }, ui().icon('search'), refs.search), refs.searchHint),
      select('coll-rarity', 'Редкость', [{ value: 'all', label: 'Все редкости' }].concat(C.rarities.map((r) => ({ value: r.id, label: r.name + ' — ' + r.ru }))), 'rarity'),
      select('coll-class', 'Класс карты', [{ value: 'all', label: 'Все классы' }].concat(C.classes.map((c) => ({ value: c.id, label: c.name }))), 'classId'),
      select('coll-status', 'Статус', [{ value: 'all', label: 'Все номера' }, { value: 'kept', label: 'В коллекции' }, { value: 'listed', label: 'На продаже' }], 'status'),
      select('coll-sort', 'Сортировка', Object.keys(NT.collection.SORTS).map((k) => ({ value: k, label: NT.collection.SORTS[k] })), 'sort'),
      h('button', { type: 'button', class: 'btn btn-ghost reset-filters', onclick: resetFilters }, 'Сбросить фильтры'));
    refs.resultInfo = h('p', { class: 'result-info', 'aria-live': 'polite' });
    refs.grid = h('div', { class: 'ncard-grid' });
    refs.more = h('div', { class: 'more-wrap' });
    root.append(ui().pageHead('Коллекция', 'Выставляйте номера на продажу, принимайте предложения коллекционеров и следите за стоимостью.', refs.headAside),
      refs.summary, refs.rarityChips, h('div', { class: 'card toolbar-card' }, toolbar), refs.resultInfo, refs.grid, refs.more);
  }

  function resetFilters() {
    filters = Object.assign({}, DEFAULTS);
    limit = C.ui.collectionPageSize;
    refs.search.value = '';
    update();
  }

  function preset(p) {
    filters = Object.assign({}, DEFAULTS, p || {});
    limit = C.ui.collectionPageSize;
    if (refs.search) refs.search.value = filters.search;
  }

  function stat(label, value, sub) {
    return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value mono' }, value), sub ? h('span', { class: 'hint' }, sub) : null);
  }

  function update() {
    if (!root) return;
    const s = G().state;
    const sum = NT.collection.summary(s);
    ['rarity', 'classId', 'status', 'sort'].forEach((k) => { if (refs['sel_' + k] && refs['sel_' + k].value !== filters[k]) refs['sel_' + k].value = filters[k]; });

    ui().preserveFocus(refs.headAside, () => {
      U.clear(refs.headAside);
      if (sum.listed) refs.headAside.appendChild(h('button', { type: 'button', class: 'btn btn-gold-ghost', 'data-fk': 'sell-all', onclick: sellAll },
        ui().icon('coin'), 'Продать все выставленные (' + sum.listed + ')', h('span', { class: 'btn-price mono' }, U.gbpShort(sum.listedValue))));
    });

    U.clear(refs.summary).append(
      stat('Номеров', U.num(sum.count), sum.count >= C.limits.collectionMax ? 'лимит коллекции' : null),
      stat('Стоимость коллекции', U.gbp(sum.total)),
      stat('На продаже', U.num(sum.listed), sum.listed ? U.gbp(sum.listedValue) : null),
      stat('Предложения', U.num(sum.offers), sum.offers ? 'ждут ответа' : null));

    ui().preserveFocus(refs.rarityChips, () => {
      U.clear(refs.rarityChips);
      C.rarities.forEach((r) => {
        const active = filters.rarity === r.id;
        refs.rarityChips.appendChild(h('button', {
          type: 'button', class: 'rchip r-' + r.id + (active ? ' active' : ''), 'aria-pressed': active ? 'true' : 'false', 'data-fk': 'rc-' + r.id,
          onclick: () => { filters.rarity = active ? 'all' : r.id; limit = C.ui.collectionPageSize; update(); },
        }, h('span', { class: 'rchip-dot', 'aria-hidden': 'true' }), r.name, h('b', { class: 'mono' }, U.num(sum.byRarity[r.id]))));
      });
    });

    const q = NT.collection.query(s, filters);
    const raw = (filters.search || '').trim();
    refs.searchHint.textContent = raw && !q.search ? 'Введите цифры — буквы и символы игнорируются' : q.search ? 'Ищем «' + q.search + '» в любой части номера' : 'Поиск по цифрам номера, префикс +000 можно не вводить';
    const shown = q.items.slice(0, limit);
    refs.resultInfo.textContent = q.items.length ? 'Показано ' + U.num(shown.length) + ' из ' + U.num(q.items.length) : '';

    ui().preserveFocus(refs.grid, () => {
      U.clear(refs.grid);
      if (!s.collection.length) {
        refs.grid.appendChild(ui().empty('Коллекция пуста', 'Сгенерируйте номер и нажмите «Оставить в коллекции».',
          h('a', { href: '#home', 'data-route': 'home', class: 'btn btn-primary' }, 'К генератору')));
      } else if (!q.items.length) {
        refs.grid.appendChild(ui().empty('Ничего не найдено', 'Измените поиск или фильтры.', h('button', { type: 'button', class: 'btn btn-ghost', onclick: resetFilters }, 'Сбросить фильтры')));
      } else {
        const frag = document.createDocumentFragment();
        shown.forEach((n) => frag.appendChild(card(n, q.values.get(n.id), s)));
        refs.grid.appendChild(frag);
      }
    });
    U.clear(refs.more);
    if (q.items.length > shown.length) {
      const left = q.items.length - shown.length;
      refs.more.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { limit += C.ui.collectionPageSize; update(); } },
        'Показать ещё ' + Math.min(left, C.ui.collectionPageSize) + ' (осталось ' + U.num(left) + ')'));
    }
  }

  function card(n, value, s) {
    const today = U.dayOf(s.time.minutes);
    const a = NT.gen.analyze(n.body);
    const pl = value - n.cost;
    const offer = n.offer && n.offer.expiresDay >= today ? n.offer : null;
    const listed = n.status === 'listed';
    const actions = h('div', { class: 'ncard-actions' });
    if (listed) {
      actions.append(
        h('button', { type: 'button', class: 'btn btn-gold-ghost btn-sm', 'data-fk': 'sell-' + n.id, onclick: () => sell(n.id, 'market') }, 'Продать за ', h('span', { class: 'mono' }, U.gbp(value))),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'unlist-' + n.id, onclick: () => { const r = G().unlistNumber(n.id); if (!r.ok) ui().toast(r.error, 'danger'); } }, 'Снять'));
    } else {
      actions.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'list-' + n.id, onclick: () => list(n.id) }, ui().icon('tag'), 'Выставить на продажу'));
    }
    return h('article', { class: 'ncard r-' + n.rarity + (listed ? ' listed' : ''), 'aria-label': 'Номер ' + NT.gen.format(n.body) + ', ' + E().RARITY[n.rarity].name },
      h('div', { class: 'ncard-top' }, ui().rarityBadge(n.rarity, 'sm'), listed ? h('span', { class: 'chip chip-gold' }, ui().icon('tag'), 'На продаже') : null,
        h('span', { class: 'ncard-chips' }, ui().classChip(n.classId), ui().ffChip(n.formFactor))),
      h('div', { class: 'ncard-number' }, ui().numberNode(n.body, 'r-text-' + n.rarity)),
      h('div', { class: 'ncard-pattern' }, h('span', null, a.primaryLabel), h('span', { class: 'mono hint' }, 'красота ' + n.score)),
      h('div', { class: 'ncard-values' },
        h('div', null, h('span', { class: 'vg-label' }, 'Стоимость'), h('span', { class: 'mono ncard-value' }, U.gbp(value))),
        h('div', null, h('span', { class: 'vg-label' }, 'Карта'), h('span', { class: 'mono' }, U.gbp(n.cost))),
        h('div', null, h('span', { class: 'vg-label' }, 'Итог'), ui().delta(pl, true))),
      offer ? h('div', { class: 'offer' },
        h('div', null, h('b', null, 'Предложение: ', h('span', { class: 'mono' }, U.gbp(offer.amount))),
          h('span', { class: 'hint' }, (offer.amount >= value ? '+' : '−') + U.pct(Math.abs(offer.amount / value - 1), 1) + ' к рынку · до конца Дня ' + offer.expiresDay)),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-fk': 'offer-' + n.id, onclick: () => sell(n.id, 'offer') }, 'Принять')) : null,
      actions,
      h('div', { class: 'ncard-foot hint' }, h('span', { class: 'mono' }, n.id), h('span', null, 'получен: День ' + U.dayOf(n.acquiredMinute))));
  }

  function list(id) {
    const r = G().listNumber(id);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().toast('Номер выставлен на продажу. Коллекционеры могут прислать предложение с наступлением нового дня.', 'info');
  }

  async function sell(id, kind) {
    const s = G().state;
    const n = G().findNumber(id);
    if (!n) { ui().toast('Номер уже продан', 'danger'); return; }
    const price = kind === 'offer' && n.offer ? n.offer.amount : G().currentValue(n);
    const ri = NT.gen.rarityIndex(n.rarity);
    if (ri >= NT.gen.rarityIndex('legendary') || (s.settings.confirmEpic && n.rarity === 'epic')) {
      const ok = await ui().confirm({
        title: 'Продать номер ' + E().RARITY[n.rarity].name + '?', icon: 'warn', danger: true,
        body: [h('p', { class: 'confirm-number' }, ui().numberNode(n.body, 'num-lg r-text-' + n.rarity)), h('p', null, 'Вы получите ', h('b', { class: 'mono' }, U.gbp(price)), '. Отменить продажу будет нельзя.')],
        confirmLabel: 'Продать', cancelLabel: 'Оставить',
      });
      if (!ok) return;
    }
    const r = G().sellNumber(id, kind);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().sound('coin');
    ui().toast((kind === 'offer' ? 'Сделка заключена: ' : 'Продано: ') + NT.gen.format(r.number.body) + ' — +' + U.gbp(r.price), 'sale');
  }

  async function sellAll() {
    const s = G().state;
    const listed = s.collection.filter((n) => n.status === 'listed');
    if (!listed.length) return;
    const total = listed.reduce((a, n) => a + G().currentValue(n), 0);
    const valuable = listed.filter((n) => NT.gen.rarityIndex(n.rarity) >= NT.gen.rarityIndex('legendary')).length;
    const ok = await ui().confirm({
      title: 'Продать все выставленные номера?', icon: 'coin', danger: valuable > 0,
      body: [h('p', null, 'Будет продано ' + listed.length + ' ' + U.plural(listed.length, ['номер', 'номера', 'номеров']) + ' по рыночной цене на сумму ', h('b', { class: 'mono' }, U.gbp(total)), '.'),
        valuable ? h('p', { class: 'warn-t' }, 'Среди них ' + valuable + ' ' + U.plural(valuable, ['номер', 'номера', 'номеров']) + ' Legendary/Mythic.') : null,
        h('p', { class: 'hint' }, 'Предложения коллекционеров при этом не используются.')],
      confirmLabel: 'Продать все',
    });
    if (!ok) return;
    const r = G().sellAllListed();
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().sound('coin');
    ui().toast('Продано номеров: ' + r.count + ' на ' + U.gbp(r.total), 'sale');
  }

  NT.views.collection = { mount, update, onShow: update, preset };
})(window.NT = window.NT || {});
