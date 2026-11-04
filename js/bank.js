/*
 * Банк: вклады, кредиты, кредитный рейтинг, просрочки и принудительное взыскание.
 * Все движения денег проходят через NT.game.credit / NT.game.debit, поэтому баланс
 * никогда не становится отрицательным, а каждая операция попадает в историю.
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;
  const U = NT.util;
  const D = C.bank.deposit;
  const L = C.bank.loan;
  const RT = C.bank.rating;
  const DAY = U.MIN_PER_DAY;

  const ok = (data) => Object.assign({ ok: true }, data || {});
  const fail = (error) => ({ ok: false, error });
  const now = (state) => state.time.minutes;
  const today = (state) => U.dayOf(state.time.minutes);
  const G = () => NT.game;

  /* ================= Вклады ================= */
  function depositTerm(days) { return D.terms.find((t) => t.days === days) || null; }
  const activeDeposits = (state) => state.bank.deposits.filter((d) => d.status === 'active');

  function depositPreview(state, amount, days) {
    const term = depositTerm(days);
    if (!term) return null;
    const a = Math.max(0, amount | 0);
    const interest = Math.round(a * term.rate);
    return { amount: a, rate: term.rate, days, interest, total: a + interest, maturityMinute: now(state) + days * DAY };
  }

  function hasOverdue(state) { return state.bank.loans.some((l) => l.status === 'active' && now(state) > l.dueMinute); }

  function validateDeposit(state, amount, days) {
    if (!depositTerm(days)) return 'Выберите срок вклада';
    if (!Number.isSafeInteger(amount) || amount <= 0) return 'Введите сумму вклада';
    if (amount < D.minRub) return 'Минимальная сумма вклада — ' + U.gbp(D.minRub);
    if (amount > D.maxRub) return 'Максимальная сумма одного вклада — ' + U.gbp(D.maxRub);
    if (amount > state.balance) return 'Недостаточно средств на балансе';
    if (activeDeposits(state).length >= D.maxActive) return 'Можно держать не более ' + D.maxActive + ' активных вкладов';
    if (hasOverdue(state)) return 'Банк не открывает вклады, пока есть просроченный кредит';
    return null;
  }

  function openDeposit(state, amount, days) {
    const err = validateDeposit(state, amount, days);
    if (err) return fail(err);
    const p = depositPreview(state, amount, days);
    const id = G().nextId('deposit', 'D', 4);
    if (!G().debit(amount, 'deposit_open', 'Открытие вклада ' + id + ' на ' + days + ' дн.')) return fail('Недостаточно средств');
    state.bank.deposits.unshift({
      id, amount, termDays: days, rate: p.rate, interest: p.interest,
      openedMinute: now(state), maturityMinute: p.maturityMinute, status: 'active', payout: null, closedMinute: null, early: false, notified: false,
    });
    state.stats.depositsOpened += 1;
    trimHistory(state);
    return ok({ deposit: state.bank.deposits[0] });
  }

  const isMatured = (state, dep) => now(state) >= dep.maturityMinute;

  function accruedInterest(state, dep) {
    if (isMatured(state, dep)) return dep.interest;
    const elapsed = Math.max(0, now(state) - dep.openedMinute);
    return Math.floor((dep.interest * elapsed) / (dep.termDays * DAY));
  }

  function earlyPayout(state, dep) {
    const accrued = accruedInterest(state, dep);
    const kept = Math.floor(accrued * D.earlyInterestShare);
    return { payout: dep.amount + kept, accrued, kept, lost: accrued - kept };
  }

  /** Закрытие вклада: по сроку — полная сумма с процентами, досрочно — с потерей части процентов. */
  function closeDeposit(state, id, byBank) {
    const dep = state.bank.deposits.find((d) => d.id === id);
    if (!dep || dep.status !== 'active') return fail('Вклад уже закрыт');
    const matured = isMatured(state, dep);
    const payout = matured ? dep.amount + dep.interest : earlyPayout(state, dep).payout;
    dep.status = 'closed';
    dep.payout = payout;
    dep.closedMinute = now(state);
    dep.early = !matured;
    const interestPart = payout - dep.amount;
    const text = (byBank ? 'Банк закрыл вклад ' : (matured ? 'Получение вклада ' : 'Досрочное закрытие вклада ')) + id;
    G().credit(payout, 'deposit_close', text);
    state.stats.earnedInterest += interestPart;
    trimHistory(state);
    return ok({ payout, matured, interest: interestPart });
  }

  /* ================= Кредиты ================= */
  function ratingTier(rating) {
    for (const t of RT.tiers) if (rating >= t.min) return t;
    return RT.tiers[RT.tiers.length - 1];
  }
  function loanTerm(days) { return L.terms.find((t) => t.days === days) || null; }
  function loanRate(state, days) {
    const term = loanTerm(days);
    if (!term) return null;
    return Math.round(term.rate * ratingTier(state.bank.rating).rateMult * 10000) / 10000;
  }

  const activeLoans = (state) => state.bank.loans.filter((l) => l.status === 'active');
  /** Остаток по договору (полные проценты + штрафы − выплачено). */
  const outstanding = (loan) => Math.max(0, loan.principal + loan.interest + loan.penalty - loan.paid);

  /** Сумма для полного погашения прямо сейчас (досрочно — проценты пересчитываются). */
  function payoffNow(state, loan) {
    if (loan.status !== 'active') return 0;
    const t = now(state);
    if (t >= loan.dueMinute) return outstanding(loan);
    const share = Math.max(L.minInterestShare, (t - loan.takenMinute) / (loan.termDays * DAY));
    const interest = Math.ceil(loan.interest * Math.min(1, share));
    return Math.max(0, loan.principal + interest + loan.penalty - loan.paid);
  }

  function totalDebt(state) { return activeLoans(state).reduce((a, l) => a + outstanding(l), 0); }

  function creditLimit(state, netWorth) {
    const tier = ratingTier(state.bank.rating);
    const raw = (L.baseLimitRub + L.netWorthShare * Math.max(0, netWorth)) * tier.limitMult;
    return Math.min(L.maxLimitRub, Math.floor(raw));
  }

  function availableCredit(state, netWorth) {
    return Math.max(0, creditLimit(state, netWorth) - totalDebt(state));
  }

  function loanBlockReason(state, netWorth) {
    if (state.bank.rating < RT.minForLoan) return 'Кредитный рейтинг слишком низкий';
    if (today(state) < state.bank.blockedUntilDay) return 'Кредиты недоступны до Дня ' + state.bank.blockedUntilDay + ' после дефолта';
    if (hasOverdue(state)) return 'Сначала погасите просроченный кредит';
    if (activeLoans(state).length >= L.maxActive) return 'Не более ' + L.maxActive + ' активных кредитов';
    if (availableCredit(state, netWorth) < L.minRub) return 'Кредитный лимит исчерпан';
    return null;
  }

  function loanPreview(state, amount, days) {
    const rate = loanRate(state, days);
    if (rate == null) return null;
    const a = Math.max(0, amount | 0);
    const interest = Math.round(a * rate);
    return { amount: a, days, rate, interest, total: a + interest, dueMinute: now(state) + days * DAY, dailyPenalty: Math.round((a + interest) * L.overduePenaltyDaily) };
  }

  function takeLoan(state, amount, days, netWorth) {
    const block = loanBlockReason(state, netWorth);
    if (block) return fail(block);
    if (!loanTerm(days)) return fail('Выберите срок кредита');
    if (!Number.isSafeInteger(amount) || amount < L.minRub) return fail('Минимальная сумма кредита — ' + U.gbp(L.minRub));
    const avail = availableCredit(state, netWorth);
    if (amount > avail) return fail('Сумма превышает доступный лимит ' + U.gbp(avail));
    const p = loanPreview(state, amount, days);
    const id = G().nextId('loan', 'L', 4);
    state.bank.loans.unshift({
      id, principal: amount, termDays: days, rate: p.rate, interest: p.interest,
      takenMinute: now(state), dueMinute: p.dueMinute, paid: 0, penalty: 0,
      status: 'active', overdueDays: 0, wasOverdue: false, closedMinute: null, closedBy: null,
    });
    G().credit(amount, 'loan_take', 'Кредит ' + id + ' на ' + days + ' дн.');
    state.stats.loansTaken += 1;
    trimHistory(state);
    return ok({ loan: state.bank.loans[0] });
  }

  function closeLoan(state, loan, closedBy) {
    loan.status = closedBy === 'default' ? 'defaulted' : 'repaid';
    loan.closedMinute = now(state);
    loan.closedBy = closedBy;
    const interestPaid = Math.max(0, Math.min(loan.interest, loan.paid - loan.principal));
    const penaltyPaid = Math.max(0, Math.min(loan.penalty, loan.paid - loan.principal - interestPaid));
    state.stats.spentInterest += interestPaid;
    state.stats.spentPenalties += penaltyPaid;
    if (closedBy === 'player') {
      state.stats.loansRepaid += 1;
      if (!loan.wasOverdue) {
        state.stats.loansRepaidOnTime += 1;
        const early = now(state) < loan.dueMinute - DAY;
        changeRating(state, early ? RT.earlyRepay : RT.onTimeRepay);
      }
    }
  }

  /** Погашение: полное (amount не задан) или частичное. */
  function repayLoan(state, id, amount) {
    const loan = state.bank.loans.find((l) => l.id === id);
    if (!loan || loan.status !== 'active') return fail('Кредит уже закрыт');
    const due = payoffNow(state, loan);
    const pay = amount == null ? due : Math.min(amount, due);
    if (!Number.isSafeInteger(pay) || pay <= 0) return fail('Введите сумму платежа');
    if (pay > state.balance) return fail('Недостаточно средств: нужно ' + U.gbp(pay));
    const full = pay >= due;
    if (full) {
      // при досрочном погашении фиксируем пересчитанные проценты
      const t = now(state);
      if (t < loan.dueMinute) loan.interest = Math.max(0, due + loan.paid - loan.principal - loan.penalty);
    }
    G().debit(pay, 'loan_repay', (full ? 'Погашение кредита ' : 'Платёж по кредиту ') + id);
    loan.paid += pay;
    if (full || outstanding(loan) <= 0) closeLoan(state, loan, 'player');
    trimHistory(state);
    return ok({ paid: pay, closed: loan.status !== 'active' });
  }

  function changeRating(state, delta) {
    state.bank.rating = U.clamp(Math.round(state.bank.rating + delta), RT.min, RT.max);
  }

  /** Принудительное взыскание: баланс → вклады → карты → номера коллекции (75% цены). */
  function forcedCollection(state, loan) {
    const game = G();
    const report = { fromBalance: 0, deposits: 0, cards: 0, numbers: 0, writtenOff: 0 };
    const take = (limitText) => {
      const need = outstanding(loan);
      const x = Math.min(need, state.balance);
      if (x > 0) { game.debit(x, 'collection', 'Взыскание по кредиту ' + loan.id + (limitText ? ' (' + limitText + ')' : '')); loan.paid += x; }
      return x;
    };
    report.fromBalance = take();
    if (outstanding(loan) > 0) {
      for (const dep of activeDeposits(state)) {
        if (outstanding(loan) <= 0) break;
        const r = closeDeposit(state, dep.id, true);
        if (r.ok) { report.deposits += 1; take('из вклада ' + dep.id); }
      }
    }
    if (outstanding(loan) > 0) {
      for (const key of Object.keys(state.inventory)) {
        while (state.inventory[key] > 0 && outstanding(loan) > 0) {
          const parts = key.split(':');
          const refund = Math.floor(NT.economy.cardPrice(parts[1], parts[0]) * L.inventoryRefundShare);
          state.inventory[key] -= 1;
          report.cards += 1;
          if (refund > 0) { game.credit(refund, 'seizure', 'Изъятие карты ' + NT.economy.CLASS[parts[1]].short + ' (' + Math.round(L.inventoryRefundShare * 100) + '%)'); take(); }
        }
      }
    }
    if (outstanding(loan) > 0) {
      const sorted = state.collection.slice().sort((a, b) => NT.economy.currentValue(state, a) - NT.economy.currentValue(state, b));
      for (const n of sorted) {
        if (outstanding(loan) <= 0) break;
        const price = Math.max(1, Math.floor(NT.economy.currentValue(state, n) * L.seizureValueShare));
        const idx = state.collection.indexOf(n);
        if (idx >= 0) state.collection.splice(idx, 1);
        report.numbers += 1;
        game.credit(price, 'seizure', 'Изъятие номера ' + NT.gen.format(n.body) + ' за ' + Math.round(L.seizureValueShare * 100) + '% цены');
        take();
      }
    }
    if (outstanding(loan) > 0) {
      report.writtenOff = outstanding(loan);
      closeLoan(state, loan, 'default');
      state.bank.rating = RT.min;
      state.bank.blockedUntilDay = today(state) + L.blockDaysAfterDefault;
      state.stats.defaults += 1;
    } else {
      closeLoan(state, loan, 'collection');
      changeRating(state, RT.defaultPenalty);
    }
    return report;
  }

  /** Ежедневная обработка: просрочки, штрафы, взыскания. */
  function processDay(state) {
    const events = [];
    const t = now(state);
    for (const loan of activeLoans(state)) {
      if (t <= loan.dueMinute) continue;
      if (!loan.wasOverdue) {
        loan.wasOverdue = true;
        changeRating(state, RT.firstOverdue);
        events.push({ tone: 'danger', text: 'Кредит ' + loan.id + ' просрочен! Начисляются штрафы ' + U.pct(L.overduePenaltyDaily) + ' в день.' });
      } else {
        changeRating(state, RT.overduePerDay);
      }
      loan.overdueDays += 1;
      const base = Math.max(0, loan.principal + loan.interest - loan.paid);
      const cap = Math.floor(loan.principal * L.penaltyCapShare);
      const add = Math.min(Math.max(0, cap - loan.penalty), Math.round(base * L.overduePenaltyDaily));
      loan.penalty += add;
      if (loan.overdueDays >= L.collectionAfterDays) {
        const r = forcedCollection(state, loan);
        events.push({ tone: 'danger', text: r.writtenOff > 0
          ? 'Дефолт по кредиту ' + loan.id + ': имущество изъято, остаток ' + U.gbp(r.writtenOff) + ' списан. Кредиты заблокированы на ' + L.blockDaysAfterDefault + ' дн.'
          : 'Банк взыскал долг по кредиту ' + loan.id + ' (изъято номеров: ' + r.numbers + ', вкладов: ' + r.deposits + ').' });
      } else if (loan.overdueDays === L.collectionAfterDays - 2) {
        events.push({ tone: 'danger', text: 'Через 2 дня банк начнёт принудительное взыскание по кредиту ' + loan.id + '.' });
      }
    }
    // Медленное восстановление рейтинга, если просроченных долгов нет
    if (!hasOverdue(state) && state.bank.rating < RT.recoveryCap && RT.dailyRecovery > 0) {
      state.bank.rating = Math.min(RT.recoveryCap, state.bank.rating + RT.dailyRecovery);
    }
    trimHistory(state);
    return events;
  }

  /** Вклады, срок которых наступил (для уведомлений). */
  function newlyMatured(state) {
    const out = [];
    for (const d of activeDeposits(state)) {
      if (!d.notified && isMatured(state, d)) { d.notified = true; out.push(d); }
    }
    return out;
  }

  function trimHistory(state) {
    const trim = (arr, isActive, max) => {
      const closed = arr.filter((x) => !isActive(x));
      if (closed.length <= max) return arr;
      const drop = new Set(closed.slice(max));
      return arr.filter((x) => !drop.has(x));
    };
    state.bank.deposits = trim(state.bank.deposits, (d) => d.status === 'active', C.limits.closedDeposits);
    state.bank.loans = trim(state.bank.loans, (l) => l.status === 'active', C.limits.closedLoans);
  }

  /* ================= Поддержка при банкротстве ================= */
  function grantStatus(state, netWorth, cheapest) {
    const g = C.bank.grant;
    const hasAssets = state.collection.length > 0 || state.pending || activeDeposits(state).length > 0 ||
      Object.values(state.inventory).some((v) => v > 0) || activeLoans(state).length > 0;
    const eligible = !hasAssets && state.balance < cheapest && netWorth < cheapest;
    const nextDay = state.bank.lastGrantDay + g.cooldownDays;
    return { eligible, available: eligible && today(state) >= nextDay, nextDay, amount: g.amountRub };
  }

  NT.bank = {
    depositTerm, activeDeposits, depositPreview, validateDeposit, openDeposit, isMatured, accruedInterest, earlyPayout, closeDeposit,
    ratingTier, loanTerm, loanRate, activeLoans, outstanding, payoffNow, totalDebt, creditLimit, availableCredit,
    loanBlockReason, loanPreview, takeLoan, repayLoan, processDay, newlyMatured, hasOverdue, grantStatus,
  };
})(window.NT = window.NT || {});
