
const ID_SERVIDOR = 5;

function formatarMoeda(valor, moeda) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: moeda
    }).format(valor);
}

async function carregarCustoProjetado() {
    const kpiCusto = document.getElementById("kpiCustoTotal");
    const status = document.getElementById("statusFinops");

    try {
        const resposta = await fetch("/finops/custos");

        if (!resposta.ok) {
            throw new Error("Erro ao consultar custos AWS");
        }

        const dados = await resposta.json();

        kpiCusto.textContent = formatarMoeda(
            dados.custoTotal,
            dados.moeda
        );

        status.textContent =
            "Estimativas financeiras e indicadores de monitoramento carregados.";
        status.dataset.error = "false";

    } catch (erro) {
        console.error("Erro ao carregar custos:", erro);

        kpiCusto.textContent = "—";
        status.textContent = "Erro ao carregar custos AWS.";
        status.dataset.error = "true";
    }
}

async function carregarIndicadoresCPU() {
    const kpiOciosidade = document.getElementById("kpiCustoServidor");
    const kpiCPU = document.getElementById("kpiEficiencia");

    try {
        const respostas = await Promise.all([
            fetch("/finops/historico/" + ID_SERVIDOR),
            fetch("/finops/custos")
        ]);

        if (!respostas[0].ok || !respostas[1].ok) {
            throw new Error("Erro ao consultar indicadores de CPU");
        }

        const historico = await respostas[0].json();
        const custos = await respostas[1].json();

        const capturasCPU = historico.filter(function (captura) {
            return captura.componente === "CPU";
        });

        if (capturasCPU.length === 0) {
            throw new Error("Nenhuma captura de CPU encontrada");
        }

        const somaCPU = capturasCPU.reduce(function (total, captura) {
            return total + Number(captura.valor);
        }, 0);

        const mediaCPU = somaCPU / capturasCPU.length;
        const percentualOcioso = Math.max(0, 100 - mediaCPU);

        const custoOciosidade =
            custos.custoEC2 * (percentualOcioso / 100);

        kpiCPU.textContent =
            mediaCPU.toFixed(1).replace(".", ",") + "%";

        kpiOciosidade.textContent = formatarMoeda(
            custoOciosidade,
            custos.moeda
        );

    } catch (erro) {
        console.error("Erro nos indicadores de CPU:", erro);

        kpiCPU.textContent = "—";
        kpiOciosidade.textContent = "—";
    }
}

async function carregarVariacaoCustos() {
    const kpiVariacao = document.getElementById("kpiVariacao");

    try {
        const resposta = await fetch("/finops/variacao");

        if (!resposta.ok) {
            throw new Error("Erro ao consultar variação da ociosidade");
        }

        const dados = await resposta.json();

        if (dados.variacaoPercentual === null) {
            kpiVariacao.textContent = "—";
            kpiVariacao.title = dados.observacao;
            return;
        }

        const variacao = Number(dados.variacaoPercentual);

        kpiVariacao.textContent =
            (variacao > 0 ? "+" : "") +
            variacao.toFixed(2).replace(".", ",") + "%";

        kpiVariacao.style.color =
            variacao < 0 ? "#4ade80" :
            variacao > 0 ? "#f87171" : "#f8fafc";

        kpiVariacao.title =
            "Ociosidade anterior: " + dados.ociosidadeAnterior + "% | " +
            "Ociosidade atual: " + dados.ociosidadeAtual + "%";

    } catch (erro) {
        console.error("Erro ao carregar variação:", erro);
        kpiVariacao.textContent = "—";
    }
}

async function carregarGraficoEvolucao() {
    const canvas = document.getElementById("graficoEvolucao");

    if (!canvas) {
        return;
    }

    try {
        const resposta = await fetch("/finops/evolucao");

        if (!resposta.ok) {
            throw new Error("Erro ao consultar evolução de custos");
        }

        const resultado = await resposta.json();

        const horas = resultado.dados.map(function (item) {
            return item.hora + "h";
        });

        const custos = resultado.dados.map(function (item) {
            return Number(item.custoAcumulado);
        });

        new Chart(canvas, {
            type: "line",
            data: {
                labels: horas,
                datasets: [{
                    label: "Custo acumulado (R$)",
                    data: custos,
                    borderColor: "#ED145B",
                    backgroundColor: "rgba(237, 20, 91, 0.12)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL"
                                }).format(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: "#8f98aa"
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: "#8f98aa",
                            callback: function (valor) {
                                return "R$ " + Number(valor).toFixed(2);
                            }
                        },
                        grid: {
                            color: "rgba(255,255,255,0.06)"
                        }
                    }
                }
            }
        });

    } catch (erro) {
        console.error("Erro no gráfico de evolução:", erro);
    }
}

async function carregarGraficoComponentes() {
    const canvas = document.getElementById("graficoComponentes");

    if (!canvas) {
        return;
    }

    try {
        const resposta = await fetch("/finops/componentes");

        if (!resposta.ok) {
            throw new Error("Erro ao consultar custos por componente");
        }

        const resultado = await resposta.json();

        const componentes = resultado.dados.map(function (item) {
            return item.componente;
        });

        const custos = resultado.dados.map(function (item) {
            return Number(item.custo);
        });

        new Chart(canvas, {
            type: "bar",
            data: {
                labels: componentes,
                datasets: [{
                    label: "Custo estimado (R$)",
                    data: custos,
                    backgroundColor: [
                        "#ED145B",
                        "#6366f1",
                        "#22c55e",
                        "#f59e0b"
                    ],
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 65
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL"
                                }).format(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: "#8f98aa"
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: "#8f98aa",
                            callback: function (valor) {
                                return "R$ " + Number(valor).toFixed(0);
                            }
                        },
                        grid: {
                            color: "rgba(255,255,255,0.06)"
                        }
                    }
                }
            }
        });

    } catch (erro) {
        console.error("Erro no gráfico de componentes:", erro);
    }
}
document.addEventListener("DOMContentLoaded", function () {
    carregarCustoProjetado();
    carregarIndicadoresCPU();
    carregarVariacaoCustos();
    carregarGraficoEvolucao();
    carregarGraficoComponentes();
});