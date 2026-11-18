/* 鱼灯工坊 · 360° VR 全景
 * 原图 2000×1116 + 水平镜像 → 4000×1116 无缝环带（0° 与 ±180° 两条接缝像素一致），按原图比例：360° × 100.4°
 * Pannellum 负责拖拽 / 惯性 / 缩放；屏幕空间叠加金色光尘烘托节庆氛围
 */
(() => {
'use strict';
const SRC_W = 2000, SRC_H = 1116, PW = SRC_W * 2;
const VAOV = 360 * SRC_H / PW;
const yawOf = x => x / PW * 360 - 180;
const pitchOf = y => (0.5 - y / SRC_H) * VAOV;
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

let viewer = null, autoRotate = true;
const HOME = { yaw: yawOf(1000), pitch: 3, hfov: 96 };

/* ============================ 背景音乐 ============================ */
const BGM = (() => {
  // 请将「知晏 - 梦同游」放到 audio/mengtongyou.mp3；找不到文件时自动使用节庆五声音阶合成音乐
  const SOURCES = ['audio/mengtongyou.mp3', 'audio/梦同游.mp3', 'audio/mengtongyou.m4a'];
  const audio = new Audio(); audio.loop = true; audio.preload = 'auto'; audio.volume = .8;
  let on = false, mode = null, synth = null;

  async function tryFile() {
    for (const s of SOURCES) {
      try { audio.src = s; await audio.play(); return true; } catch (e) { /* 下一个 */ }
    }
    return false;
  }
  async function start() {
    on = true; ui();
    if (mode === 'file') { audio.play().catch(() => {}); return; }
    if (mode === 'synth') { synth.resume(); return; }
    if (await tryFile()) mode = 'file';
    else { mode = 'synth'; synth = Synth(); synth.resume(); }
    if (!on) pause();
  }
  function pause() { on = false; ui(); if (mode === 'file') audio.pause(); if (synth) synth.suspend(); }
  function toggle() { on ? pause() : start(); }
  function ui() { document.querySelectorAll('.music-btn').forEach(b => b.classList.toggle('off', !on)); }
  return { start, pause, toggle, get on() { return on; }, get mode() { return mode; } };
})();

/* 节庆合成音乐：D 宫五声音阶，古筝拨弦 + 低音 + 堂鼓/木鱼/小镲，8 小节循环 */
function Synth() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC(), out = ac.createGain(); out.gain.value = .22;
  const comp = ac.createDynamicsCompressor(); out.connect(comp); comp.connect(ac.destination);
  const verb = ac.createConvolver(), vg = ac.createGain(); vg.gain.value = .28;
  { const len = ac.sampleRate * 2.2, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = b; }
  verb.connect(vg); vg.connect(out);
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const SC = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
  const PH = [
    [4, 5, 7, 5, 4, 2, 4, -1, 3, 4, 5, 4, 2, 1, 2, -1],
    [5, 7, 8, 7, 5, 4, 5, -1, 4, 5, 4, 2, 1, 2, 0, -1],
    [7, 8, 9, 8, 7, 5, 7, -1, 8, 7, 5, 4, 5, 4, 2, -1],
    [4, 5, 4, 2, 1, 2, 4, 5, 4, 2, 1, 0, 0, -1, -1, -1],
  ];
  const MEL = PH.flat();
  const ROOT = [50, 47, 43, 45, 50, 47, 43, 50];
  const CH = [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64], [62, 66, 69], [59, 62, 66], [55, 59, 62], [62, 66, 69]];
  const BPM = 112, E8 = 60 / BPM / 2;

  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function pluck(m, t, v = .5) {
    const g = ac.createGain(); env(g, t, .004, v, 1.1);
    const f = mtof(m);
    for (const [type, mul, lv] of [['triangle', 1, 1], ['sine', 2, .35], ['sawtooth', 1, .08]]) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f * mul * 1.012, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + .06);
      og.gain.value = lv; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.3);
    }
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    g.connect(lp); lp.connect(out); lp.connect(verb);
  }
  function bass(m, t) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = mtof(m - 12);
    env(g, t, .01, .5, .5); o.connect(g); g.connect(out); o.start(t); o.stop(t + .6);
  }
  function pad(ch, t, d) {
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(.05, t + .3); g.gain.linearRampToValueAtTime(0.0001, t + d);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    for (const m of ch) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = rand(-6, 6); o.connect(lp); o.start(t); o.stop(t + d + .05); }
    lp.connect(g); g.connect(out); g.connect(verb);
  }
  function drum(t, v = .9) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + .18);
    env(g, t, .003, v, .32); o.connect(g); g.connect(out); o.start(t); o.stop(t + .4);
    nz(t, 'lowpass', 900, .25, .08);
  }
  function nz(t, type, f, v, d, q = 1) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q; env(g, t, .002, v, d);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + d + .05);
  }
  function block(t) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 1650; env(g, t, .001, .22, .06);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + .1);
  }
  function gong(t) {
    for (const [f, v] of [[110, .25], [164.5, .12], [231, .08], [296, .05]]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(f * 1.03, t); o.frequency.exponentialRampToValueAtTime(f, t + .5);
      env(g, t, .01, v, 3); o.connect(g); g.connect(out); g.connect(verb); o.start(t); o.stop(t + 3.2);
    }
  }
  let step = 0, next = ac.currentTime + .15, timer = null;
  function tick() {
    while (next < ac.currentTime + .14) {
      const i = step % MEL.length, bar = Math.floor(i / 8), inBar = i % 8;
      const n = MEL[i]; if (n >= 0) pluck(SC[n], next, inBar % 2 ? .38 : .5);
      if (inBar % 2 === 1 && n >= 0 && Math.random() < .35) pluck(SC[n] + 12, next + E8 * .5, .14);
      if (inBar === 0) { bass(ROOT[bar], next); pad(CH[bar], next, E8 * 8); drum(next); }
      if (inBar === 4) bass(ROOT[bar] + 7, next);
      if (inBar === 3 || inBar === 6) drum(next, .55);
      if (inBar % 2 === 1) block(next);
      if (inBar === 4 && bar % 2 === 1) nz(next, 'highpass', 6000, .16, .35);
      if (i === 0 && step > 0) gong(next);
      next += E8; step++;
    }
  }
  return {
    resume() { ac.resume(); if (!timer) { next = ac.currentTime + .15; timer = setInterval(tick, 25); } },
    suspend() { clearInterval(timer); timer = null; ac.suspend(); },
  };
}

/* ============================ 全景 ============================ */
function buildPano(img) {
  const c = mk(PW, SRC_H), x = c.getContext('2d');
  x.drawImage(img, 0, 0, SRC_W, SRC_H);
  x.save(); x.translate(PW, 0); x.scale(-1, 1); x.drawImage(img, 0, 0, SRC_W, SRC_H); x.restore();
  return c;
}

function makeHotspot(div) {
  div.innerHTML = '<span class="hs-ring"></span><span class="hs-dot">鱼</span><span class="hs-label">制作鱼灯</span>';
}

function initViewer(pano) {
  const hot = [990, 3010].map((sx, i) => ({
    id: 'make' + i, pitch: pitchOf(250), yaw: yawOf(sx), cssClass: 'hs-make',
    createTooltipFunc: makeHotspot, clickHandlerFunc: () => window.Workshop && Workshop.open(),
  }));
  viewer = pannellum.viewer('pano', {
    type: 'equirectangular', panorama: pano, dynamic: true, autoLoad: true,
    haov: 360, vaov: VAOV, vOffset: 0,
    yaw: HOME.yaw, pitch: HOME.pitch, hfov: HOME.hfov, minHfov: 38, maxHfov: 112,
    showControls: false, showZoomCtrl: false, showFullscreenCtrl: false, compass: false,
    mouseZoom: true, keyboardZoom: true, draggable: true, friction: .12,
    autoRotate: -2.2, autoRotateInactivityDelay: 5000,
    hotSpots: hot,
  });
  viewer.on('mousedown', () => { if (!autoRotate) viewer.stopAutoRotate(); });
  viewer.on('touchstart', () => { if (!autoRotate) viewer.stopAutoRotate(); });
}

/* ============================ 金色光尘 ============================ */
const FX = (() => {
  const cv = $('fx'), x = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, ps = [], run = true;
  function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
  function spawn(init) {
    const petal = Math.random() < .14;
    return { x: rand(0, W), y: init ? rand(0, H) : H + 20, vx: rand(-8, 8) + (petal ? 14 : 0), vy: petal ? rand(-10, 18) : -rand(10, 28), r: petal ? rand(4, 7) : rand(.8, 2.4), a: rand(0, 6.28), sp: rand(1, 3), petal, rot: rand(0, 6.28) };
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!run) return;
    const t = now / 1000;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    while (ps.length < 70) ps.push(spawn(ps.length < 60 && t < 1));
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.x += p.vx / 60 + Math.sin(t * .8 + p.a) * .2; p.y += p.vy / 60;
      if (p.petal && p.vy < 22) p.vy += .05;
      if (p.y < -30 || p.y > H + 40 || p.x < -30 || p.x > W + 30) { ps[i] = spawn(false); if (ps[i].petal) { ps[i].y = -20; ps[i].vy = rand(14, 26); } continue; }
      const tw = .45 + .55 * Math.sin(t * p.sp + p.a);
      if (p.petal) {
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot + t * .9); x.globalAlpha = .75;
        x.fillStyle = '#f6a6a0'; x.beginPath(); x.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.28); x.fill(); x.restore();
      } else {
        x.globalAlpha = .35 + .5 * tw;
        const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, 'rgba(255,232,160,1)'); g.addColorStop(1, 'rgba(255,190,90,0)');
        x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r * 4, 0, 6.28); x.fill();
      }
    }
    x.globalAlpha = 1;
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
  return { set run(v) { run = v; if (!v) x.clearRect(0, 0, cv.width, cv.height); } };
})();

/* ============================ 用户鱼灯挂入展厅 ============================ */
let mine = 0;
function addLantern(url, aspect) {
  if (!viewer) return;
  const id = 'mine' + (++mine);
  const yaw = viewer.getYaw() + rand(-14, 14), pitch = rand(10, 20);
  viewer.addHotSpot({
    id, pitch, yaw, cssClass: 'hs-mine', scale: true,
    createTooltipFunc: div => {
      const w = 230; div.style.width = w + 'px'; div.style.height = Math.round(w / aspect) + 'px';
      div.innerHTML = `<img src="${url}" alt="" style="animation-delay:${-rand(0, 4).toFixed(2)}s">`;
    },
  });
  setTimeout(() => viewer.lookAt(pitch - 4, yaw, 80, 1600), 350);
  toast('你的鱼灯已挂入展厅');
}

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ============================ 启动 ============================ */
function boot() {
  if (!window.pannellum) { $('splashStatus').textContent = '未能加载 Pannellum 库（lib/pannellum.js）'; return; }
  const img = new Image();
  img.onload = () => {
    initViewer(buildPano(img));
    $('splashStatus').textContent = '展厅已就绪';
    $('enterBtn').disabled = false; $('enterBtn').classList.add('ready');
    document.body.style.setProperty('--splash-bg', `url(${window.PANO_SOURCE})`);
  };
  img.onerror = () => { $('splashStatus').textContent = '全景图加载失败'; };
  img.src = window.PANO_SOURCE || 'source.webp';

  $('enterBtn').onclick = () => { $('splash').classList.add('gone'); BGM.start(); setTimeout(() => $('splash').remove(), 1100); };
  $('makeBtn').onclick = () => window.Workshop && Workshop.open();
  $('btnRotate').onclick = () => {
    autoRotate = !autoRotate; $('btnRotate').classList.toggle('off', !autoRotate);
    if (autoRotate) viewer.startAutoRotate(-2.2); else viewer.stopAutoRotate();
  };
  $('btnHome').onclick = () => viewer && viewer.lookAt(HOME.pitch, HOME.yaw, HOME.hfov, 1200);
  $('btnFull').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
  document.querySelectorAll('.music-btn').forEach(b => b.onclick = () => BGM.toggle());
}

window.Pano = {
  addLantern, toast,
  pause() { FX.run = false; if (viewer) viewer.stopAutoRotate(); document.body.classList.add('in-ws'); },
  resume() { FX.run = true; if (viewer && autoRotate) viewer.startAutoRotate(-2.2); document.body.classList.remove('in-ws'); },
};
window.BGM = BGM;
boot();
})();
