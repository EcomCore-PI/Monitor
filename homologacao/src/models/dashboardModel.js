var database = require("../database/config.js")

// A tabela "dashboard" não existe mais: cada dashboard é um servidor.
// Mantive os nomes das funções para não quebrar quem as importar.

function inserirDash(nome, fk_empresa, fk_local) {
    return database.executar(
        `INSERT INTO servidor (nome, fk_empresa, fk_local) VALUES (?, ?, ?)`,
        [nome, fk_empresa, fk_local]
    );
}

function buscarDashId(id) {
    return database.executar(`SELECT * FROM servidor WHERE id = ?`, [id]);
}

function listarPorEmpresa(fk_empresa) {
    return database.executar(`SELECT * FROM servidor WHERE fk_empresa = ?`, [fk_empresa]);
}

module.exports = { inserirDash, buscarDashId, listarPorEmpresa };