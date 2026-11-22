var database = require("../database/config");

function autenticar(email) {
    var instrucaoSql = `
        SELECT u.id, u.nome, u.email, u.senha, u.fk_empresa AS empresaId,
               tc.nome_cargo AS cargo
        FROM usuario u
        JOIN tipo_cargo tc ON tc.id = u.fk_cargo
        WHERE LOWER(u.email) = LOWER(?)
        LIMIT 1;
    `;
    return database.executar(instrucaoSql, [email]);
}

function cadastrarConvite(nome, email, cargo, fk_empresa, tokenHash, expiracao) {
    var instrucaoSql = `
        INSERT INTO usuario
            (nome, email, senha, enviou_email, fk_empresa, fk_cargo,
             token_ativacao_hash, token_ativacao_expira)
        VALUES (?, ?, NULL, 1, ?,
            (SELECT id FROM tipo_cargo WHERE nome_cargo = ?), ?, ?);
    `;
    return database.executar(instrucaoSql, [nome, email, fk_empresa, cargo, tokenHash, expiracao]);
}

function buscarPorToken(hash) {
    return database.executar(`
        SELECT id, senha FROM usuario
        WHERE token_ativacao_hash = ? AND token_ativacao_expira > NOW()
        LIMIT 1;
    `, [hash]);
}

function buscarPorEmail(email) {
    return database.executar(`SELECT id, nome, email FROM usuario WHERE LOWER(email) = LOWER(?) LIMIT 1`, [email]);
}

function buscarConvitePendente(id, fk_empresa) {
    return database.executar(`
        SELECT id, nome, email FROM usuario
        WHERE id = ? AND fk_empresa = ? AND senha IS NULL
        LIMIT 1;
    `, [id, fk_empresa]);
}

function atualizarToken(id, tokenHash, expiracao) {
    return database.executar(`UPDATE usuario SET token_ativacao_hash = ?, token_ativacao_expira = ? WHERE id = ?`, [tokenHash, expiracao, id]);
}

function definirSenha(id, senhaHash, tokenHash) {
    return database.executar(`
        UPDATE usuario
        SET senha = ?, token_ativacao_hash = NULL, token_ativacao_expira = NULL
        WHERE id = ? AND token_ativacao_hash = ? AND token_ativacao_expira > NOW();
    `, [senhaHash, id, tokenHash]);
}

function atualizarSenha(id, senhaHash) {
    return database.executar(`UPDATE usuario SET senha = ? WHERE id = ?`, [senhaHash, id]);
}

function atualizar(id, nova_senha, fk_empresa) {
    return database.executar(
        `UPDATE usuario SET senha = ?, token_ativacao_hash = NULL, token_ativacao_expira = NULL WHERE id = ? AND fk_empresa = ?`,
        [nova_senha, id, fk_empresa]
    );
}

function remover(id, fk_empresa) {
    return database.executar(`DELETE FROM usuario WHERE id = ? AND fk_empresa = ?`, [id, fk_empresa]);
}

function listar(fk_empresa) {
    return database.executar(`
        SELECT u.id, u.nome, u.email, tc.nome_cargo AS cargo,
               (u.senha IS NULL) AS convite_pendente
        FROM usuario u
        JOIN tipo_cargo tc ON tc.id = u.fk_cargo
        WHERE u.fk_empresa = ?
        ORDER BY FIELD(tc.nome_cargo, 'rh', 'gestor', 'analista', 'admin'), u.nome;
    `, [fk_empresa]);
}

module.exports = {
    autenticar,
    cadastrarConvite,
    buscarPorToken,
    buscarPorEmail,
    buscarConvitePendente,
    atualizarToken,
    definirSenha,
    atualizarSenha,
    atualizar,
    remover,
    listar
};
