const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');

const router = express.Router();
router.use(exigirPagina('supervisao'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM vinculos ORDER BY created_at DESC');
  res.json(rows);
});

// lista enxuta de estagiarios (id, nome, email) para o seletor de vinculo -
// nao expoe o cadastro completo de usuarios, que fica restrito ao admin
router.get('/estagiarios', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, email FROM users WHERE role = 'estagiario' AND pending = false ORDER BY nome`
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { estId, pacId } = req.body;
  if (!estId || !pacId) return res.status(400).json({ erro: 'Selecione estagiário e paciente.' });
  const existente = await pool.query(
    'SELECT id FROM vinculos WHERE est_id = $1 AND pac_id = $2 AND ativo = true',
    [estId, pacId]
  );
  if (existente.rows.length) return res.status(409).json({ erro: 'Vínculo já ativo.' });
  const { rows } = await pool.query(
    'INSERT INTO vinculos (est_id, pac_id, prof_id, ativo) VALUES ($1,$2,$3,true) RETURNING *',
    [estId, pacId, req.session.user.id]
  );
  await logAudit(req.session.user.id, 'Vínculo criado', rows[0].id, 'paciente');
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { ativo } = req.body;
  const { rows } = await pool.query(
    'UPDATE vinculos SET ativo = $1 WHERE id = $2 RETURNING *',
    [!!ativo, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Vínculo não encontrado.' });
  await logAudit(req.session.user.id, ativo ? 'Vínculo reativado' : 'Vínculo revogado', rows[0].id, 'paciente');
  res.json(rows[0]);
});

module.exports = router;
