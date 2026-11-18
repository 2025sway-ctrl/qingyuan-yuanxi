/* 鱼灯几何 + 华纹生成器
 * 坐标系：鱼空间 1200×640，鱼头朝右。每种鱼形由一条三次贝塞尔脊线 + 体高曲线 + 尾/鳍模板参数化生成。
 * renderPaper  —— 宣纸蒙在竹骨架上的空白鱼身（可作画）
 * renderFinal  —— 根据用户笔画生成华纹：鳞片按笔画颜色就近着色、笔画化作描金纹样、两端生出祥云、上下对称回纹
 */
window.FishLab = (() => {
'use strict';
const W = 1200, H = 640, D2R = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const rot = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
const neg = v => [-v[0], -v[1]];
const mid = (a, b, t = .5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const quad = (p0, c, p1, n, out) => {
  for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); }
  return out;
};
const toPath = (pts, close = true) => { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); if (close) p.closePath(); return p; };

/* ---------- 颜色 ---------- */
const hx = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (h, a) => { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const cdist = (a, b) => { const A = hx(a), B = hx(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const GOLD = '#e9b649', INK = '#3a1c0f', PAPER = '#f7efdc', BAMBOO = '#a77c45';

/* 中国传统色（画笔） */
const INKS = [
  { c: '#c8302a', n: '朱砂' }, { c: '#9d2933', n: '胭脂' }, { c: '#ee7c2b', n: '橘橙' }, { c: '#f2b632', n: '藤黄' },
  { c: '#1f8a65', n: '石绿' }, { c: '#1f6fb2', n: '石青' }, { c: '#2b3a67', n: '黛蓝' }, { c: '#2a2420', n: '墨' },
];

/* ---------- 四种鱼灯样式 ---------- */
const STYLES = [
  {
    id: 'jinxiu', name: '锦绣红鳞', meaning: '红鳞耀福 · 年年有余',
    spine: [[330, 352], [520, 350], [760, 346], [952, 350]],
    hmax: 128, a0: .34, a1: .62, peak: .56, top: 1, bot: 1.06, headT: .72, segs: [.26, .5],
    tail: { type: 'fork', L: 245, S: 150, ang: 0, fk: .5 },
    dorsal: { type: 'crown', d0: .36, d1: .72, hs: [112, 142, 132, 96], lean: 44 },
    fins: [{ at: .64, len: 118, spread: .75, ang: 38, layer: 'front' }, { at: .3, len: 86, spread: .6, ang: 30, layer: 'back' }],
    eye: { t: .87, up: .18, r: 46 }, poms: false,
    palette: ['#c8302a', '#1f8a65', '#ee7c2b'],
  },
  {
    id: 'ruicai', name: '瑞彩祥云', meaning: '祥云绕身 · 吉庆有余',
    spine: [[350, 396], [530, 378], [740, 338], [945, 332]],
    hmax: 128, a0: .32, a1: .66, peak: .52, top: 1, bot: 1.04, headT: .74, segs: [.24, .5],
    tail: { type: 'swallow', L: 265, S: 160, ang: -24, fk: .42 },
    dorsal: { type: 'wave', d0: .3, d1: .7, hs: [92, 112, 98], lean: 26 },
    fins: [{ at: .62, len: 124, spread: .8, ang: 40, layer: 'front' }, { at: .28, len: 94, spread: .7, ang: 28, layer: 'back' }],
    eye: { t: .87, up: .16, r: 44 }, poms: true,
    palette: ['#1f6fb2', '#c8302a', '#f2b632'],
  },
  {
    id: 'jinlin', name: '金鳞跃鲤', meaning: '金鳞耀彩 · 鱼跃龙门',
    spine: [[365, 366], [540, 366], [760, 362], [935, 366]],
    hmax: 140, a0: .3, a1: .6, peak: .6, top: .96, bot: 1.1, headT: .7, segs: [.3, .52],
    tail: { type: 'round3', L: 215, S: 152, ang: 0 },
    dorsal: { type: 'crown', d0: .4, d1: .72, hs: [146, 122, 92], lean: 52 },
    fins: [{ at: .62, len: 110, spread: .7, ang: 36, layer: 'front' }, { at: .32, len: 80, spread: .6, ang: 28, layer: 'back' }],
    eye: { t: .86, up: .14, r: 50 }, poms: false,
    palette: ['#ee7c2b', '#f2b632', '#c8302a'],
  },
  {
    id: 'qinghua', name: '青花腾鲤', meaning: '腾跃而上 · 前程似锦',
    spine: [[372, 232], [350, 430], [585, 488], [885, 432]],
    hmax: 110, a0: .36, a1: .66, peak: .55, top: 1, bot: 1, headT: .76, segs: [.3, .54],
    tail: { type: 'fork', L: 190, S: 140, ang: 6, fk: .74 },
    dorsal: { type: 'sail', d0: .5, d1: .7, hs: [130], lean: 62 },
    fins: [{ at: .72, len: 118, spread: .7, ang: 42, layer: 'front' }, { at: .44, len: 96, spread: .6, ang: 30, layer: 'back' }],
    eye: { t: .88, up: .12, r: 42 }, poms: true,
    palette: ['#1f8a65', '#ee7c2b', '#2b3a67'],
  },
];

/* ---------- 几何 ---------- */
function build(st) {
  const [A, B, C, D] = st.spine;
  const pt = t => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; return [a * A[0] + b * B[0] + c * C[0] + d * D[0], a * A[1] + b * B[1] + c * C[1] + d * D[1]]; };
  const tg = t => {
    const u = 1 - t;
    const x = 3 * u * u * (B[0] - A[0]) + 6 * u * t * (C[0] - B[0]) + 3 * t * t * (D[0] - C[0]);
    const y = 3 * u * u * (B[1] - A[1]) + 6 * u * t * (C[1] - B[1]) + 3 * t * t * (D[1] - C[1]);
    const l = Math.hypot(x, y) || 1; return [x / l, y / l];
  };
  const nm = t => { const g = tg(t); return [g[1], -g[0]]; };      // 背侧法线（鱼头朝右时朝上）
  const h = t => {
    t = clamp(t, 0, 1);
    const s = t < st.peak ? st.a0 + (1 - st.a0) * Math.sin(t / st.peak * Math.PI / 2)
      : 1 - (1 - st.a1) * Math.pow((t - st.peak) / (1 - st.peak), 2.2);
    return st.hmax * s;
  };
  const top = (t, k = 1) => add(pt(t), nm(t), h(t) * st.top * k);
  const bot = (t, k = 1) => add(pt(t), nm(t), -h(t) * st.bot * k);
  let len = 0; { let p = pt(0); for (let i = 1; i <= 80; i++) { const q = pt(i / 80); len += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; } }

  const N = 80;
  const topPts = [], botPts = [];
  for (let i = 0; i <= N; i++) { topPts.push(top(i / N)); botPts.push(bot(i / N)); }
  // 鱼嘴（微张）
  const g1 = tg(1), n1 = nm(1), h1 = h(1), p1 = pt(1), T1 = top(1), B1 = bot(1);
  const tip = add(p1, g1, h1 * .75);
  const lipU = add(tip, n1, h1 * .2), lipD = add(add(tip, g1, -h1 * .12), n1, -h1 * .18), mouthIn = add(add(p1, g1, h1 * .4), n1, -h1 * .02);
  const nose = [];
  quad(T1, add(T1, g1, h1 * .62), lipU, 12, nose); nose.push(mouthIn, lipD); quad(lipD, add(B1, g1, h1 * .5), B1, 12, nose);
  const bodyPts = [...topPts, ...nose, ...botPts.slice().reverse()];
  const body = toPath(bodyPts);

  // 头部（鳃线之前）
  const hT = st.headT, hN = Math.ceil(N * hT);
  const gTop = top(hT), gBot = bot(hT), gCtrl = add(pt(hT), tg(hT), -h(hT) * .42);
  const gill = quad(gBot, gCtrl, gTop, 18, [gBot]);
  const headPts = [...gill];
  for (let i = hN; i <= N; i++) headPts.push(topPts[i]);
  headPts.push(...nose);
  for (let i = N; i >= hN; i--) headPts.push(botPts[i]);
  const head = toPath(headPts);

  const ring = (t, k = 1) => { const a = top(t, k), b = bot(t, k), c = add(pt(t), tg(t), h(t) * .16); return quad(a, c, b, 14, [a]); };
  const segs = st.segs.map(t => ring(t));

  /* 尾 */
  const tail = (() => {
    const O = pt(0), d = rot(neg(tg(0)), st.tail.ang * D2R), e = [-d[1], d[0]];
    const L2W = (x, y) => [O[0] + d[0] * x + e[0] * y, O[1] + d[1] * x + e[1] * y];
    const bw = h(0) * 1.02, { L, S } = st.tail, tp = [L2W(-34, bw), L2W(0, bw)], edge = [];
    if (st.tail.type === 'round3') {
      const tipU = L2W(L * .78, S), tipD = L2W(L * .78, -S), v1 = L2W(L * .72, S * .34), v2 = L2W(L * .72, -S * .34);
      quad(L2W(0, bw), L2W(L * .38, bw * 1.1 + S * .15), tipU, 16, tp);
      const ed = [];
      quad(tipU, L2W(L * 1.14, S * .9), v1, 14, ed); quad(v1, L2W(L * 1.24, 0), v2, 16, ed); quad(v2, L2W(L * 1.14, -S * .9), tipD, 14, ed);
      tp.push(...ed); edge.push(tipU, ...ed);
      quad(tipD, L2W(L * .38, -bw * 1.1 - S * .15), L2W(0, -bw), 16, tp);
    } else {
      const sw = st.tail.type === 'swallow', fk = st.tail.fk;
      const tipU = L2W(L, S), tipD = L2W(L * (sw ? 1.02 : .97), -S * (sw ? 1.04 : 1)), notch = L2W(L * fk, 0);
      quad(L2W(0, bw), L2W(L * .42, bw * 1.05 + S * (sw ? .05 : .2)), tipU, 16, tp);
      const e1 = quad(tipU, L2W(L * (sw ? .6 : .8), S * (sw ? .16 : .32)), notch, 14, []);
      const e2 = quad(notch, L2W(L * (sw ? .6 : .8), -S * (sw ? .16 : .32)), tipD, 14, []);
      tp.push(...e1, ...e2); edge.push(tipU, ...e1, ...e2);
      quad(tipD, L2W(L * .42, -bw * 1.05 - S * (sw ? .05 : .2)), L2W(0, -bw), 16, tp);
    }
    tp.push(L2W(-34, -bw));
    const base = L2W(-16, 0);
    return { kind: 'tail', path: toPath(tp), base, edge, ribs: edge.filter((_, i) => i % 2 === 0).map(q => [base, q]), center: L2W(L * .5, 0), dir: d };
  })();

  /* 背鳍 */
  const dorsal = (() => {
    const Dd = st.dorsal, n = Dd.hs.length, span = Dd.d1 - Dd.d0;
    const bt = t => top(t, .86);
    const out = [bt(Dd.d0)], edge = [];
    if (Dd.type === 'sail') {
      const ts = Dd.d0 + span * .28, hs = Dd.hs[0];
      const tipP = add(add(bt(ts), nm(ts), hs), tg(ts), -Dd.lean);
      quad(bt(Dd.d0), add(mid(bt(Dd.d0), tipP), tg(ts), hs * .2), tipP, 16, edge);
      quad(tipP, add(bt(Dd.d0 + span * .66), nm(ts), hs * .18), bt(Dd.d1), 20, edge);
    } else {
      let prev = bt(Dd.d0);
      for (let i = 0; i < n; i++) {
        const ti = Dd.d0 + (i + .5) / n * span, hs = Dd.hs[i], tn = Dd.d0 + (i + 1) / n * span;
        const nxt = i < n - 1 ? add(bt(tn), nm(tn), Math.min(hs, Dd.hs[i + 1]) * .26) : bt(Dd.d1);
        if (Dd.type === 'wave') {
          quad(prev, add(add(bt(ti), nm(ti), hs * 1.7), tg(ti), -Dd.lean * .4), nxt, 18, edge);
        } else {
          const tipP = add(add(bt(ti), nm(ti), hs), tg(ti), -Dd.lean);
          quad(prev, add(mid(prev, tipP), tg(ti), hs * .14), tipP, 10, edge);
          quad(tipP, add(add(mid(tipP, nxt), nm(ti), hs * .26), tg(ti), hs * .1), nxt, 12, edge);
        }
        prev = nxt;
      }
    }
    out.push(...edge);
    for (let i = 20; i >= 0; i--) out.push(top(Dd.d0 + span * i / 20, .4));
    const ribs = edge.filter((_, i) => i % 2 === 0).map((q, i, arr) => [top(Dd.d0 + span * (i / Math.max(1, arr.length - 1)), .7), q]);
    const tc = Dd.d0 + span * .5;
    return { kind: 'dorsal', path: toPath(out), base: top(tc, .7), edge, ribs, center: add(top(tc, .86), nm(tc), Dd.hs[0] * .45) };
  })();

  /* 胸鳍 / 腹鳍 */
  const fins = st.fins.map(f => {
    const Bp = bot(f.at, .55), dir = rot(neg(tg(f.at)), -f.ang * D2R), s = f.spread;
    const pts = [Bp], edge = [], K = 3;
    const ang = j => -s / 2 + j * s / K, rad = j => f.len * (1 - .18 * j / K);
    const V = j => add(Bp, rot(dir, ang(j)), rad(j) * (j === 0 || j === K ? 1 : .92));
    quad(Bp, add(Bp, rot(dir, ang(0)), f.len * .5), V(0), 10, pts);
    edge.push(V(0));
    for (let j = 0; j < K; j++) { const a = (ang(j) + ang(j + 1)) / 2, r = (rad(j) + rad(j + 1)) / 2; quad(V(j), add(Bp, rot(dir, a), r * 1.16), V(j + 1), 10, edge); }
    pts.push(...edge.slice(1));
    quad(V(K), add(Bp, rot(dir, ang(K)), f.len * .42), Bp, 10, pts);
    return { kind: 'fin', layer: f.layer, path: toPath(pts), base: Bp, edge, ribs: edge.filter((_, i) => i % 2 === 0).map(q => [Bp, q]), center: add(Bp, dir, f.len * .5) };
  });

  const et = st.eye.t;
  const eye = { c: add(pt(et), nm(et), h(et) * st.eye.up), r: st.eye.r };
  let poms = [];
  if (st.poms) {
    const s = top(.9, .97), n = nm(.9), g = tg(.9);
    poms = [{ a: s, b: add(add(s, n, 64), g, -20), r: 15 }, { a: add(s, g, 10), b: add(add(s, n, 50), g, 18), r: 13 }];
  }

  const back = fins.filter(f => f.layer === 'back'), front = fins.filter(f => f.layer !== 'back');
  const bodyPart = { kind: 'body', path: body };
  const order = [...back, dorsal, tail, bodyPart, ...front];

  // 骨架线
  const skel = [];
  const ringTs = [.02, ...st.segs, hT, (hT + 1) / 2 + .04];
  for (const t of ringTs) skel.push({ pts: ring(t), w: 3.2 });
  const spine = [], lu = [], ld = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40 * .97; spine.push(pt(t)); lu.push(top(t, .52)); ld.push(bot(t, .52)); }
  skel.push({ pts: spine, w: 2.6 }, { pts: lu, w: 2 }, { pts: ld, w: 2 });
  const knots = [];
  for (const t of ringTs) knots.push(top(t, .52), bot(t, .52), pt(t));

  // 反算：任意点 → (t, v)
  const samples = []; for (let i = 0; i <= 160; i++) samples.push(pt(i / 160));
  const param = p => {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < samples.length; i++) { const d = (samples[i][0] - p[0]) ** 2 + (samples[i][1] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    const t = bi / 160, n = nm(t), q = pt(t);
    return { t, v: ((p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1]) / h(t) };
  };

  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const grow = q => { minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]); maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); };
  bodyPts.forEach(grow); tail.edge.forEach(grow); dorsal.edge.forEach(grow); fins.forEach(f => f.edge.forEach(grow)); poms.forEach(p => grow(add(p.b, [0, -p.r])));

  return {
    st, pt, tg, nm, h, top, bot, len, body, head, gill, segs, tail, dorsal, fins, back, front, eye, poms,
    order, skel, knots, param, center: pt(.52), bbox: { x: minX - 20, y: minY - 20, w: maxX - minX + 40, h: maxY - minY + 40 },
    frame: t => ({ p: pt(t), g: tg(t), n: nm(t) }),
  };
}

/* ---------- 纹理 ---------- */
let paperTex = null;
function getPaperTex() {
  if (paperTex) return paperTex;
  const c = mk(320, 320), x = c.getContext('2d');
  for (let i = 0; i < 380; i++) {
    const a = Math.random() * TAU, l = 6 + Math.random() * 26, px = Math.random() * 320, py = Math.random() * 320;
    x.strokeStyle = Math.random() < .6 ? `rgba(130,95,50,${.05 + Math.random() * .08})` : `rgba(255,255,255,${.15 + Math.random() * .2})`;
    x.lineWidth = .5 + Math.random();
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + .6) * l * .5, py + Math.sin(a + .6) * l * .5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(120,90,50,${Math.random() * .07})`; x.fillRect(Math.random() * 320, Math.random() * 320, 1.4, 1.4); }
  paperTex = c; return c;
}

function makeCanvas(S) { const c = mk(W * S, H * S), x = c.getContext('2d'); x.scale(S, S); x.lineCap = 'round'; x.lineJoin = 'round'; return [c, x]; }

function mask(g, S) {
  const [c, x] = makeCanvas(S); x.fillStyle = '#fff';
  for (const p of g.order) x.fill(p.path);
  return c;
}

function shadow(g, S) {
  const m = mask(g, S), [c, x] = makeCanvas(S);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.filter = `blur(${16 * S}px)`;
  x.globalAlpha = .55; x.drawImage(m, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.filter = 'none'; x.globalAlpha = 1;
  x.fillStyle = '#3b2412'; x.fillRect(0, 0, c.width, c.height);
  return c;
}

function strokePoly(x, pts, close) { x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); if (close) x.closePath(); x.stroke(); }

function drawSkeleton(x, g, color, k = 1) {
  x.strokeStyle = color;
  for (const s of g.skel) { x.lineWidth = s.w * k; strokePoly(x, s.pts); }
  x.lineWidth = 2.1 * k;
  for (const p of [...g.fins, g.tail, g.dorsal]) for (const [a, b] of p.ribs) { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
}

/* 空白宣纸鱼身（竹骨架透出） */
function renderPaper(g, S) {
  const [c, x] = makeCanvas(S);
  x.fillStyle = PAPER;
  for (const p of g.order) x.fill(p.path);
  x.globalCompositeOperation = 'source-atop';
  const cc = g.center, gr = x.createRadialGradient(cc[0], cc[1], 30, cc[0], cc[1], 560);
  gr.addColorStop(0, 'rgba(255,252,240,0)'); gr.addColorStop(1, 'rgba(150,108,58,.2)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // 竹骨架透过宣纸
  drawSkeleton(x, g, rgba(BAMBOO, .55));
  x.lineWidth = 3; x.strokeStyle = rgba(BAMBOO, .6);
  x.beginPath(); x.arc(g.eye.c[0], g.eye.c[1], g.eye.r * .9, 0, TAU); x.stroke();
  x.fillStyle = 'rgba(95,60,28,.55)';
  for (const k of g.knots) { x.beginPath(); x.arc(k[0], k[1], 3.4, 0, TAU); x.fill(); }
  x.fillStyle = x.createPattern(getPaperTex(), 'repeat'); x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  // 竹篾外框
  for (const p of g.order) { x.strokeStyle = BAMBOO; x.lineWidth = 4.2; x.stroke(p.path); x.strokeStyle = rgba(INK, .55); x.lineWidth = 1.1; x.stroke(p.path); }
  drawPoms(x, g, true);
  return c;
}

/* ---------- 华纹生成 ---------- */
function strokeLen(s) { let l = 0; for (let i = 1; i < s.pts.length; i++) l += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); return l; }

function palette(strokes, st) {
  const tally = new Map();
  for (const s of strokes) tally.set(s.c, (tally.get(s.c) || 0) + (strokeLen(s) + 10) * s.w);
  const out = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 4);
  for (const c of st.palette) if (out.length < 3 && out.every(o => cdist(o, c) > 90)) out.push(c);
  for (const c of INKS.map(i => i.c)) if (out.length < 3 && out.every(o => cdist(o, c) > 90)) out.push(c);
  return out;
}

function seedsOf(strokes, step = 12) {
  const out = [];
  for (const s of strokes) {
    let acc = step;
    for (let i = 0; i < s.pts.length; i++) {
      if (i) acc += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
      if (acc >= step || i === s.pts.length - 1) { out.push({ x: s.pts[i][0], y: s.pts[i][1], c: s.c, w: s.w }); acc = 0; }
    }
  }
  return out;
}

function nearest(seeds, x, y) {
  let b = null, bd = 1e12;
  for (const s of seeds) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; b = s; } }
  return b ? { c: b.c, d: Math.sqrt(bd) } : null;
}

function chaikin(pts, it = 2) {
  let p = pts;
  for (let k = 0; k < it; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push(mid(a, b, .25), mid(a, b, .75)); }
    q.push(p[p.length - 1]); p = q;
  }
  return p;
}

function cloud(x, cx, cy, r, ang, col) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  const p = new Path2D();
  for (let i = 0; i <= 44; i++) { const th = i / 44 * Math.PI * 2.35, rr = r * (1 - i / 44 * .8); const px = Math.cos(th + Math.PI) * rr, py = Math.sin(th + Math.PI) * rr; i ? p.lineTo(px, py) : p.moveTo(px, py); }
  const w = Math.max(3, r * .3);
  x.strokeStyle = INK; x.lineWidth = w + 5; x.stroke(p);
  x.strokeStyle = GOLD; x.lineWidth = w + 2.4; x.stroke(p);
  x.strokeStyle = col; x.lineWidth = w; x.stroke(p);
  x.restore();
}

function rosette(x, cx, cy, r, col) {
  x.save(); x.translate(cx, cy);
  for (let i = 0; i < 6; i++) {
    x.rotate(TAU / 6);
    x.beginPath(); x.ellipse(r * .55, 0, r * .55, r * .3, 0, 0, TAU);
    x.fillStyle = col; x.fill(); x.strokeStyle = GOLD; x.lineWidth = 2; x.stroke();
  }
  x.beginPath(); x.arc(0, 0, r * .28, 0, TAU); x.fillStyle = GOLD; x.fill(); x.strokeStyle = INK; x.lineWidth = 1.5; x.stroke();
  x.restore();
}

function ornament(x, s, k = 1, alpha = 1) {
  const pts = chaikin(s.pts.map(p => [p[0], p[1]]), 2);
  const w = s.w * k, L = strokeLen(s);
  x.globalAlpha = alpha;
  if (L < 8) { rosette(x, pts[0][0], pts[0][1], Math.max(14, w * 1.4), s.c); x.globalAlpha = 1; return; }
  x.strokeStyle = INK; x.lineWidth = w + 8; strokePoly(x, pts);
  x.strokeStyle = GOLD; x.lineWidth = w + 4; strokePoly(x, pts);
  x.strokeStyle = s.c; x.lineWidth = w; strokePoly(x, pts);
  x.strokeStyle = 'rgba(255,255,255,.38)'; x.lineWidth = Math.max(1.4, w * .2); strokePoly(x, pts);
  if (k >= 1) {
    // 两端生出祥云
    const a0 = pts[0], a1 = pts[Math.min(3, pts.length - 1)], b0 = pts[pts.length - 1], b1 = pts[Math.max(0, pts.length - 4)];
    const r = clamp(w * 1.3 + 10, 14, 38);
    if (L > 40) {
      cloud(x, a0[0], a0[1], r, Math.atan2(a0[1] - a1[1], a0[0] - a1[0]), s.c);
      cloud(x, b0[0], b0[1], r, Math.atan2(b0[1] - b1[1], b0[0] - b1[0]) + Math.PI, s.c);
    }
    // 沿笔画两侧点金珠
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dy) || 1;
      acc += l;
      if (acc > 44) {
        acc = 0; const nx = -dy / l, ny = dx / l, o = w / 2 + 9;
        for (const sg of [1, -1]) { x.beginPath(); x.arc(pts[i][0] + nx * o * sg, pts[i][1] + ny * o * sg, 3.2, 0, TAU); x.fillStyle = GOLD; x.fill(); }
      }
    }
  }
  x.globalAlpha = 1;
}

function drawEye(x, g, P, S2, A) {
  const { c, r } = g.eye;
  const ring = cdist(A, P) < 80 ? GOLD : A;
  x.save(); x.translate(c[0], c[1]);
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fillStyle = '#fbf6ea'; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
  x.beginPath(); x.arc(0, 0, r * .84, 0, TAU); x.fillStyle = ring; x.fill();
  // 菊瓣
  x.strokeStyle = rgba('#fbf6ea', .8); x.lineWidth = 2;
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; x.beginPath(); x.moveTo(Math.cos(a) * r * .62, Math.sin(a) * r * .62); x.lineTo(Math.cos(a) * r * .82, Math.sin(a) * r * .82); x.stroke(); }
  x.beginPath(); x.arc(0, 0, r * .6, 0, TAU); x.fillStyle = S2; x.fill();
  x.beginPath(); x.arc(0, 0, r * .44, 0, TAU); x.fillStyle = '#fbf6ea'; x.fill();
  x.beginPath(); x.arc(r * .04, 0, r * .3, 0, TAU); x.fillStyle = '#1a120d'; x.fill();
  x.beginPath(); x.arc(-r * .06, -r * .1, r * .09, 0, TAU); x.fillStyle = '#fff'; x.fill();
  x.restore();
}

function drawPoms(x, g, paper) {
  for (const p of g.poms) {
    x.strokeStyle = paper ? BAMBOO : INK; x.lineWidth = 3;
    x.beginPath(); x.moveTo(p.a[0], p.a[1]); x.lineTo(p.b[0], p.b[1]); x.stroke();
    if (!paper) {
      x.strokeStyle = '#1f6fb2'; x.lineWidth = 3; x.setLineDash([4, 5]);
      x.beginPath(); x.moveTo(p.a[0], p.a[1]); x.lineTo(p.b[0], p.b[1]); x.stroke(); x.setLineDash([]);
    }
    const gr = x.createRadialGradient(p.b[0] - p.r * .3, p.b[1] - p.r * .3, 2, p.b[0], p.b[1], p.r * 1.1);
    gr.addColorStop(0, '#ff6a55'); gr.addColorStop(.7, '#d81f1b'); gr.addColorStop(1, '#8e0f0c');
    x.fillStyle = gr;
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; x.beginPath(); x.arc(p.b[0] + Math.cos(a) * p.r * .55, p.b[1] + Math.sin(a) * p.r * .55, p.r * .55, 0, TAU); x.fill(); }
    x.beginPath(); x.arc(p.b[0], p.b[1], p.r * .8, 0, TAU); x.fill();
  }
}

function paintFin(x, part, cBase, cEdge, cBand, seeds) {
  x.save(); x.clip(part.path);
  const b = part.base; let R = 10; for (const q of part.edge) R = Math.max(R, Math.hypot(q[0] - b[0], q[1] - b[1]));
  const near = nearest(seeds, part.center[0], part.center[1]);
  const tint = near && near.d < 260 ? near.c : cEdge;
  const gr = x.createRadialGradient(b[0], b[1], R * .08, b[0], b[1], R);
  gr.addColorStop(0, cBase); gr.addColorStop(.5, mix(cBase, tint, .55)); gr.addColorStop(1, mix(tint, '#ffffff', .3));
  x.fillStyle = gr; x.fill(part.path);
  x.strokeStyle = rgba(mix(cBase, INK, .4), .55); x.lineWidth = 2.6;
  for (const [a, q] of part.ribs) { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(q[0], q[1]); x.stroke(); }
  x.strokeStyle = GOLD; x.lineWidth = 26; x.stroke(part.path);
  x.strokeStyle = cBand; x.lineWidth = 18; x.stroke(part.path);
  x.fillStyle = 'rgba(255,255,255,.92)';
  part.edge.forEach((q, i) => {
    if (i % 3) return;
    const dx = b[0] - q[0], dy = b[1] - q[1], l = Math.hypot(dx, dy) || 1;
    x.beginPath(); x.arc(q[0] + dx / l * 24, q[1] + dy / l * 24, 3.6, 0, TAU); x.fill();
  });
  if (part.kind === 'tail') {
    const c = part.center, a = Math.atan2(part.dir[1], part.dir[0]);
    cloud(x, c[0] - part.dir[0] * 10, c[1] - part.dir[1] * 10, 26, a, cBand);
  }
  x.restore();
}

function drawScale(x, c, ang, r, fill, inner, edge) {
  x.save(); x.translate(c[0], c[1]); x.rotate(ang);
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fillStyle = fill; x.fill();
  x.beginPath(); x.arc(-r * .16, 0, r * .62, 0, TAU); x.fillStyle = inner; x.fill();
  x.beginPath(); x.arc(-r * .26, 0, r * .3, 0, TAU); x.fillStyle = fill; x.fill();
  x.beginPath(); x.arc(0, 0, r - 1.5, Math.PI / 2, Math.PI * 1.5); x.lineWidth = 2.6; x.strokeStyle = edge; x.stroke();
  x.beginPath(); x.arc(0, 0, r - 5, Math.PI * .6, Math.PI * 1.4); x.lineWidth = 1.6; x.strokeStyle = GOLD; x.stroke();
  x.restore();
}

function renderFinal(g, strokes, S) {
  const st = g.st, pal = palette(strokes, st), [P, S2, A] = pal;
  const seeds = seedsOf(strokes, 14);
  const [c, x] = makeCanvas(S);

  // 1. 后层：腹鳍、背鳍、尾
  for (const f of g.back) paintFin(x, f, P, S2, A, seeds);
  paintFin(x, g.dorsal, P, A, S2, seeds);
  paintFin(x, g.tail, P, S2, A, seeds);

  // 2. 鱼身 + 鳞片（颜色由最近的笔画决定）
  x.save(); x.clip(g.body);
  x.fillStyle = mix(PAPER, S2, .14); x.fill(g.body);
  const r = st.hmax * .2, colStep = r * .9, rowStep = r * 1.45;
  const cols = Math.ceil(g.len * st.headT / colStep) + 1;
  for (let j = 0; j <= cols; j++) {
    const t = j / cols * st.headT, f = g.frame(t), hh = g.h(t);
    const ang = Math.atan2(f.g[1], f.g[0]);
    const rows = Math.ceil(hh * 1.15 / rowStep) + 1;
    for (let i = -rows; i <= rows; i++) {
      const v = (i + (j % 2) * .5) * rowStep;
      if (v > hh * st.top * 1.12 + r || -v > hh * st.bot * 1.12 + r) continue;
      const cp = add(f.p, f.n, v);
      const band = Math.abs(Math.round(v / rowStep));
      const base = band <= 1 ? mix(P, PAPER, .42) : band % 2 ? mix(S2, PAPER, .32) : mix(A, PAPER, .45);
      const nb = nearest(seeds, cp[0], cp[1]);
      const w = nb ? 1 - smooth(30, 210, nb.d) : 0;
      const fill = nb ? mix(base, nb.c, w * .92) : base;
      const other = nb && w > .3 ? pal[(pal.indexOf(nb.c) + 1) % pal.length] : PAPER;
      drawScale(x, cp, ang, r, fill, mix(other, '#ffffff', w > .3 ? .35 : .55), mix(fill, INK, .45));
    }
  }
  // 节环（竹篾 + 绑线）
  for (const s of g.segs) {
    x.strokeStyle = mix(P, INK, .3); x.lineWidth = 18; strokePoly(x, s);
    x.strokeStyle = GOLD; x.lineWidth = 9; strokePoly(x, s);
    x.strokeStyle = INK; x.lineWidth = 2.2; x.setLineDash([3, 6]); strokePoly(x, s); x.setLineDash([]);
  }
  x.restore();

  // 3. 鱼头
  x.save(); x.clip(g.head);
  x.fillStyle = P; x.fill(g.head);
  const ec = g.eye.c, hg = x.createRadialGradient(ec[0], ec[1], 10, ec[0], ec[1], st.hmax * 1.3);
  hg.addColorStop(0, rgba(mix(P, '#ffffff', .35), .9)); hg.addColorStop(1, rgba(P, 0));
  x.fillStyle = hg; x.fill(g.head);
  const ct = st.headT + (1 - st.headT) * .42;
  const ck = add(g.pt(ct), g.nm(ct), -g.h(ct) * .42);
  cloud(x, ck[0], ck[1], g.h(ct) * .24, 0, S2);
  // 额顶火焰纹
  for (let i = 0; i < 3; i++) {
    const t = st.headT + (1 - st.headT) * (.18 + i * .2), q = g.top(t, .8), n = g.nm(t);
    x.save(); x.translate(q[0], q[1]); x.rotate(Math.atan2(-n[0], n[1]) + Math.PI);
    x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(10, 10, 0, 26); x.quadraticCurveTo(-10, 10, 0, 0);
    x.fillStyle = A; x.fill(); x.strokeStyle = GOLD; x.lineWidth = 1.6; x.stroke(); x.restore();
  }
  x.restore();
  x.strokeStyle = INK; x.lineWidth = 20; strokePoly(x, g.gill);
  x.strokeStyle = A; x.lineWidth = 15; strokePoly(x, g.gill);
  x.strokeStyle = GOLD; x.lineWidth = 3.5; strokePoly(x, g.gill);

  // 4. 前层胸鳍
  for (const f of g.front) paintFin(x, f, P, S2, A, seeds);

  // 5. 笔画 → 华纹（仅画在鱼灯表面上）
  x.globalCompositeOperation = 'source-atop';
  // 5a. 上下对称回纹
  for (const s of strokes) {
    const pm = s.pts.map(p => ({ p, q: g.param(p) }));
    const inside = pm.filter(o => Math.abs(o.q.v) < 1.05 && o.q.t < st.headT && o.q.t > .02);
    if (inside.length < s.pts.length * .7 || pm.reduce((a, o) => a + Math.abs(o.q.v), 0) / pm.length < .18) continue;
    const mpts = pm.map(o => { const f = g.frame(o.q.t), hh = g.h(o.q.t); return add(f.p, f.n, -o.q.v * hh * (o.q.v > 0 ? st.bot : st.top)); });
    ornament(x, { c: mix(s.c, '#ffffff', .12), w: s.w, pts: mpts }, .62, .9);
  }
  // 5b. 原笔画描金
  for (const s of strokes) ornament(x, s, 1, 1);

  // 6. 明暗：圆柱体受光 + 宣纸纹理 + 骨架透影
  const bb = g.bbox, lg = x.createLinearGradient(0, bb.y, 0, bb.y + bb.h);
  lg.addColorStop(0, 'rgba(60,25,10,.18)'); lg.addColorStop(.32, 'rgba(255,255,255,0)'); lg.addColorStop(.46, 'rgba(255,255,255,.12)');
  lg.addColorStop(.62, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(60,25,10,.24)');
  x.fillStyle = lg; x.fillRect(0, 0, W, H);
  drawSkeleton(x, g, 'rgba(70,35,12,.1)', .9);
  x.fillStyle = x.createPattern(getPaperTex(), 'repeat'); x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';

  // 7. 眼、绒球、轮廓
  drawEye(x, g, P, S2, A);
  for (const p of g.order) { x.strokeStyle = INK; x.lineWidth = 2.6; x.stroke(p.path); }
  drawPoms(x, g, false);
  return { canvas: c, palette: pal };
}

/* 点灯：内部光源透出 */
function light(finalC, maskC, g, S) {
  const c = mk(finalC.width, finalC.height), x = c.getContext('2d');
  x.drawImage(finalC, 0, 0);
  const gl = mk(c.width, c.height), gx = gl.getContext('2d');
  gx.drawImage(maskC, 0, 0); gx.globalCompositeOperation = 'source-in';
  gx.scale(S, S);
  const cc = g.center, gr = gx.createRadialGradient(cc[0], cc[1], 10, cc[0], cc[1], g.len * .75);
  gr.addColorStop(0, 'rgba(255,226,160,.85)'); gr.addColorStop(.45, 'rgba(255,190,110,.42)'); gr.addColorStop(1, 'rgba(255,150,70,.08)');
  gx.fillStyle = gr; gx.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'screen'; x.drawImage(gl, 0, 0);
  // 光从内部照出竹骨架的剪影
  x.globalCompositeOperation = 'source-atop'; x.setTransform(S, 0, 0, S, 0, 0); x.lineCap = 'round';
  drawSkeleton(x, g, 'rgba(90,40,10,.16)', 1.1);
  return c;
}

/* 默认纹样笔画（选鱼卡片预览 / 未作画时使用） */
function demoStrokes(g) {
  const st = g.st, [c0, c1, c2] = st.palette, out = [];
  const z = []; for (let i = 0; i <= 8; i++) { const t = .06 + i / 8 * (st.headT - .1), f = g.frame(t); z.push(add(f.p, f.n, (i % 2 ? .62 : -.62) * g.h(t))); }
  out.push({ c: c1, w: 13, pts: z });
  const wv = []; for (let i = 0; i <= 30; i++) { const t = .05 + i / 30 * (st.headT - .08), f = g.frame(t); wv.push(add(f.p, f.n, Math.sin(i / 30 * TAU * 1.5) * .25 * g.h(t))); }
  out.push({ c: c2, w: 9, pts: wv });
  const tb = g.tail.base, te = g.tail.edge[Math.floor(g.tail.edge.length / 2)];
  out.push({ c: c2, w: 10, pts: [mid(tb, te, .2), mid(tb, te, .55), mid(tb, te, .8)] });
  return out;
}

const cache = new Map();
function geom(i) { if (!cache.has(i)) cache.set(i, build(STYLES[i])); return cache.get(i); }

return { W, H, STYLES, INKS, geom, renderPaper, renderFinal, light, mask, shadow, demoStrokes, seedsOf, mix, rgba };
})();
