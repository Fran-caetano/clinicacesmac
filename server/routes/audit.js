const express = require('express');
const pool = require('../db/pool');
const { logAudit } = require('../db/audit');
const { exigirLogin, exigirPagina } = require('../middleware/auth');

const router = express.Router();

// leitura do log e' restrita ao admin
router.get('/', exigirPagina('auditoria'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY at DESC LIMIT 500');
  res.json(rows);
});

// eventos que nao correspondem a uma escrita em outra rota (visualizar
// prontuario, exportar CSV/PDF, tentativa de acesso bloqueada) - qualquer
// usuario logado pode registrar uma acao SUA, sempre com o id da sessao,
// nunca em nome de outro usuario. O tipo fica restrito a uma lista curta
// para nao virar um canal aberto de log arbitrario.
const TIPOS_PERMITIDOS = ['prontuario', 'export', 'seguranca', 'paciente'];
router.post('/', exigirLogin, async (req, res) => {
  const { action, detail, tipo } = req.body;
  if (!action || !TIPOS_PERMITIDOS.includes(tipo)) {
    return res.status(400).json({ erro: 'Evento de auditoria inválido.' });
  }
  await logAudit(req.session.user.id, String(action).slice(0, 200), String(detail || '').slice(0, 500), tipo);
  res.status(201).json({ ok: true });
});

module.exports = router;
