// Lokka Design – product page 3D viewer (opens in a modal, loads the garment lazily)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Garment, studio } from './garment.js';

const D = window.LOKKA;
const root = document.documentElement.dataset.root || '';
const lang = document.documentElement.lang === 'en' ? 'en' : 'tr';
const T = D.i18n[lang];
const box = document.querySelector('[data-viewer]');
const pdp = document.querySelector('[data-pdp]');
const modal = document.getElementById('viewer-modal');

if (box && pdp && modal) {
  const product = D.products.find((p) => p.id === pdp.dataset.pdp);
  let renderer = null;
  let scene;
  let camera;
  let controls;
  let garment = null;
  let running = false;
  let started = false;
  let colorKey = product.colors[0].key;
  const loading = box.querySelector('[data-viewer-loading]');
  const imgCache = new Map();

  const loadImg = (url) => {
    if (!imgCache.has(url)) {
      imgCache.set(url, new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      }));
    }
    return imgCache.get(url);
  };

  async function applyLook() {
    if (!garment) return;
    const c = D.colors[colorKey];
    const layers = [];
    for (const [area, spec] of Object.entries(product.prints || {})) {
      const file = spec.file[colorKey] || Object.values(spec.file)[0];
      try {
        const src = await loadImg(window.LOKKA_OFFLINE ? window.LOKKA_OFFLINE.asset('assets/' + file) : root + 'assets/' + file);
        layers.push({ area, src, w: spec.w, cx: spec.cx, cy: spec.cy, opacity: 0.97 });
      } catch (e) { /* skip missing print */ }
    }
    garment.layers = layers;
    garment.setColor(c && c.hex ? c.hex : null);
  }

  function resize() {
    if (!renderer) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame() {
    const bb = new THREE.Box3().setFromObject(garment.root);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const v = THREE.MathUtils.degToRad(camera.fov / 2);
    const dist = Math.max(size.y / 2 / Math.tan(v), size.x / 2 / (Math.tan(v) * camera.aspect)) * 1.18 + size.z / 2;
    controls.target.copy(c);
    camera.position.set(c.x, c.y + size.y * 0.04, c.z + dist);
    controls.minDistance = dist * 0.45;
    controls.maxDistance = dist * 1.7;
    controls.update();
  }

  async function start() {
    started = true;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      loading.querySelector('span').textContent = T.modelError;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
    box.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(26, 1, 0.01, 50);
    const lights = await studio(renderer, scene, { env: 0.85 });
    lights.key.intensity = 1.15;
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    resize();
    new ResizeObserver(resize).observe(box);
    try {
      garment = await Garment.load(root + 'assets/models/', product.model, D.modelFormat);
    } catch (e) {
      loading.querySelector('span').textContent = T.modelError;
      return;
    }
    scene.add(garment.root);
    await applyLook();
    frame();
    loading.hidden = true;
    loop();
  }

  function loop() {
    if (!running || !renderer) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  document.addEventListener('lokka:viewer', (e) => {
    if (e.detail && e.detail.color) colorKey = e.detail.color;
    running = true;
    if (!started) start();
    else {
      applyLook();
      resize();
      loop();
    }
  });
  document.addEventListener('lokka:color', (e) => {
    colorKey = e.detail.color;
    if (garment) applyLook();
  });
  modal.addEventListener('lokka:close', () => { running = false; });
}
