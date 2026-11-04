/*
 * Главная: генератор номеров (анимация «слот-машины»), результат, быстрые покупки
 * и боковые виджеты — капитал, рынок, задания дня, последние операции.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const E = () => NT.economy;
  const B = () => NT.bank;
  const ui = () => NT.ui;

  let root = null;
  const refs = {};
  let anim = null;        // текущая анимация генерации
  let stageKey = null;    // какое состояние сейчас отрисовано на сцене
  let lastResult = null;  // { kind: 'kept' | 'sold' | 'autosold', number, price }

  const RI = (id) => NT.gen.rarityIndex(id);

  /* ================= Каркас ================= */
  function mount(el) {
    root = el;
    refs.ff = h('div', { class: 'gen-ff' });
    refs.ffHint = h('p', { class: 'hint gen-ff-hint' });
    refs.classes = h('div', { class: 'class-picker', role: 'group', 'aria-label': 'Класс карты' });
    refs.cells = [];
    const reels = h('div', { class: 'reels', 'aria-hidden': 'true' }, h('span', { class: 'reel-prefix' }, C.number.prefix));
    let idx = 0;
    C.number.groups.forEach((len) => {
      const g = h('span', { class: 'reel-group' });
      for (let i = 0; i < len; i++) {
        const d = h('span', { class: 'reel-d' }, '•');
        const cell = h('span', { class: 'reel' }, d);
        refs.cells.push({ cell, d, i: idx++ });
        g.appendChild(cell);
      }
      reels.appendChild(g);
    });
    refs.stageBadge = h('div', { class: 'stage-badge' });
    refs.stageStatus = h('p', { class: 'stage-status' });
    refs.skip = h('button', { type: 'button', class: 'btn btn-ghost btn-sm stage-skip', hidden: true, onclick: () => anim && anim.finish() }, icon('skip'), 'Пропустить анимацию');
    refs.stage = h('div', { class: 'stage idle', onclick: (e) => { if (anim && e.target === refs.stage) anim.finish(); } },
      h('div', { class: 'stage-shine', 'aria-hidden': 'true' }), refs.stageBadge, reels, refs.stageStatus, refs.skip);
    refs.result = h('div', { class: 'result-wrap' });
    refs.genBtn = h('button', { type: 'button', class: 'btn btn-primary btn-xl gen-btn', 'data-fk': 'gen', onclick: onGenerate });
    refs.genNote = h('p', { class: 'hint gen-note', 'aria-live': 'polite' });
    refs.buy = h('div', { class: 'buy-row', role: 'group', 'aria-label': 'Быстрая покупка карт' });
    refs.autosell = h('div', { class: 'autosell-row' });

    const gen = h('section', { class: 'card generator', 'aria-label': 'Генератор номеров' },
      h('div', { class: 'gen-top' }, h('h2', { class: 'card-title' }, 'Карта для активации'), refs.ff),
      refs.classes, refs.ffHint, refs.stage, refs.result,
      h('div', { class: 'gen-actions' }, refs.genBtn, refs.genNote, refs.buy, refs.autosell));

    refs.capital = h('section', { class: 'card widget', 'aria-label': 'Капитал' });
    refs.alerts = h('div', { class: 'alerts' });
    refs.market = h('section', { class: 'card widget', 'aria-label': 'Рынок' });
    refs.quests = h('section', { class: 'card widget', 'aria-label': 'Задания дня' });
    refs.recent = h('section', { class: 'card widget', 'aria-label': 'Последние операции' });

    root.appendChild(ui().pageHead('Генератор номеров', 'Активируйте SIM-карты и собирайте самые красивые номера. Редкость определяется только цифрами.'));
    root.appendChild(h('div', { class: 'home-grid' },
      h('div', { class: 'home-main' }, gen),
      h('aside', { class: 'home-side', 'aria-label': 'Сводка' }, refs.alerts, refs.capital, refs.quests, refs.market, refs.recent)));
    showIdleDigits();
  }
  const icon = (n) => ui().icon(n);

  /* ================= Обновление ================= */
  function update() {
    if (!root) return;
    renderPicker();
    renderActions();
    if (anim) return; // во время анимации результат и сводка не обновляются, чтобы не раскрыть номер заранее
    renderStage();
    renderResult();
    renderCapital();
    renderAlerts();
    renderMarket();
    renderQuests();
    renderRecent();
  }

  function tick() {
    if (refs.questTimer) refs.questTimer.textContent = questTimerText();
  }

  function questTimerText() {
    const m = G().state.time.minutes;
    const left = U.MIN_PER_DAY - (m % U.MIN_PER_DAY);
    const realSec = Math.ceil(left * C.time.realSecondsPerDay / U.MIN_PER_DAY);
    return 'Новые задания через ' + U.duration(left) + ' (≈ ' + realSec + ' с)';
  }

  function renderPicker() {
    const s = G().state;
    const busy = !!anim;
    ui().preserveFocus(refs.ff, () => {
      U.clear(refs.ff).appendChild(ui().segmented(
        Object.keys(C.formFactors).map((id) => ({ value: id, label: C.formFactors[id].short, icon: id, disabled: busy })),
        s.settings.formFactor, (v) => G().setSetting('formFactor', v), 'Тип карты', 'seg-ff'));
    });
    refs.ffHint.textContent = C.formFactors[s.settings.formFactor].description + ' Шансы редкости одинаковые.';
    ui().preserveFocus(refs.classes, () => {
      U.clear(refs.classes);
      C.classes.forEach((c) => {
        const price = E().cardPrice(c.id, s.settings.formFactor);
        const inv = s.inventory[G().invKey(s.settings.formFactor, c.id)];
        const ins = E().classInsights(c.id, s.settings.formFactor);
        const selected = s.settings.selectedClass === c.id;
        refs.classes.appendChild(h('button', {
          type: 'button', class: 'class-card c-' + c.id + (selected ? ' active' : ''), 'aria-pressed': selected ? 'true' : 'false',
          'data-fk': 'cls-' + c.id, disabled: busy,
          'aria-label': c.name + ', цена ' + U.gbp(price) + ', в запасе ' + inv + ', шанс Epic и выше ' + U.pctRaw(ins.epicPlus, 2),
          onclick: () => G().setSetting('selectedClass', c.id),
        },
        h('span', { class: 'cc-tier', 'aria-hidden': 'true' }, '●'.repeat(c.tier)),
        h('span', { class: 'cc-name' }, c.short),
        h('span', { class: 'cc-price mono' }, U.gbpCompact(price)),
        h('span', { class: 'cc-meta' }, 'Epic+ ' + U.pctRaw(ins.epicPlus, 2)),
        inv > 0 ? h('span', { class: 'cc-inv mono', title: 'Карт в запасе' }, '×' + U.num(inv)) : null));
      });
    });
  }

  function renderActions() {
    const s = G().state;
    const cls = s.settings.selectedClass, ff = s.settings.formFactor;
    const price = E().cardPrice(cls, ff);
    const inv = s.inventory[G().invKey(ff, cls)];
    const can = G().canGenerate(cls, ff);
    U.clear(refs.genBtn);
    if (anim) {
      refs.genBtn.append(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, 'Активация…'));
      refs.genBtn.disabled = true;
    } else if (inv > 0) {
      refs.genBtn.append(icon('spark'), h('span', null, 'Сгенерировать'));
      refs.genBtn.disabled = false;
    } else {
      refs.genBtn.append(icon('spark'), h('span', null, 'Купить и сгенерировать'), h('span', { class: 'btn-price mono' }, U.gbp(price)));
      refs.genBtn.disabled = !can.ok;
    }
    refs.genNote.textContent = anim ? 'Номер уже определён и сохранён — анимация лишь раскрывает его.'
      : !can.ok ? can.error
        : inv > 0 ? 'Карта «' + E().CLASS[cls].short + '» (' + C.formFactors[ff].short + ') из запаса · осталось ' + U.num(inv)
          : 'Карта будет куплена автоматически за ' + U.gbp(price);
    refs.genNote.classList.toggle('neg', !anim && !can.ok);

    ui().preserveFocus(refs.buy, () => {
      U.clear(refs.buy);
      refs.buy.appendChild(h('span', { class: 'buy-label' }, 'Купить в запас:'));
      [1, 5, 10].forEach((q) => {
        const total = price * q;
        refs.buy.appendChild(h('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'buy-' + q, disabled: !!anim || total > s.balance,
          title: total > s.balance ? 'Недостаточно средств' : null,
          onclick: () => buy(q),
        }, '×' + q, h('span', { class: 'mono muted' }, U.gbpShort(total))));
      });
    });

    const as = s.settings.autosell;
    const list = C.rarities.filter((r) => as[r.id]).map((r) => r.name);
    ui().preserveFocus(refs.autosell, () => {
      U.clear(refs.autosell).append(
        ui().toggle(as.enabled, (v) => { G().setAutosell('enabled', v); ui().toast(v ? 'Автопродажа включена' : 'Автопродажа выключена', 'info'); }, 'Автопродажа', { fk: 'as-main', id: 'home-autosell' }),
        h('span', { class: 'autosell-sum' }, as.enabled ? (list.length ? list.join(', ') : 'редкости не выбраны') : 'выключена'),
        h('a', { href: '#settings', 'data-route': 'settings', class: 'link' }, 'Настроить'));
    });
  }

  function buy(q) {
    const s = G().state;
    const r = G().buyCards(s.settings.selectedClass, s.settings.formFactor, q);
    if (!r.ok) { ui().toast(r.error, 'danger'); ui().sound('error'); return; }
    ui().sound('buy');
    ui().toast('Куплено карт: ' + q + ' · ' + E().CLASS[s.settings.selectedClass].short + ' ' + C.formFactors[s.settings.formFactor].short + ' за ' + U.gbp(r.total), 'success');
  }

  /* ================= Сцена и анимация ================= */
  function setDigits(body, locked) {
    refs.cells.forEach((c, i) => {
      c.d.textContent = body ? body.charAt(i) : '•';
      c.cell.classList.toggle('locked', !!locked);
      c.cell.classList.remove('spin');
    });
  }
  function stageClass(state, rarity) {
    refs.stage.className = 'stage ' + state + (rarity ? ' r-' + rarity : '');
  }
  function showIdleDigits() { setDigits(null, false); stageClass('idle'); }

  function currentStageKey() {
    const s = G().state;
    if (s.pending) return 'p:' + s.pending.opId;
    if (lastResult) return 'r:' + lastResult.number.id + ':' + lastResult.kind;
    return 'idle';
  }

  function renderStage() {
    const key = currentStageKey();
    if (key === stageKey) return; // сцена уже показывает это состояние — не сбиваем анимацию раскрытия
    stageKey = key;
    const s = G().state;
    U.clear(refs.stageBadge);
    refs.skip.hidden = true;
    if (s.pending) {
      const n = s.pending.number;
      setDigits(n.body, true);
      stageClass('revealed', n.rarity);
      refs.stageBadge.appendChild(ui().rarityBadge(n.rarity, 'lg'));
      refs.stageStatus.textContent = 'Оценка красоты ' + n.score + '/100 · ' + NT.gen.analyze(n.body).primaryLabel;
    } else if (lastResult) {
      setDigits(lastResult.number.body, true);
      stageClass('done', lastResult.number.rarity);
      refs.stageBadge.appendChild(ui().rarityBadge(lastResult.number.rarity, 'lg'));
      refs.stageStatus.textContent = lastResult.kind === 'kept' ? 'Номер добавлен в коллекцию' : 'Номер продан за ' + U.gbp(lastResult.price);
    } else {
      showIdleDigits();
      refs.stageStatus.textContent = 'Выберите карту и нажмите «Сгенерировать»';
    }
  }

  function onGenerate() {
    if (anim || G().busy) return;
    const s = G().state;
    ui().ensureAudio && s.settings.sound && ui().ensureAudio();
    const res = G().startGeneration(s.settings.selectedClass, s.settings.formFactor);
    if (!res.ok) { ui().toast(res.error, 'danger'); ui().sound('error'); return; }
    if (res.autoKept) ui().toast('Предыдущий номер ' + NT.gen.format(res.autoKept.body) + ' сохранён в коллекцию', 'info');
    lastResult = null;
    runAnimation(res.number, res.opId);
  }

  function runAnimation(number, opId) {
    const s = G().state;
    const cfg = C.ui.animation[s.settings.animation] || C.ui.animation.normal;
    let total = cfg.total;
    const reduced = ui().reducedMotion();
    if (reduced) total = Math.min(total, 600);
    const digits = number.body.split('');
    const n = digits.length;
    const lockStart = total * (1 - cfg.lockSpan);
    const step = n > 1 ? (total - lockStart) / (n - 1) : 0;
    const lockAt = digits.map((_, i) => lockStart + i * step);
    const nextAt = digits.map(() => 0);
    const locked = digits.map(() => false);
    const t0 = performance.now();
    let raf = 0, fallback = 0, finished = false;

    anim = { opId, finish, cancel() { finished = true; cancelAnimationFrame(raf); clearTimeout(fallback); anim = null; } };
    stageKey = 'anim:' + opId;
    U.clear(refs.stageBadge);
    U.clear(refs.result).appendChild(h('div', { class: 'result result-wait' },
      h('div', { class: 'rw-line' }), h('p', { class: 'muted' }, 'Карта «' + E().CLASS[number.classId].name + '» активируется…')));
    stageClass('spinning');
    refs.stageStatus.textContent = 'Подбор комбинации…';
    refs.skip.hidden = total <= 0;
    renderPicker();
    renderActions();

    function lock(i) {
      locked[i] = true;
      const c = refs.cells[i];
      c.d.textContent = digits[i];
      c.cell.classList.remove('spin');
      c.cell.classList.add('locked');
      if (!reduced && c.cell.animate) c.cell.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      ui().sound('lock');
    }
    function frame(now) {
      const t = now - t0;
      for (let i = 0; i < n; i++) {
        if (locked[i]) continue;
        if (t >= lockAt[i]) { lock(i); continue; }
        if (t >= nextAt[i]) {
          const c = refs.cells[i];
          c.d.textContent = String(Math.floor(Math.random() * 10));
          c.cell.classList.add('spin');
          const remain = lockAt[i] - t;
          const interval = remain > 700 ? 50 : 50 + (700 - remain) * 0.3; // замедление перед фиксацией
          nextAt[i] = t + interval;
          if (!reduced && c.d.animate) c.d.animate([{ transform: 'translateY(-38%)', opacity: 0.35 }, { transform: 'translateY(0)', opacity: 1 }], { duration: Math.min(interval, 140), easing: 'ease-out' });
        }
      }
      if (locked.every(Boolean)) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      for (let i = 0; i < n; i++) if (!locked[i]) { locked[i] = true; refs.cells[i].d.textContent = digits[i]; refs.cells[i].cell.classList.remove('spin'); refs.cells[i].cell.classList.add('locked'); }
      anim = null;
      const f = G().finishGeneration(opId);
      reveal(number, f);
    }
    if (total <= 0) { finish(); return; }
    raf = requestAnimationFrame(frame);
    fallback = setTimeout(finish, total + 2500); // страховка, если вкладка «уснула»
  }

  function reveal(number, f) {
    const rarity = number.rarity;
    if (f.autoSold) lastResult = { kind: 'autosold', number, price: f.price };
    stageClass('revealed reveal-in', rarity);
    U.clear(refs.stageBadge).appendChild(ui().rarityBadge(rarity, 'lg'));
    const a = NT.gen.analyze(number.body);
    refs.stageStatus.textContent = 'Оценка красоты ' + number.score + '/100 · ' + a.primaryLabel;
    refs.skip.hidden = true;
    const value = f.autoSold ? f.price : G().currentValue(number);
    const sr = document.getElementById('sr-status');
    if (sr) sr.textContent = 'Выпал номер ' + NT.gen.format(number.body) + ', редкость ' + E().RARITY[rarity].name + ', стоимость ' + U.gbp(value) + (f.autoSold ? ', продан автоматически' : '');
    ui().sound(rarity);
    const ri = RI(rarity);
    if (ri >= RI('epic')) ui().confetti(rarity, ri >= RI('legendary') ? 1 : 0.6);
    if (ri >= RI('legendary')) ui().flash(rarity);
    stageKey = currentStageKey();
    update();
    if (NT.app) NT.app.flushNotices(ri >= RI('epic'));
  }

  /* ================= Карточка результата ================= */
  function patternChips(body) {
    const a = NT.gen.analyze(body);
    const wrap = h('div', { class: 'pattern-chips' });
    a.patterns.slice(0, 4).forEach((p, i) => wrap.appendChild(h('span', { class: 'chip pattern-chip' + (i === 0 ? ' primary' : '') }, p.label)));
    if (!a.patterns.length) wrap.appendChild(h('span', { class: 'chip pattern-chip' }, 'Без выраженного узора'));
    return wrap;
  }

  function valueGrid(n, value) {
    const pl = value - n.cost;
    const mult = n.cost > 0 ? value / n.cost : 0;
    const mm = E().marketMultiplier(G().state.market, n);
    return h('div', { class: 'value-grid' },
      h('div', { class: 'vg-main' }, h('span', { class: 'vg-label' }, 'Рыночная стоимость'), h('span', { class: 'vg-value mono' }, U.gbp(value)),
        h('span', { class: 'vg-sub' }, 'база ' + U.gbp(n.baseValue) + ' · рынок ×' + mm.toFixed(2).replace('.', ','))),
      h('div', null, h('span', { class: 'vg-label' }, 'Цена карты'), h('span', { class: 'mono' }, U.gbp(n.cost))),
      h('div', null, h('span', { class: 'vg-label' }, 'Результат'), ui().delta(pl), h('span', { class: 'vg-sub mono' }, '×' + mult.toFixed(2).replace('.', ','))));
  }

  function renderResult() {
    const s = G().state;
    const box = refs.result;
    ui().preserveFocus(box, () => {
      U.clear(box);
      if (s.pending) {
        const n = s.pending.number;
        const value = G().currentValue(n);
        const keep = h('button', { type: 'button', class: 'btn btn-primary', 'data-fk': 'keep', onclick: onKeep }, icon('collection'), 'Оставить в коллекции');
        const sell = h('button', { type: 'button', class: 'btn btn-gold-ghost', 'data-fk': 'sell', onclick: onSell }, icon('coin'), 'Продать за ', h('span', { class: 'mono' }, U.gbp(value)));
        box.appendChild(h('div', { class: 'result r-' + n.rarity },
          h('div', { class: 'result-head' },
            h('div', { class: 'result-meta' }, ui().rarityBadge(n.rarity), ui().classChip(n.classId), ui().ffChip(n.formFactor), h('span', { class: 'chip chip-ghost mono' }, n.id)),
            beautyMeter(n.score)),
          patternChips(n.body),
          valueGrid(n, value),
          h('div', { class: 'result-actions' }, keep, sell),
          h('p', { class: 'hint' }, 'Если начать новую генерацию, этот номер автоматически сохранится в коллекцию.')));
        return;
      }
      if (lastResult) {
        const n = lastResult.number;
        const txt = lastResult.kind === 'kept' ? 'Добавлен в коллекцию' : lastResult.kind === 'autosold' ? 'Продан автоматически за ' + U.gbp(lastResult.price) : 'Продан за ' + U.gbp(lastResult.price);
        box.appendChild(h('div', { class: 'result result-done r-' + n.rarity },
          h('div', { class: 'result-head' },
            h('div', { class: 'result-meta' }, ui().rarityBadge(n.rarity), ui().classChip(n.classId), ui().ffChip(n.formFactor)), beautyMeter(n.score)),
          h('p', { class: 'result-done-text' }, icon(lastResult.kind === 'kept' ? 'check' : 'coin'), txt,
            lastResult.kind !== 'kept' ? ui().delta(lastResult.price - n.cost) : null),
          lastResult.kind === 'autosold' ? h('p', { class: 'hint' }, 'Автопродажа срабатывает для выбранных редкостей. Её можно отключить переключателем ниже.') : null,
          lastResult.kind === 'kept' ? h('a', { href: '#collection', 'data-route': 'collection', class: 'link' }, 'Открыть коллекцию') : null));
        return;
      }
      box.appendChild(h('div', { class: 'result result-intro' },
        h('ol', { class: 'steps' },
          h('li', null, h('b', null, 'Выберите тип и класс карты.'), ' Дорогие классы чаще дают редкие номера.'),
          h('li', null, h('b', null, 'Активируйте карту.'), ' Номер и его редкость определяются сразу, анимация только раскрывает их.'),
          h('li', null, h('b', null, 'Решите судьбу номера:'), ' оставьте в коллекции или продайте по рыночной цене.'))));
    });
  }

  function beautyMeter(score) {
    return h('div', { class: 'beauty', title: 'Оценка красоты' },
      h('span', { class: 'beauty-label' }, 'Красота'),
      ui().progress(score, 100, 'beauty-bar', 'Оценка красоты ' + score + ' из 100'),
      h('span', { class: 'beauty-val mono' }, String(score)));
  }

  function onKeep() {
    const p = G().state.pending;
    if (!p) return;
    const r = G().keepPending(p.opId);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    lastResult = { kind: r.sold ? 'sold' : 'kept', number: p.number, price: r.price };
    if (r.sold) ui().toast('Коллекция заполнена — номер продан за ' + U.gbp(r.price), 'warn');
    else ui().toast('Номер ' + NT.gen.format(p.number.body) + ' добавлен в коллекцию', 'success');
    focusGen();
  }

  async function onSell() {
    const s = G().state;
    const p = s.pending;
    if (!p) return;
    const n = p.number;
    const value = G().currentValue(n);
    const ri = RI(n.rarity);
    if (ri >= RI('legendary') || (s.settings.confirmEpic && n.rarity === 'epic')) {
      const ok = await ui().confirm({
        title: 'Продать номер ' + E().RARITY[n.rarity].name + '?', icon: 'warn', danger: true,
        body: [h('p', { class: 'confirm-number' }, ui().numberNode(n.body, 'num-lg r-text-' + n.rarity)),
          h('p', null, 'Это ' + E().RARITY[n.rarity].ru.toLowerCase() + ' номер. После продажи он навсегда исчезнет — такие номера выпадают очень редко.'),
          h('p', null, 'Вы получите ', h('b', { class: 'mono' }, U.gbp(value)), '.')],
        confirmLabel: 'Продать за ' + U.gbp(value), cancelLabel: 'Оставить',
      });
      if (!ok) return;
    }
    const cur = G().state.pending;
    if (!cur || cur.opId !== p.opId) return;
    const r = G().sellPending(p.opId);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    lastResult = { kind: 'sold', number: r.number, price: r.price };
    ui().sound('coin');
    ui().toast('Продано: ' + NT.gen.format(r.number.body) + ' — +' + U.gbp(r.price), 'sale');
    focusGen();
  }

  function focusGen() {
    requestAnimationFrame(() => { if (refs.genBtn && !refs.genBtn.disabled && root.contains(document.activeElement) === false) refs.genBtn.focus({ preventScroll: true }); });
  }

  /* ================= Боковые виджеты ================= */
  function row(label, value, cls) {
    return h('div', { class: 'kv' + (cls ? ' ' + cls : '') }, h('span', { class: 'kv-k' }, label), h('span', { class: 'kv-v mono' }, value));
  }

  function renderCapital() {
    const s = G().state;
    const g = G();
    const nw = g.netWorth();
    const rank = g.rankOf(nw);
    const ranks = C.ranks;
    const next = ranks.find((r) => r.minGbp * C.currency.rubPerGbp > nw);
    const box = U.clear(refs.capital);
    const invCount = Object.values(s.inventory).reduce((a, v) => a + v, 0);
    box.append(
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, icon('coin'), 'Капитал'), h('span', { class: 'chip chip-gold' }, rank.name)),
      h('div', { class: 'big-value mono' }, U.gbp(nw)),
      next ? h('div', { class: 'rank-next' }, ui().progress(nw - rank.minGbp * 100, (next.minGbp - rank.minGbp) * 100, 'thin gold', 'Прогресс до ранга ' + next.name),
        h('span', { class: 'hint' }, 'До ранга «' + next.name + '»: ' + U.gbpShort(next.minGbp * C.currency.rubPerGbp - nw))) : h('p', { class: 'hint' }, 'Максимальный ранг достигнут'),
      h('div', { class: 'kv-list' },
        row('Баланс', U.gbp(s.balance)),
        row('Коллекция · ' + U.num(s.collection.length), U.gbp(g.collectionValue())),
        invCount ? row('Карты в запасе · ' + U.num(invCount), U.gbp(g.inventoryValue())) : null,
        B().activeDeposits(s).length ? row('Вклады', U.gbp(g.depositsValue())) : null,
        g.debtValue() > 0 ? row('Долг по кредитам', '−' + U.gbp(g.debtValue()), 'neg') : null));
  }

  function renderAlerts() {
    const s = G().state;
    const box = U.clear(refs.alerts);
    const overdue = B().activeLoans(s).filter((l) => s.time.minutes > l.dueMinute);
    overdue.forEach((l) => box.appendChild(h('div', { class: 'alert alert-danger', role: 'alert' }, icon('warn'),
      h('div', null, h('b', null, 'Просрочен кредит ' + l.id), h('span', null, 'Долг ' + U.gbp(B().outstanding(l)) + ' · штрафы ' + U.pct(C.bank.loan.overduePenaltyDaily) + ' в день. Через ' +
        Math.max(0, C.bank.loan.collectionAfterDays - l.overdueDays) + ' дн. — принудительное взыскание.')),
      h('a', { href: '#bank', 'data-route': 'bank', class: 'btn btn-danger btn-sm' }, 'В банк'))));
    const matured = B().activeDeposits(s).filter((d) => B().isMatured(s, d));
    if (matured.length) box.appendChild(h('div', { class: 'alert alert-success' }, icon('deposit'),
      h('div', null, h('b', null, 'Вклад готов к получению'), h('span', null, matured.length + ' ' + U.plural(matured.length, ['вклад', 'вклада', 'вкладов']) + ' на ' + U.gbp(matured.reduce((a, d) => a + d.amount + d.interest, 0)))),
      h('a', { href: '#bank', 'data-route': 'bank', class: 'btn btn-ghost btn-sm' }, 'Забрать')));
    const offers = s.collection.filter((n) => n.offer && n.offer.expiresDay >= U.dayOf(s.time.minutes)).length;
    if (offers) box.appendChild(h('div', { class: 'alert alert-info' }, icon('tag'),
      h('div', null, h('b', null, 'Предложения коллекционеров: ' + offers), h('span', null, 'Покупатели ждут ответа на выставленные номера.')),
      h('a', { href: '#collection', 'data-route': 'collection', class: 'btn btn-ghost btn-sm', onclick: () => { if (NT.views.collection) NT.views.collection.preset({ status: 'listed' }); } }, 'Смотреть')));
    const gs = B().grantStatus(s, G().netWorth(), G().cheapestCard());
    if (gs.eligible) {
      box.appendChild(h('div', { class: 'alert alert-gold' }, icon('gift'),
        h('div', null, h('b', null, 'Поддержка банка'), h('span', null, gs.available ? 'Капитал исчерпан — банк готов выдать ' + U.gbp(gs.amount) + ' на новые попытки.' : 'Следующая поддержка будет доступна в День ' + gs.nextDay + '.')),
        gs.available ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { const r = G().claimGrant(); if (r.ok) { ui().toast('Получено ' + U.gbp(r.amount) + ' — удачи!', 'success'); ui().sound('coin'); } else ui().toast(r.error, 'danger'); } }, 'Получить') : null));
    }
  }

  function renderMarket() {
    const s = G().state;
    const m = s.market;
    const hist = m.history.map((x) => x.index);
    const prev = hist.length > 1 ? hist[hist.length - 2] : m.index;
    const ch = m.index - prev;
    const ev = E().activeEvent(m);
    const today = U.dayOf(s.time.minutes);
    const fams = Object.keys(m.demand).filter((f) => f !== 'plain').sort((a, b) => m.demand[b] - m.demand[a]);
    const top = fams[0], low = fams[fams.length - 1];
    const box = U.clear(refs.market);
    box.append(
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, icon('stats'), 'Рынок номеров'), h('span', { class: 'hint' }, 'День ' + today)),
      h('div', { class: 'market-top' },
        h('div', null, h('span', { class: 'vg-label' }, 'Индекс рынка'), h('div', { class: 'market-index mono' }, '×' + m.index.toFixed(3).replace('.', ',')),
          h('span', { class: 'mono ' + (ch > 0 ? 'pos' : ch < 0 ? 'neg' : 'muted') }, (ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : '■ ') + U.pct(Math.abs(ch), 1) + ' за день')),
        ui().sparkline(hist, { width: 150, height: 44 })),
      ev ? h('div', { class: 'market-event' }, h('span', { class: 'me-icon', 'aria-hidden': 'true' }, ui().glyph(ev.icon)),
        h('div', null, h('b', null, ev.name), h('span', null, ev.description), h('span', { class: 'hint' }, 'Осталось: ' + (m.event.endDay - today + 1) + ' ' + U.plural(m.event.endDay - today + 1, ['день', 'дня', 'дней']))))
        : h('p', { class: 'hint' }, 'Событий нет. Рынок спокоен — события начинаются случайно с наступлением нового дня.'),
      h('div', { class: 'kv-list' },
        row('Высокий спрос', NT.gen.FAMILIES[top] + ' ' + fmtMult(m.demand[top]), m.demand[top] >= 1 ? 'pos-v' : ''),
        row('Низкий спрос', NT.gen.FAMILIES[low] + ' ' + fmtMult(m.demand[low]), m.demand[low] < 1 ? 'neg-v' : '')));
  }
  function fmtMult(x) { const d = Math.round((x - 1) * 1000) / 10; return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d).toString().replace('.', ',') + '%'; }

  function questItem(q, compact) {
    const done = q.progress >= q.target;
    const isMoney = q.type === 'earn';
    const prog = isMoney ? U.gbpShort(q.progress) + ' / ' + U.gbpShort(q.target) : q.progress + ' / ' + q.target;
    return h('li', { class: 'quest' + (q.claimed ? ' claimed' : done ? ' done' : '') },
      h('div', { class: 'quest-top' }, h('span', { class: 'quest-text' }, NT.achievements.questText(q)), h('span', { class: 'quest-reward mono' }, '+' + U.gbp(q.reward))),
      ui().progress(q.progress, q.target, 'thin' + (done ? ' green' : ''), NT.achievements.questText(q)),
      h('div', { class: 'quest-bottom' }, h('span', { class: 'hint mono' }, prog),
        q.claimed ? h('span', { class: 'chip chip-ghost' }, icon('check'), 'Получено')
          : done ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-fk': 'q-' + q.id, onclick: () => claim(q.id) }, 'Забрать')
            : compact ? null : h('span', { class: 'hint' }, 'В процессе')));
  }
  function claim(id) {
    const r = G().claimQuest(id);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().sound('coin');
    ui().toast('Награда за задание: +' + U.gbp(r.reward), 'success');
  }

  function renderQuests() {
    const s = G().state;
    const box = refs.quests;
    ui().preserveFocus(box, () => {
      U.clear(box);
      refs.questTimer = h('p', { class: 'hint' }, questTimerText());
      const list = h('ul', { class: 'quest-list' });
      s.quests.list.forEach((q) => list.appendChild(questItem(q, true)));
      box.append(h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, icon('achievements'), 'Задания дня'),
        h('a', { href: '#achievements', 'data-route': 'achievements', class: 'link' }, 'Все награды')), list, refs.questTimer);
    });
  }

  const TX_LABEL = { buy: 'Покупка', sell: 'Продажа', autosell: 'Автопродажа', offer: 'Сделка', deposit_open: 'Вклад', deposit_close: 'Вклад', loan_take: 'Кредит', loan_repay: 'Кредит', collection: 'Взыскание', seizure: 'Изъятие', quest: 'Задание', achievement: 'Достижение', grant: 'Поддержка' };
  function txItem(t) {
    return h('li', { class: 'tx' }, h('div', { class: 'tx-main' }, h('span', { class: 'tx-text' }, t.text), h('span', { class: 'hint' }, (TX_LABEL[t.type] || 'Операция') + ' · День ' + t.day + ', ' + U.clockOf(t.minute))),
      ui().delta(t.amount));
  }
  function renderRecent() {
    const s = G().state;
    const box = U.clear(refs.recent);
    const list = h('ul', { class: 'tx-list' });
    s.transactions.slice(0, 6).forEach((t) => list.appendChild(txItem(t)));
    box.append(h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, icon('clock'), 'Последние операции'),
      h('a', { href: '#stats', 'data-route': 'stats', class: 'link' }, 'Журнал')),
    s.transactions.length ? list : ui().empty('Операций пока нет', 'Купите первую карту — здесь появится история.'));
  }

  function onShow() { update(); }
  /** Сбрасывает локальное состояние (например, после импорта сохранения). */
  function reset() {
    lastResult = null;
    if (anim) anim.cancel();
    anim = null;
    stageKey = null;
    if (refs.stage) { showIdleDigits(); refs.skip.hidden = true; }
    if (NT.app) NT.app.flushNotices();
  }

  NT.views.home = { mount, update, tick, onShow, reset, questItem, txItem, TX_LABEL, get animating() { return !!anim; } };
})(window.NT = window.NT || {});
