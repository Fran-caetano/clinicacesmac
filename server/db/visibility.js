const pool = require('./pool');

// espelha a funcao _visiblePats do app.js, agora do lado do servidor
// retorna null quando o papel enxerga todos os pacientes (sem filtro),
// ou um array de ids quando a visao e' restrita
async function idsPacientesVisiveis(user) {
  if (['admin', 'recepcao', 'professor'].includes(user.role)) return null;

  if (user.role === 'psicologo') {
    const { rows } = await pool.query(
      'SELECT id FROM patients WHERE prof_id IS NULL OR prof_id = $1',
      [user.id]
    );
    return rows.map((r) => r.id);
  }

  if (user.role === 'estagiario') {
    const { rows } = await pool.query(
      'SELECT pac_id FROM vinculos WHERE est_id = $1 AND ativo = true',
      [user.id]
    );
    return rows.map((r) => r.pac_id);
  }

  return [];
}

async function podeAcessarPaciente(user, pacienteId) {
  const ids = await idsPacientesVisiveis(user);
  if (ids === null) return true;
  return ids.includes(pacienteId);
}

module.exports = { idsPacientesVisiveis, podeAcessarPaciente };
