
var database = require("../database/config");

// Busca as últimas capturas de um recurso em um servidor.
function buscarUltimasCapturas(fk_servidor, limite_linhas, nome) {
    var instrucaoSql = `
        SELECT
            tc.nome,
            cap.valor,
            cap.horario
        FROM captura cap
        JOIN especificacao_tecnica et
            ON et.id = cap.fk_especificacao_tecnica
        JOIN componente c
            ON c.id = et.fk_componente
        JOIN tipo_componente tc
            ON tc.id = c.fk_tipo_componente
        WHERE et.fk_servidor = ?
          AND tc.nome = ?
          AND et.ativo = 1
        ORDER BY cap.id DESC
        LIMIT ?;
    `;

    return database.executar(instrucaoSql, [
        fk_servidor,
        nome,
        Number(limite_linhas)
    ]);
}

function buscarTempoReal(fk_servidor, nome, limite_linhas) {
    return buscarUltimasCapturas(
        fk_servidor,
        limite_linhas,
        nome
    );
}

module.exports = {
    buscarTempoReal,
    buscarUltimasCapturas
};

