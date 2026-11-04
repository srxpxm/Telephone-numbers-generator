/*
 * NUMBER TYCOON — единый конфигурационный объект.
 * Все цены, вероятности, множители и экономические параметры находятся здесь,
 * чтобы игру было удобно балансировать без правки логики.
 *
 * Внутренняя денежная единица — «минорная» единица: 1 игровой рубль = 0.01 £.
 * Поэтому все суммы в коде хранятся целыми числами (никаких ошибок округления).
 */
(function (NT) {
  'use strict';

  const CONFIG = {
    gameId: 'NUMBER_TYCOON',
    version: '1.0.0',
    saveVersion: 1,
    storageKey: 'numberTycoon.save.v1',
    backupKey: 'numberTycoon.backup.v1',

    currency: {
      rubPerGbp: 100,          // 1 £ = 100 игровых рублей (внутриигровой курс, не реальный)
      startBalanceGbp: 500,    // стартовый капитал
    },

    /* Номер: фиктивный префикс +000 и 9 цифр в формате XX XXX XXXX */
    number: {
      prefix: '+000',
      groups: [2, 3, 4],
    },

    /* Форм-факторы. Цена одинаковая, но меняется «характер» генерации:
       веса семейств узоров (на вероятность редкости НЕ влияют). */
    formFactors: {
      sim: {
        id: 'sim', name: 'Обычная SIM', short: 'SIM', priceMult: 1,
        description: 'Пластиковая карта. Чаще выдаёт повторы цифр, пары и красивые окончания.',
        familyBias: { repeat: 1.6, ending: 1.6, pairs: 1.3, sequence: 0.7, rhythm: 0.7, mirror: 0.8 },
      },
      esim: {
        id: 'esim', name: 'eSIM', short: 'eSIM', priceMult: 1,
        description: 'Цифровой профиль. Чаще выдаёт последовательности, чередования и зеркальные номера.',
        familyBias: { sequence: 1.6, rhythm: 1.6, mirror: 1.4, repeat: 0.7, ending: 0.8, pairs: 0.9 },
      },
    },

    /* Классы карт. probabilities — в процентах, сумма каждой строки обязана быть 100.
       targetRtp — целевая средняя отдача (средняя стоимость номера / цена карты).
       Из неё автоматически рассчитывается «престиж серии» — множитель стоимости. */
    classes: [
      {
        id: 'bomzh', name: 'Бомж-карта', short: 'Бомж', priceRub: 50, tier: 1, targetRtp: 0.59,
        description: 'Дешёвый вариант для начинающих коллекционеров. Шанс получить что-то действительно ценное невелик.',
        probabilities: { common: 75, uncommon: 18, rare: 5.5, epic: 1.3, legendary: 0.19, mythic: 0.01 },
      },
      {
        id: 'standard', name: 'Стандартная карта', short: 'Стандарт', priceRub: 100, tier: 2, targetRtp: 0.95,
        description: 'Сбалансированный вариант с более интересными комбинациями.',
        probabilities: { common: 55, uncommon: 25, rare: 13, epic: 5, legendary: 1.8, mythic: 0.2 },
      },
      {
        id: 'business', name: 'Бизнес-карта', short: 'Бизнес', priceRub: 250, tier: 3, targetRtp: 0.97,
        description: 'Карты для серьёзных коллекционеров. Повышенный шанс красивых номеров.',
        probabilities: { common: 35, uncommon: 30, rare: 20, epic: 10, legendary: 4, mythic: 1 },
      },
      {
        id: 'platinum', name: 'Платиновая карта', short: 'Платина', priceRub: 3000, tier: 4, targetRtp: 1.06,
        description: 'Дорогой продукт с хорошими шансами на редкие комбинации.',
        probabilities: { common: 15, uncommon: 25, rare: 25, epic: 20, legendary: 12, mythic: 3 },
      },
      {
        id: 'limited', name: 'Лимитированная карта', short: 'Лимит', priceRub: 1000000, tier: 5, targetRtp: 1.10,
        description: 'Эксклюзивная карта с особой таблицей вероятностей. Самые престижные номера.',
        probabilities: { common: 5, uncommon: 15, rare: 20, epic: 25, legendary: 25, mythic: 10 },
      },
    ],

    /* Редкости: диапазон оценки красоты (0–100) и множитель базовой стоимости. */
    rarities: [
      { id: 'common',    name: 'Common',    ru: 'Обычный',     minScore: 0,  maxScore: 24,  valueMult: 1 },
      { id: 'uncommon',  name: 'Uncommon',  ru: 'Необычный',   minScore: 25, maxScore: 44,  valueMult: 2.5 },
      { id: 'rare',      name: 'Rare',      ru: 'Редкий',      minScore: 45, maxScore: 64,  valueMult: 7 },
      { id: 'epic',      name: 'Epic',      ru: 'Эпический',   minScore: 65, maxScore: 79,  valueMult: 25 },
      { id: 'legendary', name: 'Legendary', ru: 'Легендарный', minScore: 80, maxScore: 91,  valueMult: 100 },
      { id: 'mythic',    name: 'Mythic',    ru: 'Мифический',  minScore: 92, maxScore: 100, valueMult: 600 },
    ],

    /* Оценка красоты: очки за найденные шаблоны (берётся лучший шаблон каждого семейства). */
    beauty: {
      secondaryWeights: [0.12, 0.06, 0.04],  // вклад 2-го, 3-го, 4-го семейства
      secondaryCap: 8,                       // максимум бонуса за вторичные шаблоны
      digitPrestige: { 0: 2, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 3, 8: 3, 9: 2 },
      luckyBonus: 2,                         // много семёрок и восьмёрок
      points: {
        mono9: 100, run8: 95, seq9: 96, count8: 92, blocks3: 84, seq8: 84, run7: 82,
        alt9: 80, period3: 80, mirrorPairs8: 74, count7: 72, seq7: 72, pairs4: 70,
        alt8: 70, run6: 69, blocks2: 68, twoDistinct: 66, alt7: 64, seq6: 58, pal9: 58,
        run5: 55, count6: 52, mirrorPairs6: 52, tail4: 49, alt6: 50, blockRepeat: 50,
        pairs3: 48, pairLadder: 54, period3part: 46, tailPal7: 46, seq5: 40, threeDistinct: 37,
        run4: 35, alt5: 32, count5: 31, step2: 32, round5: 30, tailSeq4: 28, tail3: 27,
        tailPal5: 26, pairs2: 14, run3: 10, count4: 12, seq4: 16, alt4: 15, tailAABB: 14,
        tailABBA: 12, tail00: 7, round4: 14, fourDistinct: 8,
      },
    },

    /* Стоимость номера:
       база = единица_серии × множитель_редкости × (beautyMin + beautySpan × позиция_в_диапазоне) × шум */
    valuation: {
      beautyMin: 0.75,
      beautySpan: 0.5,
      noiseMin: 0.94,
      noiseMax: 1.06,
      // Средний множитель красоты внутри каждой редкости (откалиброван симуляцией генератора).
      // Используется только для расчёта престижа серии из targetRtp.
      expectedFactor: { common: 0.807, uncommon: 0.986, rare: 0.981, epic: 1.057, legendary: 1.038, mythic: 1.117 },
    },

    /* Рынок: небольшие колебания и события. Итоговый множитель всегда ограничен. */
    market: {
      indexStep: 0.025, indexReversion: 0.25, indexMin: 0.85, indexMax: 1.15,
      demandStep: 0.03, demandReversion: 0.2, demandMin: 0.88, demandMax: 1.12,
      totalMin: 0.6, totalMax: 1.6,
      eventChance: 0.32, eventCooldownDays: 2, historyDays: 30,
      events: [
        { id: 'beauty_week', name: 'Неделя красивых номеров', icon: 'spark', days: [7, 7], mult: 1.15, minRarity: 'rare',
          description: 'Номера Rare и выше дороже на 15%.' },
        { id: 'repeat_boom', name: 'Рост спроса на повторяющиеся цифры', icon: 'repeat', days: [3, 5], mult: 1.25, family: 'repeat',
          description: 'Номера с повторами цифр дороже на 25%.' },
        { id: 'common_dump', name: 'Снижение стоимости обычных комбинаций', icon: 'down', days: [3, 4], mult: 0.8, rarities: ['common', 'uncommon'],
          description: 'Common и Uncommon дешевле на 20%.' },
        { id: 'legend_auction', name: 'Аукцион легенд', icon: 'crown', days: [2, 3], mult: 1.3, rarities: ['legendary', 'mythic'],
          description: 'Legendary и Mythic дороже на 30%.' },
        { id: 'sequence_hype', name: 'Хайп последовательностей', icon: 'up', days: [3, 5], mult: 1.2, family: 'sequence',
          description: 'Последовательности дороже на 20%.' },
        { id: 'mirror_fever', name: 'Зеркальная лихорадка', icon: 'mirror', days: [3, 5], mult: 1.2, family: 'mirror',
          description: 'Палиндромы и зеркальные номера дороже на 20%.' },
        { id: 'correction', name: 'Коррекция рынка', icon: 'down', days: [2, 4], mult: 0.9, all: true,
          description: 'Все номера временно дешевле на 10%.' },
        { id: 'collectors_fair', name: 'Ярмарка коллекционеров', icon: 'star', days: [3, 4], mult: 1.05, all: true, offerBoost: 2,
          description: 'Все номера +5%, предложения покупателей приходят вдвое чаще.' },
      ],
    },

    /* Предложения коллекционеров для номеров, выставленных на продажу. */
    offers: { chancePerDay: 0.35, minMult: 0.92, maxMult: 1.25, validDays: 2 },

    /* Игровое время. Идёт, только пока вкладка открыта и видима. */
    time: {
      realSecondsPerDay: 60,     // 1 игровой день = 60 секунд реального времени
      startMinute: 9 * 60,       // старт: День 1, 09:00
      skipCooldownSec: 10,       // «Следующий день» доступен не чаще чем раз в 10 с
      maxCatchUpDays: 3,         // защита от «прыжков» таймера после сна устройства
    },

    bank: {
      deposit: {
        terms: [
          { days: 3, rate: 0.01 },
          { days: 7, rate: 0.03 },
          { days: 14, rate: 0.07 },
          { days: 30, rate: 0.18 },
          { days: 90, rate: 0.65 },
        ],
        minRub: 100,              // минимум 1 £
        maxRub: 2500000,          // максимум 25 000 £ на один вклад
        maxActive: 5,
        earlyInterestShare: 0.25, // при досрочном закрытии сохраняется 25% начисленных процентов
      },
      loan: {
        terms: [
          { days: 7, rate: 0.05 },
          { days: 14, rate: 0.10 },
          { days: 30, rate: 0.24 },
          { days: 90, rate: 0.85 },
        ],
        minRub: 1000,             // минимум 10 £
        baseLimitRub: 20000,      // базовый лимит 200 £
        netWorthShare: 0.5,       // + 50% от чистого капитала
        maxLimitRub: 200000000,   // абсолютный потолок 2 000 000 £
        maxActive: 3,
        minInterestShare: 0.3,    // при досрочном погашении платится минимум 30% процентов
        overduePenaltyDaily: 0.02,// штраф 2% от остатка долга за каждый день просрочки
        penaltyCapShare: 1,       // штрафы не превышают сумму основного долга
        collectionAfterDays: 7,   // через 7 дней просрочки — принудительное взыскание
        seizureValueShare: 0.75,  // изъятые номера продаются за 75% рыночной цены
        inventoryRefundShare: 0.5,// неактивированные карты — за 50% цены
        blockDaysAfterDefault: 14,
      },
      rating: {
        start: 600, min: 300, max: 850, minForLoan: 350,
        tiers: [ // кредитный рейтинг влияет на ставку и лимит
          { min: 780, name: 'Отличный', rateMult: 0.85, limitMult: 1.5 },
          { min: 700, name: 'Хороший', rateMult: 0.92, limitMult: 1.25 },
          { min: 550, name: 'Средний', rateMult: 1, limitMult: 1 },
          { min: 450, name: 'Низкий', rateMult: 1.25, limitMult: 0.6 },
          { min: 300, name: 'Плохой', rateMult: 1.5, limitMult: 0.3 },
        ],
        onTimeRepay: 25, earlyRepay: 30, firstOverdue: -40, overduePerDay: -10, defaultPenalty: -120,
        dailyRecovery: 3, recoveryCap: 600, // без просрочек рейтинг медленно восстанавливается до 600
      },
      grant: { amountRub: 2500, cooldownDays: 3 }, // поддержка при полном банкротстве: 25 £ раз в 3 дня
    },

    quests: {
      perDay: 3,
      tiers: [ // множитель наград по капиталу в начале дня
        { minGbp: 0, mult: 1 }, { minGbp: 1000, mult: 3 }, { minGbp: 10000, mult: 10 },
        { minGbp: 100000, mult: 30 }, { minGbp: 1000000, mult: 100 },
      ],
      pool: [
        { type: 'generate', min: 5, max: 10, rewardRub: 300 },
        { type: 'sell', min: 3, max: 6, rewardRub: 300 },
        { type: 'rarePlus', min: 1, max: 2, rewardRub: 500 },
        { type: 'deposit', min: 1, max: 1, rewardRub: 400 },
        { type: 'buyPremium', min: 2, max: 4, rewardRub: 600 },
        { type: 'esim', min: 2, max: 5, rewardRub: 300 },
        { type: 'keep', min: 2, max: 4, rewardRub: 300 },
        { type: 'earn', min: 10, max: 25, rewardRub: 500 },  // цель в £ × множитель уровня
      ],
    },

    achievementRewardsRub: {
      first_number: 500, first_sale: 500, first_rare: 1000, first_epic: 2500,
      first_legendary: 10000, first_mythic: 50000, collection_10: 2000, collection_100: 25000,
      first_million: 2500000, first_limited: 100000, first_deposit: 1000, loan_repaid: 1500,
      ruble_millionaire: 20000, esim_10: 1000, pattern_master: 5000, collector_deal: 3000,
    },

    ranks: [
      { minGbp: 0, name: 'Новичок' },
      { minGbp: 1000, name: 'Любитель' },
      { minGbp: 5000, name: 'Коллекционер' },
      { minGbp: 25000, name: 'Дилер' },
      { minGbp: 100000, name: 'Инвестор' },
      { minGbp: 500000, name: 'Магнат' },
      { minGbp: 1000000, name: 'Тайкун' },
    ],

    limits: {
      transactions: 300, closedDeposits: 40, closedLoans: 40, netWorthHistory: 60,
      issuedMax: 500000, collectionMax: 20000, nameMax: 24, importMaxBytes: 15 * 1024 * 1024,
    },

    ui: {
      animation: {
        normal: { total: 2600, lockSpan: 0.55 },
        fast: { total: 1000, lockSpan: 0.5 },
        instant: { total: 0, lockSpan: 0 },
      },
      collectionPageSize: 48,
      autosaveDebounceMs: 800,
    },
  };

  NT.CONFIG = CONFIG;
})(window.NT = window.NT || {});
