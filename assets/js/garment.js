// Lokka Design – garment model helper (shared by the 3D atelier and the product renderer)
// Loads a garment GLB, recolours its fabric and composites print layers into the texture atlas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Average fabric colour baked into each model's texture (sRGB 0–1). Used to recolour by ratio.
export const MODEL_BASE = {
  tisort: [0.952, 0.949, 0.937],
  sweatshirt: [0.575, 0.58, 0.585],
  jean: [0.165, 0.245, 0.395],
  kumas_pantolon: [0.6, 0.515, 0.375],
  is_pantolonu: [0.125, 0.155, 0.235],
};

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const bufferCache = new Map();

export async function fetchModelBuffer(base, key, format) {
  const id = base + key + format;
  if (bufferCache.has(id)) return bufferCache.get(id);
  const p = (async () => {
    const off = window.LOKKA_OFFLINE;
    if (off && off.modelData) {
      // single-file offline build: the model is embedded as gzip + base64 in the page bundle
      const gz = b64ToBuffer(off.modelData(key));
      const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).arrayBuffer();
    }
    if (format === 'json') {
      const res = await fetch(base + key + '.json');
      if (!res.ok) throw new Error('Model yüklenemedi (' + res.status + ')');
      const j = await res.json();
      return b64ToBuffer(j.glb);
    }
    let res = await fetch(base + key + '.glb');
    if (!res.ok) {
      res = await fetch(base + key + '.json');
      if (!res.ok) throw new Error('Model yüklenemedi (' + res.status + ')');
      return b64ToBuffer((await res.json()).glb);
    }
    return await res.arrayBuffer();
  })();
  bufferCache.set(id, p);
  try { return await p; } catch (e) { bufferCache.delete(id); throw e; }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class Garment {
  static async load(base, key, format = 'glb') {
    const buf = await fetchModelBuffer(base, key, format);
    const gltf = await new GLTFLoader().parseAsync(buf.slice(0), '');
    return new Garment(gltf, key);
  }

  constructor(gltf, key) {
    this.key = key;
    this.root = gltf.scene;
    let meta = null;
    this.root.traverse((o) => {
      if (!meta && o.userData && o.userData.atlas) meta = o.userData;
    });
    this.meta = meta || {};
    this.meshes = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      this.meshes.push(o);
      const m = o.material;
      if (m.name === 'fabric') this.fabric = m;
      if (m.name === 'fabric_inside') this.inside = m;
      if (o.name === 'outside') this.outside = o;
    });
    const src = this.fabric.map;
    const img = src.image;
    this.W = img.width;
    this.H = img.height;
    this.baseCanvas = makeCanvas(this.W, this.H);
    const bctx = this.baseCanvas.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(img, 0, 0);
    this.baseData = bctx.getImageData(0, 0, this.W, this.H);
    this.tintCanvas = makeCanvas(this.W, this.H);
    this.tintCtx = this.tintCanvas.getContext('2d');
    this.tintCtx.drawImage(this.baseCanvas, 0, 0);
    this.printCanvas = makeCanvas(this.W, this.H);
    this.printCtx = this.printCanvas.getContext('2d');
    this.printCtx.drawImage(this.baseCanvas, 0, 0);

    const prep = (t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = src.wrapS;
      t.wrapT = src.wrapT;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    this.tex = prep(new THREE.CanvasTexture(this.printCanvas));
    this.texInside = prep(new THREE.CanvasTexture(this.tintCanvas));
    this.fabric.map = this.tex;
    this.fabric.needsUpdate = true;
    if (this.inside) {
      this.inside.map = this.texInside;
      this.inside.needsUpdate = true;
    }
    src.dispose();
    this.color = null;
    this.layers = [];
    this.s = (this.meta.atlas && this.meta.atlas.px_per_cm) || 1;
    this.sheen0 = this.fabric.sheenColor ? this.fabric.sheenColor.clone() : null;
  }

  get areas() {
    return this.meta.printAreas || {};
  }

  setColor(hex) {
    this.color = hex || null;
    const ctx = this.tintCtx;
    if (!hex) {
      ctx.drawImage(this.baseCanvas, 0, 0);
    } else {
      const base = MODEL_BASE[this.key] || [0.8, 0.8, 0.8];
      const t = hexToRgb(hex);
      const src = this.baseData.data;
      const out = ctx.createImageData(this.W, this.H);
      const d = out.data;
      const mx = Math.max(t[0], t[1], t[2]);
      const mn = Math.min(t[0], t[1], t[2]);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const baseLum = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
      const baseSat = (Math.max(...base) - Math.min(...base)) / Math.max(...base);
      if (sat < 0.22 && baseSat > 0.2) {
        // neutral target on a coloured fabric: recolour by luminance so no colour cast survives
        const k = [t[0] / baseLum, t[1] / baseLum, t[2] / baseLum];
        for (let i = 0; i < src.length; i += 4) {
          const l = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
          d[i] = l * k[0];
          d[i + 1] = l * k[1];
          d[i + 2] = l * k[2];
          d[i + 3] = 255;
        }
      } else {
        const k = [t[0] / base[0], t[1] / base[1], t[2] / base[2]];
        for (let i = 0; i < src.length; i += 4) {
          d[i] = src[i] * k[0];
          d[i + 1] = src[i + 1] * k[1];
          d[i + 2] = src[i + 2] * k[2];
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
    }
    // keep the velvet sheen proportional to the fabric colour so dark garments stay dark
    if (this.sheen0 && this.fabric.sheenColor) {
      if (!hex) this.fabric.sheenColor.copy(this.sheen0);
      else {
        const c = new THREE.Color(hex);
        const base = MODEL_BASE[this.key] || [0.8, 0.8, 0.8];
        const lumT = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        const b0 = new THREE.Color().setRGB(base[0], base[1], base[2], THREE.SRGBColorSpace);
        const lumB = 0.2126 * b0.r + 0.7152 * b0.g + 0.0722 * b0.b;
        const f = Math.min(1.4, Math.max(0.08, lumT / Math.max(0.02, lumB)));
        this.fabric.sheenColor.copy(this.sheen0).multiplyScalar(Math.sqrt(f) * 0.9);
      }
    }
    this.texInside.needsUpdate = true;
    this.redraw();
  }

  // panel-centimetre rectangle of a print area: {item, x0, y0, x1, y1}
  areaRect(key) {
    const a = this.areas[key];
    if (!a) return null;
    const itemName = a.panel || a.item;
    const item = this.meta.atlas.items[itemName];
    if (!item) return null;
    let r = a.rect_cm;
    if (!r) {
      const b = item.bbox_cm;
      r = [b[0] + 1.1, b[1] + 1.1, b[2] - 1.1, b[3] - 1.1];
    }
    return { item: itemName, x0: r[0], y0: r[1], x1: r[2], y1: r[3], w: r[2] - r[0], h: r[3] - r[1] };
  }

  // panel cm -> canvas px
  toPx(itemName, x, y) {
    const it = this.meta.atlas.items[itemName];
    const [xmin, , , ymax] = it.bbox_cm;
    const [ox, oy] = it.origin_cm;
    return [(ox + (x - xmin)) * this.s, (oy + (ymax - y)) * this.s];
  }

  // canvas px -> panel cm for a given item
  toCm(itemName, px, py) {
    const it = this.meta.atlas.items[itemName];
    const [xmin, , , ymax] = it.bbox_cm;
    const [ox, oy] = it.origin_cm;
    return [px / this.s - ox + xmin, ymax - (py / this.s - oy)];
  }

  // find the print area under a uv coordinate (from a raycast); returns {area, cx, cy} in cm relative to area centre
  hitArea(uv) {
    const px = uv.x * this.W;
    const py = uv.y * this.H;
    for (const key of Object.keys(this.areas)) {
      const r = this.areaRect(key);
      if (!r) continue;
      const [x, y] = this.toCm(r.item, px, py);
      if (x >= r.x0 - 2 && x <= r.x1 + 2 && y >= r.y0 - 2 && y <= r.y1 + 2) {
        return { area: key, cx: x - (r.x0 + r.x1) / 2, cy: y - (r.y0 + r.y1) / 2 };
      }
    }
    return null;
  }

  setLayers(layers) {
    this.layers = layers || [];
    this.redraw();
  }

  redraw() {
    const ctx = this.printCtx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.tintCanvas, 0, 0);
    for (const L of this.layers) this.drawLayer(ctx, L);
    this.tex.needsUpdate = true;
  }

  drawLayer(ctx, L) {
    const r = this.areaRect(L.area);
    if (!r || !L.src) return;
    const srcW = L.src.naturalWidth || L.src.width;
    const srcH = L.src.naturalHeight || L.src.height;
    if (!srcW || !srcH) return;
    const wcm = Math.max(1, L.w || r.w * 0.7);
    const hcm = wcm * (srcH / srcW);
    const cx = (r.x0 + r.x1) / 2 + (L.cx || 0);
    const cy = (r.y0 + r.y1) / 2 + (L.cy || 0);
    const [px, py] = this.toPx(r.item, cx, cy);
    const [ax, ay] = this.toPx(r.item, r.x0, r.y1);
    const [bx, by] = this.toPx(r.item, r.x1, r.y0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, bx - ax, by - ay);
    ctx.clip();
    ctx.translate(px, py);
    ctx.rotate(((L.rot || 0) * Math.PI) / 180);
    ctx.globalAlpha = L.opacity == null ? 0.96 : L.opacity;
    const w = wcm * this.s;
    const h = hcm * this.s;
    ctx.drawImage(L.src, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // outline of an area (for the editor overlay), in canvas px
  drawGuide(ctx, key, color = 'rgba(0,160,224,0.9)') {
    const r = this.areaRect(key);
    if (!r) return;
    const [ax, ay] = this.toPx(r.item, r.x0, r.y1);
    const [bx, by] = this.toPx(r.item, r.x1, r.y0);
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
    ctx.restore();
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
          m.dispose();
        });
      }
    });
    this.tex.dispose();
    this.texInside.dispose();
  }
}

// tint a single-colour artwork (preset) to any ink colour
export function tintArtwork(img, hex) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  return c;
}

// render a text layer to a canvas
export function textArtwork(text, { font = 'Jost', weight = 600, color = '#111111', spacing = 0.04, italic = false } = {}) {
  const size = 220;
  const fontStr = `${italic ? 'italic ' : ''}${weight} ${size}px "${font}"`;
  const m = makeCanvas(10, 10).getContext('2d');
  m.font = fontStr;
  const lines = String(text || ' ').split('\n').slice(0, 4);
  const sp = spacing * size;
  const widths = lines.map((l) => m.measureText(l).width + Math.max(0, l.length - 1) * sp);
  const W = Math.max(40, Math.ceil(Math.max(...widths)) + 40);
  const lh = size * 1.12;
  const H = Math.ceil(lh * lines.length + 40);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    let x = (W - widths[i]) / 2;
    const y = 20 + lh * (i + 0.5);
    if (!sp) {
      ctx.fillText(l, x, y);
      return;
    }
    for (const ch of l) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + sp;
    }
  });
  return c;
}

// Standard studio scene used by the atelier and product renders
export function studio(renderer, scene, { env = 0.9 } = {}) {
  return import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = env;
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(1.4, 2.6, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(-2.2, 1.6, -2.4);
    scene.add(rim);
    return { key, rim };
  });
}
