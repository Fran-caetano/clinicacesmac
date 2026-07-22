-- schema do banco do PsiCESMAC
-- rodar uma vez no Postgres antes de subir o servidor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','recepcao','estagiario','professor','psicologo')),
  pending BOOLEAN NOT NULL DEFAULT true,
  profil JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nasc DATE,
  sexo TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  tel TEXT DEFAULT '',
  email TEXT DEFAULT '',
  tipo TEXT DEFAULT 'adulto',
  mod TEXT DEFAULT '',
  prio TEXT DEFAULT 'media',
  enc TEXT DEFAULT '',
  queixa TEXT DEFAULT '',
  resp TEXT DEFAULT '',
  tel_resp TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  foto TEXT,
  status TEXT DEFAULT 'ativo',
  consentimentos JSONB DEFAULT '[]',
  prof_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  num TEXT DEFAULT '',
  tipo TEXT DEFAULT '',
  humor INT DEFAULT 3,
  res TEXT DEFAULT '',
  plano TEXT DEFAULT '',
  cid TEXT DEFAULT '',
  hora_ini TEXT DEFAULT '',
  hora_fim TEXT DEFAULT '',
  autor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  hora TEXT NOT NULL,
  sala TEXT DEFAULT '',
  prof TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  status TEXT DEFAULT 'agendado',
  rec TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anamneses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  label TEXT,
  raw JSONB NOT NULL DEFAULT '{}',
  content TEXT,
  autor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  est_id UUID REFERENCES users(id),
  pac_id UUID REFERENCES patients(id),
  prof_id UUID REFERENCES users(id),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  descricao TEXT NOT NULL,
  cat TEXT DEFAULT '',
  val NUMERIC(10,2) NOT NULL,
  comp TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  paciente_id UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  demanda TEXT DEFAULT '',
  objetivos TEXT DEFAULT '',
  intervencoes TEXT DEFAULT '',
  freq TEXT DEFAULT 'Semanal',
  qtd_sessoes TEXT DEFAULT '',
  revisao DATE,
  cid TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- log de auditoria: so o servidor grava, ninguem edita ou apaga por API
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  user_nome TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  tipo TEXT DEFAULT 'inf',
  at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sess_pac ON clinical_sessions(paciente_id);
CREATE INDEX IF NOT EXISTS idx_appts_data ON appointments(data);
CREATE INDEX IF NOT EXISTS idx_pat_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_ana_pac ON anamneses(paciente_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
