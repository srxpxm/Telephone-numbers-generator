/*
 * Достижения (разовые награды) и ежедневные задания (обновляются каждый игровой день).
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;
  const U = NT.util;
  const MILLION_GBP = 1000000 * C.currency.rubPerGbp;
  const RUB_MILLION = 1000000;

  const DEFS = [
    { id: 'first_number', icon: '01', title: 'Первый номер', desc: 'Сгенерируйте свой первый номер.', test: (s) => s.stats.generations >= 1 },
    { id: 'first_sale', icon: '£', title: 'Первая продажа', desc: 'Продайте любой номер.', test: (s) => s.stats.sales >= 1 },
    { id: 'first_rare', icon: 'gem', title: 'Первый Rare', desc: 'Получите номер редкости Rare.', test: (s) => s.stats.genByRarity.rare >= 1, rarity: 'rare' },
    { id: 'first_epic', icon: 'spark', title: 'Первый Epic', desc: 'Получите номер редкости Epic.', test: (s) => s.stats.genByRarity.epic >= 1, rarity: 'epic' },
    { id: 'first_legendary', icon: 'crown', title: 'Первый Legendary', desc: 'Получите номер редкости Legendary.', test: (s) => s.stats.genByRarity.legendary >= 1, rarity: 'legendary' },
    { id: 'first_mythic', icon: 'infinity', title: 'Первый Mythic', desc: 'Получите мифический номер.', test: (s) => s.stats.genByRarity.mythic >= 1, rarity: 'mythic' },
    { id: 'collection_10', icon: '10', title: 'Коллекция из 10 номеров', desc: 'Держите в коллекции 10 номеров одновременно.', test: (s) => s.collection.length >= 10, progress: (s) => [s.collection.length, 10] },
    { id: 'collection_100', icon: '100', title: 'Коллекция из 100 номеров', desc: 'Держите в коллекции 100 номеров одновременно.', test: (s) => s.collection.length >= 100, progress: (s) => [s.collection.length, 100] },
    { id: 'first_million', icon: 'M', title: 'Первый миллион', desc: 'Достигните капитала 1 000 000 £.', test: (s, ctx) => ctx.netWorth >= MILLION_GBP, progress: (s, ctx) => [Math.max(0, ctx.netWorth), MILLION_GBP], money: true },
    { id: 'first_limited', icon: 'L', title: 'Первая лимитированная карта', desc: 'Купите лимитированную карту.', test: (s) => s.stats.cardsByClass.limited >= 1 },
    { id: 'first_deposit', icon: '%', title: 'Первый вклад', desc: 'Откройте банковский вклад.', test: (s) => s.stats.depositsOpened >= 1 },
    { id: 'loan_repaid', icon: 'check', title: 'Надёжный заёмщик', desc: 'Погасите кредит без просрочки.', test: (s) => s.stats.loansRepaidOnTime >= 1 },
    { id: 'ruble_millionaire', icon: '₽', title: 'Рублёвый миллионер', desc: 'Капитал 1 000 000 ₽ (10 000 £).', test: (s, ctx) => ctx.netWorth >= RUB_MILLION, progress: (s, ctx) => [Math.max(0, ctx.netWorth), RUB_MILLION], money: true },
    { id: 'esim_10', icon: 'e', title: 'Цифровой пионер', desc: 'Активируйте 10 eSIM.', test: (s) => s.stats.genByType.esim >= 10, progress: (s) => [s.stats.genByType.esim, 10] },
    { id: 'pattern_master', icon: 'pattern', title: 'Мастер узоров', desc: 'Сохраните в коллекцию номера всех шести типов узоров.', test: (s) => Object.keys(s.stats.familiesKept).length >= 6, progress: (s) => [Object.keys(s.stats.familiesKept).length, 6] },
    { id: 'collector_deal', icon: 'swap', title: 'Сделка с коллекционером', desc: 'Примите предложение покупателя на выставленный номер.', test: (s) => s.stats.offerSales >= 1 },
  ];

  function reward(id) { return C.achievementRewardsRub[id] || 0; }

  /** Возвращает список ещё не открытых достижений, условия которых выполнены. */
  function check(state, ctx) {
    const out = [];
    for (const def of DEFS) {
      if (state.achievements[def.id]) continue;
      try { if (def.test(state, ctx)) out.push(def); } catch (e) { /* защищаемся от неполных данных */ }
    }
    return out;
  }

  /* ================= Ежедневные задания ================= */
  const QUEST_TEXT = {
    generate: (n) => 'Сгенерируйте ' + n + ' ' + U.plural(n, ['номер', 'номера', 'номеров']),
    sell: (n) => 'Продайте ' + n + ' ' + U.plural(n, ['номер', 'номера', 'номеров']),
    rarePlus: (n) => (n === 1 ? 'Получите номер Rare или выше' : 'Получите ' + n + ' номера Rare или выше'),
    deposit: () => 'Положите деньги на депозит',
    buyPremium: (n) => 'Купите ' + n + ' ' + U.plural(n, ['карту', 'карты', 'карт']) + ' класса «Бизнес» или выше',
    esim: (n) => 'Активируйте ' + n + ' eSIM',
    keep: (n) => 'Добавьте в коллекцию ' + n + ' ' + U.plural(n, ['номер', 'номера', 'номеров']),
    earn: (n) => 'Заработайте на продажах ' + U.gbp(n),
  };
  const QUEST_TYPES = Object.keys(QUEST_TEXT);

  function questText(q) { return (QUEST_TEXT[q.type] || (() => q.type))(q.target); }

  function tierMult(netWorth) {
    const g = netWorth / C.currency.rubPerGbp;
    let mult = 1;
    for (const t of C.quests.tiers) if (g >= t.minGbp) mult = t.mult;
    return mult;
  }

  function generateDailyQuests(state, day, netWorth) {
    const rnd = U.seeded(U.mixSeed(state.meta.seed, day, 0x51554553));
    const mult = tierMult(netWorth);
    const chosen = U.shuffle(C.quests.pool.slice(), rnd).slice(0, C.quests.perDay);
    return chosen.map((q, i) => {
      let target = U.randInt(q.min, q.max, rnd);
      if (q.type === 'earn') target = target * mult * C.currency.rubPerGbp;
      return { id: 'Q' + day + '-' + (i + 1), type: q.type, target, progress: 0, reward: Math.round(q.rewardRub * mult), claimed: false };
    });
  }

  /** Обновляет прогресс заданий указанного типа; возвращает только что выполненные. */
  function track(state, type, amount) {
    const done = [];
    if (!state.quests || !Array.isArray(state.quests.list)) return done;
    for (const q of state.quests.list) {
      if (q.type !== type || q.claimed || q.progress >= q.target) continue;
      q.progress = Math.min(q.target, q.progress + Math.max(0, Math.round(amount)));
      if (q.progress >= q.target) done.push(q);
    }
    return done;
  }

  NT.achievements = { DEFS, reward, check, QUEST_TYPES, questText, tierMult, generateDailyQuests, track };
})(window.NT = window.NT || {});
