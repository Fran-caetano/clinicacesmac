const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');

const router = express.Router();

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || '');
}

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim();
  const senha = req.body.senha || '';

  if (!validEmail(email) || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha válidos.' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
    await logAudit(null, 'Falha de login', `Tentativa: ${email}`, 'seguranca');
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  if (user.pending) {
    return res.status(403).json({ erro: 'Cadastro pendente de aprovação pelo Administrador.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ erro: 'Erro ao iniciar sessão.' });
    req.session.user = { id: user.id, nome: user.nome, role: user.role };
    logAudit(user.id, 'Login', `Acesso: ${user.email}`, 'login');
    res.json({ id: user.id, nome: user.nome, role: user.role, profil: user.profil });
  });
});

router.post('/logout', (req, res) => {
  const user = req.session.user;
  req.session.destroy(() => {
    if (user) logAudit(user.id, 'Logout', user.nome, 'login');
    res.clearCookie('psicesmac.sid');
    res.json({ ok: true });
  });
});

router.post('/register', async (req, res) => {
  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim();
  const senha = req.body.senha || '';
  const role = req.body.role || 'recepcao';
  const rolesPermitidas = ['recepcao', 'estagiario', 'professor'];

  if (!nome || !validEmail(email) || senha.length < 8 || !rolesPermitidas.includes(role)) {
    return res.status(400).json({ erro: 'Preencha os campos corretamente. Senha mínima de 8 caracteres.' });
  }

  const existe = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existe.rows.length) {
    return res.status(409).json({ erro: 'E-mail já cadastrado.' });
  }

  const hash = await bcrypt.hash(senha, 12);
  await pool.query(
    'INSERT INTO users (nome, email, senha_hash, role, pending) VALUES ($1, $2, $3, $4, true)',
    [nome, email, hash, role]
  );
  await logAudit(null, 'Cadastro solicitado', `${nome} (${role})`, 'paciente');
  res.status(201).json({ ok: true, msg: 'Solicitação enviada. Aguarde aprovação do Administrador.' });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ erro: 'Não autenticado.' });
  res.json(req.session.user);
});

module.exports = router;
