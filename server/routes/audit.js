const express = require('express');
const pool = require('../db/pool');
const { exigirPagina } = require('../middleware/auth');

const router = express.Router();
router.use(exigirPagina('auditoria'));

// somente leitura - a gravacao acontece via db/audit.js dentro das outras rotas,
// nunca por uma rota exposta ao cliente
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY at DESC LIMIT 500');
  res.json(rows);
});

module.exports = router;
