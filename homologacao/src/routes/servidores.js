var express = require("express");
var router = express.Router();
var servidorModel = require("../models/servidorModel");

router.get("/empresa/:fk_empresa", function (req, res) {
    servidorModel.listarPorEmpresa(req.params.fk_empresa)
        .then(function (resultado) { res.json(resultado); })
        .catch(function (erro) {
            console.log(erro);
            res.status(500).json(erro.sqlMessage || erro.message);
        });
});

module.exports = router;
