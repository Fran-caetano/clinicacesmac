const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// garante que req.params.id (ou outro nome de parametro) e' um UUID valido
// antes de chegar numa query - sem isso, um id mal formado (texto qualquer)
// cai direto numa query parametrizada contra uma coluna UUID e o Postgres
// derruba um erro de tipo que, sem tratamento, vira erro 500 pro cliente
function validarId(param = 'id') {
  return (req, res, next) => {
    if (!UUID_REGEX.test(req.params[param] || '')) {
      return res.status(400).json({ erro: 'Identificador inválido.' });
    }
    next();
  };
}

module.exports = { validarId, UUID_REGEX };
