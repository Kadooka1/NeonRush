const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const axios    = require('axios');
const cheerio  = require('cheerio');

const app        = express();
const PORT       = 3001;
const JWT_SECRET = 'neonrush_secret_key_2024';

// ── Middlewares ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve HTML, CSS, JS

// ── Banco de dados SQLite ────────────────────────────────────
const db = new DatabaseSync(path.join(__dirname, 'neonrush.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    username   TEXT    NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    wave       INTEGER NOT NULL DEFAULT 1,
    level      INTEGER NOT NULL DEFAULT 1,
    kills      INTEGER NOT NULL DEFAULT 0,
    max_combo  INTEGER NOT NULL DEFAULT 0,
    boss_kills INTEGER NOT NULL DEFAULT 0,
    played_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    item_id      TEXT    NOT NULL,
    item_name    TEXT    NOT NULL,
    price        INTEGER NOT NULL DEFAULT 0,
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    url           TEXT    UNIQUE NOT NULL,
    title_pagina  TEXT,
    qtd_links     INTEGER DEFAULT 0,
    qtd_imagens   INTEGER DEFAULT 0,
    palavras_chave TEXT,
    coletado_em   DATETIME
  );

  CREATE TABLE IF NOT EXISTS news_sources (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    url      TEXT    UNIQUE NOT NULL,
    active   INTEGER NOT NULL DEFAULT 1,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Adiciona is_admin em contas existentes (migração segura)
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch (_) {}

// Seed: cria conta admin se não existir
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const adminHash = bcrypt.hashSync('Admin@123', 10);
  db.prepare("INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)")
    .run('admin', 'admin@neonrush.com', adminHash);
  console.log('👑 Admin criado → usuário: admin  |  senha: Admin@123');
}

console.log('✅ Banco de dados SQLite pronto (neonrush.db)');

// ── Middleware de autenticação JWT ───────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Não autorizado' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token expirado ou inválido' });
  }
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Não autorizado' });
  try {
    const user = jwt.verify(header.slice(7), JWT_SECRET);
    if (!user.is_admin)
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token expirado ou inválido' });
  }
}

// ════════════════════════════════════════════════════════════
//   ROTAS DE AUTENTICAÇÃO
// ════════════════════════════════════════════════════════════

// POST /api/register
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Preencha todos os campos' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username.trim(), email.trim().toLowerCase(), hash);

    const user  = { id: result.lastInsertRowid, username: username.trim(), email: email.trim(), is_admin: 0 };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Usuário ou e-mail já cadastrado' });
    console.error(e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Preencha todos os campos' });

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? OR email = ?'
  ).get(username.trim(), username.trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });

  const payload = { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin || 0 };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: payload });
});

// ════════════════════════════════════════════════════════════
//   ROTAS DO JOGO
// ════════════════════════════════════════════════════════════

// POST /api/scores — salva pontuação (login opcional; sem login salva como Visitante)
app.post('/api/scores', (req, res) => {
  const { score, wave, level, kills, max_combo, boss_kills, username: guestName } = req.body || {};

  let userId = 0;
  let username = guestName || 'Visitante';

  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const user = jwt.verify(header.slice(7), JWT_SECRET);
      userId   = user.id;
      username = user.username;
    } catch {}
  }

  db.prepare(`
    INSERT INTO scores (user_id, username, score, wave, level, kills, max_combo, boss_kills)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, username,
    score || 0, wave || 1, level || 1, kills || 0, max_combo || 0, boss_kills || 0
  );
  res.json({ ok: true });
});

// POST /api/purchases — salva compra na loja (requer login)
app.post('/api/purchases', auth, (req, res) => {
  const { item_id, item_name, price } = req.body || {};
  db.prepare(
    'INSERT INTO purchases (user_id, item_id, item_name, price) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, item_id, item_name, price || 0);
  res.json({ ok: true });
});

// GET /api/ranking — top 10 pontuações (melhor score por jogador)
app.get('/api/ranking', (req, res) => {
  const rows = db.prepare(`
    SELECT s.username, s.score, s.wave, s.level, s.kills, s.max_combo, s.boss_kills,
           strftime('%d/%m/%Y', s.played_at) AS date
    FROM scores s
    INNER JOIN (
      SELECT user_id, MAX(score) AS best
      FROM scores GROUP BY user_id
    ) m ON s.user_id = m.user_id AND s.score = m.best
    ORDER BY s.score DESC
    LIMIT 10
  `).all();
  res.json(rows);
});

// GET /api/ranking/pdf — abre ranking formatado para impressão/PDF
app.get('/api/ranking/pdf', (req, res) => {
  const rows = db.prepare(`
    SELECT s.username, s.score, s.wave, s.level, s.kills, s.max_combo, s.boss_kills
    FROM scores s
    INNER JOIN (
      SELECT user_id, MAX(score) AS best FROM scores GROUP BY user_id
    ) m ON s.user_id = m.user_id AND s.score = m.best
    ORDER BY s.score DESC LIMIT 10
  `).all();

  const medal = ['🥇','🥈','🥉'];
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Neon Rush — Ranking</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',monospace; background:#020408; color:#fff; padding:40px 32px; }
  h1 { color:#00f5ff; text-align:center; font-size:28px; letter-spacing:6px; margin-bottom:6px; }
  .sub { text-align:center; color:rgba(0,245,255,0.45); font-size:11px; letter-spacing:4px; margin-bottom:32px; }
  table { width:100%; border-collapse:collapse; }
  th { color:#00f5ff; border-bottom:2px solid rgba(0,245,255,0.4); padding:10px 14px;
       text-align:left; font-size:11px; letter-spacing:2px; }
  td { padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.07); font-size:13px; }
  tr:hover td { background:rgba(0,245,255,0.04); }
  .score { color:#ffee00; font-weight:bold; }
  .footer { text-align:center; color:rgba(255,255,255,0.25); font-size:10px; margin-top:28px; }
  @media print {
    body { background:#fff; color:#000; }
    h1, th { color:#003366; }
    .score { color:#cc6600; }
    td { border-color:#ccc; }
  }
</style>
</head>
<body>
<h1>🏆 NEON RUSH</h1>
<div class="sub">RANKING GLOBAL — ARENA SURVIVAL v2.0</div>
<table>
  <thead>
    <tr><th>#</th><th>Jogador</th><th>Score</th><th>Wave</th><th>Nível</th><th>Kills</th><th>Combo</th><th>Bosses</th></tr>
  </thead>
  <tbody>
    ${rows.map((r,i) => `<tr>
      <td>${medal[i] || '#'+(i+1)}</td>
      <td>${r.username}</td>
      <td class="score">${Number(r.score).toLocaleString('pt-BR')}</td>
      <td>${r.wave}</td>
      <td>${r.level}</td>
      <td>${r.kills}</td>
      <td>x${r.max_combo}</td>
      <td>${r.boss_kills}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div class="footer">Gerado em ${new Date().toLocaleDateString('pt-BR', {dateStyle:'long'})} · Neon Rush Incremental v2.0</div>
<script>window.print();</script>
</body>
</html>`;
  res.send(html);
});

// ── Cache de notícias (30 min) ───────────────────────────────
let newsCache = { data: null, updatedAt: 0 };
const NEWS_TTL = 30 * 60 * 1000;

const SELECTORS = [
  'h1 a', 'h2 a', 'h3 a', 'h4 a',
  '.entry-title a', '.post-title a', '.article-title a', '.titulo a',
  'article h2 a', 'article h3 a', 'article a h2', 'article a h3',
  '.card-title a', '.news-title a', '[class*="title"] a',
];
const TITLE_REGEX = /^.{18,120}$/;

async function scrapeUrl(url) {
  const { data } = await axios.get(url, {
    timeout: 8000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  const $ = cheerio.load(data);
  const titles = new Set();

  // tenta seletores específicos primeiro
  for (const sel of SELECTORS) {
    $(sel).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (TITLE_REGEX.test(text)) titles.add(text);
    });
    if (titles.size >= 6) break;
  }

  // fallback: qualquer <a> com texto de tamanho razoável
  if (titles.size < 3) {
    $('a').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (/^.{25,100}$/.test(text)) titles.add(text);
    });
  }

  return [...titles].slice(0, 6);
}

async function fetchGameNews() {
  const dbSources = db.prepare("SELECT url FROM news_sources WHERE active = 1").all();
  const sources = dbSources.length > 0 ? dbSources.map(s => s.url) : [
    'https://www.theenemy.com.br',
    'https://www.voxel.com.br',
    'https://www.tecmundo.com.br/games',
  ];

  for (const url of sources) {
    try {
      const titles = await scrapeUrl(url);
      if (titles.length >= 3)
        return titles.map(t => ({ title: '📰 ' + t }));
    } catch (_) { /* tenta próxima fonte */ }
  }
  return null;
}

const NEWS_FALLBACK = [
  { title: '🎮 Neon Rush v2.0 — Arena Survival!' },
  { title: '⚡ Bosses a cada wave — cada fase mais brutal!' },
  { title: '🛒 Loja com 15+ itens: armas, escudos e poderes!' },
  { title: '🏆 Ranking global salvo no banco de dados SQLite!' },
  { title: '💥 Balas explosivas, ricochete e drone de combate!' },
  { title: '🔥 Segure o mouse para mira manual!' },
];

// GET /api/gamenews — notícias reais de games no ticker da tela inicial
app.get('/api/gamenews', async (req, res) => {
  const now = Date.now();
  if (newsCache.data && now - newsCache.updatedAt < NEWS_TTL)
    return res.json({ news: newsCache.data });

  const scraped = await fetchGameNews();
  if (scraped) {
    newsCache = { data: scraped, updatedAt: now };
    return res.json({ news: scraped });
  }

  res.json({ news: NEWS_FALLBACK });
});

// ════════════════════════════════════════════════════════════
//   ROTAS DE ADMIN — GERENCIAR FONTES DE NOTÍCIAS
// ════════════════════════════════════════════════════════════

// GET /api/admin/news-sources — lista fontes
app.get('/api/admin/news-sources', adminAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM news_sources ORDER BY added_at DESC').all();
  res.json(rows);
});

// POST /api/admin/news-sources — adiciona fonte
app.post('/api/admin/news-sources', adminAuth, (req, res) => {
  const { name, url } = req.body || {};
  if (!name || !url)
    return res.status(400).json({ error: 'Nome e URL são obrigatórios' });
  if (!URL_REGEX.test(url))
    return res.status(400).json({ error: 'URL inválida' });
  try {
    db.prepare('INSERT INTO news_sources (name, url) VALUES (?, ?)').run(name.trim(), url.trim());
    newsCache = { data: null, updatedAt: 0 }; // invalida cache
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'URL já cadastrada' });
    res.status(500).json({ error: 'Erro ao salvar' });
  }
});

// DELETE /api/admin/news-sources/:id — remove fonte
app.delete('/api/admin/news-sources/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM news_sources WHERE id = ?').run(req.params.id);
  newsCache = { data: null, updatedAt: 0 }; // invalida cache
  res.json({ ok: true });
});

// POST /api/admin/news-sources/refresh — força rebuscar notícias
app.post('/api/admin/news-sources/refresh', adminAuth, async (req, res) => {
  newsCache = { data: null, updatedAt: 0 };
  const dbSources = db.prepare("SELECT url FROM news_sources WHERE active = 1").all();
  const sources = dbSources.length > 0 ? dbSources.map(s => s.url) : [];

  const results = [];
  for (const url of sources) {
    try {
      const titles = await scrapeUrl(url);
      results.push({ url, ok: true, count: titles.length, titles });
    } catch (e) {
      results.push({ url, ok: false, error: e.message });
    }
  }

  const scraped = await fetchGameNews();
  if (scraped) {
    newsCache = { data: scraped, updatedAt: Date.now() };
    return res.json({ ok: true, news: scraped, diagnostics: results });
  }
  res.json({ ok: false, message: 'Nenhuma fonte conseguiu extrair notícias', diagnostics: results });
});

// GET /api/admin/users — lista usuários (apenas para debug)
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare(
    'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// ════════════════════════════════════════════════════════════
//   ROTAS DE COLETA DE DADOS (Axios + Cheerio + Regex)
// ════════════════════════════════════════════════════════════

const URL_REGEX = /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+(\/[\w\-._~:/?#[\]@!$&'()*+,;=%]*)?$/i;

// POST /api/sources — cadastra fonte de pesquisa
app.post('/api/sources', (req, res) => {
  const { name, url } = req.body || {};
  if (!name || !url)
    return res.status(400).json({ error: 'Nome e URL são obrigatórios' });

  if (!URL_REGEX.test(url))
    return res.status(400).json({ error: 'URL inválida. Use o formato: https://site.com' });

  try {
    db.prepare('INSERT INTO sources (name, url) VALUES (?, ?)').run(name.trim(), url.trim());
    res.json({ ok: true, message: 'Fonte cadastrada com sucesso' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Esta URL já foi cadastrada' });
    res.status(500).json({ error: 'Erro ao cadastrar fonte' });
  }
});

// GET /api/sources — lista todas as fontes cadastradas
app.get('/api/sources', (req, res) => {
  const rows = db.prepare('SELECT * FROM sources ORDER BY id DESC').all();
  res.json(rows);
});

// POST /api/scrape — coleta dados de uma fonte (Axios + Cheerio)
app.post('/api/scrape', async (req, res) => {
  const { id } = req.body || {};
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  if (!source) return res.status(404).json({ error: 'Fonte não encontrada' });

  if (!URL_REGEX.test(source.url))
    return res.status(400).json({ error: 'URL da fonte é inválida' });

  try {
    const response = await axios.get(source.url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeonRushBot/1.0)' }
    });

    const $ = cheerio.load(response.data);

    const titulo   = $('title').first().text().trim() || 'Sem título';
    const qtdLinks = $('a[href]').length;
    const qtdImgs  = $('img').length;

    const palavras = [];
    $('h1, h2, h3').each((_, el) => {
      const t = $(el).text().trim();
      if (t) palavras.push(t);
    });
    const metaKw = $('meta[name="keywords"]').attr('content') || '';
    if (metaKw) palavras.unshift(metaKw);
    const palavrasChave = palavras.slice(0, 5).join(' | ');

    db.prepare(`
      UPDATE sources SET
        title_pagina  = ?,
        qtd_links     = ?,
        qtd_imagens   = ?,
        palavras_chave = ?,
        coletado_em   = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(titulo, qtdLinks, qtdImgs, palavrasChave, id);

    res.json({ ok: true, titulo, qtdLinks, qtdImgs, palavrasChave });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível acessar o site: ' + e.message });
  }
});

// GET /api/dashboard — dados cruzados sources + coletas (INNER JOIN)
app.get('/api/dashboard', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.url, s.title_pagina,
           s.qtd_links, s.qtd_imagens, s.palavras_chave,
           strftime('%d/%m/%Y %H:%M', s.coletado_em) AS coletado_em
    FROM sources s
    INNER JOIN (
      SELECT id, MAX(coletado_em) AS ultima
      FROM sources
      WHERE coletado_em IS NOT NULL
      GROUP BY id
    ) m ON s.id = m.id
    ORDER BY s.coletado_em DESC
  `).all();
  res.json(rows);
});

// ── Rotas de página ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'NeonRush_Incremental.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Inicia servidor ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🎮 Acesse o jogo em http://localhost:${PORT}`);
  console.log(`🏆 Ranking em http://localhost:${PORT}/api/ranking`);
  console.log(`👥 Usuários em http://localhost:${PORT}/api/admin/users\n`);
});
