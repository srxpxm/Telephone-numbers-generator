/*
 * Общие компоненты интерфейса: иконки, уведомления, модальные окна, графики,
 * эффекты, звук и маршрутизатор. Пользовательские данные выводятся только через textContent.
 */
(function (NT) {
  'use strict';
  const U = NT.util;
  const C = NT.CONFIG;
  const h = U.h;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ================= Иконки (константы) ================= */
  const P = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  const ICONS = {
    home: P('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>'),
    shop: P('<path d="M5 8h14l-1.2 12.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
    collection: P('<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>'),
    bank: P('<path d="M3 9.5 12 4l9 5.5"/><path d="M4 21h16"/><path d="M6 11v7M10 11v7M14 11v7M18 11v7"/>'),
    stats: P('<path d="M3 20h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="5" width="3" height="13" rx="1"/><rect x="16" y="14" width="3" height="4" rx="1"/>'),
    achievements: P('<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 3.9M16 6h2.5a2.5 2.5 0 0 1-2.6 3.9"/><path d="M12 13v3.5"/><path d="M8.5 20.5h7l-.8-4h-5.4z"/>'),
    settings: P('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
    sim: P('<path d="M7 3h7.5L19 7.5V21H7z"/><rect x="9.5" y="11" width="7" height="7" rx="1.2"/><path d="M13 11v7M9.5 14.5h7"/>'),
    esim: P('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>'),
    spark: P('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
    warn: P('<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
    check: P('<path d="M5 12.5 10 17 19 7"/>'),
    info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.3"/>'),
    up: P('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>'),
    down: P('<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    minus: P('<path d="M5 12h14"/>'),
    skip: P('<path d="M4 6.5 11 12l-7 5.5zM12 6.5 19 12l-7 5.5z"/><path d="M20.5 6v12"/>'),
    coin: P('<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.9-2.7 2.1 0 2.9 5.6 1.5 5.6 4.3 0 1.3-1.2 2.2-2.9 2.2-1.2 0-2.2-.5-2.8-1.3M12 6.5V8M12 16.4V18"/>'),
    tag: P('<path d="M3 12.2V4h8.2L21 13.8 13.8 21z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
    download: P('<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>'),
    upload: P('<path d="M12 15.5V4.5M7 9l5-5 5 5"/><path d="M4.5 19.5h15"/>'),
    trash: P('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    sound: P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    lock: P('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    deposit: P('<path d="M4 7.5h16v11H4z"/><path d="M4 11h16"/><path d="M8 15h3"/><path d="M15 4l2 3.5M9 4 7 7.5"/>'),
    loan: P('<path d="M3 12h4l3-3h4l5 4-2 2-3-2"/><path d="M3 16h3l3 3 3-1 5-3"/>'),
    gift: P('<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12"/><path d="M12 8C10.5 4.5 7 4.5 7 6.5S10 8 12 8zM12 8c1.5-3.5 5-3.5 5-1.5S14 8 12 8z"/>'),
    flame: P('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.6-5.1 3.9-8.4 2 1.3 2.6 3.3 2.6 4.6 1.3-.7 2-2 2-3.3 2.6 2 4.5 4.6 4.5 7.1 0 3.5-2.6 6.1-6.5 6.1z"/>'),
    search: P('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
    chevron: P('<path d="M9 6l6 6-6 6"/>'),
    flask: P('<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5.5-9.5v-6"/><path d="M7.5 15h9"/>'),
    crown: P('<path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5L19 18H5z"/><path d="M5 21h14"/>'),
    gem: P('<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="M3 9h18M12 20 8.5 9 10.5 4M12 20l3.5-11-2-5"/>'),
    infinity: P('<path d="M12 12c-2-2.6-3.4-4-5.3-4a4 4 0 0 0 0 8c1.9 0 3.3-1.4 5.3-4zm0 0c2 2.6 3.4 4 5.3 4a4 4 0 0 0 0-8c-1.9 0-3.3 1.4-5.3 4z"/>'),
    repeat: P('<path d="M17 3l3 3-3 3"/><path d="M4 12v-1.5A4.5 4.5 0 0 1 8.5 6H20"/><path d="M7 21l-3-3 3-3"/><path d="M20 12v1.5a4.5 4.5 0 0 1-4.5 4.5H4"/>'),
    mirror: P('<path d="M12 3v18"/><path d="M9 7 4 12l5 5z"/><path d="M15 7l5 5-5 5z"/>'),
    swap: P('<path d="M4 8h15l-4-4"/><path d="M20 16H5l4 4"/>'),
    star: P('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
    pattern: P('<circle cx="12" cy="12" r="2.5"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5"/>'),
  };
  function icon(name, cls) {
    const m = ICONS[name];
    if (!m) return document.createTextNode('');
    const node = U.svgIcon(m, 'ico');
    if (cls) node.classList.add(cls);
    return node;
  }
  /** Значок из конфигурации: имя SVG-иконки или короткий текст (например «10», «£»). */
  function glyph(v) {
    if (v && ICONS[v]) return icon(v);
    return h('span', { class: 'glyph-text' }, String(v == null ? '' : v));
  }

  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ================= Форматирование и бейджи ================= */
  const R = () => NT.economy.RARITY;
  function rarityBadge(id, size) {
    const r = R()[id];
    return h('span', { class: 'badge rarity-badge r-' + id + (size ? ' badge-' + size : ''), title: r.ru }, r.name);
  }
  function classChip(classId) {
    const c = NT.economy.CLASS[classId];
    return h('span', { class: 'chip class-chip c-' + classId }, c.short);
  }
  function ffChip(ff) {
    return h('span', { class: 'chip ff-chip' }, icon(ff === 'esim' ? 'esim' : 'sim'), C.formFactors[ff].short);
  }
  function money(minor, cls) { return h('span', { class: 'mono money' + (cls ? ' ' + cls : '') }, U.gbp(minor)); }
  function delta(minor, short) {
    const cls = minor > 0 ? 'pos' : minor < 0 ? 'neg' : 'muted';
    return h('span', { class: 'mono ' + cls }, (minor > 0 ? '+' : '') + (short ? U.gbpShort(minor) : U.gbp(minor)));
  }
  /** Номер «+000 XX XXX XXXX» с группами цифр. */
  function numberNode(body, cls) {
    const el = h('span', { class: 'num' + (cls ? ' ' + cls : ''), 'aria-label': NT.gen.format(body) });
    el.appendChild(h('span', { class: 'num-prefix', 'aria-hidden': 'true' }, C.number.prefix));
    let i = 0;
    for (const len of C.number.groups) {
      el.appendChild(h('span', { class: 'num-group', 'aria-hidden': 'true' }, body.slice(i, i + len)));
      i += len;
    }
    return el;
  }
  function progress(value, max, cls, label) {
    const pct = max > 0 ? U.clamp(value / max, 0, 1) : 0;
    return h('div', { class: 'progress' + (cls ? ' ' + cls : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct * 100)), 'aria-label': label || null },
      h('div', { class: 'progress-bar', style: { width: (pct * 100).toFixed(2) + '%' } }));
  }
  function section(title, opts) {
    const o = opts || {};
    const head = h('div', { class: 'card-head' },
      h('div', { class: 'card-titles' }, h(o.level || 'h2', { class: 'card-title' }, o.icon ? icon(o.icon) : null, title), o.sub ? h('p', { class: 'card-sub' }, o.sub) : null),
      o.aside || null);
    return h('section', { class: 'card' + (o.cls ? ' ' + o.cls : ''), 'aria-label': title }, head);
  }
  function empty(title, text, action) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, title), text ? h('p', { class: 'empty-text' }, text) : null, action || null);
  }
  /** Группа переключателей (aria-pressed). */
  function segmented(options, value, onChange, label, cls) {
    const wrap = h('div', { class: 'segmented' + (cls ? ' ' + cls : ''), role: 'group', 'aria-label': label });
    options.forEach((o) => {
      wrap.appendChild(h('button', {
        type: 'button', class: 'seg' + (o.value === value ? ' active' : ''), 'aria-pressed': o.value === value ? 'true' : 'false',
        'data-fk': 'seg-' + label + '-' + o.value, disabled: o.disabled, title: o.title || null,
        onclick: () => { if (o.value !== value) onChange(o.value); },
      }, o.icon ? icon(o.icon) : null, h('span', null, o.label)));
    });
    return wrap;
  }
  function toggle(checked, onChange, label, opts) {
    const o = opts || {};
    const id = o.id || ('tg-' + Math.random().toString(36).slice(2, 9));
    const input = h('input', { type: 'checkbox', id, role: 'switch', checked, disabled: o.disabled, 'data-fk': o.fk || id, 'aria-describedby': o.describedBy || null });
    input.addEventListener('change', () => onChange(input.checked, input));
    return h('label', { class: 'switch' + (o.cls ? ' ' + o.cls : ''), for: id }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })), h('span', { class: 'switch-label' }, label));
  }
  /** Сохраняет фокус на элементе с тем же data-fk после перерисовки. */
  function preserveFocus(container, fn) {
    const act = document.activeElement;
    const key = act && container.contains(act) && act.getAttribute ? act.getAttribute('data-fk') : null;
    fn();
    if (key) {
      const el = container.querySelector('[data-fk="' + key.replace(/"/g, '') + '"]');
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  /* ================= Уведомления ================= */
  const TONE_ICON = { success: 'check', sale: 'coin', danger: 'warn', warn: 'warn', bank: 'bank', market: 'spark', offer: 'tag', quest: 'check', achievement: 'achievements', day: 'clock', info: 'info' };
  let lastToast = { text: '', at: 0 };
  function toast(text, tone, opts) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const now = Date.now();
    if (text === lastToast.text && now - lastToast.at < 1200) return;
    lastToast = { text, at: now };
    const t = tone || 'info';
    const o = opts || {};
    const el = h('div', { class: 'toast toast-' + t },
      h('span', { class: 'toast-ico' }, o.glyph ? (ICONS[o.glyph] ? icon(o.glyph) : h('span', { class: 'toast-glyph' }, o.glyph)) : icon(TONE_ICON[t] || 'info')),
      h('div', { class: 'toast-text' }, text));
    const close = h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Закрыть уведомление' }, icon('close'));
    el.appendChild(close);
    let gone = false;
    const dismiss = () => {
      if (gone) return; gone = true;
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), reducedMotion() ? 0 : 220);
    };
    close.addEventListener('click', dismiss);
    root.appendChild(el);
    // На узких экранах держим не больше двух уведомлений, чтобы они не закрывали игру.
    const max = window.matchMedia && window.matchMedia('(max-width: 760px)').matches ? 2 : 4;
    while (root.children.length > max) root.firstChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(dismiss, o.duration || (t === 'danger' ? 7000 : 4200));
  }

  /* ================= Модальные окна ================= */
  let modalDepth = 0;
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function setAppInert(on) {
    const app = document.getElementById('app');
    if (!app) return;
    if ('inert' in app) app.inert = on; else app.setAttribute('aria-hidden', on ? 'true' : 'false');
  }

  /**
   * Универсальное модальное окно. actions: [{ label, value, tone, disabled }]
   * onAction(value, api) → вернуть false, чтобы не закрывать окно (например, при ошибке ввода).
   */
  function modal(opts) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const titleId = 'mt-' + Math.random().toString(36).slice(2, 9);
      const dismissible = opts.dismissible !== false;
      const overlay = h('div', { class: 'modal-overlay' });
      const dialog = h('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : ''), role: opts.alert ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
      const head = h('div', { class: 'modal-head' }, h('h2', { id: titleId, class: 'modal-title' }, opts.icon ? icon(opts.icon) : null, opts.title));
      if (dismissible) head.appendChild(h('button', { type: 'button', class: 'icon-btn modal-x', 'aria-label': 'Закрыть', onclick: () => close(null) }, icon('close')));
      const body = h('div', { class: 'modal-body' });
      if (typeof opts.body === 'string') body.appendChild(h('p', null, opts.body)); else if (opts.body) U.append(body, opts.body);
      const foot = h('div', { class: 'modal-foot' });
      const api = {
        close: (v) => close(v), body, dialog,
        setError(msg) { let e = body.querySelector('.form-error'); if (!e) { e = h('p', { class: 'form-error', role: 'alert' }); body.appendChild(e); } e.textContent = msg || ''; e.hidden = !msg; },
      };
      (opts.actions || [{ label: 'Понятно', value: true, tone: 'primary' }]).forEach((a) => {
        const b = h('button', { type: 'button', class: 'btn ' + (a.tone === 'primary' ? 'btn-primary' : a.tone === 'danger' ? 'btn-danger' : 'btn-ghost'), disabled: a.disabled },
          a.label);
        b.addEventListener('click', () => {
          if (opts.onAction && opts.onAction(a.value, api) === false) return;
          close(a.value);
        });
        if (a.autofocus) b.setAttribute('data-autofocus', '');
        foot.appendChild(b);
      });
      dialog.append(head, body, foot);
      overlay.appendChild(dialog);
      let closed = false;
      function close(value) {
        if (closed) return; closed = true;
        overlay.classList.remove('in');
        modalDepth = Math.max(0, modalDepth - 1);
        if (!modalDepth) { setAppInert(false); document.body.classList.remove('modal-open'); }
        setTimeout(() => overlay.remove(), reducedMotion() ? 0 : 160);
        if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true });
        resolve(value);
      }
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && dismissible) close(null); });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(null); return; }
        if (e.key === 'Enter' && opts.submitValue !== undefined && e.target.tagName === 'INPUT') {
          e.preventDefault();
          if (opts.onAction && opts.onAction(opts.submitValue, api) === false) return;
          close(opts.submitValue);
          return;
        }
        if (e.key !== 'Tab') return;
        const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === document.activeElement);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      (document.getElementById('modal-root') || document.body).appendChild(overlay);
      modalDepth += 1;
      setAppInert(true);
      document.body.classList.add('modal-open');
      requestAnimationFrame(() => overlay.classList.add('in'));
      const target = dialog.querySelector('[data-autofocus]') || dialog.querySelector('input, select, textarea') || foot.querySelector('.btn-primary, .btn-danger') || dialog.querySelector(FOCUSABLE);
      if (target) setTimeout(() => target.focus({ preventScroll: true }), 30);
      if (opts.onOpen) opts.onOpen(api);
    });
  }

  function confirm(o) {
    return modal({
      title: o.title, icon: o.icon, cls: o.cls, alert: !!o.danger, body: o.body || o.text,
      actions: [
        // Для опасных действий фокус по умолчанию на безопасной кнопке.
        { label: o.cancelLabel || 'Отмена', value: false, tone: 'ghost', autofocus: !!o.danger },
        { label: o.confirmLabel || 'Подтвердить', value: true, tone: o.danger ? 'danger' : 'primary' },
      ],
    }).then((v) => v === true);
  }

  function promptModal(o) {
    const id = 'pi-' + Math.random().toString(36).slice(2, 9);
    const input = h('input', { id, class: 'input', type: o.type || 'text', value: o.value || '', maxlength: o.maxLength || null, inputmode: o.inputmode || null, autocomplete: 'off', placeholder: o.placeholder || null });
    const body = h('div', { class: 'form-stack' }, o.text ? h('p', null, o.text) : null, h('label', { class: 'field-label', for: id }, o.label), input, o.hint ? h('p', { class: 'hint' }, o.hint) : null);
    let result = null;
    return modal({
      title: o.title, icon: o.icon, body, submitValue: 'ok',
      actions: [{ label: 'Отмена', value: null, tone: 'ghost' }, { label: o.okLabel || 'Сохранить', value: 'ok', tone: 'primary' }],
      onAction(v, api) {
        if (v !== 'ok') return true;
        const err = o.validate ? o.validate(input.value) : null;
        if (err) { api.setError(err); input.focus(); return false; }
        result = input.value;
        return true;
      },
    }).then((v) => (v === 'ok' ? result : null));
  }

  /* ================= Графики (SVG через createElementNS) ================= */
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k of Object.keys(attrs)) el.setAttribute(k, String(attrs[k]));
    return el;
  }
  function sparkline(values, opts) {
    const o = opts || {};
    const W = o.width || 160, H = o.height || 40;
    const el = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sparkline', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    if (!values || values.length < 2) return el;
    const min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    el.appendChild(svg('path', { d: d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', class: 'spark-area' }));
    el.appendChild(svg('path', { d, class: 'spark-line', 'vector-effect': 'non-scaling-stroke' }));
    return el;
  }

  /** Линейный график с осями. points: [{x, y}], formatY — подписи оси Y. */
  function lineChart(points, opts) {
    const o = opts || {};
    const W = Math.max(280, Math.round(o.width || 600)), H = o.height || 220;
    const pad = { l: 64, r: 14, t: 14, b: 28 };
    const el = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'line-chart', role: 'img', 'aria-label': o.label || 'График' });
    if (!points.length) return el;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    let minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    if (o.baseline != null) { minY = Math.min(minY, o.baseline); maxY = Math.max(maxY, o.baseline); }
    if (minY === maxY) { minY -= Math.abs(minY) * 0.1 || 1; maxY += Math.abs(maxY) * 0.1 || 1; }
    const padY = (maxY - minY) * 0.08; minY -= padY; maxY += padY;
    // Отступ слева подбирается по самой длинной подписи оси, чтобы она не обрезалась.
    const fmtY = (v) => (o.formatY ? o.formatY(v) : String(Math.round(v)));
    const yLabels = [0, 1, 2, 3].map((i) => fmtY(minY + ((maxY - minY) * i) / 3));
    pad.l = Math.max(40, Math.ceil(Math.max.apply(null, yLabels.map((t) => t.length)) * 6.8) + 14);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const sx = (x) => pad.l + (maxX === minX ? (W - pad.l - pad.r) / 2 : ((x - minX) / (maxX - minX)) * (W - pad.l - pad.r));
    const sy = (y) => pad.t + (1 - (y - minY) / (maxY - minY)) * (H - pad.t - pad.b);
    for (let i = 0; i <= 3; i++) {
      const v = minY + ((maxY - minY) * i) / 3;
      const y = sy(v);
      el.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid-line' }));
      const t = svg('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
      t.textContent = yLabels[i];
      el.appendChild(t);
    }
    if (o.baseline != null) el.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: sy(o.baseline), y2: sy(o.baseline), class: 'base-line' }));
    const xl = [minX, maxX];
    if (maxX - minX > 4) xl.splice(1, 0, Math.round((minX + maxX) / 2));
    xl.forEach((x, i) => {
      const t = svg('text', { x: sx(x), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle', class: 'axis-label' });
      t.textContent = (o.formatX ? o.formatX(x) : String(x));
      el.appendChild(t);
    });
    const d = points.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
    const gid = 'lg-' + Math.random().toString(36).slice(2, 8);
    const defs = svg('defs');
    const grad = svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svg('stop', { offset: '0%', 'stop-color': o.color || '#f5c451', 'stop-opacity': 0.28 }));
    grad.appendChild(svg('stop', { offset: '100%', 'stop-color': o.color || '#f5c451', 'stop-opacity': 0 }));
    defs.appendChild(grad); el.appendChild(defs);
    if (points.length > 1) {
      el.appendChild(svg('path', { d: d + ' L' + sx(maxX).toFixed(1) + ' ' + (H - pad.b) + ' L' + sx(minX).toFixed(1) + ' ' + (H - pad.b) + ' Z', fill: 'url(#' + gid + ')' }));
    }
    el.appendChild(svg('path', { d, class: 'chart-line', stroke: o.color || '#f5c451' }));
    const last = points[points.length - 1];
    el.appendChild(svg('circle', { cx: sx(last.x), cy: sy(last.y), r: 4, class: 'chart-dot', fill: o.color || '#f5c451' }));
    return el;
  }

  /* ================= Эффекты ================= */
  const RARITY_COLORS = {
    common: ['#9aa3ad', '#c9ced6'], uncommon: ['#5bd68a', '#a6f0c3'], rare: ['#4ea8ff', '#9fd0ff'],
    epic: ['#b483ff', '#d9c2ff'], legendary: ['#ffb547', '#ffe08a', '#fff3c4'], mythic: ['#ff6ad5', '#ffd36a', '#6af0ff', '#ffffff'],
  };
  function confetti(rarity, intensity) {
    if (reducedMotion()) return;
    const colors = RARITY_COLORS[rarity] || RARITY_COLORS.rare;
    const canvas = h('canvas', { class: 'fx-canvas', 'aria-hidden': 'true' });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }
    ctx.scale(dpr, dpr);
    const n = Math.round((intensity || 1) * (rarity === 'mythic' ? 220 : rarity === 'legendary' ? 150 : 70));
    const cx = W / 2, cy = Math.min(H * 0.42, 360);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * (rarity === 'mythic' ? 11 : 8);
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, s: 2 + Math.random() * 4, c: colors[i % colors.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, life: 1 });
    }
    const start = performance.now();
    const dur = rarity === 'mythic' ? 2600 : 1900;
    function frame(t) {
      const k = (t - start) / dur;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.16; p.vx *= 0.99; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = p.c;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6); ctx.restore();
      }
      if (k < 1) requestAnimationFrame(frame); else canvas.remove();
    }
    requestAnimationFrame(frame);
  }
  function flash(rarity) {
    if (reducedMotion()) return;
    const el = h('div', { class: 'fx-flash fx-' + rarity, 'aria-hidden': 'true' });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /* ================= Звук (WebAudio, синтез без файлов) ================= */
  let audio = null;
  function soundOn() { return !!(NT.game.state && NT.game.state.settings.sound); }
  function ensureAudio() {
    if (audio) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { audio = new AC(); } catch (e) { audio = null; }
    return audio;
  }
  function tone(freq, start, dur, type, vol) {
    const ctx = audio;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const SOUNDS = {
    tick: () => tone(1400, 0, 0.025, 'square', 0.012),
    lock: () => tone(740, 0, 0.08, 'triangle', 0.05),
    buy: () => { tone(520, 0, 0.07, 'triangle', 0.04); tone(780, 0.06, 0.08, 'triangle', 0.04); },
    coin: () => { tone(988, 0, 0.08, 'square', 0.025); tone(1319, 0.07, 0.16, 'square', 0.025); },
    error: () => tone(180, 0, 0.18, 'sawtooth', 0.03),
    common: () => tone(440, 0, 0.18, 'sine', 0.05),
    uncommon: () => { tone(523, 0, 0.14, 'sine', 0.05); tone(659, 0.08, 0.2, 'sine', 0.05); },
    rare: () => { tone(523, 0, 0.12, 'triangle', 0.05); tone(784, 0.08, 0.25, 'triangle', 0.05); },
    epic: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.3, 'triangle', 0.045)),
    legendary: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.45, 'triangle', 0.05)),
    mythic: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, i * 0.08, 0.6, 'sine', 0.05); tone(f * 1.5, i * 0.08 + 0.04, 0.5, 'triangle', 0.02); }),
    achievement: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.04)),
  };
  function sound(name) {
    if (!soundOn() || !SOUNDS[name]) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try { if (ctx.state === 'suspended') ctx.resume(); SOUNDS[name](); } catch (e) { /* звук не критичен */ }
  }

  /* ================= Маршрутизатор ================= */
  const ROUTES = ['home', 'shop', 'collection', 'bank', 'stats', 'achievements', 'settings'];
  const TITLES = { home: 'Главная', shop: 'Магазин карт', collection: 'Коллекция', bank: 'Банк', stats: 'Статистика', achievements: 'Достижения', settings: 'Настройки' };
  let current = null;
  function routeFromHash() {
    let r = '';
    try { r = (window.location.hash || '').replace(/^#\/?/, ''); } catch (e) { r = ''; }
    return ROUTES.indexOf(r) !== -1 ? r : null;
  }
  function show(route, focus) {
    if (ROUTES.indexOf(route) === -1) route = 'home';
    const prev = current;
    current = route;
    ROUTES.forEach((r) => {
      const sec = document.getElementById('view-' + r);
      if (sec) sec.hidden = r !== route;
    });
    U.$$('[data-route]').forEach((a) => {
      if (a.getAttribute('data-route') === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = TITLES[route] + ' · NUMBER TYCOON';
    if (prev && NT.views[prev] && NT.views[prev].onHide && prev !== route) NT.views[prev].onHide();
    if (NT.views[route] && NT.views[route].onShow) NT.views[route].onShow();
    if (prev !== route) window.scrollTo(0, 0);
    if (focus) {
      const head = document.querySelector('#view-' + route + ' h1');
      if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
    }
  }
  function go(route) {
    if (ROUTES.indexOf(route) === -1) return;
    try { if (window.location.hash !== '#' + route) window.history.pushState(null, '', '#' + route); } catch (e) { /* например, в песочнице */ }
    show(route, true);
  }
  function initRouter() {
    const onHash = () => { const r = routeFromHash(); if (r && r !== current) show(r, true); };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    document.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('a[data-route]') : null;
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go(a.getAttribute('data-route'));
    });
    show(routeFromHash() || 'home', false);
  }

  /** Заголовок страницы с подзаголовком и необязательной правой частью. */
  function pageHead(title, sub, aside) {
    return h('header', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null), aside || null);
  }

  NT.views = NT.views || {};
  NT.ui = {
    ICONS, icon, glyph, reducedMotion, rarityBadge, classChip, ffChip, money, delta, numberNode, progress, section, empty,
    segmented, toggle, preserveFocus, toast, modal, confirm, prompt: promptModal, svg, sparkline, lineChart,
    confetti, flash, sound, ensureAudio, ROUTES, TITLES, go, show, initRouter, pageHead, get route() { return current; },
  };
})(window.NT = window.NT || {});
