/**
 * A self-contained, high-DPI Canvas renderer. Match rules live in the engine;
 * this module only turns its state and action paths into a living stadium.
 */
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const mixPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

const FORMATION = [
  ['GOL', .045, .5, 1], ['ZAG', .225, .36, 4], ['ZAG', .225, .64, 3],
  ['LD', .29, .15, 2], ['LE', .29, .85, 6], ['VOL', .405, .49, 5],
  ['MC', .46, .67, 8], ['MEI', .565, .35, 10], ['PD', .70, .18, 7],
  ['PE', .70, .82, 11], ['ATA', .76, .5, 9],
];
const SKINS = ['#f1c4a0', '#bd875f', '#7f503d', '#e6af83', '#51392c', '#cd9b75'];
const HAIRS = ['#18181d', '#30221c', '#795738', '#b99a67', '#242329'];
const COLOR_NAMES = {
  preta: '#202127', preto: '#202127', black: '#202127', branca: '#f5f6ee', branco: '#f5f6ee',
  white: '#f5f6ee', verde: '#bbf65d', lime: '#bbf65d', green: '#bbf65d', vermelha: '#f75c53',
  vermelho: '#f75c53', red: '#f75c53', azul: '#4b8fec', blue: '#4b8fec', dourada: '#f0ca6c',
  dourado: '#f0ca6c', gold: '#f0ca6c', marrom: '#513629', brown: '#513629', loiro: '#d8b874',
};
const color = (value, fallback) => COLOR_NAMES[String(value).toLowerCase()] || value || fallback;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(Math.abs(w) / 2, Math.abs(h) / 2, r);
  ctx.beginPath();
  ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
}

function kitFor(club = {}, alternate = false) {
  const colors = club.colors || {};
  return {
    primary: color(alternate ? colors.secondary : colors.primary, alternate ? '#ecf0e9' : '#df3347'),
    secondary: color(alternate ? colors.primary : colors.secondary, alternate ? '#df3347' : '#141f2a'),
    shorts: color(alternate ? '#e5e8e1' : colors.shorts, '#172127'),
    pattern: club.id === 'flamengo' && club.pattern === 'stripes' ? 'hoops' : club.pattern || 'solid',
  };
}

function head(ctx, p, radius, portrait = false) {
  const skin = color(p.skin || p.skinColor, '#bd875f');
  const hair = color(p.hairColor, '#231e1b');
  const style = String(p.hairStyle || 'fade').toLowerCase();
  const face = String(p.face || 'oval').toLowerCase();
  ctx.fillStyle = skin;
  ctx.beginPath();
  if (face === 'square' || face === 'quadrado') {
    roundRect(ctx, -radius, -radius * .95, radius * 2, radius * 2.1, radius * .42);
  } else ctx.ellipse(0, 0, radius * (face === 'round' || face === 'redondo' ? 1.08 : .92), radius * 1.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(-radius, radius * .1, radius * .21, radius * .31, 0, 0, TAU);
  ctx.ellipse(radius, radius * .1, radius * .21, radius * .31, 0, 0, TAU); ctx.fill();
  if (!['bald', 'careca', 'none'].includes(style)) {
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(0, -radius * .62, radius * .96, radius * .6, 0, Math.PI, TAU);
    ctx.lineTo(radius * .85, -radius * .03); ctx.lineTo(radius * .48, -radius * .36);
    ctx.lineTo(-radius * .6, -radius * .44); ctx.lineTo(-radius * .91, radius * .03); ctx.closePath(); ctx.fill();
    if (['curly', 'cacheado', 'afro'].includes(style)) {
      for (let i = 0; i < 7; i++) {
        ctx.beginPath(); ctx.arc((i - 3) * radius * .27, -radius * .82 - Math.sin(i / 6 * Math.PI) * radius * .23, radius * .32, 0, TAU); ctx.fill();
      }
    } else if (['mohawk', 'moicano'].includes(style)) {
      ctx.beginPath(); ctx.moveTo(-radius * .26, -radius * .8); ctx.lineTo(0, -radius * 1.5);
      ctx.lineTo(radius * .29, -radius * .87); ctx.fill();
    } else if (['long', 'longo', 'comprido'].includes(style)) {
      ctx.fillRect(-radius * 1.01, -radius * .4, radius * .28, radius * 1.16);
      ctx.fillRect(radius * .75, -radius * .4, radius * .28, radius * 1.16);
    }
  }
  if (p.beard && !['none', 'nenhuma', 'sem', 'false'].includes(String(p.beard).toLowerCase())) {
    ctx.fillStyle = hair; ctx.globalAlpha = ['stubble', 'curta', 'short'].includes(String(p.beard).toLowerCase()) ? .55 : .9;
    ctx.beginPath(); ctx.ellipse(0, radius * .53, radius * .7, radius * .48, 0, 0, Math.PI); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (portrait) {
    ctx.fillStyle = '#222731';
    ctx.beginPath(); ctx.arc(-radius * .34, radius * .06, radius * .08, 0, TAU); ctx.arc(radius * .34, radius * .06, radius * .08, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(78,42,27,.5)'; ctx.lineWidth = radius * .05;
    ctx.beginPath(); ctx.moveTo(0, radius * .15); ctx.lineTo(radius * .1, radius * .34); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, radius * .39, radius * .31, .25, Math.PI - .25); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(-radius * .36, -radius * .08, radius * .24, radius * .48, -.35, 0, TAU); ctx.fill();
  }
}

function jersey(ctx, kit, width, height, number, portrait = false) {
  const top = -height / 2;
  ctx.fillStyle = kit.primary; roundRect(ctx, -width / 2, top, width, height, width * .16); ctx.fill();
  ctx.save(); roundRect(ctx, -width / 2, top, width, height, width * .16); ctx.clip();
  if (kit.pattern === 'stripes' || kit.pattern === 'striped') {
    ctx.fillStyle = kit.secondary;
    for (let x = -width / 2; x < width / 2; x += width * .4) ctx.fillRect(x, top, width * .19, height);
  } else if (kit.pattern === 'hoops' || kit.pattern === 'horizontal') {
    ctx.fillStyle = kit.secondary;
    for (let y = top; y < top + height; y += height * .32) ctx.fillRect(-width / 2, y, width, height * .15);
  } else {
    ctx.fillStyle = kit.secondary; ctx.globalAlpha = .55;
    ctx.fillRect(-width / 2, top, width * .12, height); ctx.fillRect(width * .38, top, width * .12, height); ctx.globalAlpha = 1;
  }
  const shading = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  shading.addColorStop(0, 'rgba(0,0,0,.18)'); shading.addColorStop(.4, 'rgba(255,255,255,.09)'); shading.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = shading; ctx.fillRect(-width / 2, top, width, height); ctx.restore();
  ctx.strokeStyle = kit.secondary; ctx.lineWidth = width * .1;
  ctx.beginPath(); ctx.moveTo(-width * .18, top); ctx.lineTo(0, top + height * .15); ctx.lineTo(width * .18, top); ctx.stroke();
  ctx.font = `900 ${portrait ? width * .35 : width * .65}px "Arial", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(.4, width * .05); ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(String(number || 10), 0, height * .12); ctx.fillStyle = '#ffffff'; ctx.fillText(String(number || 10), 0, height * .12);
  if (portrait) {
    ctx.fillStyle = '#d4eeac'; ctx.beginPath(); ctx.arc(-width * .25, top + height * .26, width * .055, 0, TAU); ctx.fill();
  }
}

/** Draw the live creation-screen portrait, using the same kit and face as the match. */
export function drawAvatar(canvas, profile = {}, club = {}, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const width = options.width || rect.width || 300;
  const height = options.height || rect.height || 360;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  if (options.background !== false && options.transparentBackground !== true) {
    const gradient = ctx.createRadialGradient(width * .5, height * .35, 0, width * .5, height * .5, height * .65);
    gradient.addColorStop(0, '#243b32'); gradient.addColorStop(.52, '#17251f'); gradient.addColorStop(1, '#0a161c');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(184,243,87,.09)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(width * .5, height * .48, 35 + i * 30, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = 'rgba(188,243,103,.14)';
    for (let i = 0; i < 20; i++) ctx.fillRect(hash(i + 30) * width, hash(i + 75) * height, 2, 2);
  }
  const scale = Math.min(width / 185, height / 245);
  const skin = color(profile.skin || profile.skinColor, '#bd875f');
  const kit = kitFor(club);
  const boots = color(profile.boots, '#aaf35b');
  const goalkeeper = profile.position === 'GOL';
  if (goalkeeper) { kit.primary = '#ddb74d'; kit.secondary = '#263032'; kit.shorts = '#202931'; kit.pattern = 'solid'; }
  ctx.save(); ctx.translate(width / 2, height * .56); ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 87, 48, 8, 0, 0, TAU); ctx.fill();
  // Legs, socks and boots are drawn before the jersey to give a real silhouette.
  [-1, 1].forEach((side) => {
    ctx.strokeStyle = skin; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(side * 12, 21); ctx.lineTo(side * 15, 59); ctx.stroke();
    ctx.strokeStyle = kit.primary; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(side * 15, 55); ctx.lineTo(side * 16, 76); ctx.stroke();
    ctx.strokeStyle = kit.secondary; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(side * 15 - 5, 57); ctx.lineTo(side * 15 + 5, 57); ctx.stroke();
    ctx.fillStyle = boots; roundRect(ctx, side < 0 ? -26 : 9, 75, 23, 10, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(side < 0 ? -25 : 10, 82, 21, 3);
  });
  ctx.fillStyle = kit.shorts; roundRect(ctx, -25, 5, 50, 27, 5); ctx.fill();
  ctx.fillStyle = kit.secondary; ctx.fillRect(-24, 9, 3, 21); ctx.fillRect(21, 9, 3, 21);
  ctx.fillStyle = 'rgba(9,19,24,.17)'; ctx.beginPath(); ctx.moveTo(-2, 18); ctx.lineTo(-4, 33); ctx.lineTo(4, 33); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(10,21,28,.19)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 25); ctx.stroke();
  const longSleeves = /long|longa|manga/i.test(profile.accessory || '') || goalkeeper;
  [-1, 1].forEach((side) => {
    ctx.strokeStyle = longSleeves ? kit.primary : skin; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(side * 22, -35); ctx.quadraticCurveTo(side * 37, -15, side * 35, 13); ctx.stroke();
    ctx.strokeStyle = kit.primary; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(side * 23, -35); ctx.lineTo(side * 30, -20); ctx.stroke();
    ctx.fillStyle = goalkeeper ? '#f1f4e5' : skin; ctx.beginPath(); ctx.ellipse(side * 35, 16, 6, 9, side * .1, 0, TAU); ctx.fill();
    if (/wrist|munh/i.test(profile.accessory || '')) { ctx.fillStyle = '#f1f4e5'; ctx.fillRect(side * 35 - 6, 7, 12, 5); }
  });
  ctx.save(); ctx.translate(0, -23); jersey(ctx, kit, 50, 67, profile.number || 10, true); ctx.restore();
  ctx.fillStyle = skin; roundRect(ctx, -8, -66, 16, 17, 4); ctx.fill();
  ctx.save(); ctx.translate(0, -85); head(ctx, profile, 21, true); ctx.restore();
  ctx.restore();
  if (options.labels !== false) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#baf662';
    ctx.font = `800 ${Math.max(10, width * .04)}px Arial, sans-serif`;
    ctx.fillText(`${profile.position || 'ATA'}  •  ${String(profile.shirtName || profile.nickname || 'SUA PROMESSA').toUpperCase()}`, width * .5, height * .93);
  }
}

export class PitchRenderer {
  constructor(canvas, { profile = {}, home = {}, away = {}, onFrame = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d');
    this.profile = profile; this.home = home; this.away = away; this.onFrame = onFrame;
    this.match = null; this.time = 0; this.running = false; this.frame = null;
    this.ball = { x: .5, y: .5 }; this.ballHeight = 0; this.ballTrail = [];
    this.lastAnimation = null; this.animationStartBall = { ...this.ball };
    this.completedBall = null; this.goalFX = null; this.previousScore = null;
    this.userTeam = 'home'; this.players = []; this.createPlayers();
    this.resize = this.resize.bind(this); this.tick = this.tick.bind(this);
    if (typeof ResizeObserver !== 'undefined' && canvas) {
      this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    }
    globalThis.addEventListener?.('resize', this.resize); this.resize();
  }

  setProfile(profile = {}, home = this.home, away = this.away) {
    const clubId = profile.clubId || (typeof profile.club === 'object' ? profile.club.id : profile.club);
    const newTeam = this.match?.userTeam || (clubId && String(clubId) === String(away?.id) ? 'away' : 'home');
    const changed = this.profile?.position !== profile.position || this.home?.id !== home?.id || this.away?.id !== away?.id || newTeam !== this.userTeam;
    this.profile = profile; this.home = home || {}; this.away = away || {}; this.userTeam = newTeam;
    if (changed) this.createPlayers();
    else this.players.forEach(p => { if (p.user) p.number = profile.number || 10; });
  }

  setMatch(match) {
    const differentMatch = match?.id && this.match?.id && match.id !== this.match.id;
    if ((match !== this.match && !match) || differentMatch) {
      this.lastAnimation = null; this.completedBall = null; this.goalFX = null; this.previousScore = null;
      this.ball = { x: .5, y: .5 }; this.ballTrail = [];
    }
    this.match = match;
    if (match?.userTeam && match.userTeam !== this.userTeam) { this.userTeam = match.userTeam; this.createPlayers(); }
    if (match?.score && !this.previousScore) this.previousScore = { ...match.score };
  }

  createPlayers() {
    const previous = new Map(this.players.map(p => [`${p.team}-${p.index}`, p]));
    const role = this.profile.position || 'ATA';
    const requested = role === 'SA' ? 'MEI' : role;
    const userIndex = Math.max(0, FORMATION.findIndex(([position]) => position === requested));
    this.players = [];
    ['home', 'away'].forEach((team, teamIndex) => {
      const roster = (team === 'home' ? this.home : this.away)?.roster || [];
      const selected = new Set();
      FORMATION.forEach(([position, x, y, number], index) => {
      const athlete = roster.find(candidate => candidate.position === position && !selected.has(candidate.name));
      if (athlete) selected.add(athlete.name);
      const base = { x: team === 'home' ? x : 1 - x, y: team === 'home' ? y : 1 - y };
      const prior = previous.get(`${team}-${index}`);
      this.players.push({
        team, index, role: position, user: team === this.userTeam && index === userIndex,
        number: team === this.userTeam && index === userIndex ? this.profile.number || number : athlete?.number || number,
        name: team === this.userTeam && index === userIndex ? this.profile.name || '' : athlete?.name || '',
        base, pos: prior ? { ...prior.pos } : { ...base }, heading: team === 'home' ? 1 : -1,
        stride: hash(index + teamIndex * 11) * TAU, speed: 0, seed: index + teamIndex * 13 + 1,
        skin: SKINS[(index + teamIndex * 3) % SKINS.length], hairColor: HAIRS[(index * 3 + teamIndex) % HAIRS.length],
        hairStyle: ['fade', 'short', 'curly', 'short', 'mohawk', 'bald'][index % 6],
      });
      });
    });
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 800);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || this.width * .57);
    this.dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.unit = clamp(this.width / 880, .57, 1.65);
    this.field = { x: this.width * .068, y: this.height * .19, w: this.width * .864, h: this.height * .665 };
    this.render(0);
  }

  start() {
    if (this.running || !this.ctx) return;
    this.running = true; this.lastTime = null; this.frame = requestAnimationFrame(this.tick);
  }

  tick(now) {
    if (!this.running) return;
    const dt = this.lastTime === null ? 0 : clamp((now - this.lastTime) / 1000, 0, .08);
    this.lastTime = now;
    // The engine advances first. There is no second clock or scoring system here.
    this.onFrame?.(dt);
    this.render(dt);
    if (this.running) this.frame = requestAnimationFrame(this.tick);
  }

  stop() { this.running = false; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.lastTime = null; }
  destroy() { this.stop(); this.observer?.disconnect(); globalThis.removeEventListener?.('resize', this.resize); this.onFrame = null; }

  project(point) {
    const f = this.field;
    const perspective = .944 + .056 * point.y;
    const side = f.w * (1 - perspective) * .5;
    return { x: f.x + side + point.x * f.w * perspective, y: f.y + point.y * f.h };
  }

  path(points, close = false) {
    const ctx = this.ctx; ctx.beginPath();
    points.forEach((point, index) => { const p = this.project(point); if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    if (close) ctx.closePath();
  }

  line(points) { this.path(points); this.ctx.stroke(); }
  pitchCircle(center, rx, ry, start = 0, end = TAU) {
    const points = [];
    for (let i = 0; i <= 72; i++) { const a = lerp(start, end, i / 72); points.push({ x: center.x + Math.cos(a) * rx, y: center.y + Math.sin(a) * ry }); }
    this.line(points);
  }

  drawStadium() {
    const ctx = this.ctx, w = this.width, h = this.height, f = this.field;
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#131e2b'); bg.addColorStop(.5, '#0c191b'); bg.addColorStop(1, '#0d1823');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const colors = [this.home?.colors?.primary || '#de4151', this.home?.colors?.secondary || '#c7d6d4', '#62787c', '#334955', '#cbd3bb', this.away?.colors?.primary || '#e9eee7'];
    // Individually drawn spectators have tiny, staggered motions, including during decisions.
    for (const side of ['top', 'bottom']) {
      const rows = side === 'top' ? 5 : 4;
      const rowHeight = h * .025;
      for (let row = 0; row < rows; row++) {
        const y = side === 'top' ? h * .017 + row * rowHeight : h * .935 + row * rowHeight;
        ctx.fillStyle = row % 2 ? '#172735' : '#1b2c38'; ctx.fillRect(w * .035, y - rowHeight * .2, w * .93, rowHeight * .85);
        const columns = Math.max(30, Math.floor(w / 9));
        for (let i = 0; i < columns; i++) {
          if (hash(i * 5 + row * 37) < .07) continue;
          const seed = i + row * 101 + (side === 'top' ? 0 : 700);
          const bob = Math.sin(this.time * (1.4 + hash(seed)) + seed) * .55 * this.unit;
          const x = w * .045 + (i + (row % 2) * .45) / columns * w * .91;
          const excited = this.goalFX && hash(seed + 61) > .55;
          const up = excited ? Math.abs(Math.sin(this.time * 9 + seed)) * 3 * this.unit : 0;
          ctx.fillStyle = colors[Math.floor(hash(seed) * colors.length)];
          ctx.fillRect(x - 1.65 * this.unit, y + bob - up, 3.3 * this.unit, 3.4 * this.unit);
          ctx.fillStyle = SKINS[Math.floor(hash(seed + 33) * SKINS.length)];
          ctx.beginPath(); ctx.arc(x, y - 1.1 * this.unit + bob - up, 1.1 * this.unit, 0, TAU); ctx.fill();
          if (excited) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = this.unit; ctx.beginPath(); ctx.moveTo(x - 2 * this.unit, y); ctx.lineTo(x - 3 * this.unit, y - 3 * this.unit - up); ctx.moveTo(x + 2 * this.unit, y); ctx.lineTo(x + 3 * this.unit, y - 3 * this.unit - up); ctx.stroke(); }
        }
      }
    }
    // Floodlights and the flat apron frame the pitch without covering its sidelines.
    ctx.strokeStyle = 'rgba(226,241,223,.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(w * .032, h * .01, w * .936, h * .125);
    ctx.fillStyle = '#152528'; roundRect(ctx, f.x - 15 * this.unit, f.y - 12 * this.unit, f.w + 30 * this.unit, f.h + 24 * this.unit, 8 * this.unit); ctx.fill();
    const banners = ['FOOTBALL LIFE', 'CARREIRA DEMO', 'FAÇA HISTÓRIA', 'FOOTBALL LIFE'];
    const by = f.y - 19 * this.unit, bh = 11 * this.unit;
    banners.forEach((text, i) => {
      const bx = f.x + f.w * (i / 4) + 2 * this.unit;
      ctx.fillStyle = i % 2 ? '#c0ed74' : '#203342'; ctx.fillRect(bx, by, f.w / 4 - 4 * this.unit, bh);
      ctx.fillStyle = i % 2 ? '#17231f' : '#bed8dc'; ctx.font = `800 ${6.3 * this.unit}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + f.w / 8 - 2 * this.unit, by + bh / 2);
    });
    ctx.fillStyle = 'rgba(219,235,226,.52)'; ctx.font = `700 ${7 * this.unit}px Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(String(this.home.stadium || 'ESTÁDIO FOOTBALL LIFE').toUpperCase(), f.x, by - 5 * this.unit);
    ctx.textAlign = 'right'; ctx.fillStyle = '#bbf266'; ctx.fillText('AO VIVO  ●', f.x + f.w, by - 5 * this.unit);
    // Technical areas and substitutes.
    for (const team of ['home', 'away']) {
      const bx = team === 'home' ? f.x + f.w * .24 : f.x + f.w * .62;
      const by2 = f.y + f.h + 12 * this.unit;
      ctx.fillStyle = '#273d43'; roundRect(ctx, bx, by2, 60 * this.unit, 10 * this.unit, 3 * this.unit); ctx.fill();
      ctx.fillStyle = team === 'home' ? color(this.home.colors?.primary, '#d64a59') : color(this.away.colors?.primary, '#e6efe5');
      for (let i = 0; i < 6; i++) { ctx.fillRect(bx + (6 + i * 8) * this.unit, by2 + 3 * this.unit, 4 * this.unit, 4 * this.unit); ctx.fillStyle = '#b68b68'; ctx.beginPath(); ctx.arc(bx + (8 + i * 8) * this.unit, by2 + this.unit, 1.8 * this.unit, 0, TAU); ctx.fill(); ctx.fillStyle = team === 'home' ? color(this.home.colors?.primary, '#d64a59') : color(this.away.colors?.primary, '#e6efe5'); }
    }
    if (this.match?.onPitch === false) {
      ctx.fillStyle = '#bdf36d'; ctx.textAlign = 'center'; ctx.font = `700 ${7 * this.unit}px Arial, sans-serif`;
      ctx.fillText('VOCÊ ESTÁ NO BANCO', f.x + f.w * (this.userTeam === 'home' ? .275 : .655), f.y + f.h + 29 * this.unit);
    }
  }

  drawGrass() {
    const ctx = this.ctx;
    this.path([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], true);
    ctx.fillStyle = '#317b4a'; ctx.fill(); ctx.save(); ctx.clip();
    for (let i = 0; i < 14; i++) {
      this.path([{ x: i / 14, y: 0 }, { x: (i + 1) / 14, y: 0 }, { x: (i + 1) / 14, y: 1 }, { x: i / 14, y: 1 }], true);
      ctx.fillStyle = i % 2 ? '#367f4b' : '#2e7544'; ctx.fill();
    }
    const glow = ctx.createRadialGradient(this.width * .5, this.height * .4, 0, this.width * .5, this.height * .5, this.width * .56);
    glow.addColorStop(0, 'rgba(182,215,98,.09)'); glow.addColorStop(.6, 'rgba(14,55,38,.03)'); glow.addColorStop(1, 'rgba(4,22,17,.3)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, this.width, this.height);
    for (let i = 0; i < 650; i++) {
      const p = this.project({ x: hash(i + 103), y: hash(i + 890) });
      ctx.fillStyle = i % 3 ? 'rgba(225,245,165,.042)' : 'rgba(3,37,15,.08)'; ctx.fillRect(p.x, p.y, .7 * this.unit, 2 * this.unit);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(241,249,219,.84)'; ctx.lineWidth = 1.35 * this.unit; ctx.lineJoin = 'round';
    this.path([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], true); ctx.stroke();
    this.line([{ x: .5, y: 0 }, { x: .5, y: 1 }]);
    this.pitchCircle({ x: .5, y: .5 }, .086, .14);
    for (const side of [0, 1]) {
      const inward = side === 0 ? 1 : -1;
      this.line([{ x: side, y: .208 }, { x: side + inward * .16, y: .208 }, { x: side + inward * .16, y: .792 }, { x: side, y: .792 }]);
      this.line([{ x: side, y: .365 }, { x: side + inward * .055, y: .365 }, { x: side + inward * .055, y: .635 }, { x: side, y: .635 }]);
      this.pitchCircle({ x: side + inward * .105, y: .5 }, .083, .138, side === 0 ? -1.06 : Math.PI - 1.06, side === 0 ? 1.06 : Math.PI + 1.06);
      const p = this.project({ x: side + inward * .105, y: .5 }); ctx.fillStyle = '#eaf5dd'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 * this.unit, 0, TAU); ctx.fill();
      for (const y of [0, 1]) this.pitchCircle({ x: side, y }, .014, .023, side === 0 ? y === 0 ? 0 : -Math.PI / 2 : y === 0 ? Math.PI / 2 : Math.PI, side === 0 ? y === 0 ? Math.PI / 2 : 0 : y === 0 ? Math.PI : Math.PI * 1.5);
    }
    const center = this.project({ x: .5, y: .5 }); ctx.fillStyle = '#eaf5dd'; ctx.beginPath(); ctx.arc(center.x, center.y, 1.7 * this.unit, 0, TAU); ctx.fill();
    // Corner flags have a small shadow and react gently to the stadium breeze.
    for (const x of [0, 1]) for (const y of [0, 1]) {
      const p = this.project({ x, y }); ctx.strokeStyle = '#dce8d5'; ctx.lineWidth = this.unit;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 9 * this.unit); ctx.stroke();
      ctx.fillStyle = '#c4f276'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 10 * this.unit); ctx.lineTo(p.x + (4 + Math.sin(this.time * 2 + y)) * this.unit, p.y - 8 * this.unit); ctx.lineTo(p.x, p.y - 6 * this.unit); ctx.fill();
    }
  }

  drawGoals() {
    const ctx = this.ctx;
    for (const side of [0, 1]) {
      const out = side === 0 ? -.034 : .034;
      const points = [{ x: side, y: .441 }, { x: side + out, y: .431 }, { x: side + out, y: .569 }, { x: side, y: .559 }];
      this.path(points, true); ctx.fillStyle = 'rgba(16,33,28,.46)'; ctx.fill();
      ctx.strokeStyle = 'rgba(239,247,236,.34)'; ctx.lineWidth = .65 * this.unit;
      for (let i = 0; i <= 9; i++) this.line([{ x: side, y: lerp(.441, .559, i / 9) }, { x: side + out, y: lerp(.431, .569, i / 9) }]);
      for (let i = 0; i <= 5; i++) this.line([{ x: side + out * i / 5, y: .441 - .01 * i / 5 }, { x: side + out * i / 5, y: .559 + .01 * i / 5 }]);
      this.path(points, true); ctx.strokeStyle = 'rgba(240,247,235,.65)'; ctx.lineWidth = 1.35 * this.unit; ctx.stroke();
      ctx.strokeStyle = '#f4f5e9'; ctx.lineWidth = 2.8 * this.unit;
      this.line([{ x: side, y: .441 }, { x: side, y: .559 }]);
      const a = this.project({ x: side, y: .441 }), b = this.project({ x: side, y: .559 });
      ctx.fillStyle = '#ffffff'; for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 2 * this.unit, 0, TAU); ctx.fill(); }
    }
  }

  actionProgress(animation) { return clamp((Number(animation.elapsed) || 0) / Math.max(.01, Number(animation.duration) || 1), 0, 1); }

  updateVisuals(dt) {
    const m = this.match, a = m?.animation;
    if (a) {
      const signature = `${a.kind}:${a.team}:${a.actor}:${a.from.x}:${a.from.y}:${a.to.x}:${a.to.y}:${a.duration}`;
      if (signature !== this.lastAnimation?.signature || a.elapsed < (this.lastAnimation?.elapsed || 0)) {
        this.animationStartBall = { ...this.ball }; this.completedBall = null; this.ballTrail = [];
      }
      const t = this.actionProgress(a);
      const travel = ['shot', 'save'].includes(a.kind) ? 1 - Math.pow(1 - t, 1.42) : smooth(t);
      let target = mixPoint(a.from, a.to, travel);
      if (a.kind === 'dribble') target.y += Math.sin(t * Math.PI * 4) * .018 * Math.sin(t * Math.PI);
      // Blend only the first few frames of an AI action; the end always matches its actual outcome.
      this.ball = mixPoint(this.animationStartBall, target, smooth(clamp(t / .18, 0, 1)));
      this.ballHeight = Math.sin(t * Math.PI) * (a.kind === 'shot' || a.kind === 'save' ? 11 : a.kind === 'pass' ? 6 : 1) * this.unit;
      this.lastAnimation = { ...a, from: { ...a.from }, to: { ...a.to }, signature };
      this.ballTrail.push({ ...this.ball, height: this.ballHeight }); if (this.ballTrail.length > 7) this.ballTrail.shift();
    } else {
      if (this.lastAnimation) {
        // Commit the endpoint even when the engine completes between two animation frames.
        this.ball = { ...this.lastAnimation.to }; this.ballHeight = 0;
        this.completedBall = { point: { ...this.lastAnimation.to }, until: this.time + .6 };
        this.lastAnimation = null; this.ballTrail = [];
      }
      let target;
      if (m?.phase === 'decision' && m.pending?.from) target = m.pending.from;
      else if (this.completedBall && this.time < this.completedBall.until) target = this.completedBall.point;
      else if (!m || m.phase === 'finished') target = { x: .5, y: .5 };
      else {
        const route = [5, 7, 8, 10, 9, 6, 3, 5];
        const sequence = this.time / 3.3;
        const team = Math.floor(sequence / route.length) % 2 === 0 ? 'home' : 'away';
        const carrier = this.players.find(p => p.team === team && p.index === route[Math.floor(sequence) % route.length]);
        target = carrier ? { x: carrier.pos.x + carrier.heading * .01, y: carrier.pos.y + .012 } : { x: .5, y: .5 };
      }
      this.ball = mixPoint(this.ball, target, 1 - Math.exp(-dt * (m?.phase === 'decision' ? 6 : 2.8)));
      this.ballHeight = 0;
    }
    if (m?.score && this.previousScore) {
      for (const team of ['home', 'away']) {
        if (m.score[team] > this.previousScore[team]) {
          this.goalFX = { team, at: this.time, point: { x: team === 'home' ? 1.025 : -.025, y: clamp(this.ball.y, .442, .558) } };
          // Scoring is visual only; the engine already validated and committed this goal.
          this.ball = { ...this.goalFX.point }; this.completedBall = { point: { ...this.ball }, until: this.time + 1.2 };
        }
      }
      this.previousScore = { ...m.score };
    }
    if (this.goalFX && this.time - this.goalFX.at > 2.3) this.goalFX = null;
    const attacking = a ? a.kind === 'save' ? (a.team === 'home' ? 'away' : 'home') : a.team : this.ball.x > .5 ? 'home' : 'away';
    const namedActor = a?.actor === 'ai' && a.actorName ? this.players.find(p => p.team === attacking && p.name === a.actorName) : null;
    const actor = a ? (a.actor === 'user' && a.kind !== 'save' ? this.players.find(p => p.user) : namedActor || this.nearestPlayer(a.from, attacking, a.kind === 'save' ? 'GOL' : null, true)) : null;
    const defensiveTeam = attacking === 'home' ? 'away' : 'home';
    for (const player of this.players) {
      let target = { ...player.base };
      const direction = player.team === 'home' ? 1 : -1;
      const role = player.user ? this.profile.position || player.role : player.role;
      const playing = m && m.phase !== 'finished';
      const active = player.team === attacking;
      const advance = playing ? (active ? .07 : -.018) * direction : 0;
      if (role === 'GOL') {
        target.x = player.team === 'home' ? .043 : .957;
        target.y = .5 + (this.ball.y - .5) * .29;
      } else {
        const defensive = ['ZAG', 'VOL'].includes(role);
        const wide = ['LE', 'LD', 'PE', 'PD'].includes(role);
        target.x += advance * (defensive ? .55 : wide ? .9 : 1.2);
        target.x += playing ? (this.ball.x - .5) * (defensive ? .075 : .12) : 0;
        target.y += (this.ball.y - .5) * (wide ? .065 : .18);
        target.x += Math.sin(this.time * .7 + player.seed * 2.2) * .012;
        target.y += Math.cos(this.time * .9 + player.seed * 1.7) * .018;
      }
      if (player.user && m?.phase === 'decision' && m.pending?.from && m.onPitch !== false) {
        target = { ...m.pending.from };
        if (role === 'GOL') target = { x: player.team === 'home' ? .048 : .952, y: clamp(m.pending.to?.y || .5, .36, .64) };
      }
      if (a && player === actor) {
        const t = this.actionProgress(a);
        target = a.kind === 'dribble' || a.kind === 'tackle' ? mixPoint(a.from, a.to, smooth(t)) : { ...a.from };
      }
      if (a && role === 'GOL' && player.team === defensiveTeam && ['shot', 'save'].includes(a.kind)) {
        const t = this.actionProgress(a);
        target = { x: player.team === 'home' ? .035 : .965, y: lerp(.5, clamp(a.to.y, .34, .66), smooth(clamp((t - .24) / .6, 0, 1))) };
      }
      // A receiving teammate runs toward the pass instead of waiting in a static formation.
      if (a?.kind === 'pass' && player.team === a.team && player !== actor && player === this.nearestPlayer(a.to, a.team, 'GOL')) target = { ...a.to };
      target.x = clamp(target.x, .025, .975); target.y = clamp(target.y, .045, .955);
      const delta = distance(player.pos, target);
      const maxSpeed = player === actor || (player.user && m?.phase === 'decision') ? .29 : .10 + hash(player.seed + 61) * .035;
      const step = Math.min(delta, dt * maxSpeed);
      const lastX = player.pos.x;
      if (delta > .00001) player.pos = mixPoint(player.pos, target, step / delta);
      player.speed = lerp(player.speed, dt ? step / dt : 0, 1 - Math.exp(-dt * 7));
      if (Math.abs(player.pos.x - lastX) > .0002) player.heading = player.pos.x > lastX ? 1 : -1;
      else if (a && player === actor) player.heading = a.to.x > a.from.x ? 1 : -1;
      else player.heading = this.ball.x > player.pos.x ? 1 : -1;
      player.stride += dt * (2.5 + player.speed * 75);
      player.actor = a && player === actor;
    }
  }

  nearestPlayer(point, team, excludeRole = null, excludeUser = false) {
    let best = null, bestDistance = Infinity;
    for (const p of this.players) {
      if (p.team !== team || p.role === excludeRole || (excludeUser && p.user && this.match?.onPitch !== false)) continue;
      const d = distance(p.pos, point);
      if (d < bestDistance) { best = p; bestDistance = d; }
    }
    return best;
  }

  playerPose(player) {
    const a = this.match?.animation;
    const celebration = this.goalFX && player.team === this.goalFX.team;
    if (celebration) return { kind: 'celebrate', t: this.time - this.goalFX.at };
    if (!a) return { kind: 'run', t: 0 };
    const t = this.actionProgress(a);
    const goalTeam = a.kind === 'save' ? a.team : a.team === 'home' ? 'away' : 'home';
    if (player.role === 'GOL' && player.team === goalTeam && ['shot', 'save'].includes(a.kind) && t > .3) return { kind: 'save', t, side: a.to.y < .5 ? -1 : 1 };
    if (player.actor) return { kind: a.kind === 'save' ? 'shot' : a.kind, t };
    if (a.kind === 'dribble' && a.outcome !== 'fail' && player.team !== a.team && distance(player.pos, this.ball) < .055 && t > .45) return { kind: 'fall', t };
    return { kind: 'run', t };
  }

  drawPlayer(player) {
    const ctx = this.ctx, p = this.project(player.pos), scale = this.unit * (.9 + player.pos.y * .16);
    const isUser = player.user && this.match?.onPitch !== false;
    const profile = isUser ? this.profile : player;
    const kit = kitFor(player.team === 'home' ? this.home : this.away);
    if (player.role === 'GOL') { kit.primary = player.team === 'home' ? '#e9c252' : '#73b3e8'; kit.secondary = '#223537'; kit.shorts = '#17272b'; kit.pattern = 'solid'; }
    const skin = color(profile.skin || profile.skinColor, '#bd875f');
    const boots = isUser ? color(profile.boots, '#b7f165') : ['#eaf0e6', '#192532', '#ed7a56', '#dcdf51'][player.index % 4];
    const pose = this.playerPose(player);
    const running = clamp(player.speed / .08, .13, 1);
    const swing = Math.sin(player.stride) * 2.8 * running;
    const breath = Math.sin(this.time * 2.8 + player.seed) * .25;
    let leap = pose.kind === 'celebrate' ? Math.abs(Math.sin(this.time * 8 + player.seed)) * 3 : 0;
    if (pose.kind === 'save') leap = Math.sin(clamp((pose.t - .3) / .7, 0, 1) * Math.PI) * 5;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(5,23,18,.28)'; ctx.beginPath(); ctx.ellipse(1.5, 1.5, 6.8 + leap * .25, 2.2, -.16, 0, TAU); ctx.fill();
    if (isUser) {
      ctx.strokeStyle = '#c3ff67'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(0, 1, 8.5 + Math.sin(this.time * 3) * .4, 3.3, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#c3ff67'; ctx.beginPath(); ctx.moveTo(-3.2, -26 - Math.sin(this.time * 3) * 1.2); ctx.lineTo(3.2, -26 - Math.sin(this.time * 3) * 1.2); ctx.lineTo(0, -22 - Math.sin(this.time * 3) * 1.2); ctx.closePath(); ctx.fill();
    }
    ctx.translate(0, -leap + breath);
    if (pose.kind === 'save') { ctx.translate(pose.side * (pose.t - .3) * 6, -4); ctx.rotate(pose.side * Math.sin(clamp((pose.t - .3) * 2, 0, 1) * Math.PI / 2) * 1.02); }
    if (pose.kind === 'tackle' || pose.kind === 'fall') { ctx.translate(0, 1); ctx.rotate(player.heading * (pose.kind === 'fall' ? 1.35 : 1.03) * Math.sin(pose.t * Math.PI)); }
    ctx.lineCap = 'round';
    // Separate thighs, socks and boots make every player a drawn character, even at match scale.
    for (const side of [-1, 1]) {
      let stride = side * swing;
      let legX = side * 2.2;
      if (player.actor && ['shot', 'pass'].includes(pose.kind) && side === 1) { stride = Math.sin(clamp(pose.t / .38, 0, 1) * Math.PI) * 5.3; legX += player.heading * Math.sin(clamp(pose.t / .34, 0, 1) * Math.PI) * 4.5; }
      if (pose.kind === 'tackle' && side === 1) { stride = 3.5; legX += player.heading * 4; }
      ctx.strokeStyle = skin; ctx.lineWidth = 2.25;
      ctx.beginPath(); ctx.moveTo(side * 2, -6.4); ctx.lineTo(legX, -2.5 + stride * .5); ctx.stroke();
      ctx.strokeStyle = kit.primary; ctx.lineWidth = 2.3;
      ctx.beginPath(); ctx.moveTo(legX, -2.5 + stride * .5); ctx.lineTo(legX + stride * .18, -.4 + stride); ctx.stroke();
      ctx.fillStyle = boots; roundRect(ctx, legX - 1.25 + stride * .18, -.8 + stride, 3.4, 1.5, .6); ctx.fill();
    }
    ctx.fillStyle = kit.shorts; roundRect(ctx, -4.05, -8.2, 8.1, 4.7, 1); ctx.fill();
    const raise = ['celebrate', 'save'].includes(pose.kind);
    const longSleeves = /long|longa|manga/i.test(profile.accessory || '') || player.role === 'GOL';
    for (const side of [-1, 1]) {
      const armY = raise ? -20 : -9.5 - side * swing * .65;
      const armX = side * (raise ? 7 : 5.3);
      ctx.strokeStyle = longSleeves ? kit.primary : skin; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side * 3.7, -14.7); ctx.lineTo(armX, armY); ctx.stroke();
      ctx.strokeStyle = kit.primary; ctx.lineWidth = 3.1;
      ctx.beginPath(); ctx.moveTo(side * 3.5, -14.5); ctx.lineTo(side * 4.9, raise ? -16.1 : -12.6); ctx.stroke();
      ctx.fillStyle = player.role === 'GOL' ? '#f0f4e9' : skin;
      ctx.beginPath(); ctx.arc(armX, armY, 1.1, 0, TAU); ctx.fill();
      if (/wrist|munh/i.test(profile.accessory || '')) { ctx.fillStyle = '#edf3e5'; ctx.fillRect(armX - 1.15, armY - 1.8, 2.3, 1); }
    }
    ctx.save(); ctx.translate(0, -12.5); jersey(ctx, kit, 8.2, 9.7, isUser ? this.profile.number || player.number : player.number); ctx.restore();
    ctx.fillStyle = skin; ctx.fillRect(-1.25, -18.2, 2.5, 2);
    ctx.save(); ctx.translate(player.heading * .3, -19.3); head(ctx, profile, 3.5); ctx.restore();
    ctx.restore();
    if (isUser) {
      const label = String(this.profile.shirtName || this.profile.nickname || this.profile.name || 'VOCÊ').toUpperCase().slice(0, 18);
      ctx.font = `800 ${7.5 * this.unit}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const labelWidth = ctx.measureText(label).width + 10 * this.unit;
      ctx.fillStyle = 'rgba(10,26,24,.88)'; roundRect(ctx, p.x - labelWidth / 2, p.y + 7 * this.unit, labelWidth, 11 * this.unit, 3 * this.unit); ctx.fill();
      ctx.fillStyle = '#d4ff99'; ctx.fillText(label, p.x, p.y + 12.5 * this.unit);
    }
  }

  drawBall() {
    const ctx = this.ctx, p = this.project(this.ball), a = this.match?.animation;
    if (a && ['shot', 'save'].includes(a.kind)) {
      this.ballTrail.forEach((item, i) => {
        const point = this.project(item); ctx.fillStyle = `rgba(246,251,224,${i / this.ballTrail.length * .16})`;
        ctx.beginPath(); ctx.arc(point.x, point.y - item.height, (1.5 + i / this.ballTrail.length) * this.unit, 0, TAU); ctx.fill();
      });
    }
    ctx.fillStyle = 'rgba(6,26,13,.32)'; ctx.beginPath(); ctx.ellipse(p.x + 1 * this.unit, p.y + 1.3 * this.unit, 3.4 * this.unit, 1.5 * this.unit, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y - this.ballHeight - 1.2 * this.unit); ctx.rotate(this.time * 4 + this.ball.x * 40); ctx.scale(this.unit, this.unit);
    const ballGradient = ctx.createRadialGradient(-1, -1.3, 0, 0, 0, 3.1);
    ballGradient.addColorStop(0, '#ffffff'); ballGradient.addColorStop(.7, '#edf1df'); ballGradient.addColorStop(1, '#b7c3a9');
    ctx.fillStyle = ballGradient; ctx.beginPath(); ctx.arc(0, 0, 3.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#33403d'; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const angle = i * TAU / 5 - Math.PI / 2; if (!i) ctx.moveTo(Math.cos(angle) * 1.3, Math.sin(angle) * 1.3); else ctx.lineTo(Math.cos(angle) * 1.3, Math.sin(angle) * 1.3); }
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = .55; ctx.strokeStyle = '#6a7970';
    for (let i = 0; i < 5; i++) { const angle = i * TAU / 5 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 1.4, Math.sin(angle) * 1.4); ctx.lineTo(Math.cos(angle) * 2.9, Math.sin(angle) * 2.9); ctx.stroke(); }
    ctx.restore();
  }

  drawActionFocus() {
    const m = this.match;
    if (m?.phase !== 'decision' || !m.pending?.from || m.onPitch === false) return;
    const ctx = this.ctx, p = this.project(m.pending.from);
    ctx.strokeStyle = `rgba(206,255,125,${.24 + Math.sin(this.time * 3) * .06})`; ctx.lineWidth = 1 * this.unit;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, (19 + Math.sin(this.time * 2) * 2) * this.unit, 9 * this.unit, 0, 0, TAU); ctx.stroke();
  }

  drawGoalFX() {
    if (!this.goalFX) return;
    const ctx = this.ctx, fx = this.goalFX, age = this.time - fx.at, p = this.project(fx.point);
    ctx.save(); ctx.globalAlpha = clamp(1 - age / 2.3, 0, 1);
    for (let i = 0; i < 26; i++) {
      const angle = hash(i + 96) * TAU, velocity = (15 + hash(i + 25) * 35) * this.unit;
      const x = p.x + Math.cos(angle) * age * velocity;
      const y = p.y + Math.sin(angle) * age * velocity + age * age * 10 * this.unit;
      ctx.fillStyle = i % 3 ? '#c2fa72' : '#f9f7d9'; ctx.fillRect(x, y, 2 * this.unit, 3.5 * this.unit);
    }
    const w = 110 * this.unit, h = 27 * this.unit, x = this.width * .5 - w * .5, y = this.field.y + this.field.h * .045;
    ctx.fillStyle = '#c6ff72'; roundRect(ctx, x, y, w, h, 5 * this.unit); ctx.fill();
    ctx.fillStyle = '#18312b'; ctx.font = `900 ${20 * this.unit}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GOOOL!', this.width * .5, y + h * .52);
    ctx.restore();
  }

  render(dtSeconds = 0) {
    if (!this.ctx || !this.field) return;
    const dt = clamp(Number(dtSeconds) || 0, 0, .1); this.time += dt;
    this.updateVisuals(dt);
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    this.drawStadium(); this.drawGrass(); this.drawGoals(); this.drawActionFocus();
    [...this.players].sort((a, b) => a.pos.y - b.pos.y).forEach(p => this.drawPlayer(p));
    this.drawBall(); this.drawGoalFX();
    // Stadium floodlight vignette helps tiny figures and the ball stay readable.
    const vignette = ctx.createRadialGradient(this.width * .5, this.height * .5, this.width * .25, this.width * .5, this.height * .5, this.width * .7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,7,16,.27)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, this.width, this.height);
  }
}
