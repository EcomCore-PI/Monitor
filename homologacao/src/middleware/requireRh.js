const sessaoService = require("../services/sessaoService");

module.exports = function requireRh(req, res, next) {
    const cabecalho = req.get("authorization") || "";
    const correspondencia = cabecalho.match(/^Bearer\s+(.+)$/i);
    const usuario = correspondencia && sessaoService.validar(correspondencia[1]);
    if (!usuario || usuario.cargo !== "rh") {
        return res.status(401).send("Sessão RH inválida ou expirada. Entre novamente.");
    }
    const empresaSolicitada = req.body && req.body.fk_empresaServer;
    if (empresaSolicitada && Number(empresaSolicitada) !== Number(usuario.fk_empresa)) {
        return res.status(403).send("Acesso permitido somente à sua empresa.");
    }
    req.usuarioSessao = usuario;
    next();
};
