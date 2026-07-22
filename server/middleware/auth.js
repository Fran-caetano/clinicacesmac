function exigirLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ erro: 'Faça login para continuar.' });
  }
  next();
}

function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ erro: 'Faça login para continuar.' });
    }
    if (!papeis.includes(req.session.user.role)) {
      return res.status(403).json({ erro: 'Acesso não autorizado para o seu perfil.' });
    }
    next();
  };
}

module.exports = { exigirLogin, exigirPapel };
