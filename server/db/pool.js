const { Pool, types } = require('pg');

// por padrao o driver converte a coluna DATE num objeto Date e o JSON
// resultante vira timestamp completo ("1995-05-10T00:00:00.000Z"), o que
// quebra toda comparacao de data feita como string simples no frontend
// (ex.: a.data === '2026-07-22'). Aqui devolvemos a coluna DATE crua,
// exatamente como o Postgres guarda ('YYYY-MM-DD').
types.setTypeParser(1082, (val) => val);

// mesmo problema com NUMERIC (usado em finance.val): o driver devolve
// string por padrao pra nao perder precisao, mas o frontend soma esses
// valores com "+" - precisa vir como number, senao vira concatenacao
// de texto (0 + "10.50" = "010.50")
types.setTypeParser(1700, (val) => parseFloat(val));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL nao configurada - copie .env.example para .env e preencha');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do Postgres:', err);
});

module.exports = pool;
