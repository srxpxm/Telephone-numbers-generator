/* Original collectible SIM sculpture. Presentation only; never changes game state. */
(function () {
  'use strict';
  const FINISHES = {
    common: { face: 0x27364b, edge: 0xa5b4c8, ink: '#e8effa', glow: '#879bb8' },
    uncommon: { face: 0x174b46, edge: 0x9dc9b4, ink: '#e1f5e9', glow: '#79b4a3' },
    rare: { face: 0x152c69, edge: 0x9bb8ee, ink: '#e3eeff', glow: '#6e97ee' },
    epic: { face: 0x352449, edge: 0xc3abd9, ink: '#f0e3ff', glow: '#b694de' },
    legendary: { face: 0x352b1d, edge: 0xdac28f, ink: '#f8e5b9', glow: '#d8bb7b' },
    mythic: { face: 0x272336, edge: 0xd9c2ae, ink: '#f3e4d4', glow: '#c7abd8' },
  };
  function shape(w, h, r, cut) {
    const s = new THREE.Shape(),
      x = -w / 2,
      y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - cut);
    s.lineTo(x + w - cut, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  class CollectionScene {
    constructor(host, options) {
      this.host = host;
      this.options = options || {};
      this.active = false;
      this.paused = !!this.options.paused;
      this.visible = true;
      this.disposed = false;
      this.frame = 0;
      this.time = 0;
      this.last = 0;
      this.drag = null;
      this.target = { x: -0.12, y: -0.34, z: -0.1 };
      this.events = new AbortController();
      this.setAvailable(false);
      if (!window.THREE) return;
      const T = THREE;
      try {
        this.renderer = new T.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.setClearColor(0, 0);
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        const canvas = this.renderer.domElement;
        canvas.className = 'vault-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        this.scene = new T.Scene();
        this.camera = new T.PerspectiveCamera(31, 1, 0.1, 40);
        this.camera.position.set(0, 0.18, 7.7);
        this.env = this.environment();
        this.scene.environment = this.env.texture;
        this.scene.add(new T.AmbientLight(0xe6e5ff, 0.7));
        [
          [0xfff1df, 3.6, -3, 5, 7],
          [0x9ab9ff, 2.6, 5, 1, 2],
          [0xe7bde5, 2.2, -3, -1, -4],
        ].forEach(([c, i, x, y, z]) => {
          const l = new T.DirectionalLight(c, i);
          l.position.set(x, y, z);
          this.scene.add(l);
        });
        this.model = this.makeModel();
        this.scene.add(this.model);
        this.model.rotation.set(-0.12, -0.34, -0.1);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.intersection = new IntersectionObserver(
          (entries) => {
            this.visible = entries[0].isIntersecting;
            this.sync();
          },
          { threshold: 0.02 },
        );
        this.intersection.observe(host);
        const listen = (el, name, fn, more) =>
          el.addEventListener(name, fn, Object.assign({ signal: this.events.signal }, more));
        listen(document, 'visibilitychange', () => this.sync());
        listen(host, 'pointerdown', (e) => {
          if (e.button && e.button !== 0) return;
          this.drag = {
            x: e.clientX,
            y: e.clientY,
            rx: this.target.x,
            ry: this.target.y,
            id: e.pointerId,
          };
          host.setPointerCapture(e.pointerId);
          host.classList.add('is-dragging');
        });
        listen(
          host,
          'pointermove',
          (e) => {
            if (this.drag && this.drag.id === e.pointerId) {
              this.target.y = this.drag.ry + (e.clientX - this.drag.x) * 0.011;
              this.target.x = Math.max(
                -0.85,
                Math.min(0.85, this.drag.rx + (e.clientY - this.drag.y) * 0.006),
              );
              if (this.paused) this.renderStill();
            } else if (!this.paused && !this.options.freeRotate && e.pointerType !== 'touch') {
              const r = host.getBoundingClientRect();
              this.target.x = -0.12 + ((e.clientY - r.top) / r.height - 0.5) * 0.18;
              this.target.y = -0.34 + ((e.clientX - r.left) / r.width - 0.5) * 0.38;
            }
          },
          { passive: true },
        );
        const release = () => {
          this.drag = null;
          host.classList.remove('is-dragging');
        };
        listen(host, 'pointerup', release);
        listen(host, 'pointercancel', release);
        listen(host, 'pointerleave', () => {
          if (!this.drag && !this.paused && !this.options.freeRotate) this.reset();
        });
        listen(host, 'keydown', (e) => {
          const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'];
          if (!keys.includes(e.key)) return;
          e.preventDefault();
          if (e.key === 'Home') this.reset();
          else
            this.turn(
              e.key === 'ArrowLeft' ? -0.4 : e.key === 'ArrowRight' ? 0.4 : 0,
              e.key === 'ArrowUp' ? -0.18 : e.key === 'ArrowDown' ? 0.18 : 0,
            );
        });
        listen(canvas, 'webglcontextlost', (e) => {
          e.preventDefault();
          this.failed = true;
          cancelAnimationFrame(this.frame);
          this.setAvailable(false);
        });
        this.setAvailable(true);
        this.resize();
        if (document.fonts)
          document.fonts.ready.then(() => {
            if (!this.disposed && this.item !== undefined) this.paintLabels();
          });
      } catch (error) {
        this.failed = true;
        this.setAvailable(false);
        if (this.renderer) {
          this.renderer.dispose();
          this.renderer.domElement.remove();
        }
      }
    }
    setAvailable(value) {
      this.available = value;
      this.host.classList.toggle('vault-webgl', value);
      if (this.options.onAvailable) this.options.onAvailable(value);
    }
    environment() {
      const T = THREE,
        c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const x = c.getContext('2d');
      x.scale(0.25, 0.25);
      const g = x.createLinearGradient(0, 0, 1024, 0);
      [
        [0, '#151422'],
        [0.16, '#a8a5bd'],
        [0.23, '#f2e7d7'],
        [0.29, '#191b29'],
        [0.55, '#101a30'],
        [0.64, '#baccee'],
        [0.7, '#fff5e6'],
        [0.78, '#131524'],
        [1, '#151422'],
      ].forEach(([p, color]) => g.addColorStop(p, color));
      x.fillStyle = g;
      x.fillRect(0, 0, 1024, 512);
      x.fillStyle = '#f8f6ef';
      x.fillRect(210, 100, 80, 300);
      x.fillRect(745, 50, 38, 400);
      x.fillStyle = '#535e84';
      x.fillRect(400, 0, 160, 80);
      const tex = new T.CanvasTexture(c);
      tex.mapping = T.EquirectangularReflectionMapping;
      tex.colorSpace = T.SRGBColorSpace;
      const pmrem = new T.PMREMGenerator(this.renderer),
        result = pmrem.fromEquirectangular(tex);
      tex.dispose();
      pmrem.dispose();
      return result;
    }
    makeModel() {
      const T = THREE,
        g = new T.Group();
      const silhouette = shape(3.85, 2.42, 0.16, 0.46);
      const geo = new T.ExtrudeGeometry(silhouette, {
        depth: 0.12,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.035,
        bevelSegments: 5,
        steps: 1,
        curveSegments: 18,
      });
      geo.translate(0, 0, -0.06);
      const brush = document.createElement('canvas');
      brush.width = brush.height = 256;
      const ctx = brush.getContext('2d');
      for (let i = 0; i < 256; i++) {
        const l = 110 + Math.round(Math.sin(i * 59.1) * 18);
        ctx.fillStyle = 'rgb(' + l + ',' + l + ',' + l + ')';
        ctx.fillRect(0, i, 256, 1);
      }
      this.brush = new T.CanvasTexture(brush);
      this.brush.wrapS = this.brush.wrapT = T.RepeatWrapping;
      this.face = new T.MeshPhysicalMaterial({
        color: 0x272336,
        metalness: 0.85,
        roughness: 0.29,
        clearcoat: 0.85,
        clearcoatRoughness: 0.23,
        envMapIntensity: 1.05,
        bumpMap: this.brush,
        bumpScale: 0.006,
        iridescence: 0.2,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [130, 280],
      });
      this.edge = new T.MeshStandardMaterial({
        color: 0xd9c2ae,
        metalness: 1,
        roughness: 0.23,
        envMapIntensity: 1.25,
      });
      g.add(new T.Mesh(geo, [this.face, this.edge]));
      const points = silhouette
        .getPoints(30)
        .map((p) => new T.Vector3(p.x * 0.955, p.y * 0.93, 0.098));
      this.rim = new T.LineLoop(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({ color: 0xcfbdb0, transparent: true, opacity: 0.45 }),
      );
      g.add(this.rim);
      const chipShape = shape(0.57, 0.43, 0.055, 0.055),
        chipGeo = new T.ExtrudeGeometry(chipShape, {
          depth: 0.015,
          bevelEnabled: true,
          bevelSize: 0.008,
          bevelThickness: 0.005,
          bevelSegments: 2,
          steps: 1,
        });
      this.chip = new T.Mesh(
        chipGeo,
        new T.MeshPhysicalMaterial({
          color: 0xd8c4a0,
          metalness: 1,
          roughness: 0.28,
          clearcoat: 0.25,
        }),
      );
      this.chip.position.set(-1.27, 0.42, 0.105);
      g.add(this.chip);
      const lineMat = new T.LineBasicMaterial({
        color: 0x534b42,
        transparent: true,
        opacity: 0.85,
      });
      const lines = [
        [
          [-0.1, 0.215],
          [-0.1, 0.07],
          [-0.285, 0],
        ],
        [
          [0.1, 0.215],
          [0.1, 0.07],
          [0.285, 0],
        ],
        [
          [-0.1, -0.215],
          [-0.1, -0.07],
          [-0.285, 0],
        ],
        [
          [0.1, -0.215],
          [0.1, -0.07],
          [0.285, 0],
        ],
        [
          [-0.1, 0.07],
          [0.1, 0.07],
          [0.1, -0.07],
          [-0.1, -0.07],
          [-0.1, 0.07],
        ],
      ];
      lines.forEach((line) => {
        const l = new T.Line(
          new T.BufferGeometry().setFromPoints(
            line.map(([x, y]) => new T.Vector3(x - 1.27, y + 0.42, 0.132)),
          ),
          lineMat,
        );
        g.add(l);
      });
      this.labelCanvas = document.createElement('canvas');
      this.labelCanvas.width = 1536;
      this.labelCanvas.height = 966;
      this.labelTexture = new T.CanvasTexture(this.labelCanvas);
      this.labelTexture.colorSpace = T.SRGBColorSpace;
      this.labelTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      const front = new T.Mesh(
        new T.PlaneGeometry(3.85, 2.42),
        new T.MeshBasicMaterial({
          map: this.labelTexture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      front.position.z = 0.101;
      g.add(front);
      this.backCanvas = document.createElement('canvas');
      this.backCanvas.width = 1536;
      this.backCanvas.height = 966;
      this.backTexture = new T.CanvasTexture(this.backCanvas);
      this.backTexture.colorSpace = T.SRGBColorSpace;
      const back = new T.Mesh(
        new T.PlaneGeometry(3.85, 2.42),
        new T.MeshBasicMaterial({ map: this.backTexture, transparent: true, depthWrite: false }),
      );
      back.position.z = -0.101;
      back.rotation.y = Math.PI;
      g.add(back);
      return g;
    }
    setItem(item, rarityLabel) {
      if (!this.renderer || this.failed || this.disposed) return;
      const key = item ? item.id + '|' + item.body + '|' + item.rarity : 'empty';
      this.rarityLabel = rarityLabel || '';
      this.item = item;
      if (key === this.key) return;
      this.key = key;
      const f = FINISHES[item ? item.rarity : 'mythic'] || FINISHES.common;
      this.targetFace = new THREE.Color(f.face);
      this.targetEdge = new THREE.Color(f.edge);
      this.rim.material.color.set(f.edge);
      this.chip.material.color.set(item && item.rarity === 'rare' ? 0xbacbea : 0xd8c4a0);
      this.face.iridescence =
        item && item.rarity === 'mythic' ? 0.38 : item && item.rarity === 'epic' ? 0.23 : 0.06;
      this.paintLabels();
      this.reset();
      if (this.paused || !this.active) {
        this.face.color.copy(this.targetFace);
        this.edge.color.copy(this.targetEdge);
        this.renderStill();
      }
    }
    paintLabels() {
      if (!this.labelCanvas || this.disposed) return;
      const item = this.item,
        f = FINISHES[item ? item.rarity : 'mythic'] || FINISHES.common;
      const x = this.labelCanvas.getContext('2d');
      x.clearRect(0, 0, 1536, 966);
      x.fillStyle = f.ink;
      x.textBaseline = 'top';
      x.font = '650 69px Onest, sans-serif';
      x.fillText('n.', 108, 78);
      x.font = '450 27px Onest, sans-serif';
      x.fillText('number tycoon', 210, 106);
      x.textAlign = 'right';
      x.font = '500 28px Onest, sans-serif';
      x.fillText(item ? this.rarityLabel : 'Коллекция', 1265, 112);
      x.textAlign = 'left';
      x.font = '450 43px Onest, sans-serif';
      x.globalAlpha = 0.72;
      x.fillText('+000', 114, 460);
      x.globalAlpha = 1;
      x.font = '550 124px Onest, sans-serif';
      const digits = item
        ? item.body.slice(0, 2) + ' ' + item.body.slice(2, 5) + ' ' + item.body.slice(5)
        : '—  ———  ————';
      x.fillText(digits, 108, 540);
      x.strokeStyle = f.ink;
      x.globalAlpha = 0.24;
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(112, 755);
      x.lineTo(1410, 755);
      x.stroke();
      x.globalAlpha = 0.64;
      x.font = '450 26px Onest, sans-serif';
      x.fillText(item ? item.id : 'Место для вашей находки', 114, 808);
      x.textAlign = 'right';
      x.fillText(
        item
          ? (item.formFactor === 'esim' ? 'eSIM' : 'SIM') + ' · ' + item.score + '/100'
          : 'Личное хранилище',
        1405,
        808,
      );
      x.textAlign = 'left';
      x.globalAlpha = 1;
      this.labelTexture.needsUpdate = true;
      const b = this.backCanvas.getContext('2d');
      b.clearRect(0, 0, 1536, 966);
      b.fillStyle = f.ink;
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      b.font = '650 240px Onest, sans-serif';
      b.fillText('n.', 768, 390);
      b.font = '450 36px Onest, sans-serif';
      b.fillText('Сочетание, которое стоит сохранить.', 768, 590);
      b.globalAlpha = 0.6;
      b.font = '450 28px Onest, sans-serif';
      b.fillText(item ? item.id + ' · +000' : 'number tycoon', 768, 780);
      b.globalAlpha = 1;
      this.backTexture.needsUpdate = true;
      if (this.paused) this.renderStill();
    }
    resize() {
      if (!this.renderer || this.failed || this.disposed) return;
      const w = this.host.clientWidth,
        h = this.host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.position.z = Math.max(
        6.0,
        4.55 / (2 * Math.tan((31 * Math.PI) / 360) * this.camera.aspect),
      );
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
    reveal() {
      if (!this.paused && this.model) {
        this.model.rotation.y = this.target.y - 0.38;
        this.model.rotation.z = this.target.z - 0.035;
        this.sync();
      }
    }
    reset() {
      this.target = { x: -0.12, y: -0.34, z: -0.1 };
      if (this.paused) this.renderStill();
    }
    turn(y, x) {
      this.target.y += y || 0;
      this.target.x = Math.max(-0.85, Math.min(0.85, this.target.x + (x || 0)));
      if (this.paused) this.renderStill();
    }
    setPaused(value) {
      this.paused = !!value;
      this.host.classList.toggle('motion-paused', this.paused);
      this.sync();
    }
    setActive(value) {
      this.active = !!value;
      this.sync();
    }
    renderStill() {
      if (!this.renderer || this.failed || this.disposed) return;
      this.model.rotation.set(this.target.x, this.target.y, this.target.z);
      this.model.position.y = 0.05;
      this.renderer.render(this.scene, this.camera);
    }
    sync() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.last = 0;
      if (
        !this.renderer ||
        this.failed ||
        this.disposed ||
        !this.active ||
        !this.visible ||
        document.hidden
      )
        return;
      if (this.paused) {
        this.renderStill();
        return;
      }
      this.frame = requestAnimationFrame((t) => this.draw(t));
    }
    draw(now) {
      if (
        this.disposed ||
        this.failed ||
        !this.active ||
        !this.visible ||
        this.paused ||
        document.hidden
      )
        return;
      if (this.last && now - this.last < 30) {
        this.frame = requestAnimationFrame((t) => this.draw(t));
        return;
      }
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.06) : 0.033;
      this.last = now;
      this.time += dt;
      const k = 1 - Math.exp(-8 * dt);
      this.model.rotation.x += (this.target.x - this.model.rotation.x) * k;
      this.model.rotation.y += (this.target.y - this.model.rotation.y) * k;
      this.model.rotation.z += (this.target.z - this.model.rotation.z) * k;
      this.model.position.y = 0.05 + (this.drag ? 0 : Math.sin(this.time * 0.65) * 0.045);
      if (this.targetFace) this.face.color.lerp(this.targetFace, k);
      if (this.targetEdge) this.edge.color.lerp(this.targetEdge, k);
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame((t) => this.draw(t));
    }
    dispose() {
      this.disposed = true;
      this.active = false;
      cancelAnimationFrame(this.frame);
      this.events.abort();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.intersection) this.intersection.disconnect();
      const geometries = new Set(),
        materials = new Set();
      if (this.scene)
        this.scene.traverse((obj) => {
          if (obj.geometry) geometries.add(obj.geometry);
          if (obj.material)
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) =>
              materials.add(m),
            );
        });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      [this.brush, this.labelTexture, this.backTexture].forEach((t) => {
        if (t) t.dispose();
      });
      if (this.env) this.env.dispose();
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
      }
    }
  }
  window.NTCollectionScene = CollectionScene;
})();
