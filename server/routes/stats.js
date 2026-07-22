const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// rota publica, sem login - so numeros agregados, nenhum dado de paciente.
// usada na tela de login para mostrar "X pacientes, Y sessoes, Z profissionais"
router.get('/public', async (req, res) => {
  const [pac, ses, usr] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM patients'),
    pool.query('SELECT COUNT(*) FROM clinical_sessions'),
    pool.query(`SELECT COUNT(*) FROM users WHERE pending = false`)
  ]);
  res.json({
    pacientes: Number(pac.rows[0].count),
    sessoes: Number(ses.rows[0].count),
    profissionais: Number(usr.rows[0].count)
  });
});

module.exports = router;
