/*
 * Настройки: профиль, автопродажа, анимация и звук, сохранения (экспорт/импорт), сброс.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const S = () => NT.storage;
  const ui = () => NT.ui;

  let root = null;
  const refs = {};
  const icon = (n) => ui().icon(n);

  function mount(el) {
    root = el;
    refs.nameInput = h('input', { id: 'set-name', class: 'input', type: 'text', maxlength: String(C.limits.nameMax), autocomplete: 'nickname', 'aria-describedby': 'set-name-err' });
    refs.nameErr = h('p', { id: 'set-name-err', class: 'form-error', role: 'alert', hidden: true });
    refs.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
    const profile = ui().section('Профиль', { icon: 'user' });
    refs.profileInfo = h('div', { class: 'kv-list' });
    profile.append(h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'set-name' }, 'Имя игрока'),
      h('div', { class: 'input-row' }, refs.nameInput, h('button', { type: 'button', class: 'btn btn-primary', onclick: saveName }, 'Сохранить')), refs.nameErr), refs.profileInfo);

    refs.autosell = h('div', { class: 'autosell-grid' });
    const autosell = ui().section('Автопродажа', { icon: 'coin', sub: 'Сразу после анимации номер выбранной редкости продаётся по рыночной цене. Остальные ждут вашего решения.' });
    autosell.appendChild(refs.autosell);

    refs.gameplay = h('div', { class: 'settings-list' });
    const gameplay = ui().section('Игровой процесс', { icon: 'settings' });
    gameplay.appendChild(refs.gameplay);

    refs.saveInfo = h('div', { class: 'save-info' });
    refs.file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'import-file', tabindex: '-1', 'aria-hidden': 'true' });
    refs.file.addEventListener('change', () => { const f = refs.file.files && refs.file.files[0]; refs.file.value = ''; if (f) importFile(f); });
    const saves = ui().section('Сохранения', { icon: 'download', sub: 'Прогресс автоматически сохраняется в браузере (localStorage). Экспорт создаёт JSON-файл, который можно загрузить на другом устройстве.' });
    saves.append(refs.saveInfo, h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: exportSave }, icon('download'), 'Экспорт в файл'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => refs.file.click() }, icon('upload'), 'Импорт из файла'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: saveNow }, icon('check'), 'Сохранить сейчас')), refs.file,
    h('p', { class: 'hint' }, 'Импорт проверяет формат, версию схемы, контрольную сумму и корректность всех данных. Перед заменой текущий прогресс сохраняется как резервная копия.'));

    const danger = ui().section('Опасная зона', { icon: 'warn', cls: 'danger-card' });
    danger.append(h('p', null, 'Сброс удалит текущий прогресс: баланс, коллекцию, вклады, кредиты и статистику. Резервная копия последнего сохранения останется в браузере до следующего сброса или импорта.'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: resetGame }, icon('trash'), 'Начать заново'));

    refs.about = h('div', { class: 'kv-list' });
    const about = ui().section('Об игре', { icon: 'info' });
    about.appendChild(refs.about);

    root.append(ui().pageHead('Настройки', 'Профиль, автопродажа, анимации и управление сохранениями.'),
      h('div', { class: 'settings-grid' }, h('div', { class: 'settings-col' }, profile, autosell, gameplay), h('div', { class: 'settings-col' }, saves, about, danger)));
    S().onStatus(() => { if (ui().route === 'settings') renderSaveInfo(); });
  }

  function update() {
    if (!root) return;
    const s = G().state;
    if (document.activeElement !== refs.nameInput) refs.nameInput.value = s.profile.name;
    U.clear(refs.profileInfo).append(
      kv('Ранг', G().rankOf(G().netWorth()).name),
      kv('Игра начата', U.realDate(s.meta.createdAt)),
      kv('Игровой день', String(U.dayOf(s.time.minutes))));
    renderAutosell();
    renderGameplay();
    renderSaveInfo();
    const pv = NT.gen.validateProbabilities(), ev = NT.economy.validateEconomy();
    U.clear(refs.about).append(
      kv('Версия игры', C.version), kv('Версия схемы сохранения', 'v' + C.saveVersion),
      kv('Таблицы вероятностей', pv.ok ? 'корректны (Σ = 100%)' : pv.problems.join('; '), pv.ok ? 'pos' : 'neg'),
      kv('Проверка экономики', ev.ok ? 'без арбитража и аномалий' : ev.problems.join('; '), ev.ok ? 'pos' : 'neg'),
      kv('Время', '1 игровой день = ' + C.time.realSecondsPerDay + ' с'),
      kv('Валюта', '1 £ = ' + C.currency.rubPerGbp + ' игровых ₽ (внутриигровой курс)'));
  }
  function kv(k, v, cls) { return h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v' + (cls ? ' ' + cls : '') }, v)); }

  function saveName() {
    const r = G().setName(refs.nameInput.value);
    refs.nameErr.hidden = r.ok;
    refs.nameErr.textContent = r.ok ? '' : r.error;
    if (r.ok) { refs.nameInput.value = r.name; ui().toast('Имя сохранено: ' + r.name, 'success'); }
  }

  function renderAutosell() {
    const as = G().state.settings.autosell;
    ui().preserveFocus(refs.autosell, () => {
      U.clear(refs.autosell);
      refs.autosell.appendChild(h('div', { class: 'autosell-master' }, ui().toggle(as.enabled, (v) => G().setAutosell('enabled', v), 'Использовать автопродажу', { id: 'as-enabled', fk: 'as-enabled' })));
      const grid = h('div', { class: 'autosell-list' + (as.enabled ? '' : ' disabled') });
      C.rarities.forEach((r) => {
        const valuable = NT.gen.rarityIndex(r.id) >= NT.gen.rarityIndex('legendary');
        grid.appendChild(h('div', { class: 'autosell-item r-' + r.id },
          ui().toggle(as[r.id], async (v, input) => {
            if (v && valuable) {
              const ok = await ui().confirm({ title: 'Автопродажа ' + r.name + '?', icon: 'warn', danger: true, confirmLabel: 'Включить',
                body: 'Номера редкости ' + r.name + ' выпадают крайне редко и стоят дорого. При включении они будут продаваться автоматически, без подтверждения. Вы уверены?' });
              if (!ok) { input.checked = false; return; }
            }
            G().setAutosell(r.id, v);
          }, r.name + ' — ' + r.ru, { id: 'as-' + r.id, fk: 'as-' + r.id })));
      });
      refs.autosell.appendChild(grid);
      refs.autosell.appendChild(h('p', { class: 'hint' }, as.enabled ? 'Продаются автоматически: ' + (C.rarities.filter((r) => as[r.id]).map((r) => r.name).join(', ') || 'ничего') + '.' : 'Автопродажа выключена — каждое решение принимаете вы.'));
    });
  }

  function renderGameplay() {
    const st = G().state.settings;
    ui().preserveFocus(refs.gameplay, () => {
      U.clear(refs.gameplay).append(
        h('div', { class: 'setting' }, h('div', null, h('span', { class: 'setting-title' }, 'Скорость анимации генерации'), h('p', { class: 'hint' }, 'При включённой системной настройке «уменьшить движение» анимация всегда короткая.')),
          ui().segmented([{ value: 'normal', label: 'Обычная' }, { value: 'fast', label: 'Быстрая' }, { value: 'instant', label: 'Без анимации' }], st.animation, (v) => G().setSetting('animation', v), 'Скорость анимации')),
        h('div', { class: 'setting' }, h('div', null, h('span', { class: 'setting-title' }, 'Звуковые эффекты'), h('p', { class: 'hint' }, 'Синтезируются в браузере, без загрузки файлов.')),
          ui().toggle(st.sound, (v) => { G().setSetting('sound', v); if (v) { ui().ensureAudio(); setTimeout(() => ui().sound('rare'), 30); } }, st.sound ? 'Включены' : 'Выключены', { id: 'set-sound', fk: 'set-sound' })),
        h('div', { class: 'setting' }, h('div', null, h('span', { class: 'setting-title' }, 'Подтверждать продажу Epic'), h('p', { class: 'hint' }, 'Для Legendary и Mythic подтверждение запрашивается всегда.')),
          ui().toggle(st.confirmEpic, (v) => G().setSetting('confirmEpic', v), st.confirmEpic ? 'Да' : 'Нет', { id: 'set-confirm', fk: 'set-confirm' })));
    });
  }

  function renderSaveInfo() {
    const st = S().getStatus();
    const s = G().state;
    let size = 0;
    try { size = S().serialize(s, false).length; } catch (e) { size = 0; }
    U.clear(refs.saveInfo).append(
      h('div', { class: 'alert compact ' + (!st.available ? 'alert-danger' : st.ok ? 'alert-success' : 'alert-danger') }, icon(st.available && st.ok ? 'check' : 'warn'),
        h('div', null, h('b', null, !st.available ? 'Автосохранение недоступно' : st.ok ? 'Автосохранение работает' : 'Ошибка сохранения'),
          h('span', null, st.error || (st.lastSaved ? 'Последнее сохранение: ' + new Date(st.lastSaved).toLocaleTimeString('ru-RU') : 'Сохранение произойдёт после первого действия')))),
      h('div', { class: 'kv-list' }, kv('Размер сохранения', (size / 1024).toFixed(1).replace('.', ',') + ' КБ'), kv('Выдано уникальных номеров', U.num(s.issued.length))));
  }

  function saveNow() {
    const ok = S().save(G().state);
    ui().toast(ok ? 'Игра сохранена' : (S().getStatus().error || 'Не удалось сохранить'), ok ? 'success' : 'danger');
  }

  function exportSave() {
    try {
      const r = S().exportSave(G().state);
      ui().toast('Сохранение выгружено: ' + r.name + ' (' + (r.bytes / 1024).toFixed(1).replace('.', ',') + ' КБ)', 'success');
    } catch (e) {
      ui().toast('Не удалось создать файл: ' + (e && e.message ? e.message : 'ошибка браузера'), 'danger');
    }
  }

  async function importFile(file) {
    const res = await S().importFile(file);
    if (!res.ok) {
      ui().modal({ title: 'Файл не прошёл проверку', icon: 'warn', alert: true,
        body: [h('p', null, 'Сохранение не загружено, текущий прогресс не изменён.'), h('ul', { class: 'error-list' }, res.errors.slice(0, 8).map((e) => h('li', null, e))),
          res.errors.length > 8 ? h('p', { class: 'hint' }, 'И ещё ошибок: ' + (res.errors.length - 8)) : null] });
      return;
    }
    const a = S().summarize(res.state), b = S().summarize(G().state);
    const row = (k, x, y) => h('tr', null, h('th', { scope: 'row' }, k), h('td', { class: 'mono' }, x), h('td', { class: 'mono' }, y));
    const ok = await ui().confirm({
      title: 'Заменить текущий прогресс?', icon: 'upload', danger: true, confirmLabel: 'Загрузить сохранение',
      body: [h('p', null, 'Файл проверен и корректен. Текущая игра будет заменена (резервная копия сохранится в браузере).'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table compare' },
          h('thead', null, h('tr', null, h('th'), h('th', { scope: 'col' }, 'Из файла'), h('th', { scope: 'col' }, 'Сейчас'))),
          h('tbody', null, row('Игрок', a.name, b.name), row('Игровой день', String(a.day), String(b.day)), row('Баланс', U.gbp(a.balance), U.gbp(b.balance)),
            row('Номеров', U.num(a.numbers), U.num(b.numbers)), row('Стоимость коллекции', U.gbp(a.collectionValue), U.gbp(b.collectionValue)), row('Генераций', U.num(a.generations), U.num(b.generations)))))],
    });
    if (!ok) return;
    if (NT.views.home.reset) NT.views.home.reset();
    S().applyImported(res.state);
    ui().toast('Сохранение загружено. С возвращением, ' + res.state.profile.name + '!', 'success');
  }

  async function resetGame() {
    const word = 'СБРОС';
    const v = await ui().prompt({ title: 'Начать игру заново?', icon: 'warn', label: 'Введите слово ' + word + ' для подтверждения', okLabel: 'Сбросить прогресс',
      text: 'Весь прогресс будет удалён. Это действие нельзя отменить (кроме восстановления из экспортированного файла).',
      validate: (x) => (x.trim().toUpperCase() === word ? null : 'Введите ' + word + ', чтобы подтвердить') });
    if (v == null) return;
    S().wipe();
    if (NT.views.home.reset) NT.views.home.reset();
    G().resetGame();
    ui().toast('Новая игра начата. Стартовый капитал: ' + U.gbp(C.currency.startBalanceGbp * C.currency.rubPerGbp), 'success');
    ui().go('home');
  }

  NT.views.settings = { mount, update, onShow: update };
})(window.NT = window.NT || {});
