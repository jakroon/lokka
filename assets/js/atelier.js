// Lokka Design – 3D Atelier
// Pick a garment and colour, place images, text and graphics on its print areas, see the price and order.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Garment, studio, tintArtwork, textArtwork } from './garment.js';

const D = window.LOKKA;
const html = document.documentElement;
const lang = html.lang === 'en' ? 'en' : 'tr';
const li = lang === 'tr' ? 0 : 1;
const T = D.i18n[lang];
const S = D.site;
const ROOT = html.dataset.root || '';
const PM = Object.fromEntries(D.products.map((p) => [p.id, p]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tpl = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : o[k]));
const fmt = (n, d = 0) => n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => (lang === 'tr' ? fmt(n) + ' TL' : 'TRY ' + fmt(n));
const pct = (p) => (lang === 'tr' ? '%' + p : p + '%');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ui = () => window.LokkaUI || { toast() {}, openPanel() {} };
const OFF = window.LOKKA_OFFLINE || null; // single-file offline build
const assetUrl = (p) => (OFF ? OFF.asset('assets/' + p) : ROOT + 'assets/' + p);

const app = $('[data-atelier]');
if (app) init();

function init() {
  const stageEl = $('[data-stage]', app);
  const loadingEl = $('[data-loading]', app);
  const st = {
    model: Object.keys(D.models)[0],
    color: null,
    layers: [],
    sel: null,
    guides: true,
    sizes: {},
  };
  let uid = 0;
  let g = null;
  let loadToken = 0;
  const garments = new Map(); // model -> Garment (max 2 kept)
  const areaInfo = new Map(); // model -> {area: {az, y}}

  // ---------------------------------------------------------------- three.js stage
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    $('span', loadingEl).textContent = T.modelError;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stageEl.prepend(renderer.domElement);
  stageEl.tabIndex = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;
  let dirty = true;
  let needsPaint = false;
  controls.addEventListener('change', () => { dirty = true; });
  const lightsReady = studio(renderer, scene, { env: 0.85 }).then((l) => { l.key.intensity = 1.15; dirty = true; });

  function resize() {
    const w = stageEl.clientWidth;
    const h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (g) frameCamera(false);
    dirty = true;
  }
  new ResizeObserver(resize).observe(stageEl);

  let tween = null;
  function loop(t) {
    requestAnimationFrame(loop);
    if (tween) {
      const k = clamp((t - tween.t0) / tween.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const az = tween.a0 + (tween.a1 - tween.a0) * e;
      setAzimuth(az);
      if (k >= 1) tween = null;
    }
    controls.update();
    if (needsPaint) { paintNow(); needsPaint = false; }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  }
  requestAnimationFrame(loop);

  let frameDist = 1;
  function frameCamera(resetAngle = true) {
    const bb = new THREE.Box3().setFromObject(g.root);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const v = THREE.MathUtils.degToRad(camera.fov / 2);
    frameDist = Math.max(size.y / 2 / Math.tan(v), size.x / 2 / (Math.tan(v) * camera.aspect)) * 1.16 + size.z / 2;
    controls.target.copy(c);
    controls.minDistance = frameDist * 0.4;
    controls.maxDistance = frameDist * 1.6;
    if (resetAngle) camera.position.set(c.x, c.y + size.y * 0.03, c.z + frameDist);
    else {
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(c).addScaledVector(dir, frameDist);
    }
    controls.update();
    dirty = true;
  }
  const curAzimuth = () => {
    const d = camera.position.clone().sub(controls.target);
    return THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z));
  };
  function setAzimuth(deg) {
    const d = camera.position.clone().sub(controls.target);
    const r = Math.hypot(d.x, d.z);
    const a = THREE.MathUtils.degToRad(deg);
    camera.position.set(controls.target.x + Math.sin(a) * r, camera.position.y, controls.target.z + Math.cos(a) * r);
    camera.lookAt(controls.target);
    dirty = true;
  }
  function turnTo(deg) {
    let a0 = curAzimuth();
    let a1 = deg;
    while (a1 - a0 > 180) a1 -= 360;
    while (a1 - a0 < -180) a1 += 360;
    if (Math.abs(a1 - a0) < 1) return;
    tween = { a0, a1, t0: performance.now(), dur: 650 };
    const n = (d) => ((Math.round(d) % 360) + 360) % 360;
    $$('[data-view]', app).forEach((b) => b.setAttribute('aria-pressed', String(n(Number(b.dataset.view)) === n(deg))));
  }

  // where each print area sits on the body (azimuth), so selecting a layer turns the model towards it
  function computeAreaInfo(model, gar) {
    if (areaInfo.has(model)) return areaInfo.get(model);
    const info = {};
    const mesh = gar.outside || gar.meshes[0];
    const pos = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const bb = new THREE.Box3().setFromObject(gar.root);
    const c = bb.getCenter(new THREE.Vector3());
    mesh.updateMatrixWorld(true);
    const rects = Object.keys(gar.areas).map((a) => {
      const r = gar.areaRect(a);
      if (!r) return null;
      const [ax, ay] = gar.toPx(r.item, r.x0, r.y1);
      const [bx, by] = gar.toPx(r.item, r.x1, r.y0);
      return { a, ax, ay, bx, by, sum: new THREE.Vector3(), n: 0 };
    }).filter(Boolean);
    const v = new THREE.Vector3();
    for (let i = 0; i < uv.count; i++) {
      const px = uv.getX(i) * gar.W;
      const py = uv.getY(i) * gar.H;
      for (const r of rects) {
        if (px >= r.ax && px <= r.bx && py >= r.ay && py <= r.by) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          r.sum.add(v);
          r.n += 1;
          break;
        }
      }
    }
    rects.forEach((r) => {
      if (!r.n) { info[r.a] = { az: 0 }; return; }
      const m = r.sum.divideScalar(r.n);
      let az = THREE.MathUtils.radToDeg(Math.atan2(m.x - c.x, m.z - c.z));
      az = Math.round(az / 15) * 15;
      info[r.a] = { az };
    });
    areaInfo.set(model, info);
    return info;
  }

  // ---------------------------------------------------------------- model + colour
  const modelInfo = () => D.models[st.model];
  const product = () => PM[modelInfo().product];
  const areaKeys = () => Object.keys(modelInfo().areas).filter((a) => !g || g.areas[a]);

  async function loadModel(model, opts = {}) {
    const token = ++loadToken;
    st.model = model;
    $$('[data-model]', app).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.model === model)));
    const mi = modelInfo();
    if (!opts.keepColor || !mi.colors.includes(st.color)) st.color = mi.colors[0];
    renderColors();
    renderSizes();
    loadingEl.hidden = false;
    let gar = garments.get(model);
    if (!gar) {
      try {
        gar = await Garment.load(ROOT + 'assets/models/', model, D.modelFormat);
      } catch (e) {
        if (token === loadToken) $('span', loadingEl).textContent = T.modelError;
        return;
      }
      garments.set(model, gar);
      if (garments.size > 2) {
        for (const [k, old] of garments) {
          if (k !== model && garments.size > 2 && old !== g) { old.dispose(); garments.delete(k); }
        }
      }
    }
    if (token !== loadToken) return;
    await lightsReady;
    if (g) scene.remove(g.root);
    g = gar;
    scene.add(g.root);
    computeAreaInfo(model, g);
    // move layers to an area this model has
    const keys = areaKeys();
    st.layers.forEach((L) => {
      if (!keys.includes(L.area)) { L.area = keys[0]; L.cx = 0; L.cy = 0; }
      fitLayer(L, false);
    });
    applyColor();
    frameCamera(true);
    $$('[data-view]', app).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === '0')));
    loadingEl.hidden = true;
    renderLayers();
    renderAreas();
    update();
  }

  let inkTouched = false;
  function autoInk() {
    if (inkTouched) return;
    const c = D.colors[st.color];
    const hex = (c && (c.hex || c.swatch)) || '#ffffff';
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    const ink = lum < 0.45 ? '#ffffff' : '#111111';
    $('[data-text-color]', app).value = ink;
    $('[data-preset-color]', app).value = ink;
  }
  function applyColor() {
    autoInk();
    if (!g) return;
    const c = D.colors[st.color];
    g.setColor(c && c.hex ? c.hex : null);
    requestPaint();
    $('[data-color-label]', app).textContent = c ? c.name[lang] : '';
  }

  function renderColors() {
    const box = $('[data-colors]', app);
    box.innerHTML = modelInfo().colors.map((k) => {
      const c = D.colors[k];
      const on = k === st.color;
      return '<button class="swatch' + (on ? ' is-on' : '') + '" type="button" role="radio" aria-checked="' + on + '" style="background:' + esc(c.swatch) + '" data-c="' + esc(k) + '" aria-label="' + esc(c.name[lang]) + '" title="' + esc(c.name[lang]) + '"></button>';
    }).join('');
    const c = D.colors[st.color];
    $('[data-color-label]', app).textContent = c ? c.name[lang] : '';
  }
  $('[data-colors]', app).addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    st.color = b.dataset.c;
    $$('[data-c]', app).forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
    applyColor();
    update();
  });
  $$('[data-model]', app).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.model !== st.model) loadModel(b.dataset.model, { keepColor: true });
  }));

  // ---------------------------------------------------------------- layers
  const selLayer = () => st.layers.find((L) => L.id === st.sel) || null;
  const srcSize = (src) => [src.naturalWidth || src.width, src.naturalHeight || src.height];
  const layerH = (L) => { const [w, h] = srcSize(L.src); return L.w * (h / w); };

  function fitLayer(L, reset) {
    if (!g) return;
    const r = g.areaRect(L.area);
    if (!r) return;
    const [sw, sh] = srcSize(L.src);
    const aspect = sw / sh;
    const maxW = Math.max(2, Math.min(r.w, r.h * aspect));
    if (reset || !L.w) L.w = Math.round(maxW * (L.type === 'text' ? 0.8 : 0.7) * 2) / 2;
    L.w = clamp(L.w, 1.5, Math.max(2, r.w));
    L.cx = clamp(L.cx || 0, -r.w / 2, r.w / 2);
    L.cy = clamp(L.cy || 0, -r.h / 2, r.h / 2);
  }

  function addLayer(L, area) {
    L.id = ++uid;
    L.area = area || (selLayer() ? selLayer().area : areaKeys()[0]);
    L.cx = L.cx || 0;
    L.cy = L.cy || 0;
    L.rot = L.rot || 0;
    if (st.layers.filter((x) => x.area === L.area).length >= 4) { ui().toast(T.areaFull); return; }
    fitLayer(L, !L.w);
    st.layers.push(L);
    select(L.id);
    update();
  }

  function select(id) {
    st.sel = id;
    const L = selLayer();
    if (L && g) {
      const info = areaInfo.get(st.model) || {};
      if (info[L.area]) turnTo(info[L.area].az);
      if (L.type === 'text') syncTextInputs(L);
    }
    renderLayers();
    renderAreas();
    renderCtl();
    requestPaint();
  }

  function removeLayer(id) {
    st.layers = st.layers.filter((L) => L.id !== id);
    if (st.sel === id) st.sel = st.layers.length ? st.layers[st.layers.length - 1].id : null;
    renderLayers();
    renderAreas();
    renderCtl();
    requestPaint();
    update();
  }

  function thumbOf(L) {
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 80;
    const ctx = c.getContext('2d');
    const [w, h] = srcSize(L.src);
    const s = Math.min(72 / w, 72 / h);
    ctx.drawImage(L.src, (80 - w * s) / 2, (80 - h * s) / 2, w * s, h * s);
    return c.toDataURL();
  }

  function renderLayers() {
    const box = $('[data-layers]', app);
    box.innerHTML = st.layers.map((L) => {
      const typeName = { image: T.layerImage, text: T.layerText, preset: T.layerPreset }[L.type];
      const title = L.type === 'text' ? L.text.replace(/\n/g, ' ') : L.name || typeName;
      return '<div class="layer" role="option" tabindex="0" aria-selected="' + (L.id === st.sel) + '" data-layer="' + L.id + '">'
        + '<img src="' + esc(L.thumb || (L.thumb = thumbOf(L))) + '" alt="">'
        + '<div><b>' + esc(title) + '</b><small class="muted">' + esc(typeName) + ' · ' + esc(D.areaNames[L.area][li]) + ' · ' + fmt(L.w, 1) + ' cm</small></div>'
        + '<button class="icon-btn" type="button" data-layer-del="' + L.id + '" aria-label="' + esc(T.delete) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/></svg></button></div>';
    }).join('');
    box.setAttribute('role', 'listbox');
    $('[data-no-layers]', app).hidden = st.layers.length > 0;
    $('[data-layer-ctrl]', app).hidden = !selLayer();
  }
  $('[data-layers]', app).addEventListener('click', (e) => {
    const del = e.target.closest('[data-layer-del]');
    if (del) { removeLayer(Number(del.dataset.layerDel)); return; }
    const row = e.target.closest('[data-layer]');
    if (row) select(Number(row.dataset.layer));
  });
  $('[data-layers]', app).addEventListener('keydown', (e) => {
    const row = e.target.closest('[data-layer]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(Number(row.dataset.layer)); }
  });

  function renderAreas() {
    const box = $('[data-areas]', app);
    const L = selLayer();
    box.innerHTML = areaKeys().map((a) => '<button class="chip' + (L && L.area === a ? ' is-on' : '') + '" type="button" data-area="' + esc(a) + '" aria-pressed="' + (!!L && L.area === a) + '">' + esc(D.areaNames[a][li]) + '</button>').join('');
  }
  $('[data-areas]', app).addEventListener('click', (e) => {
    const b = e.target.closest('[data-area]');
    const L = selLayer();
    if (!b || !L || L.area === b.dataset.area) return;
    L.area = b.dataset.area;
    L.cx = 0;
    L.cy = 0;
    fitLayer(L, true);
    L.thumb = null;
    select(L.id);
    update();
  });

  const ctl = (k) => $('[data-ctl="' + k + '"]', app);
  const out = (k) => $('[data-out="' + k + '"]', app);
  function renderCtl() {
    const L = selLayer();
    $('[data-layer-ctrl]', app).hidden = !L;
    if (!L || !g) return;
    const r = g.areaRect(L.area);
    const [sw, sh] = srcSize(L.src);
    const maxW = Math.max(2, Math.min(r.w, r.h * (sw / sh)) * 1.15);
    Object.assign(ctl('w'), { min: 1.5, max: Math.max(2, Math.min(r.w, maxW)).toFixed(1), value: L.w });
    Object.assign(ctl('cx'), { min: (-r.w / 2).toFixed(1), max: (r.w / 2).toFixed(1), value: L.cx });
    Object.assign(ctl('cy'), { min: (-r.h / 2).toFixed(1), max: (r.h / 2).toFixed(1), value: L.cy });
    ctl('rot').value = L.rot;
    out('w').textContent = fmt(L.w, 1) + ' × ' + fmt(layerH(L), 1) + ' cm';
    out('rot').textContent = Math.round(L.rot) + '°';
    out('cx').textContent = fmt(L.cx, 1) + ' cm';
    out('cy').textContent = fmt(L.cy, 1) + ' cm';
  }
  ['w', 'rot', 'cx', 'cy'].forEach((k) => ctl(k).addEventListener('input', () => {
    const L = selLayer();
    if (!L) return;
    L[k] = Number(ctl(k).value);
    if (k === 'w') fitLayer(L, false);
    renderCtl();
    requestPaint();
    if (k === 'w') { update(); renderLayersMeta(L); }
  }));
  function renderLayersMeta(L) {
    const row = $('[data-layer="' + L.id + '"] small', app);
    if (row) row.textContent = { image: T.layerImage, text: T.layerText, preset: T.layerPreset }[L.type] + ' · ' + D.areaNames[L.area][li] + ' · ' + fmt(L.w, 1) + ' cm';
  }
  $('[data-center]', app).addEventListener('click', () => {
    const L = selLayer();
    if (!L) return;
    L.cx = 0;
    L.cy = 0;
    L.rot = 0;
    renderCtl();
    requestPaint();
  });
  $('[data-delete]', app).addEventListener('click', () => { if (st.sel) removeLayer(st.sel); });

  // ---------------------------------------------------------------- painting the texture
  function requestPaint() { needsPaint = true; }
  function paintNow(withGuides = st.guides) {
    if (!g) return;
    g.layers = st.layers.map((L) => ({ area: L.area, src: L.src, w: L.w, cx: L.cx, cy: L.cy, rot: L.rot, opacity: 0.97 }));
    g.redraw();
    if (withGuides) {
      const ctx = g.printCtx;
      const L = selLayer();
      areaKeys().forEach((a) => g.drawGuide(ctx, a, L && L.area === a ? 'rgba(217,98,43,0.95)' : 'rgba(0,160,224,0.55)'));
      if (L) {
        const r = g.areaRect(L.area);
        const [px, py] = g.toPx(r.item, (r.x0 + r.x1) / 2 + L.cx, (r.y0 + r.y1) / 2 + L.cy);
        const w = L.w * g.s;
        const h = layerH(L) * g.s;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((L.rot * Math.PI) / 180);
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(217,98,43,0.95)';
        ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
        ctx.restore();
      }
      g.tex.needsUpdate = true;
    }
    dirty = true;
  }

  // ---------------------------------------------------------------- drag on the model
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitAt(e) {
    if (!g) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(g.meshes, false);
    const h = hits.find((x) => x.uv);
    return h ? g.hitArea(h.uv) : null;
  }
  let drag = null;
  let hoverT = 0;
  stageEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target !== renderer.domElement) return;
    const hit = hitAt(e);
    if (!hit) return;
    let L = null;
    const inArea = st.layers.filter((x) => x.area === hit.area);
    for (let i = inArea.length - 1; i >= 0; i--) {
      const x = inArea[i];
      const rad = Math.max(x.w, layerH(x)) / 2 + 0.5;
      if (Math.hypot(hit.cx - x.cx, hit.cy - x.cy) <= rad) { L = x; break; }
    }
    if (!L && selLayer() && selLayer().area === hit.area) L = selLayer();
    if (!L) return;
    controls.enabled = false;
    if (st.sel !== L.id) { st.sel = L.id; renderLayers(); renderAreas(); renderCtl(); }
    drag = { L, ox: hit.cx - L.cx, oy: hit.cy - L.cy, id: e.pointerId };
    if (Math.hypot(drag.ox, drag.oy) > Math.max(L.w, layerH(L)) / 2 + 0.5) { drag.ox = 0; drag.oy = 0; }
    stageEl.setPointerCapture(e.pointerId);
    stageEl.classList.add('is-dragging');
    e.preventDefault();
  }, true);
  stageEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) {
      if (!drag && g && e.pointerType === 'mouse' && !e.buttons && e.timeStamp - hoverT > 60) {
        hoverT = e.timeStamp;
        const hit = hitAt(e);
        stageEl.classList.toggle('can-drag', !!(hit && st.layers.some((x) => x.area === hit.area)));
      }
      return;
    }
    const hit = hitAt(e);
    if (!hit || hit.area !== drag.L.area) return;
    const r = g.areaRect(drag.L.area);
    drag.L.cx = clamp(hit.cx - drag.ox, -r.w / 2, r.w / 2);
    drag.L.cy = clamp(hit.cy - drag.oy, -r.h / 2, r.h / 2);
    renderCtl();
    requestPaint();
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    controls.enabled = true;
    stageEl.classList.remove('is-dragging');
  };
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);
  stageEl.addEventListener('keydown', (e) => {
    const L = selLayer();
    if (!L || e.target !== stageEl) return;
    const step = e.shiftKey ? 2 : 0.5;
    const r = g.areaRect(L.area);
    if (e.key === 'ArrowLeft') L.cx = clamp(L.cx - step, -r.w / 2, r.w / 2);
    else if (e.key === 'ArrowRight') L.cx = clamp(L.cx + step, -r.w / 2, r.w / 2);
    else if (e.key === 'ArrowUp') L.cy = clamp(L.cy + step, -r.h / 2, r.h / 2);
    else if (e.key === 'ArrowDown') L.cy = clamp(L.cy - step, -r.h / 2, r.h / 2);
    else if (e.key === 'Delete' || e.key === 'Backspace') { removeLayer(L.id); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    renderCtl();
    requestPaint();
  });

  $$('[data-view]', app).forEach((b) => b.addEventListener('click', () => {
    turnTo(Number(b.dataset.view));
    $$('[data-view]', app).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  const gBtn = $('[data-guides]', app);
  gBtn.title = T.guides;
  gBtn.addEventListener('click', () => {
    st.guides = !st.guides;
    gBtn.setAttribute('aria-pressed', String(st.guides));
    requestPaint();
  });

  // ---------------------------------------------------------------- design inputs
  $$('[data-tab]', app).forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]', app).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-pane]', app).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  }));

  // image upload
  const drop = $('[data-drop]', app);
  const fileIn = $('[data-file]', app);
  const OK_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  async function handleFile(file) {
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) { ui().toast(T.fileBad); return; }
    if (file.size > 15 * 1024 * 1024) { ui().toast(T.fileTooBig); return; }
    ui().toast(T.uploading);
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (e) { ui().toast(T.fileBad); return; }
    let w = img.naturalWidth || 1000;
    let h = img.naturalHeight || 1000;
    const k = Math.min(1, 2048 / Math.max(w, h)) * (file.type === 'image/svg+xml' ? Math.max(1, 2048 / Math.max(w, h)) : 1);
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    addLayer({ type: 'image', name: file.name.replace(/\.[a-z0-9]+$/i, ''), src: c });
    fileIn.value = '';
  }
  fileIn.addEventListener('change', () => handleFile(fileIn.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
  stageEl.addEventListener('dragover', (e) => e.preventDefault());
  stageEl.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });

  // text
  const tIn = $('[data-text-input]', app);
  const tFont = $('[data-text-font]', app);
  const tColor = $('[data-text-color]', app);
  const tSpace = $('[data-text-spacing]', app);
  const textOpts = () => {
    const [font, weight, it] = tFont.value.split('|');
    return { font, weight: Number(weight), italic: it === 'i', color: tColor.value, spacing: Number(tSpace.value) / 100 };
  };
  async function makeText(text, o) {
    try { await document.fonts.load((o.italic ? 'italic ' : '') + o.weight + ' 220px "' + o.font + '"', text); } catch (e) { /* fallback font */ }
    return textArtwork(text, o);
  }
  function syncTextInputs(L) {
    tIn.value = L.text;
    tFont.value = L.fontKey;
    tColor.value = L.color;
    tSpace.value = Math.round(L.spacing * 100);
    out('spacing').textContent = tSpace.value;
  }
  $('[data-add-text]', app).addEventListener('click', async () => {
    const text = tIn.value.trim();
    if (!text) { tIn.focus(); return; }
    const o = textOpts();
    const src = await makeText(text, o);
    addLayer({ type: 'text', text, fontKey: tFont.value, color: o.color, spacing: o.spacing, src });
  });
  let textTimer = 0;
  const liveText = () => {
    out('spacing').textContent = tSpace.value;
    const L = selLayer();
    if (!L || L.type !== 'text') return;
    clearTimeout(textTimer);
    textTimer = setTimeout(async () => {
      const text = tIn.value.trim();
      if (!text) return;
      const o = textOpts();
      const ratioBefore = layerH(L) / L.w;
      L.text = text;
      L.fontKey = tFont.value;
      L.color = o.color;
      L.spacing = o.spacing;
      L.src = await makeText(text, o);
      L.thumb = null;
      if (Math.abs(layerH(L) / L.w - ratioBefore) > 0.001) fitLayer(L, false);
      renderLayers();
      renderCtl();
      requestPaint();
      update();
    }, 120);
  };
  [tIn, tFont, tColor, tSpace].forEach((el) => el.addEventListener('input', liveText));
  tColor.addEventListener('input', () => { inkTouched = true; });
  tFont.addEventListener('change', liveText);

  // presets
  const pColor = $('[data-preset-color]', app);
  const presetCache = new Map();
  const loadPreset = (url) => {
    if (!presetCache.has(url)) presetCache.set(url, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }));
    return presetCache.get(url);
  };
  $('[data-presets]', app).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const img = await loadPreset(b.dataset.preset);
    const multi = b.dataset.multicolor === '1';
    addLayer({ type: 'preset', name: b.getAttribute('aria-label'), base: img, multi, ink: pColor.value, src: multi ? img : tintArtwork(img, pColor.value) });
  });
  pColor.addEventListener('input', () => {
    inkTouched = true;
    const L = selLayer();
    if (!L || L.type !== 'preset' || L.multi) return;
    L.ink = pColor.value;
    L.src = tintArtwork(L.base, L.ink);
    L.thumb = null;
    renderLayers();
    requestPaint();
  });

  // ---------------------------------------------------------------- sizes, pricing, order
  function renderSizes() {
    const p = product();
    const prev = st.sizes;
    st.sizes = {};
    p.sizes.forEach((s) => { st.sizes[s] = prev[s] || 0; });
    if (!Object.values(st.sizes).some((q) => q > 0)) {
      const mid = p.sizes.includes('M') ? 'M' : p.sizes[Math.floor(p.sizes.length / 2)];
      st.sizes[mid] = 1;
    }
    $('[data-size-qty]', app).innerHTML = p.sizes.map((s) => '<label>' + esc(s) + '<input type="number" min="0" max="999" inputmode="numeric" value="' + st.sizes[s] + '" data-sq="' + esc(s) + '" aria-label="' + esc(s) + ' ' + esc(T.pieces) + '"></label>').join('');
  }
  $('[data-size-qty]', app).addEventListener('input', (e) => {
    const inp = e.target.closest('[data-sq]');
    if (!inp) return;
    st.sizes[inp.dataset.sq] = clamp(parseInt(inp.value, 10) || 0, 0, 999);
    update();
  });
  $('[data-size-qty]', app).addEventListener('change', (e) => {
    const inp = e.target.closest('[data-sq]');
    if (inp) inp.value = st.sizes[inp.dataset.sq];
  });

  function pricing() {
    const mi = modelInfo();
    const p = product();
    const parts = [];
    let print = 0;
    [...new Set(st.layers.map((L) => L.area))].forEach((a) => {
      let kind = mi.areas[a] || 'front';
      const ls = st.layers.filter((L) => L.area === a);
      if (kind === 'front' && ls.every((L) => L.w <= 12 && layerH(L) <= 12)) kind = 'chest';
      const price = S.print_prices[kind] != null ? S.print_prices[kind] : S.print_prices.front;
      print += price;
      parts.push({ area: a, kind, price });
    });
    const qty = Object.values(st.sizes).reduce((a, b) => a + b, 0);
    const tier = S.bulk_tiers.filter(([q]) => qty >= q).pop();
    const disc = tier ? tier[1] : 0;
    const unitRaw = p.price + print;
    const unit = Math.round(unitRaw * (1 - disc / 100));
    const next = S.bulk_tiers.find(([q]) => qty < q);
    return { base: p.price, parts, print, qty, disc, unitRaw, unit, total: unit * qty, next };
  }

  function waText(pr) {
    const mi = modelInfo();
    const c = D.colors[st.color];
    const lines = [T.waAtelierIntro, ''];
    lines.push(T.basePrice + ': ' + mi.name[lang] + ' (' + product().name[lang] + ')');
    lines.push(T.color + ': ' + (c ? c.name[lang] : ''));
    pr.parts.forEach((pt) => {
      const ls = st.layers.filter((L) => L.area === pt.area).map((L) => (L.type === 'text' ? '"' + L.text.replace(/\n/g, ' ') + '"' : L.name || T.layerImage) + ' ' + fmt(L.w, 1) + '×' + fmt(layerH(L), 1) + ' cm');
      lines.push(D.areaNames[pt.area][li] + ': ' + ls.join(', '));
    });
    const sizes = Object.entries(st.sizes).filter(([, q]) => q > 0).map(([s, q]) => s + '×' + q).join(', ');
    lines.push(T.size + ': ' + (sizes || '-'));
    lines.push(T.unit + ': ' + money(pr.unit) + (pr.disc ? ' (' + T.bulkDisc + ' ' + pct(pr.disc) + ')' : ''));
    lines.push(T.totalPay + ': ' + money(pr.total) + ' (' + pr.qty + ' ' + T.pieces + ')');
    lines.push('', T.waAtelierEnd);
    return lines.join('\n');
  }

  function update() {
    const pr = pricing();
    const mi = modelInfo();
    const row = (a, b, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + a + '</span><span>' + b + '</span></div>';
    let h = row(esc(T.basePrice) + ' · ' + esc(mi.name[lang]), money(pr.base));
    pr.parts.forEach((pt) => { h += row(esc(T.printCost) + ' · ' + esc(D.areaNames[pt.area][li]) + (pt.kind === 'chest' ? ' <small class="muted">(' + esc(T.chestNote) + ')</small>' : ''), money(pt.price)); });
    if (pr.disc) h += row(esc(T.bulkDisc) + ' (' + pct(pr.disc) + ')', '−' + money(pr.unitRaw - pr.unit), 'disc');
    h += row(esc(T.unit), money(pr.unit));
    h += row(esc(T.qty), '× ' + pr.qty);
    h += row(esc(T.totalPay), money(pr.total), 'total');
    $('[data-sum]', app).innerHTML = h;
    const tn = $('[data-tier-next]', app);
    const parts = [];
    if (pr.disc) parts.push(tpl(T.tierNow, { p: pr.disc }));
    if (pr.next) parts.push(tpl(T.tierNext, { n: pr.next[0], p: pr.next[1] }));
    tn.textContent = parts.join(' · ');
    $('[data-send-wa]', app).href = 'https://wa.me/' + S.whatsapp + '?text=' + encodeURIComponent(waText(pr));
  }

  function snapshot() {
    if (!g) return '';
    const L0 = st.layers[0];
    const info = areaInfo.get(st.model) || {};
    const az = L0 && info[L0.area] ? info[L0.area].az : 0;
    const keepPos = camera.position.clone();
    const keepTween = tween;
    tween = null;
    paintNow(false);
    camera.position.set(controls.target.x + Math.sin(THREE.MathUtils.degToRad(az)) * frameDist, controls.target.y, controls.target.z + Math.cos(THREE.MathUtils.degToRad(az)) * frameDist);
    camera.lookAt(controls.target);
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const W = 360;
    const H = 450;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f3f2ef';
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(W / src.width, H / src.height) * 1.0;
    const dw = src.width * s;
    const dh = src.height * s;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    camera.position.copy(keepPos);
    camera.lookAt(controls.target);
    tween = keepTween;
    paintNow();
    renderer.render(scene, camera);
    return c.toDataURL('image/jpeg', 0.82);
  }

  $('[data-add-design]', app).addEventListener('click', () => {
    const pr = pricing();
    if (!st.layers.length) { ui().toast(T.needLayer); $('[data-tab="upload"]', app).focus(); return; }
    if (pr.qty < 1) { ui().toast(T.needQty); const f = $('[data-sq]', app); if (f) f.focus(); return; }
    const mi = modelInfo();
    const c = D.colors[st.color];
    const item = {
      key: 'd-' + Date.now(), custom: true, model: st.model, product: mi.product, color: st.color,
      colorName: c ? c.name : null,
      name: { tr: D.models[st.model].name.tr + ' · ' + D.i18n.tr.custom, en: D.models[st.model].name.en + ' · ' + D.i18n.en.custom },
      sizes: Object.fromEntries(Object.entries(st.sizes).filter(([, q]) => q > 0)),
      qty: pr.qty, unit: pr.unit, areas: pr.parts.map((p) => p.area), thumb: snapshot(),
      layers: st.layers.map((L) => ({ type: L.type, area: L.area, w: L.w, text: L.text || null, name: L.name || null })),
    };
    if (!window.LokkaCart) return;
    window.LokkaCart.add(item);
    ui().toast(T.designAdded, { href: ROOT + D.urls[lang].cart, text: T.viewCart });
    ui().openPanel('cart');
  });

  // ---------------------------------------------------------------- music (Spotify embed with preview fallback)
  const music = $('[data-music]', app);
  const plErr = $('[data-playlist-err]', app);
  let blocked = false;
  function spotifyIdFrom(v) {
    const m = String(v).match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album|track|artist)[/:]([A-Za-z0-9]{22})/);
    return m ? { type: m[1], id: m[2] } : null;
  }
  function renderMusic(ref) {
    const openUrl = 'https://open.spotify.com/' + ref.type + '/' + ref.id;
    if (blocked) {
      music.innerHTML = '<div class="fallback"><span>' + esc(T.musicFallback) + '</span><a class="btn btn--sm btn--light" href="' + esc(openUrl) + '" target="_blank" rel="noopener">' + esc(T.openSpotify) + '</a></div>';
      return;
    }
    music.innerHTML = '<iframe title="' + esc(T.musicTitle) + '" src="https://open.spotify.com/embed/' + ref.type + '/' + ref.id + '?utm_source=generator&theme=0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>'
      + '<a class="link-u" style="font-size:var(--fs-xs);color:#cfcac2;display:inline-block;margin-top:8px" href="' + esc(openUrl) + '" target="_blank" rel="noopener">' + esc(T.openSpotify) + '</a>';
  }
  if (navigator.onLine === false) blocked = true; // no internet: offer the Spotify link instead of an empty player
  let musicRef = { type: 'playlist', id: S.spotify_playlist };
  try { const saved = JSON.parse(localStorage.getItem('lokka_playlist') || 'null'); if (saved && saved.id) musicRef = saved; } catch (e) { /* ignore */ }
  document.addEventListener('securitypolicyviolation', (e) => {
    if (blocked) return;
    if (/spotify/.test(e.blockedURI || '') || /frame-src|child-src/.test(e.violatedDirective || e.effectiveDirective || '')) {
      blocked = true;
      renderMusic(musicRef);
    }
  });
  renderMusic(musicRef);
  $('[data-playlist-form]', app).addEventListener('submit', (e) => {
    e.preventDefault();
    const ref = spotifyIdFrom($('[data-playlist-input]', app).value.trim());
    if (!ref) { plErr.textContent = T.playlistBad; plErr.hidden = false; return; }
    plErr.hidden = true;
    musicRef = ref;
    try { localStorage.setItem('lokka_playlist', JSON.stringify(ref)); } catch (err) { /* ignore */ }
    renderMusic(ref);
  });

  // ---------------------------------------------------------------- start
  const qs = new URLSearchParams(OFF ? OFF.query() : location.search);
  let pre = null;
  try { pre = JSON.parse(sessionStorage.getItem('lokka_at_pre') || 'null'); sessionStorage.removeItem('lokka_at_pre'); } catch (e) { /* ignore */ }
  const want = { model: qs.get('model') || (pre && pre.model), color: qs.get('color') || (pre && pre.color), product: qs.get('product') || (pre && pre.product) };
  const startModel = D.models[want.model] ? want.model : st.model;
  if (want.color && D.models[startModel].colors.includes(want.color)) st.color = want.color;
  out('spacing').textContent = tSpace.value;
  loadModel(startModel, { keepColor: !!st.color }).then(async () => {
    const p = want.product && PM[want.product];
    if (!p || !p.prints) return;
    for (const [area, spec] of Object.entries(p.prints)) {
      const file = spec.file[st.color] || Object.values(spec.file)[0];
      try {
        const img = await loadPreset(assetUrl(file));
        addLayer({ type: 'preset', name: p.name[lang], base: img, multi: true, src: img, w: spec.w, cx: spec.cx, cy: spec.cy }, area);
      } catch (e) { /* ignore */ }
    }
  });
  window.addEventListener('beforeunload', () => { renderer.dispose(); });
}
