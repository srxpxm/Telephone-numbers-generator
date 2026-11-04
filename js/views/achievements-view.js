/*
 * Достижения (разовые награды) и ежедневные задания.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const h = U.h;
  const G = () => NT.game;
  const A = () => NT.achievements;
  const ui = () => NT.ui;

  let root = null;
  const refs = {};

  function mount(el) {
    root = el;
    refs.summary = h('div', { class: 'ach-summary card' });
    refs.quests = h('section', { class: 'card', 'aria-label': 'Задания дня' });
    refs.grid = h('div', { class: 'ach-grid' });
    root.append(ui().pageHead('Достижения', 'Разовые награды за важные шаги и три новых задания каждый игровой день.'),
      refs.summary, refs.quests, h('h2', { class: 'section-title' }, 'Все достижения'), refs.grid);
  }

  function update() {
    if (!root) return;
    const s = G().state;
    const nw = G().netWorth();
    const defs = A().DEFS;
    const unlocked = defs.filter((d) => s.achievements[d.id]);
    const earned = unlocked.reduce((a, d) => a + A().reward(d.id), 0);
    const totalRewards = defs.reduce((a, d) => a + A().reward(d.id), 0);
    U.clear(refs.summary).append(
      h('div', { class: 'ach-sum-main' }, h('span', { class: 'vg-label' }, 'Открыто достижений'), h('div', { class: 'big-value mono' }, unlocked.length + ' / ' + defs.length),
        ui().progress(unlocked.length, defs.length, 'gold', 'Открыто достижений')),
      h('div', { class: 'ach-sum-side' },
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Получено наград'), h('span', { class: 'kv-v mono pos' }, U.gbp(earned))),
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Всего доступно'), h('span', { class: 'kv-v mono' }, U.gbp(totalRewards))),
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Выполнено заданий'), h('span', { class: 'kv-v mono' }, U.num(s.stats.questsCompleted)))));

    ui().preserveFocus(refs.quests, () => {
      U.clear(refs.quests);
      const list = h('ul', { class: 'quest-list quest-list-wide' });
      s.quests.list.forEach((q) => list.appendChild(NT.views.home.questItem(q, false)));
      refs.timer = h('p', { class: 'hint' });
      refs.quests.append(h('div', { class: 'card-head' }, h('div', { class: 'card-titles' }, h('h2', { class: 'card-title' }, ui().icon('check'), 'Задания дня · День ' + s.quests.day),
        h('p', { class: 'card-sub' }, 'Награда растёт вместе с вашим капиталом. Невостребованные награды за выполненные задания зачисляются автоматически в начале следующего дня.'))), list, refs.timer);
      tick();
    });

    U.clear(refs.grid);
    defs.forEach((d) => {
      const got = s.achievements[d.id];
      let prog = null;
      if (!got && d.progress) {
        const p = d.progress(s, { netWorth: nw });
        prog = h('div', { class: 'ach-progress' }, ui().progress(p[0], p[1], 'thin gold', d.title),
          h('span', { class: 'hint mono' }, d.money ? U.gbpShort(Math.min(p[0], p[1])) + ' / ' + U.gbpShort(p[1]) : U.num(Math.min(p[0], p[1])) + ' / ' + U.num(p[1])));
      }
      refs.grid.appendChild(h('article', { class: 'ach' + (got ? ' got' : '') + (d.rarity ? ' r-' + d.rarity : ''), 'aria-label': d.title + (got ? ', получено' : ', не получено') },
        h('div', { class: 'ach-icon', 'aria-hidden': 'true' }, ui().glyph(d.icon)),
        h('div', { class: 'ach-body' },
          h('h3', { class: 'ach-title' }, d.title),
          h('p', { class: 'ach-desc' }, d.desc),
          prog,
          h('div', { class: 'ach-foot' }, h('span', { class: 'mono ach-reward' }, '+' + U.gbp(A().reward(d.id))),
            got ? h('span', { class: 'chip chip-green' }, ui().icon('check'), 'День ' + got.day) : h('span', { class: 'chip chip-ghost' }, ui().icon('lock'), 'Закрыто')))));
    });
  }

  function tick() {
    if (!refs.timer) return;
    const m = G().state.time.minutes;
    const left = U.MIN_PER_DAY - (m % U.MIN_PER_DAY);
    refs.timer.textContent = 'Новые задания через ' + U.duration(left) + ' игрового времени (≈ ' + Math.ceil(left * NT.CONFIG.time.realSecondsPerDay / U.MIN_PER_DAY) + ' с)';
  }

  NT.views.achievements = { mount, update, tick, onShow: update };
})(window.NT = window.NT || {});
