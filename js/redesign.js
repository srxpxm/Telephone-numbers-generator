/* Signal Atelier. Presentation only: no game state, RNG, prices, time or saves are changed here. */
(function (NT) {
  'use strict';
  const h = NT.util.h;
  const TITLES = {
    home: 'Генератор',
    shop: 'Магазин карт',
    collection: 'Коллекция',
    bank: 'Банк',
    stats: 'Статистика',
    achievements: 'Достижения',
    settings: 'Настройки',
  };
  const CLASS_IDS = ['bomzh', 'standard', 'business', 'platinum', 'limited'];
  let scene = null,
    queued = false,
    helpOpen = false,
    sceneKey = '';
  const chip =
    '<svg viewBox="0 0 54 44" fill="none" aria-hidden="true"><rect x="1" y="1" width="52" height="42" rx="9" fill="currentColor"/><path d="M19 1v12L11 20H1m34-19v12l8 7h10M19 43V31l-8-7H1m34 19V31l8-7h10M19 13h16v18H19V13Z" stroke="var(--chip-line, #667AA0)" stroke-width="1.2"/></svg>';

  function cardArt(classId, label, small) {
    const id = CLASS_IDS.indexOf(classId) === -1 ? 'standard' : classId;
    const art = h('div', {
      class: 'material-art c-' + id + (small ? ' material-small' : ''),
      'aria-hidden': 'true',
    });
    const face = h(
      'div',
      { class: 'physical-sim' },
      h('span', { class: 'sim-wordmark' }, 'n.'),
      h('span', { class: 'sim-brand' }, 'number tycoon'),
    );
    const contact = h('span', { class: 'sim-contact' });
    contact.innerHTML = chip;
    face.append(
      contact,
      h('span', { class: 'sim-series' }, label || 'Collector'),
      h('span', { class: 'sim-serial' }, '+000'),
    );
    art.append(h('span', { class: 'sim-shadow' }), h('div', { class: 'sim-back' }), face);
    return art;
  }

  function decorateHome(root) {
    const generator = root.querySelector('.generator');
    const stage = root.querySelector('.stage');
    const controls = h('div', { class: 'generator-controls' });
    const children = Array.from(generator.children).filter((n) => n !== stage);
    children.forEach((n) => controls.appendChild(n));
    generator.append(stage, controls);
    stage.prepend(
      h(
        'div',
        { class: 'stage-story', 'aria-hidden': 'true' },
        h('h2', null, 'Ценность —', h('br'), 'в сочетании.'),
        h('p', null, 'Откройте номер, который захочется оставить.'),
      ),
    );
    const visual = h(
      'div',
      { class: 'material-scene', 'aria-hidden': 'true' },
      cardArt('standard', 'Collector'),
    );
    stage.insertBefore(visual, stage.firstChild);
    const pause = h(
      'button',
      {
        type: 'button',
        class: 'scene-toggle',
        'aria-label': 'Остановить 3D-анимацию',
        'aria-pressed': 'false',
        title: 'Остановить 3D-анимацию',
      },
      h('span', { class: 'pause-symbol', 'aria-hidden': 'true' }),
    );
    stage.append(pause);
    const genTitle = generator.querySelector('.gen-top .card-title');
    if (genTitle) genTitle.textContent = 'Выберите карту';
    const footer = h('div', { class: 'home-footer' });
    ['Рынок', 'Последние операции'].forEach((label) => {
      const node = root.querySelector('.home-side [aria-label="' + label + '"]');
      if (node) footer.appendChild(node);
    });
    root.appendChild(footer);
    if (window.NTMaterialScene) {
      try {
        scene = new window.NTMaterialScene(visual, pause);
      } catch (e) {
        visual.classList.add('scene-fallback');
        pause.hidden = true;
      }
    } else pause.hidden = true;
  }

  function decorateBank(root) {
    root.querySelectorAll('.bank-grid > .card').forEach((card, i) => {
      card.classList.add(i === 0 ? 'deposit-card' : 'loan-card');
      const rules = card.querySelector('.rules');
      if (rules) {
        const details = h(
          'details',
          { class: 'bank-rules' },
          h('summary', null, i === 0 ? 'Условия вклада' : 'Условия кредита'),
        );
        rules.replaceWith(details);
        details.appendChild(rules);
      }
    });
  }

  Object.keys(NT.views).forEach((route) => {
    const originalMount = NT.views[route].mount;
    if (!originalMount) return;
    NT.views[route].mount = function (root) {
      originalMount.call(this, root);
      root.classList.add('atelier-view');
      if (route === 'home') decorateHome(root);
      if (route === 'bank') decorateBank(root);
    };
  });

  // Present a single x-axis caption for a single-day chart; underlying points and values remain unchanged.
  const originalLineChart = NT.ui.lineChart;
  NT.ui.lineChart = function (points, options) {
    const node = originalLineChart(points, options);
    const axes = Array.from(node.querySelectorAll('.axis-label'));
    const captions = new Map();
    axes.forEach((label) => {
      if (label.getAttribute('y') !== String(((options && options.height) || 220) - 8)) return;
      const key = label.getAttribute('x') + '|' + label.textContent;
      if (captions.has(key)) {
        captions.get(key).setAttribute('text-anchor', 'middle');
        label.remove();
      } else captions.set(key, label);
    });
    return node;
  };

  // A named group exposes the original digit groups as one accessible phone number.
  const originalNumberNode = NT.ui.numberNode;
  NT.ui.numberNode = function (body, cls) {
    const node = originalNumberNode(body, cls);
    node.setAttribute('role', 'group');
    return node;
  };

  // Fit exact monetary values, never abbreviate them or alter their underlying amounts.
  let numberFitCache = new WeakMap();
  function fitNumbers() {
    document
      .querySelectorAll('.tb-balance-value,.big-value,.stat-value,.kpi-value')
      .forEach((node) => {
        if (node.offsetParent === null || node.clientWidth < 1) return;
        const key = node.textContent + '|' + node.clientWidth + '|' + window.innerWidth;
        if (numberFitCache.get(node) === key && node.scrollWidth <= node.clientWidth + 1) return;
        node.style.removeProperty('font-size');
        let size = parseFloat(getComputedStyle(node).fontSize);
        for (let i = 0; i < 6 && node.scrollWidth > node.clientWidth + 1 && size > 14; i++) {
          size = Math.max(
            14,
            Math.floor(((size * Math.max(1, node.clientWidth - 1)) / node.scrollWidth) * 100) / 100,
          );
          node.style.fontSize = size + 'px';
        }
        numberFitCache.set(
          node,
          node.textContent + '|' + node.clientWidth + '|' + window.innerWidth,
        );
      });
  }

  const originalEmpty = NT.ui.empty;
  NT.ui.empty = function (title, text, action) {
    const node = originalEmpty(title, text, action);
    const mark = h(
      'div',
      { class: 'empty-symbol', 'aria-hidden': 'true' },
      NT.ui.icon('collection'),
    );
    node.prepend(mark);
    return node;
  };

  function decorateDynamic() {
    queued = false;
    document.querySelectorAll('.class-card:not([data-atelier])').forEach((node) => {
      node.dataset.atelier = 'true';
      const marker = h('span', { class: 'class-chip-art', 'aria-hidden': 'true' });
      marker.innerHTML = chip;
      node.prepend(marker);
    });
    document.querySelectorAll('.shop-card:not([data-atelier])').forEach((node) => {
      node.dataset.atelier = 'true';
      const id = CLASS_IDS.find((c) => node.classList.contains('c-' + c)) || 'standard';
      const title = node.querySelector('.shop-card-title');
      node.prepend(cardArt(id, title ? title.textContent : 'Collector'));
    });
    document.querySelectorAll('.result-intro:not([data-atelier])').forEach((node) => {
      node.dataset.atelier = 'true';
      const details = h(
        'details',
        { class: 'activation-help', open: helpOpen },
        h('summary', null, NT.ui.icon('info'), 'Как работает активация'),
      );
      const children = Array.from(node.children);
      children.forEach((n) => details.appendChild(n));
      details.addEventListener('toggle', () => {
        helpOpen = details.open;
      });
      node.appendChild(details);
    });
    document.querySelectorAll('.welcome:not([data-atelier])').forEach((node) => {
      node.dataset.atelier = 'true';
      const cover = h(
        'div',
        { class: 'welcome-cover', 'aria-hidden': 'true' },
        h(
          'div',
          { class: 'welcome-cover-copy' },
          h('strong', null, 'У каждого номера', h('br'), 'есть характер.'),
        ),
        cardArt('business', 'Collector'),
      );
      node.prepend(cover);
      const rules = node.querySelector('.welcome-list');
      if (rules) {
        const guide = h(
          'details',
          { class: 'welcome-guide', open: window.innerWidth > 600 },
          h('summary', { tabindex: '0' }, 'Как устроена игра'),
        );
        rules.replaceWith(guide);
        guide.appendChild(rules);
      }
    });
    const stage = document.querySelector('#view-home .stage');
    const selected = document.querySelector('.class-picker .class-card.active');
    if (stage && scene) {
      const id = selected
        ? CLASS_IDS.find((c) => selected.classList.contains('c-' + c)) || 'standard'
        : 'standard';
      const key = id + '|' + stage.className;
      if (key !== sceneKey) {
        sceneKey = key;
        scene.setState(id, stage.className);
        const fallback = stage.querySelector('.material-art');
        if (fallback) {
          CLASS_IDS.forEach((c) => fallback.classList.remove('c-' + c));
          fallback.classList.add('c-' + id);
        }
      }
    }
    document.querySelectorAll('.table-wrap,.tx-table-wrap').forEach((node) => {
      const scrollable = node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1;
      if (scrollable) {
        node.setAttribute('tabindex', '0');
        node.setAttribute('role', 'region');
        const heading = node.closest('.card,.modal')?.querySelector('h2,.modal-title');
        node.setAttribute(
          'aria-label',
          (heading ? heading.textContent : 'Таблица') + ': прокручиваемая таблица',
        );
      } else {
        node.removeAttribute('tabindex');
        node.removeAttribute('role');
        node.removeAttribute('aria-label');
      }
    });
    const route = NT.ui.route || 'home';
    const title = document.getElementById('context-title');
    if (title && title.textContent !== TITLES[route])
      title.textContent = TITLES[route] || 'Number Tycoon';
    document.body.dataset.route = route;
    fitNumbers();
  }
  function schedule() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(decorateDynamic);
    }
  }

  function initShell() {
    const nav = document.getElementById('primary-nav');
    const menu = document.getElementById('nav-more');
    const close = document.getElementById('nav-close');
    const scrim = document.getElementById('nav-scrim');
    const blocks = [
      document.querySelector('.topbar'),
      document.querySelector('.main'),
      document.getElementById('mobilebar'),
    ];
    let opened = false,
      previous = null;
    function setMenu(on, restore) {
      on = on && window.innerWidth <= 1000;
      if (on === opened) return;
      opened = on;
      if (on) previous = document.activeElement;
      document.body.classList.toggle('mobile-nav-open', on);
      menu.setAttribute('aria-expanded', String(on));
      scrim.hidden = !on;
      if (on) {
        nav.setAttribute('role', 'dialog');
        nav.setAttribute('aria-modal', 'true');
      } else {
        nav.removeAttribute('role');
        nav.removeAttribute('aria-modal');
      }
      blocks.forEach((n) => {
        if (n) n.inert = on;
      });
      if (on) {
        requestAnimationFrame(() => {
          if (opened) close.focus({ preventScroll: true });
        });
        setTimeout(() => {
          if (opened && !nav.contains(document.activeElement)) close.focus({ preventScroll: true });
        }, 260);
      } else if (restore !== false && previous && previous.isConnected)
        previous.focus({ preventScroll: true });
    }
    menu.addEventListener('click', () => setMenu(true));
    close.addEventListener('click', () => setMenu(false));
    scrim.addEventListener('click', () => setMenu(false));
    nav
      .querySelectorAll('a[data-route]')
      .forEach((a) => a.addEventListener('click', () => setMenu(false, false)));
    document.addEventListener('keydown', (e) => {
      if (!opened) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(false);
      }
      if (e.key === 'Tab') {
        const items = Array.from(nav.querySelectorAll('a,button')).filter(
          (n) => n.offsetParent !== null,
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1000) setMenu(false, false);
      numberFitCache = new WeakMap();
      schedule();
    });
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        numberFitCache = new WeakMap();
        schedule();
      });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) => r.type === 'childList' || (r.target.matches && r.target.matches('.stage')),
        )
      )
        schedule();
    });
    observer.observe(document.getElementById('app'), {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    observer.observe(document.getElementById('modal-root'), { subtree: true, childList: true });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initShell);
  else initShell();
})((window.NT = window.NT || {}));
