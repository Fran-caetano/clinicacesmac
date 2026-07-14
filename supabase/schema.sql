-- ============================================================
-- PsiCESMAC · Clínica Escola de Psicologia CESMAC do Agreste
-- Schema Supabase (PostgreSQL) — execute no SQL Editor
-- ============================================================
-- IMPORTANTE (LGPD / segurança):
--  * Todas as tabelas têm Row Level Security (RLS) HABILITADA.
--  * A anon key NUNCA deve ter acesso de escrita sem autenticação.
--  * Prontuários e anamneses são dados sensíveis (art. 5º, II, LGPD):
--    restrinja o acesso a usuários autenticados e audite tudo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela de sincronização usada pelo app atual (chave/valor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_data (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Apenas usuários autenticados via Supabase Auth podem ler/escrever.
DROP POLICY IF EXISTS auth_app_data ON app_data;
CREATE POLICY auth_app_data ON app_data
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_data ON app_data;
CREATE TRIGGER trg_app_data BEFORE UPDATE ON app_data
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

ALTER PUBLICATION supabase_realtime ADD TABLE app_data;

INSERT INTO app_data (key, data) VALUES
  ('patients','[]'),('sessions','[]'),('appts','[]'),
  ('anamneses','[]'),('finance','[]'),('audit','[]'),
  ('notifs','[]'),('vinculos','[]'),('users','[]'),
  ('plans','{}'),('consentimentos','[]')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Perfis de usuário vinculados ao Supabase Auth
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'estagiario'
             CHECK (role IN ('admin','recepcao','estagiario','professor','psicologo')),
  pending    BOOLEAN NOT NULL DEFAULT TRUE,
  crp        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_read ON profiles;
CREATE POLICY profiles_self_read ON profiles
  FOR SELECT USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS profiles_admin_write ON profiles;
CREATE POLICY profiles_admin_write ON profiles
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ------------------------------------------------------------
-- 3. Tabelas relacionais (modelo alvo da migração do JSON)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  nasc          DATE,
  sexo          TEXT DEFAULT '',
  cpf           TEXT DEFAULT '',
  tel           TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  tipo          TEXT NOT NULL DEFAULT 'adulto' CHECK (tipo IN ('adulto','infantil')),
  mod           TEXT DEFAULT '',
  prio          TEXT NOT NULL DEFAULT 'media' CHECK (prio IN ('alta','media','baixa')),
  enc           TEXT DEFAULT '',
  queixa        TEXT DEFAULT '',
  resp          TEXT DEFAULT '',
  tel_resp      TEXT DEFAULT '',
  obs           TEXT DEFAULT '',
  foto          TEXT,
  status        TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','finalizado','aguardando')),
  consentimentos JSONB NOT NULL DEFAULT '[]',
  prof_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  anonymized_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  data        DATE NOT NULL,
  num         TEXT DEFAULT '',
  tipo        TEXT DEFAULT '',
  humor       INT DEFAULT 3 CHECK (humor BETWEEN 1 AND 5),
  res         TEXT DEFAULT '',
  plano       TEXT DEFAULT '',
  cid         TEXT DEFAULT '',
  autor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  data        DATE NOT NULL,
  hora        TEXT NOT NULL,
  sala        TEXT DEFAULT '',
  prof        TEXT DEFAULT '',
  obs         TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','realizado','cancelado')),
  rec         TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trilha de auditoria imutável (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  tipo       TEXT DEFAULT 'inf',
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sess_pac    ON sessions(paciente_id);
CREATE INDEX IF NOT EXISTS idx_appts_data  ON appointments(data);
CREATE INDEX IF NOT EXISTS idx_pat_status  ON patients(status);
CREATE INDEX IF NOT EXISTS idx_audit_user  ON audit_log(user_id, created_at DESC);

-- RLS das tabelas relacionais
ALTER TABLE patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log    ENABLE ROW LEVEL SECURITY;

-- Leitura/escrita apenas autenticado e não pendente
DROP POLICY IF EXISTS rls_patients ON patients;
CREATE POLICY rls_patients ON patients FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND NOT p.pending))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND NOT p.pending));

DROP POLICY IF EXISTS rls_sessions ON sessions;
CREATE POLICY rls_sessions ON sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND NOT p.pending))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND NOT p.pending));

DROP POLICY IF EXISTS rls_appointments ON appointments;
CREATE POLICY rls_appointments ON appointments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND NOT p.pending))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND NOT p.pending));

-- Auditoria: qualquer autenticado insere; só admin lê; ninguém altera/apaga
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS audit_read_admin ON audit_log;
CREATE POLICY audit_read_admin ON audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
