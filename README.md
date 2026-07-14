# PsiCESMAC — Clínica Escola de Psicologia

Sistema de gestão clínica da Clínica Escola de Psicologia do CESMAC do Agreste (Arapiraca/AL): pacientes, agenda, prontuários, anamneses, financeiro, supervisão de estágio, auditoria e administração.

## Arquitetura

- **Frontend**: SPA em HTML/CSS/JavaScript puro (`index.html`, `style.css`, `app.js`), sem etapa de build.
- **Persistência local**: `localStorage` (prefixo `psi_`), com backup/restauração em JSON.
- **Nuvem (opcional)**: sincronização com **Supabase** (tabela `app_data` + Realtime). O schema completo, incluindo o modelo relacional alvo e políticas RLS, está em [`supabase/schema.sql`](supabase/schema.sql).
- **Bibliotecas via CDN** (versões fixadas): Chart.js 4.4.0, jsPDF 2.5.1, supabase-js 2.45.4.

## Como executar

É um site estático — sirva a pasta com qualquer servidor HTTP:

```bash
npx serve .        # ou: python3 -m http.server 8080
```

> Use sempre **HTTPS ou localhost**: a criptografia de senhas (Web Crypto/PBKDF2) exige contexto seguro.

## Perfis de acesso (RBAC)

| Perfil | Acesso |
|---|---|
| Administrador | Todas as páginas, aprovação de cadastros, exclusões |
| Recepção | Agenda, pacientes, anamneses de acolhimento |
| Psicólogo(a) voluntário(a) | Seus pacientes, prontuários, perfil profissional |
| Estagiário(a) | Apenas pacientes vinculados, prontuários, anamneses |
| Professor(a)/Supervisor(a) | Prontuários, supervisão, anamneses |

## Segurança e LGPD

- Senhas com **PBKDF2-SHA256 (150.000 iterações, salt aleatório)**; hashes antigos são migrados automaticamente no primeiro login.
- Sessão com expiração absoluta de 8 h e **encerramento por inatividade de 30 min**.
- Limite de tentativas de login (5 tentativas / 5 min).
- **Content Security Policy**, controle de acesso por página com log de tentativas bloqueadas.
- Trilha de auditoria de acessos, exportações e alterações.
- **Anonimização de pacientes** (direito de eliminação, art. 18 LGPD) e registro de consentimentos (TCLE).
- No Supabase, todas as tabelas têm **Row Level Security** habilitada — nunca exponha a `service_role` key no frontend; use apenas a anon key com RLS.

Detalhes e pendências conhecidas: [`docs/AUDITORIA.md`](docs/AUDITORIA.md).

## Estrutura

```
index.html            # marcação da SPA (login + app)
style.css             # tema claro/escuro, responsivo
app.js                # lógica: Auth, UI, Pats, Agenda, Rec, Ana, Fin, Sup, Admin, Cloud…
supabase/schema.sql   # schema PostgreSQL + RLS para o Supabase
docs/AUDITORIA.md     # relatório de auditoria técnica e roadmap
```
