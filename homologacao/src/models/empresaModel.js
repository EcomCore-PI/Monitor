var database = require("../database/config");

function buscarPorId(id) {
  return database.executar(`SELECT * FROM empresa WHERE id = ?`, [id]);
}

function buscarPorCnpj(cnpj) {
  return database.executar(`SELECT * FROM empresa WHERE cnpj = ?`, [cnpj]);
}

function cadastrar(razao_social, cnpj, email_contato) {
  // email_contato é NOT NULL na tabela empresa
  var instrucaoSql = `INSERT INTO empresa (cnpj, razao_social, email_contato) VALUES (?, ?, ?)`;
  return database.executar(instrucaoSql, [cnpj, razao_social, email_contato || "nao-informado@ecomcore.com"]);
}

function listar() {
  var instrucaoSql = `SELECT id, cnpj, razao_social FROM empresa`;

  return database.executar(instrucaoSql);
}




module.exports = { buscarPorCnpj, buscarPorId, cadastrar, listar};
