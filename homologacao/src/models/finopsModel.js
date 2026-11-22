
var database = require("../database/config");

function buscarCapturas(fk_servidor, limite_linhas) {
    var instrucaoSql = `
        SELECT
            tc.nome AS componente,
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
          AND et.ativo = 1
          AND tc.nome IN (
              'CPU',
              'RAM',
              'Disco',
              'Rede Enviada',
              'Rede Recebida'
          )
        ORDER BY cap.id DESC
        LIMIT ?;
    `;

    return database.executar(instrucaoSql, [
        fk_servidor,
        Number(limite_linhas)
    ]);
}

function buscarHistorico(fk_servidor) {
    var instrucaoSql = `
        SELECT
            tc.nome AS componente,
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
          AND et.ativo = 1
          AND tc.nome IN (
              'CPU',
              'RAM',
              'Disco',
              'Rede Enviada',
              'Rede Recebida'
          )
        ORDER BY cap.horario ASC, cap.id ASC
        LIMIT 10000;
    `;

    return database.executar(instrucaoSql, [fk_servidor]);
}

function buscarVariacaoOciosidade(fk_servidor) {
    var instrucaoSql = `
        SELECT
            CASE
                WHEN cap.horario >= (
                    SELECT MAX(c2.horario)
                    FROM captura c2
                    JOIN especificacao_tecnica e2
                        ON e2.id = c2.fk_especificacao_tecnica
                    WHERE e2.fk_servidor = ?
                ) - INTERVAL 30 MINUTE
                THEN 'atual'
                ELSE 'anterior'
            END AS periodo,
            COUNT(*) AS capturas,
            ROUND(AVG(cap.valor), 2) AS mediaCPU,
            ROUND(100 - AVG(cap.valor), 2) AS ociosidade
        FROM captura cap
        JOIN especificacao_tecnica et
            ON et.id = cap.fk_especificacao_tecnica
        JOIN componente c
            ON c.id = et.fk_componente
        JOIN tipo_componente tc
            ON tc.id = c.fk_tipo_componente
        WHERE et.fk_servidor = ?
          AND et.ativo = 1
          AND tc.nome = 'CPU'
          AND cap.horario >= (
              SELECT MAX(c3.horario)
              FROM captura c3
              JOIN especificacao_tecnica e3
                  ON e3.id = c3.fk_especificacao_tecnica
              WHERE e3.fk_servidor = ?
          ) - INTERVAL 60 MINUTE
        GROUP BY periodo;
    `;

    return database.executar(instrucaoSql, [
        fk_servidor,
        fk_servidor,
        fk_servidor
    ]);
}
module.exports = {
    buscarCapturas,
    buscarHistorico,
    buscarVariacaoOciosidade
};