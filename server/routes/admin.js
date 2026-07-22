const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');

const router = express.Router();
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

module.exports = router;
