require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const { exigirLogin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  name: 'psicesmac.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000 // 8 horas, igual ao timeout que ja existia no frontend
  }
}));

app.use('/api/auth', authRoutes);

// rota de exemplo protegida - confirma que a sessao esta funcionando
app.get('/api/ping', exigirLogin, (req, res) => {
  res.json({ ok: true, user: req.session.user });
});

// serve o frontend atual (index.html, app.js, style.css) a partir da raiz do repo
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`PsiCESMAC server rodando em http://localhost:${PORT}`);
});
