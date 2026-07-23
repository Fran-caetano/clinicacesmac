'use strict';

// modelo de dados e permissões (espelha server/constants/permissions.js —
// aqui e' so pra montar o menu certo; quem decide de verdade e' o servidor)
var PERMISSIONS = {
  admin:     {pages:['dashboard','agenda','pacientes','prontuarios','anamnese','financeiro','auditoria','admin','supervisao','perfil','config'],canDeletePat:true},
  recepcao:  {pages:['dashboard','agenda','pacientes','anamnese'],canDeletePat:false},
  estagiario:{pages:['dashboard','prontuarios','anamnese'],canDeletePat:false},
  professor: {pages:['dashboard','prontuarios','anamnese','supervisao'],canDeletePat:false},
  psicologo: {pages:['dashboard','agenda','pacientes','prontuarios','anamnese','perfil'],canDeletePat:true}
};

var ROLES  = {admin:'Administrador',recepcao:'Recepção',estagiario:'Estagiário(a)',professor:'Professor(a) / Supervisor(a)',psicologo:'Psicólogo(a) Voluntário(a)'};
var RBDG   = {admin:'br',recepcao:'bt',estagiario:'bo',professor:'bp',psicologo:'bg'};
var PRIO_C = {alta:'prio-alta',media:'prio-media',baixa:'prio-baixa'};
var PRIO_L = {alta:'Alta',media:'Média',baixa:'Baixa'};
var ABDG   = {agendado:'bb',realizado:'bg',cancelado:'br'};

// sessao do usuario logado (fica so em memoria - a autoridade real e' o
// cookie de sessao httpOnly, que o JS nem consegue ler)
var SESSAO = null;

// cliente da API - troca a antiga camada de localStorage por chamadas ao
// backend. Em erro (exceto 401), ja mostra o toast e lanca, entao quem
// chama so precisa de um try/catch vazio pra parar o fluxo.
var Api = {
  base: '/api',
  _req: async function(method, path, body){
    var opts = {method: method, credentials: 'same-origin', headers: {}};
    if(body !== undefined){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res;
    try { res = await fetch(this.base + path, opts); }
    catch(e){ Toast.show('Sem conexão com o servidor.', 'err'); throw e; }
    var data = null;
    try { data = await res.json(); } catch(e){}
    if(res.status === 401 && SESSAO){
      SESSAO = null;
      var app = document.getElementById('app'); if(app){ app.classList.remove('on'); app.setAttribute('aria-hidden','true'); }
      var loginEl = document.getElementById('login'); if(loginEl){ loginEl.style.display=''; loginEl.style.opacity='1'; }
      Toast.show('Sessão expirada. Faça login novamente.', 'warn');
      throw new Error('sessao expirada');
    }
    if(!res.ok){
      var msg = (data && data.erro) || 'Erro no servidor.';
      if(res.status !== 401) Toast.show(msg, 'err');
      throw new Error(msg);
    }
    return data;
  },
  get:   function(p){ return this._req('GET', p); },
  post:  function(p, b){ return this._req('POST', p, b); },
  patch: function(p, b){ return this._req('PATCH', p, b); },
  put:   function(p, b){ return this._req('PUT', p, b); },
  del:   function(p){ return this._req('DELETE', p); }
};

// registra na auditoria eventos que nao correspondem a nenhuma escrita de
// dados (visualizar prontuário, exportar, tentativa de acesso bloqueada)
function logEvent(action, detail, tipo){
  Api.post('/audit', {action: action, detail: detail || '', tipo: tipo}).catch(function(){});
}

// utilitários
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function getVal(id){ var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
function setVal(id, v){ var el = document.getElementById(id); if(el) el.value = v || ''; }
function fErr(id, on){ var el = document.getElementById(id); if(el) el.classList.toggle('err', !!on); }
function fClear(){ for(var i = 0; i < arguments.length; i++) fErr(arguments[i], false); }
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function isoToday(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function fmtDate(d){ if(!d) return '—'; d = String(d).slice(0,10); var p = d.split('-'); return p.length < 3 ? d : p[2]+'/'+p[1]+'/'+p[0]; }
function fmtDT(iso){ if(!iso) return '—'; var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}); }
function fmtAge(nasc){ if(!nasc) return null; var d = new Date(nasc), n = new Date(); var y = n.getFullYear() - d.getFullYear(); if(n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) y--; return y >= 0 ? y : null; }
function fmtCur(v){ return 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', {minimumFractionDigits:2}); }
function initials(n){ var p = (n || '').trim().split(/\s+/); return p.length > 1 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : (n || '?')[0].toUpperCase(); }
function avHtml(p, size, fs){
  size = size || 28; fs = fs || '.64rem';
  if(p && p.foto) return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;overflow:hidden;flex-shrink:0"><img src="'+p.foto+'" style="width:100%;height:100%;object-fit:cover"></div>';
  var nome = (p && p.nome) ? p.nome : '?';
  return '<div class="liav" style="background:'+avBg(nome)+';width:'+size+'px;height:'+size+'px;font-size:'+fs+'">'+initials(nome)+'</div>';
}
function avBg(n){ var h = ['#0066ff','#0a4d22','#b91c1c','#6d28d9','#0e7490','#b45309','#002299','#16a34a']; var s = 0; for(var i = 0; i < (n||'').length; i++) s += n.charCodeAt(i); return h[s % h.length]; }
function empty(t, s){ return '<div class="es"><div class="esico"><svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/></svg></div><h3>' + esc(t) + '</h3>' + (s ? '<p>' + esc(s) + '</p>' : '') + '</div>'; }
function _download(name, txt, mime){ var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], {type: mime || 'text/plain'})); a.download = name; a.click(); URL.revokeObjectURL(a.href); }

async function _syncSelects(){
  var pats;
  try { pats = await Api.get('/patients'); } catch(e){ return; }
  var opts = '<option value="">— Selecione —</option>' + pats.map(function(p){ return '<option value="' + esc(p.id) + '">' + esc(p.nome) + '</option>'; }).join('');
  ['ms-p', 'ag-p', 'pron-sel', 'ana-pac'].forEach(function(id){
    var el = document.getElementById(id); if(!el) return;
    var cur = el.value; el.innerHTML = opts; if(cur) el.value = cur;
  });
}

async function _updateLoginStats(){
  var s;
  try { s = await Api.get('/stats/public'); } catch(e){ return; }
  var vals = [s.pacientes, s.sessoes, s.profissionais];
  ['lv-p','lv-s','lv-u'].forEach(function(id, i){
    var el = document.getElementById(id); if(el) el.textContent = vals[i] < 10 ? '0' + vals[i] : String(vals[i]);
  });
}

// arrastar e soltar (mock — os arquivos ficam so na memoria da pagina,
// nao existe endpoint de upload; recurso decorativo desde a versao original)
var DZ = {
  _files: {},
  click: function(dzId, inputId){ var el = document.getElementById(inputId); if(el) el.click(); },
  over: function(e, dzId){ e.preventDefault(); var el = document.getElementById(dzId); if(el) el.classList.add('over'); },
  leave: function(dzId){ var el = document.getElementById(dzId); if(el) el.classList.remove('over'); },
  drop: function(e, dzId){ e.preventDefault(); this.leave(dzId); this._handle(dzId, e.dataTransfer.files); },
  fileChange: function(dzId, inputId){ var el = document.getElementById(inputId); if(el) this._handle(dzId, el.files); },
  _handle: function(dzId, files){
    var self = this;
    var allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if(!self._files[dzId]) self._files[dzId] = [];
    Array.from(files || []).forEach(function(f){
      if(allowed.indexOf(f.type) < 0){ Toast.show('Tipo inválido: apenas PDF, PNG, JPG.', 'err'); return; }
      if(f.size > 5242880){ Toast.show('Arquivo muito grande (máx 5 MB).', 'err'); return; }
      self._files[dzId].push({name: f.name, size: f.size, type: f.type, token: 'tok_' + uid(), at: new Date().toISOString()});
      self._render(dzId);
    });
  },
  _render: function(dzId){
    var list = this._files[dzId] || [];
    var el = document.getElementById(dzId + '-files'); if(!el) return;
    el.innerHTML = list.map(function(f, i){
      return '<div class="drop-file">'
        + '<span class="drop-file-name">' + esc(f.name) + '</span>'
        + '<span class="drop-file-size">' + (f.size/1024).toFixed(1) + ' KB</span>'
        + '<button class="drop-file-rm" data-dz="' + esc(dzId) + '" data-i="' + i + '" onclick="DZ.removeByBtn(this)">✕</button>'
        + '</div>';
    }).join('');
  },
  removeByBtn: function(btn){
    this.remove(btn.getAttribute('data-dz'), parseInt(btn.getAttribute('data-i'), 10));
  },
  remove: function(dzId, i){
    if(this._files[dzId]) this._files[dzId].splice(i, 1);
    this._render(dzId);
  },
  get: function(dzId){ return this._files[dzId] || []; }
};

// registro de gráficos
var Charts = {
  _r: {},
  kill: function(k){ if(this._r[k]){ this._r[k].destroy(); delete this._r[k]; } },
  set: function(k, c){ this.kill(k); this._r[k] = c; }
};

// notificações — so o admin enxerga (espelha o log de auditoria, que
// agora e' exclusivo do admin no servidor)
var Notif = {
  render: async function(){
    var el = document.getElementById('nlist'); if(!el) return;
    if(!SESSAO || SESSAO.role !== 'admin'){ el.innerHTML = '<div style="padding:18px;text-align:center;font-size:.78rem;color:var(--ink4)">Nenhuma notificação</div>'; return; }
    var logs;
    try { logs = await Api.get('/audit'); } catch(e){ return; }
    if(!logs.length){ el.innerHTML = '<div style="padding:18px;text-align:center;font-size:.78rem;color:var(--ink4)">Nenhuma notificação</div>'; return; }
    el.innerHTML = logs.slice(0, 12).map(function(n){
      return '<div class="npi">'
        + '<div class="npidot"></div>'
        + '<div><div class="npitext">' + esc(n.action + ': ' + n.detail) + '</div>'
        + '<div class="npitime">' + fmtDT(n.at) + '</div></div></div>';
    }).join('');
  },
  dot: function(){
    var d = document.getElementById('ndot'); if(d) d.style.display = 'none';
  }
};

// avisos (toast)
var Toast = {
  show: function(msg, type, dur){
    var th = document.getElementById('toasth'); if(!th) return;
    var cls = {ok:'tok', err:'terr', inf:'tinf', warn:'twarn'}[type] || 'tinf';
    var icons = {
      ok: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
      err: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
      inf: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
      warn: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>'
    };
    var t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = '<svg viewBox="0 0 24 24">' + (icons[type] || icons.inf) + '</svg>' + esc(msg);
    th.appendChild(t);
    setTimeout(function(){ t.style.animation = 'tOut .25s forwards'; setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 260); }, dur || 3200);
  }
};

// modais
var M = {
  _trap: null, _dirty: false,
  open: function(id){
    var el = document.getElementById(id); if(!el) return;
    el.classList.add('on'); document.body.style.overflow = 'hidden'; M._dirty = true;
    var fc = el.querySelectorAll('button,input,select,textarea'); if(fc.length) setTimeout(function(){ fc[0].focus(); },60);
    M._trap = function(e){
      if(e.key==='Escape'){ M.closeAll(); return; }
      if(e.key!=='Tab') return;
      var fl=el.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
      if(!fl.length) return; var first=fl[0],last=fl[fl.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    document.addEventListener('keydown', M._trap);
  },
  close: function(id){
    var el = document.getElementById(id); if(!el) return;
    el.classList.remove('on'); document.body.style.overflow = ''; M._dirty = false;
    if(M._trap){ document.removeEventListener('keydown', M._trap); M._trap = null; }
  },
  closeAll: function(){
    document.querySelectorAll('.mbg.on').forEach(function(m){ m.classList.remove('on'); });
    document.body.style.overflow = ''; M._dirty = false;
    if(M._trap){ document.removeEventListener('keydown', M._trap); M._trap = null; }
  }
};
document.addEventListener('click', function(e){ if(e.target && e.target.classList && e.target.classList.contains('mbg')) M.closeAll(); });

// log de auditoria — leitura e exportação vêm do servidor; a gravação
// acontece automaticamente em cada rota (ou via logEvent para os eventos
// que não correspondem a uma escrita, tipo "prontuário acessado")
var AuditLog = {
  _cache: [],
  render: async function(){
    var logs;
    try { logs = await Api.get('/audit'); } catch(e){ return; }
    this._cache = logs;
    var fil = document.getElementById('audit-fil');
    var f = fil ? fil.value : '';
    if(f) logs = logs.filter(function(l){ return l.type === f || l.action.toLowerCase().indexOf(f) >= 0; });
    var el = document.getElementById('audit-list'); if(!el) return;
    if(!logs.length){ el.innerHTML = empty('Nenhum registro encontrado'); return; }
    var TICO = {
      login:     {bg:'var(--b1)',  fg:'var(--b7)', ico:'<path d="M10 17v-3H7l5-7 5 7h-3v3z"/>'},
      prontuario:{bg:'var(--g1)',  fg:'var(--g6)', ico:'<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/>'},
      paciente:  {bg:'var(--o1)',  fg:'var(--o6)', ico:'<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>'},
      export:    {bg:'var(--r1)',  fg:'var(--r6)', ico:'<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>'},
      seguranca: {bg:'var(--p1)',  fg:'var(--p6)', ico:'<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>'}
    };
    el.innerHTML = logs.slice(0, 120).map(function(l){
      var t = TICO[l.type] || TICO.login;
      return '<div class="audi">'
        + '<div class="audiico" style="background:' + t.bg + ';color:' + t.fg + '">'
        + '<svg viewBox="0 0 24 24" fill="currentColor">' + t.ico + '</svg></div>'
        + '<div style="flex:1;min-width:0">'
        + '<div class="audiact">' + esc(l.action) + '</div>'
        + '<div class="audidet">' + esc(l.detail) + ' · <strong>' + esc(l.user) + '</strong></div></div>'
        + '<div class="auditm">' + fmtDT(l.at) + '</div></div>';
    }).join('');
  },
  export: function(){
    var txt = this._cache.map(function(l){ return '[' + fmtDT(l.at) + '] ' + l.user + ' | ' + l.action + ': ' + l.detail; }).join('\n');
    _download('auditoria_' + isoToday() + '.txt', txt, 'text/plain');
    logEvent('Exportação', 'Log de auditoria TXT', 'export');
    Toast.show('Log exportado!', 'ok');
  }
};

// autenticação
var Auth = {
  tab: function(mode, btn){
    ['login', 'register', 'recover'].forEach(function(m){
      var el = document.getElementById('pn-' + m);
      if(el) el.style.display = m === mode ? '' : 'none';
    });
    document.querySelectorAll('#login-tabs .tabb').forEach(function(b){ b.classList.remove('on'); });
    if(btn) btn.classList.add('on');
  },
  login: async function(){
    var email = getVal('li-e'), pass = document.getElementById('li-p') ? document.getElementById('li-p').value : '';
    var eok = validEmail(email), pok = pass.length > 0;
    fErr('fg-li-e', !eok); fErr('fg-li-p', !pok);
    if(!eok || !pok){ Toast.show('Preencha os campos corretamente.', 'err'); return; }
    var btn = document.getElementById('btn-login'), txt = document.getElementById('btn-login-txt');
    if(btn) btn.disabled = true;
    if(txt) txt.innerHTML = '<svg style="width:13px;height:13px;fill:currentColor;animation:spin .7s linear infinite;display:inline-block" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 0 20A10 10 0 0 1 12 2zm0 2a8 8 0 0 0 0 16A8 8 0 0 0 12 4z" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10h-2A8 8 0 0 0 12 4V2z"/></svg> Verificando…';
    try {
      var u = await Api.post('/auth/login', {email: email, senha: pass});
      await Auth._start(u);
    } catch(e){
      fErr('fg-li-p', true);
    } finally {
      if(btn) btn.disabled = false;
      if(txt) txt.textContent = 'Acessar sistema';
    }
  },
  register: async function(){
    var nome = getVal('rg-n'), email = getVal('rg-e');
    var pass = document.getElementById('rg-p') ? document.getElementById('rg-p').value : '';
    var role = getVal('rg-r');
    var nok = nome.length > 0, eok = validEmail(email), pok = pass.length >= 8;
    fErr('fg-rg-n', !nok); fErr('fg-rg-e', !eok); fErr('fg-rg-p', !pok);
    if(!nok || !eok || !pok){ Toast.show('Corrija os campos destacados.', 'err'); return; }
    try {
      await Api.post('/auth/register', {nome: nome, email: email, senha: pass, role: role});
      Toast.show('Solicitação enviada! Aguarde aprovação do Administrador.', 'inf', 5000);
      setVal('rg-n',''); setVal('rg-e',''); if(document.getElementById('rg-p')) document.getElementById('rg-p').value='';
      fClear('fg-rg-n','fg-rg-e','fg-rg-p');
    } catch(e){ fErr('fg-rg-e', true); }
  },
  _recoverEmail: '', _recoverToken: '',
  recoverStep1: async function(){
    var email = getVal('rec-e');
    if(!validEmail(email)){ fErr('fg-rec-e', true); return; }
    try {
      var r = await Api.post('/auth/recover/request', {email: email});
      Auth._recoverEmail = email;
      Toast.show('Token (simulação): ' + r.tokenSimulado, 'inf', 10000);
      document.getElementById('rec-s1').classList.remove('on');
      document.getElementById('rec-s2').classList.add('on');
    } catch(e){ fErr('fg-rec-e', true); }
  },
  recoverStep2: function(){
    var tok = (getVal('rec-tok') || '').toUpperCase();
    if(!tok){ Toast.show('Informe o token.', 'err'); return; }
    Auth._recoverToken = tok;
    document.getElementById('rec-s2').classList.remove('on');
    document.getElementById('rec-s3').classList.add('on');
  },
  recoverStep3: async function(){
    var el1 = document.getElementById('rec-np'), el2 = document.getElementById('rec-np2');
    var np = el1 ? el1.value : '', np2 = el2 ? el2.value : '';
    if(np.length < 8){ Toast.show('Senha mínimo 8 caracteres.', 'err'); return; }
    if(np !== np2){ Toast.show('Senhas não coincidem.', 'err'); return; }
    try {
      await Api.post('/auth/recover/confirm', {email: Auth._recoverEmail, token: Auth._recoverToken, senhaNova: np});
      Toast.show('Senha redefinida! Faça login.', 'ok');
      if(el1) el1.value = ''; if(el2) el2.value = '';
      setVal('rec-tok', ''); setVal('rec-e', '');
      document.getElementById('rec-s3').classList.remove('on');
      document.getElementById('rec-s1').classList.add('on');
      Auth.tab('login', document.querySelector('#login-tabs .tabb'));
    } catch(e){
      document.getElementById('rec-s3').classList.remove('on');
      document.getElementById('rec-s1').classList.add('on');
    }
  },
  _start: async function(u){
    SESSAO = u;
    var perms = PERMISSIONS[u.role] || {};
    var pages = perms.pages || [];
    var NAV = [
      {sec: 'Principal'},
      {id:'dashboard', label:'Dashboard',        ico:'<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',                   always: true},
      {id:'agenda',    label:'Agenda',            ico:'<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>', badge:'bdg-a'},
      {sec: 'Clínica'},
      {id:'pacientes',  label:'Pacientes',        ico:'<path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>'},
      {id:'prontuarios',label:'Prontuários',      ico:'<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>'},
      {id:'anamnese',   label:'Anamneses',        ico:'<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/>'},
      {sec: 'Gestão'},
      {id:'financeiro', label:'Financeiro',       ico:'<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>'},
      {id:'supervisao', label:'Supervisão',       ico:'<path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>'},
      {id:'auditoria',  label:'Auditoria',        ico:'<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>',             badge:'bdg-au'},
      {id:'admin',      label:'Administração',    ico:'<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>'},
      {id:'config',     label:'Configurações',    ico:'<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>'},
      {sec: 'Meu Perfil'},
      {id:'perfil',     label:'Perfil Profissional', ico:'<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>'}
    ];
    var sbNav = document.getElementById('sb-nav');
    if(sbNav){
      var html = '';
      NAV.forEach(function(item){
        if(item.sec){ html += '<div class="sbs">' + item.sec + '</div>'; return; }
        if(!item.always && pages.indexOf(item.id) < 0) return;
        html += '<button class="sbl-i' + (item.id === 'dashboard' ? ' on' : '') + '" data-page="' + item.id + '" onclick="UI.nav(\'' + item.id + '\', this)">'
          + '<svg viewBox="0 0 24 24">' + item.ico + '</svg>' + esc(item.label)
          + (item.badge ? '<span class="sbdg" id="' + item.badge + '">0</span>' : '')
          + '</button>';
      });
      sbNav.innerHTML = html;
    }
    var av = document.getElementById('sbav');
    if(av){ av.textContent = initials(u.nome); av.style.background = avBg(u.nome); }
    var sbun = document.getElementById('sbun'); if(sbun) sbun.textContent = u.nome;
    var sbur = document.getElementById('sbur'); if(sbur) sbur.textContent = ROLES[u.role] || u.role;
    var rc = document.getElementById('rchip');
    if(rc){ rc.textContent = ROLES[u.role] || u.role; rc.className = 'bdg rchip ' + (RBDG[u.role] || 'bn'); }
    var tbd = document.getElementById('tbdate-txt');
    if(tbd) tbd.textContent = new Date().toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'long'});
    setVal('ag-d', isoToday()); setVal('ms-d', isoToday()); setVal('f-d', isoToday());
    var _today = isoToday();
    var _future30 = new Date(Date.now() + 365 * 86400000).toISOString().slice(0,10);
    var dLimits = {'mp-nasc':{max:_today},'ms-d':{max:_today},'ag-d':{min:_today, max:_future30},'f-d':{max:_today}};
    for(var dId in dLimits){
      var dEl = document.getElementById(dId);
      if(dEl){ if(dLimits[dId].min) dEl.min = dLimits[dId].min; if(dLimits[dId].max) dEl.max = dLimits[dId].max; }
    }
    var loginEl = document.getElementById('login');
    if(loginEl){ loginEl.style.transition = 'opacity .4s'; loginEl.style.opacity = '0'; }
    await new Promise(function(resolve){ setTimeout(resolve, 380); });
    if(loginEl) loginEl.style.display = 'none';
    var app = document.getElementById('app');
    if(app){ app.classList.add('on'); app.removeAttribute('aria-hidden'); }
    _updateLoginStats();
    if(u.role === 'psicologo' && !(u.profil && u.profil.crp)){
      var warn = document.getElementById('dash-prof-warn');
      if(warn) warn.style.display = '';
      Toast.show('⚠️ Complete seu Perfil Profissional para atuar.', 'warn', 6000);
    }
    Dashboard.render(); Lembrete.render(); Agenda.render(); Badge.update(); Notif.render(); Notif.dot();
  },
  logout: async function(){
    try { await Api.post('/auth/logout'); } catch(e){}
    SESSAO = null;
    var app = document.getElementById('app'); if(app){ app.classList.remove('on'); app.setAttribute('aria-hidden','true'); }
    var loginEl = document.getElementById('login'); if(loginEl){ loginEl.style.display = ''; loginEl.style.opacity = '1'; }
    var lp = document.getElementById('li-p'); if(lp) lp.value = '';
    Toast.show('Sessão encerrada.', 'inf');
  },
  restore: async function(){
    try {
      var u = await Api.get('/auth/me');
      await Auth._start(u);
    } catch(e){ /* nao logado - mostra a tela de login normalmente */ }
  }
};

// interface e navegação
var PAGE_TITLES = {dashboard:'Dashboard', agenda:'Agenda', pacientes:'Pacientes', prontuarios:'Prontuários', anamnese:'Anamneses', financeiro:'Financeiro', auditoria:'Auditoria', admin:'Administração', supervisao:'Supervisão', perfil:'Perfil Profissional', config:'Configurações'};

var UI = {
  nav: function(pg, btn){
    var sess = SESSAO || {};
    var perms = PERMISSIONS[sess.role] || {};
    var pages = perms.pages || [];
    if(pg !== 'dashboard' && pages.indexOf(pg) < 0){
      logEvent('Acesso bloqueado', 'Tentativa: ' + pg, 'seguranca');
      Toast.show('Acesso não autorizado.', 'err'); return;
    }
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('on'); });
    document.querySelectorAll('.sbl-i').forEach(function(l){ l.classList.remove('on'); l.removeAttribute('aria-current'); });
    var pgEl = document.getElementById('page-' + pg); if(pgEl) pgEl.classList.add('on');
    var navBtn = btn || document.querySelector('.sbl-i[data-page="' + pg + '"]');
    if(navBtn){ navBtn.classList.add('on'); navBtn.setAttribute('aria-current','page'); }
    var tbt = document.getElementById('tbtitle'); if(tbt) tbt.textContent = PAGE_TITLES[pg] || pg;
    var inits = {dashboard: function(){ Dashboard.render(); Lembrete.render(); }, agenda: function(){ Agenda.render(); _syncSelects(); }, pacientes: function(){ Pats.render(); }, prontuarios: function(){ Rec.init(); }, anamnese: function(){ Ana.renderTmpls(); }, financeiro: function(){ Fin.render(); }, auditoria: function(){ AuditLog.render(); }, admin: function(){ Admin.render(); }, supervisao: function(){ Sup.render(); Sup._renderCalendario(); }, perfil: function(){ Perfil.render(); }, config: function(){} };
    if(inits[pg]) inits[pg]();
    this.closeSb();
  },
  toggleSb: function(){
    var sb = document.getElementById('sb'), ov = document.getElementById('sbo');
    var open = sb.classList.toggle('open'); ov.classList.toggle('on', open);
    var tbm = document.getElementById('tbmenu'); if(tbm) tbm.setAttribute('aria-expanded', String(open));
  },
  closeSb: function(){
    var sb = document.getElementById('sb'); if(sb) sb.classList.remove('open');
    var ov = document.getElementById('sbo'); if(ov) ov.classList.remove('on');
    var tbm = document.getElementById('tbmenu'); if(tbm) tbm.setAttribute('aria-expanded','false');
  },
  toggleNotif: function(){ var np = document.getElementById('npanel'); if(np) np.classList.toggle('on'); }
};

// painel principal
var Dashboard = {
  render: async function(){
    var pats, appts, sessions;
    try {
      var r = await Promise.all([Api.get('/patients'), Api.get('/appts'), Api.get('/sessions')]);
      pats = r[0]; appts = r[1]; sessions = r[2];
    } catch(e){ return; }
    var today = isoToday();
    var ativo = pats.filter(function(p){ return p.status === 'ativo'; }).length;
    var todayN = appts.filter(function(a){ return a.data === today && a.status === 'agendado'; }).length;
    var st = document.getElementById('s-t'); if(st) st.textContent = pats.length;
    var sa = document.getElementById('s-a'); if(sa) sa.textContent = ativo;
    var sh = document.getElementById('s-hj'); if(sh) sh.textContent = todayN;
    var ss = document.getElementById('s-s'); if(ss) ss.textContent = sessions.length;
    var sub = document.getElementById('s-sub'); if(sub) sub.textContent = ativo + ' ativos · ' + (pats.length - ativo) + ' inativos';
    this._chartMonthly(appts); this._chartStatus(pats); this._upcoming(appts, pats); this._recent(pats);
  },
  _chartMonthly: function(appts){
    var ctx = document.getElementById('ch-monthly'); if(!ctx) return;
    Charts.kill('monthly');
    var months = []; var now = new Date();
    for(var i = 5; i >= 0; i--){ var d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({label: d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}), ym: d.toISOString().slice(0,7)}); }
    var data = months.map(function(m){ return appts.filter(function(a){ return a.data && a.data.slice(0,7) === m.ym; }).length; });
    Charts.set('monthly', new Chart(ctx.getContext('2d'), {type:'bar', data:{labels:months.map(function(m){ return m.label; }), datasets:[{label:'Atendimentos', data:data, backgroundColor:'rgba(0,102,255,.78)', borderRadius:6, borderSkipped:false}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{stepSize:1}, grid:{color:'rgba(0,0,0,.05)'}}, x:{grid:{display:false}}}}}));
  },
  _chartStatus: function(pats){
    var ctx = document.getElementById('ch-status'); if(!ctx) return;
    Charts.kill('status');
    var ativo = pats.filter(function(p){ return p.status==='ativo'; }).length;
    var fin = pats.filter(function(p){ return p.status==='finalizado'; }).length;
    var ag = pats.filter(function(p){ return p.status==='aguardando'; }).length;
    Charts.set('status', new Chart(ctx.getContext('2d'), {type:'doughnut', data:{labels:['Ativo','Finalizado','Aguardando'], datasets:[{data:[ativo,fin,ag], backgroundColor:['rgba(34,197,94,.8)','rgba(148,163,184,.55)','rgba(245,158,11,.8)'], borderWidth:0}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{font:{size:11}, padding:12}}}}}));
  },
  _upcoming: function(appts, pats){
    var el = document.getElementById('dash-up'); if(!el) return;
    var today = isoToday();
    var list = appts.filter(function(a){ return a.data >= today && a.status === 'agendado'; }).sort(function(a,b){ return a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora); }).slice(0,5);
    if(!list.length){ el.innerHTML = empty('Nenhum atendimento agendado'); return; }
    el.innerHTML = list.map(function(a){
      var p = pats.find(function(x){ return x.id === a.pacienteId; });
      return '<div class="li click" onclick="UI.nav(\'agenda\')">'
        + '<div class="liav" style="background:' + avBg(p ? p.nome : '') + '">' + initials(p ? p.nome : '?') + '</div>'
        + '<div class="linf"><div class="liname">' + esc(p ? p.nome : '—') + '</div>'
        + '<div class="limeta">' + fmtDate(a.data) + ' às ' + esc(a.hora) + (a.sala ? ' · ' + esc(a.sala) : '') + '</div></div>'
        + '<span class="bdg ' + (ABDG[a.status] || 'bn') + '">' + esc(a.status) + '</span></div>';
    }).join('');
  },
  _recent: function(pats){
    var el = document.getElementById('dash-pats'); if(!el) return;
    var list = pats.slice().sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0,5);
    if(!list.length){ el.innerHTML = empty('Nenhum paciente cadastrado'); return; }
    el.innerHTML = list.map(function(p){
      return '<div class="li click" data-pid="' + esc(p.id) + '" onclick="Rec.view(this.getAttribute(\'data-pid\'))">'
        + '<div class="liav" style="background:' + avBg(p.nome) + '">' + initials(p.nome) + '</div>'
        + '<div class="linf"><div class="liname">' + esc(p.nome) + '</div>'
        + '<div class="limeta">' + (p.tipo === 'infantil' ? 'Infantil' : 'Adulto') + ' · ' + esc(p.mod || '—') + '</div></div>'
        + '<span class="prio ' + (PRIO_C[p.prio] || '') + '"><span class="priod"></span>' + (PRIO_L[p.prio] || '—') + '</span></div>';
    }).join('');
  }
};

// contadores
var Badge = {
  update: async function(){
    var appts;
    try { appts = await Api.get('/appts'); } catch(e){ return; }
    var n = appts.filter(function(a){ return a.data === isoToday() && a.status === 'agendado'; }).length;
    var el = document.getElementById('bdg-a'); if(el) el.textContent = String(n);
  }
};

// pacientes
var Pats = {
  _type: 'adulto',
  _editId: null,
  _page: 0,
  _perPage: 25,
  type: function(t, btn){ this._page=0;
    this._type = t;
    var ttl = document.getElementById('pats-ttl'); if(ttl) ttl.textContent = t === 'infantil' ? 'Pacientes Infantis' : 'Pacientes Adultos';
    document.querySelectorAll('#page-pacientes .tab-row .tabb').forEach(function(b){ b.classList.remove('on'); });
    if(btn) btn.classList.add('on');
    var ps = document.getElementById('pats-search'); if(ps) ps.value = '';
    this.render();
  },
  save: async function(){
    var nome = getVal('mp-n'), nasc = getVal('mp-nasc');
    var nascInvalid = nasc && (nasc > isoToday() || nasc < '1920-01-01');
    fErr('fg-mp-n', !nome); fErr('fg-mp-nasc', !nasc || nascInvalid);
    if(!nome || !nasc || nascInvalid){ Toast.show(nascInvalid ? 'Data de nascimento inválida.' : 'Preencha os campos obrigatórios.','err'); return; }
    var fields = {nome:nome, nasc:nasc, sexo:getVal('mp-sexo'), tel:getVal('mp-tel'), email:getVal('mp-email'), tipo:getVal('mp-tipo'), mod:getVal('mp-mod'), prio:getVal('mp-prio'), enc:getVal('mp-enc'), cpf:getVal('mp-cpf'), queixa:getVal('mp-queixa'), resp:getVal('mp-resp'), telResp:getVal('mp-tel-resp'), obs:getVal('mp-obs')};
    if(Pats._pendingFoto !== undefined) fields.foto = Pats._pendingFoto;
    var lgpdTypes = ['atend','dados','grav','pesq'];
    var consents = [];
    lgpdTypes.forEach(function(t){
      var cb = document.getElementById('mp-lgpd-'+t);
      if(cb && cb.checked) consents.push({tipo:t, aceito:true, data:new Date().toISOString()});
    });
    fields.consentimentos = consents;
    try {
      if(this._editId){
        await Api.patch('/patients/' + this._editId, fields);
        Toast.show('Paciente "' + nome.split(' ')[0] + '" atualizado!', 'ok');
      } else {
        await Api.post('/patients', fields);
        Toast.show('Paciente "' + nome.split(' ')[0] + '" cadastrado!', 'ok');
      }
    } catch(e){ return; }
    this._editId = null;
    M.close('m-pat'); this.render(); Dashboard.render(); Badge.update(); _updateLoginStats();
    ['mp-n','mp-nasc','mp-tel','mp-email','mp-enc','mp-cpf','mp-queixa','mp-resp','mp-tel-resp','mp-obs'].forEach(function(id){ setVal(id,''); });
    fClear('fg-mp-n','fg-mp-nasc');
  },
  _pendingFoto: null,
  _previewFoto: function(input){
    var file = input.files && input.files[0]; if(!file) return;
    if(file.size > 512000){ Toast.show('Imagem muito grande. Máximo 500KB.','err'); input.value=''; return; }
    var reader = new FileReader();
    reader.onload = function(e){
      Pats._pendingFoto = e.target.result;
      var prev = document.getElementById('mp-foto-prev');
      if(prev) prev.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';
    };
    reader.readAsDataURL(file);
  },
  _clearFoto: function(){
    this._pendingFoto = null;
    var prev = document.getElementById('mp-foto-prev');
    if(prev) prev.innerHTML = '<span style="font-size:.65rem;color:var(--ink3)">Sem foto</span>';
    var fotoIn = document.getElementById('mp-foto'); if(fotoIn) fotoIn.value = '';
  },
  openNew: function(){
    this._editId = null;
    ['mp-n','mp-nasc','mp-tel','mp-email','mp-enc','mp-cpf','mp-queixa','mp-resp','mp-tel-resp','mp-obs'].forEach(function(id){ setVal(id,''); });
    setVal('mp-sexo',''); setVal('mp-tipo','adulto'); setVal('mp-mod',''); setVal('mp-prio','media'); setVal('mp-enc','');
    Pats._pendingFoto = null;
    var prev = document.getElementById('mp-foto-prev');
    if(prev) prev.innerHTML = '<span style="font-size:.65rem;color:var(--ink3)">Sem foto</span>';
    var fotoIn = document.getElementById('mp-foto'); if(fotoIn) fotoIn.value = '';
    ['atend','dados','grav','pesq'].forEach(function(t){
      var cb = document.getElementById('mp-lgpd-'+t);
      if(cb) cb.checked = (t === 'atend' || t === 'dados');
    });
    var t = document.getElementById('m-pat-title'); if(t) t.textContent = 'Cadastrar Paciente';
    M.open('m-pat');
  },
  edit: async function(id){
    var pats;
    try { pats = await Api.get('/patients'); } catch(e){ return; }
    var p = pats.find(function(x){ return x.id === id; }); if(!p) return;
    this._editId = id;
    setVal('mp-n', p.nome||''); setVal('mp-nasc', (p.nasc||'').slice(0,10)); setVal('mp-sexo', p.sexo||'');
    setVal('mp-tel', p.tel||''); setVal('mp-email', p.email||''); setVal('mp-tipo', p.tipo||'adulto');
    setVal('mp-mod', p.mod||''); setVal('mp-prio', p.prio||'media'); setVal('mp-enc', p.enc||'');
    setVal('mp-cpf', p.cpf||''); setVal('mp-queixa', p.queixa||'');
    setVal('mp-resp', p.resp||''); setVal('mp-tel-resp', p.telResp||''); setVal('mp-obs', p.obs||'');
    Pats._pendingFoto = p.foto || null;
    var prev = document.getElementById('mp-foto-prev');
    if(prev) prev.innerHTML = p.foto ? '<img src="'+p.foto+'" style="width:100%;height:100%;object-fit:cover">' : '<span style="font-size:.65rem;color:var(--ink3)">Sem foto</span>';
    ['atend','dados','grav','pesq'].forEach(function(t){
      var cb = document.getElementById('mp-lgpd-'+t);
      if(cb) cb.checked = (p.consentimentos||[]).some(function(c){ return c.tipo === t && c.aceito; });
    });
    var t = document.getElementById('m-pat-title'); if(t) t.textContent = 'Editar Paciente';
    M.open('m-pat');
  },
  del: async function(id){
    if(!confirm('Remover este paciente? Esta ação não pode ser desfeita.')) return;
    try { await Api.del('/patients/' + id); } catch(e){ return; }
    this.render(); Dashboard.render(); _updateLoginStats();
    Toast.show('Paciente removido.', 'inf');
  },
  anonymize: async function(id){
    if(!confirm('LGPD — Anonimizar este paciente?\nDados pessoais substituídos permanentemente.\nSessões mantidas para estatística.')) return;
    try { await Api.post('/patients/' + id + '/anonimizar'); } catch(e){ return; }
    this.render(); Dashboard.render(); _updateLoginStats();
    Toast.show('Paciente anonimizado.', 'ok');
  },
  exportCSV: async function(){
    var pats;
    try { pats = await Api.get('/patients'); } catch(e){ return; }
    if(!pats.length){ Toast.show('Nenhum paciente.','warn'); return; }
    var csv='Nome;Nasc;Sexo;CPF;Tel;Email;Tipo;Mod;Prio;Status;Queixa;Enc;Cadastro\n'+pats.map(function(p){return[p.nome,fmtDate(p.nasc),p.sexo||'',p.cpf||'',p.tel||'',p.email||'',p.tipo||'',p.mod||'',p.prio||'',p.status||'',"'"+(p.queixa||'')+"'",p.enc||'',fmtDate(p.createdAt)].join(';');}).join('\n');
    _download('pacientes_'+isoToday()+'.csv','﻿'+csv,'text/csv;charset=utf-8');
    logEvent('Exportação', 'Pacientes CSV', 'export');
    Toast.show('CSV exportado!', 'ok');
  },
  toggleStatus: async function(id){
    var pats;
    try { pats = await Api.get('/patients'); } catch(e){ return; }
    var p = pats.find(function(x){ return x.id === id; }); if(!p) return;
    var novo = p.status === 'ativo' ? 'finalizado' : p.status === 'finalizado' ? 'aguardando' : 'ativo';
    try { await Api.patch('/patients/' + id, {status: novo}); } catch(e){ return; }
    this.render(); Dashboard.render();
    Toast.show('Status atualizado.', 'ok');
  },
  filter: function(v){ this._page=0;this.render(v); },
  render: async function(fil){
    fil = fil || (document.getElementById('pats-search') ? document.getElementById('pats-search').value : '') || '';
    var all, sessions;
    try {
      var r = await Promise.all([Api.get('/patients'), Api.get('/sessions')]);
      all = r[0].filter(function(p){ return p.tipo === Pats._type; }); sessions = r[1];
    } catch(e){ return; }
    var pats = fil ? all.filter(function(p){ return (p.nome + p.tel + p.email + p.cpf).toLowerCase().indexOf(fil.toLowerCase()) >= 0; }) : all;
    var sub = document.getElementById('pac-sub'); if(sub) sub.textContent = all.length + ' paciente' + (all.length !== 1 ? 's' : '') + ' cadastrado' + (all.length !== 1 ? 's' : '');
    var tbody = document.getElementById('pats-body'); if(!tbody) return;
    var canDel = SESSAO && PERMISSIONS[SESSAO.role] && PERMISSIONS[SESSAO.role].canDeletePat;
    if(!pats.length){ tbody.innerHTML = '<tr><td colspan="7">' + empty(fil ? 'Nenhum resultado' : 'Nenhum paciente cadastrado', fil ? '' : 'Clique em "Novo paciente" para começar.') + '</td></tr>'; return; }
    var _total=pats.length,_pp=this._perPage,_maxPg=Math.ceil(_total/_pp)-1;if(this._page>_maxPg)this._page=_maxPg;if(this._page<0)this._page=0;pats=pats.slice(this._page*_pp,(this._page+1)*_pp);
    tbody.innerHTML = pats.map(function(p){
      var age = fmtAge(p.nasc);
      var sc = sessions.filter(function(s){ return s.pacienteId === p.id; }).length;
      var stCls = p.status === 'ativo' ? 'bg' : p.status === 'finalizado' ? 'bn' : 'bo';
      var stLbl = p.status === 'ativo' ? 'Ativo' : p.status === 'finalizado' ? 'Finalizado' : 'Aguardando';
      return '<tr>'
        + '<td><div style="display:flex;align-items:center;gap:8px">'
        + '<div class="liav" style="background:' + avBg(p.nome) + ';width:26px;height:26px;font-size:.62rem">' + initials(p.nome) + '</div>'
        + '<div><div style="font-weight:500;font-size:.8rem">' + esc(p.nome) + '</div>'
        + '<div style="font-size:.68rem;color:var(--ink4)">' + esc(p.email || '—') + '</div></div></div></td>'
        + '<td style="font-size:.79rem">' + (age !== null ? age + ' anos' : '—') + '</td>'
        + '<td><span class="bdg ' + (p.tipo === 'infantil' ? 'bo' : 'bb') + '">' + (p.tipo === 'infantil' ? 'Infantil' : 'Adulto') + '</span></td>'
        + '<td style="font-size:.78rem">' + esc(p.tel || '—') + '</td>'
        + '<td><span class="prio ' + (PRIO_C[p.prio] || '') + '"><span class="priod"></span>' + (PRIO_L[p.prio] || '—') + '</span></td>'
        + '<td><span class="bdg ' + stCls + '" style="cursor:pointer" data-pid="' + esc(p.id) + '" onclick="Pats.toggleStatus(this.getAttribute(\'data-pid\'))">' + stLbl + '</span></td>'
        + '<td><div class="acts">'
        + '<button class="btn btn-s btn-ico" data-pid="' + esc(p.id) + '" onclick="Rec.view(this.getAttribute(\'data-pid\'))" title="Ver prontuário"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/></svg></button>'
        + '<span style="font-size:.7rem;color:var(--ink3);background:var(--surf3);padding:2px 5px;border-radius:var(--r4)">' + sc + 's</span>'
        + (canDel ? '<button class="btn btn-d btn-ico" data-pid="' + esc(p.id) + '" onclick="Pats.anonymize(this.getAttribute(\'data-pid\'))" title="Anonimizar" style="color:var(--o6)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg></button>' : '')
        + '<button class="btn btn-s btn-ico" data-pid="' + esc(p.id) + '" onclick="Pats.edit(this.getAttribute(\'data-pid\'))" title="Editar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>'
        + (canDel ? '<button class="btn btn-d btn-ico" data-pid="' + esc(p.id) + '" onclick="Pats.del(this.getAttribute(\'data-pid\'))" title="Remover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>' : '')
        + '</div></td></tr>';
    }).join('');
    var _pn=document.getElementById('pats-pag');if(_pn&&_total>this._perPage){var _pg=this._page;_pn.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:.77rem;color:var(--ink4)"><span>'+(_pg*_pp+1)+'–'+Math.min((_pg+1)*_pp,_total)+' de '+_total+'</span><div style="display:flex;gap:4px"><button class="btn btn-s btn-xs" '+(_pg<=0?'disabled':'')+' onclick="Pats._page--;Pats.render()">Anterior</button><button class="btn btn-s btn-xs" '+(_pg>=_maxPg?'disabled':'')+' onclick="Pats._page++;Pats.render()">Próximo</button></div></div>';}else if(_pn){_pn.innerHTML='';}
  }
};

// prontuários
var Rec = {
  init: function(){ _syncSelects(); },
  view: function(id){
    UI.nav('prontuarios');
    var self = this;
    setTimeout(function(){ var sel = document.getElementById('pron-sel'); if(sel){ sel.value = id; self.load(id); } }, 120);
  },
  load: async function(id){
    var emptyEl = document.getElementById('pron-empty'), view = document.getElementById('pron-view');
    if(!id){ if(emptyEl) emptyEl.style.display=''; if(view) view.style.display='none'; return; }
    var pats;
    try { pats = await Api.get('/patients'); } catch(e){ return; }
    var p = pats.find(function(x){ return x.id === id; });
    if(!p){
      logEvent('Acesso bloqueado', 'Prontuário não autorizado ou paciente inexistente', 'seguranca');
      Toast.show('Acesso não autorizado a este prontuário.', 'err'); return;
    }
    logEvent('Prontuário acessado', '"' + p.nome + '"', 'prontuario');
    if(emptyEl) emptyEl.style.display = 'none'; if(view) view.style.display = '';
    var age = fmtAge(p.nasc);
    var banner = document.getElementById('pron-banner');
    if(banner) banner.innerHTML = (p.foto ? '<div class="pbav" style="overflow:hidden"><img src="'+p.foto+'" style="width:100%;height:100%;object-fit:cover"></div>' : '<div class="pbav" style="background:' + avBg(p.nome) + '">' + initials(p.nome) + '</div>')
      + '<div><div class="pbname">' + esc(p.nome) + '</div><div class="pbchips">'
      + (age !== null ? '<span class="pbchip">🎂 ' + age + ' anos</span>' : '')
      + '<span class="pbchip">📱 ' + esc(p.tel || '—') + '</span>'
      + '<span class="pbchip">🧠 ' + esc(p.mod || '—') + '</span>'
      + (p.tipo === 'infantil' ? '<span class="pbchip" style="color:var(--o6)">👶 Infantil</span>' : '')
      + '<span class="bdg ' + (p.status==='ativo'?'bg':'bn') + '">' + (p.status==='ativo'?'Ativo':p.status==='finalizado'?'Finalizado':'Aguardando') + '</span>'
      + ' ' + LGPD.chip(p)
      + '</div></div>';
    var sessions;
    try { sessions = await Api.get('/sessions?pacienteId=' + encodeURIComponent(id)); } catch(e){ sessions = []; }
    var tl = document.getElementById('pron-tl');
    if(tl){
      if(!sessions.length){ tl.innerHTML = empty('Nenhuma evolução registrada', 'Clique em "Registrar evolução" para iniciar.'); }
      else { tl.innerHTML = sessions.map(function(s){
        return '<div class="tli"><div class="tldot"></div><div class="tlc">'
          + '<div class="tldate">' + fmtDate(s.data) + ' · Sessão ' + (s.num || '—') + ' · ' + esc(s.tipo || '—') + '</div>'
          + '<div class="tlttl">' + esc((s.res || '').slice(0,70)) + ((s.res || '').length > 70 ? '…' : '') + '</div>'
          + '<div class="tltxt">' + esc(s.res || '') + '</div>'
          + (s.plano ? '<div class="tlplan">↳ Plano: ' + esc(s.plano) + '</div>' : '')
          + (s.horaIni ? '<div style="font-size:.67rem;color:var(--ink4);margin-top:2px">' + esc(s.horaIni) + (s.horaFim ? ' — ' + esc(s.horaFim) : '') + '</div>' : '')
          + (s.cid ? '<div class="tlcid">CID/DSM: ' + esc(s.cid) + '</div>' : '')
          + '<div class="acts" style="margin-top:8px"><button class="btn btn-s btn-xs" onclick="Sess.edit(\'' + esc(s.id) + '\')">Editar</button><button class="btn btn-d btn-xs" onclick="Sess.del(\'' + esc(s.id) + '\')">Excluir</button></div>'
          + '</div></div>';
      }).join(''); }
    }
    var moodCtx = document.getElementById('ch-mood');
    if(moodCtx){
      Charts.kill('mood');
      var sorted = sessions.slice().sort(function(a,b){ return a.data.localeCompare(b.data); });
      Charts.set('mood', new Chart(moodCtx.getContext('2d'), {type:'line', data:{labels:sorted.map(function(s){ return fmtDate(s.data); }), datasets:[{label:'Humor', data:sorted.map(function(s){ return parseInt(s.humor)||3; }), borderColor:'rgba(0,102,255,.85)', backgroundColor:'rgba(0,102,255,.08)', fill:true, tension:.4, pointRadius:5, pointBackgroundColor:'rgba(0,102,255,.9)', pointBorderColor:'#fff', pointBorderWidth:2}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:1,max:5,ticks:{stepSize:1,callback:function(v){ return ['','😞','😟','😐','🙂','😄'][v]||v; }}, grid:{color:'rgba(0,0,0,.04)'}}, x:{grid:{display:false}, ticks:{maxTicksLimit:6}}}}}));
    }
    var anas;
    try { anas = await Api.get('/anamneses?pacienteId=' + encodeURIComponent(id)); } catch(e){ anas = []; }
    var docsEl = document.getElementById('pron-docs');
    if(docsEl){
      if(!anas.length){ docsEl.innerHTML = '<div style="font-size:.77rem;color:var(--ink4);padding:6px 0">Nenhuma anamnese registrada.</div>'; }
      else { docsEl.innerHTML = anas.map(function(a){ return '<div style="display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid var(--bdr)"><svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;color:var(--b6);flex-shrink:0"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/></svg><span style="font-size:.77rem;color:var(--ink7);flex:1">' + esc(a.label || a.tipo) + '</span><span style="font-size:.66rem;color:var(--ink3)">' + fmtDate(a.createdAt) + '</span></div>'; }).join(''); }
    }
  }
};

// sessões / evoluções
var Sess = {
  _editId: null,
  openNew: function(){
    this._editId = null;
    ['ms-num','ms-r','ms-pl','ms-cid','ms-hi','ms-hf'].forEach(function(id){ setVal(id,''); });
    var h = document.getElementById('ms-h'); if(h) h.value = 3;
    var hv = document.getElementById('ms-hv'); if(hv) hv.textContent = '3 / 5';
    var t = document.getElementById('m-sess-title'); if(t) t.textContent = 'Registrar Evolução Clínica';
    M.open('m-sess');
  },
  edit: async function(id){
    var pron = document.getElementById('pron-sel');
    var sessions;
    try { sessions = await Api.get('/sessions?pacienteId=' + encodeURIComponent(pron ? pron.value : '')); } catch(e){ return; }
    var s = sessions.find(function(x){ return x.id === id; }); if(!s) return;
    this._editId = id;
    setVal('ms-p', s.pacienteId||''); setVal('ms-d', (s.data||'').slice(0,10)); setVal('ms-num', s.num||'');
    setVal('ms-tipo', s.tipo||''); setVal('ms-r', s.res||''); setVal('ms-pl', s.plano||''); setVal('ms-cid', s.cid||''); setVal('ms-hi', s.horaIni||''); setVal('ms-hf', s.horaFim||'');
    var h = document.getElementById('ms-h'); if(h) h.value = s.humor||3;
    var hv = document.getElementById('ms-hv'); if(hv) hv.textContent = (s.humor||3) + ' / 5';
    var t = document.getElementById('m-sess-title'); if(t) t.textContent = 'Editar Evolução';
    M.open('m-sess');
  },
  del: async function(id){
    if(!confirm('Excluir esta evolução? A ação não pode ser desfeita.')) return;
    try { await Api.del('/sessions/' + id); } catch(e){ return; }
    Toast.show('Evolução excluída.', 'inf');
    var sel = document.getElementById('pron-sel'); if(sel && sel.value) Rec.load(sel.value);
    Dashboard.render(); _updateLoginStats();
  },
  exportCSV: async function(){
    var pron = document.getElementById('pron-sel');
    var pats, ss;
    try {
      var r = await Promise.all([Api.get('/patients'), Api.get('/sessions')]);
      pats = r[0]; ss = r[1];
    } catch(e){ return; }
    if(!ss.length){ Toast.show('Nenhuma sessão.','warn'); return; }
    var csv='Paciente;Data;Num;Tipo;Humor;Relato;Plano;CID;Criado\n'+ss.map(function(s){var p=pats.find(function(x){return x.id===s.pacienteId;});return[(p?p.nome:'?'),fmtDate(s.data),s.num||'',s.tipo||'',s.humor||'',"'"+(s.res||'')+"'","'"+(s.plano||'')+"'",s.cid||'',fmtDate(s.createdAt)].join(';');}).join('\n');
    _download('sessoes_'+isoToday()+'.csv','﻿'+csv,'text/csv;charset=utf-8');
    logEvent('Exportação', 'Sessões CSV', 'export');
    Toast.show('CSV exportado!', 'ok');
  },
  save: async function(){
    var pac = getVal('ms-p'), data = getVal('ms-d'), res = getVal('ms-r');
    fErr('fg-ms-p', !pac); fErr('fg-ms-d', !data); fErr('fg-ms-r', !res);
    if(!pac || !data || !res){ Toast.show('Preencha os campos obrigatórios.', 'err'); return; }
    var hSlider = document.getElementById('ms-h');
    var fields = {pacienteId:pac, data:data, num:getVal('ms-num'), tipo:getVal('ms-tipo'), humor:hSlider?parseInt(hSlider.value):3, res:res, plano:getVal('ms-pl'), cid:getVal('ms-cid'), horaIni:getVal('ms-hi'), horaFim:getVal('ms-hf')};
    try {
      if(this._editId){
        await Api.patch('/sessions/' + this._editId, fields);
        Toast.show('Evolução atualizada!', 'ok');
      } else {
        await Api.post('/sessions', fields);
        Toast.show('Evolução registrada!', 'ok');
      }
    } catch(e){ return; }
    this._editId = null; M.close('m-sess');
    ['ms-num','ms-r','ms-pl','ms-cid'].forEach(function(id){ setVal(id,''); });
    if(hSlider) hSlider.value = 3; var hv = document.getElementById('ms-hv'); if(hv) hv.textContent = '3 / 5';
    fClear('fg-ms-p','fg-ms-d','fg-ms-r');
    var sel = document.getElementById('pron-sel'); if(sel && sel.value === pac) Rec.load(pac);
    Dashboard.render(); _updateLoginStats();
  }
};

// calendário e agenda
var _calDate = new Date();

var Cal = {
  go: function(dir){ _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() + dir, 1); this.render(); },
  render: async function(){
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0]; pats = r[1];
    } catch(e){ return; }
    var y = _calDate.getFullYear(), m = _calDate.getMonth();
    var lbl = document.getElementById('cal-lbl'); if(lbl) lbl.textContent = new Date(y,m).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    var hdrs = document.getElementById('cal-hdrs'); if(hdrs) hdrs.innerHTML = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(function(d){ return '<div class="calhdr">'+d+'</div>'; }).join('');
    var first = new Date(y, m, 1).getDay(), days = new Date(y, m+1, 0).getDate(), today = isoToday();
    var html = '';
    for(var i = 0; i < first; i++) html += '<div class="calday om"></div>';
    for(var d = 1; d <= days; d++){
      var ds = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var da = appts.filter(function(a){ return a.data === ds; }).slice(0, 3);
      html += '<div class="calday' + (ds === today ? ' today' : '') + '">'
        + '<div class="calday-n">' + d + '</div>'
        + da.map(function(a){ var p = pats.find(function(x){ return x.id === a.pacienteId; }); var cls = a.status==='cancelado'?'evc':a.status==='realizado'?'evr':'eva'; return '<div class="calev '+cls+'">' + esc(a.hora) + ' ' + esc(p ? p.nome.split(' ')[0] : '—') + '</div>'; }).join('')
        + '</div>';
    }
    var grid = document.getElementById('cal-grid'); if(grid) grid.innerHTML = html;
  }
};

var Agenda = {
  render: function(){ Cal.render(); this.renderList(); },
  renderList: async function(){
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0]; pats = r[1];
    } catch(e){ return; }
    var filEl = document.getElementById('appt-fil'); var fil = filEl ? filEl.value : '';
    var list = appts.slice().sort(function(a,b){ return a.data.localeCompare(b.data)||a.hora.localeCompare(b.hora); });
    if(fil) list = list.filter(function(a){ return a.status === fil; });
    var el = document.getElementById('appt-list'); if(!el) return;
    if(!list.length){ el.innerHTML = empty('Nenhum atendimento encontrado'); return; }
    var role = SESSAO ? SESSAO.role : '';
    var canEdit = role === 'admin' || role === 'psicologo' || role === 'recepcao';
    el.innerHTML = list.map(function(a){
      var p = pats.find(function(x){ return x.id === a.pacienteId; });
      var hh = parseInt((a.hora||'00:00').split(':')[0]);
      return '<div class="api">'
        + '<div class="aptime"><div class="aptm">' + esc(a.hora||'—') + '</div><div class="apap">' + (hh<12?'AM':'PM') + '</div></div>'
        + '<div class="apdiv"></div>'
        + avHtml(p, 28, '.64rem')
        + '<div class="apinf"><div class="apname">' + esc(p?p.nome:'Paciente removido') + '</div>'
        + '<div class="apmeta">' + fmtDate(a.data) + (a.sala?' · '+esc(a.sala):'') + (a.prof?' · '+esc(a.prof):'') + '</div></div>'
        + '<span class="bdg ' + (ABDG[a.status]||'bn') + '">' + esc(a.status||'—') + '</span>'
        + (a.rec ? '<span class="bdg bp" style="margin-left:3px">' + esc(a.rec) + '</span>' : '')
        + '<div class="acts">'
        + (canEdit ? '<button class="btn btn-s btn-ico" data-aid="'+esc(a.id)+'" onclick="Appts.edit(this.getAttribute(\'data-aid\'))" title="Editar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>' : '')
        + (canEdit && a.status==='agendado' ? '<button class="btn btn-s btn-ico" data-aid="'+esc(a.id)+'" onclick="Tele.start(this.getAttribute(\'data-aid\'))" title="Teleconsulta" style="color:var(--t6)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></button>' : '')
        + (canEdit && a.status==='agendado' ? '<button class="btn btn-ok btn-ico" data-aid="'+esc(a.id)+'" onclick="Appts.status(this.getAttribute(\'data-aid\'),\'realizado\')" title="Realizado"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></button>'+'<button class="btn btn-d btn-ico" data-aid="'+esc(a.id)+'" onclick="Appts.status(this.getAttribute(\'data-aid\'),\'cancelado\')" title="Cancelar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' : '')
        + (canEdit ? '<button class="btn btn-d btn-ico" data-aid="'+esc(a.id)+'" onclick="Appts.del(this.getAttribute(\'data-aid\'))" title="Remover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>' : '')
        + '</div></div>';
    }).join('');
  }
};

var Appts = {
  _editId: null,
  save: async function(){
    var pac = getVal('ag-p'), data = getVal('ag-d'), hora = getVal('ag-h');
    fErr('fg-ag-p', !pac); fErr('fg-ag-d', !data); fErr('fg-ag-h', !hora);
    if(!pac || !data || !hora){ Toast.show('Preencha os campos obrigatórios.', 'err'); return; }
    if(this._editId){
      try {
        await Api.patch('/appts/' + this._editId, {pacienteId:pac, data:data, hora:hora, sala:getVal('ag-sala'), prof:getVal('ag-prof'), obs:getVal('ag-obs')});
      } catch(e){ return; }
      this._editId = null;
      M.close('m-appt'); Agenda.render(); Badge.update(); Dashboard.render();
      Toast.show('Agendamento atualizado!', 'ok');
      ['ag-prof','ag-obs','ag-rec','ag-rec-n'].forEach(function(id){ setVal(id,''); });
      fClear('fg-ag-p','fg-ag-d','fg-ag-h');
      return;
    }
    var rec = getVal('ag-rec'), recN = parseInt(getVal('ag-rec-n'))||1;
    var criados = 0, p = null;
    for(var ri = 0; ri < (rec ? recN : 1); ri++){
      var d = new Date(data + 'T12:00:00');
      if(ri > 0){
        if(rec === 'semanal') d.setDate(d.getDate() + 7 * ri);
        else if(rec === 'quinzenal') d.setDate(d.getDate() + 14 * ri);
        else if(rec === 'mensal') d.setMonth(d.getMonth() + ri);
      }
      var dStr = d.toISOString().slice(0,10);
      try {
        var created = await Api.post('/appts', {pacienteId:pac, data:dStr, hora:hora, sala:getVal('ag-sala'), prof:getVal('ag-prof'), obs:getVal('ag-obs'), rec:rec||''});
        criados++;
        if(ri === 0) p = created;
      } catch(e){ if(ri === 0) return; }
    }
    M.close('m-appt'); Agenda.render(); Badge.update(); Dashboard.render();
    Toast.show(criados > 1 ? criados + ' agendamentos criados!' : 'Agendamento criado!', 'ok');
    var waEl = document.getElementById('ag-wa');
    if(waEl && waEl.checked && p){
      var pats = await Api.get('/patients').catch(function(){ return []; });
      var pac2 = pats.find(function(x){ return x.id === pac; });
      if(pac2 && pac2.tel){
        var msg = '*Clínica Escola de Psicologia CESMAC*\n\nOlá, ' + pac2.nome + '! 😊\n\nSua consulta foi agendada:\n📅 ' + fmtDate(data) + ' às ' + hora + (p.sala ? '\n🏥 ' + p.sala : '') + '\n\nAguardamos você!';
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
      }
    }
    ['ag-prof','ag-obs','ag-rec','ag-rec-n'].forEach(function(id){ setVal(id,''); });
    fClear('fg-ag-p','fg-ag-d','fg-ag-h');
  },
  status: async function(id, st){
    try { await Api.patch('/appts/' + id, {status: st}); } catch(e){ return; }
    Agenda.render(); Badge.update(); Dashboard.render();
    Toast.show('Status: "' + st + '".', 'ok');
  },
  openNew: function(){
    this._editId = null;
    ['ag-prof','ag-obs','ag-rec','ag-rec-n'].forEach(function(id){ setVal(id,''); });
    var t = document.getElementById('m-appt-title'); if(t) t.textContent = 'Novo Agendamento';
    M.open('m-appt');
  },
  edit: async function(id){
    var appts;
    try { appts = await Api.get('/appts'); } catch(e){ return; }
    var a = appts.find(function(x){ return x.id === id; }); if(!a) return;
    this._editId = id;
    setVal('ag-p', a.pacienteId||''); setVal('ag-d', (a.data||'').slice(0,10)); setVal('ag-h', a.hora||'');
    setVal('ag-sala', a.sala||'Sala 01'); setVal('ag-prof', a.prof||''); setVal('ag-obs', a.obs||'');
    setVal('ag-rec',''); setVal('ag-rec-n','1');
    var t = document.getElementById('m-appt-title'); if(t) t.textContent = 'Editar Agendamento';
    M.open('m-appt');
  },
  del: async function(id){
    if(!confirm('Remover este agendamento?')) return;
    try { await Api.del('/appts/' + id); } catch(e){ return; }
    Agenda.render(); Badge.update(); Dashboard.render();
    Toast.show('Agendamento removido.', 'inf');
  }
};

// financeiro
var Fin = {
  _editId: null,
  openNew: function(){
    this._editId = null;
    ['f-desc','f-comp'].forEach(function(id){ setVal(id,''); });
    var v = document.getElementById('f-val'); if(v) v.value = '';
    setVal('f-t','despesa'); setVal('f-cat','Material'); setVal('f-d', isoToday());
    var t = document.getElementById('m-exp-title'); if(t) t.textContent = 'Novo Lançamento';
    M.open('m-exp');
  },
  edit: async function(id){
    var list;
    try { list = await Api.get('/finance'); } catch(e){ return; }
    var item = list.find(function(x){ return x.id === id; }); if(!item) return;
    this._editId = id;
    setVal('f-d', (item.data||'').slice(0,10)); setVal('f-t', item.tipo||'despesa'); setVal('f-desc', item.desc||'');
    setVal('f-cat', item.cat||'Material'); setVal('f-comp', item.comp||'');
    var v = document.getElementById('f-val'); if(v) v.value = item.val||'';
    var t = document.getElementById('m-exp-title'); if(t) t.textContent = 'Editar Lançamento';
    M.open('m-exp');
  },
  save: async function(){
    var data = getVal('f-d'), desc = getVal('f-desc');
    var valEl = document.getElementById('f-val'); var val = valEl ? parseFloat(valEl.value) : 0;
    fErr('fg-fd', !data); fErr('fg-fdesc', !desc); fErr('fg-fval', !(val > 0));
    if(!data || !desc || !(val > 0)){ Toast.show('Preencha os campos obrigatórios.','err'); return; }
    var fields = {data:data, tipo:getVal('f-t'), descricao:desc, cat:getVal('f-cat'), val:val, comp:getVal('f-comp')};
    try {
      if(this._editId){
        await Api.patch('/finance/' + this._editId, fields);
        Toast.show('Lançamento atualizado!', 'ok');
      } else {
        await Api.post('/finance', fields);
        Toast.show('Lançamento de ' + fmtCur(val) + ' salvo!', 'ok');
      }
    } catch(e){ return; }
    this._editId = null; M.close('m-exp'); this.render();
    ['f-desc','f-comp'].forEach(function(id){ setVal(id,''); }); if(valEl) valEl.value='';
    fClear('fg-fd','fg-fdesc','fg-fval');
  },
  render: async function(){
    var list;
    try { list = await Api.get('/finance'); } catch(e){ return; }
    var ym = new Date().toISOString().slice(0,7);
    var month = list.filter(function(l){ return l.data && l.data.slice(0,7) === ym; });
    var rec = month.filter(function(l){ return l.tipo==='receita'; }).reduce(function(s,l){ return s+l.val; }, 0);
    var des = month.filter(function(l){ return l.tipo==='despesa'; }).reduce(function(s,l){ return s+l.val; }, 0);
    var frec = document.getElementById('f-rec'); if(frec) frec.textContent = fmtCur(rec);
    var fdes = document.getElementById('f-des'); if(fdes) fdes.textContent = fmtCur(des);
    var fsal = document.getElementById('f-sal'); if(fsal){ fsal.textContent = fmtCur(rec-des); fsal.style.color = (rec-des)>=0?'var(--g6)':'var(--r6)'; }
    var tbody = document.getElementById('fin-body'); if(!tbody) return;
    if(!list.length){ tbody.innerHTML = '<tr><td colspan="6">' + empty('Nenhum lançamento','Clique em "Novo lançamento" para começar.') + '</td></tr>'; return; }
    tbody.innerHTML = list.slice().sort(function(a,b){ return b.data.localeCompare(a.data); }).map(function(l){
      return '<tr><td style="font-size:.79rem">' + fmtDate(l.data) + '</td>'
        + '<td style="font-weight:500">' + esc(l.desc) + '</td>'
        + '<td><span class="bdg bn">' + esc(l.cat) + '</span></td>'
        + '<td><span class="bdg ' + (l.tipo==='receita'?'bg':'br') + '">' + (l.tipo==='receita'?'Receita':'Despesa') + '</span></td>'
        + '<td style="font-weight:700;color:' + (l.tipo==='receita'?'var(--g6)':'var(--r6)') + '">' + fmtCur(l.val) + '</td>'
        + '<td><div class="acts"><span style="font-size:.73rem;color:var(--ink3)">' + esc(l.comp||'—') + '</span>'
        + '<button class="btn btn-s btn-ico" data-lid="' + esc(l.id) + '" onclick="Fin.edit(this.getAttribute(\'data-lid\'))" title="Editar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>'
        + '<button class="btn btn-d btn-ico" data-lid="' + esc(l.id) + '" onclick="Fin.del(this.getAttribute(\'data-lid\'))" title="Remover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>'
        + '</div></td></tr>';
    }).join('');
  },
  del: async function(id){
    if(!confirm('Remover este lançamento?')) return;
    try { await Api.del('/finance/' + id); } catch(e){ return; }
    this.render(); Toast.show('Lançamento removido.','inf');
  },
  exportCSV: async function(){
    var list;
    try { list = await Api.get('/finance'); } catch(e){ return; }
    if(!list.length){ Toast.show('Nenhum lançamento para exportar.','warn'); return; }
    var csv = 'Data;Descrição;Categoria;Tipo;Valor;Comprovante\n' + list.map(function(l){ return fmtDate(l.data)+';'+l.desc+';'+l.cat+';'+l.tipo+';'+l.val+';'+(l.comp||'—'); }).join('\n');
    _download('financeiro_cesmac_' + isoToday() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    logEvent('Exportação', 'Relatório financeiro CSV', 'export');
    Toast.show('CSV exportado!','ok');
  }
};

// administração
var Admin = {
  render: async function(){
    if(!SESSAO || SESSAO.role !== 'admin') return;
    var users;
    try { users = await Api.get('/admin/users'); } catch(e){ return; }
    var pending = users.filter(function(u){ return u.pending; });
    var active = users.filter(function(u){ return !u.pending; });
    var pbody = document.getElementById('pending-body');
    var pcard = document.getElementById('pending-card');
    if(pcard) pcard.style.display = pending.length ? '' : 'none';
    if(pbody){
      if(!pending.length){ pbody.innerHTML = '<tr><td colspan="5">' + empty('Sem cadastros pendentes') + '</td></tr>'; }
      else {
        pbody.innerHTML = pending.map(function(u){
          return '<tr>'
            + '<td><div style="display:flex;align-items:center;gap:7px"><div class="liav" style="background:'+avBg(u.nome)+';width:24px;height:24px;font-size:.6rem">'+initials(u.nome)+'</div>' + esc(u.nome) + '</div></td>'
            + '<td style="font-size:.79rem">' + esc(u.email) + '</td>'
            + '<td><span class="bdg ' + (RBDG[u.role]||'bn') + '">' + esc(ROLES[u.role]||u.role) + '</span></td>'
            + '<td style="font-size:.75rem;color:var(--ink4)">' + fmtDT(u.createdAt) + '</td>'
            + '<td><div class="acts">'
            + '<button class="btn btn-ok btn-sm" data-uid="'+esc(u.id)+'" onclick="Admin.approve(this.getAttribute(\'data-uid\'))">✓ Aprovar</button>'
            + '<button class="btn btn-d btn-sm" data-uid="'+esc(u.id)+'" onclick="Admin.reject(this.getAttribute(\'data-uid\'))">✕ Rejeitar</button>'
            + '</div></td></tr>';
        }).join('');
      }
    }
    var tbody = document.getElementById('admin-body'); if(!tbody) return;
    if(!active.length){ tbody.innerHTML = '<tr><td colspan="6">' + empty('Nenhum usuário') + '</td></tr>'; return; }
    tbody.innerHTML = active.map(function(u){
      return '<tr>'
        + '<td><div style="display:flex;align-items:center;gap:7px"><div class="liav" style="background:'+avBg(u.nome)+';width:24px;height:24px;font-size:.6rem">'+initials(u.nome)+'</div>' + esc(u.nome) + '</div></td>'
        + '<td style="font-size:.79rem">' + esc(u.email) + '</td>'
        + '<td><span class="bdg ' + (RBDG[u.role]||'bn') + '">' + esc(ROLES[u.role]||u.role) + '</span></td>'
        + '<td><span class="bdg bg">Ativo</span></td>'
        + '<td style="font-size:.75rem;color:var(--ink4)">' + fmtDT(u.createdAt) + '</td>'
        + '<td>' + (u.id !== SESSAO.id ? '<button class="btn btn-d btn-sm" data-uid="'+esc(u.id)+'" onclick="Admin.del(this.getAttribute(\'data-uid\'))">Remover</button>' : '<span style="font-size:.71rem;color:var(--ink4)">Você</span>') + '</td></tr>';
    }).join('');
  },
  approve: async function(id){
    try { await Api.post('/admin/users/' + id + '/approve'); } catch(e){ return; }
    Toast.show('Usuário aprovado!', 'ok'); this.render(); _updateLoginStats();
  },
  reject: async function(id){
    if(!confirm('Rejeitar e remover este cadastro?')) return;
    try { await Api.del('/admin/users/' + id); } catch(e){ return; }
    Toast.show('Cadastro rejeitado.', 'inf'); this.render();
  },
  del: async function(id){
    if(!confirm('Remover este usuário?')) return;
    try { await Api.del('/admin/users/' + id); } catch(e){ return; }
    Toast.show('Usuário removido.', 'inf'); this.render(); _updateLoginStats();
  }
};

// supervisão
var Sup = {
  _renderCalendario: async function(){
    var el = document.getElementById('sup-calendario'); if(!el) return;
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0].filter(function(a){ return a.status === 'agendado'; }); pats = r[1];
    } catch(e){ return; }
    var profs = {}; appts.forEach(function(a){ var k = a.prof || 'Sem profissional'; if(!profs[k]) profs[k] = []; profs[k].push(a); });
    var keys = Object.keys(profs).sort();
    if(!keys.length){ el.innerHTML = '<div class="es"><p>Nenhum agendamento ativo.</p></div>'; return; }
    el.innerHTML = keys.map(function(prof){
      var items = profs[prof].sort(function(a,b){ return a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora); }).slice(0,10);
      return '<div style="margin-bottom:14px"><div class="sdiv">' + esc(prof) + ' (' + profs[prof].length + ')</div>'
        + items.map(function(a){
          var p = pats.find(function(x){ return x.id === a.pacienteId; });
          return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:.78rem"><span style="color:var(--ink4);min-width:70px">' + fmtDate(a.data) + '</span><span style="font-weight:600;color:var(--b6);min-width:42px">' + esc(a.hora) + '</span><span style="color:var(--ink)">' + esc(p?p.nome:'?') + '</span><span class="bdg bn" style="font-size:.6rem">' + esc(a.sala||'') + '</span></div>';
        }).join('') + '</div>';
    }).join('');
  },
  render: async function(){
    if(!SESSAO || SESSAO.role !== 'professor') return;
    var alunos, pats, vinculos;
    try {
      var r = await Promise.all([Api.get('/vinculos/estagiarios'), Api.get('/patients'), Api.get('/vinculos')]);
      alunos = r[0]; pats = r[1]; vinculos = r[2];
    } catch(e){ return; }
    var el = document.getElementById('sup-alunos'); if(!el) return;
    if(!alunos.length){ el.innerHTML = empty('Nenhum estagiário cadastrado'); }
    else { el.innerHTML = alunos.map(function(u){ return '<div class="li"><div class="liav" style="background:'+avBg(u.nome)+'">'+initials(u.nome)+'</div><div class="linf"><div class="liname">'+esc(u.nome)+'</div><div class="limeta">'+esc(u.email)+'</div></div><span class="bdg bo">Estagiário</span></div>'; }).join(''); }
    var vcEst = document.getElementById('vc-est'), vcPac = document.getElementById('vc-pac');
    if(vcEst) vcEst.innerHTML = '<option value="">— Selecione —</option>' + alunos.map(function(u){ return '<option value="'+esc(u.id)+'">'+esc(u.nome)+'</option>'; }).join('');
    if(vcPac) vcPac.innerHTML = '<option value="">— Selecione —</option>' + pats.map(function(p){ return '<option value="'+esc(p.id)+'">'+esc(p.nome)+'</option>'; }).join('');
    var tbody = document.getElementById('vinc-body'); if(!tbody) return;
    if(!vinculos.length){ tbody.innerHTML = '<tr><td colspan="4">' + empty('Nenhum vínculo criado') + '</td></tr>'; return; }
    tbody.innerHTML = vinculos.map(function(v){
      var est = alunos.find(function(x){ return x.id === v.estId; });
      var pac = pats.find(function(x){ return x.id === v.pacId; });
      return '<tr>'
        + '<td>' + esc(est?est.nome:'—') + '</td>'
        + '<td>' + esc(pac?pac.nome:'—') + '</td>'
        + '<td style="font-size:.75rem;color:var(--ink4)">' + fmtDate(v.createdAt) + '</td>'
        + '<td><span class="bdg '+(v.ativo?'bg':'bn')+'">'+(v.ativo?'Ativo':'Revogado')+'</span></td>'
        + '<td><div class="acts">'
        + (v.ativo ? '<button class="btn btn-d btn-sm" data-vid="'+esc(v.id)+'" onclick="Sup.revogar(this.getAttribute(\'data-vid\'))">Revogar</button>' : '<button class="btn btn-ok btn-sm" data-vid="'+esc(v.id)+'" onclick="Sup.reativar(this.getAttribute(\'data-vid\'))">Reativar</button>')
        + '</div></td></tr>';
    }).join('');
  },
  saveVinculo: async function(){
    var estId = getVal('vc-est'), pacId = getVal('vc-pac');
    if(!estId || !pacId){ Toast.show('Selecione estagiário e paciente.', 'err'); return; }
    try { await Api.post('/vinculos', {estId: estId, pacId: pacId}); } catch(e){ return; }
    M.close('m-vinculo'); this.render();
    Toast.show('Vínculo criado!', 'ok');
  },
  revogar: async function(id){
    if(!confirm('Revogar este vínculo?')) return;
    try { await Api.patch('/vinculos/' + id, {ativo: false}); } catch(e){ return; }
    Toast.show('Vínculo revogado.', 'inf'); this.render();
  },
  reativar: async function(id){
    try { await Api.patch('/vinculos/' + id, {ativo: true}); } catch(e){ return; }
    Toast.show('Vínculo reativado.', 'ok'); this.render();
  }
};

// perfil profissional
var Perfil = {
  render: async function(){
    if(!SESSAO) return;
    var u;
    try { u = await Api.get('/auth/me'); } catch(e){ return; }
    var profil = u.profil || {};
    var el = document.getElementById('perfil-form'); if(!el) return;
    var abordagens = ['Psicanálise','Psicologia Analítica (Jung)','TCC','Gestalt-terapia','Análise do Comportamento (ABA)','Humanismo (Rogers)','Psicologia Histórico-Cultural','EMDR','ACT','Sistêmica','Psicologia Positiva','Outra'];
    var dias = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    el.innerHTML = '<div class="g2">'
      + '<div class="fg gc"><label class="fl">Nome completo (CFP)</label><input type="text" id="pf-nome" class="fi" value="'+esc(profil.nome||u.nome||'')+'" maxlength="100"></div>'
      + '<div class="fg"><label class="fl">CPF *</label><input type="text" id="pf-cpf" class="fi" placeholder="000.000.000-00" value="'+esc(profil.cpf||'')+'" maxlength="14"></div>'
      + '<div class="fg"><label class="fl">CRP ativo *</label><input type="text" id="pf-crp" class="fi" placeholder="00/00000" value="'+esc(profil.crp||'')+'" maxlength="12"></div>'
      + '<div class="fg gc"><label class="fl">Abordagem teórica principal *</label><select id="pf-abord" class="fi fsel">'
      + abordagens.map(function(a){ return '<option value="'+a+'"'+(profil.abord===a?' selected':'')+'>'+a+'</option>'; }).join('')
      + '</select></div>'
      + '<div class="fg gc"><label class="fl">Especialidades / formações complementares</label><input type="text" id="pf-esp" class="fi" placeholder="Ex: Terapia de casal, avaliação psicológica…" value="'+esc(profil.especialidades||'')+'" maxlength="200"></div>'
      + '<div class="fg gc"><label class="fl">Turnos de disponibilidade *</label><div class="chk-row">'
      + dias.map(function(d){ return '<label class="chk-item"><input type="checkbox" name="turno" value="'+d+'"'+((profil.turnos||[]).indexOf(d)>=0?' checked':'')+'>'+d+'</label>'; }).join('')
      + '</div></div></div>'
      + '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-p" onclick="Perfil.save()">Salvar perfil</button></div>'
      + '<div class="card" style="margin-top:16px"><div class="cardh"><h3>Alterar senha</h3></div><div class="cardb"><div class="g2">'
      + '<div class="fg"><label class="fl">Senha atual</label><input type="password" id="pf-oldpw" class="fi" placeholder="Senha atual"></div>'
      + '<div class="fg"><label class="fl">Nova senha</label><input type="password" id="pf-newpw" class="fi" placeholder="Mínimo 6 caracteres"></div>'
      + '</div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-s" onclick="Perfil.changePass()">Alterar senha</button></div></div></div>';
  },
  save: async function(){
    var cpf = getVal('pf-cpf'), crp = getVal('pf-crp'), abord = getVal('pf-abord');
    if(!cpf || !crp || !abord){ Toast.show('Preencha todos os campos obrigatórios.', 'err'); return; }
    var turnos = [];
    document.querySelectorAll('input[name="turno"]:checked').forEach(function(cb){ turnos.push(cb.value); });
    if(!turnos.length){ Toast.show('Selecione ao menos um turno.', 'err'); return; }
    try {
      var profil = await Api.patch('/auth/profile', {cpf: cpf, crp: crp, abord: abord, nome: getVal('pf-nome'), especialidades: getVal('pf-esp'), turnos: turnos});
      if(SESSAO) SESSAO.profil = profil;
    } catch(e){ return; }
    var warn = document.getElementById('dash-prof-warn'); if(warn) warn.style.display = 'none';
    Toast.show('Perfil salvo com sucesso!', 'ok');
  },
  changePass: async function(){
    var oldpw = getVal('pf-oldpw'), newpw = getVal('pf-newpw');
    if(!oldpw || !newpw){ Toast.show('Preencha ambos os campos.','err'); return; }
    if(newpw.length < 6){ Toast.show('Senha nova deve ter pelo menos 6 caracteres.','err'); return; }
    try { await Api.patch('/auth/password', {senhaAtual: oldpw, senhaNova: newpw}); }
    catch(e){ return; }
    setVal('pf-oldpw',''); setVal('pf-newpw','');
    Toast.show('Senha alterada com sucesso!','ok');
  }
};

// busca
var Search = {
  _t: null,
  _norm: function(s){ return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); },
  _score: function(query, target){
    var q = this._norm(query), t = this._norm(target);
    if(!t) return 0;
    if(t.indexOf(q) >= 0) return 100 + (q.length / t.length) * 50;
    if(q.length < 2) return 0;
    var score = 0, qi = 0;
    for(var ti = 0; ti < t.length && qi < q.length; ti++){
      if(t[ti] === q[qi]){ score += 10; qi++; }
    }
    if(qi < q.length * 0.6) return 0;
    var tris = 0, triTotal = Math.max(q.length - 2, 1);
    for(var i = 0; i <= q.length - 3; i++){
      if(t.indexOf(q.slice(i, i+3)) >= 0) tris++;
    }
    score += (tris / triTotal) * 40;
    if(t.slice(0, q.length) === q) score += 25;
    return score;
  },
  go: function(val){
    clearTimeout(this._t);
    if(!val || val.length < 2){ M.close('m-search'); return; }
    var self = this;
    this._t = setTimeout(async function(){
      var pats;
      try { pats = await Api.get('/patients'); } catch(e){ return; }
      var scored = [];
      pats.forEach(function(p){
        var best = Math.max(
          self._score(val, p.nome),
          self._score(val, p.cpf || ''),
          self._score(val, p.tel || ''),
          self._score(val, p.email || '')
        );
        if(best > 15) scored.push({p:p, s:best});
      });
      var el = document.getElementById('search-res'); if(!el) return;
      if(!scored.length){
        el.innerHTML = '<div style="padding:20px;text-align:center;font-size:.8rem;color:var(--ink4)">Nenhum resultado para "' + esc(val) + '"</div>';
        M.open('m-search'); return;
      }
      scored.sort(function(a,b){ return b.s - a.s; });
      function hl(s, q){
        var norm = Search._norm(s), nq = Search._norm(q);
        var i = norm.indexOf(nq); if(i < 0) return esc(s);
        return esc(s.slice(0,i)) + '<mark>' + esc(s.slice(i,i+q.length)) + '</mark>' + esc(s.slice(i+q.length));
      }
      el.innerHTML = scored.slice(0,10).map(function(r){
        var p = r.p;
        return '<div class="li click" data-pid="' + esc(p.id) + '" onclick="Rec.view(this.getAttribute(\'data-pid\'));M.close(\'m-search\')">'
          + avHtml(p, 28, '.64rem')
          + '<div class="linf"><div class="liname">'+hl(p.nome,val)+'</div>'
          + '<div class="limeta">'+(p.tipo==='infantil'?'Infantil':'Adulto')+' · '+(p.tel||'—')+(p.cpf?' · '+p.cpf:'')+'</div></div>'
          + '<span style="font-size:.62rem;color:var(--ink3)">'+Math.round(r.s)+'%</span></div>';
      }).join('');
      M.open('m-search');
    }, 180);
  }
};

// teleconsulta
var Tele = {
  start: async function(apptId){
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0]; pats = r[1];
    } catch(e){ return; }
    var a = appts.find(function(x){ return x.id === apptId; }); if(!a) return;
    var p = pats.find(function(x){ return x.id === a.pacienteId; });
    var room = 'PsiCESMAC-' + apptId.slice(0,8) + '-' + a.data.replace(/-/g,'');
    var url = 'https://meet.jit.si/' + encodeURIComponent(room);
    if(confirm('Iniciar teleconsulta' + (p ? ' com ' + p.nome : '') + '?\n\nSala: ' + room + '\n\nO link será aberto em nova aba. Compartilhe com o paciente via WhatsApp se necessário.')){
      window.open(url, '_blank', 'noopener');
      logEvent('Teleconsulta', '"' + (p?p.nome:'—') + '" — sala ' + room, 'paciente');
      Toast.show('Sala aberta: ' + room, 'ok');
      if(p && p.tel){
        var waMsg = '*Teleconsulta — Clínica CESMAC*\n\nOlá, ' + (p.nome||'').split(' ')[0] + '!\nSua sessão online está pronta.\n\nAcesse: ' + url + '\n\nAguardamos você!';
        if(confirm('Enviar link via WhatsApp para ' + p.nome.split(' ')[0] + '?'))
          window.open('https://wa.me/' + p.tel.replace(/\D/g,'') + '?text=' + encodeURIComponent(waMsg), '_blank', 'noopener');
      }
    }
  }
};

// plano terapêutico
var Plano = {
  open: async function(){
    var sel = document.getElementById('pron-sel'); var pid = sel ? sel.value : '';
    if(!pid){ Toast.show('Selecione um paciente.','err'); return; }
    var pl, pats;
    try {
      var r = await Promise.all([Api.get('/plans/' + pid), Api.get('/patients')]);
      pl = r[0] || {}; pats = r[1];
    } catch(e){ return; }
    setVal('pl-dem', pl.demanda||''); setVal('pl-obj', pl.objetivos||'');
    setVal('pl-int', pl.intervencoes||''); setVal('pl-freq', pl.freq||'Semanal');
    setVal('pl-qty', pl.qtdSessoes||''); setVal('pl-rev', (pl.revisao||'').slice(0,10));
    setVal('pl-cid', pl.cid||''); setVal('pl-obs', pl.obs||'');
    var p = pats.find(function(x){ return x.id === pid; });
    var t = document.getElementById('m-plan-title');
    if(t) t.textContent = 'Plano — ' + (p ? p.nome : 'Paciente');
    M.open('m-plan');
  },
  save: async function(){
    var sel = document.getElementById('pron-sel'); var pid = sel ? sel.value : '';
    if(!pid){ Toast.show('Selecione um paciente.','err'); return; }
    var fields = {demanda:getVal('pl-dem'), objetivos:getVal('pl-obj'), intervencoes:getVal('pl-int'),
      freq:getVal('pl-freq'), qtdSessoes:getVal('pl-qty'), revisao:getVal('pl-rev')||null,
      cid:getVal('pl-cid'), obs:getVal('pl-obs')};
    try { await Api.put('/plans/' + pid, fields); } catch(e){ return; }
    Toast.show('Plano salvo!', 'ok'); M.close('m-plan');
  },
  exportPDF: async function(){
    var sel = document.getElementById('pron-sel'); var pid = sel ? sel.value : '';
    if(!pid){ Toast.show('Selecione um paciente.','err'); return; }
    if(typeof jspdf === 'undefined'){ Toast.show('jsPDF não carregada.','err'); return; }
    var p, pl;
    try {
      var r = await Promise.all([Api.get('/patients'), Api.get('/plans/' + pid)]);
      p = r[0].find(function(x){ return x.id === pid; }); pl = r[1] || {};
    } catch(e){ return; }
    if(!p) return;
    var doc = new jspdf.jsPDF({unit:'mm',format:'a4'});
    var y = PDF._header(doc, 18);
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,30,80);
    doc.text('PLANO TERAPÊUTICO INDIVIDUALIZADO', 105, y+4, {align:'center'}); y += 14;
    doc.setFontSize(8.5);
    [['Paciente',p.nome||'—','Nascimento',fmtDate(p.nasc)||'—'],['CID',pl.cid||'—','Frequência',pl.freq||'—'],['Previsão',(pl.qtdSessoes||'—')+' sessões','Revisão',fmtDate(pl.revisao)||'—']].forEach(function(row){
      doc.setFont('helvetica','bold');doc.setTextColor(60,60,60);doc.text(row[0]+':',20,y);doc.setFont('helvetica','normal');doc.setTextColor(30,30,30);doc.text(String(row[1]),52,y);
      doc.setFont('helvetica','bold');doc.setTextColor(60,60,60);doc.text(row[2]+':',115,y);doc.setFont('helvetica','normal');doc.setTextColor(30,30,30);doc.text(String(row[3]),148,y);y+=5.5;
    });
    y += 4;
    var sections = [['Demanda Principal',pl.demanda],['Objetivos Terapêuticos',pl.objetivos],['Intervenções Planejadas',pl.intervencoes],['Observações',pl.obs]];
    sections.forEach(function(s){
      if(!s[1]) return; y = PDF._checkPage(doc,y,16);
      doc.setFillColor(240,244,252);doc.rect(20,y-3.5,170,6.5,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(0,50,140);doc.text(s[0],22,y);y+=7;
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(30,30,30);
      doc.splitTextToSize(s[1],166).forEach(function(l){y=PDF._checkPage(doc,y,4.5);doc.text(l,22,y);y+=3.8;});y+=4;
    });
    PDF._footer(doc, SESSAO || {});
    doc.save('Plano_'+(p.nome||'').replace(/\s+/g,'_').slice(0,25)+'_'+isoToday()+'.pdf');
    logEvent('Exportação', 'PDF Plano "'+p.nome+'"', 'export');
    Toast.show('PDF do plano gerado!','ok');
  }
};

// cid-10 (transtornos mentais)
var CID = {
  _db: [
    'F00 Demência na doença de Alzheimer','F01 Demência vascular','F02 Demência em outras doenças',
    'F06 Outros transtornos mentais devidos a lesão cerebral','F07 Transtornos de personalidade devidos a doença',
    'F10 Transtornos por uso de álcool','F11 Transtornos por uso de opiáceos','F12 Transtornos por uso de canabinóides',
    'F13 Transtornos por uso de sedativos','F14 Transtornos por uso de cocaína','F15 Transtornos por uso de estimulantes',
    'F17 Transtornos por uso de tabaco','F19 Transtornos por uso de múltiplas drogas',
    'F20 Esquizofrenia','F21 Transtorno esquizotípico','F22 Transtornos delirantes persistentes',
    'F23 Transtornos psicóticos agudos e transitórios','F25 Transtornos esquizoafetivos',
    'F30 Episódio maníaco','F31 Transtorno afetivo bipolar','F32 Episódio depressivo',
    'F33 Transtorno depressivo recorrente','F34 Transtornos persistentes do humor','F34.1 Distimia',
    'F40 Transtornos fóbico-ansiosos','F40.0 Agorafobia','F40.1 Fobia social','F40.2 Fobias específicas',
    'F41 Outros transtornos ansiosos','F41.0 Transtorno de pânico','F41.1 Ansiedade generalizada',
    'F41.2 Transtorno misto ansioso-depressivo','F42 Transtorno obsessivo-compulsivo',
    'F43 Reações ao estresse grave','F43.0 Reação aguda ao estresse','F43.1 TEPT',
    'F43.2 Transtornos de adaptação','F44 Transtornos dissociativos','F45 Transtornos somatoformes',
    'F50 Transtornos alimentares','F50.0 Anorexia nervosa','F50.2 Bulimia nervosa',
    'F51 Transtornos do sono não-orgânicos','F52 Disfunção sexual não-orgânica',
    'F60 Transtornos específicos da personalidade','F60.0 Personalidade paranóica',
    'F60.1 Personalidade esquizóide','F60.2 Personalidade dissocial','F60.3 Personalidade borderline',
    'F60.4 Personalidade histriônica','F60.5 Personalidade anancástica','F60.6 Personalidade ansiosa',
    'F60.7 Personalidade dependente','F63 Transtornos de hábitos e impulsos',
    'F64 Transtornos de identidade de gênero','F65 Transtornos da preferência sexual',
    'F70 Retardo mental leve','F71 Retardo mental moderado',
    'F80 Transtornos do desenvolvimento da fala e linguagem',
    'F81 Transtornos do desenvolvimento das habilidades escolares','F81.0 Dislexia',
    'F84 Transtornos globais do desenvolvimento','F84.0 Autismo infantil','F84.5 Síndrome de Asperger',
    'F90 Transtornos hipercinéticos','F90.0 TDAH','F91 Distúrbios de conduta',
    'F92 Transtornos mistos de conduta e emoções','F93 Transtornos emocionais com início na infância',
    'F94 Transtornos do funcionamento social na infância','F95 Transtornos de tique','F95.2 Síndrome de Tourette',
    'F98 Outros transtornos com início na infância','F98.0 Enurese','F98.1 Encoprese',
    'F99 Transtorno mental não especificado'
  ],
  search: function(q){
    var drop = document.getElementById('cid-drop'); if(!drop) return;
    if(!q || q.length < 2){ drop.style.display = 'none'; return; }
    q = q.toLowerCase();
    var res = this._db.filter(function(c){ return c.toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    if(!res.length){ drop.style.display = 'none'; return; }
    drop.style.display = 'block';
    drop.innerHTML = res.map(function(c){
      return '<div style="padding:7px 12px;cursor:pointer;font-size:.78rem;color:var(--ink7);border-bottom:1px solid var(--bdr);transition:background .1s" onmouseover="this.style.background=\'var(--b0)\'" onmouseout="this.style.background=\'none\'" onclick="setVal(\'ms-cid\',\'' + c.replace(/'/g,"\\'") + '\');document.getElementById(\'cid-drop\').style.display=\'none\'">' + c + '</div>';
    }).join('');
  }
};
document.addEventListener('click', function(e){ var d=document.getElementById('cid-drop'); if(d && !e.target.closest('#ms-cid') && !e.target.closest('#cid-drop')) d.style.display='none'; });

// anamneses
var TMPL_DATA = [
  {key:'acolhimento', label:'Anamnese de Acolhimento Breve', roles:['recepcao','admin'],
   grad:'linear-gradient(135deg,#0066ff,#002299)',
   desc:'Plantão psicológico e primeiro contato. 8 seções clínicas estruturadas.',
   secs:[
    {t:'1. Identificação', fields:[{l:'Nome completo',id:'ac-nome',ph:'Nome do paciente'},{l:'Idade',id:'ac-idade',ph:'Ex: 32'},{l:'Profissão / Ocupação',id:'ac-prof',ph:'Ex: Professora, estudante…'},{l:'Estado civil',id:'ac-civil',type:'sel',opts:['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União estável']},{l:'Com quem mora',id:'ac-mora',ph:'Ex: Sozinho(a), com cônjuge e filhos…'},{l:'Encaminhado(a) por',id:'ac-enc',ph:'UBS, CAPS, espontâneo, escola…'}]},
    {t:'2. Motivo da busca', fields:[{l:'O que te trouxe aqui hoje?',id:'ac-motivo',type:'ta',ph:'Relato do paciente…'},{l:'Há quanto tempo percebe essa situação?',id:'ac-tempo',ph:'Ex: 3 meses…'},{l:'O que fez você procurar ajuda agora?',id:'ac-agora',type:'ta',ph:'Evento precipitante…'}]},
    {t:'3. Queixa principal', fields:[{l:'Como isso afeta seu dia a dia?',id:'ac-impacto',type:'ta',ph:'Trabalho, relacionamentos…'},{l:'Em quais situações ocorre mais?',id:'ac-situacoes',type:'ta',ph:'Contextos, gatilhos…'},{l:'Já aconteceu antes?',id:'ac-antes',type:'ta',ph:'Episódios anteriores…'}]},
    {t:'4. Estado emocional atual', fields:[{l:'Como está seu humor nos últimos dias?',id:'ac-humor',type:'ta',ph:'Triste, ansioso, irritado…'},{l:'Ansiedade, tristeza, irritação ou algo difícil de nomear?',id:'ac-afeto',type:'ta',ph:'Intensidade e frequência…'},{l:'Qualidade do sono',id:'ac-sono',type:'sel',opts:['Normal','Insônia para iniciar','Insônia de manutenção','Hipersonia','Pesadelos frequentes']},{l:'Apetite',id:'ac-apetite',type:'sel',opts:['Normal','Reduzido','Aumentado','Compulsão alimentar','Restrição severa']}]},
    {t:'5. Rede de apoio', fields:[{l:'Tem com quem conversar?',id:'ac-rede',type:'sel',opts:['Sim, boa rede','Apoio parcial','Não tenho','Prefiro não responder']},{l:'Pessoas mais próximas',id:'ac-proximos',type:'ta',ph:'Família, amigos, parceiro(a)…'}]},
    {t:'6. Histórico de saúde mental', fields:[{l:'Já fez acompanhamento psicológico/psiquiátrico?',id:'ac-hist',type:'sel',opts:['Não','Sim — psicológico','Sim — psiquiátrico','Sim — ambos']},{l:'Medicação psiquiátrica atual?',id:'ac-med',type:'sel',opts:['Não','Sim, prescrita','Automedicação']},{l:'Quais medicamentos?',id:'ac-medesc',ph:'Ex: Escitalopram 10mg…'}]},
    {t:'7. Avaliação ética de risco', fields:[{l:'Já pensou em desistir da vida ou se machucar?',id:'ac-risco',type:'sel',opts:['Não','Já pensei no passado','Sim, às vezes','Sim, com frequência','Prefiro não responder']},{l:'Está seguro(a) hoje?',id:'ac-seguro',type:'sel',opts:['Sim','Tenho dúvidas','Não me sinto seguro(a)']},{l:'Nível de risco avaliado',id:'ac-nivel-risco',type:'sel',opts:['Nenhum identificado','Baixo','Moderado','Alto','Iminente']}]},
    {t:'8. Expectativas e encaminhamento', fields:[{l:'O que espera deste acolhimento?',id:'ac-expect',type:'ta',ph:'Objetivos do paciente…'},{l:'Como posso te ajudar hoje?',id:'ac-ajuda',type:'ta',ph:'Demanda imediata…'},{l:'Encaminhamento proposto',id:'ac-encam',type:'sel',opts:['Fila — Psicoterapia','Encaminhamento — Psiquiatria','Urgência — Plantão','Encaminhamento — CAPS','Sem encaminhamento imediato']},{l:'Observações do profissional',id:'ac-obs',type:'ta',ph:'Impressões clínicas…'}]}
  ]},
  {key:'judiciario', label:'Formulário Judiciário — Vara da Infância e Juventude', roles:['recepcao','admin'],
   grad:'linear-gradient(135deg,#7a1010,#c0392b)',
   desc:'Encaminhamento de crianças e adolescentes pela Vara da Infância e Juventude.',
   secs:[
    {t:'1. Profissional responsável', fields:[{l:'Nome do profissional *',id:'jd-profnome',ph:'Nome completo'},{l:'Cargo / Função *',id:'jd-cargo',ph:'Ex: Assistente Social…'},{l:'E-mail institucional *',id:'jd-email',ph:'nome@orgao.gov.br'}]},
    {t:'2. Dados da criança / adolescente', fields:[{l:'Nome completo *',id:'jd-nome',ph:'Nome completo'},{l:'Data de nascimento *',id:'jd-nasc',type:'date'},{l:'Endereço completo *',id:'jd-end',ph:'Rua, número, bairro, cidade'},{l:'Sexo',id:'jd-sexo',type:'sel',opts:['Masculino','Feminino','Outro / Não informado']},{l:'Telefone *',id:'jd-tel',ph:'(82) 99999-9999'}]},
    {t:'3. Responsável legal', fields:[{l:'Nome completo *',id:'jd-respnome',ph:'Nome completo'},{l:'Parentesco *',id:'jd-parentes',ph:'Ex: Mãe, Pai, Avó…'},{l:'Endereço (se diferente)',id:'jd-respend',ph:'Endereço completo'},{l:'Telefone (se diferente)',id:'jd-resptel',ph:'(82) 99999-9999'}]},
    {t:'4. Tipo de demanda', fields:[{l:'Marque as que se aplicam',id:'jd-demandas',type:'chk',opts:['Violência Física','Violência Psicológica','Violência Sexual','Negligência','Conflitos Familiares','Vulnerabilidade Social','Outros']}]},
    {t:'5. Contexto e situação', fields:[{l:'Descrição do contexto *',id:'jd-descr',type:'ta',ph:'Descreva sucintamente a situação…'},{l:'Situação atual de proteção',id:'jd-protecao',type:'sel',opts:['Com responsável legal','Guarda provisória','Acolhimento institucional','Medida protetiva','Outra']},{l:'Urgência *',id:'jd-urgencia',type:'sel',opts:['Alta — atendimento prioritário','Moderada','Sem urgência']},{l:'Autorização para contato',id:'jd-autorizacao',type:'sel',opts:['Sim — autorizo','Não — não autorizo']},{l:'Informações adicionais',id:'jd-obs',type:'ta',ph:'Outras informações relevantes…'}]}
  ]},
  {key:'adulto', label:'Ficha de Anamnese Psicológica — Adulto', roles:['estagiario','psicologo','professor','admin'],
   grad:'linear-gradient(135deg,#0f5c2e,#22a050)',
   desc:'Avaliação clínica completa de adultos: identificação, histórico, saúde e diagnóstico.',
   secs:[
    {t:'1. Identificação', fields:[{l:'Nome completo',id:'ad-nome',ph:'Nome completo'},{l:'Data de nascimento',id:'ad-nasc',type:'date'},{l:'Profissão / Ocupação',id:'ad-prof',ph:'Profissão atual'},{l:'Estado civil',id:'ad-civil',type:'sel',opts:['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União estável','Separado(a)']},{l:'Telefone',id:'ad-tel',ph:'(82) 99999-9999'},{l:'Com quem mora?',id:'ad-mora',ph:'Composição do domicílio'}]},
    {t:'2. Motivo da busca', fields:[{l:'O que te trouxe para o atendimento?',id:'ad-motivo',type:'ta',ph:'Nas próprias palavras do paciente…'},{l:'Há quanto tempo isso ocorre?',id:'ad-tempo',ph:'Ex: 6 meses…'},{l:'Por que buscou ajuda agora?',id:'ad-agora',type:'ta',ph:'Evento precipitante…'},{l:'Expectativa em relação ao tratamento',id:'ad-expect',type:'ta',ph:'O que espera alcançar?'}]},
    {t:'3. História da queixa', fields:[{l:'Quando começou?',id:'ad-inicio',ph:'Data aproximada'},{l:'Situações frequentes',id:'ad-situacoes',type:'ta',ph:'Contextos, gatilhos…'},{l:'Já aconteceu antes?',id:'ad-antes',type:'ta',ph:'Episódios anteriores…'},{l:'Tratamentos anteriores',id:'ad-trat',type:'ta',ph:'Psicoterapias, medicamentos…'}]},
    {t:'4. Estado emocional atual', fields:[{l:'Humor',id:'ad-humor',type:'ta',ph:'Triste, ansioso, irritado…'},{l:'Ansiedade, tristeza, irritação',id:'ad-afeto',type:'ta',ph:'Intensidade…'},{l:'Sono',id:'ad-sono',type:'sel',opts:['Normal','Insônia de início','Insônia de manutenção','Hipersonia','Pesadelos']},{l:'Apetite',id:'ad-apetite',type:'sel',opts:['Normal','Reduzido','Aumentado','Compulsão','Restrição severa']}]},
    {t:'5. Rede de apoio', fields:[{l:'Pessoas importantes',id:'ad-pessoas',type:'ta',ph:'Família, amigos…'},{l:'Com quem pode contar',id:'ad-apoio',type:'ta',ph:'Rede de suporte…'}]},
    {t:'6. Histórico de saúde mental', fields:[{l:'Já fez terapia?',id:'ad-terapia',type:'sel',opts:['Não','Sim, sem tratamento atual','Sim, com tratamento atual']},{l:'Uso de medicação',id:'ad-med',ph:'Nome, dosagem e prescritor'},{l:'Acompanhamento psiquiátrico',id:'ad-psiq',type:'sel',opts:['Não','Sim, atualmente','Sim, no passado']}]},
    {t:'7. Avaliação de risco', fields:[{l:'Pensamentos de autoagressão ou morte',id:'ad-risco',type:'sel',opts:['Não','Ideação passiva','Ideação ativa sem plano','Ideação ativa com plano','Tentativa recente']},{l:'Situação de segurança',id:'ad-segur',type:'ta',ph:'Avaliação do contexto…'}]},
    {t:'8. Expectativas', fields:[{l:'O que espera do atendimento?',id:'ad-expectativa',type:'ta',ph:'Objetivos terapêuticos…'},{l:'Objetivos pessoais',id:'ad-objetivos',type:'ta',ph:'O que deseja alcançar…'}]}
  ]},
  {key:'consentimento', label:'Termo de Consentimento — TCLE', roles:['recepcao','admin'],
   grad:'linear-gradient(135deg,#4a2a80,#7a52c0)',
   desc:'Consentimento informado para atendimento na Clínica Escola CESMAC.',
   secs:[
    {t:'Dados do Paciente', fields:[{l:'Nome completo *',id:'tc-nome',ph:'Nome completo'},{l:'CPF *',id:'tc-cpf',ph:'000.000.000-00'},{l:'Data de nascimento *',id:'tc-nasc',type:'date'},{l:'Responsável legal (se menor)',id:'tc-resp',ph:'Nome do responsável'},{l:'CPF do responsável',id:'tc-cpf-r',ph:'Se aplicável'}]},
    {t:'Declaração de Consentimento', fields:[
      {l:'TERMO',id:'_tc',type:'info',text:'Declaro que fui devidamente informado(a) sobre o processo psicoterápico, bem como sobre o caráter didático do atendimento realizado na Clínica Escola de Psicologia do CESMAC do Agreste, sob supervisão de psicólogo(a) habilitado(a) e registrado(a) no CRP. Autorizo a realização das sessões, podendo haver gravação de áudio/vídeo exclusivamente para supervisão acadêmica, com garantia de sigilo de identidade. Estou ciente do meu direito de interromper o tratamento a qualquer momento, sem prejuízo, e que meus dados estão protegidos pela LGPD (Lei 13.709/2018) e pelo Código de Ética Profissional do Psicólogo (CFP, Resolução 10/2005).'},
      {l:'Aceite eletrônico *',id:'tc-aceite',type:'sel',opts:['— Selecione —','Confirmo meu consentimento livre e esclarecido','Não consinto neste momento']},
      {l:'Data do aceite *',id:'tc-data',type:'date'}
    ]}
  ]},
  {key:'risco', label:'Protocolo de Avaliação de Risco', roles:['estagiario','psicologo','professor','admin'],
   grad:'linear-gradient(135deg,#0a6070,#22a8c0)',
   desc:'Protocolo para avaliação de ideação suicida e situações de crise.',
   secs:[
    {t:'Identificação', fields:[{l:'Nome do paciente',id:'ri-nome',ph:'Nome completo'},{l:'Data',id:'ri-data',type:'date'},{l:'Profissional',id:'ri-prof',ph:'Nome e CRP'}]},
    {t:'Avaliação de Ideação Suicida', fields:[{l:'Ideação suicida',id:'ri-ideia',type:'sel',opts:['Não','Passiva — desejo de morte sem plano','Ativa — sem plano','Ativa — com plano']},{l:'Tentativas anteriores',id:'ri-tent',type:'sel',opts:['Não','Sim — 1','Sim — 2 a 3','Sim — mais de 3']},{l:'Acesso a meios letais',id:'ri-meios',type:'sel',opts:['Não identificado','Sim — medicamentos','Sim — arma','Sim — outros']},{l:'Intenção de agir',id:'ri-intent',type:'sel',opts:['Não','Indefinida','Sim, em breve','Sim, imediata']}]},
    {t:'Fatores de Risco e Proteção', fields:[{l:'Fatores de risco',id:'ri-fat',type:'ta',ph:'Isolamento, perdas, substâncias…'},{l:'Fatores de proteção',id:'ri-prot',type:'ta',ph:'Rede de apoio, filhos, religião…'},{l:'Nível de risco',id:'ri-nivel',type:'sel',opts:['Baixo','Moderado','Alto','Iminente — hospitalização']},{l:'Conduta adotada',id:'ri-conduta',type:'ta',ph:'Plano de segurança, contatos…'}]}
  ]}
];

var Ana = {
  _key: '',
  renderTmpls: function(){
    var el = document.getElementById('tmpls'); if(!el) return;
    var role = SESSAO ? SESSAO.role : '';
    var avail = TMPL_DATA.filter(function(t){ return !t.roles || t.roles.indexOf(role) >= 0; });
    if(!avail.length){ el.innerHTML = '<div class="es"><div class="esico"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></div><h3>Sem formulários disponíveis</h3><p>Seu perfil não possui formulários de anamnese atribuídos.</p></div>'; return; }
    el.innerHTML = avail.map(function(t){
      return '<div class="tmpl"><div class="tmplbnr" style="background:'+t.grad+'"><svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/></svg></div>'
        + '<div class="tmplbody"><div class="tmpltitle">'+esc(t.label)+'</div><div class="tmpldesc">'+esc(t.desc)+'</div>'
        + '<button class="btn btn-p btn-sm btn-w" data-key="'+esc(t.key)+'" onclick="Ana.open(this.getAttribute(\'data-key\'))">Preencher formulário</button></div></div>';
    }).join('');
  },
  open: function(key){
    var t = TMPL_DATA.find(function(x){ return x.key === key; }); if(!t) return;
    var role = SESSAO ? SESSAO.role : '';
    if(t.roles && t.roles.indexOf(role) < 0){ logEvent('Acesso bloqueado','Formulário: '+t.label,'seguranca'); Toast.show('Acesso não autorizado.','err'); return; }
    this._key = key;
    var titleEl = document.getElementById('ana-title'); if(titleEl) titleEl.textContent = t.label;
    _syncSelects();
    var html = '';
    t.secs.forEach(function(sec){
      html += '<div class="asec"><div class="asech" onclick="Ana._toggle(this)"><div class="asectitle">'+esc(sec.t)+'</div></div><div class="asecbody"><div class="g2">';
      sec.fields.forEach(function(f){
        if(f.type === 'info'){
          html += '<div class="gc" style="background:var(--b0);border:1px solid var(--b2);border-radius:var(--r8);padding:12px;font-size:.78rem;color:var(--ink6);line-height:1.75">' + esc(f.text) + '</div>';
          return;
        }
        if(f.type === 'chk'){
          html += '<div class="fg gc"><label class="fl">'+esc(f.l)+'</label><div class="chk-row">'
            + (f.opts||[]).map(function(o){ return '<label class="chk-item"><input type="checkbox" name="'+f.id+'" value="'+esc(o)+'"> '+esc(o)+'</label>'; }).join('')
            + '</div></div>';
          return;
        }
        var full = f.type === 'ta';
        html += '<div class="fg'+(full?' gc':'')+'"><label class="fl">'+esc(f.l)+'</label>';
        if(f.type === 'ta')      html += '<textarea id="'+f.id+'" class="fi" placeholder="'+esc(f.ph||'')+'" maxlength="2000"></textarea>';
        else if(f.type === 'sel')html += '<select id="'+f.id+'" class="fi fsel">'+(f.opts||[]).map(function(o){return'<option>'+esc(o)+'</option>';}).join('')+'</select>';
        else                     html += '<input type="'+(f.type||'text')+'" id="'+f.id+'" class="fi" placeholder="'+esc(f.ph||'')+'" '+(f.type==='date'?'':'maxlength="120"')+'>';
        html += '</div>';
      });
      html += '</div></div></div>';
    });
    var ab = document.getElementById('ana-body'); if(ab) ab.innerHTML = html;
    M.open('m-ana');
  },
  _toggle: function(hdr){ var sec = hdr.closest('.asec'); if(sec) sec.classList.toggle('col'); },
  _collect: function(){
    var t = TMPL_DATA.find(function(x){ return x.key === this._key; }, this); if(!t) return {};
    var data = {};
    t.secs.forEach(function(sec){
      sec.fields.forEach(function(f){
        if(f.type === 'info') return;
        if(f.type === 'chk'){
          var checked = [];
          document.querySelectorAll('input[name="'+f.id+'"]:checked').forEach(function(cb){ checked.push(cb.value); });
          data[f.id] = checked.join(', ');
        } else {
          var el = document.getElementById(f.id);
          data[f.id] = el ? el.value : '';
        }
      });
    });
    return data;
  },
  _toText: function(){
    var t = TMPL_DATA.find(function(x){ return x.key === this._key; }, this); if(!t) return '';
    var txt = t.label + '\nClínica Escola de Psicologia CESMAC · Arapiraca, AL\n' + new Date().toLocaleDateString('pt-BR') + '\n' + '═'.repeat(50) + '\n\n';
    t.secs.forEach(function(sec){
      txt += sec.t + '\n' + '─'.repeat(30) + '\n';
      sec.fields.forEach(function(f){
        if(f.type === 'info') return;
        if(f.type === 'chk'){
          var checked = [];
          document.querySelectorAll('input[name="'+f.id+'"]:checked').forEach(function(cb){ checked.push(cb.value); });
          txt += '  ' + f.l + ': ' + (checked.join(', ') || '—') + '\n';
        } else {
          var el = document.getElementById(f.id);
          txt += '  ' + f.l + ': ' + (el && el.value ? el.value : '—') + '\n';
        }
      });
      txt += '\n';
    });
    return txt;
  },
  save: async function(){
    var t = TMPL_DATA.find(function(x){ return x.key === this._key; }, this); if(!t) return;
    var pac = getVal('ana-pac');
    if(!pac && !confirm('Nenhum paciente selecionado.\nA anamnese não aparecerá em nenhum prontuário.\nSalvar mesmo assim?')) return;
    try {
      await Api.post('/anamneses', {pacienteId: pac || null, tipo: this._key, label: t.label, content: this._toText(), raw: this._collect()});
    } catch(e){ return; }
    M.close('m-ana');
    Toast.show('Anamnese "'+t.label+'" salva!', 'ok');
    var sel = document.getElementById('pron-sel'); if(sel && sel.value===pac && pac) Rec.load(pac);
  },
  txt: function(){
    var t = TMPL_DATA.find(function(x){ return x.key === this._key; }, this);
    _download('anamnese_'+(t?t.key:this._key)+'_'+isoToday()+'.txt', this._toText(), 'text/plain');
    logEvent('Exportação', 'Anamnese "'+(t?t.label:this._key)+'"', 'export');
    Toast.show('Exportado!', 'ok');
  },
  wa: function(){ window.open('https://wa.me/?text=' + encodeURIComponent(this._toText()), '_blank', 'noopener,noreferrer'); }
};

// lgpd — consentimentos
var LGPD = {
  TIPOS: {atend:'Atendimento clínico', dados:'Tratamento de dados', grav:'Gravação de sessão', pesq:'Pesquisa acadêmica'},
  status: function(p){
    var c = p.consentimentos || [];
    var atend = c.some(function(x){ return x.tipo === 'atend' && x.aceito; });
    var dados = c.some(function(x){ return x.tipo === 'dados' && x.aceito; });
    if(atend && dados) return {ok:true, label:'LGPD OK', cls:'bg'};
    if(atend || dados) return {ok:false, label:'LGPD Parcial', cls:'bo'};
    return {ok:false, label:'Sem consentimento', cls:'br'};
  },
  chip: function(p){
    var s = this.status(p);
    return '<span class="bdg ' + s.cls + '" style="font-size:.58rem">' + s.label + '</span>';
  }
};

// lembretes — whatsapp
var Lembrete = {
  render: async function(){
    var card = document.getElementById('dash-lembretes');
    var list = document.getElementById('dash-lembretes-list');
    if(!card || !list) return;
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var tStr = tomorrow.toISOString().slice(0,10);
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0].filter(function(a){ return a.data === tStr && a.status === 'agendado'; }); pats = r[1];
    } catch(e){ return; }
    if(!appts.length){ card.style.display = 'none'; return; }
    card.style.display = '';
    list.innerHTML = appts.sort(function(a,b){ return a.hora.localeCompare(b.hora); }).map(function(a){
      var p = pats.find(function(x){ return x.id === a.pacienteId; });
      var nome = p ? p.nome : 'Paciente removido';
      var tel = p && p.tel ? p.tel.replace(/\D/g,'') : '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bdr)">'
        + avHtml(p, 26, '.6rem')
        + '<div style="flex:1;min-width:0"><div style="font-size:.8rem;font-weight:600;color:var(--ink)">' + esc(nome) + '</div>'
        + '<div style="font-size:.68rem;color:var(--ink4)">' + esc(a.hora) + (a.sala ? ' · ' + esc(a.sala) : '') + '</div></div>'
        + (tel ? '<button class="btn btn-wa btn-xs" onclick="Lembrete.enviar(\'' + esc(a.id) + '\')"><svg viewBox="0 0 24 24" style="width:11px;height:11px;fill:currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/></svg>Lembrar</button>' : '<span class="bdg bn" style="font-size:.58rem">Sem tel</span>')
        + '</div>';
    }).join('');
  },
  enviar: async function(apptId){
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0]; pats = r[1];
    } catch(e){ return; }
    var a = appts.find(function(x){ return x.id === apptId; }); if(!a) return;
    var p = pats.find(function(x){ return x.id === a.pacienteId; }); if(!p||!p.tel) return;
    var tel = p.tel.replace(/\D/g,'');
    if(tel.length <= 10) tel = '55' + tel;
    var msg = '*Clínica Escola de Psicologia CESMAC*\n\nOlá, ' + p.nome.split(' ')[0] + '! \n\nLembramos da sua consulta amanhã:\n📅 ' + fmtDate(a.data) + ' às ' + a.hora + (a.sala ? '\n🏥 ' + a.sala : '') + '\n\nCaso precise remarcar, entre em contato.\nAguardamos você! 😊';
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
    logEvent('Lembrete WhatsApp', '"' + p.nome + '" — ' + fmtDate(a.data) + ' às ' + a.hora, 'paciente');
    Toast.show('Lembrete enviado para ' + p.nome.split(' ')[0] + '!', 'ok');
  },
  enviarTodos: async function(){
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var tStr = tomorrow.toISOString().slice(0,10);
    var appts, pats;
    try {
      var r = await Promise.all([Api.get('/appts'), Api.get('/patients')]);
      appts = r[0].filter(function(a){ return a.data === tStr && a.status === 'agendado'; }); pats = r[1];
    } catch(e){ return; }
    var sent = 0;
    appts.forEach(function(a){
      var p = pats.find(function(x){ return x.id === a.pacienteId; });
      if(p && p.tel){
        setTimeout(function(){ Lembrete.enviar(a.id); }, sent * 1500);
        sent++;
      }
    });
    if(sent === 0) Toast.show('Nenhum paciente com telefone para amanhã.', 'inf');
    else Toast.show(sent + ' lembrete(s) sendo enviado(s)...', 'ok');
  }
};

// relatórios pdf
var PDF = {
  _header: function(doc, y){
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(0,40,120);
    doc.text('CLÍNICA ESCOLA DE PSICOLOGIA', 105, y, {align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(80,80,80);
    doc.text('CESMAC do Agreste · Arapiraca, AL', 105, y+5.5, {align:'center'});
    doc.setDrawColor(0,102,255); doc.setLineWidth(0.6);
    doc.line(20, y+9, 190, y+9);
    return y + 15;
  },
  _footer: function(doc, sess){
    var pn = doc.getNumberOfPages();
    for(var i = 1; i <= pn; i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(140,140,140);
      doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + ' por ' + (sess.nome||'—') + ' · PsiCESMAC', 105, 290, {align:'center'});
      doc.text('Confidencial · LGPD (Lei 13.709/2018) · CFP Res. 10/2005', 105, 294, {align:'center'});
      doc.text('Página ' + i + '/' + pn, 190, 290, {align:'right'});
    }
  },
  _checkPage: function(doc, y, need){
    if(y + need > 275){ doc.addPage(); return 22; }
    return y;
  },
  evolucao: async function(){
    var selEl = document.getElementById('pron-sel');
    var pid = selEl ? selEl.value : '';
    if(!pid){ Toast.show('Selecione um paciente primeiro.','err'); return; }
    if(typeof jspdf === 'undefined'){ Toast.show('Biblioteca jsPDF não carregada.','err'); return; }
    var pats, sessions, anas;
    try {
      var r = await Promise.all([Api.get('/patients'), Api.get('/sessions?pacienteId='+encodeURIComponent(pid)), Api.get('/anamneses?pacienteId='+encodeURIComponent(pid))]);
      pats = r[0]; sessions = r[1].sort(function(a,b){ return a.data.localeCompare(b.data); }); anas = r[2];
    } catch(e){ return; }
    var p = pats.find(function(x){ return x.id === pid; });
    if(!p){ Toast.show('Paciente não encontrado.','err'); return; }
    var doc = new jspdf.jsPDF({unit:'mm', format:'a4'});
    var y = this._header(doc, 18);
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,30,80);
    doc.text('RELATÓRIO DE EVOLUÇÃO CLÍNICA', 105, y+4, {align:'center'});
    y += 12;
    var age = fmtAge(p.nasc);
    var info = [
      ['Paciente', p.nome||'—', 'CPF', p.cpf||'—'],
      ['Nascimento', fmtDate(p.nasc)||'—', 'Idade', age !== null ? age + ' anos' : '—'],
      ['Modalidade', p.mod||'—', 'Prioridade', (p.prio||'—').charAt(0).toUpperCase()+(p.prio||'').slice(1)],
      ['Encaminhamento', p.enc||'—', 'Status', p.status||'—']
    ];
    doc.setFontSize(8.5);
    info.forEach(function(row){
      y = PDF._checkPage(doc, y, 6);
      doc.setFont('helvetica','bold'); doc.setTextColor(60,60,60);
      doc.text(row[0] + ':', 20, y);
      doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
      doc.text(String(row[1]), 52, y);
      doc.setFont('helvetica','bold'); doc.setTextColor(60,60,60);
      doc.text(row[2] + ':', 115, y);
      doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
      doc.text(String(row[3]), 142, y);
      y += 5.5;
    });
    if(p.queixa){
      y += 2;
      y = PDF._checkPage(doc, y, 14);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(60,60,60);
      doc.text('Queixa Principal:', 20, y); y += 4.5;
      doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
      var qlines = doc.splitTextToSize(p.queixa, 170);
      qlines.forEach(function(l){ y = PDF._checkPage(doc, y, 5); doc.text(l, 20, y); y += 4.2; });
    }
    y += 4;
    doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.line(20, y, 190, y); y += 6;
    y = PDF._checkPage(doc, y, 10);
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,40,120);
    doc.text('HISTÓRICO DE SESSÕES (' + sessions.length + ')', 20, y); y += 7;
    if(!sessions.length){
      doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(120,120,120);
      doc.text('Nenhuma evolução registrada.', 20, y); y += 6;
    }
    sessions.forEach(function(s){
      y = PDF._checkPage(doc, y, 25);
      doc.setFillColor(240,244,252); doc.rect(20, y-3.5, 170, 6.5, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(0,50,140);
      var hdr = 'Sessão ' + (s.num||'—') + '  ·  ' + fmtDate(s.data) + '  ·  ' + (s.tipo||'Atendimento') + '  ·  Humor: ' + (s.humor||3) + '/5';
      doc.text(hdr, 22, y); y += 7;
      if(s.res){
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(30,30,30);
        var rlines = doc.splitTextToSize(s.res, 166);
        rlines.forEach(function(l){ y = PDF._checkPage(doc, y, 4.5); doc.text(l, 22, y); y += 3.8; });
      }
      if(s.plano){
        y = PDF._checkPage(doc, y, 6);
        doc.setFont('helvetica','bold'); doc.setTextColor(0,80,50);
        doc.text('Plano:', 22, y);
        doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
        var plines = doc.splitTextToSize(s.plano, 155);
        plines.forEach(function(l, j){ if(j===0) doc.text(l, 38, y); else { y+=3.8; doc.text(l, 22, y); } y += 3.8; });
      }
      if(s.cid){
        y = PDF._checkPage(doc, y, 5);
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(100,100,100);
        doc.text('CID/DSM: ' + s.cid, 22, y); y += 4;
      }
      y += 4;
    });
    if(anas.length){
      y += 2; y = PDF._checkPage(doc, y, 14);
      doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.line(20, y, 190, y); y += 6;
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,40,120);
      doc.text('ANAMNESES (' + anas.length + ')', 20, y); y += 6;
      doc.setFontSize(8.5);
      anas.forEach(function(a){
        y = PDF._checkPage(doc, y, 5);
        doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
        doc.text('• ' + (a.label||a.tipo||'Anamnese') + '  —  ' + fmtDate(a.createdAt), 22, y);
        y += 5;
      });
    }
    this._footer(doc, SESSAO || {});
    var fname = 'Evolucao_' + (p.nome||'').replace(/\s+/g,'_').slice(0,30) + '_' + isoToday() + '.pdf';
    doc.save(fname);
    logEvent('Exportação', 'PDF Evolução "' + p.nome + '" (' + sessions.length + ' sessões)', 'export');
    Toast.show('PDF gerado: ' + fname, 'ok');
  }
};

// backup — copia de seguranca adicional (os dados vivem no Postgres;
// isto so exporta um retrato do momento, exclusivo do admin)
var Backup = {
  exportAll: async function(){
    if(!SESSAO || SESSAO.role !== 'admin'){ Toast.show('Acesso restrito ao Administrador.', 'err'); return; }
    var data = {};
    try {
      var r = await Promise.all(['patients','sessions','appts','anamneses','finance','vinculos'].map(function(k){
        return Api.get('/' + k).catch(function(){ return []; });
      }));
      ['patients','sessions','appts','anamneses','finance','vinculos'].forEach(function(k, i){ data[k] = r[i]; });
    } catch(e){ return; }
    var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'psicesmac_backup_' + isoToday() + '.json';
    a.click(); URL.revokeObjectURL(a.href);
    logEvent('Exportação', 'Backup JSON', 'export');
    Toast.show('Backup exportado!', 'ok');
  }
};

// máscaras de entrada
var Mask = {
  cpf: function(el){
    var v = el.value.replace(/\D/g,'').slice(0,11);
    if(v.length>9)v=v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,'$1.$2.$3-$4');
    else if(v.length>6)v=v.replace(/(\d{3})(\d{3})(\d{1,3})/,'$1.$2.$3');
    else if(v.length>3)v=v.replace(/(\d{3})(\d{1,3})/,'$1.$2');
    el.value=v;
  },
  validaCPF: function(el){
    var c=el.value.replace(/\D/g,'');
    if(!c||c.length<11){el.classList.remove('bad');return;}
    if(/^(\d)\1{10}$/.test(c)){el.classList.add('bad');return;}
    var s=0;for(var i=1;i<=9;i++)s+=parseInt(c[i-1])*(11-i);
    var r=(s*10)%11;if(r>=10)r=0;if(r!==parseInt(c[9])){el.classList.add('bad');return;}
    s=0;for(var j=1;j<=10;j++)s+=parseInt(c[j-1])*(12-j);
    r=(s*10)%11;if(r>=10)r=0;
    el.classList.toggle('bad',r!==parseInt(c[10]));
  },
  tel: function(el){
    var v=el.value.replace(/\D/g,'').slice(0,11);
    if(v.length>6)v=v.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
    else if(v.length>2)v=v.replace(/(\d{2})(\d{0,5})/,'($1) $2');
    el.value=v;
  },
  email: function(el){
    var v=el.value.trim();if(!v){el.classList.remove('bad');return;}
    el.classList.toggle('bad',!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));
  }
};

// atalhos de teclado
document.addEventListener('keydown', function(e){
  if(!document.getElementById('app').classList.contains('on')) return;
  if((e.ctrlKey || e.metaKey) && e.key === 'k'){ e.preventDefault(); var gs = document.getElementById('gsearch'); if(gs) gs.focus(); }
  if(e.key === 'Escape') M.closeAll();
});

window.addEventListener('beforeunload',function(e){if(M._dirty&&document.querySelector('.mbg.on')){e.preventDefault();e.returnValue='';}});

(function(){function _ob(on){var b=document.getElementById('offline-bar');if(b)b.classList.toggle('on',!on);}window.addEventListener('online',function(){_ob(true);Toast.show('Conexao restaurada.','ok');});window.addEventListener('offline',function(){_ob(false);});if(!navigator.onLine)_ob(false);})();

// inicialização
window.onerror = function(msg, src, line){ console.warn('Erro:', msg, 'L'+line); return true; };
window.addEventListener('unhandledrejection', function(e){ console.warn('Promise:', e.reason); e.preventDefault(); });

document.addEventListener('DOMContentLoaded', function(){
  (function(){
    var m={name:'PsiCESMAC — Gestão Clínica',short_name:'PsiCESMAC',start_url:location.href.split('?')[0],display:'standalone',background_color:'#ffffff',theme_color:'#0066ff',icons:[{src:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%230066ff"/><text x="32" y="43" text-anchor="middle" font-size="28" font-family="sans-serif" font-weight="bold" fill="white">P</text></svg>',sizes:'any',type:'image/svg+xml'}]};
    var l=document.querySelector('link[rel=manifest]');if(l)l.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:'application/json'}));
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistrations().then(function(regs){ regs.forEach(function(r){ r.unregister(); }); });
      caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); });
    }
  })();
  _updateLoginStats();
  Auth.restore();
});
