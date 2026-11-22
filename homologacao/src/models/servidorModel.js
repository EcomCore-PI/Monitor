var database = require("../database/config.js")

function buscarServidorId(id) {
    return database.executar(`SELECT * FROM servidor WHERE id = ?`, [id]);
}

// fk_local é obrigatório e precisa existir em local_empresa para a MESMA empresa (FK composta)
function inserirServidor(nome, fk_empresa, fk_local) {
    return database.executar(
        `INSERT INTO servidor (nome, fk_empresa, fk_local) VALUES (?, ?, ?)`,
        [nome, fk_empresa, fk_local]
    );
}

function listarPorEmpresa(fk_empresa) {
    return database.executar(`SELECT * FROM servidor WHERE fk_empresa = ?`, [fk_empresa]);
}

function excluirDash(id) {
    return database.executar(`DELETE FROM servidor WHERE id = ?`, [id]);
}

// Capturas acima de um valor para um componente de um servidor
function aviso(nome, id, valor) {
    var instrucaoSql = `
        SELECT e.nome_fantasia, s.nome AS servidor, cap.valor
        FROM empresa e
        JOIN servidor s ON e.id = s.fk_empresa
        JOIN componente c ON c.fk_servidor = s.id
        JOIN captura cap ON cap.fk_componente = c.id
        WHERE c.nome = ? AND s.id = ? AND cap.valor > ?;
    `;
    return database.executar(instrucaoSql, [nome, id, valor]);
}

function buscarDashComEmpresa(id) {
    var instrucaoSql = `
        SELECT s.id, e.nome_fantasia
        FROM servidor s
        JOIN empresa e ON e.id = s.fk_empresa
        WHERE s.id = ?;
    `;
    return database.executar(instrucaoSql, [id]);
}

module.exports = { buscarServidorId, inserirServidor, listarPorEmpresa, excluirDash, buscarDashComEmpresa, aviso }