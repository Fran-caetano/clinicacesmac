require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./pool');

const SETORES = [
  { nome: 'Admin CESMAC',        email: 'admin@cesmac.br',    senha: 'Admin@2024!', role: 'admin' },
  { nome: 'Maria Recepcionista', email: 'recepcao@cesmac.br', senha: 'Rec@2024!',   role: 'recepcao' },
  { nome: 'Paula Costa',         email: 'psico@cesmac.br',    senha: 'Psi@2024!',   role: 'psicologo' },
  { nome: 'Ana Estagiária',      email: 'est@cesmac.br',      senha: 'Est@2024!',   role: 'estagiario' },
  { nome: 'Prof. Carlos Melo',   email: 'prof@cesmac.br',     senha: 'Prof@2024!',  role: 'professor' }
];

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema aplicado com sucesso.');

  for (const s of SETORES) {
    const hash = await bcrypt.hash(s.senha, 12);
    await pool.query(
      `INSERT INTO users (nome, email, senha_hash, role, pending)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (email) DO NOTHING`,
      [s.nome, s.email, hash, s.role]
    );
  }
  console.log('Usuários iniciais criados (troque as senhas no primeiro acesso).');

  await pool.end();
}

run().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
