/*
 * Ядро игры: состояние, игровые действия, игровое время и транзакции.
 * Интерфейс только вызывает эти функции — вся проверка условий выполняется здесь,
 * поэтому повторные клики и некорректный ввод не могут сломать экономику.
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;
  const U = NT.util;
  const E = () => NT.economy;
  const B = () => NT.bank;
  const A = () => NT.achievements;

  const listeners = {};
  let state = null;
  let issued = new Set();
  let busy = false;          // идёт анимация генерации
  let accumulator = 0;       // накопленные реальные миллисекунды
  let lastSkipReal = 0;      // время последнего «Следующего дня» (реальное)

  const ok = (data) => Object.assign({ ok: true }, data || {});
  const fail = (error) => ({ ok: false, error });

  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, payload) {
    (listeners[evt] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[NUMBER TYCOON] listener error', e); }
    });
  }
  function notify(text, tone, extra) { emit('notify', Object.assign({ text, tone: tone || 'info' }, extra || {})); }

  const startBalance = () => C.currency.startBalanceGbp * C.currency.rubPerGbp;
  const invKey = (ff, cls) => ff + ':' + cls;

  function defaultSettings() {
    return {
      autosell: { enabled: false, common: true, uncommon: true, rare: false, epic: false, legendary: false, mythic: false },
      animation: 'normal', sound: false, confirmEpic: false, formFactor: 'sim', selectedClass: 'bomzh',
    };
  }

  function newState() {
    const inventory = {};
    Object.keys(C.formFactors).forEach((ff) => C.classes.forEach((c) => { inventory[invKey(ff, c.id)] = 0; }));
    const iso = new Date().toISOString();
    const s = {
      saveVersion: C.saveVersion,
      meta: { createdAt: iso, updatedAt: iso, seed: (Math.floor(U.random() * 4294967295) >>> 0), playTimeSec: 0 },
      profile: { name: 'Игрок' },
      balance: startBalance(),
      time: { minutes: C.time.startMinute },
      inventory,
      pending: null,
      collection: [],
      issued: [],
      counters: { number: 0, deposit: 0, loan: 0, tx: 0, op: 0 },
      market: E().newMarket(),
      bank: { deposits: [], loans: [], rating: C.bank.rating.start, blockedUntilDay: 0, lastGrantDay: -999 },
      achievements: {},
      quests: { day: 0, list: [] },
      stats: NT.stats.newStats(),
      transactions: [],
      settings: defaultSettings(),
    };
    s.quests = { day: 1, list: A().generateDailyQuests(s, 1, s.balance) };
    return s;
  }

  function setState(s) {
    state = s;
    issued = new Set(s.issued);
    busy = false;
    accumulator = 0;
    emit('change', 'all');
  }

  /* ================= Вспомогательные ================= */
  function nextId(kind, prefix, width) {
    state.counters[kind] = (state.counters[kind] || 0) + 1;
    return prefix + String(state.counters[kind]).padStart(width || 6, '0');
  }

  function addTx(type, amount, text) {
    state.transactions.unshift({
      id: nextId('tx', 'T', 6), day: U.dayOf(state.time.minutes), minute: state.time.minutes,
      type, amount, balance: state.balance, text: String(text).slice(0, 160),
    });
    if (state.transactions.length > C.limits.transactions) state.transactions.length = C.limits.transactions;
  }

  function credit(amount, type, text) {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    state.balance += amount;
    state.stats.moneyIn += amount;
    addTx(type, amount, text);
    return true;
  }

  function debit(amount, type, text) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > state.balance) return false;
    state.balance -= amount;
    state.stats.moneyOut += amount;
    addTx(type, -amount, text);
    return true;
  }

  const currentValue = (n) => E().currentValue(state, n);
  const rarityName = (id) => E().RARITY[id].name;

  function collectionValue() { return state.collection.reduce((a, n) => a + currentValue(n), 0); }
  function inventoryValue() {
    let v = 0;
    for (const key of Object.keys(state.inventory)) {
      const [ff, cls] = key.split(':');
      v += state.inventory[key] * E().cardPrice(cls, ff);
    }
    return v;
  }
  function depositsValue() { return B().activeDeposits(state).reduce((a, d) => a + d.amount, 0); }
  function debtValue() { return B().totalDebt(state); }
  function netWorth() {
    return state.balance + collectionValue() + inventoryValue() + depositsValue() +
      (state.pending ? currentValue(state.pending.number) : 0) - debtValue();
  }
  function rankOf(nw) {
    let rank = C.ranks[0];
    for (const r of C.ranks) if (nw >= r.minGbp * C.currency.rubPerGbp) rank = r;
    return rank;
  }

  function trackQuest(type, amount) {
    const done = A().track(state, type, amount);
    done.forEach((q) => notify('Задание выполнено: ' + A().questText(q) + '. Заберите награду!', 'quest'));
  }

  function checkAchievements() {
    for (let pass = 0; pass < 3; pass++) {
      const unlocked = A().check(state, { netWorth: netWorth() });
      if (!unlocked.length) return;
      for (const def of unlocked) {
        state.achievements[def.id] = { day: U.dayOf(state.time.minutes), at: new Date().toISOString() };
        const reward = A().reward(def.id);
        if (reward > 0) { credit(reward, 'achievement', 'Достижение «' + def.title + '»'); state.stats.earnedRewards += reward; }
        notify('Достижение «' + def.title + '»' + (reward ? ' · +' + U.gbp(reward) : ''), 'achievement', { icon: def.icon });
      }
    }
  }

  function afterAction(scope, immediateSave) {
    checkAchievements();
    const nw = netWorth();
    if (nw > state.stats.maxNetWorth) state.stats.maxNetWorth = nw;
    state.meta.updatedAt = new Date().toISOString();
    emit('change', scope || 'all');
    emit('persist', { immediate: !!immediateSave });
  }

  /* ================= Покупка карт ================= */
  function buyCards(classId, ff, qty, silent) {
    if (busy) return fail('Дождитесь окончания генерации');
    const cls = E().CLASS[classId];
    if (!cls || !C.formFactors[ff]) return fail('Неизвестный тип карты');
    const n = Math.floor(Number(qty));
    if (!(n >= 1 && n <= 1000)) return fail('Количество — от 1 до 1000');
    const price = E().cardPrice(classId, ff);
    const total = price * n;
    if (!Number.isSafeInteger(total) || total > state.balance) return fail('Недостаточно средств: нужно ' + U.gbp(total));
    debit(total, 'buy', 'Покупка: ' + cls.name + ' · ' + C.formFactors[ff].short + ' × ' + n);
    state.inventory[invKey(ff, classId)] += n;
    const st = state.stats;
    st.cardsBought += n; st.cardsByClass[classId] += n; st.cardsByType[ff] += n; st.spentCards += total;
    if (cls.tier >= 3) trackQuest('buyPremium', n);
    if (!silent) afterAction('inventory');
    return ok({ qty: n, total });
  }

  /* ================= Генерация ================= */
  function generationCost(classId, ff) {
    return state.inventory[invKey(ff, classId)] > 0 ? 0 : E().cardPrice(classId, ff);
  }

  function canGenerate(classId, ff) {
    if (busy) return fail('Генерация уже идёт');
    if (!E().CLASS[classId] || !C.formFactors[ff]) return fail('Неизвестный тип карты');
    // Реестр выданных номеров ограничен, чтобы сохранение оставалось корректным и компактным.
    if (state.issued.length >= C.limits.issuedMax) return fail('Достигнут предел реестра номеров (' + U.num(C.limits.issuedMax) + '). Начните новую игру в настройках.');
    if (state.inventory[invKey(ff, classId)] > 0) return ok({ needsPurchase: false });
    const price = E().cardPrice(classId, ff);
    if (state.balance < price) return fail('Недостаточно средств для покупки карты (' + U.gbp(price) + ')');
    return ok({ needsPurchase: true, price });
  }

  function keepPendingInternal() {
    const n = state.pending.number;
    state.pending = null;
    if (state.collection.length >= C.limits.collectionMax) {
      const price = currentValue(n);
      credit(price, 'sell', 'Коллекция заполнена — продажа ' + NT.gen.format(n.body));
      NT.stats.recordSale(state.stats, n, price, 'manual');
      return { sold: true, price };
    }
    n.status = 'kept';
    n.offer = null;
    state.collection.push(n);
    NT.stats.recordKeep(state.stats, n);
    trackQuest('keep', 1);
    return { sold: false };
  }

  /** Старт генерации: списывает карту, сразу фиксирует результат (pending) и сохраняет игру. */
  function startGeneration(classId, ff) {
    const can = canGenerate(classId, ff);
    if (!can.ok) return can;
    let autoKept = null;
    if (state.pending) { autoKept = state.pending.number; keepPendingInternal(); }
    const key = invKey(ff, classId);
    if (state.inventory[key] <= 0) {
      const r = buyCards(classId, ff, 1, true);
      if (!r.ok) return r;
    }
    state.inventory[key] -= 1;
    const res = NT.gen.generate(classId, ff, (b) => issued.has(b));
    const noise = E().rollNoise();
    const number = {
      id: nextId('number', 'N', 6), body: res.body, classId, formFactor: ff,
      rarity: res.rarity, score: res.analysis.score, family: res.analysis.family,
      baseValue: E().baseValue(classId, res.rarity, res.analysis.score, noise),
      cost: E().cardPrice(classId, ff), acquiredMinute: state.time.minutes, acquiredAt: new Date().toISOString(),
      status: 'pending', offer: null,
    };
    issued.add(number.body);
    state.issued.push(number.body);
    const opId = nextId('op', 'G', 6);
    state.pending = { opId, number };
    const value = currentValue(number);
    NT.stats.recordGeneration(state.stats, number, value);
    trackQuest('generate', 1);
    if (ff === 'esim') trackQuest('esim', 1);
    if (NT.gen.rarityIndex(number.rarity) >= NT.gen.rarityIndex('rare')) trackQuest('rarePlus', 1);
    busy = true;
    afterAction('generate', true);
    return ok({ opId, number, value, analysis: res.analysis, autoKept });
  }

  /** Вызывается после завершения анимации. Применяет автопродажу. */
  function finishGeneration(opId) {
    busy = false;
    const p = state && state.pending;
    if (!p || p.opId !== opId) { emit('change', 'pending'); return { autoSold: false }; }
    const as = state.settings.autosell;
    if (as.enabled && as[p.number.rarity]) {
      const r = sellPending(opId, 'auto');
      if (r.ok) {
        notify('Автопродажа: ' + NT.gen.format(r.number.body) + ' — +' + U.gbp(r.price), 'sale');
        return { autoSold: true, price: r.price, number: r.number };
      }
    }
    emit('change', 'pending');
    return { autoSold: false };
  }

  function keepPending(opId) {
    if (busy) return fail('Дождитесь окончания генерации');
    if (!state.pending || state.pending.opId !== opId) return fail('Этот номер уже обработан');
    const r = keepPendingInternal();
    afterAction('collection');
    return ok(r);
  }

  function sellPending(opId, kind) {
    const k = kind || 'manual';
    if (busy && k !== 'auto') return fail('Дождитесь окончания генерации');
    const p = state.pending;
    if (!p || p.opId !== opId) return fail('Этот номер уже обработан');
    const n = p.number;
    state.pending = null;
    const price = currentValue(n);
    credit(price, k === 'auto' ? 'autosell' : 'sell', (k === 'auto' ? 'Автопродажа ' : 'Продажа ') + NT.gen.format(n.body) + ' · ' + rarityName(n.rarity));
    NT.stats.recordSale(state.stats, n, price, k);
    trackQuest('sell', 1);
    trackQuest('earn', price);
    afterAction('sale');
    return ok({ price, number: n });
  }

  /* ================= Коллекция ================= */
  function findNumber(id) { return state.collection.find((n) => n.id === id) || null; }

  function listNumber(id) {
    const n = findNumber(id);
    if (!n) return fail('Номер не найден');
    if (n.status === 'listed') return fail('Номер уже выставлен');
    n.status = 'listed';
    n.offer = null;
    afterAction('collection');
    return ok();
  }

  function unlistNumber(id) {
    const n = findNumber(id);
    if (!n) return fail('Номер не найден');
    if (n.status !== 'listed') return fail('Номер не выставлен на продажу');
    n.status = 'kept';
    n.offer = null;
    afterAction('collection');
    return ok();
  }

  function sellNumberInternal(n, kind) {
    const today = U.dayOf(state.time.minutes);
    let price;
    if (kind === 'offer') {
      if (!n.offer || n.offer.expiresDay < today) return fail('Предложение уже истекло');
      price = n.offer.amount;
    } else price = currentValue(n);
    const idx = state.collection.indexOf(n);
    if (idx < 0) return fail('Номер уже продан');
    state.collection.splice(idx, 1);
    credit(price, kind === 'offer' ? 'offer' : 'sell', (kind === 'offer' ? 'Сделка с коллекционером: ' : 'Продажа из коллекции ') + NT.gen.format(n.body) + ' · ' + rarityName(n.rarity));
    NT.stats.recordSale(state.stats, n, price, kind === 'offer' ? 'offer' : 'manual');
    trackQuest('sell', 1);
    trackQuest('earn', price);
    return ok({ price, number: n });
  }

  /** Продажа из коллекции — только для номеров, выставленных на продажу. */
  function sellNumber(id, kind) {
    const n = findNumber(id);
    if (!n) return fail('Номер не найден или уже продан');
    if (n.status !== 'listed') return fail('Сначала выставите номер на продажу');
    const r = sellNumberInternal(n, kind === 'offer' ? 'offer' : 'market');
    if (r.ok) afterAction('sale');
    return r;
  }

  function sellAllListed() {
    const listed = state.collection.filter((n) => n.status === 'listed');
    if (!listed.length) return fail('Нет выставленных номеров');
    let total = 0, count = 0;
    for (const n of listed) { const r = sellNumberInternal(n, 'market'); if (r.ok) { total += r.price; count++; } }
    afterAction('sale');
    return ok({ total, count });
  }

  /* ================= Задания и бонусы ================= */
  function claimQuestInternal(q, auto) {
    q.claimed = true;
    if (q.reward > 0) { credit(q.reward, 'quest', (auto ? 'Автозачисление: ' : 'Задание: ') + A().questText(q)); state.stats.earnedRewards += q.reward; }
    state.stats.questsCompleted += 1;
  }

  function claimQuest(id) {
    const q = state.quests.list.find((x) => x.id === id);
    if (!q) return fail('Задание не найдено');
    if (q.claimed) return fail('Награда уже получена');
    if (q.progress < q.target) return fail('Задание ещё не выполнено');
    claimQuestInternal(q, false);
    afterAction('quests');
    return ok({ reward: q.reward });
  }

  function cheapestCard() { return Math.min.apply(null, C.classes.map((c) => E().cardPrice(c.id, 'sim'))); }

  function claimGrant() {
    const g = B().grantStatus(state, netWorth(), cheapestCard());
    if (!g.available) return fail('Поддержка сейчас недоступна');
    state.bank.lastGrantDay = U.dayOf(state.time.minutes);
    credit(g.amount, 'grant', 'Стартовая поддержка банка');
    afterAction('bank');
    return ok({ amount: g.amount });
  }

  /* ================= Банк (обёртки) ================= */
  function openDeposit(amount, days) {
    const r = B().openDeposit(state, amount, days);
    if (r.ok) { trackQuest('deposit', 1); afterAction('bank'); }
    return r;
  }
  function closeDeposit(id) { const r = B().closeDeposit(state, id, false); if (r.ok) afterAction('bank'); return r; }
  function takeLoan(amount, days) { const r = B().takeLoan(state, amount, days, netWorth()); if (r.ok) afterAction('bank'); return r; }
  function repayLoan(id, amount) { const r = B().repayLoan(state, id, amount); if (r.ok) afterAction('bank'); return r; }

  /* ================= Игровое время ================= */
  function processNewDay(day) {
    const m = E().advanceMarket(state.market, day, state.meta.seed);
    if (m.started) { const ev = E().EVENT[m.started.id]; notify('Событие рынка: «' + ev.name + '». ' + ev.description, 'market'); }
    if (m.ended) notify('Событие «' + E().EVENT[m.ended.id].name + '» завершилось', 'info');
    processOffers(day);
    B().processDay(state).forEach((ev) => notify(ev.text, ev.tone));
    if (state.quests.day !== day) {
      state.quests.list.forEach((q) => { if (!q.claimed && q.progress >= q.target) claimQuestInternal(q, true); });
      state.quests = { day, list: A().generateDailyQuests(state, day, netWorth()) };
    }
    NT.stats.pushNetWorth(state.stats, day, netWorth());
  }

  function processOffers(day) {
    const rnd = U.seeded(U.mixSeed(state.meta.seed, day, 0x4f464652));
    const chance = E().offerChance(state.market);
    let count = 0;
    for (const n of state.collection) {
      if (n.status !== 'listed') continue;
      if (n.offer && n.offer.expiresDay < day) n.offer = null;
      if (!n.offer && rnd() < chance) {
        const mult = C.offers.minMult + rnd() * (C.offers.maxMult - C.offers.minMult);
        n.offer = { amount: Math.max(1, Math.round(currentValue(n) * mult)), expiresDay: day + C.offers.validDays - 1, day };
        count++;
      }
    }
    if (count) notify('Новые предложения коллекционеров: ' + count, 'offer');
  }

  function advanceMinutes(mins) {
    if (!state || mins <= 0) return;
    const before = U.dayOf(state.time.minutes);
    state.time.minutes += Math.floor(mins);
    const after = U.dayOf(state.time.minutes);
    for (let d = before + 1; d <= after; d++) processNewDay(d);
    B().newlyMatured(state).forEach((d) => notify('Вклад ' + d.id + ' готов: ' + U.gbp(d.amount + d.interest) + ' можно забрать в банке', 'bank'));
    emit('time', { dayChanged: after !== before });
    if (after !== before) { emit('day', after); afterAction('day'); }
  }

  /** Реальное время → игровое. Вызывается таймером, только пока вкладка видима. */
  function tick(realMs) {
    if (!state || !(realMs > 0)) return;
    const ms = Math.min(realMs, 5000);
    state.meta.playTimeSec = Math.round((state.meta.playTimeSec + ms / 1000) * 1000) / 1000;
    const msPerMinute = (C.time.realSecondsPerDay * 1000) / U.MIN_PER_DAY;
    accumulator += ms;
    const add = Math.floor(accumulator / msPerMinute);
    if (add > 0) {
      accumulator -= add * msPerMinute;
      advanceMinutes(Math.min(add, C.time.maxCatchUpDays * U.MIN_PER_DAY));
    }
  }

  function skipCooldownLeft() {
    return Math.max(0, C.time.skipCooldownSec * 1000 - (Date.now() - lastSkipReal));
  }

  function skipDay() {
    const left = skipCooldownLeft();
    if (left > 0) return fail('Следующий день будет доступен через ' + Math.ceil(left / 1000) + ' с');
    lastSkipReal = Date.now();
    const cur = state.time.minutes;
    const next = U.dayOf(cur) * U.MIN_PER_DAY;
    accumulator = 0;
    advanceMinutes(next - cur);
    return ok({ day: U.dayOf(state.time.minutes) });
  }

  /* ================= Настройки и профиль ================= */
  function setAutosell(key, value) {
    if (key !== 'enabled' && !E().RARITY[key]) return fail('Неизвестная настройка');
    state.settings.autosell[key] = !!value;
    afterAction('settings');
    return ok();
  }
  function setSetting(key, value) {
    const s = state.settings;
    if (key === 'animation' && ['normal', 'fast', 'instant'].indexOf(value) !== -1) s.animation = value;
    else if (key === 'sound' || key === 'confirmEpic') s[key] = !!value;
    else if (key === 'formFactor' && C.formFactors[value]) s.formFactor = value;
    else if (key === 'selectedClass' && E().CLASS[value]) s.selectedClass = value;
    else return fail('Некорректная настройка');
    afterAction('settings');
    return ok();
  }
  function sanitizeName(str) {
    return String(str || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, C.limits.nameMax);
  }
  function setName(str) {
    const name = sanitizeName(str);
    if (!name) return fail('Имя не может быть пустым');
    state.profile.name = name;
    afterAction('profile');
    return ok({ name });
  }

  function resetGame() {
    setState(newState());
    afterAction('all', true);
  }

  NT.game = {
    on, emit, notify, newState, setState, get state() { return state; }, get busy() { return busy; },
    nextId, credit, debit, netWorth, collectionValue, inventoryValue, depositsValue, debtValue, rankOf, currentValue,
    buyCards, canGenerate, generationCost, startGeneration, finishGeneration, keepPending, sellPending,
    findNumber, listNumber, unlistNumber, sellNumber, sellAllListed,
    claimQuest, claimGrant, cheapestCard, openDeposit, closeDeposit, takeLoan, repayLoan,
    tick, advanceMinutes, skipDay, skipCooldownLeft, setAutosell, setSetting, setName, sanitizeName, resetGame, invKey,
  };
})(window.NT = window.NT || {});
