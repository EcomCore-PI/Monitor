(() => {
    const caminho = window.location.pathname.toLowerCase();
    const config = caminho.includes('memoria')
        ? { url: '/metricas/memoria', chave: 'ram_percentual', atencao: 80, critico: 90, unidade: '%' }
        : caminho.includes('disco')
            ? { url: '/metricas/disco', chave: 'disco_percentual', atencao: 80, critico: 90, unidade: '%' }
            : null;

    const corpo = document.getElementById('recentAlerts');
    const contador = document.getElementById('alertCount');
    if (!config || !corpo || !contador) return;

    const alertas = [];
    let nivelAnterior = 'normal';

    function idServidorAtual() {
        const params = new URLSearchParams(window.location.search);
        const informado = params.get('id_servidor') || params.get('servidor');
        const id = Number(informado || window.CONFIG_SERVIDOR?.id || 3);
        return Number.isInteger(id) && id > 0 ? id : 3;
    }

    function renderizar() {
        const recentes = alertas.slice(0, 4);
        contador.textContent = String(recentes.length);
        corpo.replaceChildren();

        if (recentes.length === 0) {
            const linha = document.createElement('tr');
            const celula = document.createElement('td');
            celula.colSpan = 3;
            celula.textContent = 'Nenhum alerta recente';
            linha.append(celula);
            corpo.append(linha);
            return;
        }

        for (const alerta of recentes) {
            const linha = document.createElement('tr');
            const horario = document.createElement('td');
            const nivel = document.createElement('td');
            const valor = document.createElement('td');
            const selo = document.createElement('span');

            horario.textContent = alerta.horario;
            selo.className = `alert-level alert-level--${alerta.nivel}`;
            selo.textContent = alerta.nivel === 'critical' ? 'CRÍTICO' : 'ATENÇÃO';
            nivel.append(selo);
            valor.textContent = `${alerta.valor.toFixed(1)}${config.unidade}`;
            linha.append(horario, nivel, valor);
            corpo.append(linha);
        }
    }

    async function atualizar() {
        try {
            const resposta = await fetch(
                `${config.url}?id_servidor=${idServidorAtual()}`,
                { cache: 'no-store' }
            );
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

            const retorno = await resposta.json();
            const registros = Array.isArray(retorno) ? retorno : [retorno];
            const leitura = registros.slice().reverse().find(item =>
                item && item[config.chave] != null && Number.isFinite(Number(item[config.chave]))
            );
            if (!leitura) return;

            const valor = Number(leitura[config.chave]);
            const nivelAtual = valor >= config.critico
                ? 'critical'
                : valor >= config.atencao
                    ? 'warning'
                    : 'normal';

            if (nivelAtual !== nivelAnterior && nivelAtual !== 'normal') {
                alertas.unshift({
                    horario: leitura.horario || new Date().toLocaleTimeString('pt-BR'),
                    nivel: nivelAtual,
                    valor
                });
                alertas.splice(4);
                renderizar();
            }
            nivelAnterior = nivelAtual;
        } catch (erro) {
            console.error('Falha ao verificar limite de alerta:', erro);
        }
    }

    atualizar();
    setInterval(atualizar, 3000);
})();
