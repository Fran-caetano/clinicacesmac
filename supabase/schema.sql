-- ============================================================
-- PsiCESMAC · Clínica Escola de Psicologia CESMAC do Agreste
-- Schema Supabase (PostgreSQL) — execute o arquivo INTEIRO
-- no SQL Editor (é idempotente: pode rodar mais de uma vez)
-- ============================================================
-- LGPD / segurança:
--  * Todas as tabelas têm Row Level Security (RLS) habilitada.
--  * Apenas usuários autenticados (Supabase Auth) e APROVADOS
--    acessam dados clínicos.
--  * O primeiro usuário cadastrado vira admin (bootstrap);
--    os demais aguardam aprovação de um administrador.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Perfis de usuário vinculados ao Supabase Auth
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  email      TEXT DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'estagiario'
             CHECK (role IN ('admin','recepcao','estagiario','professor','psicologo')),
  pending    BOOLEAN NOT NULL DEFAULT TRUE,
  crp        TEXT,
  profil     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- idempotência para bases criadas com versões anteriores deste schema
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profil JSONB;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND NOT pending);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND NOT pending);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Qualquer autenticado lê perfis (nomes/papéis são dados internos da equipe,
-- necessários para supervisão, vínculos e administração)
DROP POLICY IF EXISTS profiles_self_read ON profiles;
DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS profiles_admin_write ON profiles;
CREATE POLICY profiles_admin_write ON profiles
  FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS profiles_admin_delete ON profiles;
CREATE POLICY profiles_admin_delete ON profiles
  FOR DELETE USING (is_admin());

-- Usuário pode atualizar o próprio nome/perfil profissional (não o papel)
DROP POLICY IF EXISTS profiles_self_update ON profiles;
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()) AND pending = (SELECT pending FROM profiles WHERE id = auth.uid()));

-- Cria o perfil automaticamente no cadastro (Supabase Auth).
-- Primeiro usuário do sistema = admin aprovado; demais = pendentes.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := COALESCE(NEW.raw_user_meta_data->>'role', 'estagiario');
  v_nome TEXT := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
  v_first BOOLEAN := NOT EXISTS (SELECT 1 FROM public.profiles);
BEGIN
  IF v_role NOT IN ('admin','recepcao','estagiario','professor','psicologo') THEN
    v_role := 'estagiario';
  END IF;
  IF NOT v_first AND v_role = 'admin' THEN
    v_role := 'estagiario'; -- ninguém se autodeclara admin depois do bootstrap
  END IF;
  INSERT INTO public.profiles (id, nome, email, role, pending)
  VALUES (NEW.id, v_nome, COALESCE(NEW.email, ''), CASE WHEN v_first THEN 'admin' ELSE v_role END, NOT v_first);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- 2. Tabela de sincronização usada pelo app atual (chave/valor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_data (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Apenas usuários autenticados e aprovados leem/escrevem dados clínicos
DROP POLICY IF EXISTS auth_app_data ON app_data;
CREATE POLICY auth_app_data ON app_data
  FOR ALL
  USING (public.is_active_user())
  WITH CHECK (public.is_active_user());

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_data ON app_data;
CREATE TRIGGER trg_app_data BEFORE UPDATE ON app_data
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE app_data;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO app_data (key, data) VALUES
  ('patients','[]'),('sessions','[]'),('appts','[]'),
  ('anamneses','[]'),('finance','[]'),('audit','[]'),
  ('notifs','[]'),('vinculos','[]'),('users','[]'),
  ('plans','{}'),('consentimentos','[]')
ON CONFLICT (key) DO NOTHING;

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

ALTER TABLE patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_patients ON patients;
CREATE POLICY rls_patients ON patients FOR ALL
  USING (is_active_user()) WITH CHECK (is_active_user());

DROP POLICY IF EXISTS rls_sessions ON sessions;
CREATE POLICY rls_sessions ON sessions FOR ALL
  USING (is_active_user()) WITH CHECK (is_active_user());

DROP POLICY IF EXISTS rls_appointments ON appointments;
CREATE POLICY rls_appointments ON appointments FOR ALL
  USING (is_active_user()) WITH CHECK (is_active_user());

-- Auditoria: usuário ativo insere; só admin lê; ninguém altera/apaga
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT
  WITH CHECK (is_active_user());

DROP POLICY IF EXISTS audit_read_admin ON audit_log;
CREATE POLICY audit_read_admin ON audit_log FOR SELECT
  USING (is_admin());
