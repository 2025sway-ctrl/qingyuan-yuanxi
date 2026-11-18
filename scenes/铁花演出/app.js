/* 铜梁龙 · 火树银花 —— 360° VR 全景
 * 1. 原图 + 水平镜像 → 4000×1116 无缝环带（0° 与 180° 两条接缝像素完全一致），按原图比例：360° × 100.4°
 * 2. Pannellum 以“动态纹理”渲染：人物、纸龙的动作直接画进全景纹理，随视角自然透视
 * 3. 铁花火星画在屏幕空间叠加层上，用与 Pannellum 相同的投影公式定位，任意缩放都保持锐利
 */
(() => {
'use strict';

/* ============================ 常量 / 工具 ============================ */
const SRC_W = 2000, SRC_H = 1116;          // 原图尺寸
const PW = SRC_W * 2;                       // 镜像拼接后宽度
const VAOV = 360 * SRC_H / PW;              // 竖直视场 ≈ 100.4°（保持原图像素比例）
const D2R = Math.PI / 180, TAU = Math.PI * 2;
const DEBUG = /[?&]debug/.test(location.search), DEBUG_DRAW = /[?&]debug=1/.test(location.search);
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const yawOf = x => x / PW * 360 - 180;               // 原图 x → 偏航角（原图位于 -180°…0°）
const pitchOf = y => (0.5 - y / SRC_H) * VAOV;       // 原图 y → 俯仰角
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/* ============================ 画面区域（原图像素） ============================ */
const FEATHER = 12;
const DRAGON = { x0: 636, y0: 612, x1: 1606, y1: 778 };       // 纸龙所在的条带
// 龙身中线（用于沿龙身抖落火星）
const DRAGON_LINE = [[650, 722], [760, 714], [880, 696], [980, 680], [1060, 672], [1140, 702], [1240, 742], [1340, 744], [1440, 728], [1520, 710], [1585, 696]];
const STRIKERS = [   // 打铁花艺人：dir=1 面朝右
  { x0: 380, y0: 660, x1: 584, y1: 944, dir: 1, emit: [574, 790], fan: [-82, -18], off: 0 },
  { x0: 1362, y0: 708, x1: 1516, y1: 944, dir: -1, emit: [1362, 796], fan: [-162, -98], off: 0.55 },
];
const DANCERS = [    // 舞龙者
  { x0: 646, y0: 712, x1: 724, y1: 872 },
  { x0: 736, y0: 722, x1: 820, y1: 890 },
  { x0: 834, y0: 734, x1: 970, y1: 918 },
  { x0: 1030, y0: 734, x1: 1194, y1: 912 },
  { x0: 1284, y0: 734, x1: 1360, y1: 882 },
  { x0: 1510, y0: 742, x1: 1592, y1: 892 },
];
const CANOPY = { x: 1002, y: 300, rx: 250, ry: 105 };           // 铁花棚
const FLOOR_Y = 926, WATER_Y = 950;                              // 舞台面 / 倒影水线
const VP = { x: 1000, y: 540 };                                  // 两侧墙面流光的消失点

/* ============================ 状态 ============================ */
let viewer, ready = false;
let fireOn = false, dragonOn = false;          // 按钮状态
let fireI = 0, dragonI = 0;                    // 平滑后的强度 0…1
let T = 0;
const HOME = { yaw: yawOf(1000), pitch: 2, hfov: 100 };

/* ============================ 全景纹理 ============================ */
let base, plate, comp, cctx, pano, pctx, dragonSprite;
const sprites = [];

function buildTextures(img) {
  base = mk(SRC_W, SRC_H);
  const bctx = base.getContext('2d');
  bctx.drawImage(img, 0, 0, SRC_W, SRC_H);

  // ---- 背景修补板：把会动的人物/龙身“核心区”抹掉，填入两侧插值 + 模糊，避免动起来时出现重影 ----
  plate = mk(SRC_W, SRC_H);
  const plx = plate.getContext('2d', { willReadFrequently: true });
  plx.drawImage(base, 0, 0);
  const id = plx.getImageData(0, 0, SRC_W, SRC_H), d = id.data;
  const px = (x, y, c) => d[(y * SRC_W + x) * 4 + c];
  const cores = [];
  const core = r => ({ x0: r.x0 + FEATHER, y0: r.y0 + FEATHER, x1: r.x1 - FEATHER, y1: r.y1 - FEATHER });
  // 龙身：上下插值
  {
    const c = core(DRAGON); cores.push(c);
    for (let x = c.x0; x < c.x1; x++) {
      const top = [0, 1, 2].map(k => (px(x, c.y0 - 1, k) + px(x, c.y0 - 2, k) + px(x, c.y0 - 3, k)) / 3);
      const bot = [0, 1, 2].map(k => (px(x, c.y1, k) + px(x, c.y1 + 1, k) + px(x, c.y1 + 2, k)) / 3);
      for (let y = c.y0; y < c.y1; y++) {
        const t = (y - c.y0) / (c.y1 - c.y0), n = rand(-6, 6), i = (y * SRC_W + x) * 4;
        for (let k = 0; k < 3; k++) d[i + k] = top[k] * (1 - t) + bot[k] * t + n;
      }
    }
  }
  // 人物：左右插值
  for (const r of [...DANCERS, ...STRIKERS]) {
    const c = core(r); cores.push(c);
    for (let y = c.y0; y < c.y1; y++) {
      const L = [0, 1, 2].map(k => (px(c.x0 - 1, y, k) + px(c.x0 - 2, y, k) + px(c.x0 - 3, y, k)) / 3);
      const R = [0, 1, 2].map(k => (px(c.x1, y, k) + px(c.x1 + 1, y, k) + px(c.x1 + 2, y, k)) / 3);
      for (let x = c.x0; x < c.x1; x++) {
        const t = (x - c.x0) / (c.x1 - c.x0), n = rand(-6, 6), i = (y * SRC_W + x) * 4;
        for (let k = 0; k < 3; k++) d[i + k] = L[k] * (1 - t) + R[k] * t + n;
      }
    }
  }
  plx.putImageData(id, 0, 0);
  const tmp = mk(SRC_W, SRC_H); tmp.getContext('2d').drawImage(plate, 0, 0);
  for (const c of cores) {
    plx.save(); plx.beginPath(); plx.rect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0); plx.clip();
    plx.filter = 'blur(7px)'; plx.drawImage(tmp, 0, 0); plx.restore();
  }

  // ---- 精灵：从原图裁出，边缘羽化 ----
  dragonSprite = makeSprite(DRAGON);
  for (const r of STRIKERS) sprites.push(Object.assign({ kind: 'striker', img: makeSprite(r) }, r));
  DANCERS.forEach((r, i) => sprites.push(Object.assign({ kind: 'dancer', idx: i, img: makeSprite(r) }, r)));

  comp = mk(SRC_W, SRC_H); cctx = comp.getContext('2d');
  pano = mk(PW, SRC_H); pctx = pano.getContext('2d');
  composeStatic();
}

function makeSprite(r) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0, c = mk(w, h), x = c.getContext('2d');
  x.drawImage(base, r.x0, r.y0, w, h, 0, 0, w, h);
  const m = mk(w, h), mx = m.getContext('2d');
  mx.filter = `blur(${FEATHER / 4}px)`; mx.fillStyle = '#fff';
  mx.fillRect(FEATHER / 2, FEATHER / 2, w - FEATHER, h - FEATHER);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
  return c;
}

// 把左半（原图）复制并镜像到右半，形成首尾无缝的 360° 环带
function mirrorToPano(src) {
  pctx.drawImage(src, 0, 0);
  pctx.save(); pctx.translate(PW, 0); pctx.scale(-1, 1); pctx.drawImage(src, 0, 0); pctx.restore();
}
function composeStatic() { mirrorToPano(base); }

// 纸龙的行波：自龙头向龙尾传递，龙头摆幅更大
const WAVE_K = TAU / 470, WAVE_W = TAU * 0.72;
function wave(x) {
  const env = smooth(650, 800, x) * (0.72 + 0.38 * smooth(1300, 1590, x));
  return 12 * dragonI * env * Math.sin(x * WAVE_K + T * WAVE_W);
}
function waveVel(x) {
  const env = smooth(650, 800, x) * (0.72 + 0.38 * smooth(1300, 1590, x));
  return 12 * dragonI * env * WAVE_W * Math.cos(x * WAVE_K + T * WAVE_W);
}

// 打铁动作：蓄力后仰 → 猛击 → 回位（0…1 一个周期）
const STRIKE_T = 1.1, STRIKE_AT = 0.66;
function strikePose(ph) {
  if (ph < 0.6) return -ease(ph / 0.6);
  if (ph < 0.68) return -1 + 2 * (1 - Math.pow(1 - (ph - 0.6) / 0.08, 3));
  return 1 - ease((ph - 0.68) / 0.32);
}

function composeAnimated() {
  cctx.drawImage(plate, 0, 0);
  // 纸龙：竖条切片按行波位移
  const S = 6, h = DRAGON.y1 - DRAGON.y0;
  for (let x = DRAGON.x0; x < DRAGON.x1; x += S) {
    const w = Math.min(S, DRAGON.x1 - x);
    cctx.drawImage(dragonSprite, x - DRAGON.x0, 0, w, h, x, DRAGON.y0 + wave(x + w / 2), w + 0.6, h);
  }
  // 人物：以脚底为锚点的剪切 + 伸缩（双脚不离地，上身摆动）
  for (const s of sprites) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, bx = (s.x0 + s.x1) / 2, by = s.y1;
    let sx = 0, lift = 0;
    if (s.kind === 'striker') {
      const pose = strikePose(((T / STRIKE_T + s.off) % 1 + 1) % 1);
      const a = smooth(0.05, 0.6, fireI);
      sx = s.dir * pose * 10 * a;
      lift = -pose * 4 * a;
    } else {
      const i = s.idx;
      sx = Math.sin(T * 2.4 + i * 1.3) * 2.5 * fireI + Math.sin(T * 1.7 + i * 0.9) * 7 * dragonI;
      lift = Math.sin(T * 3.1 + i) * 2 * fireI * (1 - dragonI) - wave(bx) * 0.8;
    }
    cctx.setTransform(1, 0, -sx / h, 1 + lift / h, bx, by);
    cctx.drawImage(s.img, s.x0 - bx, -h);
  }
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  mirrorToPano(comp);
}

/* ============================ 火星粒子（原图像素坐标系） ============================ */
const G = 430, MAX_P = 3800;
const parts = [];
const flashes = [];   // {x,y,r,a,decay}

function spark(x, y, vx, vy, o = {}) {
  if (parts.length >= MAX_P) return;
  parts.push({
    x, y, vx, vy, age: 0,
    life: o.life ?? rand(0.8, 1.8), size: o.size ?? rand(0.9, 1.9), heat: o.heat ?? rand(0.8, 1),
    g: o.g ?? 1, drag: o.drag ?? 0.9, trail: o.trail ?? 0.035, bounce: o.bounce ?? 1,
    split: o.split ?? -1, acc: o.acc ?? 0, refl: o.refl ?? true,
  });
}
function flash(x, y, r, a, decay = 3) { flashes.push({ x, y, r, a, decay }); }

function burst(cx, cy, n, sMin, sMax, o = {}) {
  for (let i = 0; i < n; i++) {
    const ang = rand(0, TAU), sp = rand(sMin, sMax) * Math.sqrt(Math.random());
    spark(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.85 - 40, Object.assign({
      life: rand(0.7, 1.7), heat: 1, split: Math.random() < 0.35 ? rand(0.25, 0.6) : -1, size: rand(1, 2.2),
    }, o));
  }
}

function strike(s) {
  const [ex, ey] = s.emit;
  const n = Math.round(70 + 70 * fireI);
  for (let i = 0; i < n; i++) {
    const ang = rand(s.fan[0], s.fan[1]) * D2R, sp = rand(260, 760);
    spark(ex + rand(-6, 6), ey + rand(-6, 6), Math.cos(ang) * sp, Math.sin(ang) * sp, {
      life: rand(0.9, 2.0), heat: 1, size: rand(1, 2.3), trail: 0.04, drag: 0.7,
      split: Math.random() < 0.3 ? rand(0.35, 0.8) : -1,
    });
  }
  // 低处横飞的碎火
  for (let i = 0; i < 30; i++) {
    const ang = (s.dir > 0 ? rand(-25, 20) : rand(160, 205)) * D2R, sp = rand(120, 420);
    spark(ex, ey, Math.cos(ang) * sp, Math.sin(ang) * sp, { life: rand(0.4, 0.9), size: rand(0.8, 1.4), heat: 0.95 });
  }
  flash(ex, ey, 120, 0.9, 4);
  flash(CANOPY.x + rand(-120, 120), CANOPY.y + rand(-30, 50), 260, 0.35, 2);
  Sound.clang(s.dir);
}

let burstClock = 0;
function emit(dt) {
  const f = fireI, d = dragonI;
  // 铁花棚：持续迸发
  let n = poisson(260 * f * dt);
  while (n--) {
    const a = rand(0, TAU), r = Math.sqrt(Math.random());
    const x = CANOPY.x + Math.cos(a) * r * CANOPY.rx, y = CANOPY.y + Math.sin(a) * r * CANOPY.ry;
    const dx = x - CANOPY.x, dy = y - CANOPY.y, l = Math.hypot(dx, dy) || 1, sp = rand(80, 380);
    spark(x, y, dx / l * sp + rand(-40, 40), dy / l * sp * 0.7 - rand(60, 220), {
      life: rand(0.7, 1.9), split: Math.random() < 0.22 ? rand(0.25, 0.6) : -1,
    });
  }
  // 花棚下的铁花雨（舞龙时覆盖整个舞台）
  n = poisson((140 * f + 240 * d) * dt);
  while (n--) {
    const wide = Math.random() < d * 0.75;
    const x = wide ? rand(600, 1660) : rand(700, 1300), y = wide ? rand(360, 470) : rand(420, 480);
    spark(x, y, rand(-40, 40), rand(20, 140), { life: rand(2, 2.8), size: rand(0.8, 1.7), heat: rand(0.75, 1), trail: 0.05, bounce: 1 });
  }
  // 两侧墙面：向外流动的金色流光
  n = poisson((90 * f + 50 * d) * dt);
  while (n--) {
    const left = Math.random() < 0.5;
    const ang = left ? Math.PI + rand(-0.32, 0.78) : rand(-0.78, 0.32);
    const r = rand(400, 720), x = VP.x + Math.cos(ang) * r * 1.25, y = VP.y + Math.sin(ang) * r * 0.75;
    const sp = rand(40, 110);
    spark(x, y, Math.cos(ang) * sp * 1.25, Math.sin(ang) * sp * 0.75, {
      life: rand(1.4, 2.8), size: rand(0.7, 1.5), heat: rand(0.55, 0.85), g: 0, drag: 0, trail: 0.16, acc: 1.3, bounce: 0, refl: false,
    });
  }
  // 舞龙：龙身随波甩出火星
  n = poisson(90 * d * dt);
  while (n--) {
    const x = rand(670, 1590), y = dragonY(x) + wave(x) + rand(-14, 14);
    spark(x, y, rand(-60, 120), waveVel(x) * 1.6 - rand(20, 120), { life: rand(0.5, 1.2), size: rand(0.8, 1.6), heat: 0.95 });
  }
  // 花棚爆花
  burstClock -= dt;
  if (burstClock <= 0 && f + d * 0.6 > 0.4) {
    burstClock = rand(0.7, 1.6) / Math.max(0.5, f + d * 0.4);
    const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 0.8;
    const bx = CANOPY.x + Math.cos(a) * r * CANOPY.rx, by = CANOPY.y + Math.sin(a) * r * CANOPY.ry;
    burst(bx, by, Math.round(rand(70, 120) * Math.max(f, d * 0.7)), 160, 560);
    flash(bx, by, 300, 0.55, 2.5);
    Sound.crackle(0.6);
  }
}
function dragonY(x) {
  for (let i = 1; i < DRAGON_LINE.length; i++) {
    const [x1, y1] = DRAGON_LINE[i];
    if (x <= x1) { const [x0, y0] = DRAGON_LINE[i - 1]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return DRAGON_LINE[DRAGON_LINE.length - 1][1];
}
function poisson(m) { let n = Math.floor(m); if (Math.random() < m - n) n++; return n; }

const lastPh = [0, 0];
function simulate(dt) {
  // 打铁节奏：与人物动作同一相位
  if (fireI > 0.3) STRIKERS.forEach((s, i) => {
    const ph = ((T / STRIKE_T + s.off) % 1 + 1) % 1;
    if (lastPh[i] < STRIKE_AT && ph >= STRIKE_AT) strike(s);
    lastPh[i] = ph;
  });
  emit(dt);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.acc) { const k = 1 + p.acc * dt; p.vx *= k; p.vy *= k; }
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.vy += G * p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    let dead = p.age >= p.life || p.y > SRC_H + 20 || p.y < -300;
    // 分叉开花——铁花特有的“二次绽放”
    if (!dead && p.split > 0 && p.age > p.split) {
      p.split = -1;
      const k = 3 + (Math.random() * 4 | 0);
      for (let j = 0; j < k; j++) {
        const a = rand(0, TAU), sp = rand(60, 200);
        spark(p.x, p.y, p.vx * 0.3 + Math.cos(a) * sp, p.vy * 0.3 + Math.sin(a) * sp, {
          life: rand(0.3, 0.75), size: p.size * 0.7, heat: p.heat * 0.95, trail: 0.03,
        });
      }
      if (Math.random() < 0.5) dead = true;
    }
    // 落地弹跳 / 溅射
    if (!dead && p.y > FLOOR_Y && p.vy > 0 && p.x > 360 && p.x < 1680 && p.g > 0) {
      if (p.bounce > 0) {
        p.y = FLOOR_Y; p.vy *= -rand(0.18, 0.35); p.vx = p.vx * 0.5 + rand(-60, 60); p.bounce--;
        if (Math.random() < 0.25) for (let j = 0; j < 2; j++) spark(p.x, FLOOR_Y - 1, rand(-90, 90), rand(-150, -50), { life: rand(0.2, 0.45), size: 0.7, heat: p.heat * 0.85, bounce: 0 });
      } else dead = true;
    }
    if (dead) { parts[i] = parts[parts.length - 1]; parts.pop(); }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.a -= f.decay * dt * f.a + 0.01 * dt;
    if (f.a <= 0.01) flashes.splice(i, 1);
  }
}

/* ============================ 屏幕叠加层：投影 + 绘制 ============================ */
const fx = $('fx'), fctx = fx.getContext('2d');
let cw = 0, ch = 0, dpr = 1, overlayDirty = false;
function resizeFx() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = fx.clientWidth; ch = fx.clientHeight;
  fx.width = Math.round(cw * dpr); fx.height = Math.round(ch * dpr);
}
// 相机参数（每帧更新一次）
const cam = { sp: 0, cp: 1, yaw: 0, f: 1, k: 1 };
function updateCam() {
  const p = viewer.getPitch() * D2R, y = viewer.getYaw() * D2R, h = viewer.getHfov() * D2R;
  cam.sp = Math.sin(p); cam.cp = Math.cos(p); cam.yaw = y;
  cam.f = cw / 2 / Math.tan(h / 2);
  cam.k = cam.f * TAU / PW;          // 视中心处：屏幕像素 / 原图像素
}
const KX = TAU / PW, KY = VAOV * D2R / SRC_H;
const out = [0, 0];
// 原图坐标 (x,y) 在第 copy 份（0 原图 / 1 镜像）上的屏幕坐标；不可见返回 false
function project(x, y, copy) {
  const yaw = copy ? Math.PI - x * KX : x * KX - Math.PI;
  const pt = (SRC_H / 2 - y) * KY;
  const sp = Math.sin(pt), cp = Math.cos(pt), dy = cam.yaw - yaw, cy = Math.cos(dy);
  const z = sp * cam.sp + cp * cy * cam.cp;
  if (z < 0.08) return false;
  out[0] = cw / 2 - cam.f * Math.sin(dy) * cp / z;
  out[1] = ch / 2 - cam.f * (sp * cam.cp - cp * cy * cam.sp) / z;
  return out[0] > -80 && out[0] < cw + 80 && out[1] > -80 && out[1] < ch + 80;
}

// 温度色阶：白热 → 金 → 橙 → 暗红
const COLORS = ['255,251,232', '255,234,170', '255,208,110', '255,172,64', '255,128,36', '226,82,22', '150,44,12'];
const ALPHA = [1, .96, .92, .86, .74, .58, .4];
const NB = COLORS.length * 2;
const buckets = Array.from({ length: NB }, () => []);
const rbuckets = Array.from({ length: NB }, () => []);

function drawOverlay() {
  const idle = !parts.length && !flashes.length && fireI < 0.003 && dragonI < 0.003;
  if (idle && !DEBUG_DRAW) {
    if (overlayDirty) { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fx.width, fx.height); overlayDirty = false; }
    return;
  }
  overlayDirty = true;
  updateCam();
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fctx.clearRect(0, 0, cw, ch);
  fctx.globalCompositeOperation = 'lighter';

  // ---- 光晕 ----
  const glows = [];
  const amb = Math.max(fireI, dragonI * 0.7);
  if (amb > 0.01) {
    const fl = 0.8 + 0.2 * Math.sin(T * 17) * Math.sin(T * 7.3);
    glows.push([CANOPY.x, CANOPY.y + 30, 330, 0.2 * amb * fl, '255,170,70']);
    glows.push([1010, 480, 200, 0.16 * amb * fl, '255,200,120']);
    glows.push([1000, FLOOR_Y - 10, 520, 0.08 * amb, '255,140,50']);
  }
  for (const f of flashes) glows.push([f.x, f.y, f.r, f.a * 0.5, '255,190,100']);
  for (const [x, y, r, a, c] of glows) for (let copy = 0; copy < 2; copy++) {
    if (!project(x, y, copy)) continue;
    const R = r * cam.k, g = fctx.createRadialGradient(out[0], out[1], 0, out[0], out[1], R);
    g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(0.4, `rgba(${c},${a * 0.35})`); g.addColorStop(1, `rgba(${c},0)`);
    fctx.fillStyle = g; fctx.fillRect(out[0] - R, out[1] - R, R * 2, R * 2);
  }

  // ---- 火星：按色阶分桶批量描线 ----
  for (const b of buckets) b.length = 0;
  for (const b of rbuckets) b.length = 0;
  for (const p of parts) {
    const t = p.age / p.life;
    const heat = p.heat * Math.pow(1 - t, 0.75);
    const ci = heat > 0.86 ? 0 : heat > 0.72 ? 1 : heat > 0.56 ? 2 : heat > 0.42 ? 3 : heat > 0.28 ? 4 : heat > 0.14 ? 5 : 6;
    const bi = ci * 2 + (p.size > 1.45 ? 1 : 0);
    const tx = p.x - p.vx * p.trail, ty = p.y - p.vy * p.trail;
    for (let copy = 0; copy < 2; copy++) {
      if (!project(p.x, p.y, copy)) continue;
      const hx = out[0], hy = out[1];
      if (!project(tx, ty, copy)) continue;
      buckets[bi].push(out[0], out[1], hx, hy);
      // 水面倒影
      if (p.refl && p.y > 470 && p.y < WATER_Y) {
        const ry = 2 * WATER_Y - p.y, rty = 2 * WATER_Y - ty, wob = Math.sin(ry * 0.09 + T * 5) * 3;
        if (project(p.x + wob, ry, copy)) { const a = out[0], b = out[1]; if (project(tx + wob, rty, copy)) rbuckets[bi].push(out[0], out[1], a, b); }
      }
    }
  }
  fctx.lineCap = 'round';
  const kw = clamp(cam.k, 0.6, 3.2);
  const stroke = (arr, color, alpha, width) => {
    if (!arr.length) return;
    fctx.strokeStyle = `rgba(${color},${alpha})`; fctx.lineWidth = width; fctx.beginPath();
    for (let i = 0; i < arr.length; i += 4) { fctx.moveTo(arr[i], arr[i + 1]); fctx.lineTo(arr[i + 2], arr[i + 3]); }
    fctx.stroke();
  };
  for (let bi = 0; bi < NB; bi++) {
    const ci = bi >> 1, w = (bi & 1 ? 1.7 : 1.05) * kw;
    stroke(rbuckets[bi], COLORS[ci], ALPHA[ci] * 0.28, w * 1.2);
    if (ci < 3) stroke(buckets[bi], COLORS[ci + 1], 0.12, w * 4.2);   // 泛光
    stroke(buckets[bi], COLORS[ci], ALPHA[ci], w);
  }
  fctx.globalCompositeOperation = 'source-over';
  if (DEBUG_DRAW) drawDebug();
}

function drawDebug() {
  const rects = [DRAGON, ...STRIKERS, ...DANCERS];
  fctx.lineWidth = 1.5; fctx.font = '12px sans-serif';
  rects.forEach((r, i) => {
    fctx.strokeStyle = i === 0 ? '#0ff' : i < 3 ? '#f0f' : '#0f0';
    fctx.beginPath(); let first = true;
    for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [r.x0, r.y0]]) {
      if (!project(x, y, 0)) continue;
      first ? fctx.moveTo(out[0], out[1]) : fctx.lineTo(out[0], out[1]); first = false;
    }
    fctx.stroke();
  });
  fctx.strokeStyle = '#ff0'; fctx.beginPath();
  DRAGON_LINE.forEach(([x, y], i) => { if (project(x, y, 0)) i ? fctx.lineTo(out[0], out[1]) : fctx.moveTo(out[0], out[1]); });
  fctx.stroke();
  for (const s of STRIKERS) if (project(s.emit[0], s.emit[1], 0)) { fctx.fillStyle = '#f00'; fctx.fillRect(out[0] - 4, out[1] - 4, 8, 8); }
  fctx.strokeStyle = '#f80'; fctx.beginPath();
  for (let a = 0; a <= TAU + 0.01; a += 0.2) { const ok = project(CANOPY.x + Math.cos(a) * CANOPY.rx, CANOPY.y + Math.sin(a) * CANOPY.ry, 0); if (ok) a ? fctx.lineTo(out[0], out[1]) : fctx.moveTo(out[0], out[1]); }
  fctx.stroke();
  fctx.strokeStyle = '#08f'; fctx.beginPath();
  if (project(360, FLOOR_Y, 0)) fctx.moveTo(out[0], out[1]); if (project(1680, FLOOR_Y, 0)) fctx.lineTo(out[0], out[1]);
  if (project(0, WATER_Y, 0)) fctx.moveTo(out[0], out[1]); if (project(1990, WATER_Y, 0)) fctx.lineTo(out[0], out[1]);
  fctx.stroke();
}

/* ============================ 主循环 ============================ */
let last = performance.now(), texLive = false, idleFrames = 0;
const PERF = { sim: 0, comp: 0, draw: 0, frames: 0 };
const DBG = { pause: false };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ready && !DBG.pause) {
    T += dt;
    const fT = fireOn ? 1 : dragonOn ? 0.75 : 0, dT = dragonOn ? 1 : 0;
    fireI += (fT - fireI) * (1 - Math.exp(-dt * (fT > fireI ? 2.4 : 1.6)));
    dragonI += (dT - dragonI) * (1 - Math.exp(-dt * (dT > dragonI ? 1.6 : 1.4)));
    if (fireI < 0.002 && !fireOn && !dragonOn) fireI = 0;
    if (dragonI < 0.002 && !dragonOn) dragonI = 0;
    const t0 = performance.now(); simulate(dt); PERF.sim += performance.now() - t0;

    const animating = fireI > 0 || dragonI > 0;
    if (animating) {
      const t1 = performance.now(); composeAnimated(); PERF.comp += performance.now() - t1; idleFrames = 0;
      if (!texLive) { texLive = true; viewer.setUpdate(true); }
    } else if (texLive) {
      if (idleFrames++ === 0) composeStatic();
      if (idleFrames > 3) { texLive = false; viewer.setUpdate(false); }
    }
    const t2 = performance.now(); drawOverlay(); PERF.draw += performance.now() - t2; PERF.frames++;
  }
  requestAnimationFrame(frame);
}

/* ============================ 交互 ============================ */
const cards = [...document.querySelectorAll('.card')];
const poem = $('poem');
let poemTimer = 0;
splitChars(poem);

function setMode(mode, on) {
  if (mode === 'fire') fireOn = on; else dragonOn = on;
  cards.forEach(c => {
    const a = c.dataset.mode === 'fire' ? fireOn : dragonOn;
    c.classList.toggle('active', a); c.setAttribute('aria-pressed', a);
    c.querySelector('.state').textContent = a ? '再次点击关闭' : '未开启';
  });
  document.querySelectorAll('.hs').forEach(h => h.classList.toggle('active', h.dataset.mode === 'fire' ? fireOn : dragonOn));
  $('cardsHint').style.display = 'none';
  stopRotate();
  const vmax = fovMax();
  if (on && mode === 'fire') {
    viewer.lookAt(6, yawOf(1000), Math.min(100, vmax), 1400);
    Sound.gong(); Sound.crackle(1);
  }
  if (mode === 'dragon') {
    clearTimeout(poemTimer);
    if (on) {
      viewer.lookAt(1, yawOf(1110), Math.min(102, vmax), 1500);
      Sound.drumRoll();
      poemTimer = setTimeout(() => { poem.classList.remove('show'); void poem.offsetWidth; poem.classList.add('show'); }, 1500);
    } else poem.classList.remove('show');
  }
}
cards.forEach(c => c.addEventListener('click', () => {
  const m = c.dataset.mode; setMode(m, !(m === 'fire' ? fireOn : dragonOn));
}));
poem.querySelector('.close').onclick = () => poem.classList.remove('show');

// 把文字拆成单字，逐字“晕墨”显现
function splitChars(root) {
  let i = 0;
  root.querySelectorAll('.ln').forEach((ln, li) => {
    const step = li === 0 ? 70 : li === 1 ? 55 : 16, start = [0, 1300, 2900][li] ?? 0;
    let k = 0;
    // 文本中 {…} 表示金色强调字
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        // 分词：数字/字母连写；收尾标点并入前一字，开头标点并入后一字（避免标点落在行首/行尾）
        const toks = [];
        let open = '', hl = false;
        const esc = c => c.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        for (const ch of n.textContent.match(/[0-9A-Za-z]+|[\s\S]/g) || []) {
          if (ch === '{' || ch === '}') { hl = ch === '{'; continue; }
          const h = hl ? `<em>${esc(ch)}</em>` : esc(ch);
          if (/^[“‘（(《【]$/.test(ch)) { open += h; continue; }
          if (/^[”’）)》】，。、；：！？]$/.test(ch) && toks.length && !open) { toks[toks.length - 1] += h; continue; }
          toks.push(open + h); open = '';
        }
        if (open) toks.push(open);
        const frag = document.createDocumentFragment();
        for (const tk of toks) {
          const s = document.createElement('span'); s.className = 'ch'; s.innerHTML = tk;
          s.style.setProperty('--d', start + k++ * step); frag.appendChild(s); i++;
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
    walk(ln);
  });
}

/* ---------- 视角 ---------- */
function fovMax() {
  const aspect = innerWidth / innerHeight;
  return Math.min(112, 2 * Math.atan(Math.tan(46 * D2R) * aspect) / D2R);   // 竖直视场不超过 92°（全景高 100°）
}
let rotating = false;
function startRotate() { rotating = true; viewer.startAutoRotate(-2.2); $('bRotate').classList.add('on'); }
function stopRotate() { if (!rotating) return; rotating = false; viewer.stopAutoRotate(); $('bRotate').classList.remove('on'); }

function initViewer() {
  HOME.hfov = Math.min(100, fovMax() * 0.95);
  viewer = pannellum.viewer('pano', {
    type: 'equirectangular',
    panorama: pano, dynamic: true, dynamicUpdate: true, autoLoad: true,
    haov: 360, vaov: VAOV, vOffset: 0,
    minPitch: -VAOV / 2, maxPitch: VAOV / 2, avoidShowingBackground: true,
    yaw: HOME.yaw, pitch: HOME.pitch, hfov: HOME.hfov, minHfov: 36, maxHfov: fovMax(),
    showControls: false, compass: false, draggable: true, mouseZoom: true, keyboardZoom: true,
    doubleClickZoom: true, friction: 0.13, touchPanSpeedCoeffFactor: 1,
    backgroundColor: [0, 0, 0],
    hotSpots: [
      { pitch: pitchOf(250), yaw: yawOf(1000), cssClass: 'hs', createTooltipFunc: hsTip, createTooltipArgs: { label: '打铁花', mode: 'fire' } },
      { pitch: pitchOf(676), yaw: yawOf(1560), cssClass: 'hs', createTooltipFunc: hsTip, createTooltipArgs: { label: '舞龙', mode: 'dragon' } },
    ],
  });
  const onReady = () => {
    if (ready) return;
    viewer.setUpdate(false);
    ready = true; resizeFx();
    $('enter').disabled = false; $('status').textContent = '拖动环视 · 点击左侧提示框互动';
  };
  viewer.on('load', onReady);
  // 动态纹理模式下 Pannellum 不一定触发 load 事件，轮询兜底
  const poll = setInterval(() => { if (viewer.isLoaded && viewer.isLoaded()) { clearInterval(poll); onReady(); } }, 120);
  viewer.on('error', e => { $('status').textContent = '加载失败：' + e; });
  ['mousedown', 'touchstart'].forEach(ev => viewer.on(ev, () => { $('hint').classList.add('hide'); stopRotate(); }));
}
function hsTip(div, a) {
  div.dataset.mode = a.mode;
  div.innerHTML = `<span class="hs-ring"></span><span class="hs-ring r2"></span><span class="hs-dot"></span><span class="hs-label">${a.label}</span>`;
  const go = e => { e.stopPropagation(); setMode(a.mode, !(a.mode === 'fire' ? fireOn : dragonOn)); };
  div.addEventListener('click', go);
  div.addEventListener('mousedown', e => e.stopPropagation());
  div.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
}

/* ---------- 工具栏 ---------- */
function bindToolbar() {
  const zoom = k => { const h = clamp(viewer.getHfov() + k, 36, fovMax()); viewer.setHfov(h, 400); };
  $('bZoomIn').onclick = () => zoom(-12);
  $('bZoomOut').onclick = () => zoom(12);
  $('bHome').onclick = () => { stopRotate(); viewer.lookAt(HOME.pitch, HOME.yaw, Math.min(100, fovMax() * 0.95), 1000); };
  $('bRotate').onclick = () => rotating ? stopRotate() : startRotate();
  $('bMusic').onclick = () => setMusicIcon(Sound.toggle());
  $('bFull').onclick = () => {
    const el = $('app');
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  };
  addEventListener('resize', () => { resizeFx(); viewer && viewer.setHfovBounds([36, fovMax()]); });
}
function setMusicIcon(on) { $('bMusic').classList.toggle('on', on); $('bMusic').querySelector('.mute').style.display = on ? 'none' : ''; }

$('enter').onclick = () => {
  $('intro').classList.add('gone');
  Sound.start().then(setMusicIcon);
  startRotate();
  setTimeout(() => $('hint').classList.add('hide'), 7000);
};

/* ============================ 声音 ============================
 * 背景音乐：《祥云迎春》（audio/xiangyun-yingchun.mp3），循环播放
 * 互动音效（打铁金属声、火星噼啪、锣、鼓点）由 Web Audio 实时合成，叠加在音乐之上
 */
const Sound = (() => {
  const BGM_SRC = 'audio/xiangyun-yingchun.mp3', BGM_VOL = 0.8;
  const bgm = $('bgm');
  let ac, master, sfx, noise, on = false, fadeTimer = 0;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.42; sfx.connect(master);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  // 音量淡入淡出，开关音乐不突兀
  function fadeTo(target, ms, then) {
    clearInterval(fadeTimer);
    const from = bgm.volume, t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      bgm.volume = from + (target - from) * k;
      if (k >= 1) { clearInterval(fadeTimer); then && then(); }
    }, 30);
  }
  async function playBgm() {
    if (!bgm.getAttribute('src')) { bgm.src = BGM_SRC; bgm.preload = 'auto'; }
    bgm.volume = 0;
    try { await bgm.play(); fadeTo(BGM_VOL, 1800); return true; }
    catch (e) { console.warn('背景音乐无法播放：', e); return false; }
  }
  async function start() { ensure(); on = true; await playBgm(); return on; }
  function toggle() {
    ensure(); on = !on;
    master.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.08);
    if (on) playBgm(); else fadeTo(0, 500, () => bgm.pause());
    return on;
  }

  /* ---- 合成音效 ---- */
  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  function noiseSrc(t, dur) { const s = ac.createBufferSource(); s.buffer = noise; s.start(t, Math.random() * 1.5, dur + 0.05); return s; }

  function drum(t, v = 1, dest = sfx) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.28);
    env(g, t, 0.004, 0.9 * v, 0.45); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.55);
    const n = noiseSrc(t, 0.05), f = ac.createBiquadFilter(), ng = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = 900; env(ng, t, 0.002, 0.35 * v, 0.05);
    n.connect(f); f.connect(ng); ng.connect(dest);
  }
  function cymbal(t, v = 1, dest = sfx) {
    const n = noiseSrc(t, 0.5), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'highpass'; f.frequency.value = 5200; env(g, t, 0.003, 0.32 * v, 0.32);
    n.connect(f); f.connect(g); g.connect(dest);
    [540, 812, 1263].forEach(fr => { const o = ac.createOscillator(), og = ac.createGain(); o.type = 'square'; o.frequency.value = fr * 4;
      env(og, t, 0.002, 0.012 * v, 0.25); o.connect(og); og.connect(f); o.start(t); o.stop(t + 0.3); });
  }
  function gongAt(t, v = 1, dest = sfx) {
    [[110, 1], [165.6, 0.5], [221.4, 0.35], [297, 0.22], [392, 0.12]].forEach(([fr, a]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(fr * 1.02, t); o.frequency.exponentialRampToValueAtTime(fr, t + 0.6);
      env(g, t, 0.01, 0.3 * a * v, 2.6); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 2.8);
    });
    cymbal(t, 0.6 * v, dest);
  }

  /* ---- 互动音效 ---- */
  function clang(pan = 0) {
    if (!ac || !on) return;
    const t = ac.currentTime + 0.01, p = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
    if (p.pan) p.pan.value = -pan * 0.5;
    p.connect(sfx);
    [523, 1187, 1931, 2774, 3903].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f * rand(0.98, 1.02);
      env(g, t, 0.002, 0.07 / (1 + i * 0.4), 0.18 + 0.4 / (1 + i)); o.connect(g); g.connect(p); o.start(t); o.stop(t + 0.7);
    });
    const n = noiseSrc(t, 0.06), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'highpass'; f.frequency.value = 1800; env(g, t, 0.001, 0.4, 0.06); n.connect(f); f.connect(g); g.connect(p);
    crackle(0.5);
  }
  function crackle(v = 1) {
    if (!ac || !on) return;
    const t0 = ac.currentTime;
    for (let i = 0; i < 14 * v; i++) {
      const t = t0 + rand(0.02, 0.9), n = noiseSrc(t, 0.02), f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = 'bandpass'; f.frequency.value = rand(2500, 6500); f.Q.value = 1.5;
      env(g, t, 0.001, rand(0.05, 0.22) * v, rand(0.01, 0.03)); n.connect(f); f.connect(g); g.connect(sfx);
    }
  }
  function gong() { if (ac && on) gongAt(ac.currentTime + 0.02, 1.1, sfx); }
  function drumRoll() {
    if (!ac || !on) return;
    const t0 = ac.currentTime + 0.02;
    for (let i = 0; i < 12; i++) drum(t0 + i * 0.07 * (1 - i * 0.03), 0.4 + i * 0.05, sfx);
    gongAt(t0 + 0.75, 1, sfx);
  }
  return { start, toggle, clang, crackle, gong, drumRoll };
})();

/* ============================ 启动 ============================ */
function boot() {
  if (!window.pannellum) { $('status').textContent = '未能加载 Pannellum 库（lib/pannellum.js）'; return; }
  const img = new Image();
  img.onload = () => {
    try {
      buildTextures(img);
      initViewer(); bindToolbar(); resizeFx();
      requestAnimationFrame(frame);
    } catch (e) { console.error(e); $('status').textContent = '拼接失败：' + e.message; }
  };
  img.onerror = () => { $('status').textContent = '全景图片加载失败'; };
  img.src = window.PANO_SOURCE;
}
boot();

if (DEBUG) {
  window.__vr = { get viewer() { return viewer; }, PERF, DBG, setT(t) { T = t; composeAnimated(); drawOverlay(); }, setMode, parts, get state() { return { fireI, dragonI, n: parts.length }; } };
  const iv = setInterval(() => { if (ready) { clearInterval(iv); $('intro').classList.add('gone'); } }, 200);
}
})();
