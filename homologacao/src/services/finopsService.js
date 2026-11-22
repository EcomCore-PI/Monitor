const COTACAO_DOLAR = 5.30;
const precosAWS = {
    ec2PorHora: 0.0376,
    horasMensais: 730,
    ebsPorGiB: 0.08,
    armazenamentoGiB: 25
};

function calcularCustoProjetado() {
    const custoEC2 =
        precosAWS.ec2PorHora * precosAWS.horasMensais;

    const custoEBS =
        precosAWS.ebsPorGiB * precosAWS.armazenamentoGiB;

    const custoTotal = custoEC2 + custoEBS;

    return {
        moeda: "BRL",
        tipo: "estimativa_mensal",
        custoEC2: Number((custoEC2 * COTACAO_DOLAR).toFixed(2)),
        custoEBS: Number((custoEBS * COTACAO_DOLAR).toFixed(2)),
        custoTotal: Number((custoTotal * COTACAO_DOLAR).toFixed(2)),
        cotacaoDolar: COTACAO_DOLAR,
        horasMensais: precosAWS.horasMensais,
        precos: precosAWS
    };
}

function calcularCustoServidor(idServidor) {
    const custos = calcularCustoProjetado();

    return {
        idServidor: idServidor,
        moeda: custos.moeda,
        custoMensal: custos.custoTotal,
        custoComputacao: custos.custoEC2,
        custoArmazenamento: custos.custoEBS,
        cotacaoDolar: custos.cotacaoDolar,
        tipo: "estimativa_mensal"
    };
}

function calcularVariacaoCustos() {
    const custosAtuais = calcularCustoProjetado();

    const custoAtual = custosAtuais.custoTotal;

    const custoAnterior = custoAtual;

    const variacaoPercentual =
        ((custoAtual - custoAnterior) / custoAnterior) * 100;

    return {
        moeda: "USD",
        custoAtual: custoAtual,
        custoAnterior: custoAnterior,
        variacaoPercentual: Number(variacaoPercentual.toFixed(2)),
        tipo: "comparacao_sem_alteracao_de_tarifa",
        observacao: "Não há histórico financeiro para comparação."
    };
}

function calcularEvolucaoCustos() {
    const custoEC2Hora = precosAWS.ec2PorHora;

    const custoEBSHora =
        (precosAWS.ebsPorGiB * precosAWS.armazenamentoGiB) /
        precosAWS.horasMensais;

    const custoTotalHora =
        (custoEC2Hora + custoEBSHora) * COTACAO_DOLAR;

    const evolucao = [];

    for (let hora = 0; hora <= 24; hora += 2) {
        evolucao.push({
            hora: hora,
            custoAcumulado: Number(
                (custoTotalHora * hora).toFixed(2)
            )
        });
    }

    return {
        moeda: "BRL",
        periodo: "24 horas",
        tipo: "projecao_custo_acumulado",
        cotacaoDolar: COTACAO_DOLAR,
        dados: evolucao
    };
}

function calcularCustosComponentes(capturas) {
    const custos = calcularCustoProjetado();

    const grupos = {
        CPU: [],
        RAM: [],
        "Rede Enviada": [],
        "Rede Recebida": []
    };

    capturas.forEach(function (captura) {
        if (grupos[captura.componente]) {
            grupos[captura.componente].push({
                valor: Number(captura.valor),
                horario: new Date(captura.horario).getTime()
            });
        }
    });

    function media(valores) {
        if (valores.length === 0) {
            return 0;
        }

        const soma = valores.reduce(function (total, item) {
            return total + item.valor;
        }, 0);

        return soma / valores.length;
    }

    function trafego(grupo) {
        if (grupo.length < 2) {
            return 0;
        }

        grupo.sort(function (a, b) {
            return a.horario - b.horario;
        });

        let total = 0;

        for (let i = 1; i < grupo.length; i++) {
            const diferenca = grupo[i].valor - grupo[i - 1].valor;

            if (diferenca > 0) {
                total += diferenca;
            }
        }

        return total;
    }

    const mediaCPU = media(grupos.CPU);
    const mediaRAM = media(grupos.RAM);

    const trafegoTotal =
        trafego(grupos["Rede Enviada"]) +
        trafego(grupos["Rede Recebida"]);

    const pontuacaoCPU = 0.40 * (mediaCPU / 100);
    const pontuacaoRAM = 0.35 * (mediaRAM / 100);

    const fatorRede = trafegoTotal / (trafegoTotal + 100);
    const pontuacaoRede = 0.25 * fatorRede;

    const somaPontuacoes =
        pontuacaoCPU + pontuacaoRAM + pontuacaoRede;

    if (somaPontuacoes === 0) {
        throw new Error("Dados insuficientes para calcular o rateio.");
    }

    const custoCPU =
        custos.custoEC2 * pontuacaoCPU / somaPontuacoes;

    const custoRAM =
        custos.custoEC2 * pontuacaoRAM / somaPontuacoes;

    const custoRede =
        custos.custoEC2 - custoCPU - custoRAM;

    return {
        moeda: "BRL",
        tipo: "rateio_interno_estimado",
        idServidor: 5,
        custoTotal: custos.custoTotal,
        dados: [
            {
                componente: "CPU",
                custo: Number(custoCPU.toFixed(2))
            },
            {
                componente: "RAM",
                custo: Number(custoRAM.toFixed(2))
            },
            {
                componente: "Disco",
                custo: custos.custoEBS
            },
            {
                componente: "Rede",
                custo: Number(custoRede.toFixed(2))
            }
        ],
        observacao:
            "Rateio interno estimado com base em pesos e capturas reais. Não representa cobrança AWS por componente."
    };
}

module.exports = {
    calcularCustoProjetado,
    calcularCustoServidor,
    calcularVariacaoCustos,
    calcularEvolucaoCustos,
    calcularCustosComponentes
};