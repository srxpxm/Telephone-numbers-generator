/*
 * Точка входа: проверка конфигурации, загрузка сохранения, монтирование страниц,
 * игровой цикл, автосохранение и верхняя панель.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const ui = () => NT.ui;
  const VIEWS = ['home', 'shop', 'collection', 'bank', 'stats', 'achievements', 'settings'];

  let renderQueued = false;
  let timeQueued = false;
  let lastBalance = null;
  let deltaSum = 0, deltaTimer = 0;
  let held = [];            // уведомления, отложенные до конца анимации генерации
  let lastCelebrate = 0;    // время последнего конфетти за достижение
  const top = {};
  const animating = () => !!((NT.game && NT.game.busy) || (NT.views.home && NT.views.home.animating));

  /* ================= Ошибка запуска ================= */
  function fatal(title, lines) {
    const main = document.getElementById('main') || document.body;
    U.clear(main).appendChild(h('div', { class: 'fatal card', role: 'alert' },
      h('h1', { class: 'page-title' }, title),
      h('ul', { class: 'error-list' }, lines.map((l) => h('li', null, l))),
      h('p', { class: 'hint' }, 'Если проблема в сохранении, его можно удалить. Перед этим попробуйте экспортировать данные на другом устройстве.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => window.location.reload() }, 'Перезагрузить'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => { try { NT.storage.wipe(); } catch (e) { /* ignore */ } window.location.reload(); } }, 'Удалить сохранение и начать заново'))));
  }

  /* ================= Верхняя панель и навигация ================= */
  function initTopbar() {
    U.$$('[data-icon]').forEach((el) => { U.clear(el).appendChild(ui().icon(el.getAttribute('data-icon'))); });
    top.clock = document.getElementById('tb-clock-text');
    top.balance = document.getElementById('tb-balance-value');
    top.delta = document.getElementById('tb-delta');
    top.networth = document.getElementById('tb-networth');
    top.name = document.getElementById('tb-name');
    top.avatar = document.getElementById('tb-avatar');
    top.dayBar = document.getElementById('tb-daybar');
    document.getElementById('tb-profile').addEventListener('click', openProfile);
  }

  function updateTopbar() {
    const s = G().state;
    top.balance.textContent = U.gbp(s.balance);
    top.networth.textContent = 'Капитал ' + U.gbpShort(G().netWorth());
    top.name.textContent = s.profile.name;
    top.avatar.textContent = (s.profile.name.trim().charAt(0) || '?').toUpperCase();
    if (lastBalance != null && s.balance !== lastBalance) showDelta(s.balance - lastBalance);
    lastBalance = s.balance;
    updateClock();
    updateBadges();
  }

  function showDelta(d) {
    deltaSum += d;
    clearTimeout(deltaTimer);
    const el = top.delta;
    el.textContent = (deltaSum > 0 ? '+' : '') + U.gbpShort(deltaSum);
    el.className = 'tb-delta show ' + (deltaSum > 0 ? 'pos' : 'neg');
    deltaTimer = setTimeout(() => { el.className = 'tb-delta'; deltaSum = 0; }, 1600);
  }

  function updateClock() {
    const m = G().state.time.minutes;
    top.clock.textContent = 'День ' + U.dayOf(m) + ' · ' + U.clockOf(m);
    top.dayBar.style.width = ((m % U.MIN_PER_DAY) / U.MIN_PER_DAY * 100).toFixed(1) + '%';
  }

  function setBadge(route, text, tone) {
    U.$$('[data-route="' + route + '"] .nav-badge').forEach((b) => {
      b.textContent = text || '';
      b.hidden = !text;
      b.className = 'nav-badge' + (tone ? ' ' + tone : '');
    });
  }
  function updateBadges() {
    const s = G().state;
    const today = U.dayOf(s.time.minutes);
    const offers = s.collection.filter((n) => n.offer && n.offer.expiresDay >= today).length;
    setBadge('collection', offers ? String(offers) : '', 'gold');
    const overdue = NT.bank.hasOverdue(s);
    const matured = NT.bank.activeDeposits(s).some((d) => NT.bank.isMatured(s, d));
    setBadge('bank', overdue ? '!' : matured ? '•' : '', overdue ? 'red' : 'green');
    const claimable = s.quests.list.filter((q) => !q.claimed && q.progress >= q.target).length;
    setBadge('achievements', claimable ? String(claimable) : '', 'green');
  }

  function openProfile() {
    const s = G().state;
    const nw = G().netWorth();
    const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v mono' }, v));
    ui().modal({
      title: s.profile.name, icon: 'user', cls: 'profile-modal',
      body: [h('div', { class: 'profile-rank' }, h('span', { class: 'chip chip-gold' }, G().rankOf(nw).name), h('span', { class: 'big-value mono' }, U.gbp(nw)), h('span', { class: 'hint' }, 'чистый капитал')),
        h('div', { class: 'kv-list' },
          kv('Баланс', U.gbp(s.balance)), kv('Номеров в коллекции', U.num(s.collection.length)), kv('Генераций', U.num(s.stats.generations)),
          kv('Достижений', Object.keys(s.achievements).length + ' / ' + NT.achievements.DEFS.length), kv('Игровой день', String(U.dayOf(s.time.minutes))),
          kv('Кредитный рейтинг', String(s.bank.rating)), kv('Игра начата', U.realDate(s.meta.createdAt)))],
      actions: [{ label: 'Изменить имя', value: 'rename', tone: 'ghost' }, { label: 'Настройки', value: 'settings', tone: 'ghost' }, { label: 'Закрыть', value: null, tone: 'primary' }],
    }).then((v) => {
      if (v === 'settings') ui().go('settings');
      if (v === 'rename') renameDialog();
    });
  }

  function renameDialog() {
    return ui().prompt({ title: 'Имя игрока', icon: 'user', label: 'Как вас называть?', value: G().state.profile.name, maxLength: C.limits.nameMax,
      validate: (v) => (G().sanitizeName(v) ? null : 'Имя не может быть пустым') }).then((v) => {
      if (v == null) return;
      const r = G().setName(v);
      if (r.ok) ui().toast('Имя сохранено: ' + r.name, 'success');
    });
  }

  function welcome() {
    const id = 'welcome-name';
    const input = h('input', { id, class: 'input', type: 'text', value: G().state.profile.name, maxlength: String(C.limits.nameMax), autocomplete: 'nickname' });
    const start = U.gbp(C.currency.startBalanceGbp * C.currency.rubPerGbp);
    return ui().modal({
      title: 'Добро пожаловать в NUMBER TYCOON', icon: 'spark', cls: 'welcome', submitValue: 'start', dismissible: false,
      body: [h('p', null, 'Вы начинаете с капиталом ', h('b', { class: 'mono' }, start), '. Покупайте SIM-карты, активируйте их и собирайте самые красивые номера.'),
        h('ul', { class: 'welcome-list' },
          h('li', null, h('b', null, 'Редкость'), ' определяется только цифрами: повторы, последовательности, зеркала, пары, красивые окончания.'),
          h('li', null, h('b', null, 'Номер'), ' можно оставить в коллекции или продать по рыночной цене, которая меняется каждый день.'),
          h('li', null, h('b', null, 'Банк:'), ' вклады приносят проценты, кредиты дают рычаг — но просрочка опасна.'),
          h('li', null, h('b', null, 'Время:'), ' 1 игровой день = ' + C.time.realSecondsPerDay + ' секунд, пока вкладка открыта.')),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, 'Ваше имя'), input),
        h('p', { class: 'hint' }, 'Все номера вымышленные (префикс +000) и не связаны с реальными операторами. Деньги в игре виртуальные.')],
      actions: [{ label: 'Начать игру', value: 'start', tone: 'primary' }],
      onAction() {
        const name = G().sanitizeName(input.value);
        if (name) G().setName(name);
        return true;
      },
    });
  }

  /* ================= События игры ================= */
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      try {
        // Пока идёт анимация, баланс и капитал не обновляются — иначе они раскрыли бы результат заранее.
        if (animating()) updateClock(); else updateTopbar();
        const v = NT.views[ui().route];
        if (v && v.update) v.update();
      } catch (e) { console.error('[NUMBER TYCOON] render error', e); }
    });
  }

  function scheduleTime() {
    if (timeQueued) return;
    timeQueued = true;
    requestAnimationFrame(() => {
      timeQueued = false;
      updateClock();
      const v = NT.views[ui().route];
      if (v && v.tick) v.tick();
    });
  }

  function onNotify(n) {
    if (animating()) { held.push(n); return; }
    showNotice(n);
  }
  function showNotice(n) {
    ui().toast(n.text, n.tone, { glyph: n.icon });
    if (n.tone === 'achievement') {
      const now = performance.now();
      if (now - lastCelebrate > 1500) { lastCelebrate = now; ui().sound('achievement'); ui().confetti('legendary', 0.35); }
    } else if (n.tone === 'danger') ui().sound('error');
  }
  /** Показывает уведомления, накопленные во время анимации (вызывается после раскрытия номера). */
  function flushNotices(celebrated) {
    if (celebrated) lastCelebrate = performance.now();
    scheduleRender();
    if (!held.length) return;
    setTimeout(() => {
      if (animating()) return; // уже идёт новая анимация — покажем после неё
      const list = held;
      held = [];
      list.forEach(showNotice);
    }, 450);
  }
  function onDay() {
    const el = document.querySelector('.tb-clock');
    if (!el) return;
    el.classList.remove('day-pulse');
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add('day-pulse');
  }

  /* ================= Запуск ================= */
  function boot() {
    const pv = NT.gen.validateProbabilities();
    if (!pv.ok) { fatal('Ошибка конфигурации', ['Таблицы вероятностей некорректны — сумма должна быть 100%:'].concat(pv.problems)); return; }
    const ev = NT.economy.validateEconomy();
    if (!ev.ok) console.warn('[NUMBER TYCOON] Предупреждения экономики:', ev.problems);

    const res = NT.storage.load();
    G().setState(res.state || G().newState());
    if (res.source === 'save') NT.storage.backupCurrent();

    initTopbar();
    VIEWS.forEach((name) => {
      const el = document.getElementById('view-' + name);
      if (el && NT.views[name]) NT.views[name].mount(el);
    });

    G().on('change', scheduleRender);
    G().on('time', scheduleTime);
    G().on('notify', onNotify);
    G().on('day', onDay);
    G().on('persist', (p) => NT.storage.scheduleSave(p && p.immediate));

    ui().initRouter();
    updateTopbar();

    // Игровой цикл: время идёт только при видимой вкладке.
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (document.hidden) return;
      G().tick(dt);
    }, 250);
    document.addEventListener('visibilitychange', () => {
      last = performance.now();
      if (document.hidden) NT.storage.save(G().state);
    });
    setInterval(() => NT.storage.save(G().state), 10000);
    window.addEventListener('pagehide', () => NT.storage.save(G().state));
    window.addEventListener('beforeunload', () => NT.storage.save(G().state));

    document.body.classList.add('ready');
    if (res.warning) ui().toast(res.warning, 'warn', { duration: 9000 });
    if (res.source === 'unavailable') ui().toast('Браузер не даёт доступ к localStorage — прогресс не сохранится после закрытия. Используйте экспорт в настройках.', 'warn', { duration: 9000 });
    if (res.source === 'save' || res.source === 'backup') {
      ui().toast('С возвращением, ' + G().state.profile.name + '! ' + U.gameDate(G().state.time.minutes), 'info');
    } else {
      NT.storage.save(G().state);
      welcome();
    }
  }

  NT.app = { flushNotices };

  function safeBoot() {
    try { boot(); } catch (e) {
      console.error(e);
      fatal('Не удалось запустить игру', [String(e && e.message ? e.message : e)]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeBoot);
  else safeBoot();
})(window.NT = window.NT || {});
