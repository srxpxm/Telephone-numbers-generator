/*
 * Банк: игровое время, вклады (открытие, досрочное закрытие, получение) и кредиты
 * (рейтинг, лимит, предпросмотр условий, полное и частичное погашение).
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const G = () => NT.game;
  const B = () => NT.bank;
  const ui = () => NT.ui;
  const DAY = U.MIN_PER_DAY;

  let root = null;
  const refs = {};
  let depDays = 7, loanDays = 7;
  let timers = [];

  const icon = (n) => ui().icon(n);

  function amountField(id, label, onInput) {
    const input = h('input', { id, class: 'input mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', 'aria-describedby': id + '-err' });
    input.addEventListener('input', onInput);
    const err = h('p', { id: id + '-err', class: 'form-error', role: 'alert', hidden: true });
    const quick = h('div', { class: 'qty-quick' });
    const field = h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label), h('div', { class: 'input-suffix' }, input, h('span', { 'aria-hidden': 'true' }, '£')), quick, err);
    return { input, err, quick, field };
  }

  function mount(el) {
    root = el;
    refs.clockBox = h('section', { class: 'card time-card', 'aria-label': 'Игровое время' });
    refs.depTerms = h('div', { class: 'term-grid', role: 'group', 'aria-label': 'Срок вклада' });
    refs.dep = amountField('dep-amount', 'Сумма вклада', () => renderDepPreview());
    refs.depPreview = h('div', { class: 'preview' });
    refs.depBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: openDeposit }, icon('deposit'), 'Открыть вклад');
    refs.depList = h('div', { class: 'bank-list' });
    refs.depHistory = h('div', { class: 'bank-history' });
    const d = C.bank.deposit;
    const depCard = h('section', { class: 'card', 'aria-label': 'Вклады' },
      h('div', { class: 'card-head' }, h('div', { class: 'card-titles' }, h('h2', { class: 'card-title' }, icon('deposit'), 'Вклады'),
        h('p', { class: 'card-sub' }, 'Проценты начисляются равномерно по игровому времени, полная сумма выплачивается в конце срока.'))),
      h('div', { class: 'bank-form' }, refs.dep.field, h('span', { class: 'field-label' }, 'Срок и доходность'), refs.depTerms, refs.depPreview, refs.depBtn),
      h('ul', { class: 'rules' },
        h('li', null, 'Сумма вклада: от ' + U.gbp(d.minRub) + ' до ' + U.gbp(d.maxRub)),
        h('li', null, 'Одновременно — не более ' + d.maxActive + ' активных вкладов'),
        h('li', null, 'Досрочное закрытие: возвращается вся сумма и ' + U.pct(d.earlyInterestShare, 0) + ' начисленных процентов')),
      h('h3', { class: 'sub-title' }, 'Активные вклады'), refs.depList, refs.depHistory);

    refs.rating = h('div', { class: 'rating-box' });
    refs.loanTerms = h('div', { class: 'term-grid', role: 'group', 'aria-label': 'Срок кредита' });
    refs.loan = amountField('loan-amount', 'Сумма кредита', () => renderLoanPreview());
    refs.loanPreview = h('div', { class: 'preview' });
    refs.loanBlock = h('p', { class: 'alert alert-danger compact', hidden: true });
    refs.loanBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: takeLoan }, icon('loan'), 'Взять кредит');
    refs.loanList = h('div', { class: 'bank-list' });
    refs.loanHistory = h('div', { class: 'bank-history' });
    const l = C.bank.loan;
    const loanCard = h('section', { class: 'card', 'aria-label': 'Кредиты' },
      h('div', { class: 'card-head' }, h('div', { class: 'card-titles' }, h('h2', { class: 'card-title' }, icon('loan'), 'Кредиты'),
        h('p', { class: 'card-sub' }, 'Лимит зависит от капитала и кредитного рейтинга. Ставка — за весь срок.'))),
      refs.rating,
      h('div', { class: 'bank-form' }, refs.loanBlock, refs.loan.field, h('span', { class: 'field-label' }, 'Срок и ставка'), refs.loanTerms, refs.loanPreview, refs.loanBtn),
      h('ul', { class: 'rules' },
        h('li', null, 'Досрочное погашение: проценты пересчитываются по факту, но не меньше ' + U.pct(l.minInterestShare, 0) + ' от полной суммы процентов'),
        h('li', null, 'Просрочка: штраф ' + U.pct(l.overduePenaltyDaily) + ' от долга в день и снижение рейтинга'),
        h('li', null, 'Через ' + l.collectionAfterDays + ' дн. просрочки банк взыскивает долг: баланс → вклады → карты (' + U.pct(l.inventoryRefundShare, 0) + ') → номера (' + U.pct(l.seizureValueShare, 0) + ' цены)'),
        h('li', null, 'Если имущества не хватает — дефолт: рейтинг падает до минимума, кредиты блокируются на ' + l.blockDaysAfterDefault + ' дн.')),
      h('h3', { class: 'sub-title' }, 'Активные кредиты'), refs.loanList, refs.loanHistory);

    root.append(ui().pageHead('Банк', 'Вклады приносят проценты по игровым дням, кредиты помогают купить дорогие карты — но просрочка обходится дорого.'),
      refs.clockBox, h('div', { class: 'bank-grid' }, depCard, loanCard));
  }

  /* ================= Время ================= */
  function renderClock() {
    const s = G().state;
    const m = s.time.minutes;
    refs.dayBar = ui().progress(m % DAY, DAY, 'thin gold', 'Прогресс игрового дня');
    refs.clockText = h('div', { class: 'clock-big mono' }, U.gameDate(m));
    refs.skipBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'data-fk': 'skip', onclick: skip }, icon('skip'), h('span', null, 'Следующий день'));
    ui().preserveFocus(refs.clockBox, () => {
      U.clear(refs.clockBox).append(
        h('div', { class: 'time-main' }, h('span', { class: 'vg-label' }, icon('clock'), 'Игровое время'), refs.clockText, refs.dayBar,
          h('p', { class: 'hint' }, '1 игровой день = ' + C.time.realSecondsPerDay + ' секунд. Время идёт, только пока вкладка открыта; проценты, сроки и события рынка считаются по игровым дням.')),
        h('div', { class: 'time-side' }, refs.skipBtn, h('p', { class: 'hint' }, 'Перемотка к началу следующего дня. Не чаще одного раза в ' + C.time.skipCooldownSec + ' с.')));
    });
    tickSkip();
  }
  function tickSkip() {
    if (!refs.skipBtn) return;
    const left = G().skipCooldownLeft();
    refs.skipBtn.disabled = left > 0;
    refs.skipBtn.lastChild.textContent = left > 0 ? 'Следующий день через ' + Math.ceil(left / 1000) + ' с' : 'Следующий день';
  }
  function skip() {
    const r = G().skipDay();
    if (!r.ok) { ui().toast(r.error, 'warn'); return; }
    ui().toast('Наступил День ' + r.day + ' · ' + U.clockOf(G().state.time.minutes), 'info', { duration: 2600 });
    tickSkip();
  }

  /* ================= Вклады ================= */
  function renderTerms(box, terms, selected, onPick, kind) {
    box.style.setProperty('--n', String(terms.length));
    box.setAttribute('data-n', String(terms.length));
    ui().preserveFocus(box, () => {
      U.clear(box);
      terms.forEach((t) => {
        const rate = kind === 'loan' ? B().loanRate(G().state, t.days) : t.rate;
        box.appendChild(h('button', {
          type: 'button', class: 'term' + (t.days === selected ? ' active' : ''), 'aria-pressed': t.days === selected ? 'true' : 'false', 'data-fk': kind + '-t-' + t.days,
          onclick: () => onPick(t.days),
        }, h('span', { class: 'term-days' }, t.days + ' ' + U.plural(t.days, ['день', 'дня', 'дней'])), h('span', { class: 'term-rate mono' }, (kind === 'loan' ? '' : '+') + U.pct(rate, 2))));
      });
    });
  }

  function quickButtons(box, items, input, after) {
    ui().preserveFocus(box, () => {
      U.clear(box);
      items.forEach((it) => box.appendChild(h('button', { type: 'button', class: 'chip-btn', 'data-fk': box.id + it.label, disabled: !(it.value > 0),
        onclick: () => { input.value = (it.value / C.currency.rubPerGbp).toFixed(2).replace('.', ','); after(); } }, it.label)));
    });
  }

  function readAmount(field) {
    const raw = field.input.value.trim();
    if (!raw) return { empty: true, value: 0 };
    const v = U.parseGbpInput(raw);
    return { empty: false, value: v, invalid: v == null };
  }

  function renderDepPreview() {
    const s = G().state;
    const a = readAmount(refs.dep);
    const err = a.empty ? null : a.invalid ? 'Введите сумму числом, например 25 или 25,50' : B().validateDeposit(s, a.value, depDays);
    refs.dep.err.textContent = err || '';
    refs.dep.err.hidden = !err;
    refs.dep.input.setAttribute('aria-invalid', err ? 'true' : 'false');
    const p = B().depositPreview(s, a.invalid ? 0 : a.value, depDays);
    U.clear(refs.depPreview).append(
      prev('Доход за срок', p.interest > 0 ? '+' + U.gbp(p.interest) : U.gbp(0), p.interest > 0 ? 'pos' : ''),
      prev('К получению', U.gbp(p.total)),
      prev('Дата выплаты', U.gameDate(p.maturityMinute)));
    refs.depBtn.disabled = a.empty || !!err;
  }
  function prev(label, value, cls) {
    return h('div', { class: 'prev-item' }, h('span', { class: 'vg-label' }, label), h('span', { class: 'mono' + (cls ? ' ' + cls : '') }, value));
  }

  async function openDeposit() {
    const s = G().state;
    const a = readAmount(refs.dep);
    if (a.empty || a.invalid) { renderDepPreview(); return; }
    const r = G().openDeposit(a.value, depDays);
    if (!r.ok) { ui().toast(r.error, 'danger'); renderDepPreview(); return; }
    refs.dep.input.value = '';
    ui().sound('coin');
    ui().toast('Вклад ' + r.deposit.id + ' открыт: ' + U.gbp(r.deposit.amount) + ' на ' + depDays + ' дн. Доход +' + U.gbp(r.deposit.interest), 'success');
    void s;
  }

  function depositItem(dep, s) {
    const matured = B().isMatured(s, dep);
    const bar = ui().progress(Math.min(s.time.minutes, dep.maturityMinute) - dep.openedMinute, dep.maturityMinute - dep.openedMinute, 'thin green', 'Срок вклада');
    const accrued = h('span', { class: 'mono pos' }, '+' + U.gbp(B().accruedInterest(s, dep)));
    const left = h('span', { class: 'hint' });
    timers.push({ kind: 'dep', dep, bar, accrued, left });
    const btn = matured
      ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-fk': 'dep-' + dep.id, onclick: () => closeDeposit(dep.id) }, 'Забрать ' + U.gbp(dep.amount + dep.interest))
      : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'dep-' + dep.id, onclick: () => closeDeposit(dep.id) }, 'Закрыть досрочно');
    const el = h('div', { class: 'bank-item' + (matured ? ' ready' : '') },
      h('div', { class: 'bi-head' }, h('b', { class: 'mono' }, dep.id), h('span', { class: 'chip' }, dep.termDays + ' дн. · ' + U.pct(dep.rate, 2)), matured ? h('span', { class: 'chip chip-green' }, 'Готов') : null),
      h('div', { class: 'bi-grid' },
        prev('Сумма', U.gbp(dep.amount)),
        h('div', { class: 'prev-item' }, h('span', { class: 'vg-label' }, 'Начислено'), accrued),
        prev('В срок', U.gbp(dep.amount + dep.interest))),
      bar, h('div', { class: 'bi-foot' }, left, btn));
    updateDepTimer({ dep, bar, accrued, left });
    return el;
  }
  function updateDepTimer(t) {
    const s = G().state;
    const dep = t.dep;
    const total = dep.maturityMinute - dep.openedMinute;
    const done = Math.min(s.time.minutes, dep.maturityMinute) - dep.openedMinute;
    const pct = total > 0 ? U.clamp(done / total, 0, 1) : 1;
    t.bar.firstChild.style.width = (pct * 100).toFixed(2) + '%';
    t.bar.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    t.accrued.textContent = '+' + U.gbp(B().accruedInterest(s, dep));
    const leftMin = dep.maturityMinute - s.time.minutes;
    t.left.textContent = leftMin > 0 ? 'Выплата: ' + U.gameDate(dep.maturityMinute) + ' · через ' + U.duration(leftMin) : 'Срок вклада наступил';
  }

  async function closeDeposit(id) {
    const s = G().state;
    const dep = s.bank.deposits.find((d) => d.id === id);
    if (!dep || dep.status !== 'active') return;
    if (!B().isMatured(s, dep)) {
      const ep = B().earlyPayout(s, dep);
      const ok = await ui().confirm({
        title: 'Закрыть вклад досрочно?', icon: 'warn', danger: true,
        body: [h('p', null, 'Вклад ' + dep.id + ' на ' + U.gbp(dep.amount) + ' ещё не достиг срока (' + U.gameDate(dep.maturityMinute) + ').'),
          h('div', { class: 'preview' }, prev('Вы получите', U.gbp(ep.payout)), prev('Начислено', U.gbp(ep.accrued)), prev('Недополучите к сроку', '−' + U.gbp(ep.lost + (dep.interest - ep.accrued)), 'neg')),
          h('p', { class: 'hint' }, 'При досрочном закрытии сохраняется ' + U.pct(C.bank.deposit.earlyInterestShare, 0) + ' начисленных процентов.')],
        confirmLabel: 'Закрыть за ' + U.gbp(ep.payout), cancelLabel: 'Не закрывать',
      });
      if (!ok) return;
    }
    const r = G().closeDeposit(id);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().sound('coin');
    ui().toast((r.matured ? 'Вклад получен: +' : 'Вклад закрыт досрочно: +') + U.gbp(r.payout), r.matured ? 'success' : 'info');
  }

  /* ================= Кредиты ================= */
  function renderRating() {
    const s = G().state;
    const RT = C.bank.rating;
    const nw = G().netWorth();
    const tier = B().ratingTier(s.bank.rating);
    const limit = B().creditLimit(s, nw);
    const debt = B().totalDebt(s);
    const avail = B().availableCredit(s, nw);
    const pos = (s.bank.rating - RT.min) / (RT.max - RT.min);
    U.clear(refs.rating).append(
      h('div', { class: 'rating-top' },
        h('div', null, h('span', { class: 'vg-label' }, 'Кредитный рейтинг'), h('div', { class: 'rating-value mono' }, String(s.bank.rating), h('span', { class: 'chip rating-chip t-' + RT.tiers.indexOf(tier) }, tier.name))),
        h('div', { class: 'rating-effects hint' }, 'Ставка ×' + tier.rateMult.toFixed(2).replace('.', ','), h('br'), 'Лимит ×' + tier.limitMult.toFixed(2).replace('.', ','))),
      h('div', { class: 'rating-scale', 'aria-hidden': 'true' }, h('div', { class: 'rating-marker', style: { left: (pos * 100).toFixed(1) + '%' } })),
      h('div', { class: 'rating-labels hint mono', 'aria-hidden': 'true' }, h('span', null, String(RT.min)), h('span', null, String(RT.max))),
      h('div', { class: 'kv-list' },
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Кредитный лимит'), h('span', { class: 'kv-v mono' }, U.gbp(limit))),
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Текущий долг'), h('span', { class: 'kv-v mono' + (debt ? ' neg' : '') }, debt ? '−' + U.gbp(debt) : U.gbp(0))),
        h('div', { class: 'kv' }, h('span', { class: 'kv-k' }, 'Доступно'), h('span', { class: 'kv-v mono pos' }, U.gbp(avail)))),
      h('p', { class: 'hint' }, 'Лимит = (' + U.gbp(C.bank.loan.baseLimitRub) + ' + ' + U.pct(C.bank.loan.netWorthShare, 0) + ' чистого капитала) × множитель рейтинга. Своевременные погашения повышают рейтинг.'));
  }

  function renderLoanPreview() {
    const s = G().state;
    const nw = G().netWorth();
    const block = B().loanBlockReason(s, nw);
    refs.loanBlock.hidden = !block;
    refs.loanBlock.textContent = block || '';
    const a = readAmount(refs.loan);
    const avail = B().availableCredit(s, nw);
    let err = null;
    if (!a.empty) {
      if (a.invalid) err = 'Введите сумму числом, например 100 или 99,90';
      else if (a.value < C.bank.loan.minRub) err = 'Минимальная сумма кредита — ' + U.gbp(C.bank.loan.minRub);
      else if (a.value > avail) err = 'Сумма превышает доступный лимит ' + U.gbp(avail);
    }
    refs.loan.err.textContent = err || '';
    refs.loan.err.hidden = !err;
    refs.loan.input.setAttribute('aria-invalid', err ? 'true' : 'false');
    refs.loan.input.disabled = !!block;
    const p = B().loanPreview(s, a.invalid ? 0 : a.value, loanDays);
    U.clear(refs.loanPreview).append(
      prev('Ставка за срок', U.pct(p.rate, 2)),
      prev('Проценты', p.interest > 0 ? '−' + U.gbp(p.interest) : U.gbp(0), p.interest > 0 ? 'neg' : ''),
      prev('Вернуть всего', U.gbp(p.total)),
      prev('Срок возврата', U.gameDate(p.dueMinute)),
      prev('Штраф при просрочке', '≈ ' + U.gbp(p.dailyPenalty) + ' / день', 'warn-t'));
    refs.loanBtn.disabled = !!block || a.empty || !!err;
  }

  async function takeLoan() {
    const s = G().state;
    const a = readAmount(refs.loan);
    if (a.empty || a.invalid) { renderLoanPreview(); return; }
    const p = B().loanPreview(s, a.value, loanDays);
    const ok = await ui().confirm({
      title: 'Оформить кредит?', icon: 'loan',
      body: [h('div', { class: 'preview' }, prev('Вы получите', U.gbp(p.amount), 'pos'), prev('Вернуть до', U.gameDate(p.dueMinute)), prev('Сумма к возврату', U.gbp(p.total)), prev('Проценты', U.gbp(p.interest), 'neg')),
        h('p', { class: 'hint' }, 'При просрочке начисляется штраф ' + U.pct(C.bank.loan.overduePenaltyDaily) + ' в день, а через ' + C.bank.loan.collectionAfterDays + ' дн. банк изымет имущество.')],
      confirmLabel: 'Взять ' + U.gbp(p.amount),
    });
    if (!ok) return;
    const r = G().takeLoan(a.value, loanDays);
    if (!r.ok) { ui().toast(r.error, 'danger'); renderLoanPreview(); return; }
    refs.loan.input.value = '';
    ui().sound('coin');
    ui().toast('Кредит ' + r.loan.id + ' выдан: +' + U.gbp(r.loan.principal) + '. Вернуть ' + U.gbp(r.loan.principal + r.loan.interest) + ' до ' + U.gameDate(r.loan.dueMinute), 'bank');
  }

  function loanItem(loan, s) {
    const overdue = s.time.minutes > loan.dueMinute;
    const payoff = B().payoffNow(s, loan);
    const left = h('span', { class: 'hint' + (overdue ? ' neg' : '') });
    const bar = ui().progress(Math.min(s.time.minutes, loan.dueMinute) - loan.takenMinute, loan.dueMinute - loan.takenMinute, 'thin ' + (overdue ? 'red' : 'gold'), 'Срок кредита');
    timers.push({ kind: 'loan', loan, left, bar });
    const el = h('div', { class: 'bank-item' + (overdue ? ' overdue' : '') },
      h('div', { class: 'bi-head' }, h('b', { class: 'mono' }, loan.id), h('span', { class: 'chip' }, loan.termDays + ' дн. · ' + U.pct(loan.rate, 2)),
        overdue ? h('span', { class: 'chip chip-red' }, icon('warn'), 'Просрочка ' + loan.overdueDays + ' дн.') : null),
      h('div', { class: 'bi-grid' },
        prev('Взято', U.gbp(loan.principal)),
        prev('Выплачено', U.gbp(loan.paid)),
        prev(overdue ? 'Долг со штрафами' : 'Погасить сейчас', U.gbp(payoff), overdue ? 'neg' : '')),
      loan.penalty ? h('p', { class: 'hint neg' }, 'Начислено штрафов: ' + U.gbp(loan.penalty)) : null,
      !overdue && payoff < B().outstanding(loan) ? h('p', { class: 'hint' }, 'Досрочно дешевле: по договору ' + U.gbp(B().outstanding(loan)) + ', сейчас — ' + U.gbp(payoff)) : null,
      bar,
      h('div', { class: 'bi-foot' }, left,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'lp-' + loan.id, disabled: s.balance <= 0, onclick: () => partial(loan.id) }, 'Частично'),
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-fk': 'lf-' + loan.id, disabled: s.balance < payoff, title: s.balance < payoff ? 'Недостаточно средств' : null, onclick: () => repay(loan.id) }, 'Погасить ' + U.gbp(payoff)))));
    updateLoanTimer({ loan, left, bar });
    return el;
  }
  function updateLoanTimer(t) {
    const s = G().state;
    const l = t.loan;
    const leftMin = l.dueMinute - s.time.minutes;
    t.left.textContent = leftMin > 0 ? 'Вернуть до ' + U.gameDate(l.dueMinute) + ' · осталось ' + U.duration(leftMin)
      : 'Срок истёк ' + U.gameDate(l.dueMinute) + '. Взыскание через ' + Math.max(0, C.bank.loan.collectionAfterDays - l.overdueDays) + ' дн.';
    const total = l.dueMinute - l.takenMinute;
    const pct = total > 0 ? U.clamp((Math.min(s.time.minutes, l.dueMinute) - l.takenMinute) / total, 0, 1) : 1;
    t.bar.firstChild.style.width = (pct * 100).toFixed(2) + '%';
  }

  function repay(id) {
    const r = G().repayLoan(id);
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().sound('coin');
    ui().toast('Кредит ' + id + ' погашен: −' + U.gbp(r.paid), 'success');
  }
  async function partial(id) {
    const s = G().state;
    const loan = s.bank.loans.find((l) => l.id === id);
    if (!loan) return;
    const max = Math.min(B().payoffNow(s, loan), s.balance);
    const v = await ui().prompt({
      title: 'Частичное погашение ' + id, icon: 'loan', label: 'Сумма платежа, £', inputmode: 'decimal', okLabel: 'Внести платёж',
      text: 'Остаток к погашению сейчас: ' + U.gbp(B().payoffNow(s, loan)) + '. На балансе: ' + U.gbp(s.balance) + '.',
      hint: 'Максимум: ' + U.gbp(max),
      validate: (str) => { const x = U.parseGbpInput(str); if (x == null || x <= 0) return 'Введите сумму числом'; if (x > max) return 'Не больше ' + U.gbp(max); return null; },
    });
    if (v == null) return;
    const r = G().repayLoan(id, U.parseGbpInput(v));
    if (!r.ok) { ui().toast(r.error, 'danger'); return; }
    ui().sound('coin');
    ui().toast(r.closed ? 'Кредит ' + id + ' полностью погашен' : 'Платёж по кредиту ' + id + ': −' + U.gbp(r.paid), 'success');
  }

  function history(box, items, title, render) {
    U.clear(box);
    if (!items.length) return;
    const list = h('ul', { class: 'history-list' });
    items.slice(0, 20).forEach((x) => list.appendChild(render(x)));
    box.appendChild(h('details', { class: 'history' }, h('summary', null, title + ' (' + items.length + ')'), list));
  }

  function pickDep(d) { depDays = d; renderTerms(refs.depTerms, C.bank.deposit.terms, depDays, pickDep, 'dep'); renderDepPreview(); }

  /* ================= Обновление ================= */
  function update() {
    if (!root) return;
    const s = G().state;
    timers = [];
    renderClock();
    renderTerms(refs.depTerms, C.bank.deposit.terms, depDays, pickDep, 'dep');
    quickButtons(refs.dep.quick, [
      { label: '10 £', value: Math.min(1000, s.balance) },
      { label: '100 £', value: Math.min(10000, s.balance) },
      { label: '50%', value: Math.floor(s.balance / 2) },
      { label: 'Макс', value: Math.min(s.balance, C.bank.deposit.maxRub) }], refs.dep.input, renderDepPreview);
    renderDepPreview();
    ui().preserveFocus(refs.depList, () => {
      U.clear(refs.depList);
      const act = B().activeDeposits(s);
      if (!act.length) refs.depList.appendChild(ui().empty('Активных вкладов нет', 'Свободные деньги могут приносить доход, пока вы собираете коллекцию.'));
      act.forEach((d) => refs.depList.appendChild(depositItem(d, s)));
    });
    history(refs.depHistory, s.bank.deposits.filter((d) => d.status !== 'active'), 'История вкладов', (d) =>
      h('li', null, h('span', { class: 'mono' }, d.id), h('span', null, U.gbp(d.amount) + ' · ' + d.termDays + ' дн.' + (d.early ? ' · досрочно' : '')), h('span', { class: 'mono pos' }, '+' + U.gbp((d.payout || 0) - d.amount))));

    renderRating();
    renderTerms(refs.loanTerms, C.bank.loan.terms, loanDays, (d) => { loanDays = d; update(); }, 'loan');
    const nw = G().netWorth();
    const avail = B().availableCredit(s, nw);
    quickButtons(refs.loan.quick, [
      { label: '25%', value: Math.floor(avail / 4) },
      { label: '50%', value: Math.floor(avail / 2) },
      { label: 'Макс', value: avail }], refs.loan.input, renderLoanPreview);
    renderLoanPreview();
    ui().preserveFocus(refs.loanList, () => {
      U.clear(refs.loanList);
      const act = B().activeLoans(s);
      if (!act.length) refs.loanList.appendChild(ui().empty('Кредитов нет', 'Кредит поможет купить дорогую карту, но проценты съедают прибыль.'));
      act.forEach((l) => refs.loanList.appendChild(loanItem(l, s)));
    });
    const STATUS = { repaid: 'погашен', defaulted: 'дефолт' };
    history(refs.loanHistory, s.bank.loans.filter((l) => l.status !== 'active'), 'История кредитов', (l) =>
      h('li', null, h('span', { class: 'mono' }, l.id), h('span', null, U.gbp(l.principal) + ' · ' + (l.closedBy === 'collection' ? 'взыскан банком' : STATUS[l.status] || l.status)),
        h('span', { class: 'mono ' + (l.status === 'defaulted' ? 'neg' : 'muted') }, U.gbp(l.paid))));
  }

  function tick() {
    if (!root || !refs.clockText) return;
    const s = G().state;
    refs.clockText.textContent = U.gameDate(s.time.minutes);
    const pct = (s.time.minutes % DAY) / DAY;
    refs.dayBar.firstChild.style.width = (pct * 100).toFixed(2) + '%';
    tickSkip();
    timers.forEach((t) => { if (t.kind === 'dep') updateDepTimer(t); else updateLoanTimer(t); });
  }

  NT.views.bank = { mount, update, tick, onShow: update };
})(window.NT = window.NT || {});
