const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');
const { TIPOS_ANAMNESE } = require('../constants/permissions');
const { podeAcessarPaciente, idsPacientesVisiveis } = require('../db/visibility');

const router = express.Router();
router.use(exigirPagina('anamnese'));

router.get('/', async (req, res) => {
  const { pacienteId } = req.query;

  if (pacienteId) {
    if (!(await podeAcessarPaciente(req.session.user, pacienteId))) {
      return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM anamneses WHERE paciente_id = $1 ORDER BY created_at DESC',
      [pacienteId]
    );
    return res.json(rows);
  }

  const ids = await idsPacientesVisiveis(req.session.user);
  const params = [];
  let where = '';
  if (ids !== null) {
    params.push(ids);
    where = 'WHERE paciente_id = ANY($1)';
  }
  const { rows } = await pool.query(
    `SELECT * FROM anamneses ${where} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const b = req.body;
  const permitidos = TIPOS_ANAMNESE[b.tipo];
  if (!permitidos || !permitidos.includes(req.session.user.role)) {
    return res.status(403).json({ erro: 'Seu perfil não pode registrar este tipo de anamnese.' });
  }
  if (b.pacienteId && !(await podeAcessarPaciente(req.session.user, b.pacienteId))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO anamneses (paciente_id, tipo, label, raw, content, autor_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.pacienteId || null, b.tipo, b.label || '', JSON.stringify(b.raw || {}), b.content || '', req.session.user.id]
  );
  let detalhe = `"${b.label || b.tipo}"`;
  if (b.pacienteId) {
    const pac = await pool.query('SELECT nome FROM patients WHERE id = $1', [b.pacienteId]);
    if (pac.rows[0]) detalhe += ` para "${pac.rows[0].nome}"`;
  }
  await logAudit(req.session.user.id, 'Anamnese registrada', detalhe, 'prontuario');
  res.status(201).json(rows[0]);
});

module.exports = router;
