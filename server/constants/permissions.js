// espelha o PERMISSIONS do app.js - mantido em sincronia manualmente
// aqui e' que o controle de acesso passa a valer de verdade, porque o
// frontend nao tem como burlar uma checagem que roda no servidor

const PAGINAS = {
  admin:      ['dashboard', 'agenda', 'pacientes', 'prontuarios', 'anamnese', 'financeiro', 'auditoria', 'admin', 'supervisao', 'perfil', 'config'],
  recepcao:   ['dashboard', 'agenda', 'pacientes', 'anamnese'],
  estagiario: ['dashboard', 'prontuarios', 'anamnese'],
  professor:  ['dashboard', 'prontuarios', 'anamnese', 'supervisao'],
  psicologo:  ['dashboard', 'agenda', 'pacientes', 'prontuarios', 'anamnese', 'perfil']
};

const PODE_DELETAR_PACIENTE = ['admin', 'psicologo'];

// espelha os "roles" de cada formulario em TMPL_DATA (app.js) - quem pode
// registrar cada tipo de anamnese
const TIPOS_ANAMNESE = {
  acolhimento:    ['recepcao', 'admin'],
  judiciario:     ['recepcao', 'admin'],
  adulto:         ['estagiario', 'psicologo', 'professor', 'admin'],
  consentimento:  ['recepcao', 'admin'],
  risco:          ['estagiario', 'psicologo', 'professor', 'admin']
};

function temAcessoPagina(role, pagina) {
  return (PAGINAS[role] || []).includes(pagina);
}

module.exports = { PAGINAS, PODE_DELETAR_PACIENTE, TIPOS_ANAMNESE, temAcessoPagina };
