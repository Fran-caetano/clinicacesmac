require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

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

// serve o frontend atual (index.html, app.js, style.css) a partir da raiz do repo
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`PsiCESMAC server rodando em http://localhost:${PORT}`);
});
