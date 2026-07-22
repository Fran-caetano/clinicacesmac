const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirPagina } = require('../middleware/auth');
const { PODE_DELETAR_PACIENTE } = require('../constants/permissions');
const { idsPacientesVisiveis, podeAcessarPaciente } = require('../db/visibility');

const router = express.Router();
router.use(exigirPagina('pacientes'));

router.get('/', async (req, res) => {
  const ids = await idsPacientesVisiveis(req.session.user);
  const params = [];
  let where = '';
  if (ids !== null) {
    params.push(ids);
    where = 'WHERE id = ANY($1)';
  }
  const { rows } = await pool.query(
    `SELECT * FROM patients ${where} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.nome || !b.nasc) {
    return res.status(400).json({ erro: 'Nome e data de nascimento são obrigatórios.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO patients
      (nome, nasc, sexo, cpf, tel, email, tipo, mod, prio, enc, queixa, resp, tel_resp, obs, foto, consentimentos, prof_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [b.nome, b.nasc, b.sexo || '', b.cpf || '', b.tel || '', b.email || '', b.tipo || 'adulto',
     b.mod || '', b.prio || 'media', b.enc || '', b.queixa || '', b.resp || '', b.telResp || '',
     b.obs || '', b.foto || null, JSON.stringify(b.consentimentos || []), req.session.user.id]
  );
  await logAudit(req.session.user.id, 'Cadastro de Paciente', `"${b.nome}"`, 'paciente');
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  if (!(await podeAcessarPaciente(req.session.user, req.params.id))) {
    return res.status(403).json({ erro: 'Acesso não autorizado a este paciente.' });
  }
  const b = req.body;
  const campos = ['nome', 'nasc', 'sexo', 'cpf', 'tel', 'email', 'tipo', 'mod', 'prio', 'enc',
    'queixa', 'resp', 'tel_resp', 'obs', 'foto', 'status'];
  const sets = [];
  const vals = [];
  campos.forEach((c) => {
    const chave = c === 'tel_resp' ? 'telResp' : c;
    if (b[chave] !== undefined) {
      vals.push(b[chave]);
      sets.push(`${c} = $${vals.length}`);
    }
  });
  if (b.consentimentos !== undefined) {
    vals.push(JSON.stringify(b.consentimentos));
    sets.push(`consentimentos = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  vals.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE patients SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Paciente não encontrado.' });
  await logAudit(req.session.user.id, 'Edição de Paciente', `"${rows[0].nome}"`, 'paciente');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  if (!PODE_DELETAR_PACIENTE.includes(req.session.user.role)) {
    return res.status(403).json({ erro: 'Seu perfil não pode remover pacientes.' });
  }
  const { rows } = await pool.query('SELECT nome FROM patients WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Paciente não encontrado.' });
  await pool.query('DELETE FROM patients WHERE id = $1', [req.params.id]);
  await logAudit(req.session.user.id, 'Remoção de Paciente', `"${rows[0].nome}"`, 'paciente');
  res.json({ ok: true });
});

// LGPD - anonimizacao (mantem sessoes/anamneses para estatistica, remove dado pessoal)
router.post('/:id/anonimizar', async (req, res) => {
  if (!PODE_DELETAR_PACIENTE.includes(req.session.user.role)) {
    return res.status(403).json({ erro: 'Seu perfil não pode anonimizar pacientes.' });
  }
  const { rows } = await pool.query('SELECT nome FROM patients WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Paciente não encontrado.' });
  const nomeAntigo = rows[0].nome;
  const atualizado = await pool.query(
    `UPDATE patients SET
      nome = '[ANONIMIZADO]', tel = '', email = '', cpf = '', nasc = NULL,
      resp = '', tel_resp = '', obs = '', queixa = '[LGPD]', enc = '',
      foto = NULL, consentimentos = '[]', status = 'finalizado'
     WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  await logAudit(req.session.user.id, 'LGPD', `"${nomeAntigo}" anonimizado`, 'paciente');
  res.json(atualizado.rows[0]);
});

module.exports = router;
