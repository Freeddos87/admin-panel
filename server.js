const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const USER = 'admin';
const PASS = '1234';
const keys = [];

const style = `
<style>
body{background:#0f1117;color:white;font-family:Arial;padding:20px}
.box{max-width:500px;margin:auto;background:#191d27;padding:22px;border-radius:18px}
input,button{width:100%;padding:14px;margin:7px 0;box-sizing:border-box;border:0;border-radius:9px}
button{background:#5865f2;color:white;font-weight:bold}
.key{background:#252a38;padding:14px;margin-top:12px;border-radius:10px}
.active{color:#55e68a}.disabled{color:#ff6666}
</style>`;

app.get('/', (req, res) => {
  res.send(style + `<div class="box">
  <h1>🔐 Admin Login</h1>
  <form method="POST" action="/login">
  <input name="username" placeholder="Username" required>
  <input name="password" type="password" placeholder="Password" required>
  <button>LOGIN</button>
  </form></div>`);
});

app.post('/login', (req, res) => {
  if (req.body.username !== USER || req.body.password !== PASS) {
    return res.send(style + '<div class="box"><h2>❌ Wrong Login</h2><a href="/">Back</a></div>');
  }

  res.send(style + `<div class="box">
  <h1>🔑 Admin Dashboard</h1>

  <form method="POST" action="/generate">
  <input name="name" type="text" placeholder="Key Name e.g. NEERAJ" required>
  <input name="days" type="number" min="0" value="30" placeholder="Days">
  <input name="hours" type="number" min="0" max="23" value="0" placeholder="Hours">
  <button>GENERATE NEW KEY</button>
  </form>

  <h2>Keys</h2>
  ${keys.length ? keys.map((k,i) => `<div class="key">
  <b>${k.key}</b><br>
  Name: ${k.name}<br>
  Expires: ${new Date(k.expiry).toLocaleString()}<br>
  Status: <span class="${k.active?'active':'disabled'}">${k.active?'ACTIVE':'DISABLED'}</span>
  </div>`).join('') : '<p>No keys generated.</p>'}
  </div>`);
});

app.post('/generate', (req, res) => {
  const name = String(req.body.name || 'KEY')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toUpperCase();

  const days = Math.max(0, parseInt(req.body.days) || 0);
  const hours = Math.max(0, Math.min(23, parseInt(req.body.hours) || 0));

  const expiry = new Date(
    Date.now() +
    days * 86400000 +
    hours * 3600000
  ).toISOString();

  const key = name + '-' +
    crypto.randomBytes(4).toString('hex').toUpperCase();

  keys.push({
    key,
    name,
    expiry,
    active: true
  });

  res.redirect('/');
});

app.post('/api/verify-key', (req, res) => {
  const key = String(req.body.key || '').trim();
  const now = Date.now();

  const found = keys.find(k =>
    k.key === key &&
    k.active === true &&
    new Date(k.expiry).getTime() >= now
  );

  if (found) {
    return res.json({
      success: true,
      message: 'Key valid',
      name: found.name,
      expiry: found.expiry
    });
  }

  res.status(401).json({
    success: false,
    message: 'Invalid or expired key'
  });
});

app.get('/api/debug-keys', (req, res) => res.json(keys));

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Admin Panel running on http://localhost:3000');
});
