const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');

const router = express.Router();
router.use(exigirPagina('financeiro'));

// "desc" e' palavra reservada em SQL, por isso a coluna se chama descricao -
// o alias devolve "desc" pro frontend, que e' o nome que ele sempre usou
const COLS = `id, data, tipo, descricao AS "desc", cat, val, comp, created_at AS "createdAt"`;

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLS} FROM finance ORDER BY data DESC`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.data || !b.descricao || !(b.val > 0)) {
    return res.status(400).json({ erro: 'Data, descrição e valor são obrigatórios.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO finance (data, tipo, descricao, cat, val, comp)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
    [b.data, b.tipo || 'despesa', b.descricao, b.cat || '', b.val, b.comp || '']
  );
  await logAudit(req.session.user.id, 'Financeiro', `${b.tipo === 'receita' ? 'Receita' : 'Despesa'}: ${b.descricao}`, 'paciente');
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const b = req.body;
  const { rows } = await pool.query(
    `UPDATE finance SET
      data = COALESCE($1, data), tipo = COALESCE($2, tipo), descricao = COALESCE($3, descricao),
      cat = COALESCE($4, cat), val = COALESCE($5, val), comp = COALESCE($6, comp)
     WHERE id = $7 RETURNING ${COLS}`,
    [b.data, b.tipo, b.descricao, b.cat, b.val, b.comp, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  await logAudit(req.session.user.id, 'Edição financeira', rows[0].desc, 'paciente');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM finance WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  await logAudit(req.session.user.id, 'Remoção de lançamento', req.params.id, 'paciente');
  res.json({ ok: true });
});

module.exports = router;
