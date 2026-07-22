const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');
const { podeAcessarPaciente, idsPacientesVisiveis } = require('../db/visibility');

const router = express.Router();

const COLS = `id, paciente_id AS "pacienteId", data, num, tipo, humor, res, plano, cid,
  hora_ini AS "horaIni", hora_fim AS "horaFim", autor_id AS "autorId",
  created_at AS "createdAt"`;

// leitura aberta a qualquer logado - o dashboard de TODOS os papeis mostra
// o total de sessoes da clinica. Escrita fica restrita a quem tem a pagina
// de prontuarios.
router.get('/', async (req, res) => {
  const { pacienteId } = req.query;

  if (pacienteId) {
    if (!(await podeAcessarPaciente(req.session.user, pacienteId))) {
      return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
    }
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM clinical_sessions WHERE paciente_id = $1 ORDER BY data DESC`,
      [pacienteId]
    );
    return res.json(rows);
  }

  // sem pacienteId: lista todas as sessoes dos pacientes que o usuario pode ver
  // (usado no dashboard e na contagem por paciente)
  const ids = await idsPacientesVisiveis(req.session.user);
  const params = [];
  let where = '';
  if (ids !== null) {
    params.push(ids);
    where = 'WHERE paciente_id = ANY($1)';
  }
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM clinical_sessions ${where} ORDER BY data DESC`,
    params
  );
  res.json(rows);
});

router.post('/', exigirPagina('prontuarios'), async (req, res) => {
  const b = req.body;
  if (!b.pacienteId || !b.data || !b.res) {
    return res.status(400).json({ erro: 'Paciente, data e evolução são obrigatórios.' });
  }
  if (!(await podeAcessarPaciente(req.session.user, b.pacienteId))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO clinical_sessions
      (paciente_id, data, num, tipo, humor, res, plano, cid, hora_ini, hora_fim, autor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS}`,
    [b.pacienteId, b.data, b.num || '', b.tipo || '', b.humor || 3, b.res,
     b.plano || '', b.cid || '', b.horaIni || '', b.horaFim || '', req.session.user.id]
  );
  const pac = await pool.query('SELECT nome FROM patients WHERE id = $1', [b.pacienteId]);
  await logAudit(req.session.user.id, 'Evolução Clínica', `"${pac.rows[0] ? pac.rows[0].nome : '—'}"`, 'prontuario');
  res.status(201).json(rows[0]);
});

router.patch('/:id', exigirPagina('prontuarios'), async (req, res) => {
  const atual = await pool.query('SELECT * FROM clinical_sessions WHERE id = $1', [req.params.id]);
  if (!atual.rows[0]) return res.status(404).json({ erro: 'Evolução não encontrada.' });
  if (!(await podeAcessarPaciente(req.session.user, atual.rows[0].paciente_id))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  const b = req.body;
  const { rows } = await pool.query(
    `UPDATE clinical_sessions SET
      data = COALESCE($1, data), num = COALESCE($2, num), tipo = COALESCE($3, tipo),
      humor = COALESCE($4, humor), res = COALESCE($5, res), plano = COALESCE($6, plano),
      cid = COALESCE($7, cid), hora_ini = COALESCE($8, hora_ini), hora_fim = COALESCE($9, hora_fim)
     WHERE id = $10 RETURNING ${COLS}`,
    [b.data, b.num, b.tipo, b.humor, b.res, b.plano, b.cid, b.horaIni, b.horaFim, req.params.id]
  );
  const pac = await pool.query('SELECT nome FROM patients WHERE id = $1', [rows[0].pacienteId]);
  await logAudit(req.session.user.id, 'Edição de Evolução', `"${pac.rows[0] ? pac.rows[0].nome : '—'}"`, 'prontuario');
  res.json(rows[0]);
});

router.delete('/:id', exigirPagina('prontuarios'), async (req, res) => {
  const atual = await pool.query('SELECT * FROM clinical_sessions WHERE id = $1', [req.params.id]);
  if (!atual.rows[0]) return res.status(404).json({ erro: 'Evolução não encontrada.' });
  if (!(await podeAcessarPaciente(req.session.user, atual.rows[0].paciente_id))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  await pool.query('DELETE FROM clinical_sessions WHERE id = $1', [req.params.id]);
  const pac = await pool.query('SELECT nome FROM patients WHERE id = $1', [atual.rows[0].paciente_id]);
  await logAudit(req.session.user.id, 'Exclusão de Evolução', `"${pac.rows[0] ? pac.rows[0].nome : '—'}"`, 'prontuario');
  res.json({ ok: true });
});

module.exports = router;
