var express = require("express");
var router = express.Router();

var usuarioController = require("../controllers/usuarioController");
var requireRh = require("../middleware/requireRh");

//Recebendo os dados do html e direcionando para a função cadastrar de usuarioController.js
router.post("/cadastrar", requireRh, function (req, res) {
    usuarioController.cadastrar(req, res);
})

router.post("/definir-senha", function (req, res) {
    usuarioController.definirSenha(req, res);
});

router.post("/solicitar-redefinicao", function (req, res) {
    usuarioController.solicitarRedefinicao(req, res);
});

router.post("/reenviar-convite", requireRh, function (req, res) {
    usuarioController.reenviarConvite(req, res);
});

router.post("/autenticar", function (req, res) {
    usuarioController.autenticar(req, res);
});

router.post("/atualizar", requireRh, function (req, res){
    usuarioController.atualizar(req, res);
});

router.post("/remover", requireRh, function (req, res){
    usuarioController.remover(req, res);
});

router.post("/listar", requireRh, function (req, res){
    usuarioController.listar(req, res);
});

module.exports = router;
