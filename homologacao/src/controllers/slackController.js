var slackService = require("../services/slackService");

function alertar(req, res) {
    var mensagem = req.body.mensagem;

    if (!mensagem) {
        return res.status(400).send("Mensagem não informada.");
    }

    slackService.enviarAlerta(mensagem)
        .then(() => res.status(200).send("Enviado!"))
        .catch(erro => {
            console.error(erro);
            res.status(500).send("Falha ao enviar para o Slack.");
        });
}

module.exports = { alertar };