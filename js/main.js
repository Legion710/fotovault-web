/*!
 * Fotovault — 3D site
 * Copyright (c) 2026 Craig Foster / Kowin Technologies. All rights reserved.
 * Proprietary and confidential. Not licensed for reuse. See LICENSE.
 */

import * as THREE from 'three';

const canvas = document.getElementById('scene');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ *
 * theme
 *
 * The page and the scene share one switch. CSS handles the document via
 * data-theme; the scene can't read CSS variables from a shader, so the
 * same two palettes are mirrored here and lerped on change so the wall
 * of prints crossfades instead of snapping.
 * ------------------------------------------------------------------ */

const THEMES = {
  dark:  { bg: 0x0f0e0c, accent: 0xe0a458, border: 0xf7f5f0, back: 0x161412 },
  light: { bg: 0xfaf8f4, accent: 0xa8701a, border: 0xffffff, back: 0xe8e3da },
};

const lightMQ = window.matchMedia('(prefers-color-scheme: light)');

function resolvedTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return lightMQ.matches ? 'light' : 'dark';
}

function announceTheme() {
  window.dispatchEvent(new CustomEvent('fv:theme', { detail: resolvedTheme() }));
}

const themeBtn = document.getElementById('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('fv-theme', next); } catch (e) { /* private mode */ }
    announceTheme();
  });
}

// follow the system only while the visitor has not chosen for themselves
lightMQ.addEventListener('change', () => {
  if (!document.documentElement.getAttribute('data-theme')) announceTheme();
});

/* ------------------------------------------------------------------ *
 * billing period + footer year
 * ------------------------------------------------------------------ */

const billSwitch = document.getElementById('billSwitch');
const lblM = document.getElementById('lblM');
const lblA = document.getElementById('lblA');

function setPeriod(annual) {
  billSwitch.classList.toggle('on', annual);
  billSwitch.setAttribute('aria-checked', annual ? 'true' : 'false');
  lblM.classList.toggle('on', !annual);
  lblA.classList.toggle('on', annual);
  document.querySelectorAll('[data-m]').forEach((el) => {
    el.textContent = el.getAttribute(annual ? 'data-a' : 'data-m');
  });
}

if (billSwitch) {
  // a <button> already fires click on Enter and Space, so no key handling here
  billSwitch.addEventListener('click', () => setPeriod(!billSwitch.classList.contains('on')));
}

const yr = document.getElementById('yr');
if (yr) yr.textContent = String(new Date().getFullYear());

/* ------------------------------------------------------------------ *
 * copy reveal
 * ------------------------------------------------------------------ */

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('in');
    io.unobserve(e.target);
  }
}, { threshold: 0.25 });

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ------------------------------------------------------------------ *
 * tile shaders
 *
 * Every tile carries three positions — scattered, gallery grid and
 * curved wall — and uLayout (0..2) blends between them. Colour is
 * written straight through in sRGB so the photographs are not altered
 * by tone mapping, which matters rather a lot for a photography product.
 * ------------------------------------------------------------------ */

const TILE_VERT = /* glsl */`
attribute vec3 aScatter;
attribute vec3 aRot;
attribute vec3 aGrid;
attribute vec3 aArc;
attribute float aArcRot;
attribute float aSeed;
attribute float aScale;
attribute vec4 aUV;

uniform float uLayout;
uniform float uTime;

varying vec2 vQuad;
varying vec2 vTex;
varying float vSeed;
varying float vDepth;

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

void main(){
  float m1 = clamp(uLayout, 0.0, 1.0);
  float m2 = clamp(uLayout - 1.0, 0.0, 1.0);
  m1 = m1 * m1 * (3.0 - 2.0 * m1);
  m2 = m2 * m2 * (3.0 - 2.0 * m2);

  vec3 centre = mix(aScatter, aGrid, m1);
  centre = mix(centre, aArc, m2);

  // loose drift while the photos are still scattered
  float drift = 1.0 - m1;
  centre.y += sin(uTime * 0.32 + aSeed * 6.2831) * 0.7 * drift;
  centre.x += cos(uTime * 0.26 + aSeed * 6.2831) * 0.5 * drift;

  vec3 rot = mix(aRot, vec3(0.0), m1);
  float ry = mix(rot.y, aArcRot, m2);

  vec3 local = position * aScale;
  local = rotZ(rot.z) * rotX(rot.x) * rotY(ry) * local;

  vQuad = uv;
  vTex = aUV.xy + uv * aUV.zw;
  vSeed = aSeed;

  vec4 mv = modelViewMatrix * vec4(local + centre, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const TILE_FRAG = /* glsl */`
uniform sampler2D map;
uniform vec3 uAccent;
uniform vec3 uBg;
uniform vec3 uBorder;
uniform vec3 uBack;
uniform float uAccentMix;
uniform float uDim;

varying vec2 vQuad;
varying vec2 vTex;
varying float vSeed;
varying float vDepth;

void main(){
  // print border, which takes the studio's accent colour on demand
  float edge = min(min(vQuad.x, 1.0 - vQuad.x), min(vQuad.y, 1.0 - vQuad.y));
  float inner = step(0.042, edge);

  vec3 photo = texture2D(map, vTex).rgb;

  // a whisper of per-tile variation, so a repeated frame doesn't read as a copy
  float a = fract(vSeed * 3.71);
  float b = fract(vSeed * 7.13);
  float c = fract(vSeed * 11.37);
  photo *= mix(0.97, 1.06, a);
  photo = mix(photo, photo * vec3(1.02, 1.0, 0.98), b);
  float lum = dot(photo, vec3(0.299, 0.587, 0.114));
  photo = mix(vec3(lum), photo, mix(0.96, 1.05, c));

  vec3 border = mix(uBorder, uAccent, uAccentMix);
  vec3 col = mix(border, photo, inner);

  // backs of the prints
  if (!gl_FrontFacing) col = mix(uBack, uAccent, uAccentMix * 0.6);

  // a private gallery: everything falls back except the few with the link.
  // Falling back *towards the background* rather than towards black is what
  // lets the same beat read correctly in the light theme.
  float keep = step(0.70, fract(vSeed * 5.31));
  col = mix(uBg, col, mix(1.0, mix(0.18, 1.0, keep), uDim));

  // fade into the background rather than popping at the far plane
  col = mix(col, uBg, smoothstep(34.0, 78.0, vDepth));

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * scene
 * ------------------------------------------------------------------ */

const COLS = 10;
const ROWS = 6;
const COUNT = COLS * ROWS;

// portrait and landscape prints are cut to the same area, so a mixed gallery
// still sits on an even grid
const LAND = [2.58, 1.72];
const PORT = [1.72, 2.58];
const GAP_X = 2.95;
const GAP_Y = 2.85;

const P = './assets/img/';
const PHOTOS = [
  { src: P + 'DSCF2981.jpg', portrait: false },
  { src: P + 'DSC-332.jpg', portrait: true },
  { src: P + 'DSCF1562.jpg', portrait: true },
  { src: P + 'DSCF8685.jpg', portrait: true },
  { src: P + 'DSCF9906.jpg', portrait: true },
  { src: P + 'DSCF71012.jpg', portrait: true },
  { src: P + 'DSCF3209.jpg', portrait: true },
  { src: P + 'DSCF4773.jpg', portrait: false },
  { src: P + 'DSCF8682.jpg', portrait: true },
  { src: P + 'DSCF4713.jpg', portrait: true },
  { src: P + 'DSCF1273.jpg', portrait: true },
  { src: P + 'DSCF5090.jpg', portrait: true },
  { src: P + 'DSCF0499.jpg', portrait: true },
  { src: P + 'DSCF3374.jpg', portrait: true },
  { src: P + 'DSCF4261.jpg', portrait: false },
  { src: P + 'DSCF3440.jpg', portrait: true },
  { src: P + 'DSCF8746.jpg', portrait: true },
  { src: P + 'DSCF9106.jpg', portrait: true },
  { src: P + 'DSCF3944.jpg', portrait: true },
  { src: P + 'DSCF1954.jpg', portrait: true },
  { src: P + 'DSCF5072_1.jpg', portrait: true },
];

function initScene() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    document.getElementById('noWebgl').hidden = false;
    canvas.style.display = 'none';
    console.warn('WebGL unavailable:', err);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // live palette, lerped towards the target on a theme change
  const pal = {
    bg: new THREE.Color(), accent: new THREE.Color(),
    border: new THREE.Color(), back: new THREE.Color(),
  };
  const palTo = {
    bg: new THREE.Color(), accent: new THREE.Color(),
    border: new THREE.Color(), back: new THREE.Color(),
  };

  function applyTheme(name, instant) {
    const t = THEMES[name] || THEMES.dark;
    palTo.bg.setHex(t.bg);
    palTo.accent.setHex(t.accent);
    palTo.border.setHex(t.border);
    palTo.back.setHex(t.back);
    if (instant) {
      pal.bg.copy(palTo.bg); pal.accent.copy(palTo.accent);
      pal.border.copy(palTo.border); pal.back.copy(palTo.back);
    }
  }
  applyTheme(resolvedTheme(), true);

  const scene = new THREE.Scene();
  scene.background = pal.bg;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 300);

  const shared = {
    uLayout: { value: 0 },
    uTime: { value: 0 },
    uAccent: { value: pal.accent },
    uBg: { value: pal.bg },
    uBorder: { value: pal.border },
    uBack: { value: pal.back },
    uAccentMix: { value: 0 },
    uDim: { value: 0 },
  };

  window.addEventListener('fv:theme', (e) => applyTheme(e.detail, false));

  /* ---------------------------------------------------------------- *
   * tiles
   * ---------------------------------------------------------------- */

  const rand = (() => {           // deterministic, so every load looks the same
    let s = 20260813;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  })();

  // one mesh per source frame; slots interleave so the same photo never
  // lands in a block
  const slots = PHOTOS.map(() => []);
  for (let i = 0; i < COUNT; i++) slots[i % PHOTOS.length].push(i);

  const loader = new THREE.TextureLoader();
  const meshes = [];

  slots.forEach((indices, photoIndex) => {
    const photo = PHOTOS[photoIndex];
    const [tw, th] = photo.portrait ? PORT : LAND;
    const base = new THREE.PlaneGeometry(tw, th);
    const n = indices.length;
    const scatter = new Float32Array(n * 3);
    const rot = new Float32Array(n * 3);
    const grid = new Float32Array(n * 3);
    const arc = new Float32Array(n * 3);
    const arcRot = new Float32Array(n);
    const seed = new Float32Array(n);
    const scale = new Float32Array(n);
    const uvRect = new Float32Array(n * 4);

    indices.forEach((slot, k) => {
      const col = slot % COLS;
      const row = Math.floor(slot / COLS);

      // gallery grid
      grid[k * 3] = (col - (COLS - 1) / 2) * GAP_X;
      grid[k * 3 + 1] = ((ROWS - 1) / 2 - row) * GAP_Y;
      grid[k * 3 + 2] = 0;

      // curved wall, ±58° of a 26 m cylinder sitting just behind the grid
      const theta = (col - (COLS - 1) / 2) * (GAP_X / 19); // arc pitch matches the grid
      const R = 19;
      arc[k * 3] = R * Math.sin(theta);
      arc[k * 3 + 1] = ((ROWS - 1) / 2 - row) * (GAP_Y + 0.15);
      arc[k * 3 + 2] = -R + R * Math.cos(theta);
      arcRot[k] = theta;

      // loose in space
      scatter[k * 3] = (rand() - 0.5) * 48;
      scatter[k * 3 + 1] = (rand() - 0.5) * 26;
      scatter[k * 3 + 2] = -34 + rand() * 46;
      rot[k * 3] = (rand() - 0.5) * 0.9;
      rot[k * 3 + 1] = (rand() - 0.5) * 1.1;
      rot[k * 3 + 2] = (rand() - 0.5) * 0.7;

      seed[k] = rand();
      scale[k] = 0.94 + rand() * 0.12;

      // a different crop per tile, equal on both axes so the framing is not
      // distorted — the tile already matches the photo's shape
      const f = 0.72 + rand() * 0.28;
      uvRect[k * 4] = rand() * (1 - f);
      uvRect[k * 4 + 1] = rand() * (1 - f);
      uvRect[k * 4 + 2] = f;
      uvRect[k * 4 + 3] = f;
    });

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    geo.instanceCount = n;
    geo.setAttribute('aScatter', new THREE.InstancedBufferAttribute(scatter, 3));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 3));
    geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grid, 3));
    geo.setAttribute('aArc', new THREE.InstancedBufferAttribute(arc, 3));
    geo.setAttribute('aArcRot', new THREE.InstancedBufferAttribute(arcRot, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 1));
    geo.setAttribute('aUV', new THREE.InstancedBufferAttribute(uvRect, 4));

    const tex = loader.load(photo.src);
    // left un-decoded: the shader writes straight through, so the photos
    // reach the screen exactly as they are in the file
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ map: { value: tex } }, shared),
      vertexShader: TILE_VERT,
      fragmentShader: TILE_FRAG,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; // tiles are placed in the shader
    scene.add(mesh);
    meshes.push(mesh);
  });

  /* ---------------------------------------------------------------- *
   * scroll choreography — one entry per <section data-section>
   *   layout : 0 scattered · 1 gallery grid · 2 curved wall
   *   accent : how much of the studio's accent colour the frames take
   *   dim    : private-gallery fallback, also used to calm the scene
   *            behind the card-heavy sections
   * ---------------------------------------------------------------- */

  const STATES = [
    { cam: [0, 1, 27],  tgt: [0, 0,  0], off: -1.00, layout: 0.00, accent: 0.00, dim: 0.00 }, // hero
    { cam: [0, 0, 31],  tgt: [0, 0,  0], off:  0.00, layout: 0.45, accent: 0.00, dim: 0.45 }, // how it works
    { cam: [0, 0, 34],  tgt: [0, 0,  0], off: -1.00, layout: 1.00, accent: 0.00, dim: 0.00 }, // gallery
    { cam: [0, 0, 44],  tgt: [0, 0,  0], off:  0.00, layout: 1.00, accent: 0.20, dim: 0.55 }, // features
    { cam: [-4, 1, 28], tgt: [0, 0,  0], off:  1.00, layout: 1.00, accent: 0.35, dim: 0.00 }, // storage
    { cam: [8, 2, 24],  tgt: [0, 0, -6], off: -1.00, layout: 2.00, accent: 1.00, dim: 0.70 }, // private
    { cam: [-9, 3, 22], tgt: [0, 0, -6], off:  1.00, layout: 2.00, accent: 1.00, dim: 0.00 }, // south africa
    { cam: [0, 0, 46],  tgt: [0, 0,  0], off:  0.00, layout: 1.00, accent: 0.55, dim: 0.35 }, // pricing
    { cam: [0, 0, 43],  tgt: [0, 0,  0], off:  0.00, layout: 1.00, accent: 0.40, dim: 0.72 }, // faq
    { cam: [0, 0, 29],  tgt: [0, 0,  0], off:  0.00, layout: 0.30, accent: 0.55, dim: 0.15 }, // start
  ];

  const sections = Array.from(document.querySelectorAll('.panel[data-section]'));
  if (sections.length !== STATES.length) {
    console.warn('section/state mismatch:', sections.length, 'sections vs', STATES.length, 'states');
  }

  const cur = {
    cam: new THREE.Vector3().fromArray(STATES[0].cam),
    tgt: new THREE.Vector3().fromArray(STATES[0].tgt),
    off: STATES[0].off, layout: 0, accent: 0, dim: 0,
  };
  const target = {
    cam: cur.cam.clone(), tgt: cur.tgt.clone(),
    off: cur.off, layout: 0, accent: 0, dim: 0,
  };

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const right = new THREE.Vector3();
  const smooth = (t) => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  let progress = 0;
  const bar = document.querySelector('#progress span');

  /* Sections no longer have equal heights — the feature grid and the pricing
     table are several times the height of a narrative panel — so mapping raw
     scroll fraction onto the state list would race the camera through the
     short beats and stall it on the tall ones. Resolve the state from which
     section the viewport centre is actually in instead. */
  let bounds = [];
  function measure() {
    bounds = sections.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, h: Math.max(1, r.height) };
    });
  }

  function sectionProgress() {
    const n = Math.min(bounds.length, STATES.length);
    if (!n) return 0;
    const c = window.scrollY + window.innerHeight / 2;
    if (c <= bounds[0].top) return 0;
    for (let i = 0; i < n; i++) {
      const b = bounds[i];
      if (c < b.top + b.h) return i + clamp01((c - b.top) / b.h);
    }
    return n - 1;
  }

  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? clamp01(window.scrollY / max) : 0;
    bar.style.width = (p * 100).toFixed(2) + '%';
    progress = sectionProgress();
  }

  function resolveTarget() {
    const i = Math.min(STATES.length - 2, Math.max(0, Math.floor(progress)));
    const t = smooth(clamp01(progress - i));
    const A = STATES[i], B = STATES[i + 1];

    target.cam.fromArray(A.cam).lerp(tmpA.fromArray(B.cam), t);
    target.tgt.fromArray(A.tgt).lerp(tmpB.fromArray(B.tgt), t);
    target.off    = mix(A.off, B.off, t);
    target.layout = mix(A.layout, B.layout, t);
    target.accent = mix(A.accent, B.accent, t);
    target.dim    = mix(A.dim, B.dim, t);

    // portrait: centre the frames and drop them below the copy. Pulling back
    // far enough to fit the whole grid would shrink it to thumbnails, so let
    // it crop instead — a wall of photos running off the edges reads fine.
    if (camera.aspect < 1.05) {
      target.off = 0;
      target.cam.multiplyScalar(1.1);
      target.tgt.y += 3.0;
    }
  }

  // --- pointer parallax ---------------------------------------------
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // --- resize --------------------------------------------------------
  let resizeTimer;
  function onResize() {
    // canvas box, not window.innerWidth — the latter includes the scrollbar
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1.05 ? 52 : 38;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    measure();
    readScroll();
  }
  onResize();

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 120);
  });
  window.addEventListener('scroll', readScroll, { passive: true });

  // opening an FAQ answer or switching to annual pricing changes the page
  // height, which moves every section below it
  if (window.ResizeObserver) {
    let settle;
    new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => { measure(); readScroll(); }, 60);
    }).observe(document.body);
  }

  measure();
  readScroll();

  // --- loop ------------------------------------------------------------
  let running = true;
  let last = performance.now();
  let elapsed = 0;

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { last = performance.now(); tick(); }
  });

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);

    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduced) elapsed += dt;

    resolveTarget();

    const k = 1 - Math.pow(0.0015, dt);
    cur.cam.lerp(target.cam, k);
    cur.tgt.lerp(target.tgt, k);
    cur.off    = mix(cur.off, target.off, k);
    cur.layout = mix(cur.layout, target.layout, k);
    cur.accent = mix(cur.accent, target.accent, k);
    cur.dim    = mix(cur.dim, target.dim, k);

    // theme crossfade — quicker than the camera, close to the CSS transition
    const kc = 1 - Math.pow(0.000002, dt);
    pal.bg.lerp(palTo.bg, kc);
    pal.accent.lerp(palTo.accent, kc);
    pal.border.lerp(palTo.border, kc);
    pal.back.lerp(palTo.back, kc);

    ptr.x = mix(ptr.x, ptr.tx, 1 - Math.pow(0.02, dt));
    ptr.y = mix(ptr.y, ptr.ty, 1 - Math.pow(0.02, dt));

    shared.uLayout.value = cur.layout;
    shared.uTime.value = elapsed;
    shared.uAccentMix.value = cur.accent;
    shared.uDim.value = cur.dim;

    camera.position.copy(cur.cam);
    camera.position.x += ptr.x * 1.1;
    camera.position.y += -ptr.y * 0.7;
    camera.lookAt(cur.tgt);

    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
      .multiplyScalar(cur.off * camera.position.distanceTo(cur.tgt) * 0.15);
    camera.position.add(right);
    camera.lookAt(tmpB.copy(cur.tgt).add(right));

    renderer.render(scene, camera);
  }
  tick();
}

requestAnimationFrame(() => requestAnimationFrame(initScene));
