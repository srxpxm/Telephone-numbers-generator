/*
 * Общие утилиты: случайные числа, детерминированный ГПСЧ, форматирование денег и времени,
 * безопасный DOM-конструктор (весь пользовательский текст выводится только через textContent).
 */
(function (NT) {
  'use strict';
  const C = NT.CONFIG;

  /* ---------- Случайность ---------- */
  const cryptoObj = (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') ? crypto : null;
  const pool = new Uint32Array(128);
  let poolPos = pool.length;

  /** Криптографически стойкое число [0, 1). Используется для генерации номеров. */
  function random() {
    if (!cryptoObj) return Math.random();
    if (poolPos >= pool.length) { cryptoObj.getRandomValues(pool); poolPos = 0; }
    return pool[poolPos++] / 4294967296;
  }

  function randInt(min, max, rnd) {
    const r = rnd || random;
    return min + Math.floor(r() * (max - min + 1));
  }

  function pick(arr, rnd) {
    const r = rnd || random;
    return arr[Math.floor(r() * arr.length)];
  }

  function weightedPick(items, weightFn, rnd) {
    const r = rnd || random;
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return items[0];
    let x = r() * total;
    for (const it of items) {
      x -= Math.max(0, weightFn(it));
      if (x < 0) return it;
    }
    return items[items.length - 1];
  }

  function shuffle(arr, rnd) {
    const r = rnd || random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Детерминированный ГПСЧ mulberry32: рынок, задания и предложения не меняются при перезагрузке. */
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mixSeed() {
    let h = 0x811c9dc5;
    for (let i = 0; i < arguments.length; i++) {
      let v = (arguments[i] | 0) >>> 0;
      for (let k = 0; k < 4; k++) {
        h ^= v & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
        v >>>= 8;
      }
    }
    return h >>> 0;
  }

  /** FNV-1a (32 бита) — контрольная сумма сохранений. */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /* ---------- Числа ---------- */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const isInt = (x) => Number.isSafeInteger(x);

  /* ---------- Деньги (минорные единицы: 1 ₽ = 0.01 £) ---------- */
  const RUB = C.currency.rubPerGbp;
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

  function gbp(minor) {
    const v = (minor || 0) / RUB;
    const sign = v <= -0.005 ? '−' : ''; // без «−0,00»
    return sign + nf2.format(Math.abs(v)) + ' £';
  }

  /** Компактная запись для больших сумм: 1,2 млн £ */
  function gbpShort(minor) {
    const v = Math.abs((minor || 0) / RUB);
    const sign = minor < 0 ? '−' : '';
    if (v >= 1e9) return sign + nf1.format(v / 1e9) + ' млрд £';
    if (v >= 1e6) return sign + nf1.format(v / 1e6) + ' млн £';
    if (v >= 1e5) return sign + nf0.format(v) + ' £';
    return gbp(minor);
  }

  /** Для подписей осей: без копеек начиная с 1 000 £, «млн/млрд» для очень больших сумм. */
  function gbpCompact(minor) {
    const v = Math.abs((minor || 0) / RUB);
    if (v >= 1e6) return gbpShort(minor);
    if (v >= 1000) return (minor < 0 ? '−' : '') + nf0.format(Math.round(v)) + ' £';
    return gbp(minor);
  }

  function signedGbp(minor) {
    if (minor > 0) return '+' + gbp(minor);
    if (minor < 0) return gbp(minor);
    return gbp(0);
  }

  function rub(minor) { return nf0.format(minor || 0) + ' ₽'; }
  function num(x) { return nf0.format(x || 0); }
  function pct(x, digits) {
    const d = digits == null ? 1 : digits;
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(x * 100) + '%';
  }
  function pctRaw(x, digits) { // x уже в процентах
    const d = digits == null ? 2 : digits;
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(x) + '%';
  }
  const gbpToMinor = (g) => Math.round(Number(g) * RUB);

  /** Разбор пользовательского ввода суммы в £ → минорные единицы (или null). */
  function parseGbpInput(str) {
    if (typeof str !== 'string' && typeof str !== 'number') return null;
    const clean = String(str).replace(/\s|\u00a0|\u202f|£/g, '').replace(',', '.');
    if (!/^\d{1,13}(\.\d{0,2})?$/.test(clean)) return null;
    const v = Math.round(parseFloat(clean) * RUB);
    return Number.isSafeInteger(v) ? v : null;
  }

  /* ---------- Склонения ---------- */
  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  /* ---------- Игровое время ---------- */
  const MIN_PER_DAY = 1440;
  const dayOf = (minutes) => Math.floor(minutes / MIN_PER_DAY) + 1;
  function clockOf(minutes) {
    const m = ((minutes % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  const gameDate = (minutes) => 'День ' + dayOf(minutes) + ', ' + clockOf(minutes);
  function realDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function duration(minutes) {
    if (minutes <= 0) return 'сейчас';
    const days = Math.floor(minutes / MIN_PER_DAY);
    const hours = Math.floor((minutes % MIN_PER_DAY) / 60);
    const mins = minutes % 60;
    if (days > 0) return days + ' ' + plural(days, ['день', 'дня', 'дней']) + (hours ? ' ' + hours + ' ч' : '');
    if (hours > 0) return hours + ' ч ' + (mins ? mins + ' мин' : '');
    return mins + ' мин';
  }

  /* ---------- Безопасный DOM-конструктор ---------- */
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const key of Object.keys(props)) {
        const val = props[key];
        if (val == null || val === false) continue;
        if (key === 'class' || key === 'className') el.className = val;
        else if (key === 'text') el.textContent = val;
        else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
        else if (key === 'dataset') Object.assign(el.dataset, val);
        else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
        else if (key === 'value') el.value = val;
        else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') el[key] = !!val;
        else if (val === true) el.setAttribute(key, '');
        else el.setAttribute(key, String(val));
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach((c) => append(el, c)); return; }
    if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /** SVG-иконки из констант (никаких пользовательских данных). */
  function svgIcon(markup, cls) {
    const tpl = document.createElement('template');
    tpl.innerHTML = markup.trim();
    const node = tpl.content.firstChild;
    if (cls && node && node.classList) node.classList.add(cls);
    return node;
  }

  function deepClone(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  NT.util = {
    random, randInt, pick, weightedPick, shuffle, seeded, mixSeed, hashString,
    clamp, isInt, gbp, gbpShort, gbpCompact, signedGbp, rub, num, pct, pctRaw, gbpToMinor, parseGbpInput,
    plural, MIN_PER_DAY, dayOf, clockOf, gameDate, realDate, duration,
    h, append, clear, $, $$, svgIcon, deepClone,
  };
})(window.NT = window.NT || {});
