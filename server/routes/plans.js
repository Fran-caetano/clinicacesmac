const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');
const { podeAcessarPaciente } = require('../db/visibility');

const router = express.Router();
router.use(exigirPagina('prontuarios'));

const COLS = `paciente_id AS "pacienteId", demanda, objetivos, intervencoes, freq,
  qtd_sessoes AS "qtdSessoes", revisao, cid, obs, updated_at AS "updatedAt"`;

router.get('/:pacienteId', async (req, res) => {
  if (!(await podeAcessarPaciente(req.session.user, req.params.pacienteId))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  const { rows } = await pool.query(`SELECT ${COLS} FROM plans WHERE paciente_id = $1`, [req.params.pacienteId]);
  res.json(rows[0] || null);
});

router.put('/:pacienteId', async (req, res) => {
  if (!(await podeAcessarPaciente(req.session.user, req.params.pacienteId))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  const b = req.body;
  const { rows } = await pool.query(
    `INSERT INTO plans (paciente_id, demanda, objetivos, intervencoes, freq, qtd_sessoes, revisao, cid, obs, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (paciente_id) DO UPDATE SET
       demanda = $2, objetivos = $3, intervencoes = $4, freq = $5,
       qtd_sessoes = $6, revisao = $7, cid = $8, obs = $9, updated_at = NOW()
     RETURNING ${COLS}`,
    [req.params.pacienteId, b.demanda || '', b.objetivos || '', b.intervencoes || '',
     b.freq || 'Semanal', b.qtdSessoes || '', b.revisao || null, b.cid || '', b.obs || '']
  );
  const pac = await pool.query('SELECT nome FROM patients WHERE id = $1', [req.params.pacienteId]);
  await logAudit(req.session.user.id, 'Plano terapêutico', `"${pac.rows[0] ? pac.rows[0].nome : '—'}"`, 'prontuario');
  res.json(rows[0]);
});

module.exports = router;
