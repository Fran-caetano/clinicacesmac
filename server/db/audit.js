const pool = require('./pool');

async function logAudit(userId, action, detail, tipo) {
  try {
    let nome = 'Sistema';
    if (userId) {
      const { rows } = await pool.query('SELECT nome FROM users WHERE id = $1', [userId]);
      if (rows[0]) nome = rows[0].nome;
    }
    await pool.query(
      'INSERT INTO audit_log (user_id, user_nome, action, detail, tipo) VALUES ($1, $2, $3, $4, $5)',
      [userId, nome, action, detail || '', tipo || 'inf']
    );
  } catch (err) {
    console.error('Falha ao gravar log de auditoria:', err);
  }
}

module.exports = { logAudit };
