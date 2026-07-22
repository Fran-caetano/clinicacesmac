const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');

const router = express.Router();

// leitura aberta - o dashboard de todos os papeis mostra os proximos
// atendimentos e o card de lembretes. Escrita fica restrita a agenda.
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM appointments ORDER BY data, hora');
  res.json(rows);
});

router.post('/', exigirPagina('agenda'), async (req, res) => {
  const b = req.body;
  if (!b.pacienteId || !b.data || !b.hora) {
    return res.status(400).json({ erro: 'Paciente, data e horário são obrigatórios.' });
  }
  const conflito = await pool.query(
    `SELECT id FROM appointments WHERE data = $1 AND hora = $2 AND status != 'cancelado'`,
    [b.data, b.hora]
  );
  if (conflito.rows.length) {
    return res.status(409).json({ erro: `Conflito: já existe consulta às ${b.hora} em ${b.data}.` });
  }
  const { rows } = await pool.query(
    `INSERT INTO appointments (paciente_id, data, hora, sala, prof, obs, status, rec)
     VALUES ($1,$2,$3,$4,$5,$6,'agendado',$7) RETURNING *`,
    [b.pacienteId, b.data, b.hora, b.sala || '', b.prof || '', b.obs || '', b.rec || '']
  );
  const pac = await pool.query('SELECT nome FROM patients WHERE id = $1', [b.pacienteId]);
  await logAudit(req.session.user.id, 'Agendamento', `"${pac.rows[0] ? pac.rows[0].nome : '—'}" — ${b.data} às ${b.hora}`, 'paciente');
  res.status(201).json(rows[0]);
});

router.patch('/:id', exigirPagina('agenda'), async (req, res) => {
  const b = req.body;
  if (b.data && b.hora) {
    const conflito = await pool.query(
      `SELECT id FROM appointments WHERE data = $1 AND hora = $2 AND status != 'cancelado' AND id != $3`,
      [b.data, b.hora, req.params.id]
    );
    if (conflito.rows.length) {
      return res.status(409).json({ erro: 'Conflito com outro agendamento.' });
    }
  }
  const { rows } = await pool.query(
    `UPDATE appointments SET
      paciente_id = COALESCE($1, paciente_id), data = COALESCE($2, data), hora = COALESCE($3, hora),
      sala = COALESCE($4, sala), prof = COALESCE($5, prof), obs = COALESCE($6, obs),
      status = COALESCE($7, status)
     WHERE id = $8 RETURNING *`,
    [b.pacienteId, b.data, b.hora, b.sala, b.prof, b.obs, b.status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  await logAudit(req.session.user.id, 'Edição de agendamento', rows[0].id, 'paciente');
  res.json(rows[0]);
});

router.delete('/:id', exigirPagina('agenda'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  await logAudit(req.session.user.id, 'Remoção de agendamento', req.params.id, 'paciente');
  res.json({ ok: true });
});

module.exports = router;
