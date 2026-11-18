/* 鱼灯工坊交互：选鱼形 → 亲手试画 → 生成华纹（点灯、游动） */
(() => {
'use strict';
const FL = window.FishLab, FW = FL.W, FH = FL.H;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rand = (a, b) => a + Math.random() * (b - a);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const FS = 2;                                 // 鱼空间渲染倍率（2400×1280）

const ws = $('ws'), stage = $('stage'), bgC = $('wsBg'), art = $('wsArt'), ax = art.getContext('2d');
let U = 1, dpr = 1, SW = 0, SH = 0;           // U：每个设计单位（舞台 1600×900）对应的画布像素
let step = 'pick', styleIdx = 0, g = null;
let strokes = [], cur = null, color = FL.INKS[0].c, size = 16;
let paperC, maskC, shadowC, strokeC, sx, finalC, litC, finalPal;
let gen = null, open = false, dirty = true, nightC = null, paperBgC = null;
const parts = [];

/* ============================ 布局 ============================ */
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const w = Math.min(vw, vh * 16 / 9), h = w * 9 / 16;
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.setProperty('--u', (w / 1600) + 'px');
  dpr = Math.min(2, devicePixelRatio || 1);
  SW = Math.round(w * dpr); SH = Math.round(h * dpr); U = SW / 1600;
  for (const c of [bgC, art]) { c.width = SW; c.height = SH; }
  paperBgC = drawPaperBg(); nightC = drawNight();
  bgC.getContext('2d').drawImage(paperBgC, 0, 0);
  dirty = true;
}

// 鱼在舞台中的矩形（设计单位）
const BOX = { draw: { x: 170, y: 60, w: 1260, h: 650 }, show: { x: 210, y: 90, w: 1180, h: 680 } };
function fishRect(box, bb) {
  const s = Math.min(box.w / bb.w, box.h / bb.h);
  return { s: s * U, x: (box.x + (box.w - bb.w * s) / 2 - bb.x * s) * U, y: (box.y + (box.h - bb.h * s) / 2 - bb.y * s) * U };
}
const lerpRect = (a, b, t) => ({ s: a.s + (b.s - a.s) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/* ============================ 背景 ============================ */
function drawPaperBg() {
  const c = mk(SW, SH), x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, SH); gr.addColorStop(0, '#f3ead6'); gr.addColorStop(1, '#e6d7b8');
  x.fillStyle = gr; x.fillRect(0, 0, SW, SH);
  // 水墨远山
  const layers = [{ y: .42, a: .13, amp: .16, blur: 10, col: '90,95,92' }, { y: .55, a: .2, amp: .14, blur: 5, col: '70,76,72' }, { y: .7, a: .26, amp: .1, blur: 2, col: '58,60,56' }];
  for (const L of layers) {
    x.save(); x.filter = `blur(${L.blur * U}px)`;
    const ph = [rand(0, 6), rand(0, 6), rand(0, 6)];
    x.beginPath(); x.moveTo(0, SH);
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, yy = L.y - L.amp * (Math.abs(Math.sin(u * 3.1 + ph[0])) * .6 + Math.sin(u * 7.3 + ph[1]) * .25 + Math.sin(u * 17 + ph[2]) * .08);
      x.lineTo(u * SW, yy * SH);
    }
    x.lineTo(SW, SH); x.closePath();
    const lg = x.createLinearGradient(0, (L.y - L.amp) * SH, 0, SH);
    lg.addColorStop(0, `rgba(${L.col},${L.a})`); lg.addColorStop(.45, `rgba(${L.col},${L.a * .35})`); lg.addColorStop(1, `rgba(${L.col},0)`);
    x.fillStyle = lg; x.fill(); x.restore();
  }
  // 雾带
  for (let i = 0; i < 4; i++) {
    const yy = rand(.45, .85) * SH, g2 = x.createLinearGradient(0, yy - 40 * U, 0, yy + 40 * U);
    g2.addColorStop(0, 'rgba(246,240,226,0)'); g2.addColorStop(.5, 'rgba(246,240,226,.55)'); g2.addColorStop(1, 'rgba(246,240,226,0)');
    x.fillStyle = g2; x.fillRect(0, yy - 40 * U, SW, 80 * U);
  }
  // 纸纹
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(120,90,50,${Math.random() * .06})`; x.fillRect(Math.random() * SW, Math.random() * SH, 1.5 * dpr, 1.5 * dpr); }
  const vg = x.createRadialGradient(SW / 2, SH / 2, SH * .3, SW / 2, SH / 2, SW * .7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,60,30,.22)');
  x.fillStyle = vg; x.fillRect(0, 0, SW, SH);
  return c;
}

function drawNight() {
  const c = mk(SW, SH), x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, SH);
  gr.addColorStop(0, '#0a1030'); gr.addColorStop(.55, '#2a1238'); gr.addColorStop(1, '#4a1a1e');
  x.fillStyle = gr; x.fillRect(0, 0, SW, SH);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,240,210,${rand(.15, .7)})`; x.beginPath(); x.arc(rand(0, SW), rand(0, SH * .5), rand(.4, 1.3) * dpr, 0, 6.28); x.fill(); }
  // 月
  const mx = SW * .84, my = SH * .17, mr = 52 * U;
  const mg = x.createRadialGradient(mx, my, mr * .2, mx, my, mr * 4); mg.addColorStop(0, 'rgba(255,236,190,.45)'); mg.addColorStop(1, 'rgba(255,236,190,0)');
  x.fillStyle = mg; x.fillRect(0, 0, SW, SH);
  x.fillStyle = '#fbefd0'; x.beginPath(); x.arc(mx, my, mr, 0, 6.28); x.fill();
  // 徽派马头墙剪影（两层）
  const walls = (base, col, hmin, hmax, win) => {
    let xx = -20 * U;
    while (xx < SW) {
      const w = rand(140, 300) * U, top = SH * base - rand(hmin, hmax) * U;
      x.fillStyle = col; x.fillRect(xx, top, w, SH - top);
      const steps = Math.random() < .7 ? 2 : 1;
      for (let k = 0; k < steps; k++) {
        const sw = w * (.45 - k * .15), sx0 = k ? xx + w - sw : xx, sh = (34 + k * 30) * U;
        x.fillRect(sx0, top - sh, sw, sh);
        x.fillRect(sx0 - 8 * U, top - sh - 8 * U, sw + 16 * U, 9 * U);
      }
      x.fillRect(xx - 10 * U, top - 9 * U, w + 20 * U, 10 * U);
      if (win) for (let k = 0; k < 2; k++) {
        if (Math.random() < .55) {
          const wx = xx + rand(.15, .75) * w, wy = top + rand(40, 120) * U;
          const wg = x.createRadialGradient(wx, wy, 2, wx, wy, 40 * U); wg.addColorStop(0, 'rgba(255,190,100,.55)'); wg.addColorStop(1, 'rgba(255,190,100,0)');
          x.fillStyle = wg; x.fillRect(wx - 40 * U, wy - 40 * U, 80 * U, 80 * U);
          x.fillStyle = '#f3b25d'; x.fillRect(wx - 9 * U, wy - 12 * U, 18 * U, 24 * U); x.fillStyle = col;
        }
      }
      xx += w + rand(-10, 30) * U;
    }
  };
  walls(.86, '#1b1230', 120, 260, false);
  walls(1.0, '#0e0a18', 90, 200, true);
  // 远处灯笼光斑
  for (let i = 0; i < 26; i++) {
    const lx = rand(0, SW), ly = rand(.25, .8) * SH, r = rand(6, 22) * U;
    const lg = x.createRadialGradient(lx, ly, 0, lx, ly, r * 2.4); lg.addColorStop(0, 'rgba(255,90,60,.65)'); lg.addColorStop(.4, 'rgba(230,50,40,.3)'); lg.addColorStop(1, 'rgba(230,50,40,0)');
    x.fillStyle = lg; x.beginPath(); x.arc(lx, ly, r * 2.4, 0, 6.28); x.fill();
  }
  return c;
}

/* ============================ 第一步：选鱼形 ============================ */
const cardCanvases = [];
function buildCards() {
  const box = $('cards'); box.innerHTML = '';
  FL.STYLES.forEach((st, i) => {
    const el = document.createElement('button'); el.className = 'card' + (i === styleIdx ? ' sel' : '');
    el.innerHTML = `<canvas></canvas><div class="card-name">${st.name}</div><div class="card-mean">${st.meaning}</div><span class="seal">选</span>`;
    el.onclick = () => { styleIdx = i; document.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('sel', k === i)); sfx('tap'); };
    el.ondblclick = () => startDraw();
    box.appendChild(el); cardCanvases[i] = el.querySelector('canvas');
  });
  requestAnimationFrame(renderCards);
}
function renderCards() {
  FL.STYLES.forEach((st, i) => {
    const cv = cardCanvases[i], r = cv.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(10, r.width * d); cv.height = Math.max(10, r.height * d);
    const gm = FL.geom(i), fin = FL.renderFinal(gm, FL.demoStrokes(gm), 1).canvas, lit = FL.light(fin, FL.mask(gm, 1), gm, 1);
    const x = cv.getContext('2d'), bb = gm.bbox, s = Math.min(cv.width / bb.w, cv.height / bb.h) * .92;
    x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(lit, (cv.width - bb.w * s) / 2 - bb.x * s, (cv.height - bb.h * s) / 2 - bb.y * s, FW * s, FH * s);
  });
}

/* ============================ 第二步：亲手试画 ============================ */
function startDraw() {
  g = FL.geom(styleIdx);
  paperC = FL.renderPaper(g, FS); maskC = FL.mask(g, FS); shadowC = FL.shadow(g, FS);
  strokeC = mk(FW * FS, FH * FS); sx = strokeC.getContext('2d'); sx.setTransform(FS, 0, 0, FS, 0, 0); sx.lineCap = 'round'; sx.lineJoin = 'round';
  strokes = []; cur = null; gen = null;
  $('drawTitle').textContent = FL.STYLES[styleIdx].name;
  setStep('draw'); sfx('whoosh');
}

function fishPt(e) {
  const r = art.getBoundingClientRect(), R = fishRect(BOX.draw, g.bbox);
  const px = (e.clientX - r.left) * (art.width / r.width), py = (e.clientY - r.top) * (art.height / r.height);
  return [(px - R.x) / R.s, (py - R.y) / R.s];
}

function segment(s, i) {
  // 用中点二次曲线绘制第 i 段，宽度随速度变化
  const p = s.pts, a = p[i - 1], b = p[i];
  const m0 = i > 1 ? [(p[i - 2][0] + a[0]) / 2, (p[i - 2][1] + a[1]) / 2] : a, m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  sx.strokeStyle = s.c;
  sx.globalAlpha = .1; sx.lineWidth = b[2] * 2.2; sx.beginPath(); sx.moveTo(m0[0], m0[1]); sx.quadraticCurveTo(a[0], a[1], m1[0], m1[1]); sx.stroke();
  sx.globalAlpha = .9; sx.lineWidth = b[2]; sx.beginPath(); sx.moveTo(m0[0], m0[1]); sx.quadraticCurveTo(a[0], a[1], m1[0], m1[1]); sx.stroke();
  sx.globalAlpha = 1;
}
function dot(s) { const p = s.pts[0]; sx.fillStyle = s.c; sx.globalAlpha = .9; sx.beginPath(); sx.arc(p[0], p[1], p[2] / 2, 0, 6.28); sx.fill(); sx.globalAlpha = 1; }
function clipStrokes() { sx.save(); sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'destination-in'; sx.drawImage(maskC, 0, 0); sx.restore(); }
function redrawStrokes() {
  sx.save(); sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, strokeC.width, strokeC.height); sx.restore();
  for (const s of strokes) { dot(s); for (let i = 1; i < s.pts.length; i++) segment(s, i); }
  clipStrokes(); dirty = true;
}

art.addEventListener('pointerdown', e => {
  if (step !== 'draw') return;
  e.preventDefault(); art.setPointerCapture(e.pointerId);
  const p = fishPt(e);
  cur = { c: color, w: size, pts: [[p[0], p[1], size]], t: performance.now() };
  strokes.push(cur); dot(cur); clipStrokes(); dirty = true;
  $('drawHint').classList.add('dim');
});
art.addEventListener('pointermove', e => {
  if (!cur) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs) {
    const p = fishPt(ev), last = cur.pts[cur.pts.length - 1], d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (d < 2.5) continue;
    const now = performance.now(), v = d / Math.max(4, now - cur.t); cur.t = now;
    const w = cur.w * clamp(1.25 - v * .35, .55, 1.25), ww = last[2] * .7 + w * .3;
    cur.pts.push([p[0], p[1], ww]); segment(cur, cur.pts.length - 1);
  }
  clipStrokes(); dirty = true;
});
const endStroke = () => { cur = null; };
art.addEventListener('pointerup', endStroke); art.addEventListener('pointercancel', endStroke);

function buildTools() {
  const sw = $('swatches'); sw.innerHTML = '';
  FL.INKS.forEach((ink, i) => {
    const b = document.createElement('button'); b.className = 'swatch' + (i === 0 ? ' sel' : '');
    b.innerHTML = `<i style="background:${ink.c}"></i><span>${ink.n}</span>`;
    b.onclick = () => { color = ink.c; sw.querySelectorAll('.swatch').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sfx('tap'); };
    sw.appendChild(b);
  });
  document.querySelectorAll('.size-btn').forEach(b => b.onclick = () => {
    size = +b.dataset.s; document.querySelectorAll('.size-btn').forEach(x => x.classList.toggle('sel', x === b)); sfx('tap');
  });
  $('btnUndo').onclick = () => { strokes.pop(); redrawStrokes(); sfx('tap'); };
  $('btnClear').onclick = () => { strokes = []; redrawStrokes(); sfx('tap'); };
  $('btnGen').onclick = startGen;
}

/* ============================ 第三步：生成华纹 ============================ */
function startGen() {
  const userStrokes = strokes.map(s => ({ c: s.c, w: s.w, pts: s.pts.map(p => [p[0], p[1], p[2]]) }));
  const used = userStrokes.length ? userStrokes : FL.demoStrokes(g);
  if (!userStrokes.length) window.Pano.toast('还没落笔？先用传统纹样为你点一盏');
  setStep('show'); $('genTip').classList.add('on'); $('showActions').classList.remove('on');
  sfx('chime');
  // 先让界面切换出来，再做一次性的纹样计算（约百毫秒）
  setTimeout(() => {
    const r = FL.renderFinal(g, used, FS); finalC = r.canvas; finalPal = r.palette;
    litC = FL.light(finalC, maskC, g, FS);
    const seeds = FL.seedsOf(used, 10);
    if (!seeds.length) seeds.push({ x: g.center[0], y: g.center[1] });
    seeds.forEach((s, i) => { s.delay = (i / seeds.length) * .9; s.j = rand(.85, 1.15); });
    gen = { t0: performance.now() / 1000, seeds, reveal: mk(FW * FS, FH * FS), tmp: mk(FW * FS, FH * FS), done: false, userCount: userStrokes.length };
    if (!userStrokes.length) { strokes = used.map(s => ({ c: s.c, w: s.w, pts: s.pts.map(p => [p[0], p[1], p[2] || s.w]) })); redrawStrokes(); }
  }, 60);
}

const sparks = [];
function emit(x, y, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = opt.dir != null ? opt.dir + rand(-opt.spread, opt.spread) : rand(0, 6.28), v = rand(opt.vmin || 20, opt.vmax || 120);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(opt.lmin || .6, opt.lmax || 1.4), r: rand(1, 2.6) * (opt.big || 1), col: opt.col || (Math.random() < .7 ? '255,214,120' : '255,120,80'), g: opt.g == null ? 30 : opt.g });
  }
}

let fwT = 0;
function renderShow(now) {
  const t = now / 1000 - gen.t0;
  const W = art.width, H = art.height;
  ax.setTransform(1, 0, 0, 1, 0, 0); ax.clearRect(0, 0, W, H);
  const night = smooth(2.6, 3.8, t), lit = smooth(2.8, 4.0, t), swim = smooth(3.2, 5, t);
  if (night > 0) { ax.globalAlpha = night; ax.drawImage(nightC, 0, 0); ax.globalAlpha = 1; }

  const R0 = fishRect(BOX.draw, g.bbox), R1 = fishRect(BOX.show, g.bbox), R = lerpRect(R0, R1, easeIO(smooth(0, 1.2, t)));
  const bob = Math.sin(t * 1.25) * 10 * U * swim, roll = Math.sin(t * .8) * .025 * swim;
  const cx = R.x + g.center[0] * R.s, cy = R.y + g.center[1] * R.s;

  // 光晕
  if (lit > 0) {
    const hr = g.len * .9 * R.s, hg = ax.createRadialGradient(cx, cy + bob, hr * .1, cx, cy + bob, hr);
    hg.addColorStop(0, `rgba(255,200,110,${.42 * lit})`); hg.addColorStop(.5, `rgba(255,140,60,${.16 * lit})`); hg.addColorStop(1, 'rgba(255,120,40,0)');
    ax.fillStyle = hg; ax.fillRect(0, 0, W, H);
  }

  // 华纹揭示遮罩：从每一笔向外晕开
  let img = finalC;
  if (!gen.done) {
    const rt = t - .5, rx = gen.reveal.getContext('2d');
    if (rt > 2.4) gen.done = true;
    else {
      rx.setTransform(FS, 0, 0, FS, 0, 0); rx.clearRect(0, 0, FW, FH); rx.fillStyle = '#fff';
      for (const s of gen.seeds) {
        const r = Math.max(0, rt - s.delay) * 260 * s.j;
        if (r <= 0) continue;
        rx.beginPath(); rx.arc(s.x, s.y, r, 0, 6.28); rx.fill();
        if (r < 420 && Math.random() < .05) { const a = rand(0, 6.28); emit(R.x + (s.x + Math.cos(a) * r) * R.s, R.y + (s.y + Math.sin(a) * r) * R.s, 1, { vmin: 10, vmax: 40, g: -20, lmax: 1 }); }
      }
      if (rt > 2.0) { rx.globalAlpha = smooth(2.0, 2.4, rt); rx.fillRect(0, 0, FW, FH); rx.globalAlpha = 1; }
      const tx = gen.tmp.getContext('2d');
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, gen.tmp.width, gen.tmp.height);
      tx.drawImage(paperC, 0, 0); tx.globalCompositeOperation = 'source-atop'; tx.drawImage(strokeC, 0, 0);
      tx.globalCompositeOperation = 'source-over';
      tx.save(); tx.globalCompositeOperation = 'destination-out'; tx.drawImage(gen.reveal, 0, 0); tx.restore();
      tx.globalCompositeOperation = 'destination-over'; tx.drawImage(finalMasked(gen.reveal), 0, 0); tx.globalCompositeOperation = 'source-over';
      img = gen.tmp;
    }
  }

  // 影子
  if (night < 1) { ax.globalAlpha = 1 - night; ax.drawImage(shadowC, R.x, R.y + 14 * U, FW * R.s, FH * R.s); ax.globalAlpha = 1; }

  ax.save(); ax.translate(cx, cy + bob); ax.rotate(roll); ax.translate(-cx, -cy);
  drawSwim(img, R, t, swim);
  if (lit > 0) { ax.globalAlpha = lit; drawSwim(litC, R, t, swim); ax.globalAlpha = 1; }
  ax.restore();

  // 光尘 / 烟花
  if (lit > .2) {
    if (Math.random() < .5) emit(rand(0, W), H + 10, 1, { dir: -Math.PI / 2, spread: .3, vmin: 40, vmax: 110, g: -6, lmin: 2.5, lmax: 4.5 });
    if (Math.random() < .25) emit(cx + rand(-1, 1) * g.len * .35 * R.s, cy + rand(-.5, .5) * g.st.hmax * R.s + bob, 1, { vmin: 8, vmax: 30, g: -14, lmax: 2 });
    if (t > fwT) {
      fwT = t + rand(1.4, 2.6);
      const cols = ['255,214,120', '255,110,90', '120,230,200', '255,170,220'];
      emit(rand(.1, .9) * W, rand(.1, .35) * H, 70, { vmin: 60 * U, vmax: 190 * U, g: 40 * U, lmin: 1, lmax: 1.8, col: cols[Math.floor(rand(0, 4))], big: 1.2 });
    }
  }
  drawSparks();

  if (t > 3.8 && !gen.shown) {
    gen.shown = true; $('genTip').classList.remove('on'); $('showActions').classList.add('on'); sfx('bloom');
  }
  if (t > 2.6 && !gen.lit) { gen.lit = true; emit(cx, cy, 120, { vmin: 80 * U, vmax: 320 * U, g: 60 * U, lmin: .8, lmax: 1.8, big: 1.4 }); }
}

let fmC = null;
function finalMasked(mask) {
  if (!fmC || fmC.width !== finalC.width) fmC = mk(finalC.width, finalC.height);
  const x = fmC.getContext('2d'); x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, fmC.width, fmC.height); x.drawImage(finalC, 0, 0);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0); x.globalCompositeOperation = 'source-over';
  return fmC;
}

// 游动：竖向切片，尾部摆幅大、头部稳定
function drawSwim(img, R, t, amp) {
  if (amp < .01) { ax.drawImage(img, R.x, R.y, FW * R.s, FH * R.s); return; }
  const bb = g.bbox, x0 = Math.max(0, Math.floor(bb.x)), x1 = Math.min(FW, Math.ceil(bb.x + bb.w)), SL = 6;
  const tailX = g.pt(0)[0], headX = g.pt(1)[0];
  for (let x = x0; x < x1; x += SL) {
    const u = clamp((headX - x) / (headX - tailX + 1), 0, 1.6);
    const dy = amp * 16 * Math.pow(u, 1.6) * Math.sin(u * 2.4 - t * 3.4);
    ax.drawImage(img, x * FS, 0, SL * FS, FH * FS, R.x + x * R.s, R.y + dy * R.s, SL * R.s + .8, FH * R.s);
  }
}

function drawSparks() {
  ax.globalCompositeOperation = 'lighter';
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i]; p.life += 1 / 60;
    if (p.life > p.max) { sparks.splice(i, 1); continue; }
    p.vy += p.g / 60; p.vx *= .985; p.vy *= .985; p.x += p.vx / 60 * dpr; p.y += p.vy / 60 * dpr;
    const a = 1 - p.life / p.max, r = p.r * dpr * (1 + (1 - a));
    ax.fillStyle = `rgba(${p.col},${a})`; ax.beginPath(); ax.arc(p.x, p.y, r, 0, 6.28); ax.fill();
  }
  ax.globalCompositeOperation = 'source-over';
}

function renderDraw() {
  const R = fishRect(BOX.draw, g.bbox), t = performance.now() / 1000;
  ax.setTransform(1, 0, 0, 1, 0, 0); ax.clearRect(0, 0, art.width, art.height);
  ax.drawImage(shadowC, R.x, R.y + 14 * U, FW * R.s, FH * R.s);
  ax.drawImage(paperC, R.x, R.y, FW * R.s, FH * R.s);
  ax.globalCompositeOperation = 'multiply'; ax.drawImage(strokeC, R.x, R.y, FW * R.s, FH * R.s); ax.globalCompositeOperation = 'source-over';
  if (!strokes.length) {   // 未落笔时，鱼身轮廓呼吸提示
    ax.save(); ax.globalAlpha = .25 + .2 * Math.sin(t * 3); ax.translate(R.x, R.y); ax.scale(R.s, R.s);
    ax.strokeStyle = '#c8302a'; ax.lineWidth = 3 / R.s * dpr; ax.setLineDash([10, 10]); ax.lineDashOffset = -t * 30; ax.stroke(g.body); ax.restore();
  }
}

/* ============================ 流程 ============================ */
function setStep(s) {
  step = s; ws.dataset.step = s; dirty = true;
  if (s !== 'show') { gen = null; sparks.length = 0; }
  if (s === 'draw') $('drawHint').classList.remove('dim');
  if (s === 'pick') { ax.setTransform(1, 0, 0, 1, 0, 0); ax.clearRect(0, 0, art.width, art.height); }
}

function loop(now) {
  if (!open) return;
  requestAnimationFrame(loop);
  if (step === 'draw') { if (dirty || !strokes.length) { renderDraw(); dirty = false; } }
  else if (step === 'show' && gen) renderShow(now);
}

function openWS() {
  if (open) return;
  open = true; ws.classList.add('open'); window.Pano.pause();
  layout(); setStep('pick'); buildCards();
  requestAnimationFrame(loop); sfx('whoosh');
}
function closeWS() {
  open = false; ws.classList.remove('open'); window.Pano.resume();
}

function exportImage(w, h) {
  const c = mk(w, h), x = c.getContext('2d');
  x.drawImage(nightC, 0, 0, w, h);
  const bb = g.bbox, s = Math.min(w * .78 / bb.w, h * .8 / bb.h);
  const ox = (w - bb.w * s) / 2 - bb.x * s, oy = (h - bb.h * s) / 2 - bb.y * s;
  const cx = ox + g.center[0] * s, cy = oy + g.center[1] * s, hr = g.len * .9 * s;
  const hg = x.createRadialGradient(cx, cy, hr * .1, cx, cy, hr);
  hg.addColorStop(0, 'rgba(255,200,110,.42)'); hg.addColorStop(.5, 'rgba(255,140,60,.16)'); hg.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = hg; x.fillRect(0, 0, w, h);
  x.drawImage(litC, ox, oy, FW * s, FH * s);
  return c;
}
function trimmedLantern() {
  const bb = g.bbox, k = 260 / bb.h, c = mk(bb.w * k, bb.h * k);
  c.getContext('2d').drawImage(litC, bb.x * FS, bb.y * FS, bb.w * FS, bb.h * FS, 0, 0, c.width, c.height);
  return c;
}

function bindUI() {
  $('wsClose').onclick = () => { sfx('tap'); closeWS(); };
  $('btnBack').onclick = () => {
    sfx('tap');
    if (step === 'pick') closeWS(); else if (step === 'draw') setStep('pick'); else { setStep('draw'); }
  };
  $('btnTry').onclick = startDraw;
  $('btnRedraw').onclick = () => { setStep('draw'); sfx('tap'); };
  $('btnNew').onclick = () => { setStep('pick'); sfx('tap'); };
  $('btnSave').onclick = () => {
    exportImage(2560, 1440).toBlob(b => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `我的鱼灯_${FL.STYLES[styleIdx].name}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
    window.Pano.toast('已保存 2560×1440 鱼灯图');
  };
  $('btnHang').onclick = () => {
    const c = trimmedLantern(); closeWS();
    window.Pano.addLantern(c.toDataURL('image/png'), c.width / c.height);
  };
  buildTools();
  addEventListener('resize', () => { if (open) { layout(); if (step === 'pick') renderCards(); } });
  addEventListener('keydown', e => { if (open && step === 'draw' && (e.ctrlKey || e.metaKey) && e.key === 'z') { strokes.pop(); redrawStrokes(); } });
}

/* ============================ 交互音效 ============================ */
let sac = null;
function sfx(kind) {
  try {
    sac = sac || new (window.AudioContext || window.webkitAudioContext)();
    const t = sac.currentTime, o = sac.createGain(); o.connect(sac.destination);
    const tone = (f, d, v, type = 'sine', at = 0) => {
      const os = sac.createOscillator(), gg = sac.createGain(); os.type = type; os.frequency.value = f;
      gg.gain.setValueAtTime(0.0001, t + at); gg.gain.exponentialRampToValueAtTime(v, t + at + .01); gg.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      os.connect(gg); gg.connect(o); os.start(t + at); os.stop(t + at + d + .05);
    };
    if (kind === 'tap') tone(1320, .12, .06, 'triangle');
    else if (kind === 'whoosh') { tone(587, .5, .05, 'triangle'); tone(880, .5, .04, 'triangle', .08); }
    else if (kind === 'chime') [74, 76, 78, 81, 83, 86].forEach((m, i) => tone(440 * Math.pow(2, (m - 69) / 12), 1.2, .07, 'triangle', i * .09));
    else if (kind === 'bloom') [62, 69, 74, 78].forEach((m, i) => tone(440 * Math.pow(2, (m - 69) / 12), 2, .06, 'sine', i * .05));
  } catch (e) { /* 无音频环境 */ }
}

bindUI();
window.Workshop = { open: openWS, close: closeWS };
})();
