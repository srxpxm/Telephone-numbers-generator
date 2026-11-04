/* Collection Vault: a scoped, read-only presentation adapter for the original collection view. */
(function (NT) {
  'use strict';
  const h = NT.util.h,
    U = NT.util;
  const view = NT.views.collection;
  const original = {
    mount: view.mount,
    update: view.update,
    onShow: view.onShow,
    onHide: view.onHide,
  };
  let vault = null;
  const PATHS = {
    left: 'M14 5l-7 7 7 7',
    right: 'M10 5l7 7-7 7',
    expand: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
    pause: 'M9 5v14M15 5v14',
    play: 'M8 5l11 7-11 7V5Z',
    sliders: 'M4 7h4m4 0h8M4 17h8m4 0h4M8 4v6m8 4v6',
    rotate: 'M4 10a8 8 0 1 1 2 8M4 4v6h6',
    gem: 'M3 9l4-5h10l4 5-9 12L3 9Zm0 0h18M7 4l5 17 5-17',
    copy: 'M8 8h12v12H8V8ZM4 16H3V3h13v1',
    check: 'M5 12l4 4L19 6',
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    [
      ['viewBox', '0 0 24 24'],
      ['fill', 'none'],
      ['stroke', 'currentColor'],
      ['stroke-width', '1.6'],
      ['stroke-linecap', 'round'],
      ['stroke-linejoin', 'round'],
      ['aria-hidden', 'true'],
      ['class', 'vault-icon'],
    ].forEach(([k, v]) => svg.setAttribute(k, v));
    const p = document.createElementNS(svg.namespaceURI, 'path');
    p.setAttribute('d', PATHS[name] || PATHS.gem);
    svg.appendChild(p);
    return svg;
  }
  function chip() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 54 44');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'vault-contact');
    s.innerHTML =
      '<rect x="1" y="1" width="52" height="42" rx="8" fill="currentColor"/><path d="M19 1v12L11 20H1m34-19v12l8 7h10M19 43V31l-8-7H1m34 19V31l8-7h10M19 13h16v18H19V13Z" fill="none" stroke="var(--vault-chip-line,#665e64)" stroke-width="1.2"/>';
    return s;
  }
  function button(label, name, cls, fn) {
    return h(
      'button',
      {
        type: 'button',
        class: cls || 'vault-icon-button',
        'aria-label': label,
        title: label,
        onclick: fn,
      },
      icon(name),
    );
  }
  function rarity(n) {
    return NT.economy.RARITY[n ? n.rarity : 'mythic'];
  }
  function staticCard(n) {
    const card = h(
      'div',
      {
        class: 'vault-static-card vault-finish-' + (n ? n.rarity : 'mythic'),
        'aria-hidden': 'true',
      },
      h('span', { class: 'vault-static-brand' }, 'n.', h('span', null, 'number tycoon')),
      chip(),
      h(
        'span',
        { class: 'vault-static-number' },
        n ? NT.ui.numberNode(n.body) : h('span', null, '+000', h('br'), '—  ———  ————'),
      ),
      h(
        'span',
        { class: 'vault-static-foot' },
        n ? n.id : 'Личное хранилище',
        h('span', null, n ? rarity(n).name : 'Коллекция'),
      ),
    );
    return card;
  }
  class Vault {
    constructor(root) {
      this.root = root;
      this.selectedId = null;
      this.items = [];
      this.active = false;
      this.userPaused = false;
      this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.scene = null;
      this.viewer = null;
      this.build();
      this.setupFilters();
      this.setupGrid();
      this.motion.addEventListener('change', () => this.syncMotion());
      this.observer = new MutationObserver(() => this.refresh());
      this.observer.observe(this.grid, { childList: true });
      this.syncMotion();
    }
    get paused() {
      return this.userPaused || this.motion.matches;
    }
    build() {
      const head = this.root.querySelector('.page-head');
      const sub = head && head.querySelector('.page-sub');
      if (sub) sub.textContent = 'Личное хранилище ваших лучших сочетаний.';
      this.title = h('h2', { class: 'vault-title' });
      this.badge = h('span', { class: 'vault-rarity' });
      this.phone = h('div', { class: 'vault-phone' });
      this.description = h('p', { class: 'vault-description' });
      this.price = h('strong', { class: 'vault-price mono' });
      this.valuation = h(
        'div',
        { class: 'vault-valuation' },
        h('span', null, 'Рыночная стоимость'),
        this.price,
      );
      this.meta = h('p', { class: 'vault-meta' });
      this.inspect = h(
        'button',
        { type: 'button', class: 'vault-primary', onclick: () => this.openViewer(this.selected()) },
        icon('expand'),
        'Рассмотреть',
      );
      this.start = h(
        'a',
        { href: '#home', 'data-route': 'home', class: 'vault-primary', hidden: true },
        'Найти первый номер',
        icon('right'),
      );
      this.copy = button('Скопировать номер', 'copy', 'vault-secondary vault-copy-button', () =>
        this.copyNumber(),
      );
      this.copy.append(h('span', null, 'Скопировать'));
      this.copyStatus = h('span', {
        class: 'vault-sr-only',
        role: 'status',
        'aria-live': 'polite',
      });
      this.fallback = h('div', { class: 'vault-fallback' }, staticCard(null));
      this.host = h(
        'div',
        {
          class: 'vault-model-host',
          tabindex: '0',
          role: 'group',
          'aria-label':
            '3D-экземпляр. Перетащите для поворота или используйте стрелки. Home — исходный вид.',
        },
        this.fallback,
      );
      this.pause = button('Остановить движение', 'pause', 'vault-icon-button vault-pause', () => {
        this.userPaused = !this.userPaused;
        this.syncMotion();
      });
      this.counter = h('span', {
        class: 'vault-counter mono',
        'aria-live': 'polite',
        'aria-atomic': 'true',
      });
      this.previous = button('Предыдущий номер в витрине', 'left', '', () => this.step(-1));
      this.next = button('Следующий номер в витрине', 'right', '', () => this.step(1));
      this.switcher = h(
        'div',
        { class: 'vault-switcher', role: 'group', 'aria-label': 'Экземпляры в витрине' },
        this.previous,
        this.counter,
        this.next,
      );
      this.gesture = h('span', { class: 'vault-gesture' }, 'Потяните для поворота');
      const stage = h(
        'div',
        { class: 'vault-stage' },
        h('div', { class: 'vault-floor', 'aria-hidden': 'true' }),
        this.host,
        this.pause,
        this.gesture,
        this.switcher,
      );
      this.hero = h(
        'section',
        { class: 'collection-vault vault-finish-mythic', 'aria-label': 'Витрина коллекции' },
        h(
          'div',
          { class: 'vault-copy' },
          this.title,
          this.badge,
          this.phone,
          this.description,
          this.valuation,
          this.meta,
          h('div', { class: 'vault-actions' }, this.inspect, this.start, this.copy),
          this.copyStatus,
        ),
        stage,
      );
      const summary = this.root.querySelector('.coll-summary');
      summary.before(this.hero);
    }
    setupFilters() {
      const toolbar = this.root.querySelector('.toolbar-card');
      toolbar.id = 'collection-advanced-filters';
      toolbar.hidden = true;
      toolbar.classList.add('vault-advanced');
      const search = toolbar.querySelector('.field-search');
      const searchInput = search.querySelector('input');
      searchInput.placeholder = 'Найти сочетание цифр…';
      this.filterToggle = h(
        'button',
        {
          type: 'button',
          class: 'btn vault-filter-toggle',
          'aria-expanded': 'false',
          'aria-controls': toolbar.id,
          onclick: () => {
            toolbar.hidden = !toolbar.hidden;
            this.filterToggle.setAttribute('aria-expanded', String(!toolbar.hidden));
          },
        },
        icon('sliders'),
        h('span', null, 'Фильтры'),
      );
      this.filterCount = h('span', { class: 'vault-filter-count mono', hidden: true });
      this.filterToggle.append(this.filterCount);
      this.quickReset = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost vault-quick-reset',
          hidden: true,
          onclick: () => toolbar.querySelector('.reset-filters').click(),
        },
        'Сбросить',
      );
      this.command = h(
        'div',
        { class: 'vault-commandbar' },
        search,
        this.quickReset,
        this.filterToggle,
      );
      this.chips = this.root.querySelector('.rarity-chips');
      this.chips.before(this.command);
      this.chips.classList.add('vault-rarity-tabs');
      this.grid = this.root.querySelector('.ncard-grid');
      this.grid.id = 'collection-numbers';
      const result = this.root.querySelector('.result-info');
      this.listTitle = h('h2', { class: 'vault-list-title' }, 'Все номера');
      const listHead = h('div', { class: 'vault-list-head' }, this.listTitle);
      result.before(listHead);
      listHead.append(result);
    }
    setupGrid() {
      this.focusedTicket = null;
      this.grid.addEventListener('focusin', (e) => {
        const t = e.target.closest('.vault-ticket');
        this.focusedTicket = t ? t.dataset.numberId : null;
      });
      this.grid.addEventListener('click', (e) => {
        const t = e.target.closest('.vault-ticket');
        if (t) this.openViewer(NT.game.findNumber(t.dataset.numberId));
      });
      let active = null,
        queued = 0,
        point = null;
      const reset = () => {
        if (active) {
          active.style.removeProperty('--tilt-x');
          active.style.removeProperty('--tilt-y');
          active.style.removeProperty('--light-x');
          active.style.removeProperty('--light-y');
          active.classList.remove('is-tilting');
        }
        active = null;
      };
      this.resetTilt = reset;
      this.grid.addEventListener(
        'pointermove',
        (e) => {
          if (e.pointerType === 'touch' || this.paused) return;
          const ticket = e.target.closest('.vault-ticket');
          if (ticket !== active) {
            reset();
            active = ticket;
          }
          if (!active) return;
          point = { x: e.clientX, y: e.clientY };
          if (queued) return;
          queued = requestAnimationFrame(() => {
            queued = 0;
            if (!active || !active.isConnected || !point) return;
            const r = active.getBoundingClientRect(),
              x = (point.x - r.left) / r.width,
              y = (point.y - r.top) / r.height;
            active.style.setProperty('--tilt-x', ((0.5 - y) * 9).toFixed(2) + 'deg');
            active.style.setProperty('--tilt-y', ((x - 0.5) * 11).toFixed(2) + 'deg');
            active.style.setProperty('--light-x', (x * 100).toFixed(1) + '%');
            active.style.setProperty('--light-y', (y * 100).toFixed(1) + '%');
            active.classList.add('is-tilting');
          });
        },
        { passive: true },
      );
      this.grid.addEventListener('pointerleave', reset);
      document.addEventListener('focusin', (e) => {
        if (!this.grid.contains(e.target) && !e.target.closest('.vault-viewer'))
          this.focusedTicket = null;
      });
    }
    selected() {
      return this.items.find((n) => n.id === this.selectedId) || this.items[0] || null;
    }
    refresh() {
      if (!NT.game.state) return;
      const state = NT.game.state;
      this.root.classList.toggle('vault-is-empty', state.collection.length === 0);
      if (this.viewerApi && this.viewerItemId) {
        const current = NT.game.findNumber(this.viewerItemId);
        if (!current) this.viewerApi.close(null);
        else if (this.viewerPrice)
          this.viewerPrice.textContent = U.gbp(NT.game.currentValue(current));
      }
      this.items = state.collection
        .slice()
        .sort(
          (a, b) =>
            NT.gen.rarityIndex(b.rarity) - NT.gen.rarityIndex(a.rarity) ||
            b.score - a.score ||
            NT.game.currentValue(b) - NT.game.currentValue(a),
        );
      const item = this.selected();
      this.selectedId = item ? item.id : null;
      const key = item
        ? item.id + '|' + item.body + '|' + item.rarity + '|' + item.status
        : 'empty';
      if (key !== this.itemKey) {
        this.itemKey = key;
        this.hero.className = 'collection-vault vault-finish-' + (item ? item.rarity : 'mythic');
        this.title.textContent = item ? 'Ваш особый экземпляр' : 'Редким номерам — особое место.';
        this.badge.hidden = !item;
        U.clear(this.badge);
        if (item)
          this.badge.append(icon('gem'), rarity(item).name, h('span', null, rarity(item).ru));
        this.phone.hidden = !item;
        U.clear(this.phone);
        if (item) this.phone.append(NT.ui.numberNode(item.body));
        this.description.textContent = item
          ? NT.gen.analyze(item.body).primaryLabel
          : 'Оставьте первый номер в коллекции. Его место в витрине уже готово.';
        this.valuation.hidden = !item;
        this.meta.hidden = !item;
        this.meta.textContent = item
          ? NT.economy.CLASS[item.classId].name + ' · Красота ' + item.score + '/100'
          : '';
        this.inspect.hidden = !item;
        this.copy.hidden = !item;
        this.start.hidden = !!item;
        U.clear(this.fallback).append(staticCard(item));
        if (this.scene) this.scene.setItem(item, item ? rarity(item).name : '');
      }
      if (item) {
        const value = U.gbp(NT.game.currentValue(item));
        if (this.price.textContent !== value) this.price.textContent = value;
      }
      const index = item ? this.items.indexOf(item) + 1 : 0;
      const counter =
        String(index).padStart(2, '0') + ' / ' + String(this.items.length).padStart(2, '0');
      if (this.counter.textContent !== counter) this.counter.textContent = counter;
      this.switcher.hidden = this.items.length < 2;
      this.previous.disabled = this.next.disabled = this.items.length < 2;
      this.enhanceCards();
      const count = Array.from(this.root.querySelectorAll('.vault-advanced select')).filter(
        (el) => el.value !== 'all' && el.value !== 'date_desc',
      ).length;
      this.filterCount.hidden = !count;
      this.filterCount.textContent = count;
      this.quickReset.hidden = !count && !this.root.querySelector('#coll-search').value;
      this.listTitle.textContent =
        count ||
        this.chips.querySelector('.active') ||
        this.root.querySelector('#coll-search').value
          ? 'Найденные номера'
          : 'Все номера';
      if (
        this.focusedTicket &&
        document.activeElement === document.body &&
        this.active &&
        !this.viewerApi
      ) {
        const t = Array.from(this.grid.querySelectorAll('.vault-ticket')).find(
          (el) => el.dataset.numberId === this.focusedTicket,
        );
        if (t) t.focus({ preventScroll: true });
      }
    }
    enhanceCards() {
      const numbers = new Map(NT.game.state.collection.map((n) => [n.id, n]));
      this.grid.querySelectorAll('.ncard:not([data-vault])').forEach((card) => {
        const idNode = card.querySelector('.ncard-foot .mono'),
          n = idNode && numbers.get(idNode.textContent);
        if (!n) return;
        card.dataset.vault = 'true';
        card.dataset.numberId = n.id;
        const oldNumber = card.querySelector('.ncard-number'),
          num = oldNumber.querySelector('.num');
        const ticket = h(
          'button',
          {
            type: 'button',
            class: 'vault-ticket vault-finish-' + n.rarity,
            'data-number-id': n.id,
            'data-fk': 'inspect-' + n.id,
            'aria-label': 'Рассмотреть номер ' + NT.gen.format(n.body) + ' в 3D',
          },
          h(
            'span',
            { class: 'vault-ticket-brand', 'aria-hidden': 'true' },
            'n.',
            h('span', null, 'number tycoon'),
          ),
          chip(),
          h('span', { class: 'ncard-number' }, num),
          h(
            'span',
            { class: 'vault-ticket-footer', 'aria-hidden': 'true' },
            n.id,
            h('span', null, icon('expand'), 'Рассмотреть'),
          ),
        );
        oldNumber.replaceWith(ticket);
      });
    }
    ensureScene() {
      if (this.scene || !window.NTCollectionScene) return;
      this.scene = new window.NTCollectionScene(this.host, {
        paused: this.paused,
        onAvailable: (ready) => {
          this.pause.hidden = !ready;
          this.gesture.textContent = ready ? 'Потяните для поворота' : 'Статичный вид';
          this.host.tabIndex = ready ? 0 : -1;
        },
      });
      const item = this.selected();
      this.scene.setItem(item, item ? rarity(item).name : '');
    }
    show() {
      this.active = true;
      this.refresh();
      this.ensureScene();
      if (this.scene) {
        this.scene.setActive(!this.viewer);
        this.scene.reveal();
      }
    }
    hide() {
      this.active = false;
      if (this.scene) this.scene.setActive(false);
      if (this.viewerApi) this.viewerApi.close(null);
    }
    step(direction) {
      if (!this.items.length) return;
      const i = this.items.findIndex((n) => n.id === this.selectedId);
      this.selectedId = this.items[(i + direction + this.items.length) % this.items.length].id;
      this.refresh();
    }
    syncMotion() {
      this.root.classList.toggle('vault-motion-paused', this.paused);
      this.pause.setAttribute('aria-pressed', String(this.paused));
      this.pause.disabled = this.motion.matches;
      const label = this.motion.matches
        ? 'Уменьшение движения включено в системе'
        : this.userPaused
          ? 'Включить движение'
          : 'Остановить движение';
      this.pause.setAttribute('aria-label', label);
      this.pause.title = label;
      U.clear(this.pause).append(icon(this.paused ? 'play' : 'pause'));
      if (this.viewerPause) {
        this.viewerPause.setAttribute('aria-pressed', String(this.paused));
        this.viewerPause.disabled = this.motion.matches;
        this.viewerPause.setAttribute('aria-label', label);
        this.viewerPause.title = label;
        U.clear(this.viewerPause).append(icon(this.paused ? 'play' : 'pause'));
      }
      if (this.scene) this.scene.setPaused(this.paused);
      if (this.viewer) this.viewer.setPaused(this.paused);
      if (this.paused && this.resetTilt) this.resetTilt();
    }
    async copyNumber() {
      const n = this.selected();
      if (!n) return;
      const text = NT.gen.format(n.body);
      try {
        if (navigator.clipboard && window.isSecureContext)
          await navigator.clipboard.writeText(text);
        else {
          const area = h(
            'textarea',
            { class: 'vault-clipboard', readonly: true, 'aria-label': 'Копируемый номер' },
            text,
          );
          document.body.append(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          this.copy.focus({ preventScroll: true });
          if (!ok) throw new Error('Copy unavailable');
        }
        this.copyStatus.textContent = 'Номер скопирован';
        NT.ui.toast('Номер скопирован', 'info');
      } catch (_) {
        NT.ui.toast('Не удалось скопировать. Выделите номер и скопируйте вручную.', 'info');
      }
    }
    openViewer(item) {
      if (!item || this.viewerApi) return;
      this.selectedId = item.id;
      this.refresh();
      const host = h(
        'div',
        {
          class: 'vault-model-host vault-viewer-host',
          tabindex: '0',
          role: 'group',
          'aria-label':
            '3D-номер. Перетащите карту или используйте стрелки для поворота. Home — исходный вид.',
        },
        h('div', { class: 'vault-fallback' }, staticCard(item)),
      );
      const moveLeft = button('Повернуть влево', 'left', '', () => {
        if (this.viewer) this.viewer.turn(-0.45);
      });
      const moveRight = button('Повернуть вправо', 'right', '', () => {
        if (this.viewer) this.viewer.turn(0.45);
      });
      const reset = h(
        'button',
        {
          type: 'button',
          class: 'vault-viewer-reset',
          'data-autofocus': 'true',
          onclick: () => {
            if (this.viewer) this.viewer.reset();
          },
        },
        icon('rotate'),
        'Исходный вид',
      );
      this.viewerPause = button('Остановить движение', 'pause', 'vault-viewer-pause', () => {
        this.userPaused = !this.userPaused;
        this.syncMotion();
      });
      const controls = h(
        'div',
        { class: 'vault-viewer-controls' },
        moveLeft,
        reset,
        moveRight,
        this.viewerPause,
      );
      const help = h(
        'p',
        { class: 'vault-viewer-hint' },
        'Перетащите карту или используйте стрелки для поворота.',
      );
      const price = h('strong', { class: 'mono' }, U.gbp(NT.game.currentValue(item)));
      this.viewerPrice = price;
      this.viewerItemId = item.id;
      const body = h(
        'div',
        { class: 'vault-viewer-layout vault-finish-' + item.rarity },
        h(
          'div',
          { class: 'vault-viewer-scene' },
          h('div', { class: 'vault-floor', 'aria-hidden': 'true' }),
          host,
          controls,
        ),
        h(
          'div',
          { class: 'vault-viewer-info' },
          h(
            'p',
            { class: 'vault-viewer-rarity' },
            icon('gem'),
            rarity(item).name + ' · ' + rarity(item).ru,
          ),
          h('div', { class: 'vault-viewer-number' }, NT.ui.numberNode(item.body)),
          h('p', { class: 'vault-viewer-pattern' }, NT.gen.analyze(item.body).primaryLabel),
          h(
            'dl',
            { class: 'vault-viewer-facts' },
            h('div', null, h('dt', null, 'Рыночная стоимость'), h('dd', null, price)),
            h(
              'div',
              null,
              h('dt', null, 'Красота'),
              h('dd', { class: 'mono' }, item.score + ' / 100'),
            ),
            h(
              'div',
              null,
              h('dt', null, 'Класс карты'),
              h('dd', null, NT.economy.CLASS[item.classId].name),
            ),
            h(
              'div',
              null,
              h('dt', null, 'Получен'),
              h('dd', null, 'День ' + U.dayOf(item.acquiredMinute)),
            ),
          ),
          help,
        ),
      );
      NT.ui
        .modal({
          title: 'Экземпляр ' + item.id,
          cls: 'vault-viewer',
          body,
          actions: [{ label: 'Вернуться в коллекцию', value: true, tone: 'primary' }],
          onOpen: (api) => {
            this.viewerApi = api;
            if (this.scene) this.scene.setActive(false);
            this.viewer = new window.NTCollectionScene(host, {
              paused: this.paused,
              freeRotate: true,
              onAvailable: (ready) => {
                controls.hidden = !ready;
                host.tabIndex = ready ? 0 : -1;
                help.textContent = ready
                  ? 'Перетащите карту или используйте стрелки для поворота.'
                  : 'Статичный вид: 3D недоступно в этом браузере. Все данные и действия коллекции сохранены.';
              },
            });
            this.viewer.setItem(item, rarity(item).name);
            this.viewer.setActive(true);
            this.viewer.reveal();
            this.syncMotion();
            if (!this.viewer.available)
              setTimeout(() => {
                if (this.viewerApi === api)
                  api.dialog.querySelector('.modal-x').focus({ preventScroll: true });
              }, 40);
          },
        })
        .then(() => {
          if (this.viewer) this.viewer.dispose();
          this.viewer = null;
          this.viewerApi = null;
          this.viewerPrice = null;
          this.viewerItemId = null;
          this.viewerPause = null;
          if (this.scene) this.scene.setActive(this.active);
          if (document.activeElement === document.body && this.active)
            this.inspect.focus({ preventScroll: true });
        });
    }
  }
  view.mount = function (root) {
    original.mount.call(this, root);
    vault = new Vault(root);
  };
  view.update = function () {
    original.update.call(this);
    if (vault) vault.refresh();
  };
  view.onShow = function () {
    if (original.onShow) original.onShow.call(this);
    if (vault) vault.show();
  };
  view.onHide = function () {
    if (original.onHide) original.onHide.call(this);
    if (vault) vault.hide();
  };
})(window.NT);
