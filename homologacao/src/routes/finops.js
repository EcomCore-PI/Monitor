
var express = require("express");
var router = express.Router();

var finopsModel = require("../models/finopsModel");
var finopsService = require("../services/finopsService");


router.get("/capturas/:idServidor", function (req, res) {
    var idServidor = Number(req.params.idServidor);

    if (!Number.isInteger(idServidor) || idServidor <= 0) {
        return res.status(400).json({
            erro: "ID do servidor inválido."
        });
    }

    finopsModel.buscarCapturas(idServidor, 100)
        .then(function (resultado) {
            res.json(resultado);
        })
        .catch(function (erro) {
            console.error("Erro na API FinOps:", erro.message);

            res.status(500).json({
                erro: "Não foi possível consultar as capturas."
            });
        });
});

router.get("/historico/:idServidor", function (req, res) {
    var idServidor = Number(req.params.idServidor);

    if (!Number.isInteger(idServidor) || idServidor <= 0) {
        return res.status(400).json({
            erro: "ID do servidor inválido."
        });
    }

    finopsModel.buscarHistorico(idServidor)
        .then(function (resultado) {
            res.json(resultado);
        })
        .catch(function (erro) {
            console.error("Erro ao consultar histórico FinOps:", erro.message);

            res.status(500).json({
                erro: "Não foi possível consultar o histórico."
            });
        });
        
});
router.get("/custos", function (req, res) {
    var resultado = finopsService.calcularCustoProjetado();
    res.json(resultado);
});

router.get("/servidor/:idServidor/custos", function (req, res) {
    var idServidor = Number(req.params.idServidor);

    if (!Number.isInteger(idServidor) || idServidor !== 5) {
        return res.status(400).json({
            erro: "Estimativa disponível apenas para o servidor 5."
        });
    }

    var resultado = finopsService.calcularCustoServidor(idServidor);
    res.json(resultado);
});

router.get("/variacao", function (req, res) {
    const idServidor = 5;

    finopsModel.buscarVariacaoOciosidade(idServidor)
        .then(function (resultado) {
            const periodoAtual = resultado.find(function (item) {
                return item.periodo === "atual";
            });

            const periodoAnterior = resultado.find(function (item) {
                return item.periodo === "anterior";
            });

            if (!periodoAtual || !periodoAnterior) {
                return res.json({
                    variacaoPercentual: null,
                    observacao: "Dados insuficientes para comparar os períodos."
                });
            }

            const ociosidadeAtual = Number(periodoAtual.ociosidade);
            const ociosidadeAnterior = Number(periodoAnterior.ociosidade);

            if (ociosidadeAnterior === 0) {
                return res.json({
                    variacaoPercentual: null,
                    observacao: "Ociosidade anterior igual a zero."
                });
            }

            const variacao =
                ((ociosidadeAtual - ociosidadeAnterior) /
                    ociosidadeAnterior) * 100;

            res.json({
                idServidor: idServidor,
                periodo: "Últimos 30 minutos versus 30 minutos anteriores",
                mediaCPUAtual: Number(periodoAtual.mediaCPU),
                mediaCPUAnterior: Number(periodoAnterior.mediaCPU),
                ociosidadeAtual: ociosidadeAtual,
                ociosidadeAnterior: ociosidadeAnterior,
                variacaoPercentual: Number(variacao.toFixed(2)),
                tipo: "variacao_ociosidade",
                observacao: "Indicador operacional, não variação da fatura AWS."
            });
        })
        .catch(function (erro) {
            console.error("Erro na variação FinOps:", erro.message);

            res.status(500).json({
                erro: "Não foi possível calcular a variação da ociosidade."
            });
        });
});



router.get("/evolucao", function (req, res) {
    const resultado = finopsService.calcularEvolucaoCustos();
    res.json(resultado);
});

router.get("/componentes", function (req, res) {
    const idServidor = 5;

    finopsModel.buscarHistorico(idServidor)
        .then(function (capturas) {
            const resultado =
                finopsService.calcularCustosComponentes(capturas);

            res.json(resultado);
        })
        .catch(function (erro) {
            console.error(
                "Erro ao calcular custos por componente:",
                erro.message
            );

            res.status(500).json({
                erro: "Não foi possível calcular os custos por componente."
            });
        });
});

module.exports = router;
