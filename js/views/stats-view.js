/*
 * Статистика: ключевые показатели, рекорды, график капитала, распределение редкостей,
 * журнал операций и «Лаборатория баланса» (симуляция Монте-Карло без влияния на игру).
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const E = () => NT.economy;
  const ui = () => NT.ui;

  let root = null;
  const refs = {};
  let txFilter = 'all';
  const lab = { classId: 'standard', ff: 'sim', n: 10000, running: false, result: null, progress: 0, cancel: false };

  const TX_GROUPS = {
    all: { label: 'Все операции', types: null },
    trade: { label: 'Покупки и продажи', types: ['buy', 'sell', 'autosell', 'offer'] },
    bank: { label: 'Банк', types: ['deposit_open', 'deposit_close', 'loan_take', 'loan_repay', 'collection', 'seizure', 'grant'] },
    rewards: { label: 'Награды', types: ['quest', 'achievement'] },
  };

  function mount(el) {
    root = el;
    refs.kpi = h('div', { class: 'kpi-grid' });
    refs.records = h('div', { class: 'records' });
    refs.chart = h('div', { class: 'chart-box' });
    refs.dist = h('div', { class: 'dist' });
    refs.breakdown = h('div', { class: 'breakdown' });
    refs.txSelect = h('select', { id: 'tx-filter', class: 'input select' });
    Object.keys(TX_GROUPS).forEach((k) => refs.txSelect.appendChild(h('option', { value: k }, TX_GROUPS[k].label)));
    refs.txSelect.addEventListener('change', () => { txFilter = refs.txSelect.value; renderTx(); });
    refs.tx = h('div', { class: 'tx-table-wrap' });
    refs.lab = h('div', { class: 'lab' });

    const chartCard = ui().section('Динамика капитала', { icon: 'stats', sub: 'Чистый капитал на конец каждого игрового дня (последние ' + C.limits.netWorthHistory + ' дней).' });
    chartCard.appendChild(refs.chart);
    const distCard = ui().section('Распределение редкостей', { icon: 'spark', sub: 'Фактически полученные номера против ожидаемых шансов с учётом купленных классов.' });
    distCard.appendChild(refs.dist);
    const brCard = ui().section('Карты по классам', { icon: 'shop' });
    brCard.appendChild(refs.breakdown);
    const txCard = ui().section('Журнал операций', { icon: 'clock', sub: 'Последние ' + C.limits.transactions + ' операций с балансом.',
      aside: h('div', { class: 'field inline' }, h('label', { class: 'field-label', for: 'tx-filter' }, 'Показать'), refs.txSelect) });
    txCard.appendChild(refs.tx);
    const labCard = ui().section('Лаборатория баланса', { icon: 'flask', cls: 'lab-card', sub: 'Симуляция тысяч активаций на копии генератора. Не тратит деньги и не влияет на сохранение.' });
    labCard.appendChild(refs.lab);

    root.append(ui().pageHead('Статистика', 'Итоги вашей игры: деньги, номера, рекорды и честная проверка шансов.'),
      refs.kpi, refs.records, h('div', { class: 'stats-grid' }, chartCard, distCard), h('div', { class: 'stats-grid' }, brCard, labCard), txCard);
    window.addEventListener('resize', () => { if (NT.ui.route === 'stats') renderChart(); });
  }

  function kpi(label, value, sub, cls) {
    return h('div', { class: 'kpi' }, h('span', { class: 'kpi-label' }, label), h('span', { class: 'kpi-value mono' + (cls ? ' ' + cls : '') }, value), sub ? h('span', { class: 'hint' }, sub) : null);
  }

  function update() {
    if (!root) return;
    const s = G().state;
    const st = s.stats;
    const nw = G().netWorth();
    const sm = NT.stats.summary(s, nw);
    U.clear(refs.kpi).append(
      kpi('Чистый капитал', U.gbp(nw), 'максимум ' + U.gbpShort(sm.maxNetWorth)),
      kpi('Изменение капитала', (sm.capitalChange > 0 ? '+' : '') + U.gbp(sm.capitalChange), 'от стартовых ' + U.gbp(C.currency.startBalanceGbp * C.currency.rubPerGbp), sm.capitalChange >= 0 ? 'pos' : 'neg'),
      kpi('Потрачено всего', U.gbp(sm.totalSpent), 'карты ' + U.gbpShort(st.spentCards) + ' · проценты и штрафы ' + U.gbpShort(st.spentInterest + st.spentPenalties)),
      kpi('Заработано всего', U.gbp(sm.totalEarned), 'продажи ' + U.gbpShort(st.salesRevenue) + ' · вклады ' + U.gbpShort(st.earnedInterest) + ' · награды ' + U.gbpShort(st.earnedRewards)),
      kpi('Прибыль от продаж', (sm.tradingProfit > 0 ? '+' : '') + U.gbp(sm.tradingProfit), 'выручка минус цена карт проданных номеров', sm.tradingProfit >= 0 ? 'pos' : 'neg'),
      kpi('Генераций', U.num(sm.generations), 'SIM ' + U.num(sm.genByType.sim) + ' · eSIM ' + U.num(sm.genByType.esim)),
      kpi('Продаж', U.num(sm.sales), 'авто ' + U.num(sm.autoSales) + ' · сделки ' + U.num(sm.offerSales)),
      kpi('Куплено карт', U.num(sm.cardsBought), 'в коллекции ' + U.num(s.collection.length) + ' номеров'),
      kpi('Банк', U.num(st.depositsOpened) + ' / ' + U.num(st.loansTaken), 'вкладов / кредитов · дефолтов ' + st.defaults),
      kpi('Задания', U.num(st.questsCompleted), 'достижений ' + Object.keys(s.achievements).length + ' из ' + NT.achievements.DEFS.length),
      kpi('Стоимость коллекции', U.gbp(G().collectionValue()), U.num(s.collection.length) + ' ' + U.plural(s.collection.length, ['номер', 'номера', 'номеров']) + ' · на продаже ' + U.num(s.collection.filter((n) => n.status === 'listed').length)),
      kpi('Время в игре', fmtPlay(s.meta.playTimeSec), 'игровой день ' + U.dayOf(s.time.minutes)));

    U.clear(refs.records).append(
      record('Самый дорогой номер', sm.bestNumber, (r) => 'стоимость при получении ' + U.gbp(r.value)),
      record('Самый редкий номер', sm.rarestNumber, (r) => 'оценка красоты ' + r.score + '/100'),
      record('Лучшая сделка', sm.bestSale, (r) => 'продан за ' + U.gbp(r.price) + ' · прибыль ' + (r.profit >= 0 ? '+' : '') + U.gbp(r.profit)));

    renderChart();
    renderDist();
    renderBreakdown();
    renderTx();
    renderLab();
  }

  function fmtPlay(sec) {
    const m = Math.floor(sec / 60);
    if (m < 60) return m + ' мин';
    return Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин';
  }

  function record(title, r, sub) {
    return h('div', { class: 'card record' + (r ? ' r-' + r.rarity : '') }, h('span', { class: 'vg-label' }, title),
      r ? [h('div', { class: 'record-num' }, ui().numberNode(r.body, 'r-text-' + r.rarity)), h('div', { class: 'record-meta' }, ui().rarityBadge(r.rarity, 'sm'), h('span', { class: 'hint' }, sub(r)))]
        : h('p', { class: 'hint' }, 'Пока нет данных'));
  }

  function renderChart() {
    const s = G().state;
    const hist = s.stats.netWorthHistory.slice();
    const today = U.dayOf(s.time.minutes);
    const pts = hist.map((x) => ({ x: x.day, y: x.value }));
    if (!pts.length || pts[pts.length - 1].x !== today) pts.push({ x: today, y: G().netWorth() });
    else pts[pts.length - 1].y = G().netWorth();
    const width = refs.chart.clientWidth || 640;
    U.clear(refs.chart).appendChild(ui().lineChart(pts, {
      width, height: 230, baseline: C.currency.startBalanceGbp * C.currency.rubPerGbp, label: 'График чистого капитала по дням',
      formatY: (v) => U.gbpCompact(Math.round(v)), formatX: (x) => 'День ' + x,
    }));
    refs.chart.appendChild(h('p', { class: 'hint chart-legend' }, h('span', { class: 'legend-line' }), 'капитал', h('span', { class: 'legend-dash' }), 'стартовый капитал'));
  }

  function renderDist() {
    const s = G().state;
    const st = s.stats;
    const total = st.generations;
    U.clear(refs.dist);
    if (!total) { refs.dist.appendChild(ui().empty('Номеров ещё нет', 'Сгенерируйте несколько номеров, чтобы сравнить удачу с теорией.')); return; }
    const expected = {};
    C.rarities.forEach((r) => { expected[r.id] = 0; });
    C.classes.forEach((c) => { const g = st.genByClass[c.id] || 0; C.rarities.forEach((r) => { expected[r.id] += g * (c.probabilities[r.id] || 0) / 100; }); });
    const list = h('div', { class: 'dist-list' });
    const maxShare = Math.max.apply(null, C.rarities.map((r) => Math.max(st.genByRarity[r.id] / total, expected[r.id] / total)));
    C.rarities.forEach((r) => {
      const act = st.genByRarity[r.id] / total, exp = expected[r.id] / total;
      list.appendChild(h('div', { class: 'dist-row' },
        h('div', { class: 'dist-label' }, ui().rarityBadge(r.id, 'sm'), h('span', { class: 'mono' }, U.num(st.genByRarity[r.id]))),
        h('div', { class: 'dist-bars' },
          h('div', { class: 'dbar r-bg-' + r.id, style: { width: Math.max(0.5, act / maxShare * 100) + '%' }, title: 'Фактически' }),
          h('div', { class: 'dbar dbar-exp', style: { width: Math.max(0.5, exp / maxShare * 100) + '%' }, title: 'Ожидалось' })),
        h('div', { class: 'dist-nums mono' }, U.pct(act, 2), h('span', { class: 'hint' }, 'ожид. ' + U.pct(exp, 2)))));
    });
    refs.dist.append(list, h('p', { class: 'hint chart-legend' }, h('span', { class: 'legend-box' }), 'фактически', h('span', { class: 'legend-box exp' }), 'ожидаемо по таблицам вероятностей'));
  }

  function renderBreakdown() {
    const st = G().state.stats;
    const t = h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Класс'), h('th', { scope: 'col', class: 'num-col' }, 'Куплено'), h('th', { scope: 'col', class: 'num-col' }, 'Активировано'), h('th', { scope: 'col', class: 'num-col' }, 'Цена'))));
    const tb = h('tbody');
    C.classes.forEach((c) => tb.appendChild(h('tr', null, h('td', null, ui().classChip(c.id), ' ', c.name), h('td', { class: 'num-col mono' }, U.num(st.cardsByClass[c.id])), h('td', { class: 'num-col mono' }, U.num(st.genByClass[c.id])), h('td', { class: 'num-col mono' }, U.gbpShort(E().cardPrice(c.id, 'sim'))))));
    tb.appendChild(h('tr', { class: 'sum-row' }, h('td', null, 'SIM / eSIM'), h('td', { class: 'num-col mono' }, U.num(st.cardsByType.sim) + ' / ' + U.num(st.cardsByType.esim)), h('td', { class: 'num-col mono' }, U.num(st.genByType.sim) + ' / ' + U.num(st.genByType.esim)), h('td')));
    t.appendChild(tb);
    U.clear(refs.breakdown).appendChild(h('div', { class: 'table-wrap' }, t));
  }

  function renderTx() {
    const s = G().state;
    const g = TX_GROUPS[txFilter];
    const list = s.transactions.filter((t) => !g.types || g.types.indexOf(t.type) !== -1).slice(0, 100);
    U.clear(refs.tx);
    if (!list.length) { refs.tx.appendChild(ui().empty('Операций нет', 'Здесь появятся покупки, продажи, банковские операции и награды.')); return; }
    const t = h('table', { class: 'table tx-table' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Время'), h('th', { scope: 'col' }, 'Операция'), h('th', { scope: 'col', class: 'num-col' }, 'Сумма'), h('th', { scope: 'col', class: 'num-col' }, 'Баланс'))));
    const tb = h('tbody');
    list.forEach((x) => tb.appendChild(h('tr', null, h('td', { class: 'mono nowrap' }, 'Д' + x.day + ' ' + U.clockOf(x.minute)), h('td', null, x.text), h('td', { class: 'num-col' }, ui().delta(x.amount)), h('td', { class: 'num-col mono' }, U.gbp(x.balance)))));
    t.appendChild(tb);
    refs.tx.appendChild(h('div', { class: 'table-wrap' }, t));
  }

  /* ================= Лаборатория баланса ================= */
  function renderLab() {
    const box = refs.lab;
    ui().preserveFocus(box, () => {
      U.clear(box);
      const clsSel = h('select', { id: 'lab-class', class: 'input select', disabled: lab.running });
      C.classes.forEach((c) => clsSel.appendChild(h('option', { value: c.id }, c.short)));
      clsSel.value = lab.classId;
      clsSel.addEventListener('change', () => { lab.classId = clsSel.value; lab.result = null; renderLab(); });
      const ffSel = h('select', { id: 'lab-ff', class: 'input select', disabled: lab.running });
      Object.keys(C.formFactors).forEach((k) => ffSel.appendChild(h('option', { value: k }, C.formFactors[k].short)));
      ffSel.value = lab.ff;
      ffSel.addEventListener('change', () => { lab.ff = ffSel.value; lab.result = null; renderLab(); });
      const nSel = h('select', { id: 'lab-n', class: 'input select', disabled: lab.running });
      [1000, 10000, 50000].forEach((n) => nSel.appendChild(h('option', { value: String(n) }, U.num(n))));
      nSel.value = String(lab.n);
      nSel.addEventListener('change', () => { lab.n = Number(nSel.value); });
      box.appendChild(h('div', { class: 'lab-controls' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lab-class' }, 'Класс'), clsSel),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lab-ff' }, 'Тип'), ffSel),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lab-n' }, 'Активаций'), nSel),
        lab.running ? h('button', { type: 'button', class: 'btn btn-ghost', 'data-fk': 'lab-run', onclick: () => { lab.cancel = true; } }, 'Остановить')
          : h('button', { type: 'button', class: 'btn btn-primary', 'data-fk': 'lab-run', onclick: runLab }, icon('flask'), 'Запустить')));
      if (lab.running) box.appendChild(h('div', { class: 'lab-progress' }, ui().progress(lab.progress, 1, 'gold', 'Прогресс симуляции'), h('span', { class: 'hint mono' }, U.pct(lab.progress, 0))));
      if (lab.result) box.appendChild(labResult(lab.result));
      else if (!lab.running) box.appendChild(h('p', { class: 'hint' }, 'Выберите класс и запустите симуляцию: увидите среднюю стоимость номера, отдачу и распределение редкостей.'));
    });
  }
  const icon = (n) => ui().icon(n);

  function runLab() {
    if (lab.running) return;
    lab.running = true; lab.cancel = false; lab.progress = 0; lab.result = null;
    const cls = lab.classId, ff = lab.ff, N = lab.n;
    const price = E().cardPrice(cls, ff);
    const counts = {}; C.rarities.forEach((r) => { counts[r.id] = 0; });
    let sum = 0, profitable = 0, done = 0, best = null;
    const t0 = performance.now();
    renderLab();
    function chunk() {
      if (lab.cancel) { lab.running = false; lab.result = done ? build() : null; renderLab(); return; }
      const end = Math.min(N, done + 400);
      for (; done < end; done++) {
        // Без проверки уникальности: лаборатория проверяет таблицу шансов и стоимость,
        // а не исчерпание реестра выданных номеров.
        const res = NT.gen.generate(cls, ff, null);
        const v = E().baseValue(cls, res.rarity, res.analysis.score, E().rollNoise());
        sum += v; counts[res.rarity] += 1;
        if (v > price) profitable += 1;
        if (!best || v > best.value) best = { body: res.body, rarity: res.rarity, value: v };
      }
      lab.progress = done / N;
      if (done >= N) { lab.running = false; lab.result = build(); renderLab(); return; }
      const bar = refs.lab.querySelector('.lab-progress .progress-bar');
      const txt = refs.lab.querySelector('.lab-progress .hint');
      if (bar) bar.style.width = (lab.progress * 100).toFixed(1) + '%';
      if (txt) txt.textContent = U.pct(lab.progress, 0);
      setTimeout(chunk, 0);
    }
    function build() {
      return { cls, ff, n: done, price, avg: sum / done, rtp: sum / done / price, profitable: profitable / done, counts, best, ms: performance.now() - t0 };
    }
    setTimeout(chunk, 0);
  }

  function labResult(r) {
    const c = E().CLASS[r.cls];
    const rows = h('tbody');
    C.rarities.forEach((x) => rows.appendChild(h('tr', null, h('td', null, ui().rarityBadge(x.id, 'sm')), h('td', { class: 'num-col mono' }, U.num(r.counts[x.id])),
      h('td', { class: 'num-col mono' }, U.pct(r.counts[x.id] / r.n, 2)), h('td', { class: 'num-col mono muted' }, U.pctRaw(c.probabilities[x.id], 2)))));
    return h('div', { class: 'lab-result' },
      h('div', { class: 'metric-grid' },
        h('div', { class: 'metric' }, h('span', { class: 'metric-label' }, 'Средняя стоимость'), h('span', { class: 'metric-value mono' }, U.gbp(Math.round(r.avg)))),
        h('div', { class: 'metric' }, h('span', { class: 'metric-label' }, 'Отдача (RTP)'), h('span', { class: 'metric-value mono ' + (r.rtp >= 1 ? 'pos' : 'neg') }, U.pct(r.rtp, 1)), h('span', { class: 'hint' }, 'цель ' + U.pct(c.targetRtp, 0))),
        h('div', { class: 'metric' }, h('span', { class: 'metric-label' }, 'Номер дороже карты'), h('span', { class: 'metric-value mono' }, U.pct(r.profitable, 1))),
        h('div', { class: 'metric' }, h('span', { class: 'metric-label' }, 'Лучший номер'), h('span', { class: 'metric-value mono r-text-' + r.best.rarity }, U.gbpShort(r.best.value)), h('span', { class: 'hint mono' }, NT.gen.format(r.best.body)))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Редкость'), h('th', { scope: 'col', class: 'num-col' }, 'Кол-во'), h('th', { scope: 'col', class: 'num-col' }, 'Факт'), h('th', { scope: 'col', class: 'num-col' }, 'Таблица'))), rows)),
      h('p', { class: 'hint' }, U.num(r.n) + ' активаций «' + c.short + '» (' + C.formFactors[r.ff].short + ') за ' + Math.round(r.ms) + ' мс. Рыночные колебания не учитываются — это базовая стоимость; повторы номеров в симуляции допускаются.'));
  }

  NT.views.stats = { mount, update, onShow: update };
})(window.NT = window.NT || {});
