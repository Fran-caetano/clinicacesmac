# Auditoria técnica — PsiCESMAC

Data: 2026-07-13 · Escopo: `index.html`, `app.js`, `style.css`, integração Supabase.

## 1. Correções implementadas nesta auditoria

### Bugs
- **Troca de senha quebrada**: o botão chamava `Perfil.changePass()`, mas a função estava definida no módulo `Pats`. Movida para `Perfil` — a alteração de senha volta a funcionar. Senha mínima elevada de 6 para 8 caracteres.
- **Erros silenciados**: `window.onerror` retornava `true`, ocultando qualquer exceção (inclusive o bug acima). Agora os erros são logados no console e o usuário recebe um aviso.
- **XSS na busca global**: telefone e CPF do paciente eram renderizados sem escape no resultado da busca. Adicionado `esc()`.

### Segurança (OWASP)
- **Senhas (A02 — falhas criptográficas)**: substituído o hash caseiro por **PBKDF2-SHA256 via Web Crypto** (150.000 iterações, salt aleatório de 16 bytes, formato `pbkdf2$iter$salt$hash`). Hashes antigos (FNV/custom) continuam aceitos no login e são **migrados automaticamente** no primeiro acesso bem-sucedido. Fallback para o hash antigo apenas quando `crypto.subtle` não existe (contexto inseguro).
- **Controle de sessão (A07)**: além do limite absoluto de 8 h, a sessão agora expira após **30 minutos de inatividade** (evento registrado na auditoria) — essencial em terminais compartilhados da clínica.
- **CSP (A03/A05)**: adicionada `Content-Security-Policy` restringindo scripts aos CDNs usados, conexões ao Supabase/Google Fonts, `object-src 'none'`, `base-uri 'self'` e `form-action 'self'`. Adicionado `referrer no-referrer`.
- **Supply chain (A08)**: versão do supabase-js fixada (`@2.45.4` em vez de `@2` flutuante).
- **Autofill**: `autocomplete="new-password"` nos campos de criação/redefinição de senha.

### Banco de dados (Supabase)
- Criado [`supabase/schema.sql`](../supabase/schema.sql) versionado no repositório com:
  - RLS habilitada em **todas** as tabelas;
  - tabela `profiles` ligada ao Supabase Auth com papéis validados por `CHECK`;
  - trilha de auditoria **append-only** (`audit_log`): autenticados inserem, só admin lê, ninguém altera/apaga;
  - `CHECK constraints` de domínio (status, prioridade, tipo, humor) e índices.

## 2. Riscos residuais conhecidos (roadmap)

Estes pontos exigem o backend (Supabase Auth + Edge Functions) e não podem ser resolvidos apenas no frontend:

1. **Autenticação client-side**: usuários e hashes vivem no `localStorage` e podem ser manipulados pelo próprio navegador. Migrar para **Supabase Auth** (a tabela `profiles` do schema já está pronta). Até lá, o RBAC do frontend é usabilidade, não fronteira de segurança.
2. **Credenciais de demonstração** (`Auth.quick`/`_ensureSectors`): contas seed com senhas públicas no código. Adequadas para homologação; **remover antes do go-live**.
3. **Token de recuperação exibido em toast**: simulação. Em produção, enviar por e-mail via Edge Function.
4. **Dados sensíveis em claro no `localStorage`**: prontuários/anamneses não são criptografados em repouso no navegador. Mitigação atual: expiração por inatividade + anonimização LGPD. Solução definitiva: mover dados para o Supabase com RLS e manter no cliente apenas cache mínimo.
5. **Modelo chave/valor (`app_data`)**: sincronização "last write wins" pode perder dados com dois usuários simultâneos. Migrar para as tabelas relacionais do schema.
6. **CSP com `'unsafe-inline'`**: necessário porque a UI usa handlers `onclick` inline. Refatorar gradualmente para `addEventListener` e então remover a exceção. SRI não foi aplicado aos CDNs (adicionar `integrity` quando houver pipeline para calcular os hashes).

## 3. Conformidade LGPD — estado atual

| Requisito | Estado |
|---|---|
| Registro de consentimento (TCLE) | ✅ implementado (consentimentos por paciente) |
| Direito de eliminação/anonimização | ✅ `Pats.anonymize` (irreversível, mantém estatísticas) |
| Trilha de auditoria de acessos | ✅ local + schema `audit_log` no Supabase |
| Controle de acesso por papel | ✅ frontend · ⏳ RLS por papel no Supabase (schema pronto) |
| Criptografia em trânsito | ✅ HTTPS/WSS (Supabase) |
| Criptografia de senhas | ✅ PBKDF2-SHA256 |
| Criptografia de dados clínicos em repouso | ⏳ pendente da migração ao Supabase |
| Relatório de impacto (RIPD) | ⏳ documento organizacional, fora do escopo do código |
