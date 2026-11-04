/*
 * Экономика: цены карт, оценка стоимости номеров, рыночные колебания и события.
 * Престиж серии (множитель стоимости) рассчитывается автоматически из targetRtp в CONFIG,
 * поэтому при изменении цен или вероятностей средняя отдача остаётся предсказуемой.
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;
  const U = NT.util;
  const V = C.valuation;

  const CLASS = {};
  C.classes.forEach((c) => { CLASS[c.id] = c; });
  const RARITY = {};
  C.rarities.forEach((r, i) => { RARITY[r.id] = Object.assign({ index: i }, r); });
  const EVENT = {};
  C.market.events.forEach((e) => { EVENT[e.id] = e; });
  const FAMILY_IDS = ['repeat', 'sequence', 'rhythm', 'pairs', 'mirror', 'ending', 'plain'];
  const MEAN_BEAUTY = V.beautyMin + V.beautySpan / 2;
  const round4 = (x) => Math.round(x * 10000) / 10000;

  function expectedUnits(cls) {
    let e = 0;
    const f = V.expectedFactor || {};
    for (const r of C.rarities) e += ((cls.probabilities[r.id] || 0) / 100) * r.valueMult * (f[r.id] || MEAN_BEAUTY);
    return e;
  }

  /** Единица стоимости серии (минорные единицы на 1 «очко» редкости). */
  const UNIT = {};
  C.classes.forEach((c) => { UNIT[c.id] = (c.targetRtp * c.priceRub) / expectedUnits(c); });
  const PRESTIGE = {};
  C.classes.forEach((c) => { PRESTIGE[c.id] = UNIT[c.id] / UNIT[C.classes[0].id]; });

  function validateEconomy() {
    const problems = [];
    for (let i = 1; i < C.classes.length; i++) {
      const a = C.classes[i - 1], b = C.classes[i];
      if (UNIT[b.id] < UNIT[a.id]) problems.push('Престиж «' + b.name + '» ниже, чем у «' + a.name + '». Увеличьте targetRtp.');
    }
    // Защита от арбитража: даже при лучшем рейтинге и постоянной перекредитовке
    // стоимость займа на срок вклада должна превышать доход по вкладу.
    const bestMult = Math.min.apply(null, C.bank.rating.tiers.map((t) => t.rateMult));
    for (const dep of C.bank.deposit.terms) {
      for (const loan of C.bank.loan.terms) {
        const cost = Math.pow(1 + loan.rate * bestMult, dep.days / loan.days) - 1;
        if (cost <= dep.rate) problems.push('Арбитраж: кредит ' + loan.days + ' дн. дешевле дохода по вкладу ' + dep.days + ' дн.');
      }
    }
    return { ok: problems.length === 0, problems };
  }

  function cardPrice(classId, formFactor) {
    const cls = CLASS[classId];
    const ff = C.formFactors[formFactor] || C.formFactors.sim;
    return Math.round(cls.priceRub * ff.priceMult);
  }

  function beautyPosition(score, rarityId) {
    const r = RARITY[rarityId];
    return U.clamp((score - r.minScore) / Math.max(1, r.maxScore - r.minScore), 0, 1);
  }

  function rollNoise(rnd) {
    const v = V.noiseMin + (rnd || U.random)() * (V.noiseMax - V.noiseMin);
    return Math.round(v * 10000) / 10000;
  }

  function coreValue(classId, rarityId, score) {
    return UNIT[classId] * RARITY[rarityId].valueMult * (V.beautyMin + V.beautySpan * beautyPosition(score, rarityId));
  }

  /** Базовая (внутренняя) стоимость номера: редкость × красота × престиж серии × индивидуальный шум. */
  function baseValue(classId, rarityId, score, noise) {
    return Math.max(1, Math.round(coreValue(classId, rarityId, score) * noise));
  }

  function baseValueBounds(classId, rarityId, score) {
    const core = coreValue(classId, rarityId, score);
    return { min: Math.max(1, Math.floor(core * V.noiseMin) - 1), max: Math.ceil(core * V.noiseMax) + 1 };
  }

  /* ================= Рынок ================= */

  function newMarket() {
    const demand = {};
    FAMILY_IDS.forEach((f) => { demand[f] = 1; });
    return { index: 1, demand, event: null, cooldownUntil: 2, lastEventId: null, history: [{ day: 1, index: 1 }] };
  }

  function eventApplies(ev, number) {
    if (!ev) return false;
    if (ev.all) return true;
    if (ev.family) return number.family === ev.family;
    if (ev.rarities) return ev.rarities.indexOf(number.rarity) !== -1;
    if (ev.minRarity) return RARITY[number.rarity].index >= RARITY[ev.minRarity].index;
    return false;
  }

  function activeEvent(market) {
    return market && market.event ? EVENT[market.event.id] || null : null;
  }

  function marketMultiplier(market, number) {
    let m = market.index * (market.demand[number.family] || 1);
    const ev = activeEvent(market);
    if (ev && eventApplies(ev, number)) m *= ev.mult;
    return U.clamp(m, C.market.totalMin, C.market.totalMax);
  }

  function currentValue(state, number) {
    return Math.max(1, Math.round(number.baseValue * marketMultiplier(state.market, number)));
  }

  /** Продвижение рынка на новый день (детерминированно от seed сохранения и номера дня). */
  function advanceMarket(market, day, seed) {
    const M = C.market;
    const rnd = U.seeded(U.mixSeed(seed, day, 0x4d41524b));
    const walk = (x, step, rev, lo, hi) => U.clamp(x + (rnd() * 2 - 1) * step - (x - 1) * rev, lo, hi);
    const prevIndex = market.index;
    market.index = round4(walk(market.index, M.indexStep, M.indexReversion, M.indexMin, M.indexMax));
    for (const f of FAMILY_IDS) {
      const cur = typeof market.demand[f] === 'number' ? market.demand[f] : 1;
      market.demand[f] = round4(walk(cur, M.demandStep, M.demandReversion, M.demandMin, M.demandMax));
    }
    let started = null, ended = null;
    if (market.event && day > market.event.endDay) {
      ended = market.event;
      market.lastEventId = ended.id;
      market.event = null;
      market.cooldownUntil = day + M.eventCooldownDays;
    }
    if (!market.event && day >= market.cooldownUntil && rnd() < M.eventChance) {
      const options = M.events.filter((e) => e.id !== market.lastEventId);
      const ev = U.pick(options, rnd);
      const len = U.randInt(ev.days[0], ev.days[1], rnd);
      market.event = { id: ev.id, startDay: day, endDay: day + len - 1 };
      started = market.event;
    }
    market.history.push({ day, index: market.index });
    if (market.history.length > M.historyDays) market.history.splice(0, market.history.length - M.historyDays);
    return { started, ended, prevIndex };
  }

  function offerChance(market) {
    const ev = activeEvent(market);
    return U.clamp(C.offers.chancePerDay * (ev && ev.offerBoost ? ev.offerBoost : 1), 0, 0.95);
  }

  /* ================= Аналитика ================= */

  function classInsights(classId, formFactor) {
    const cls = CLASS[classId];
    const price = cardPrice(classId, formFactor || 'sim');
    let epicPlus = 0;
    for (const r of C.rarities) if (RARITY[r.id].index >= RARITY.epic.index) epicPlus += cls.probabilities[r.id];
    return {
      price,
      expectedValue: Math.round(cls.targetRtp * price),
      rtp: cls.targetRtp,
      epicPlus,
      prestige: PRESTIGE[classId],
      valueRange: C.rarities.map((r) => ({ rarity: r.id, min: Math.round(UNIT[classId] * r.valueMult * V.beautyMin * V.noiseMin), max: Math.round(UNIT[classId] * r.valueMult * (V.beautyMin + V.beautySpan) * V.noiseMax) })),
    };
  }

  NT.economy = {
    CLASS, RARITY, EVENT, FAMILY_IDS, UNIT, PRESTIGE,
    validateEconomy, cardPrice, beautyPosition, rollNoise, baseValue, baseValueBounds,
    newMarket, eventApplies, activeEvent, marketMultiplier, currentValue, advanceMarket, offerChance, classInsights,
  };
})(window.NT = window.NT || {});
