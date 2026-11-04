/* An original, decorative SIM sculpture. Entirely local; independent from the game engine. */
(function () {
  'use strict';
  const MATERIALS = {
    bomzh: { face: 0x4269e3, edge: 0x203b94, glow: 0x889bb9 },
    standard: { face: 0x507df4, edge: 0x3655be, glow: 0x7aa6ff },
    business: { face: 0x5966df, edge: 0x4b45a9, glow: 0xa3a8ff },
    platinum: { face: 0xb9d8e4, edge: 0x6885a6, glow: 0xd7f2ff },
    limited: { face: 0xd1ac69, edge: 0x956e37, glow: 0xffd99c },
  };
  const RARITIES = {
    common: 0xa1b0c8,
    uncommon: 0x6dbb9d,
    rare: 0x5a93f5,
    epic: 0xa58aef,
    legendary: 0xe0bc70,
    mythic: 0xe58cbc,
  };
  class MaterialScene {
    constructor(host, button) {
      this.host = host;
      this.button = button;
      this.frame = 0;
      this.visible = true;
      this.time = 0;
      this.lastTime = 0;
      this.pointer = { x: 0, y: 0 };
      this.spinning = false;
      this.disposed = false;
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.paused = this.motionQuery.matches;
      if (!window.THREE) {
        button.hidden = true;
        return;
      }
      const T = window.THREE;
      try {
        this.renderer = new T.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
      } catch (e) {
        button.hidden = true;
        host.classList.add('scene-fallback');
        return;
      }
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.className = 'sculpture-canvas';
      host.appendChild(this.renderer.domElement);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(31, 1, 0.1, 30);
      this.camera.position.set(0, 0.12, 6.9);
      const envCanvas = document.createElement('canvas');
      envCanvas.width = 1024;
      envCanvas.height = 512;
      const ctx = envCanvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 1024, 512);
      [
        [0, '#d0ddfa'],
        [0.18, '#ffffff'],
        [0.3, '#6575a3'],
        [0.43, '#17264b'],
        [0.56, '#f4f7ff'],
        [0.68, '#97b8ee'],
        [0.82, '#f9fbff'],
        [1, '#d4def5'],
      ].forEach(([p, c]) => grad.addColorStop(p, c));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 25, 90, 410);
      ctx.fillRect(700, 120, 45, 300);
      const envTexture = new T.CanvasTexture(envCanvas);
      envTexture.mapping = T.EquirectangularReflectionMapping;
      envTexture.colorSpace = T.SRGBColorSpace;
      this.scene.environment = envTexture;
      this.scene.add(new T.AmbientLight(0xdbe6ff, 0.55));
      const key = new T.DirectionalLight(0xffffff, 2.4);
      key.position.set(-3, 5, 6);
      this.scene.add(key);
      const fill = new T.DirectionalLight(0x819bff, 1.15);
      fill.position.set(4, -1, 3);
      this.scene.add(fill);
      const rim = new T.DirectionalLight(0xffffff, 2.0);
      rim.position.set(2, 3, -4);
      this.scene.add(rim);
      this.group = new T.Group();
      this.scene.add(this.group);
      this.main = this.makeCard(MATERIALS.standard, true);
      this.main.rotation.set(-0.12, -0.4, -0.26);
      this.main.position.set(0.12, 0.14, 0.2);
      this.group.add(this.main);
      const back = this.makeCard({ face: 0xe5ecff, edge: 0x9caed2, glow: 0xdfe8ff }, false);
      back.scale.setScalar(0.95);
      back.position.set(-0.38, -0.18, -0.35);
      back.rotation.set(-0.12, -0.3, 0.09);
      this.group.add(back);
      this.back = back;
      this.group.rotation.y = -0.2;
      this.group.position.y = 0.1;
      this.currentClass = 'standard';
      this.targetColor = new T.Color(MATERIALS.standard.face);
      this.targetEdge = new T.Color(MATERIALS.standard.edge);
      this.resize = this.resize.bind(this);
      this.draw = this.draw.bind(this);
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(host);
      this.visibilityObserver = new IntersectionObserver(
        (entries) => {
          this.visible = entries[0].isIntersecting;
          this.updateLoop();
        },
        { threshold: 0.01 },
      );
      this.visibilityObserver.observe(host);
      this.visibilityHandler = () => this.updateLoop();
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.motionHandler = () => {
        this.paused = this.motionQuery.matches;
        this.updateButton();
        this.updateLoop();
      };
      if (this.motionQuery.addEventListener)
        this.motionQuery.addEventListener('change', this.motionHandler);
      button.addEventListener('click', () => {
        this.paused = !this.paused;
        this.updateButton();
        this.updateLoop();
      });
      const stage = host.closest('.stage');
      stage.addEventListener(
        'pointermove',
        (e) => {
          if (this.paused || e.pointerType === 'touch') return;
          const r = stage.getBoundingClientRect();
          this.pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 0.22;
          this.pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 0.13;
          this.updateLoop();
        },
        { passive: true },
      );
      stage.addEventListener('pointerleave', () => {
        this.pointer.x = 0;
        this.pointer.y = 0;
      });
      this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.disposed = true;
        cancelAnimationFrame(this.frame);
        host.classList.remove('scene-ready');
        button.hidden = true;
      });
      host.classList.add('scene-ready');
      this.updateButton();
      this.resize();
      this.updateLoop();
    }
    makeCard(colors, detailed) {
      const T = window.THREE;
      const shape = new T.Shape();
      shape.moveTo(-0.91, -1.3);
      shape.lineTo(0.91, -1.3);
      shape.quadraticCurveTo(1.02, -1.3, 1.02, -1.19);
      shape.lineTo(1.02, 0.69);
      shape.lineTo(0.44, 1.3);
      shape.lineTo(-0.91, 1.3);
      shape.quadraticCurveTo(-1.02, 1.3, -1.02, 1.19);
      shape.lineTo(-1.02, -1.19);
      shape.quadraticCurveTo(-1.02, -1.3, -0.91, -1.3);
      const geo = new T.ExtrudeGeometry(shape, {
        depth: 0.09,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.045,
        bevelThickness: 0.04,
        curveSegments: 12,
      });
      geo.translate(0, 0, -0.045);
      const face = new T.MeshPhysicalMaterial({
        color: colors.face,
        metalness: 0.35,
        roughness: 0.26,
        envMapIntensity: 0.85,
        clearcoat: 1,
        clearcoatRoughness: 0.2,
        iridescence: 0.24,
        iridescenceIOR: 1.4,
        iridescenceThicknessRange: [100, 350],
      });
      const edge = new T.MeshStandardMaterial({
        color: colors.edge,
        metalness: 0.88,
        roughness: 0.2,
      });
      const mesh = new T.Mesh(geo, [face, edge]);
      const group = new T.Group();
      group.add(mesh);
      group.userData.face = face;
      group.userData.edge = edge;
      if (!detailed) return group;
      const plateGeo = new T.BoxGeometry(0.72, 0.6, 0.028, 1, 1, 1);
      const plateMat = new T.MeshPhysicalMaterial({
        color: 0xf0d9aa,
        metalness: 0.94,
        roughness: 0.27,
        clearcoat: 0.4,
      });
      const plate = new T.Mesh(plateGeo, plateMat);
      plate.position.set(-0.22, -0.06, 0.107);
      group.add(plate);
      const lineMat = new T.LineBasicMaterial({ color: 0x756d59, transparent: true, opacity: 0.7 });
      const line = (pts) => {
        const g = new T.BufferGeometry().setFromPoints(
          pts.map(([x, y]) => new T.Vector3(x, y, 0.124)),
        );
        group.add(new T.Line(g, lineMat));
      };
      line([
        [-0.34, 0.24],
        [-0.34, 0.05],
        [-0.58, -0.06],
      ]);
      line([
        [-0.1, 0.24],
        [-0.1, 0.05],
        [0.14, -0.06],
      ]);
      line([
        [-0.34, -0.36],
        [-0.34, -0.17],
        [-0.58, -0.06],
      ]);
      line([
        [-0.1, -0.36],
        [-0.1, -0.17],
        [0.14, -0.06],
      ]);
      line([
        [-0.34, 0.05],
        [-0.1, 0.05],
        [-0.1, -0.17],
        [-0.34, -0.17],
        [-0.34, 0.05],
      ]);
      const c = document.createElement('canvas');
      c.width = 768;
      c.height = 1024;
      const x = c.getContext('2d');
      x.clearRect(0, 0, 768, 1024);
      x.fillStyle = '#f2f6ff';
      x.textBaseline = 'top';
      x.font = '700 118px Arial';
      x.fillText('n.', 76, 65);
      x.font = '600 26px Arial';
      x.fillText('NUMBER TYCOON', 78, 205);
      x.font = '500 28px Arial';
      x.fillText('COLLECTOR SERIES', 78, 815);
      x.font = '500 52px Arial';
      x.fillText('+000', 78, 873);
      x.strokeStyle = 'rgba(237,245,255,.48)';
      x.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.arc(578, 370, 45 + i * 24, -0.7, 0.7);
        x.stroke();
      }
      const texture = new T.CanvasTexture(c);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      const lettering = new T.Mesh(
        new T.PlaneGeometry(1.99, 2.6),
        new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      lettering.position.z = 0.095;
      group.add(lettering);
      return group;
    }
    updateButton() {
      this.button.setAttribute('aria-pressed', String(this.paused));
      const label = this.paused ? 'Включить 3D-анимацию' : 'Остановить 3D-анимацию';
      this.button.setAttribute('aria-label', label);
      this.button.title = label;
      this.button.classList.toggle('is-paused', this.paused);
    }
    resize() {
      if (!this.renderer || this.disposed) return;
      const w = this.host.clientWidth,
        h = this.host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
    setState(classId, className) {
      if (!this.renderer || this.disposed) return;
      const T = window.THREE,
        m = MATERIALS[classId] || MATERIALS.standard;
      this.currentClass = classId;
      this.spinning = className.indexOf('spinning') !== -1;
      let color = m.face;
      if (className.indexOf('revealed') !== -1 || className.indexOf('done') !== -1) {
        const match = className.match(/\br-(common|uncommon|rare|epic|legendary|mythic)\b/);
        if (match) color = RARITIES[match[1]];
      }
      this.targetColor.set(color);
      this.targetEdge.set(m.edge);
      if (this.paused) {
        this.main.userData.face.color.copy(this.targetColor);
        this.main.userData.edge.color.copy(this.targetEdge);
        this.renderer.render(this.scene, this.camera);
      }
      this.updateLoop();
    }
    updateLoop() {
      if (!this.renderer || this.disposed) return;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (!this.visible || document.hidden || this.host.closest('[hidden]')) return;
      this.lastTime = 0;
      if (this.paused) {
        this.group.rotation.set(0, -0.2, 0);
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this.frame = requestAnimationFrame(this.draw);
    }
    draw(now) {
      if (this.disposed || this.paused || !this.visible || document.hidden) return;
      if (this.lastTime && now - this.lastTime < 32) {
        this.frame = requestAnimationFrame(this.draw);
        return;
      }
      const dt = this.lastTime ? Math.min(0.05, (now - this.lastTime) / 1000) : 0;
      this.lastTime = now;
      this.time += dt;
      const t = this.time;
      this.group.rotation.x += (this.pointer.y - this.group.rotation.x) * 0.065;
      this.group.rotation.y += (-0.2 + this.pointer.x - this.group.rotation.y) * 0.065;
      this.main.position.y = 0.14 + Math.sin(t * 0.75) * 0.055;
      this.main.rotation.z =
        -0.26 + Math.sin(t * 0.5) * 0.018 + (this.spinning ? Math.sin(t * 4) * 0.025 : 0);
      this.back.position.y = -0.18 + Math.sin(t * 0.75 + 0.5) * 0.035;
      this.main.userData.face.color.lerp(this.targetColor, 0.075);
      this.main.userData.edge.color.lerp(this.targetEdge, 0.075);
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(this.draw);
    }
  }
  window.NTMaterialScene = MaterialScene;
})();
