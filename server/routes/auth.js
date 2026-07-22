const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || '');
}

// tokens de recuperacao de senha - em memoria porque expiram em 15 min,
// nao precisa de tabela para isso. Se o processo reiniciar o token cai,
// o usuario so precisa pedir de novo.
const tokensRecuperacao = new Map();

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

router.get('/me', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ erro: 'Não autenticado.' });
  const { rows } = await pool.query('SELECT id, nome, role, profil FROM users WHERE id = $1', [req.session.user.id]);
  if (!rows[0]) return res.status(401).json({ erro: 'Sessão inválida.' });
  res.json(rows[0]);
});

router.patch('/password', exigirLogin, async (req, res) => {
  const { senhaAtual, senhaNova } = req.body;
  if (!senhaAtual || !senhaNova || senhaNova.length < 6) {
    return res.status(400).json({ erro: 'Informe a senha atual e uma nova senha com pelo menos 6 caracteres.' });
  }
  const { rows } = await pool.query('SELECT senha_hash FROM users WHERE id = $1', [req.session.user.id]);
  if (!rows[0] || !(await bcrypt.compare(senhaAtual, rows[0].senha_hash))) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }
  const hash = await bcrypt.hash(senhaNova, 12);
  await pool.query('UPDATE users SET senha_hash = $1 WHERE id = $2', [hash, req.session.user.id]);
  await logAudit(req.session.user.id, 'Senha alterada', req.session.user.nome, 'config');
  res.json({ ok: true });
});

router.patch('/profile', exigirLogin, async (req, res) => {
  const { cpf, crp, abord, nome, especialidades, turnos } = req.body;
  if (!cpf || !crp || !abord || !turnos || !turnos.length) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
  }
  const profil = { cpf, crp, abord, nome: nome || '', especialidades: especialidades || '', turnos, updatedAt: new Date().toISOString() };
  await pool.query('UPDATE users SET profil = $1 WHERE id = $2', [JSON.stringify(profil), req.session.user.id]);
  await logAudit(req.session.user.id, 'Perfil atualizado', `CRP: ${crp}`, 'paciente');
  res.json(profil);
});

router.post('/recover/request', async (req, res) => {
  const email = (req.body.email || '').trim();
  const { rows } = await pool.query('SELECT id, nome FROM users WHERE lower(email) = lower($1)', [email]);
  if (!rows[0]) return res.status(404).json({ erro: 'E-mail não encontrado.' });
  const token = crypto.randomBytes(4).toString('hex').toUpperCase();
  tokensRecuperacao.set(email.toLowerCase(), { token, expira: Date.now() + 15 * 60 * 1000 });
  // sem servico de e-mail configurado: token retorna na resposta, como simulacao
  // (mesmo comportamento visivel que o sistema ja tinha antes)
  res.json({ ok: true, tokenSimulado: token });
});

router.post('/recover/confirm', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const token = (req.body.token || '').trim().toUpperCase();
  const senhaNova = req.body.senhaNova || '';
  const registro = tokensRecuperacao.get(email);

  if (!registro || Date.now() > registro.expira) {
    tokensRecuperacao.delete(email);
    return res.status(400).json({ erro: 'Token expirado. Solicite um novo.' });
  }
  if (registro.token !== token) {
    return res.status(400).json({ erro: 'Token inválido.' });
  }
  if (senhaNova.length < 8) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 8 caracteres.' });
  }
  const hash = await bcrypt.hash(senhaNova, 12);
  await pool.query('UPDATE users SET senha_hash = $1 WHERE lower(email) = lower($2)', [hash, email]);
  tokensRecuperacao.delete(email);
  await logAudit(null, 'Senha redefinida', email, 'login');
  res.json({ ok: true });
});

module.exports = router;
