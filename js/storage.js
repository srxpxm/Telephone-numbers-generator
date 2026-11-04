/*
 * Сохранения: автосохранение в localStorage, экспорт и импорт JSON.
 * Импорт проходит многоступенчатую проверку: JSON → версия схемы → контрольная сумма →
 * обязательные поля → типы и диапазоны → соответствие редкости цифрам → сходимость баланса.
 * Данные из файла никогда не вставляются как HTML.
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;
  const U = NT.util;

  let status = { available: true, ok: true, lastSaved: null, error: null };
  let timer = null;
  const statusListeners = [];

  function setStatus(patch) {
    status = Object.assign({}, status, patch);
    statusListeners.forEach((fn) => { try { fn(status); } catch (e) { console.error(e); } });
  }
  function onStatus(fn) { statusListeners.push(fn); }
  function getStatus() { return status; }

  function probe() {
    try {
      const k = '__nt_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /** Сериализация с контрольной суммой (FNV-1a от компактного JSON состояния). */
  function serialize(state, pretty) {
    const json = JSON.stringify(state);
    const wrapper = {
      game: C.gameId, saveVersion: C.saveVersion, appVersion: C.version,
      savedAt: new Date().toISOString(), checksum: U.hashString(json),
    };
    if (pretty) { wrapper.state = state; return JSON.stringify(wrapper, null, 2); }
    return JSON.stringify(wrapper).slice(0, -1) + ',"state":' + json + '}';
  }

  function save(state) {
    if (!state) return false;
    if (!status.available) return false;
    try {
      window.localStorage.setItem(C.storageKey, serialize(state, false));
      setStatus({ ok: true, lastSaved: Date.now(), error: null });
      return true;
    } catch (e) {
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      setStatus({ ok: false, error: quota ? 'Хранилище браузера переполнено — экспортируйте сохранение в файл.' : 'Не удалось записать сохранение: ' + (e && e.message ? e.message : 'localStorage недоступен') });
      return false;
    }
  }

  function scheduleSave(immediate) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (immediate) { save(NT.game.state); return; }
    timer = setTimeout(() => { timer = null; save(NT.game.state); }, C.ui.autosaveDebounceMs);
  }

  function backupCurrent() {
    if (!status.available) return;
    try {
      const raw = window.localStorage.getItem(C.storageKey);
      if (raw) window.localStorage.setItem(C.backupKey, raw);
    } catch (e) { /* резервная копия не критична */ }
  }

  /** Загрузка при старте: основное сохранение → резервная копия → новая игра. */
  function load() {
    if (!probe()) {
      setStatus({ available: false, ok: false, error: 'localStorage недоступен: прогресс не будет сохраняться между сессиями. Используйте экспорт.' });
      return { state: null, source: 'unavailable' };
    }
    let raw = null;
    try { raw = window.localStorage.getItem(C.storageKey); } catch (e) { raw = null; }
    if (!raw) return { state: null, source: 'new' };
    const res = parseAndValidate(raw);
    if (res.ok) return { state: res.state, source: 'save' };
    try { window.localStorage.setItem(C.storageKey + '.corrupt', raw); } catch (e) { /* ignore */ }
    let backup = null;
    try { backup = window.localStorage.getItem(C.backupKey); } catch (e) { backup = null; }
    if (backup) {
      const b = parseAndValidate(backup);
      if (b.ok) return { state: b.state, source: 'backup', warning: 'Основное сохранение повреждено — восстановлена резервная копия.' };
    }
    return { state: null, source: 'corrupt', warning: 'Сохранение повреждено и не может быть загружено (' + res.errors[0] + '). Начата новая игра, копия сохранена.' };
  }

  /* ================= Проверка сохранений ================= */
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const int = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
  const num = (x, min, max) => typeof x === 'number' && isFinite(x) && x >= min && x <= max;
  const str = (x, max, min) => typeof x === 'string' && x.length <= max && x.length >= (min || 0);
  const bool = (x) => typeof x === 'boolean';
  const MAXM = 1e15;

  function migrate(state, fromVersion) {
    // Схема v1 — первая версия. Здесь будут последовательные миграции v1 → v2 → …
    if (fromVersion === 1) return state;
    return state;
  }

  function parseAndValidate(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: ['Файл пуст'] };
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, errors: ['Файл не является корректным JSON'] }; }
    return validateWrapper(obj);
  }

  function validateWrapper(obj) {
    if (!isObj(obj)) return { ok: false, errors: ['Неверный формат сохранения'] };
    if (obj.game !== C.gameId) return { ok: false, errors: ['Это не сохранение NUMBER TYCOON'] };
    if (!Number.isSafeInteger(obj.saveVersion)) return { ok: false, errors: ['Отсутствует версия схемы (saveVersion)'] };
    if (obj.saveVersion > C.saveVersion) return { ok: false, errors: ['Сохранение создано более новой версией игры (схема v' + obj.saveVersion + ')'] };
    if (obj.saveVersion < 1) return { ok: false, errors: ['Неподдерживаемая версия схемы: v' + obj.saveVersion] };
    if (!isObj(obj.state)) return { ok: false, errors: ['В файле нет состояния игры'] };
    if (typeof obj.checksum !== 'string' || U.hashString(JSON.stringify(obj.state)) !== obj.checksum) {
      return { ok: false, errors: ['Контрольная сумма не совпадает: файл повреждён или изменён вручную'] };
    }
    const migrated = migrate(obj.state, obj.saveVersion);
    const v = validateState(migrated);
    if (!v.ok) return v;
    return { ok: true, state: v.state, meta: { savedAt: str(obj.savedAt, 40) ? obj.savedAt : null, appVersion: str(obj.appVersion, 20) ? obj.appVersion : null } };
  }

  function validateState(s) {
    const E = NT.economy, G = NT.gen;
    const errs = [];
    const err = (path, msg) => { if (errs.length < 25) errs.push(path + ': ' + msg); };
    if (!isObj(s)) return { ok: false, errors: ['state: должно быть объектом'] };

    const required = ['saveVersion', 'meta', 'profile', 'balance', 'time', 'inventory', 'pending', 'collection', 'issued',
      'counters', 'market', 'bank', 'achievements', 'quests', 'stats', 'transactions', 'settings'];
    for (const k of required) if (!(k in s)) err(k, 'обязательное поле отсутствует');
    if (errs.length) return { ok: false, errors: errs };

    if (s.saveVersion !== C.saveVersion) err('saveVersion', 'неверная версия схемы');

    // meta / profile
    if (!isObj(s.meta) || !str(s.meta.createdAt, 40) || !str(s.meta.updatedAt, 40) || !int(s.meta.seed, 0, 4294967295) || !num(s.meta.playTimeSec, 0, 1e10)) err('meta', 'некорректные метаданные');
    if (!isObj(s.profile) || !str(s.profile.name, C.limits.nameMax, 1) || NT.game.sanitizeName(s.profile.name) !== s.profile.name) err('profile.name', 'недопустимое имя игрока');

    // деньги и время
    if (!int(s.balance, 0, MAXM)) err('balance', 'баланс должен быть целым неотрицательным числом');
    if (!isObj(s.time) || !int(s.time.minutes, 0, 1e9)) err('time.minutes', 'некорректное игровое время');
    const nowMin = isObj(s.time) && int(s.time.minutes, 0, 1e9) ? s.time.minutes : 0;
    const today = U.dayOf(nowMin);

    // инвентарь
    if (!isObj(s.inventory)) err('inventory', 'должен быть объектом');
    else {
      const keys = [];
      Object.keys(C.formFactors).forEach((ff) => C.classes.forEach((c) => keys.push(ff + ':' + c.id)));
      for (const k of keys) if (!int(s.inventory[k], 0, 1e6)) err('inventory.' + k, 'некорректное количество карт');
      for (const k of Object.keys(s.inventory)) if (keys.indexOf(k) === -1) err('inventory.' + k, 'неизвестный тип карты');
    }

    // счётчики
    if (!isObj(s.counters)) err('counters', 'должен быть объектом');
    else for (const k of ['number', 'deposit', 'loan', 'tx', 'op']) if (!int(s.counters[k], 0, 1e12)) err('counters.' + k, 'некорректное значение');

    // номера
    const ids = new Set(), bodies = new Set();
    let maxNumberSeq = 0;
    const checkNumber = (n, path, statuses) => {
      if (!isObj(n)) { err(path, 'номер должен быть объектом'); return; }
      if (!str(n.id, 16) || !/^N\d{6,}$/.test(n.id)) err(path + '.id', 'некорректный ID');
      else if (ids.has(n.id)) err(path + '.id', 'дубликат ID ' + n.id);
      else { ids.add(n.id); maxNumberSeq = Math.max(maxNumberSeq, parseInt(n.id.slice(1), 10)); }
      if (!str(n.body, 9) || !/^\d{9}$/.test(n.body)) { err(path + '.body', 'номер должен состоять из 9 цифр'); return; }
      if (bodies.has(n.body)) err(path + '.body', 'дубликат номера ' + G.format(n.body));
      bodies.add(n.body);
      const clsOk = !!E.CLASS[n.classId], ffOk = !!C.formFactors[n.formFactor], rOk = !!E.RARITY[n.rarity];
      if (!clsOk) err(path + '.classId', 'неизвестный класс карты');
      if (!ffOk) err(path + '.formFactor', 'неизвестный форм-фактор');
      if (!rOk) err(path + '.rarity', 'неизвестная редкость');
      const a = G.analyze(n.body);
      if (n.score !== a.score || n.rarity !== a.rarity) err(path, 'редкость или оценка не соответствуют цифрам ' + G.format(n.body));
      if (n.family !== a.family) err(path + '.family', 'тип узора не соответствует цифрам');
      if (clsOk && rOk && n.rarity === a.rarity) {
        const b = E.baseValueBounds(n.classId, n.rarity, a.score);
        if (!int(n.baseValue, b.min, b.max)) err(path + '.baseValue', 'стоимость вне допустимого диапазона');
      }
      if (!int(n.cost, 0, MAXM) || (clsOk && ffOk && n.cost !== E.cardPrice(n.classId, n.formFactor))) err(path + '.cost', 'стоимость покупки не совпадает с ценой карты');
      if (!int(n.acquiredMinute, 0, nowMin)) err(path + '.acquiredMinute', 'некорректная дата получения');
      if (!str(n.acquiredAt, 40)) err(path + '.acquiredAt', 'некорректная дата');
      if (statuses.indexOf(n.status) === -1) err(path + '.status', 'недопустимый статус');
      if (n.offer !== null) {
        if (!isObj(n.offer) || !int(n.offer.amount, 1, MAXM) || !int(n.offer.expiresDay, 1, 1e7) || !int(n.offer.day, 1, 1e7)) err(path + '.offer', 'некорректное предложение');
        else if (n.status !== 'listed') err(path + '.offer', 'предложение возможно только для выставленного номера');
        else if (n.offer.amount > n.baseValue * 3) err(path + '.offer', 'подозрительно высокая сумма предложения');
      }
    };
    if (!Array.isArray(s.collection) || s.collection.length > C.limits.collectionMax) err('collection', 'должна быть массивом допустимого размера');
    else s.collection.forEach((n, i) => checkNumber(n, 'collection[' + i + ']', ['kept', 'listed']));
    if (s.pending !== null) {
      if (!isObj(s.pending) || !str(s.pending.opId, 16) || !/^G\d{6,}$/.test(s.pending.opId)) err('pending', 'некорректная незавершённая генерация');
      else checkNumber(s.pending.number, 'pending.number', ['pending']);
    }
    if (isObj(s.counters) && int(s.counters.number, 0, 1e12) && s.counters.number < maxNumberSeq) err('counters.number', 'счётчик меньше существующих ID');

    // реестр выданных номеров
    if (!Array.isArray(s.issued) || s.issued.length > C.limits.issuedMax) err('issued', 'должен быть массивом допустимого размера');
    else {
      for (let i = 0; i < s.issued.length; i++) {
        if (typeof s.issued[i] !== 'string' || !/^\d{9}$/.test(s.issued[i])) { err('issued[' + i + ']', 'некорректный номер'); break; }
      }
    }

    // рынок
    const m = s.market;
    const MK = C.market;
    if (!isObj(m) || !num(m.index, MK.indexMin - 1e-9, MK.indexMax + 1e-9) || !isObj(m.demand)) err('market', 'некорректное состояние рынка');
    else {
      for (const f of E.FAMILY_IDS) if (!num(m.demand[f], MK.demandMin - 1e-9, MK.demandMax + 1e-9)) err('market.demand.' + f, 'вне допустимого диапазона');
      if (m.event !== null && (!isObj(m.event) || !E.EVENT[m.event.id] || !int(m.event.startDay, 1, 1e7) || !int(m.event.endDay, m.event.startDay || 1, 1e7))) err('market.event', 'некорректное событие');
      if (!int(m.cooldownUntil, 0, 1e7)) err('market.cooldownUntil', 'некорректное значение');
      if (m.lastEventId !== null && !E.EVENT[m.lastEventId]) err('market.lastEventId', 'неизвестное событие');
      if (!Array.isArray(m.history) || m.history.length > MK.historyDays || m.history.some((h) => !isObj(h) || !int(h.day, 1, 1e7) || !num(h.index, 0, 10))) err('market.history', 'некорректная история');
    }

    // банк
    const bank = s.bank;
    if (!isObj(bank) || !Array.isArray(bank.deposits) || !Array.isArray(bank.loans)) err('bank', 'некорректное состояние банка');
    else {
      const RT = C.bank.rating;
      if (!int(bank.rating, RT.min, RT.max)) err('bank.rating', 'рейтинг вне диапазона');
      if (!int(bank.blockedUntilDay, 0, 1e7)) err('bank.blockedUntilDay', 'некорректное значение');
      if (!int(bank.lastGrantDay, -999, 1e7)) err('bank.lastGrantDay', 'некорректное значение');
      const depIds = new Set();
      let active = 0;
      bank.deposits.forEach((d, i) => {
        const p = 'bank.deposits[' + i + ']';
        const term = isObj(d) ? NT.bank.depositTerm(d.termDays) : null;
        if (!isObj(d) || !str(d.id, 12) || !/^D\d{4,}$/.test(d.id) || depIds.has(d.id)) { err(p, 'некорректный вклад'); return; }
        depIds.add(d.id);
        if (!term) { err(p + '.termDays', 'недопустимый срок'); return; }
        if (!int(d.amount, C.bank.deposit.minRub, C.bank.deposit.maxRub)) err(p + '.amount', 'сумма вне лимитов');
        if (d.rate !== term.rate || d.interest !== Math.round(d.amount * term.rate)) err(p, 'ставка или проценты не соответствуют условиям банка');
        if (!int(d.openedMinute, 0, nowMin) || d.maturityMinute !== d.openedMinute + d.termDays * U.MIN_PER_DAY) err(p, 'некорректные даты');
        if (['active', 'closed'].indexOf(d.status) === -1) err(p + '.status', 'недопустимый статус');
        if (d.status === 'active') { active++; if (d.payout !== null || d.closedMinute !== null) err(p, 'активный вклад не может иметь выплату'); }
        if (d.status === 'closed' && (!int(d.payout, 0, d.amount + d.interest) || !int(d.closedMinute, d.openedMinute, nowMin))) err(p, 'некорректная выплата');
        if (!bool(d.early) || !bool(d.notified)) err(p, 'некорректные флаги');
      });
      if (active > C.bank.deposit.maxActive) err('bank.deposits', 'слишком много активных вкладов');
      const loanIds = new Set();
      let activeL = 0;
      const minMult = Math.min.apply(null, C.bank.rating.tiers.map((t) => t.rateMult));
      const maxMult = Math.max.apply(null, C.bank.rating.tiers.map((t) => t.rateMult));
      bank.loans.forEach((l, i) => {
        const p = 'bank.loans[' + i + ']';
        const term = isObj(l) ? NT.bank.loanTerm(l.termDays) : null;
        if (!isObj(l) || !str(l.id, 12) || !/^L\d{4,}$/.test(l.id) || loanIds.has(l.id)) { err(p, 'некорректный кредит'); return; }
        loanIds.add(l.id);
        if (!term) { err(p + '.termDays', 'недопустимый срок'); return; }
        if (!int(l.principal, C.bank.loan.minRub, C.bank.loan.maxLimitRub)) err(p + '.principal', 'сумма вне лимитов');
        if (!num(l.rate, term.rate * minMult - 1e-6, term.rate * maxMult + 1e-6)) err(p + '.rate', 'ставка не соответствует условиям банка');
        if (!int(l.interest, 0, Math.round(l.principal * term.rate * maxMult) + 1)) err(p + '.interest', 'некорректные проценты');
        if (!int(l.takenMinute, 0, nowMin) || l.dueMinute !== l.takenMinute + l.termDays * U.MIN_PER_DAY) err(p, 'некорректные даты');
        if (!int(l.paid, 0, MAXM) || !int(l.penalty, 0, Math.floor(l.principal * C.bank.loan.penaltyCapShare)) || !int(l.overdueDays, 0, 1e6)) err(p, 'некорректные суммы');
        if (['active', 'repaid', 'defaulted'].indexOf(l.status) === -1) err(p + '.status', 'недопустимый статус');
        if (l.status === 'active') activeL++;
        if (!bool(l.wasOverdue)) err(p + '.wasOverdue', 'некорректный флаг');
        if (l.closedBy !== null && ['player', 'collection', 'default'].indexOf(l.closedBy) === -1) err(p + '.closedBy', 'некорректное значение');
      });
      if (activeL > C.bank.loan.maxActive) err('bank.loans', 'слишком много активных кредитов');
    }

    // достижения
    if (!isObj(s.achievements)) err('achievements', 'должен быть объектом');
    else {
      const defIds = new Set(NT.achievements.DEFS.map((d) => d.id));
      for (const k of Object.keys(s.achievements)) {
        const v = s.achievements[k];
        if (!defIds.has(k) || !isObj(v) || !int(v.day, 1, 1e7) || !str(v.at, 40)) err('achievements.' + k, 'некорректное достижение');
      }
    }

    // задания
    if (!isObj(s.quests) || !int(s.quests.day, 0, 1e7) || !Array.isArray(s.quests.list) || s.quests.list.length > 10) err('quests', 'некорректные задания');
    else s.quests.list.forEach((q, i) => {
      if (!isObj(q) || !str(q.id, 24) || NT.achievements.QUEST_TYPES.indexOf(q.type) === -1 || !int(q.target, 1, 1e15) ||
          !int(q.progress, 0, q.target) || !int(q.reward, 0, 1e12) || !bool(q.claimed)) err('quests.list[' + i + ']', 'некорректное задание');
    });

    // статистика
    const st = s.stats;
    if (!isObj(st)) err('stats', 'должен быть объектом');
    else {
      const ints = ['cardsBought', 'generations', 'sales', 'autoSales', 'offerSales', 'salesRevenue', 'kept', 'spentCards', 'spentInterest',
        'spentPenalties', 'earnedInterest', 'earnedRewards', 'moneyIn', 'moneyOut', 'depositsOpened', 'loansTaken', 'loansRepaid',
        'loansRepaidOnTime', 'defaults', 'questsCompleted'];
      for (const k of ints) if (!int(st[k], 0, MAXM)) err('stats.' + k, 'некорректное значение');
      if (!int(st.tradingProfit, -MAXM, MAXM)) err('stats.tradingProfit', 'некорректное значение');
      if (!int(st.maxNetWorth, -MAXM, MAXM)) err('stats.maxNetWorth', 'некорректное значение');
      const mapCheck = (obj, keys, name) => {
        if (!isObj(obj)) { err('stats.' + name, 'должен быть объектом'); return; }
        for (const k of keys) if (!int(obj[k], 0, MAXM)) err('stats.' + name + '.' + k, 'некорректное значение');
      };
      mapCheck(st.cardsByClass, C.classes.map((c) => c.id), 'cardsByClass');
      mapCheck(st.genByClass, C.classes.map((c) => c.id), 'genByClass');
      mapCheck(st.genByRarity, C.rarities.map((r) => r.id), 'genByRarity');
      mapCheck(st.cardsByType, Object.keys(C.formFactors), 'cardsByType');
      mapCheck(st.genByType, Object.keys(C.formFactors), 'genByType');
      if (!isObj(st.familiesKept) || Object.keys(st.familiesKept).some((k) => E.FAMILY_IDS.indexOf(k) === -1 || !int(st.familiesKept[k], 0, MAXM))) err('stats.familiesKept', 'некорректное значение');
      const rec = (r, name, fields) => {
        if (r === null) return;
        if (!isObj(r) || !str(r.body, 9) || !/^\d{9}$/.test(r.body) || !E.RARITY[r.rarity] || fields.some((f) => !int(r[f], -MAXM, MAXM))) err('stats.' + name, 'некорректная запись');
      };
      rec(st.bestNumber, 'bestNumber', ['value']);
      rec(st.rarestNumber, 'rarestNumber', ['score']);
      rec(st.bestSale, 'bestSale', ['price', 'profit']);
      if (!Array.isArray(st.netWorthHistory) || st.netWorthHistory.length > C.limits.netWorthHistory ||
          st.netWorthHistory.some((h) => !isObj(h) || !int(h.day, 1, 1e7) || !int(h.value, -MAXM, MAXM))) err('stats.netWorthHistory', 'некорректная история');
      const totalGen = C.rarities.reduce((a, r) => a + (int(st.genByRarity && st.genByRarity[r.id], 0, MAXM) ? st.genByRarity[r.id] : 0), 0);
      if (int(st.generations, 0, MAXM) && totalGen !== st.generations) err('stats.genByRarity', 'не сходится с числом генераций');
      // Карты не появляются из ниоткуда: остаток ≤ куплено − активировано, и куплены они за деньги.
      if (isObj(s.inventory) && isObj(st.cardsByClass) && isObj(st.genByClass)) {
        let boughtTotal = 0, minSpent = 0;
        for (const c of C.classes) {
          const bought = st.cardsByClass[c.id], used = st.genByClass[c.id];
          if (!int(bought, 0, MAXM) || !int(used, 0, MAXM)) continue;
          let have = 0;
          for (const ff of Object.keys(C.formFactors)) { const v = s.inventory[ff + ':' + c.id]; if (int(v, 0, 1e6)) have += v; }
          if (have > bought - used) err('inventory', 'карт «' + c.short + '» больше, чем было куплено');
          boughtTotal += bought;
          minSpent += bought * Math.min.apply(null, Object.keys(C.formFactors).map((ff) => E.cardPrice(c.id, ff)));
        }
        if (int(st.cardsBought, 0, MAXM) && boughtTotal !== st.cardsBought) err('stats.cardsByClass', 'не сходится с числом купленных карт');
        if (int(st.spentCards, 0, MAXM) && st.spentCards < minSpent) err('stats.spentCards', 'не соответствует купленным картам');
      }
      // Номера не появляются из ниоткуда: в коллекции не больше номеров, чем было сгенерировано.
      if (Array.isArray(s.collection) && isObj(st.genByRarity) && isObj(st.genByClass)) {
        const all = s.collection.concat(isObj(s.pending) && isObj(s.pending.number) ? [s.pending.number] : []);
        const byR = {}, byC = {};
        all.forEach((n) => { if (isObj(n)) { byR[n.rarity] = (byR[n.rarity] || 0) + 1; byC[n.classId] = (byC[n.classId] || 0) + 1; } });
        for (const r of C.rarities) if (int(st.genByRarity[r.id], 0, MAXM) && (byR[r.id] || 0) > st.genByRarity[r.id]) err('collection', 'номеров ' + r.name + ' больше, чем было получено');
        for (const c of C.classes) if (int(st.genByClass[c.id], 0, MAXM) && (byC[c.id] || 0) > st.genByClass[c.id]) err('collection', 'номеров «' + c.short + '» больше, чем было получено');
        if (int(st.generations, 0, MAXM) && int(st.sales, 0, MAXM) && all.length > st.generations - st.sales) err('collection', 'номеров больше, чем было сгенерировано');
      }
      // Деньги не появляются из ниоткуда: баланс = старт + все поступления − все списания.
      const start = C.currency.startBalanceGbp * C.currency.rubPerGbp;
      if (int(st.moneyIn, 0, MAXM) && int(st.moneyOut, 0, MAXM) && int(s.balance, 0, MAXM) && s.balance !== start + st.moneyIn - st.moneyOut) {
        err('balance', 'баланс не сходится с историей операций (подозрительное сохранение)');
      }
    }

    // транзакции
    if (!Array.isArray(s.transactions) || s.transactions.length > C.limits.transactions) err('transactions', 'некорректная история операций');
    else s.transactions.forEach((t, i) => {
      if (!isObj(t) || !str(t.id, 16) || !int(t.day, 1, 1e7) || !int(t.minute, 0, 1e9) || !str(t.type, 24) || !/^[a-z_]+$/.test(t.type) ||
          !int(t.amount, -MAXM, MAXM) || !int(t.balance, 0, MAXM) || !str(t.text, 160)) err('transactions[' + i + ']', 'некорректная операция');
    });

    // настройки
    const set = s.settings;
    if (!isObj(set) || !isObj(set.autosell)) err('settings', 'некорректные настройки');
    else {
      for (const k of ['enabled'].concat(C.rarities.map((r) => r.id))) if (!bool(set.autosell[k])) err('settings.autosell.' + k, 'должно быть true/false');
      if (['normal', 'fast', 'instant'].indexOf(set.animation) === -1) err('settings.animation', 'недопустимое значение');
      if (!bool(set.sound) || !bool(set.confirmEpic)) err('settings', 'некорректные флаги');
      if (!C.formFactors[set.formFactor]) err('settings.formFactor', 'недопустимое значение');
      if (!E.CLASS[set.selectedClass]) err('settings.selectedClass', 'недопустимое значение');
    }

    if (errs.length) return { ok: false, errors: errs };

    // Безопасное восстановление реестра выданных номеров (без дубликатов).
    const reg = new Set(s.issued);
    bodies.forEach((b) => reg.add(b));
    s.issued = Array.from(reg);
    if (s.counters.number < maxNumberSeq) s.counters.number = maxNumberSeq;
    void today;
    return { ok: true, state: s };
  }

  /* ================= Экспорт / импорт ================= */
  function exportSave(state) {
    const text = serialize(state, true);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    a.href = url;
    a.download = 'number-tycoon-day' + U.dayOf(state.time.minutes) + '-' + stamp + '.json';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, bytes: text.length, name: a.download };
  }

  function readFileText(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error || new Error('Не удалось прочитать файл'));
      r.readAsText(file);
    });
  }

  async function importFile(file) {
    if (!file) return { ok: false, errors: ['Файл не выбран'] };
    if (!/\.json$/i.test(file.name || '')) return { ok: false, errors: ['Выберите файл сохранения в формате .json'] };
    if (file.size > C.limits.importMaxBytes) return { ok: false, errors: ['Файл слишком большой'] };
    let text;
    try { text = await readFileText(file); } catch (e) { return { ok: false, errors: ['Не удалось прочитать файл'] }; }
    return parseAndValidate(text);
  }

  function summarize(state) {
    const value = state.collection.reduce((a, n) => a + NT.economy.currentValue(state, n), 0);
    return {
      name: state.profile.name, day: U.dayOf(state.time.minutes), balance: state.balance,
      numbers: state.collection.length, collectionValue: value, generations: state.stats.generations,
    };
  }

  /** Применение проверенного сохранения: текущее сохраняется как резервная копия. */
  function applyImported(state) {
    backupCurrent();
    NT.game.setState(state);
    save(state);
  }

  function wipe() {
    backupCurrent();
    try { window.localStorage.removeItem(C.storageKey); } catch (e) { /* ignore */ }
  }

  NT.storage = {
    save, scheduleSave, load, exportSave, importFile, parseAndValidate, validateState, applyImported,
    summarize, serialize, backupCurrent, wipe, onStatus, getStatus,
  };
})(window.NT = window.NT || {});
