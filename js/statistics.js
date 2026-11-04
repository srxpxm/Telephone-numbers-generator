/*
 * Статистика: сбор показателей и производные метрики для страницы «Статистика».
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;

  function zeroMap(list) { const o = {}; list.forEach((x) => { o[x.id] = 0; }); return o; }

  function newStats() {
    const start = C.currency.startBalanceGbp * C.currency.rubPerGbp;
    return {
      cardsBought: 0, cardsByClass: zeroMap(C.classes), cardsByType: { sim: 0, esim: 0 },
      generations: 0, genByRarity: zeroMap(C.rarities), genByClass: zeroMap(C.classes), genByType: { sim: 0, esim: 0 },
      sales: 0, autoSales: 0, offerSales: 0, salesRevenue: 0, tradingProfit: 0, kept: 0,
      spentCards: 0, spentInterest: 0, spentPenalties: 0,
      earnedInterest: 0, earnedRewards: 0,
      moneyIn: 0, moneyOut: 0,
      depositsOpened: 0, loansTaken: 0, loansRepaid: 0, loansRepaidOnTime: 0, defaults: 0,
      questsCompleted: 0,
      bestNumber: null, rarestNumber: null, bestSale: null,
      maxNetWorth: start,
      netWorthHistory: [{ day: 1, value: start }],
      familiesKept: {},
    };
  }

  function rIndex(id) { return NT.gen.rarityIndex(id); }

  function recordGeneration(stats, number, value) {
    stats.generations += 1;
    stats.genByRarity[number.rarity] += 1;
    stats.genByClass[number.classId] += 1;
    stats.genByType[number.formFactor] += 1;
    if (!stats.bestNumber || value > stats.bestNumber.value) {
      stats.bestNumber = { body: number.body, value, rarity: number.rarity, classId: number.classId };
    }
    const r = stats.rarestNumber;
    if (!r || rIndex(number.rarity) > rIndex(r.rarity) || (number.rarity === r.rarity && number.score > r.score)) {
      stats.rarestNumber = { body: number.body, rarity: number.rarity, score: number.score, classId: number.classId };
    }
  }

  function recordSale(stats, number, price, kind) {
    stats.sales += 1;
    if (kind === 'auto') stats.autoSales += 1;
    if (kind === 'offer') stats.offerSales += 1;
    stats.salesRevenue += price;
    const profit = price - number.cost;
    stats.tradingProfit += profit;
    if (!stats.bestSale || profit > stats.bestSale.profit) {
      stats.bestSale = { body: number.body, price, profit, rarity: number.rarity };
    }
  }

  function recordKeep(stats, number) {
    stats.kept += 1;
    if (number.family && number.family !== 'plain') stats.familiesKept[number.family] = (stats.familiesKept[number.family] || 0) + 1;
  }

  function pushNetWorth(stats, day, value) {
    const hist = stats.netWorthHistory;
    if (hist.length && hist[hist.length - 1].day === day) hist[hist.length - 1].value = value;
    else hist.push({ day, value });
    if (hist.length > C.limits.netWorthHistory) hist.splice(0, hist.length - C.limits.netWorthHistory);
    if (value > stats.maxNetWorth) stats.maxNetWorth = value;
  }

  /** Сводка для страницы статистики. */
  function summary(state, netWorth) {
    const s = state.stats;
    const start = C.currency.startBalanceGbp * C.currency.rubPerGbp;
    const totalSpent = s.spentCards + s.spentInterest + s.spentPenalties;
    const totalEarned = s.salesRevenue + s.earnedInterest + s.earnedRewards;
    return {
      totalSpent, totalEarned,
      capitalChange: netWorth - start,
      tradingProfit: s.tradingProfit,
      generations: s.generations, sales: s.sales, autoSales: s.autoSales, offerSales: s.offerSales,
      cardsBought: s.cardsBought,
      bestNumber: s.bestNumber, rarestNumber: s.rarestNumber, bestSale: s.bestSale,
      genByRarity: s.genByRarity, genByClass: s.genByClass, genByType: s.genByType,
      history: s.netWorthHistory, maxNetWorth: s.maxNetWorth,
    };
  }

  NT.stats = { newStats, recordGeneration, recordSale, recordKeep, pushNetWorth, summary };
})(window.NT = window.NT || {});
