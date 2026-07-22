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

## 1b. Segunda rodada de correções (2026-07-14)

- **Conflito de agenda por sala**: a checagem de conflito passou a considerar a sala — salas diferentes podem atender no mesmo horário (antes o sistema limitava a clínica a 1 atendimento por horário).
- **Supervisão visível para o admin**: `Sup.render` bloqueava qualquer papel diferente de professor; agora admin também vê estagiários e vínculos.
- **Lembrete WhatsApp direcionado**: o link `wa.me` agora inclui o telefone do paciente (com DDI 55), em vez de abrir sem destinatário.
- **Código morto removido**: par duplicado de `openNew`/`edit` dentro de `Appts` (cópia esquecida das funções de paciente).
- **CSV seguro**: novo helper `csvCell` (escape de `;`, aspas e quebras de linha; neutralização de fórmulas `=`/`+`/`-`/`@` contra CSV injection) aplicado às exportações de pacientes, sessões e financeiro.
- **Renovação de sessão sem `confirm` bloqueante**: renova automaticamente se houve atividade nos últimos 5 min; senão avisa por toast e deixa expirar.
- **Notificações privadas por usuário**: cada notificação carrega o `uid` do usuário e só aparece para ele (privacidade em computador compartilhado).
- **Acessibilidade**: toasts com `role="alert"`/`role="status"`; labels associados (`for`/`id`) nos formulários de login, cadastro e recuperação.

## 1c. Migração para Supabase Auth (2026-07-16)

- **Autenticação servidor-side**: login, cadastro, troca e recuperação de senha agora usam **Supabase Auth** quando o projeto está acessível (URL + anon key embutidas; são públicas por design — a segurança vem da RLS).
- **Perfis e papéis** na tabela `profiles`, criada automaticamente por trigger no cadastro; **o primeiro usuário do sistema vira admin aprovado (bootstrap)** e os demais aguardam aprovação.
- **Aprovação/rejeição/remoção de usuários** pelo admin operam direto na tabela `profiles` (política RLS `is_admin()`); usuário sem perfil não consegue entrar.
- **Recuperação de senha real por e-mail** (`resetPasswordForEmail`), substituindo o token simulado em toast.
- **Contas demo bloqueadas no modo nuvem**; o modo local (localStorage) permanece como fallback offline/demonstração.
- Sincronização `app_data` agora exige usuário **autenticado e aprovado** (RLS `is_active_user()`).
- Validação: suíte E2E com mock fiel do supabase-js (bootstrap do 1º admin, pendência, aprovação, troca de senha, bloqueio do demo) + regressão do modo local — tudo verde.

Pendências pós-deploy: executar `supabase/schema.sql` no SQL Editor; habilitar provider Email; testar no domínio real (este ambiente de desenvolvimento não alcança supabase.co).

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
