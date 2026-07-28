require('dotenv').config();
require('express-async-errors');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const statsRoutes = require('./routes/stats');
const patientsRoutes = require('./routes/patients');
const sessionsRoutes = require('./routes/sessions');
const apptsRoutes = require('./routes/appts');
const anamnesesRoutes = require('./routes/anamneses');
const vinculosRoutes = require('./routes/vinculos');
const financeRoutes = require('./routes/finance');
const plansRoutes = require('./routes/plans');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');
const { exigirLogin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// atras de um proxy reverso (Railway, Render etc.) o Express precisa saber
// disso pra reconhecer a conexao HTTPS corretamente - sem isso, o cookie
// de sessao com "secure: true" pode nao funcionar direito
app.set('trust proxy', 1);

// cabecalhos de seguranca padrao (protecao contra clickjacking, sniffing
// de tipo de conteudo etc.) - csp desligado porque o frontend usa CDN
// externo (Chart.js, jsPDF) e inline handlers (onclick=...) que exigiriam
// uma politica bem mais elaborada pra nao quebrar nada
app.use(helmet({ contentSecurityPolicy: false }));

// limite maior que o padrao do Express (100kb) - a foto do paciente vai
// em base64 no corpo da requisicao e pode chegar a uns 700kb (limite de
// 500kb no arquivo original, +33% do base64)
app.use(express.json({ limit: '2mb' }));

app.use(session({
  name: 'psicesmac.sid',
  // sessao gravada no Postgres (tabela criada sozinha na primeira vez) -
  // MemoryStore (o padrao do express-session) nao e' recomendado pra
  // producao: perde todas as sessoes a cada reinicio do servidor e nao
  // funciona com mais de uma instancia rodando
  store: new pgSession({ pool: pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000 // 8 horas, igual ao timeout que ja existia no frontend
  }
}));

// limite de tentativas de login - sem isso nada impede forca bruta de senha
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos.' }
});
// mesma logica pro fluxo de recuperacao de senha - o pedido de token e a
// confirmacao tambem sao alvo de forca bruta (o token tem so 8 caracteres)
const recoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos.' }
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/recover', recoverLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/patients', exigirLogin, patientsRoutes);
app.use('/api/sessions', exigirLogin, sessionsRoutes);
app.use('/api/appts', exigirLogin, apptsRoutes);
app.use('/api/anamneses', exigirLogin, anamnesesRoutes);
app.use('/api/vinculos', exigirLogin, vinculosRoutes);
app.use('/api/finance', exigirLogin, financeRoutes);
app.use('/api/plans', exigirLogin, plansRoutes);
app.use('/api/admin', exigirLogin, adminRoutes);
app.use('/api/audit', exigirLogin, auditRoutes);

// serve o frontend (index.html, app.js, style.css, logo) de dentro da
// propria pasta server/ - assim o deploy funciona mesmo quando a
// hospedagem (Railway etc.) so envia a pasta "server" pro servidor
app.use(express.static(path.join(__dirname, 'public')));

// handler de erro central - sem isso, um erro de banco/validacao nao tratado
// numa rota async deixa a requisicao pendurada ou derruba o processo, e nunca
// deve vazar stack trace / mensagem interna do Postgres pro cliente
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

app.listen(PORT, () => {
  console.log(`PsiCESMAC server rodando em http://localhost:${PORT}`);
});
