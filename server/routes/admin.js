const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');

const router = express.Router();
const { UUID_REGEX } = require('../middleware/validarId');
router.param('id', (req, res, next, val) => {
  if (!UUID_REGEX.test(val)) return res.status(400).json({ erro: 'Identificador inválido.' });
  next();
});
router.use(exigirPagina('admin'));

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, email, role, pending, created_at AS "createdAt"
     FROM users ORDER BY created_at DESC`
  );
  res.json(rows);
});

router.post('/users/:id/approve', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE users SET pending = false WHERE id = $1 RETURNING nome, role',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await logAudit(req.session.user.id, 'Usuário aprovado', `${rows[0].nome} (${rows[0].role})`, 'paciente');
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.session.user.id) {
    return res.status(400).json({ erro: 'Você não pode remover a si mesmo.' });
  }
  const { rows } = await pool.query('SELECT nome, pending FROM users WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  const acao = rows[0].pending ? 'Cadastro rejeitado' : 'Remoção de Usuário';
  const tipo = rows[0].pending ? 'seguranca' : 'paciente';
  await logAudit(req.session.user.id, acao, rows[0].nome, tipo);
  res.json({ ok: true });
});

// gera uma senha temporaria aleatoria e forte pro usuario - usado quando
// alguem esquece a senha e ainda nao ha servico de e-mail configurado pra
// recuperacao automatica. o Administrador informa a senha temporaria pra
// pessoa por um canal seguro (telefone, presencial) e ela troca no primeiro
// acesso pela tela de "Alterar senha"
router.post('/users/:id/reset-password', async (req, res) => {
  const { rows } = await pool.query('SELECT nome, email FROM users WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  const senhaTemp = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
  const hash = await bcrypt.hash(senhaTemp, 12);
  await pool.query('UPDATE users SET senha_hash = $1 WHERE id = $2', [hash, req.params.id]);
  await logAudit(req.session.user.id, 'Senha redefinida pelo Administrador', rows[0].nome, 'seguranca');
  res.json({ ok: true, nome: rows[0].nome, email: rows[0].email, senhaTemporaria: senhaTemp });
});

module.exports = router;
