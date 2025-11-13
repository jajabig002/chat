const express = require('express');
const http = require('http');
const session = require('express-session');
const { Server } = require('socket.io');


const app = express();
const server = http.createServer(app);
const io = new Server(server);


const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'replace_this_with_a_real_secret';
const PASSWORD = process.env.PASSWORD || 'gimkitsweats'; // default kept as requested
const SITE_NAME = process.env.SITE_NAME || 'GC';


// If behind a proxy (ngrok, Render, Fly, etc.) let express trust X-Forwarded-* headers
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}


app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const sess = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        // In production we want cross-site embedding to work inside iframes:
        // - SameSite=None and Secure=true (browsers require Secure for SameSite=None)
        // In development we keep the simpler defaults to avoid HTTPS requirement.
        secure: NODE_ENV === 'production',
        sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    },
});
app.use(sess);


function ensureAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    return res.redirect('/');
}


function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// Login page
app.get('/', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/chat');
    }
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Login - ${SITE_NAME}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Arial;background:#071022;color:#e6f3ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .card{width:100%;max-width:420px;padding:28px;border-radius:12px;background:linear-gradient(180deg,#061426,#03101a);border:1px solid rgba(14,165,255,0.06)}
    h1{color:#0ea5ff;margin:0 0 12px 0}
    label{display:block;margin-top:12px;color:#cfefff}
    input{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:#02101a;color:#dff5ff}
    button{margin-top:14px;width:100%;padding:10px;border-radius:8px;background:linear-gradient(90deg,#0ea5ff,#3b82f6);border:0;color:#001;font-weight:700;cursor:pointer}
    .error{color:#ff8a8a;margin-top:10px}
    footer{margin-top:12px;font-size:12px;color:#8fbfe7;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <h1>${SITE_NAME}</h1>
    <p>Enter the site password to join the chat.</p>
    <form method="POST" action="/login">
      <label for="pw">Password</label>
      <input id="pw" name="password" type="password" autocomplete="off" />
      <button type="submit">Enter</button>
    </form>
    ${req.query.e === '1' ? '<div class="error">Incorrect password</div>' : ''}
    <footer>Theme: black & blue • Simple Web Socket chat</footer>
  </div>
</body>
</html>`);
});


// Handle login
app.post('/login', (req, res) => {
    const p = (req.body.password || '').toString();
    if (p === PASSWORD) {
        req.session.authenticated = true;
        return res.redirect('/chat');
    }
    return res.redirect('/?e=1');
});


// Chat page (protected)
app.get('/chat', ensureAuth, (req, res) => {
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${SITE_NAME}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{--bg:#000;--panel:#050816;--accent:#0ea5ff;--muted:#0b1220}
    html,body{height:100%;margin:0;background:linear-gradient(180deg,#000,#020213);color:#dff5ff;font-family:Inter,Arial,system-ui}
    .app{display:flex;height:100vh}
    .sidebar{width:300px;background:linear-gradient(180deg,var(--panel),#07071a);border-right:1px solid rgba(14,165,255,0.08);padding:18px;box-sizing:border-box}
    .brand{font-size:20px;color:var(--accent);font-weight:700;margin-bottom:12px}
    .users{margin-top:12px;font-size:14px;color:#9fd9ff}
    .main{flex:1;display:flex;flex-direction:column}
    .messages{flex:1;padding:18px;overflow:auto;display:flex;flex-direction:column;gap:10px;background:linear-gradient(180deg, rgba(5,8,22,0.02), transparent)}
    .msg{max-width:70%;padding:10px 12px;border-radius:10px;background:linear-gradient(90deg, rgba(14,165,255,0.02), rgba(59,130,246,0.01));border:1px solid rgba(14,165,255,0.04);color:#dff5ff}
    .meta{font-size:12px;color:#9ad8ff;margin-bottom:6px}
    .composer{display:flex;padding:12px;border-top:1px solid rgba(255,255,255,0.03);gap:8px;background:linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.06))}
    input[type="text"]{flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:#020417;color:#dff5ff}
    button{padding:10px 14px;border-radius:8px;border:0;background:linear-gradient(90deg,var(--accent),#3b82f6);color:#001;font-weight:700;cursor:pointer}
    .topbar{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.02)}
    .title{font-weight:700;color:var(--accent)}
    .logout{background:transparent;border:1px solid rgba(255,255,255,0.04);color:#9fd9ff;padding:6px 10px;border-radius:8px;cursor:pointer}
    .small{font-size:12px;color:#8fbfe7}
  </style>
</head>
<body>
  <div class="app">
    <div class="sidebar">
      <div class="brand">${SITE_NAME}</div>
      <div class="small">Connected users</div>
      <div id="users" class="users">—</div>
      <div style="margin-top:20px" class="small">Tip: pick a name below before sending a message.</div>
      <form id="leaveForm" action="/logout" method="GET" style="margin-top:16px">
        <button type="submit" class="logout">Leave</button>
      </form>
    </div>
    <div class="main">
      <div class="topbar">
        <div class="title">Lobby</div>
        <div class="small" id="status">Connecting...</div>
      </div>
      <div id="messages" class="messages"></div>
      <div class="composer">
        <input id="name" type="text" placeholder="Your name (optional)" />
        <input id="msg" type="text" placeholder="Type a message..." />
        <button id="send">Send</button>
      </div>
    </div>
  </div>


  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const messagesEl = document.getElementById('messages');
    const usersEl = document.getElementById('users');
    const statusEl = document.getElementById('status');
    const nameEl = document.getElementById('name');
    const msgEl = document.getElementById('msg');
    const sendBtn = document.getElementById('send');


    function esc(s){ return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }


    socket.on('connect', () => { statusEl.textContent = 'Connected'; });
    socket.on('disconnect', () => { statusEl.textContent = 'Disconnected'; });


    socket.on('users', (list) => {
      if (!list || list.length === 0) usersEl.innerHTML = '—';
      else usersEl.innerHTML = Array.from(list).map(u => esc(u)).join('<br/>');
    });


    socket.on('message', (data) => {
      const d = data || {};
      const who = esc(d.name || 'Anon');
      const txt = esc(d.text || '');
      const el = document.createElement('div');
      el.className = 'msg';
      el.innerHTML = '<div class="meta">'+who+' • '+new Date(d.t || Date.now()).toLocaleTimeString()+'</div><div>'+txt+'</div>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });


    function send() {
      const text = msgEl.value.trim();
      if (!text) return;
      const name = (nameEl.value || 'Anon').trim().slice(0, 40);
      socket.emit('message', { name, text });
      msgEl.value = '';
      msgEl.focus();
    }


    sendBtn.addEventListener('click', (e) => { e.preventDefault(); send(); });
    msgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  </script>
</body>
</html>`);
});


// logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


// in-memory user tracking
const clients = new Map();


io.on('connection', (socket) => {
    clients.set(socket.id, { name: 'Anon' });
    broadcastUsers();


    socket.on('message', (payload) => {
        try {
            const name = (payload && payload.name) ? String(payload.name).slice(0, 40) : 'Anon';
            const text = (payload && payload.text) ? String(payload.text).slice(0, 1000) : '';
            clients.set(socket.id, { name: name || 'Anon' });
            const msg = { name, text, t: Date.now() };
            io.emit('message', msg);
            broadcastUsers();
        } catch (e) { /* ignore malformed */ }
    });


    socket.on('disconnect', () => {
        clients.delete(socket.id);
        broadcastUsers();
    });
});


function broadcastUsers() {
    const list = Array.from(clients.values()).map(c => c.name || 'Anon');
    io.emit('users', list);
}


server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
// --- ADD/INSERT: embed config and CSP (put this near other consts / middleware) ---
const EMBED_TOKEN = process.env.EMBED_TOKEN || 'public-embed-token'; // replace in production with a long secret


// Allow framing by Google Sites / googleusercontent (adjust origins if you need more)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://sites.google.com https://*.googleusercontent.com"
  );
  next();
});


// --- ADD/INSERT: Socket.io handshake auth for embed token ---
// Place this BEFORE io.on('connection', ...)
io.use((socket, next) => {
  try {
    const token = (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || null;
    if (token) {
      // if a token is provided, require it to match EMBED_TOKEN
      if (token === EMBED_TOKEN) return next();
      return next(new Error('Invalid embed token'));
    }
    // no token: continue (this keeps your existing session-based clients working)
    return next();
  } catch (err) {
    return next(new Error('Auth error'));
  }
});


// --- ADD/INSERT: lightweight embed page (no sessions) ---
// Place this somewhere after your /chat route and before server.listen()
app.get('/embed', (req, res) => {
  // Token may be passed in URL: /embed?token=... — the client will pass it to socket.io
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${SITE_NAME} (embed)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    /* Compact black & blue look matching your main UI */
    :root{--accent:#0ea5ff}
    html,body{margin:0;font-family:Inter,Arial,system-ui;background:linear-gradient(180deg,#000,#020213);color:#dff5ff}
    .wrap{padding:12px;box-sizing:border-box}
    #messages{height:320px;overflow:auto;padding:12px;gap:8px;display:flex;flex-direction:column}
    .msg{padding:8px;border-radius:8px;background:linear-gradient(90deg,rgba(14,165,255,0.02),rgba(59,130,246,0.01));border:1px solid rgba(14,165,255,0.04)}
    .meta{font-size:12px;color:#9ad8ff;margin-bottom:6px}
    .controls{display:flex;gap:8px;padding-top:8px}
    .controls input[type="text"]{flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:#020417;color:#dff5ff}
    .controls button{padding:8px 12px;border-radius:8px;border:0;background:linear-gradient(90deg,var(--accent),#3b82f6);color:#001;font-weight:700;cursor:pointer}
    .small{font-size:12px;color:#8fbfe7;margin-bottom:8px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="small">Embedded chat — ${SITE_NAME}</div>
    <div id="messages" aria-live="polite">—</div>
    <div class="controls">
      <input id="name" type="text" placeholder="Name (optional)" />
      <input id="msg" type="text" placeholder="Message" />
      <button id="send">Send</button>
    </div>
  </div>


  <script src="/socket.io/socket.io.js"></script>
  <script>
    // read token from query param
    const qs = new URLSearchParams(location.search);
    const token = qs.get('token') || '';


    // pass token in handshake auth
    const socket = io({ auth: { token } });


    const messagesEl = document.getElementById('messages');
    const nameEl = document.getElementById('name');
    const msgEl = document.getElementById('msg');
    const sendBtn = document.getElementById('send');


    function esc(s){ return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }


    socket.on('connect_error', (err) => {
      // show a readable error to the embed consumer
      messagesEl.innerHTML = '<div class="msg">Connection error: ' + esc(err && err.message) + '</div>';
    });


    socket.on('message', (d) => {
      const who = esc(d.name || 'Anon');
      const txt = esc(d.text || '');
      const el = document.createElement('div');
      el.className = 'msg';
      el.innerHTML = '<div class="meta">' + who + ' • ' + new Date(d.t || Date.now()).toLocaleTimeString() + '</div><div>' + txt + '</div>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });


    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const text = (msgEl.value || '').trim();
      if (!text) return;
      const name = (nameEl.value || 'Anon').trim().slice(0,40);
      socket.emit('message', { name, text });
      msgEl.value = '';
      msgEl.focus();
    });


    msgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });
  </script>
</body>
</html>`);
});



