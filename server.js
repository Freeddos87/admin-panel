const express = require('express');
const crypto = require('crypto');
const session = require('express-session');
const db = require('./database');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const ADMIN_USER = process.env.ADMIN_USERNAME;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_USER || !ADMIN_PASS || !SESSION_SECRET) {
  throw new Error('Set ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET in Render Environment Variables');
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000
  }
}));

const style = `
<style>
body{background:#0f1117;color:#fff;font-family:Arial;padding:20px}
.box{max-width:650px;margin:auto;background:#191d27;padding:22px;border-radius:18px}
input,button{width:100%;padding:13px;margin:7px 0;box-sizing:border-box;border:0;border-radius:9px}
button{background:#5865f2;color:white;font-weight:bold;cursor:pointer}
.key{background:#252a38;padding:14px;margin-top:12px;border-radius:10px;overflow-wrap:anywhere}
a{color:#9ba8ff}
.active{color:#55e68a}.disabled{color:#ff7777}
.inline{display:inline}
.inline button{width:auto;background:#444b60}
</style>`;

function page(content) {
  return style + `<div class="box">${content}</div>`;
}

function requireLogin(req, res, next) {
  if (!req.session.loggedIn) return res.redirect('/');
  next();
}

app.get('/', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/dashboard');

  res.send(page(`
    <h1>🔐 Admin Login</h1>
    <form method="POST" action="/login">
      <input name="username" placeholder="Username" required>
      <input name="password" type="password" placeholder="Password" required>
      <button>LOGIN</button>
    </form>
  `));
});

app.post('/login', (req, res) => {
  if (req.body.username !== ADMIN_USER ||
      req.body.password !== ADMIN_PASS) {
    return res.status(401).send(page(
      '<h2>Wrong username or password</h2><a href="/">Try again</a>'
    ));
  }

  req.session.loggedIn = true;
  res.redirect('/dashboard');
});

app.get('/dashboard', requireLogin, (req, res) => {
  const keys = db.prepare('SELECT * FROM keys ORDER BY id DESC').all();
  const now = Date.now();

  const keyCards = keys.map(k => {
    const expired = new Date(k.expiry).getTime() < now;
    const active = Boolean(k.active) && !expired;

    return `
      <div class="key">
        <b>${escapeHtml(k.key)}</b><br>
        Name: ${escapeHtml(k.name)}<br>
        Expires: ${escapeHtml(new Date(k.expiry).toLocaleString())}<br>
        Status: <span class="${active ? 'active' : 'disabled'}">
          ${expired ? 'EXPIRED' : active ? 'ACTIVE' : 'DISABLED'}
        </span>

        <form class="inline" method="POST" action="/toggle/${k.id}">
          <button>${k.active ? 'DEACTIVATE' : 'ACTIVATE'}</button>
        </form>

        <form class="inline" method="POST" action="/delete/${k.id}"
          onsubmit="return confirm('Delete this key?')">
          <button>DELETE</button>
        </form>
      </div>`;
  }).join('');

  res.send(page(`
    <h1>🔑 Admin Dashboard</h1>
    <form method="POST" action="/generate">
      <input name="name" placeholder="Key Name" required maxlength="50">
      <input name="days" type="number" min="0" max="3650" value="30" required>
      <input name="hours" type="number" min="0" max="23" value="0" required>
      <button>GENERATE NEW KEY</button>
    </form>
    <h2>Keys (${keys.length})</h2>
    ${keyCards || '<p>No keys generated yet.</p>'}
    <form method="POST" action="/logout">
      <button>LOGOUT</button>
    </form>
  `));
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

app.post('/generate', requireLogin, (req, res) => {
  const name = String(req.body.name || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toUpperCase();

  const days = Number(req.body.days);
  const hours = Number(req.body.hours);

  if (!name || !Number.isInteger(days) || days < 0 || days > 3650 ||
      !Number.isInteger(hours) || hours < 0 || hours > 23) {
    return res.status(400).send(page(
      '<h2>Invalid input</h2><a href="/dashboard">Back</a>'
    ));
  }

  const expiry = new Date(
    Date.now() + days * 86400000 + hours * 3600000
  ).toISOString();

  const key = name + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

  db.prepare(
    'INSERT INTO keys (key, name, expiry, active) VALUES (?, ?, ?, 1)'
  ).run(key, name, expiry);

  res.redirect('/dashboard');
});

app.post('/toggle/:id', requireLogin, (req, res) => {
  const key = db.prepare('SELECT id, active FROM keys WHERE id = ?')
    .get(req.params.id);

  if (key) {
    db.prepare('UPDATE keys SET active = ? WHERE id = ?')
      .run(key.active ? 0 : 1, key.id);
  }

  res.redirect('/dashboard');
});

app.post('/delete/:id', requireLogin, (req, res) => {
  db.prepare('DELETE FROM keys WHERE id = ?').run(req.params.id);
  res.redirect('/dashboard');
});

app.post('/logout', requireLogin, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.post('/api/verify-key', (req, res) => {
  const key = String(req.body.key || '').trim();

  const found = db.prepare(
    'SELECT key, name, expiry FROM keys WHERE key = ? AND active = 1'
  ).get(key);

  if (found && new Date(found.expiry).getTime() >= Date.now()) {
    return res.json({
      success: true,
      message: 'Key valid',
      name: found.name,
      expiry: found.expiry
    });
  }

  res.status(401).json({
    success: false,
    message: 'Invalid, disabled or expired key'
  });
});

app.get('/api/debug-keys', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Admin Panel started');
});
