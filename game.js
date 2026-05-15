// ============================================================
// CONFIG — API base URL (ajuste para seu servidor)
// ============================================================
const API = 'http://localhost:3001/api';

// ============================================================
// AUTH STATE
// ============================================================
let authToken = localStorage.getItem('nrToken') || null;
let authUser  = (() => { try { return JSON.parse(localStorage.getItem('nrUser')); } catch{ return null; } })();

// ── REGEX (mesmo padrão do backend) ─────────────────────────
const REGEX = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  email:    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/,
};

// ── Auth Particle Canvas ─────────────────────────────────────
(function initAuthParticles() {
  const canvas = document.getElementById('authParticles');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*2+0.5,
      dx: (Math.random()-0.5)*0.4,
      dy: (Math.random()-0.5)*0.4,
      c: `hsl(${Math.random()*60+170},100%,${50+Math.random()*30}%)`,
      alpha: Math.random()*0.5+0.1,
    });
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    ctx.shadowBlur = 10;
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = p.c;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (!document.getElementById('authScreen').classList.contains('hidden'))
      requestAnimationFrame(draw);
  }
  draw();
})();

// ── Tab Switch ───────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById('form' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  clearErrors();
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
  document.querySelectorAll('.field-input').forEach(i => { i.classList.remove('error','valid'); });
}

// ── Toggle Password Visibility ───────────────────────────────
function togglePass(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.style.opacity = inp.type === 'text' ? '1' : '0.5';
}

// ── Real-time Field Validation (REGEX) ───────────────────────
function validateField(id) {
  const inp = document.getElementById(id);
  const val = inp.value;
  let ok = false, msg = '';

  if (id === 'regUsername') {
    ok = REGEX.username.test(val);
    msg = ok ? '' : '3-20 caracteres, letras/números/_';
  } else if (id === 'regEmail') {
    ok = REGEX.email.test(val);
    msg = ok ? '' : 'E-mail inválido';
  } else if (id === 'regPassword') {
    ok = REGEX.password.test(val);
    msg = ok ? '' : '1 maiúscula, 1 minúscula, 1 número, mín. 6';
    // Strength bar
    let strength = 0;
    if (val.length >= 6) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[a-z]/.test(val)) strength++;
    if (/\d/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;
    const bar = document.getElementById('pwBar');
    const colors = ['#ff2244','#ff6600','#ffee00','#00ff88','#00f5ff'];
    bar.style.width  = (strength/5*100) + '%';
    bar.style.background = colors[strength-1] || '#ff2244';
  } else if (id === 'regConfirm') {
    const pw = document.getElementById('regPassword').value;
    ok = val === pw && val.length > 0;
    msg = ok ? '' : 'Senhas não coincidem';
  }

  inp.classList.toggle('error', !ok && val.length > 0);
  inp.classList.toggle('valid', ok);
  const errEl = document.getElementById(id + 'Err');
  if (errEl) errEl.textContent = msg;
  return ok;
}

// ── Register ─────────────────────────────────────────────────
async function doRegister() {
  const uOk = validateField('regUsername');
  const eOk = validateField('regEmail');
  const pOk = validateField('regPassword');
  const cOk = validateField('regConfirm');
  if (!uOk || !eOk || !pOk || !cOk) return;

  const btn = document.getElementById('btnRegister');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'CRIANDO...';

  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('regUsername').value.trim(),
        email:    document.getElementById('regEmail').value.trim(),
        password: document.getElementById('regPassword').value,
      })
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('regGlobalErr').textContent = data.error || 'Erro ao cadastrar';
    } else {
      saveAuthData(data.token, data.user);
      enterGame();
    }
  } catch(e) {
    // Modo offline: salva localmente
    const username = document.getElementById('regUsername').value.trim();
    saveAuthData(null, { username, id: Date.now(), email: document.getElementById('regEmail').value.trim() });
    enterGame();
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = '✦ CRIAR CONTA';
  }
}

// ── Login ─────────────────────────────────────────────────────
async function doLogin() {
  const usr = document.getElementById('loginUsername').value.trim();
  const pw  = document.getElementById('loginPassword').value;
  document.getElementById('loginGlobalErr').textContent = '';

  if (!usr) { document.getElementById('loginUsernameErr').textContent = 'Campo obrigatório'; return; }
  if (!pw)  { document.getElementById('loginPasswordErr').textContent = 'Campo obrigatório'; return; }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'ENTRANDO...';

  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usr, password: pw })
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('loginGlobalErr').textContent = data.error || 'Erro ao entrar';
    } else {
      saveAuthData(data.token, data.user);
      enterGame();
    }
  } catch(e) {
    // Modo offline
    saveAuthData(null, { username: usr, id: Date.now() });
    enterGame();
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = '▶ ENTRAR';
  }
}

function playAsGuest() {
  saveAuthData(null, { username: 'Visitante', id: 0 });
  enterGame();
}

function saveAuthData(token, user) {
  authToken = token;
  authUser  = user;
  if (token) localStorage.setItem('nrToken', token);
  if (user)  localStorage.setItem('nrUser', JSON.stringify(user));
}

function doLogout() {
  localStorage.removeItem('nrToken');
  localStorage.removeItem('nrUser');
  authToken = null; authUser = null;
  document.getElementById('gameWrapper').style.display = 'none';
  const as = document.getElementById('authScreen');
  as.classList.remove('hidden');
  // Restart particle animation
  clearErrors();
  switchTab('login');
}

function enterGame() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('gameWrapper').style.display = 'block';
  document.getElementById('hudUsername').textContent = authUser?.username || 'JOGADOR';
  loadNews();
  initGame();
}

// ── Load News via API (Axios + Cheerio on backend) ────────────
async function loadNews() {
  try {
    const res  = await fetch(`${API}/gamenews`);
    const data = await res.json();
    const titles = data.news.map(n => n.title).join('   ◈   ');
    document.getElementById('newsTicker').textContent = titles;
  } catch(e) {
    document.getElementById('newsTicker').textContent = '🎮 Neon Rush v2.0  ◈  Bosses a cada wave!  ◈  Loja com armas e poderes!';
  }
}

// ── Save score to API ─────────────────────────────────────────
async function saveScoreAPI(scoreData) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const payload = authToken ? scoreData : { ...scoreData, username: authUser?.username || 'Visitante' };
    await fetch(`${API}/scores`, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch(e) {}
}

async function savePurchaseAPI(item) {
  if (!authToken) return;
  try {
    await fetch(`${API}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify(item)
    });
  } catch(e) {}
}

// ── Download Ranking PDF ──────────────────────────────────────
function downloadRankingPDF() {
  window.open(`${API}/ranking/pdf`, '_blank');
}

// ── Fetch ranking from API ────────────────────────────────────
async function fetchRanking() {
  try {
    const res = await fetch(`${API}/ranking`);
    return await res.json();
  } catch(e) { return []; }
}

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//   GAME ENGINE
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── Audio Engine ─────────────────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
let _muted = localStorage.getItem('nrMuted') === '1';

function toggleMute() {
  _muted = !_muted;
  localStorage.setItem('nrMuted', _muted ? '1' : '0');
  const btn = document.getElementById('btnMute');
  btn.textContent = _muted ? '🔇' : '🔊';
  btn.classList.toggle('muted', _muted);
}

// Apply saved mute state on load
(function applyMuteState() {
  if (_muted) {
    const btn = document.getElementById('btnMute');
    if (btn) { btn.textContent = '🔇'; btn.classList.add('muted'); }
  }
})();

function playTone(freq, type, duration, vol=0.12, decay=true) {
  if (_muted) return;
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    if (decay) gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.start(); osc.stop(ac.currentTime + duration);
  } catch(e) {}
}
let _sndHitLast = 0, _sndCritLast = 0, _sndShootLast = 0;
function sndShoot() {
  const n = Date.now(); if (n - _sndShootLast < 60) return; _sndShootLast = n;
  playTone(800,'square',0.05,0.07);
}
function sndHit() {
  const n = Date.now(); if (n - _sndHitLast < 45) return; _sndHitLast = n;
  playTone(200,'sawtooth',0.07,0.1);
}
function sndCrit() {
  const n = Date.now(); if (n - _sndCritLast < 80) return; _sndCritLast = n;
  playTone(1200,'square',0.05,0.18); setTimeout(()=>playTone(1600,'square',0.05,0.12),55);
}
function sndLevelUp(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.2,0.28),i*75)); }
function sndCoin()  { playTone(1400,'sine',0.04,0.07); }
function sndDash()  { playTone(400,'sawtooth',0.08,0.12); playTone(800,'square',0.05,0.08); }
function sndDeath() { [300,250,200,150].forEach((f,i)=>setTimeout(()=>playTone(f,'sawtooth',0.18,0.18),i*90)); }
function sndCombo() { playTone(600+G.combo*25,'sine',0.07,0.18); }
function sndWave()  { playTone(300,'sawtooth',0.25,0.22); setTimeout(()=>playTone(500,'sawtooth',0.18,0.18),140); }
function sndBoss()  { [200,150,100,80].forEach((f,i)=>setTimeout(()=>playTone(f,'sawtooth',0.3,0.3),i*120)); }
function sndBossKill(){ [400,600,900,1200,1600].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.3,0.35),i*80)); }

// ── Game State ────────────────────────────────────────────────
const G = {
  running: false, paused: false, upgrading: false, bossDefeated: false,
  px: 0, py: 0, pRadius: 14,
  pdx: 0, pdy: 0, pSpeed: 3.5,
  hp: 100, maxHp: 100,
  xp: 0, xpNext: 100, level: 1,
  score: 0, kills: 0, bossKills: 0,
  // Habilidades ativas
  timeScale: 1.0,
  hasSlowTime: false, slowTimeActive: false, slowTimeDuration: 0, slowTimeCooldown: 0,
  hasRicochet: false,
  novaBombCount: 0,
  barrierActive: false, barrierDuration: 0,
  // Combat
  damage: 20, critChance: 0.05, critMult: 2.0,
  attackSpeed: 1.8, bulletSpeed: 6, bulletCount: 1,
  damageMulti: 1.0, xpMulti: 1.0, coinMulti: 1.0,
  shieldHp: 0, _lifeDrain: false,
  // Purchased items (active effects)
  hasSword: false, swordRadius: 0, swordAngle: 0,
  hasMagnet: false,
  hasArmor: false,
  hasVampire: false,
  hasExplosive: false,
  // Wave / Boss
  wave: 1, phase: 1,
  waveTimer: 0, waveKills: 0, waveKillTarget: 25,
  bossActive: false, boss: null,
  spawnRate: 80, spawnTimer: 0, spawnCap: 14,
  enemyHpMult: 1, enemySpeedMult: 1,
  // Economy
  playerCoins: 0, totalCoins: 0,
  // Combo
  combo: 0, comboTimer: 0, maxCombo: 0,
  // Collections
  enemies: [], bullets: [], particles: [], coins: [], floaters: [], pets: [],
  // Timers
  shootTimer: 0,
  dashCooldown: 0, dashActive: 0, dashDx: 0, dashDy: 0,
  invincibleTimer: 0,
  shakeX: 0, shakeY: 0, shakeTimer: 0,
  dt: 0, lastTime: 0,
  sessionStart: 0,
  // Input
  keys: {}, jActive: false, jDx: 0, jDy: 0,
  // Mouse (PC shoot)
  mouseX: 0, mouseY: 0, mouseDown: false,
  // Right joystick (mobile shoot)
  rjActive: false, rjDx: 0, rjDy: 0,
};

// ── Shop Items ─────────────────────────────────────────────────
const SHOP_ITEMS = [
  // ── ARMAS
  {
    id:'sword', name:'ESPADA NEON', icon:'⚔️',
    stat:'Dano em área contínuo',
    desc:'Espada giratória ao redor do jogador que destrói inimigos próximos automaticamente',
    price:300, category:'weapon',
    apply: () => { G.hasSword = true; G.swordRadius = 55; }
  },
  {
    id:'shotgun', name:'SHOTGUN LASER', icon:'🔫',
    stat:'+3 projéteis por disparo',
    desc:'Cada tiro dispara 3 balas extras em leque, cobrindo uma área maior',
    price:440, category:'weapon',
    apply: () => { G.bulletCount = Math.min(8, G.bulletCount + 3); }
  },
  {
    id:'ricochet', name:'BALA RICOCHETE', icon:'🔀',
    stat:'Atravessa 2 inimigos',
    desc:'Projéteis penetram no primeiro alvo e continuam acertando o próximo',
    price:500, category:'weapon',
    apply: () => { G.hasRicochet = true; }
  },
  {
    id:'rocket', name:'LANÇADOR DE FOGUETES', icon:'🚀',
    stat:'+80% de dano',
    desc:'Aumenta o dano base de todos os projéteis em 80%',
    price:680, category:'weapon',
    apply: () => { G.damageMulti *= 1.8; }
  },
  {
    id:'plasma', name:'CANHÃO DE PLASMA', icon:'⚡',
    stat:'Velocidade de ataque ×2',
    desc:'Dobra a cadência de tiro — dispara o dobro de projéteis por segundo',
    price:520, category:'weapon',
    apply: () => { G.attackSpeed *= 2.0; }
  },
  {
    id:'vampire', name:'LÂMINA VAMPÍRICA', icon:'🩸',
    stat:'+5 HP por kill',
    desc:'Absorve vida dos inimigos — cada morte restaura 5 pontos de HP',
    price:380, category:'weapon',
    apply: () => { G.hasVampire = true; G._lifeDrain = true; }
  },
  {
    id:'explosive', name:'BALAS EXPLOSIVAS', icon:'💥',
    stat:'Explosão ao impactar',
    desc:'Projéteis explodem no ponto de impacto, causando dano em área aos inimigos ao redor',
    price:600, category:'weapon',
    apply: () => { G.hasExplosive = true; }
  },
  {
    id:'drone', name:'DRONE DE COMBATE', icon:'🤖',
    stat:'Atirador automático',
    desc:'Um drone orbita o jogador e atira automaticamente nos inimigos mais próximos',
    price:440, category:'weapon',
    apply: () => { addPet(); }
  },
  {
    id:'nova_bomb', name:'BOMBA NOVA', icon:'💣',
    stat:'Elimina tudo na tela',
    desc:'USO ÚNICO — Detona uma explosão que destrói instantaneamente todos os inimigos visíveis',
    price:480, category:'weapon',
    consumable: true,
    apply: () => { activateNovaBomb(); }
  },
  // ── DEFESA
  {
    id:'armor', name:'ARMADURA NEON', icon:'🔵',
    stat:'-30% dano recebido',
    desc:'Revestimento de energia que absorve parte de todo o dano sofrido',
    price:460, category:'defense',
    apply: () => { G.hasArmor = true; }
  },
  {
    id:'shield_item', name:'ESCUDO REFORÇADO', icon:'🛡️',
    stat:'+200 HP de escudo',
    desc:'Cria uma barreira de 200 HP que absorve dano antes do HP real ser atingido',
    price:360, category:'defense',
    apply: () => { G.shieldHp += 200; G.hasArmor = true; }
  },
  {
    id:'barrier', name:'BARREIRA TEMPORAL', icon:'🫧',
    stat:'4 segundos invencível',
    desc:'USO ÚNICO — Ativa imunidade total a dano por 4 segundos. Use nos momentos críticos',
    price:400, category:'defense',
    consumable: true,
    apply: () => { G.barrierActive = true; G.barrierDuration = 240; }
  },
  // ── UTILIDADE
  {
    id:'speed_boots', name:'BOTAS TURBO', icon:'👟',
    stat:'+50% velocidade',
    desc:'Aumenta a velocidade de movimento em 50% — essencial para esquivar de hordas',
    price:250, category:'utility',
    apply: () => { G.pSpeed *= 1.5; }
  },
  {
    id:'magnet', name:'SUPER IMÃ', icon:'🧲',
    stat:'Coleta moedas automático',
    desc:'Atrai moedas de longa distância automaticamente — não perca nenhuma recompensa',
    price:220, category:'utility',
    apply: () => { G.hasMagnet = true; }
  },
  {
    id:'slow_time', name:'TEMPO LENTO', icon:'⏳',
    stat:'Tecla Q · congela 6s',
    desc:'Pressione Q para reduzir a velocidade de todos os inimigos a 25% por 6 segundos (cooldown: 25s)',
    price:550, category:'utility',
    apply: () => { G.hasSlowTime = true; }
  },
  // ── CURA
  {
    id:'medpack', name:'KIT MÉDICO', icon:'💊',
    stat:'Cura HP completo',
    desc:'USO ÚNICO — Restaura todo o HP do jogador instantaneamente',
    price:280, category:'heal',
    consumable: true,
    apply: () => { G.hp = G.maxHp; }
  },
];
const purchasedItems = new Set(
  JSON.parse(localStorage.getItem('nrPurchased') || '[]')
);

// ── XP Table ──────────────────────────────────────────────────
function xpForLevel(lv) {
  return Math.floor(160 * Math.pow(1.45, lv - 1));
}

// ── Canvas ────────────────────────────────────────────────────
let _bgCache = null;
function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  _bgCache = null; // force bg rebuild on resize
  if (!G.running) { G.px = canvas.width/2; G.py = canvas.height/2; }
}

// ── Utilities ─────────────────────────────────────────────────
const rnd   = (a,b) => a + Math.random() * (b - a);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const dist  = (ax,ay,bx,by) => Math.hypot(ax-bx, ay-by);
const lerp  = (a,b,t) => a + (b-a) * t;
function screenShake(amount, duration) {
  G.shakeTimer = duration; G.shakeX = amount; G.shakeY = amount;
}

// ── Particles & Floaters ──────────────────────────────────────
const MAX_PARTICLES = 260;
const MAX_FLOATERS  = 18;

function spawnParticles(x, y, count, color, speed=3, size=3, life=30) {
  for (let i=0; i<count; i++) {
    if (G.particles.length >= MAX_PARTICLES) G.particles.shift();
    const ang = Math.random()*Math.PI*2;
    const spd = rnd(speed*0.4, speed);
    G.particles.push({ x, y, dx:Math.cos(ang)*spd, dy:Math.sin(ang)*spd,
      r:rnd(size*0.5,size), life, maxLife:life, color, glow:true, gravity:rnd(-0.04,0.04) });
  }
}
function spawnTrail(x, y, color) {
  if (G.particles.length >= MAX_PARTICLES) return;
  G.particles.push({ x:x+rnd(-3,3), y:y+rnd(-3,3), dx:rnd(-0.3,0.3), dy:rnd(-0.3,0.3),
    r:rnd(1.5,3.5), life:10, maxLife:10, color, glow:false, gravity:0 });
}
function spawnFloat(x, y, text, color, size=15) {
  if (G.floaters.length >= MAX_FLOATERS) G.floaters.shift();
  G.floaters.push({ x, y, text, color, size, life:55, maxLife:55, dy:-1.2 });
}

// ── Habilidades Ativas ────────────────────────────────────────
function activateSlowTime() {
  if (!G.hasSlowTime || G.slowTimeCooldown > 0 || G.slowTimeActive) return;
  G.slowTimeActive = true;
  G.slowTimeDuration = 360; // 6s a 60fps
  G.timeScale = 0.25;
  screenShake(4, 8);
  spawnParticles(G.px, G.py, 20, '#00f5ff', 4, 3, 40);
}

function activateNovaBomb() {
  const killed = [...G.enemies];
  G.enemies = [];
  for (const e of killed) {
    spawnParticles(e.x, e.y, 10, e.color, 5, 4, 35);
    G.score += e.score;
    G.kills++;
    G.waveKills++;
  }
  spawnParticles(G.px, G.py, 30, '#ffee00', 8, 5, 50);
  screenShake(18, 22);
  document.getElementById('statKills').textContent = G.kills;
  updateHUD();
}

// ── Enemy Types ───────────────────────────────────────────────
const ENEMY_TYPES = [
  { name:'Drone',   hp:30,  speed:1.3, radius:10, color:'#ff4444', score:10,  xp:20,  coins:1 },
  { name:'Crawler', hp:60,  speed:0.9, radius:13, color:'#ff8800', score:18,  xp:35,  coins:2 },
  { name:'Speeder', hp:25,  speed:2.2, radius:8,  color:'#ff44ff', score:25,  xp:28,  coins:2 },
  { name:'Tank',    hp:200, speed:0.5, radius:20, color:'#aa0000', score:50,  xp:80,  coins:6 },
  { name:'Ghost',   hp:80,  speed:1.6, radius:11, color:'#8844ff', score:35,  xp:50,  coins:3 },
  { name:'Elite',   hp:300, speed:1.0, radius:17, color:'#ff0099', score:100, xp:150, coins:10 },
];

// ── BOSS Types (3 tipos que se repetem) ───────────────────────
const BOSS_TYPES = [
  {
    name:'NEXUS PRIME',
    subtitle:'Núcleo de Energia',
    color:'#ff0099',
    hp: 800,
    speed: 0.9,
    radius: 36,
    score: 2000,
    xpReward: 500,
    coinReward: 80,
    pattern: 'orbit', // atira em órbita
  },
  {
    name:'DARK TITAN',
    subtitle:'Titã das Sombras',
    color:'#9d00ff',
    hp: 1200,
    speed: 0.7,
    radius: 44,
    score: 3000,
    xpReward: 750,
    coinReward: 120,
    pattern: 'charge', // dá charges rápidas
  },
  {
    name:'OMEGA STORM',
    subtitle:'Tempestade Final',
    color:'#ff6600',
    hp: 1600,
    speed: 0.6,
    radius: 50,
    score: 4500,
    xpReward: 1000,
    coinReward: 150,
    pattern: 'spiral', // tira spirais
  },
];

function getBossType() {
  // Cicla pelos 3 bosses baseado na fase
  return BOSS_TYPES[(G.phase - 1) % BOSS_TYPES.length];
}

function spawnBoss() {
  const bType  = getBossType();
  // Boss: exponencial por fase × exponencial por wave acumulada (infinito)
  const hpMult = Math.pow(1.50, G.phase - 1) * Math.pow(1.10, G.wave - 1);
  const side   = Math.floor(Math.random()*4);
  let bx, by;
  if (side===0){ bx=rnd(0,canvas.width); by=-60; }
  else if(side===1){ bx=canvas.width+60; by=rnd(0,canvas.height); }
  else if(side===2){ bx=rnd(0,canvas.width); by=canvas.height+60; }
  else { bx=-60; by=rnd(0,canvas.height); }

  G.boss = {
    ...bType,
    x: bx, y: by,
    hp: Math.floor(bType.hp * hpMult),
    maxHp: Math.floor(bType.hp * hpMult),
    dx: 0, dy: 0,
    shootTimer: 0,
    chargeTimer: 0,
    charging: false,
    chargeDx: 0, chargeDy: 0,
    angle: 0,
    flickerTimer: 0,
    glowPhase: Math.random()*Math.PI*2,
    phase: G.phase,
  };
  G.bossActive = true;
  G.enemies = []; // limpa inimigos normais

  // Show boss HUD
  document.getElementById('bossHudBar').style.display = 'block';
  document.getElementById('bossHudName').textContent = `⚠ ${bType.name} — ${bType.subtitle}`;
  updateBossHUD();

  sndBoss();
  screenShake(15, 20);

  // Wave announce
  const wa = document.getElementById('waveAnnounce');
  wa.textContent = `⚠ BOSS ⚠`;
  wa.style.opacity = '1';
  wa.style.color   = '#ff0099';
  setTimeout(() => { wa.style.opacity='0'; wa.style.color='var(--neon-cyan)'; }, 2500);
}

function updateBossHUD() {
  if (!G.boss) return;
  const pct = Math.max(0, G.boss.hp / G.boss.maxHp * 100);
  document.getElementById('bossHudFill').style.width = pct + '%';
  document.getElementById('bossHudVal').textContent =
    `${Math.max(0,G.boss.hp).toLocaleString()} / ${G.boss.maxHp.toLocaleString()}`;
}

function spawnEnemy() {
  // Limit total enemies on screen for playability
  if (G.enemies.length >= G.spawnCap) return;

  const cw = canvas.width, ch = canvas.height;
  const side = Math.floor(Math.random()*4);
  let x, y;
  if (side===0){ x=rnd(0,cw); y=-30; }
  else if(side===1){ x=cw+30; y=rnd(0,ch); }
  else if(side===2){ x=rnd(0,cw); y=ch+30; }
  else { x=-30; y=rnd(0,ch); }

  // Type pool based on wave
  let pool = [0,0,0,1,1,2];
  if (G.wave >= 3) pool.push(3,4);
  if (G.wave >= 5) pool.push(5);
  const tpl = ENEMY_TYPES[pool[Math.floor(Math.random()*pool.length)]];

  G.enemies.push({
    x, y,
    hp: Math.floor(tpl.hp * G.enemyHpMult),
    maxHp: Math.floor(tpl.hp * G.enemyHpMult),
    speed: tpl.speed * G.enemySpeedMult,
    radius: tpl.radius, color: tpl.color,
    score: tpl.score, xp: tpl.xp, coins: tpl.coins,
    name: tpl.name,
    dx: 0, dy: 0,
    flickerTimer: 0,
    glowPhase: Math.random()*Math.PI*2,
  });
}

// ── Rarities & Upgrades ───────────────────────────────────────
const RARITIES       = ['common','rare','epic','legendary','cosmic'];
const RARITY_COLORS  = { common:'#aaaaaa', rare:'#4488ff', epic:'#cc44ff', legendary:'#ffaa00', cosmic:'#ff44cc' };
const RARITY_WEIGHTS = [50,28,14,6,2];
function rollRarity() {
  const total = RARITY_WEIGHTS.reduce((a,b)=>a+b,0);
  let r = Math.random()*total;
  for (let i=0;i<RARITIES.length;i++){ r-=RARITY_WEIGHTS[i]; if(r<=0) return RARITIES[i]; }
  return 'common';
}

const ALL_UPGRADES = [
  { id:'dmg1', name:'Power Amp',      icon:'⚡', desc:'Dano +25%',          rarity:'common',    apply:()=>{ G.damage=Math.floor(G.damage*1.25); } },
  { id:'dmg2', name:'Overcharge',     icon:'🔥', desc:'Dano +50%',          rarity:'rare',      apply:()=>{ G.damage=Math.floor(G.damage*1.5); } },
  { id:'spd1', name:'Nitro Boost',    icon:'💨', desc:'Velocidade +20%',    rarity:'common',    apply:()=>{ G.pSpeed*=1.2; } },
  { id:'spd2', name:'Warp Drive',     icon:'🌀', desc:'Velocidade +40%',    rarity:'rare',      apply:()=>{ G.pSpeed*=1.4; } },
  { id:'crit1',name:'Sharp Edge',     icon:'🎯', desc:'Crítico +10%',       rarity:'common',    apply:()=>{ G.critChance=Math.min(0.9,G.critChance+0.10); } },
  { id:'crit2',name:'Sniper Core',    icon:'🎪', desc:'Crítico +20%',       rarity:'rare',      apply:()=>{ G.critChance=Math.min(0.9,G.critChance+0.20); } },
  { id:'critm',name:'Executioner',    icon:'💀', desc:'Mult. crítico x2',   rarity:'epic',      apply:()=>{ G.critMult+=1.0; } },
  { id:'hp1',  name:'Shield Cell',    icon:'🛡️', desc:'HP máx +60',        rarity:'common',    apply:()=>{ G.maxHp+=60; G.hp=Math.min(G.hp+60,G.maxHp); } },
  { id:'heal1',name:'Nano Repair',    icon:'💊', desc:'Cura 40% HP',        rarity:'rare',      apply:()=>{ G.hp=Math.min(G.maxHp,G.hp+G.maxHp*0.4); } },
  { id:'heal2',name:'Full Restore',   icon:'❤️', desc:'HP completo',        rarity:'epic',      apply:()=>{ G.hp=G.maxHp; } },
  { id:'atk1', name:'Rapid Fire',     icon:'🔫', desc:'Ataque +35%',        rarity:'common',    apply:()=>{ G.attackSpeed*=1.35; } },
  { id:'atk2', name:'Gatling Core',   icon:'🔶', desc:'Ataque +70%',        rarity:'rare',      apply:()=>{ G.attackSpeed*=1.7; } },
  { id:'multi',name:'Double Shot',    icon:'✨', desc:'+1 projétil',        rarity:'epic',      apply:()=>{ G.bulletCount=Math.min(8,G.bulletCount+1); } },
  { id:'multi2',name:'Spread Shot',   icon:'🌟', desc:'+2 projéteis',       rarity:'legendary', apply:()=>{ G.bulletCount=Math.min(8,G.bulletCount+2); } },
  { id:'xp1',  name:'Data Siphon',    icon:'📡', desc:'XP ganho +40%',      rarity:'common',    apply:()=>{ G.xpMulti*=1.4; } },
  { id:'coin1',name:'Gold Magnet',    icon:'🪙', desc:'Moedas +60%',        rarity:'rare',      apply:()=>{ G.coinMulti*=1.6; } },
  { id:'shield',name:'Force Field',   icon:'🔵', desc:'Escudo +100 HP',     rarity:'rare',      apply:()=>{ G.shieldHp+=100; } },
  { id:'pet1', name:'Nano Pet',       icon:'🤖', desc:'Pet automático',     rarity:'epic',      apply:()=>{ addPet(); } },
  { id:'pet2', name:'Twin Drones',    icon:'👾', desc:'+2 pets',            rarity:'legendary', apply:()=>{ addPet();addPet(); } },
  { id:'bspd', name:'Hyper Bolt',     icon:'⚡', desc:'Vel. projétil +50%', rarity:'common',    apply:()=>{ G.bulletSpeed*=1.5; } },
  { id:'dmulti',name:'Damage Surge',  icon:'💥', desc:'Mult. dano x1.5',    rarity:'legendary', apply:()=>{ G.damageMulti*=1.5; } },
  { id:'dmulti2',name:'COSMIC POWER', icon:'🌌', desc:'Mult. dano x3!!',    rarity:'cosmic',    apply:()=>{ G.damageMulti*=3.0; } },
  { id:'heal3',name:'Life Drain',     icon:'🩸', desc:'Cura ao matar',      rarity:'epic',      apply:()=>{ G._lifeDrain=true; } },
];

function addPet() {
  const angle = Math.random()*Math.PI*2;
  G.pets.push({
    angle, radius: 50 + G.pets.length*18,
    orbitSpeed: 0.03 + Math.random()*0.02,
    shootTimer: 0, shootRate: 80,
    x: G.px, y: G.py,
    color: `hsl(${Math.random()*360},100%,60%)`,
  });
}

function getUpgrades() {
  const shuffled = [...ALL_UPGRADES].sort(()=>Math.random()-0.5);
  const picks = [];
  for (const u of shuffled) {
    if (picks.length >= 3) break;
    const roll = rollRarity();
    const rollIdx = RARITIES.indexOf(roll);
    const upIdx   = RARITIES.indexOf(u.rarity);
    if (Math.abs(rollIdx - upIdx) <= 1) picks.push({...u});
  }
  while (picks.length < 3) {
    const u = shuffled[Math.floor(Math.random()*shuffled.length)];
    if (!picks.find(p=>p.id===u.id)) picks.push({...u});
  }
  return picks.slice(0,3);
}

// ── Shop ──────────────────────────────────────────────────────
function openShop() {
  G.paused = true;
  document.getElementById('shopCoinsDisplay').textContent = G.playerCoins;
  buildShopGrid();
  document.getElementById('shopScreen').classList.add('active');
}
function closeShop() {
  document.getElementById('shopScreen').classList.remove('active');
  if (G.running) G.paused = false;
}
function buildShopGrid() {
  const grid = document.getElementById('shopGrid');
  grid.innerHTML = '';

  const categories = [
    { id:'weapon',  label:'⚔  ARMAS',      color:'#ff4488' },
    { id:'defense', label:'🛡  DEFESA',     color:'#4488ff' },
    { id:'utility', label:'⚡  UTILIDADE',  color:'#ffee00' },
    { id:'heal',    label:'💚  CURA',       color:'#00ff88' },
  ];

  for (const cat of categories) {
    const items = SHOP_ITEMS.filter(i => i.category === cat.id);
    if (!items.length) continue;

    // Separador de seção
    const hdr = document.createElement('div');
    hdr.className = 'shop-cat-header';
    hdr.style.color = cat.color;
    hdr.style.borderColor = cat.color;
    hdr.textContent = cat.label;
    grid.appendChild(hdr);

    for (const item of items) {
      const owned      = !item.consumable && purchasedItems.has(item.id);
      const affordable = G.playerCoins >= item.price;
      const state      = owned ? 'owned' : affordable ? 'affordable' : 'too-expensive';

      const div = document.createElement('div');
      div.className = `shop-item ${state}`;
      div.style.setProperty('--cat-color', cat.color);

      div.innerHTML = `
        <div class="shop-item-top">
          <span class="shop-item-icon">${item.icon}</span>
          <div class="shop-item-badges">
            ${owned       ? '<span class="shop-badge badge-owned">✓ ATIVO</span>' : ''}
            ${item.consumable ? '<span class="shop-badge badge-consumable">USO ÚNICO</span>' : ''}
          </div>
        </div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-stat">${item.stat || ''}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-footer">
          <span class="shop-item-price">💰 ${item.price}</span>
          ${!owned && !affordable ? '<span class="shop-item-lock">🔒 sem moedas</span>' : ''}
        </div>
      `;
      if (!owned && affordable) div.onclick = () => buyItem(item);
      grid.appendChild(div);
    }
  }
}
function buyItem(item) {
  if (G.playerCoins < item.price) return;
  G.playerCoins -= item.price;
  if (!item.consumable) purchasedItems.add(item.id);
  item.apply();
  // Save to API
  savePurchaseAPI({ item_id: item.id, item_name: item.name, price: item.price });
  localStorage.setItem('nrPurchased', JSON.stringify([...purchasedItems]));
  // Update shop
  document.getElementById('shopCoinsDisplay').textContent = G.playerCoins;
  document.getElementById('coinsVal').textContent = G.playerCoins;
  buildShopGrid();
  showLoot('legendary', item.name);
  sndLevelUp();
}

// ── Shooting ──────────────────────────────────────────────────
function playerShoot() {
  let baseAng;

  if (G.mouseDown && !isMobile()) {
    // Mira manual: atira em direção ao cursor
    baseAng = Math.atan2(G.mouseY - G.py, G.mouseX - G.px);
  } else {
    // Auto-mira: inimigo mais próximo
    if (!G.enemies.length && !G.bossActive) return;
    const targets = G.bossActive && G.boss ? [G.boss, ...G.enemies] : G.enemies;
    let nearest = null, nearDist = Infinity;
    for (const e of targets) {
      const d = dist(G.px, G.py, e.x, e.y);
      if (d < nearDist) { nearDist = d; nearest = e; }
    }
    if (!nearest) return;
    baseAng = Math.atan2(nearest.y - G.py, nearest.x - G.px);
  }

  const bulletColor = G.mouseDown && !isMobile() ? '#ff44cc' : '#00f5ff';
  for (let i=0; i<G.bulletCount; i++) {
    const ang = baseAng + (i - (G.bulletCount-1)/2) * 0.20;
    G.bullets.push({
      x: G.px, y: G.py,
      dx: Math.cos(ang) * G.bulletSpeed,
      dy: Math.sin(ang) * G.bulletSpeed,
      r: 5, life: 120,
      color: bulletColor,
      pierces: G.hasRicochet ? 2 : 1,
    });
  }
  sndShoot();
}

function petShoot(pet) {
  const targets = G.bossActive && G.boss ? [G.boss, ...G.enemies] : G.enemies;
  if (!targets.length) return;
  let nearest = null, nearDist = Infinity;
  for (const e of targets) {
    const d = dist(pet.x, pet.y, e.x, e.y);
    if (d < nearDist) { nearDist = d; nearest = e; }
  }
  if (!nearest) return;
  const ang = Math.atan2(nearest.y - pet.y, nearest.x - pet.x);
  G.bullets.push({
    x: pet.x, y: pet.y,
    dx: Math.cos(ang) * (G.bulletSpeed * 0.8),
    dy: Math.sin(ang) * (G.bulletSpeed * 0.8),
    r: 4, life: 80, color: pet.color, isPet: true,
  });
}

// ── Coin Spawn ────────────────────────────────────────────────
function spawnCoin(x, y, count=2) {
  for (let i=0; i<count; i++) {
    G.coins.push({
      x: x+rnd(-12,12), y: y+rnd(-12,12),
      r: 5, life: 300,
      vx: rnd(-1,1), vy: rnd(-2,0),
      value: 1, attracted: false,
    });
  }
}

// ── Loot Notification ─────────────────────────────────────────
function showLoot(rarity, name) {
  const el = document.createElement('div');
  el.className = `loot-item loot-${rarity}`;
  el.textContent = `◈ ${name.toUpperCase()} [${rarity.toUpperCase()}]`;
  document.getElementById('lootNotif').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ── Wave System ───────────────────────────────────────────────
function nextWave() {
  G.wave++;
  G.waveKills      = 0;
  G.waveKillTarget = 25 + G.wave * 8;
  G.spawnCap       = Math.min(14 + Math.floor(G.wave * 2), 40);
  G.spawnRate      = Math.max(18, 80 - G.wave * 7);
  G.enemyHpMult    = Math.pow(1.30, G.wave - 1); // exponencial: ×1.30 por wave (sem limite)
  G.enemySpeedMult = Math.pow(1.08, G.wave - 1); // exponencial: ×1.08 por wave (sem limite)
  sndWave();

  const wa = document.getElementById('waveAnnounce');
  const hpPct = Math.round(G.enemyHpMult * 100);
  wa.textContent = `WAVE ${G.wave}  ·  HP ${hpPct}%`;
  wa.style.opacity = '1';
  setTimeout(() => { wa.style.opacity='0'; }, 2500);
  document.getElementById('statWave').textContent = G.wave;
}

// ── Damage Enemy ──────────────────────────────────────────────
function damageEnemy(enemy, dmgBase) {
  const isCrit = Math.random() < G.critChance;
  const dmg    = Math.floor(dmgBase * G.damageMulti * (isCrit ? G.critMult : 1));
  enemy.hp -= dmg;
  enemy.flickerTimer = 6;

  spawnFloat(enemy.x, enemy.y - enemy.radius, isCrit ? `⚡${dmg}` : `${dmg}`, isCrit ? '#ffee00' : '#fff', isCrit ? 20 : 13);
  spawnParticles(enemy.x, enemy.y, isCrit ? 8 : 3, enemy.color, 3, 3, 20);
  if (isCrit) { screenShake(5,7); sndCrit(); } else sndHit();

  if (enemy.hp <= 0) killEnemy(enemy);
}

function damageBoss(dmgBase) {
  if (!G.boss) return;
  const isCrit = Math.random() < G.critChance;
  const dmg    = Math.floor(dmgBase * G.damageMulti * (isCrit ? G.critMult : 1));
  G.boss.hp -= dmg;
  G.boss.flickerTimer = 5;

  spawnFloat(G.boss.x, G.boss.y - G.boss.radius - 5, isCrit ? `⚡${dmg}` : `${dmg}`, isCrit ? '#ffee00' : '#ff88cc', isCrit ? 22 : 15);
  spawnParticles(G.boss.x, G.boss.y, isCrit ? 10 : 4, G.boss.color, 4, 4, 22);
  if (isCrit) { screenShake(8,10); sndCrit(); } else sndHit();

  updateBossHUD();

  if (G.boss.hp <= 0) killBoss();
}

function killBoss() {
  const boss = G.boss;
  G.bossKills++;
  G.score += boss.score;
  G.kills++;

  // XP & coins
  const xpGain   = Math.floor(boss.xpReward * G.xpMulti);
  const coinGain  = Math.ceil(boss.coinReward * G.coinMulti);
  G.xp += xpGain;
  G.playerCoins += coinGain;
  G.totalCoins  += coinGain;

  spawnParticles(boss.x, boss.y, 60, boss.color, 8, 6, 60);
  spawnParticles(boss.x, boss.y, 30, '#ffffff', 5, 3, 40);
  spawnCoin(boss.x, boss.y, 20);
  screenShake(20, 25);
  sndBossKill();

  // Hide boss HUD
  document.getElementById('bossHudBar').style.display = 'none';
  G.bossActive = false;
  G.boss = null;

  // Level up pós-boss — máx 1 por vez
  if (G.xp >= G.xpNext) {
    G.xp -= G.xpNext; G.level++;
    G.xpNext = xpForLevel(G.level);
    triggerLevelUp();
  }

  // Show boss defeat screen
  G.paused = true;
  G.bossDefeated = true;
  document.getElementById('bossDefeatTitle').textContent = `${boss.name} DERROTADO!`;
  document.getElementById('bossDefeatSub').textContent   = `Fase ${G.phase} → Fase ${G.phase + 1}`;
  document.getElementById('bossDefeatReward').textContent = `+${xpGain} XP   +${coinGain} COINS`;
  document.getElementById('bossDefeatScreen').classList.add('active');

  updateHUD();
}

function killEnemy(enemy) {
  const baseScore  = enemy.score;
  const comboBonus = 1 + G.combo * 0.1;
  G.score += Math.floor(baseScore * comboBonus);

  // XP — aumentado significativamente
  const xpGain = Math.floor(enemy.xp * G.xpMulti);
  G.xp += xpGain;
  spawnFloat(enemy.x, enemy.y - enemy.radius - 14, `+${xpGain}XP`, '#cc44ff', 12);

  // Coins
  spawnCoin(enemy.x, enemy.y, Math.ceil(enemy.coins * G.coinMulti));

  // Combo
  G.combo++;
  G.comboTimer = 180;
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  if (G.combo > 1) sndCombo();

  // Life drain
  if (G._lifeDrain || G.hasVampire) G.hp = Math.min(G.maxHp, G.hp + 5);

  spawnParticles(enemy.x, enemy.y, 14, enemy.color, 5, 4, 38);

  G.kills++;
  G.waveKills++;
  document.getElementById('statKills').textContent = G.kills;

  const idx = G.enemies.indexOf(enemy);
  if (idx !== -1) G.enemies.splice(idx, 1);

  // Explosive bullets — sem recursão para não travar com muitos inimigos
  if (G.hasExplosive) {
    spawnParticles(enemy.x, enemy.y, 20, '#ff6600', 6, 5, 25);
    const splashDmg = Math.floor(G.damage * G.damageMulti * 0.5);
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e2 = G.enemies[j];
      if (dist(enemy.x, enemy.y, e2.x, e2.y) < 60) {
        e2.hp -= splashDmg;
        e2.flickerTimer = 5;
        spawnParticles(e2.x, e2.y, 3, e2.color, 3, 2, 15);
        if (e2.hp <= 0) {
          // Mata direto sem chamar killEnemy (evita recursão infinita)
          G.score += Math.floor(e2.score * (1 + G.combo * 0.1));
          G.xp    += Math.floor(e2.xp * G.xpMulti);
          spawnCoin(e2.x, e2.y, Math.ceil(e2.coins * G.coinMulti));
          G.kills++;
          G.waveKills++;
          G.enemies.splice(j, 1);
        }
      }
    }
  }

  // Level up — máx 1 por kill para não travar com xpMulti alto
  if (G.xp >= G.xpNext) {
    G.xp -= G.xpNext; G.level++;
    G.xpNext = xpForLevel(G.level);
    triggerLevelUp();
  }

  // Wave kill target reached → spawn boss
  if (G.waveKills >= G.waveKillTarget && !G.bossActive) {
    spawnBoss();
  }

  G._hudDirty = true; // HUD atualizado uma vez por update(), não por kill
}

// ── Level Up ──────────────────────────────────────────────────
function triggerLevelUp() {
  sndLevelUp(); screenShake(10,14);

  const upgrades = getUpgrades();
  const container = document.getElementById('upgradeCards');
  container.innerHTML = '';
  document.getElementById('upgradeLvlBadge').textContent = `NÍVEL ${G.level}`;

  upgrades.forEach(u => {
    const col  = RARITY_COLORS[u.rarity] || '#fff';
    const card = document.createElement('div');
    card.className = `upgrade-card ${u.rarity}`;
    card.innerHTML = `
      <div class="rarity-tag" style="color:${col}">${u.rarity}</div>
      <div class="upgrade-icon">${u.icon}</div>
      <div class="upgrade-name" style="color:${col}">${u.name}</div>
      <div class="upgrade-desc">${u.desc}</div>
    `;
    card.onclick = () => {
      u.apply();
      showLoot(u.rarity, u.name);
      document.getElementById('upgradeScreen').classList.remove('active');
      G.upgrading = false;
      updateHUD();
    };
    container.appendChild(card);
  });

  G.upgrading = true;
  document.getElementById('upgradeScreen').classList.add('active');
}

// ── HUD Update ────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('lvlVal').textContent  = G.level;
  document.getElementById('barHp').style.width   = (G.hp / G.maxHp * 100) + '%';
  document.getElementById('hpVal').textContent   = `${Math.ceil(G.hp)}/${G.maxHp}`;
  const xpPct = G.xp / G.xpNext * 100;
  document.getElementById('barXp').style.width   = xpPct + '%';
  document.getElementById('xpVal').textContent   = `${Math.floor(G.xp)}/${G.xpNext}`;
  document.getElementById('scoreVal').textContent = G.score.toLocaleString();
  document.getElementById('coinsVal').textContent = G.playerCoins;
  document.getElementById('statDmg').textContent  = Math.floor(G.damage * G.damageMulti);
  document.getElementById('statSpd').textContent  = G.pSpeed.toFixed(1);
  document.getElementById('statCrit').textContent = Math.floor(G.critChance*100) + '%';

  const cd = document.getElementById('comboDisplay');
  if (G.combo >= 2) {
    cd.style.display = 'block';
    cd.textContent   = `x${G.combo}`;
    cd.style.transform = 'scale(1.1)';
    setTimeout(() => { cd.style.transform='scale(1)'; }, 90);
  } else {
    cd.style.display = 'none';
  }
  updateAbilitiesHUD();
}

function updateAbilitiesHUD() {
  const el = document.getElementById('abilBar');
  if (!el) return;
  const pills = [];

  if (G.hasSlowTime) {
    if (G.slowTimeActive) {
      pills.push(`<span class="abil-pill abil-active">⏳ ATIVO ${Math.ceil(G.slowTimeDuration/60)}s</span>`);
    } else if (G.slowTimeCooldown > 0) {
      pills.push(`<span class="abil-pill abil-cooldown">⏳ Q: ${Math.ceil(G.slowTimeCooldown/60)}s CD</span>`);
    } else {
      pills.push(`<span class="abil-pill abil-ready">⏳ Q: PRONTO</span>`);
    }
  }

  if (G.barrierActive) {
    pills.push(`<span class="abil-pill abil-active">🫧 BARREIRA ${Math.ceil(G.barrierDuration/60)}s</span>`);
  }

  if (G.hasSword) pills.push(`<span class="abil-pill abil-ready">⚔ ESPADA</span>`);
  if (G.hasRicochet) pills.push(`<span class="abil-pill abil-ready">🔀 RICOCHETE</span>`);

  el.innerHTML = pills.join('');
  el.style.display = pills.length ? 'flex' : 'none';
}

// ════════════════════════════════════════════════════════════
//   DRAWING
// ════════════════════════════════════════════════════════════

function drawGlow(x, y, r, color, intensity=1) {
  if (!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r)||r<=0) return;
  const grad = ctx.createRadialGradient(x,y,0,x,y,r*2.5);
  let gc = color;
  if (typeof color==='string'&&color.startsWith('hsl('))
    gc = color.replace('hsl(','hsla(').replace(')',`,${Math.min(Math.max(intensity,0),1)})`);
  else if (typeof color==='string'&&color.startsWith('#'))
    gc = color + Math.floor(Math.min(Math.max(intensity,0),1)*255).toString(16).padStart(2,'0');
  grad.addColorStop(0,gc);
  grad.addColorStop(1,'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x,y,r*2.5,0,Math.PI*2);
  ctx.fill();
}

function drawPlayer() {
  const x=G.px, y=G.py, r=G.pRadius;
  if (!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r)) return;
  const t = Date.now()/1000;

  // Dash trail
  if (G.dashActive > 0) {
    for (let i=1;i<=4;i++) {
      ctx.globalAlpha = 0.14*i/4;
      ctx.beginPath();
      ctx.arc(x-G.dashDx*i*3,y-G.dashDy*i*3,r,0,Math.PI*2);
      ctx.fillStyle = '#ff0099'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Shield visual
  if (G.shieldHp > 0) {
    ctx.save(); ctx.globalAlpha = 0.38+Math.sin(t*4)*0.12;
    ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 3;
    ctx.shadowBlur = 18; ctx.shadowColor = '#4488ff';
    ctx.beginPath(); ctx.arc(x,y,r+8+Math.sin(t*3)*2,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // Sword
  if (G.hasSword) {
    G.swordAngle += 0.07;
    const sx = x + Math.cos(G.swordAngle) * G.swordRadius;
    const sy = y + Math.sin(G.swordAngle) * G.swordRadius;
    ctx.save();
    ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 4;
    ctx.shadowBlur = 20; ctx.shadowColor = '#00f5ff';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(G.swordAngle+Math.PI)*20, y + Math.sin(G.swordAngle+Math.PI)*20);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();
    // Dano da espada é processado em update(), não aqui
  }

  drawGlow(x,y,r,'#00f5ff',0.55+Math.sin(t*3)*0.18);
  const grad = ctx.createRadialGradient(x-r*0.3,y-r*0.3,0,x,y,r);
  grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.4,'#88eeff');
  grad.addColorStop(0.8,'#00aaff'); grad.addColorStop(1,'#003388');
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle = grad; ctx.shadowBlur = 22; ctx.shadowColor = '#00f5ff';
  ctx.fill(); ctx.shadowBlur = 0;

  // Spin ring
  ctx.save(); ctx.translate(x,y); ctx.rotate(t*2);
  ctx.strokeStyle = 'rgba(0,245,255,0.55)'; ctx.lineWidth = 1.5;
  for (let i=0;i<3;i++) {
    const a = (i/3)*Math.PI*2;
    ctx.beginPath(); ctx.arc(Math.cos(a)*r*0.62,Math.sin(a)*r*0.62,3,0,Math.PI*2);
    ctx.fillStyle = '#00f5ff'; ctx.fill();
  }
  ctx.restore();
  if (G.running) spawnTrail(x,y,'#00f5ff');
}

function drawBoss() {
  if (!G.boss) return;
  const b = G.boss, t = Date.now()/1000;

  // Flicker
  if (b.flickerTimer > 0) {
    b.flickerTimer--;
    if (Math.floor(b.flickerTimer)%2===0) return;
  }

  // Warning aura
  const auraSize = b.radius * (2.5 + Math.sin(t*3)*0.3);
  const aura = ctx.createRadialGradient(b.x,b.y,b.radius*0.5,b.x,b.y,auraSize);
  aura.addColorStop(0,'transparent');
  aura.addColorStop(0.5,b.color + '33');
  aura.addColorStop(1,'transparent');
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(b.x,b.y,auraSize,0,Math.PI*2); ctx.fill();

  // HP bar above boss
  const bw = b.radius*3;
  const bx = b.x - bw/2, by = b.y - b.radius - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx,by,bw,6);
  ctx.fillStyle = b.color;           ctx.fillRect(bx,by,bw*(b.hp/b.maxHp),6);

  // Body
  ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(t*0.8);
  // Outer ring
  for (let ring=0;ring<3;ring++) {
    const ringR = b.radius * (1 + ring*0.35);
    ctx.globalAlpha = 0.3 - ring*0.08;
    ctx.strokeStyle = b.color; ctx.lineWidth = 2;
    ctx.shadowBlur = 20; ctx.shadowColor = b.color;
    ctx.beginPath(); ctx.arc(0,0,ringR,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Core
  const grad = ctx.createRadialGradient(-b.radius*0.3,-b.radius*0.3,0,0,0,b.radius);
  grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.3,b.color);
  grad.addColorStop(0.7,b.color+'88'); grad.addColorStop(1,'#000000');
  ctx.beginPath(); ctx.arc(0,0,b.radius,0,Math.PI*2);
  ctx.fillStyle = grad; ctx.shadowBlur = 30; ctx.shadowColor = b.color;
  ctx.fill(); ctx.shadowBlur = 0;
  // Spikes
  for (let i=0;i<8;i++) {
    const a = (i/8)*Math.PI*2 + t;
    const px = Math.cos(a)*(b.radius+14+Math.sin(t*4+i)*4);
    const py = Math.sin(a)*(b.radius+14+Math.sin(t*4+i)*4);
    ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2);
    ctx.fillStyle = b.color; ctx.fill();
  }
  ctx.restore();

  // Name tag
  ctx.save(); ctx.font = `bold 11px 'Orbitron',monospace`;
  ctx.fillStyle = b.color; ctx.textAlign = 'center';
  ctx.shadowBlur = 12; ctx.shadowColor = b.color;
  ctx.fillText(b.name, b.x, b.y - b.radius - 22);
  ctx.restore();
}

function drawEnemies() {
  const t = Date.now()/1000;
  for (const e of G.enemies) {
    if (e.flickerTimer > 0) { e.flickerTimer--; if(Math.floor(e.flickerTimer)%2===0) continue; }

    if (e.hp < e.maxHp) {
      const bw = e.radius*2.4, bx = e.x-bw/2, by = e.y-e.radius-9;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx,by,bw,4);
      ctx.fillStyle = e.color;           ctx.fillRect(bx,by,bw*(e.hp/e.maxHp),4);
    }

    drawGlow(e.x,e.y,e.radius,e.color,0.38+Math.sin(t*3+e.glowPhase)*0.12);

    ctx.beginPath();
    if (e.name==='Tank') {
      ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(t*0.5);
      ctx.beginPath();
      for(let i=0;i<6;i++){
        const a=i/6*Math.PI*2;
        i===0?ctx.moveTo(Math.cos(a)*e.radius,Math.sin(a)*e.radius):ctx.lineTo(Math.cos(a)*e.radius,Math.sin(a)*e.radius);
      }
      ctx.closePath();
      ctx.fillStyle=e.color; ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
    } else if(e.name==='Ghost') {
      ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(t*1.4);
      ctx.globalAlpha=0.65+Math.sin(t*3)*0.2;
      ctx.beginPath(); ctx.moveTo(0,-e.radius); ctx.lineTo(e.radius,0);
      ctx.lineTo(0,e.radius); ctx.lineTo(-e.radius,0); ctx.closePath();
      ctx.fillStyle=e.color; ctx.fill();
      ctx.restore(); ctx.globalAlpha=1;
    } else {
      ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);
      ctx.fillStyle=e.color; ctx.fill();
    }
  }
}

function drawBullets() {
  // Avoid createRadialGradient + shadowBlur per bullet — use two-circle glow instead
  for (const b of G.bullets) {
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r*2.8,0,Math.PI*2);
    ctx.fillStyle = b.color; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
    ctx.fillStyle = b.color; ctx.fill();
  }
}

function drawCoins() {
  const t = Date.now()/1000;
  ctx.save();
  for (const c of G.coins) {
    const a = Math.min(1, c.life/60);
    ctx.globalAlpha = a * 0.25;
    ctx.beginPath(); ctx.arc(c.x,c.y,c.r*2.5,0,Math.PI*2);
    ctx.fillStyle = '#ffee00'; ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(c.x,c.y,c.r+Math.sin(t*5)*0.5,0,Math.PI*2);
    ctx.fillStyle = '#ffcc00'; ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of G.particles) {
    const alpha = p.life/p.maxLife;
    ctx.globalAlpha = alpha * 0.88;
    if (p.glow) { ctx.shadowBlur = 7; ctx.shadowColor = p.color; }
    else ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.4,p.r*alpha),0,Math.PI*2);
    ctx.fillStyle = p.color; ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawFloaters() {
  ctx.save();
  ctx.textAlign = 'center';
  for (const f of G.floaters) {
    ctx.globalAlpha = f.life/f.maxLife;
    ctx.font = `bold ${f.size}px 'Orbitron',monospace`;
    ctx.fillStyle = f.color;
    ctx.shadowBlur = 10; ctx.shadowColor = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPets() {
  for (const pet of G.pets) {
    pet.angle += pet.orbitSpeed;
    pet.x = G.px + Math.cos(pet.angle)*pet.radius;
    pet.y = G.py + Math.sin(pet.angle)*pet.radius;
    ctx.save(); ctx.globalAlpha=0.09;
    ctx.strokeStyle=pet.color; ctx.lineWidth=1; ctx.setLineDash([4,8]);
    ctx.beginPath(); ctx.arc(G.px,G.py,pet.radius,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    drawGlow(pet.x,pet.y,7,pet.color,0.65);
    ctx.beginPath(); ctx.arc(pet.x,pet.y,7,0,Math.PI*2);
    ctx.fillStyle=pet.color; ctx.fill();
    pet.shootTimer++;
    if (pet.shootTimer >= pet.shootRate) { pet.shootTimer=0; petShoot(pet); }
  }
}

function buildBgCache() {
  const oc = document.createElement('canvas');
  oc.width = canvas.width; oc.height = canvas.height;
  const ox = oc.getContext('2d');
  ox.fillStyle = '#020408';
  ox.fillRect(0, 0, oc.width, oc.height);
  // Batch all grid lines into a single stroke call
  ox.save(); ox.globalAlpha = 0.035; ox.strokeStyle = '#00f5ff'; ox.lineWidth = 0.5;
  ox.beginPath();
  const gs = 50;
  for (let x = 0; x < oc.width; x += gs) { ox.moveTo(x, 0); ox.lineTo(x, oc.height); }
  for (let y = 0; y < oc.height; y += gs) { ox.moveTo(0, y); ox.lineTo(oc.width, y); }
  ox.stroke(); ox.restore();
  const vg = ox.createRadialGradient(oc.width/2,oc.height/2,oc.height*0.2,oc.width/2,oc.height/2,oc.height*0.8);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,0.45)');
  ox.fillStyle = vg; ox.fillRect(0, 0, oc.width, oc.height);
  _bgCache = oc;
}
function drawBackground() {
  if (!_bgCache) buildBgCache();
  ctx.drawImage(_bgCache, 0, 0);
}

// ════════════════════════════════════════════════════════════
//   GAME LOOP
// ════════════════════════════════════════════════════════════
let animId = null;
let accumulator = 0;
const FIXED_STEP = 1000 / 60; // 16.67ms — 1 passo lógico = 1/60s

function gameLoop(timestamp) {
  if (!G.running) return;
  const elapsed = Math.min(50, timestamp - G.lastTime);
  G.lastTime = timestamp;

  if (!G.paused && !G.upgrading) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 3) { // máx 3 updates por frame — evita espiral
      update();
      accumulator -= FIXED_STEP;
      steps++;
    }
    if (accumulator > FIXED_STEP * 3) accumulator = 0; // descarta lag acumulado
  }
  render();
  animId = requestAnimationFrame(gameLoop);
}

function update() {
  // ── Player movement ────────────────────────────────────────
  let mx=0, my=0;
  if (G.keys['ArrowLeft']||G.keys['KeyA']||G.keys['a']) mx-=1;
  if (G.keys['ArrowRight']||G.keys['KeyD']||G.keys['d']) mx+=1;
  if (G.keys['ArrowUp']||G.keys['KeyW']||G.keys['w']) my-=1;
  if (G.keys['ArrowDown']||G.keys['KeyS']||G.keys['s']) my+=1;
  if (G.jActive) { mx=G.jDx; my=G.jDy; }
  const ml = Math.hypot(mx,my);
  if (ml>0) { mx/=ml; my/=ml; }

  let spd = G.pSpeed;
  if (G.dashActive > 0) { G.dashActive--; spd=G.pSpeed*5; mx=G.dashDx; my=G.dashDy; spawnParticles(G.px,G.py,3,'#ff0099',4,3,14); }
  if (G.dashCooldown>0) G.dashCooldown--;

  G.px = clamp(G.px+mx*spd, G.pRadius, canvas.width-G.pRadius);
  G.py = clamp(G.py+my*spd, G.pRadius, canvas.height-G.pRadius);

  // ── Auto shoot ─────────────────────────────────────────────
  const shootInterval = Math.floor(60/G.attackSpeed);
  G.shootTimer++;
  if (G.shootTimer >= shootInterval) { G.shootTimer=0; playerShoot(); }

  // ── Update bullets ─────────────────────────────────────────
  for (let i=G.bullets.length-1;i>=0;i--) {
    const b = G.bullets[i];
    b.x+=b.dx; b.y+=b.dy; b.life--;
    if (Math.random()<0.06) spawnTrail(b.x,b.y,b.color);
    if (b.life<=0||b.x<-20||b.x>canvas.width+20||b.y<-20||b.y>canvas.height+20) { G.bullets.splice(i,1); continue; }

    let hit = false;
    // Boss hit
    if (G.bossActive && G.boss && dist(b.x,b.y,G.boss.x,G.boss.y) < b.r+G.boss.radius) {
      damageBoss(G.damage);
      G.bullets.splice(i,1); hit=true;
    }
    if (hit) continue;
    // Enemy hit
    for (let j=G.enemies.length-1;j>=0;j--) {
      if (dist(b.x,b.y,G.enemies[j].x,G.enemies[j].y) < b.r+G.enemies[j].radius) {
        damageEnemy(G.enemies[j], G.damage);
        b.pierces = (b.pierces || 1) - 1;
        if (b.pierces <= 0) { G.bullets.splice(i,1); hit=true; }
        break;
      }
    }
  }

  // ── Espada (dano em update, não em render) ─────────────────
  if (G.hasSword && !G.bossActive) {
    const sx = G.px + Math.cos(G.swordAngle) * G.swordRadius;
    const sy = G.py + Math.sin(G.swordAngle) * G.swordRadius;
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const se = G.enemies[j];
      if (!se) break; // guard: array pode ter sido limpo
      if (dist(sx, sy, se.x, se.y) < se.radius + 8) {
        damageEnemy(se, G.damage * 0.6);
        if (G.bossActive) break; // boss acabou de spawnar, para
      }
    }
  }

  // ── Update enemies ─────────────────────────────────────────
  for (const e of G.enemies) {
    const ang = Math.atan2(G.py-e.y,G.px-e.x);
    e.dx = lerp(e.dx, Math.cos(ang)*e.speed, 0.08);
    e.dy = lerp(e.dy, Math.sin(ang)*e.speed, 0.08);
    e.x += e.dx * G.timeScale;
    e.y += e.dy * G.timeScale;

    if (dist(e.x,e.y,G.px,G.py) < e.radius+G.pRadius && G.invincibleTimer<=0) {
      let dmg = 8 + G.wave * 1.5;
      if (G.hasArmor) dmg *= 0.7;
      if (G.shieldHp>0) { const bl=Math.min(G.shieldHp,dmg); G.shieldHp-=bl; dmg-=bl; spawnParticles(G.px,G.py,5,'#4488ff',4,3,18); }
      G.hp -= dmg; G.invincibleTimer=38; screenShake(7,9);
      spawnParticles(G.px,G.py,6,'#ff0055',3,3,22);
      spawnFloat(G.px,G.py-G.pRadius,`-${Math.ceil(dmg)}`,'#ff0055',15);
      if (G.hp<=0) { G.hp=0; gameOver(); return; }
      G._hudDirty = true;
    }
  }

  // ── Update boss ────────────────────────────────────────────
  if (G.bossActive && G.boss) {
    const b  = G.boss;
    const t  = Date.now()/1000;
    const distToPlayer = dist(b.x,b.y,G.px,G.py);

    const ts = G.timeScale;
    if (b.pattern === 'orbit') {
      const ang = Math.atan2(G.py-b.y,G.px-b.x);
      b.dx = lerp(b.dx, Math.cos(ang)*b.speed, 0.05);
      b.dy = lerp(b.dy, Math.sin(ang)*b.speed, 0.05);
      b.x += b.dx * ts; b.y += b.dy * ts;
      b.shootTimer += ts;
      if (b.shootTimer >= 90) {
        b.shootTimer = 0;
        for (let i=0;i<8;i++) {
          const sa = (i/8)*Math.PI*2+b.angle;
          G.bullets.push({x:b.x,y:b.y,dx:Math.cos(sa)*3,dy:Math.sin(sa)*3,r:6,life:100,color:b.color,isBoss:true});
        }
        b.angle += 0.35;
      }
    } else if (b.pattern === 'charge') {
      if (!b.charging) {
        b.chargeTimer += ts;
        const ang = Math.atan2(G.py-b.y,G.px-b.x);
        b.dx = lerp(b.dx, Math.cos(ang)*b.speed, 0.04);
        b.dy = lerp(b.dy, Math.sin(ang)*b.speed, 0.04);
        b.x += b.dx * ts; b.y += b.dy * ts;
        if (b.chargeTimer >= 120) {
          b.chargeTimer = 0; b.charging = true;
          const ca = Math.atan2(G.py-b.y,G.px-b.x);
          b.chargeDx = Math.cos(ca)*8; b.chargeDy = Math.sin(ca)*8;
          setTimeout(()=>{ if(G.boss) G.boss.charging=false; }, 600);
        }
      } else {
        b.x += b.chargeDx * ts; b.y += b.chargeDy * ts;
      }
    } else { // spiral
      const ang = Math.atan2(G.py-b.y,G.px-b.x);
      b.dx = lerp(b.dx, Math.cos(ang)*b.speed, 0.04);
      b.dy = lerp(b.dy, Math.sin(ang)*b.speed, 0.04);
      b.x += b.dx * ts; b.y += b.dy * ts;
      b.shootTimer += ts;
      b.angle += 0.08 * ts;
      if (b.shootTimer >= 20) {
        b.shootTimer = 0;
        G.bullets.push({x:b.x,y:b.y,dx:Math.cos(b.angle)*4,dy:Math.sin(b.angle)*4,r:5,life:90,color:b.color,isBoss:true});
        G.bullets.push({x:b.x,y:b.y,dx:Math.cos(b.angle+Math.PI)*4,dy:Math.sin(b.angle+Math.PI)*4,r:5,life:90,color:b.color,isBoss:true});
      }
    }

    // Boss bullets damage player
    for (let i=G.bullets.length-1;i>=0;i--) {
      const bl = G.bullets[i];
      if (!bl.isBoss) continue;
      if (dist(bl.x,bl.y,G.px,G.py) < bl.r+G.pRadius && G.invincibleTimer<=0) {
        let dmg = 12 + G.wave;
        if (G.hasArmor) dmg *= 0.7;
        if (G.shieldHp>0) { const bl2=Math.min(G.shieldHp,dmg); G.shieldHp-=bl2; dmg-=bl2; }
        G.hp -= dmg; G.invincibleTimer = 30;
        spawnParticles(G.px,G.py,5,'#ff0099',3,3,20);
        spawnFloat(G.px,G.py-G.pRadius,`-${Math.ceil(dmg)}`,'#ff0099',15);
        G.bullets.splice(i,1);
        if (G.hp<=0){ G.hp=0; gameOver(); return; }
        G._hudDirty = true;
      }
    }

    // Boss touch damage
    if (distToPlayer < b.radius+G.pRadius && G.invincibleTimer<=0) {
      let dmg = 20 + G.wave*2;
      if (G.hasArmor) dmg *= 0.7;
      if (G.shieldHp>0){ const bl=Math.min(G.shieldHp,dmg); G.shieldHp-=bl; dmg-=bl; }
      G.hp -= dmg; G.invincibleTimer=40;
      screenShake(12,14);
      spawnParticles(G.px,G.py,8,'#ff0099',4,4,25);
      spawnFloat(G.px,G.py-G.pRadius,`-${Math.ceil(dmg)}`,'#ff0099',16);
      if (G.hp<=0){ G.hp=0; gameOver(); return; }
      G._hudDirty = true;
    }
  }

  if (G.invincibleTimer>0) G.invincibleTimer--;

  // ── Habilidades ativas ─────────────────────────────────────
  if (G.barrierActive) {
    G.barrierDuration--;
    if (G.barrierDuration <= 0) G.barrierActive = false;
    else G.invincibleTimer = 2; // mantém invencível
  }
  if (G.slowTimeActive) {
    G.slowTimeDuration--;
    if (G.slowTimeDuration <= 0) {
      G.slowTimeActive = false;
      G.timeScale = 1.0;
      G.slowTimeCooldown = 1500; // 25s a 60fps
    }
  }
  if (G.slowTimeCooldown > 0) G.slowTimeCooldown--;

  // ── Magnet ─────────────────────────────────────────────────
  const magnetRange = G.hasMagnet ? 200 : 80;

  // ── Coins ──────────────────────────────────────────────────
  for (let i=G.coins.length-1;i>=0;i--) {
    const c = G.coins[i];
    c.life--; c.vy+=0.05;
    const d = dist(c.x,c.y,G.px,G.py);
    if (d < magnetRange || c.attracted) {
      c.attracted=true;
      const a = Math.atan2(G.py-c.y,G.px-c.x);
      c.vx += Math.cos(a)*0.8; c.vy += Math.sin(a)*0.8;
    }
    c.x+=c.vx; c.y+=c.vy; c.vx*=0.92; c.vy*=0.92;
    if (dist(c.x,c.y,G.px,G.py) < G.pRadius+c.r || c.life<=0) {
      if (c.life>0) {
        G.playerCoins+=c.value; G.totalCoins+=c.value; sndCoin();
        document.getElementById('coinsVal').textContent = G.playerCoins;
      }
      G.coins.splice(i,1);
    }
  }

  // ── Particles ──────────────────────────────────────────────
  for (let i=G.particles.length-1;i>=0;i--) {
    const p=G.particles[i]; p.x+=p.dx; p.y+=p.dy; p.dy+=p.gravity; p.dx*=0.96; p.dy*=0.96; p.life--;
    if (p.life<=0) G.particles.splice(i,1);
  }
  for (let i=G.floaters.length-1;i>=0;i--) {
    const f=G.floaters[i]; f.y+=f.dy; f.life--;
    if (f.life<=0) G.floaters.splice(i,1);
  }

  // ── Combo timer ────────────────────────────────────────────
  if (G.comboTimer>0) { G.comboTimer--; if(G.comboTimer<=0){ G.combo=0; G._hudDirty=true; } }

  // ── Screen shake ───────────────────────────────────────────
  if (G.shakeTimer>0) { G.shakeTimer--; G.shakeX*=0.8; G.shakeY*=0.8; }

  // ── Spawn enemies ──────────────────────────────────────────
  G.spawnTimer++;
  const effectiveRate = G.bossActive ? Math.max(12, G.spawnRate - 15) : G.spawnRate;
  if (G.spawnTimer >= effectiveRate) {
    G.spawnTimer = 0;
    // Spawn 2 por tick sempre, 3 se tiver boss
    spawnEnemy();
    if (G.enemies.length < G.spawnCap) spawnEnemy();
    if (G.bossActive && G.enemies.length < G.spawnCap) spawnEnemy();
  }

  // ── Score display (throttled) ───────────────────────────────
  G._scoreTick = ((G._scoreTick||0) + 1);
  if (G._scoreTick % 5 === 0) document.getElementById('scoreVal').textContent = G.score.toLocaleString();

  // ── HUD — uma única vez por update tick (dirty flag) ────────
  if (G._hudDirty) { G._hudDirty = false; updateHUD(); }

  // ── Abilities HUD — atualiza a cada segundo (60 frames) ────
  G._abilTick = (G._abilTick || 0) + 1;
  if (G._abilTick >= 60) { G._abilTick = 0; updateAbilitiesHUD(); }
}

function render() {
  ctx.save();
  if (G.shakeTimer>0) ctx.translate((Math.random()*2-1)*G.shakeX,(Math.random()*2-1)*G.shakeY);
  drawBackground();
  drawParticles();
  drawCoins();
  drawPets();
  drawBullets();
  drawEnemies();
  if (G.bossActive) drawBoss();
  drawPlayer();
  drawAim();
  drawFloaters();
  // Vinheta azul no slow time
  if (G.slowTimeActive) {
    ctx.save(); ctx.globalAlpha=0.12;
    ctx.fillStyle='#00f5ff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }
  // Flash verde na barreira
  if (G.barrierActive && Math.floor(G.barrierDuration/6)%2===0) {
    ctx.save(); ctx.globalAlpha=0.14;
    ctx.fillStyle='#00ff88'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }
  if (G.dashActive > 0) {
    // Dash: flash ciano que faz fade conforme o dash termina
    ctx.save();
    ctx.globalAlpha = (G.dashActive / 12) * 0.30;
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else if (G.invincibleTimer > 0 && !G.barrierActive && Math.floor(G.invincibleTimer/4)%2===0) {
    // Dano recebido: flash vermelho piscando
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#ff0055';
    ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawAim() {
  if (!G.running) return;
  if (!isMobile()) {
    const cx = G.mouseX, cy = G.mouseY;
    const manual = G.mouseDown;
    const color  = manual ? '#ff44cc' : '#00f5ff';
    ctx.save();
    ctx.strokeStyle = manual ? 'rgba(255,68,204,1)' : 'rgba(0,245,255,0.55)';
    ctx.fillStyle   = color;
    ctx.lineWidth   = manual ? 2 : 1.5;
    ctx.shadowBlur  = manual ? 18 : 6;
    ctx.shadowColor = color;
    // Crosshair — maior quando em mira manual
    const s = manual ? 13 : 9;
    ctx.beginPath();
    ctx.moveTo(cx-s, cy); ctx.lineTo(cx+s, cy);
    ctx.moveTo(cx, cy-s); ctx.lineTo(cx, cy+s);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, manual ? 5 : 3.5, 0, Math.PI*2); ctx.stroke();
    // Label "MANUAL" acima do crosshair
    if (manual) {
      ctx.shadowBlur = 10;
      ctx.font = "bold 10px 'Orbitron',monospace";
      ctx.textAlign = 'center';
      ctx.fillText('MANUAL', cx, cy - s - 8);
    }
    // Linha do player ao cursor
    ctx.globalAlpha = manual ? 0.45 : 0.18;
    ctx.setLineDash([5, 9]);
    ctx.lineWidth = manual ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(G.px, G.py); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if (G.rjActive) {
    // Mobile: seta de direção partindo do player
    const aimX = G.px + G.rjDx * 65;
    const aimY = G.py + G.rjDy * 65;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,153,0.7)';
    ctx.fillStyle   = '#ff0099';
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 10; ctx.shadowColor = '#ff0099';
    ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.moveTo(G.px, G.py); ctx.lineTo(aimX, aimY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(aimX, aimY, 5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Game Over ─────────────────────────────────────────────────
function gameOver() {
  G.running = false;
  sndDeath(); screenShake(18,25);

  saveRanking();
  saveScoreAPI({ score:G.score, wave:G.wave, level:G.level, kills:G.kills, max_combo:G.maxCombo, boss_kills:G.bossKills });

  // Reset total: moedas, compras e save zerados
  purchasedItems.clear();
  localStorage.removeItem('nrPurchased');
  localStorage.removeItem('neonRushSave');

  const stats = [
    ['SCORE',G.score.toLocaleString()],['WAVE',G.wave],
    ['NÍVEL',G.level],['KILLS',G.kills],
    ['BOSSES',G.bossKills],['COMBO','x'+G.maxCombo],
  ];
  document.getElementById('goStats').innerHTML = stats.map(([l,v])=>`
    <div class="go-stat"><div class="go-stat-label">${l}</div><div class="go-stat-val">${v}</div></div>
  `).join('');
  document.getElementById('gameOverScreen').classList.add('active');
}

// ── localStorage ──────────────────────────────────────────────
function saveGame() {
  localStorage.setItem('neonRushSave', JSON.stringify({ totalCoins:G.totalCoins, lastSave:Date.now() }));
}
function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem('neonRushSave'));
    if (!data) return;
    G.totalCoins = data.totalCoins || 0;
    const offlineCoins = Math.floor(((Date.now()-(data.lastSave||Date.now()))/1000)*0.5);
    if (offlineCoins>0) {
      G.playerCoins+=offlineCoins; G.totalCoins+=offlineCoins;
      document.getElementById('offlineMsg').textContent=`Você ganhou ${offlineCoins} moedas offline!`;
      document.getElementById('offlineReward').style.display='block';
      setTimeout(()=>{ document.getElementById('offlineReward').style.display='none'; },4000);
    }
  } catch(e) {}
  // Restore purchased items
  for (const id of purchasedItems) {
    const item = SHOP_ITEMS.find(i=>i.id===id);
    if (item && !item.consumable) item.apply();
  }
}
function saveRanking() {
  try {
    const raw = localStorage.getItem('neonRushRanking')||'[]';
    const ranking = JSON.parse(raw);
    ranking.push({ name:authUser?.username||'Visitante', score:G.score, wave:G.wave, level:G.level, kills:G.kills, bosses:G.bossKills, date:new Date().toLocaleDateString('pt-BR') });
    ranking.sort((a,b)=>b.score-a.score);
    ranking.splice(10);
    localStorage.setItem('neonRushRanking', JSON.stringify(ranking));
  } catch(e) {}
}
async function showRanking() {
  const list = document.getElementById('rankingList');
  list.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:12px;text-align:center">Carregando...</div>';
  document.getElementById('rankingScreen').classList.add('active');

  // Try API first
  let apiRows = await fetchRanking();
  if (!apiRows.length) {
    // Fallback to local
    try { apiRows = JSON.parse(localStorage.getItem('neonRushRanking')||'[]').map(r=>({...r,username:r.name})); } catch(e){}
  }

  if (!apiRows.length) {
    list.innerHTML = '<div style="color:rgba(255,255,255,0.35);padding:18px;text-align:center">Nenhuma partida ainda</div>';
    return;
  }
  list.innerHTML = apiRows.map((r,i)=>{
    const cls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    return `<div class="ranking-item">
      <span class="rank-pos ${cls}">#${i+1}</span>
      <div class="rank-info">
        <div class="rank-name">${r.username||r.name||'?'}</div>
        <div class="rank-score">${Number(r.score||0).toLocaleString()}</div>
        <div class="rank-meta">Wave ${r.wave||1} · Lv${r.level||1} · ${r.kills||0} kills · ${r.boss_kills||r.bosses||0} bosses</div>
      </div>
    </div>`;
  }).join('');
}

// ── Start / Reset ──────────────────────────────────────────────
function startGame() {
  const cw = canvas.width, ch = canvas.height;
  Object.assign(G, {
    running:true, paused:false, upgrading:false, bossDefeated:false,
    px:cw/2, py:ch/2, pdx:0, pdy:0, pSpeed:2.5,
    hp:100, maxHp:100,
    xp:0, xpNext:xpForLevel(1), level:1,
    score:0, kills:0, bossKills:0,
    damage:20, critChance:0.05, critMult:2.0,
    attackSpeed:1.2, bulletSpeed:6, bulletCount:1,
    damageMulti:1.0, xpMulti:1.0, coinMulti:1.0,
    shieldHp:0, _lifeDrain:false,
    hasSword:false, swordRadius:55, swordAngle:0,
    hasMagnet:false, hasArmor:false, hasVampire:false, hasExplosive:false,
    wave:1, phase:1,
    waveTimer:0, waveKills:0, waveKillTarget:25,
    bossActive:false, boss:null,
    spawnRate:80, spawnTimer:0, spawnCap:14,
    enemyHpMult:1, enemySpeedMult:1,
    playerCoins:0, totalCoins:0,
    combo:0, comboTimer:0, maxCombo:0,
    enemies:[], bullets:[], particles:[], coins:[], floaters:[], pets:[],
    shootTimer:0, dashCooldown:0, dashActive:0, dashDx:0, dashDy:0,
    invincibleTimer:0, shakeX:0, shakeY:0, shakeTimer:0,
    mouseDown:false, rjActive:false, rjDx:0, rjDy:0,
    timeScale:1.0,
    hasSlowTime:false, slowTimeActive:false, slowTimeDuration:0, slowTimeCooldown:0,
    hasRicochet:false, novaBombCount:0,
    barrierActive:false, barrierDuration:0,
    lastTime:performance.now(), sessionStart:Date.now(),
  });
  accumulator = 0;

  // Re-apply purchased items
  for (const id of purchasedItems) {
    const item = SHOP_ITEMS.find(i=>i.id===id);
    if (item && !item.consumable) item.apply();
  }

  document.querySelectorAll('.overlay').forEach(o=>o.classList.remove('active'));
  document.getElementById('bossHudBar').style.display='none';
  document.getElementById('statWave').textContent = 1;
  document.getElementById('statKills').textContent = 0;
  document.getElementById('comboDisplay').style.display='none';
  updateHUD();

  if (G._saveInterval) clearInterval(G._saveInterval);
  G._saveInterval = setInterval(saveGame, 30000);
  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(gameLoop);
}

// ── Controls ──────────────────────────────────────────────────
window.addEventListener('keydown', e=>{
  G.keys[e.code]=true; G.keys[e.key]=true;
  if (e.code==='Space'||e.key===' ') { e.preventDefault(); if(G.running&&!G.upgrading) doDash(); }
  if (e.code==='Escape') { if(G.running&&!G.upgrading&&!G.bossDefeated) togglePause(); }
  if ((e.code==='KeyQ'||e.key==='q') && G.running && !G.upgrading) activateSlowTime();
});
window.addEventListener('keyup', e=>{ G.keys[e.code]=false; G.keys[e.key]=false; });

function doDash() {
  if (G.dashCooldown>0) return;
  let mx=0,my=0;
  if(G.keys['ArrowLeft']||G.keys['KeyA']||G.keys['a']) mx-=1;
  if(G.keys['ArrowRight']||G.keys['KeyD']||G.keys['d']) mx+=1;
  if(G.keys['ArrowUp']||G.keys['KeyW']||G.keys['w']) my-=1;
  if(G.keys['ArrowDown']||G.keys['KeyS']||G.keys['s']) my+=1;
  if(G.jActive){mx=G.jDx;my=G.jDy;}
  const ml=Math.hypot(mx,my);
  if(ml===0){mx=0;my=-1;}else{mx/=ml;my/=ml;}
  G.dashDx=mx;G.dashDy=my;G.dashActive=12;G.dashCooldown=120;G.invincibleTimer=12;
  sndDash();screenShake(5,5);
}
function togglePause() {
  G.paused=!G.paused;
  document.getElementById('pauseScreen').classList.toggle('active',G.paused);
  document.getElementById('btnPause').textContent=G.paused?'▶ RESUMIR':'⏸ PAUSE';
}

// ── Mouse controls (PC shoot) ─────────────────────────────────
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  G.mouseX = e.clientX - rect.left;
  G.mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { G.mouseDown = true; if (!audioCtx) getAudio(); }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) G.mouseDown = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── Joystick (movimento — esquerdo) ───────────────────────────
const jZone=document.getElementById('joystickZone');
const jKnob=document.getElementById('joystickKnob');
let jTouch=null,jBaseX=0,jBaseY=0;
function isMobile(){ return window.matchMedia('(pointer:coarse)').matches; }
function setupMobileControls(){
  if(isMobile()){
    jZone.style.display='block';
    document.getElementById('shootJoyZone').style.display='block';
    document.getElementById('dashBtn').style.display='flex';
  }
}
jZone.addEventListener('touchstart',e=>{
  e.preventDefault();const t=e.changedTouches[0];jTouch=t.identifier;
  const r=jZone.getBoundingClientRect();jBaseX=r.left+r.width/2;jBaseY=r.top+r.height/2;G.jActive=true;
},{passive:false});
jZone.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===jTouch){
      const dx=t.clientX-jBaseX,dy=t.clientY-jBaseY,d=Math.hypot(dx,dy),maxR=35;
      const cl=Math.min(d,maxR),ang=Math.atan2(dy,dx);
      const kx=Math.cos(ang)*cl,ky=Math.sin(ang)*cl;
      jKnob.style.left=(50+kx/maxR*50)+'%';jKnob.style.top=(50+ky/maxR*50)+'%';
      G.jDx=kx/maxR;G.jDy=ky/maxR;
    }
  }
},{passive:false});
const endJoy=()=>{ G.jActive=false;G.jDx=0;G.jDy=0;jKnob.style.left='50%';jKnob.style.top='50%';jTouch=null; };
jZone.addEventListener('touchend',endJoy);
jZone.addEventListener('touchcancel',endJoy);

// ── Analógico de tiro (direito — mobile shoot) ────────────────
const sjZone=document.getElementById('shootJoyZone');
const sjKnob=document.getElementById('shootJoyKnob');
let sjTouch=null,sjBaseX=0,sjBaseY=0;
sjZone.addEventListener('touchstart',e=>{
  e.preventDefault();const t=e.changedTouches[0];sjTouch=t.identifier;
  const r=sjZone.getBoundingClientRect();sjBaseX=r.left+r.width/2;sjBaseY=r.top+r.height/2;G.rjActive=true;
},{passive:false});
sjZone.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===sjTouch){
      const dx=t.clientX-sjBaseX,dy=t.clientY-sjBaseY,d=Math.hypot(dx,dy),maxR=35;
      const cl=Math.min(d,maxR),ang=Math.atan2(dy,dx);
      const kx=Math.cos(ang)*cl,ky=Math.sin(ang)*cl;
      sjKnob.style.left=(50+kx/maxR*50)+'%';sjKnob.style.top=(50+ky/maxR*50)+'%';
      G.rjDx=kx/maxR;G.rjDy=ky/maxR;
    }
  }
},{passive:false});
const endShootJoy=()=>{ G.rjActive=false;G.rjDx=0;G.rjDy=0;sjKnob.style.left='50%';sjKnob.style.top='50%';sjTouch=null; };
sjZone.addEventListener('touchend',endShootJoy);
sjZone.addEventListener('touchcancel',endShootJoy);

document.getElementById('dashBtn').addEventListener('touchstart',e=>{e.preventDefault();doDash();},{passive:false});

// ── Button Handlers ───────────────────────────────────────────
document.getElementById('btnStart').onclick        = ()=>{ if(!audioCtx) getAudio(); startGame(); };
document.getElementById('btnRanking').onclick      = ()=>{ showRanking(); };
document.getElementById('btnRestart').onclick      = ()=>{ document.getElementById('gameOverScreen').classList.remove('active'); startGame(); };
document.getElementById('btnGoRanking').onclick    = ()=>{ document.getElementById('gameOverScreen').classList.remove('active'); showRanking(); };
document.getElementById('btnBackRanking').onclick  = ()=>{ document.getElementById('rankingScreen').classList.remove('active'); if(!G.running) document.getElementById('startScreen').classList.add('active'); };
document.getElementById('btnPause').onclick        = ()=>{ if(!G.running) return; togglePause(); };
document.getElementById('btnResume').onclick       = ()=>{ if(G.paused) togglePause(); };
document.getElementById('btnRestartPause').onclick = ()=>{ document.getElementById('pauseScreen').classList.remove('active'); startGame(); };
document.getElementById('btnNextPhase').onclick    = ()=>{
  document.getElementById('bossDefeatScreen').classList.remove('active');
  G.paused=false; G.bossDefeated=false;
  G.phase++;
  G.waveKills=0; G.waveKillTarget = 25 + G.wave*8;
  G.enemies=[]; G.bullets=[];
  nextWave();
};

// ── Init ──────────────────────────────────────────────────────
function initGame() {
  resizeCanvas(); setupMobileControls(); loadGame();

  const raw = localStorage.getItem('neonRushRanking')||'[]';
  let ranking=[]; try{ranking=JSON.parse(raw);}catch(e){}
  const best=ranking[0];
  const sEl=document.getElementById('startStats');
  if(best){
    sEl.innerHTML=`
      <div class="start-stat"><b>${Number(best.score||0).toLocaleString()}</b><span>melhor score</span></div>
      <div class="start-stat"><b>${best.wave||1}</b><span>maior wave</span></div>
      <div class="start-stat"><b>${G.totalCoins}</b><span>moedas totais</span></div>
    `;
  }

  // Idle animation
  function idleDraw() {
    if (G.running) return;
    drawBackground();
    const t=Date.now()/1000;
    for(let i=0;i<5;i++){
      const x=canvas.width/2+Math.cos(t*0.5+i*1.257)*canvas.width*0.28;
      const y=canvas.height/2+Math.sin(t*0.7+i*1.257)*canvas.height*0.28;
      const col=`hsl(${(t*28+i*72)%360},100%,60%)`;
      drawGlow(x,y,18,col,0.5);
      ctx.beginPath();ctx.arc(x,y,7+Math.sin(t*2+i)*2.5,0,Math.PI*2);
      ctx.fillStyle=col;ctx.shadowBlur=18;ctx.shadowColor=col;ctx.fill();ctx.shadowBlur=0;
    }
    requestAnimationFrame(idleDraw);
  }
  idleDraw();
}

window.addEventListener('resize', resizeCanvas);

// Auto-login if token exists
if (authToken && authUser) {
  enterGame();
} else {
  // Auth screen is shown by default; load news for ticker
  loadNews();
}
