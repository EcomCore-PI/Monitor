(() => {
    const caminho = window.location.pathname.toLowerCase();
    const recurso = caminho.includes('memoria')
        ? 'RAM'
        : caminho.includes('disco')
            ? 'Disco'
            : null;
    const corpo = document.getElementById('recentAlerts');
    const contador = document.getElementById('alertCount');
    if (!recurso || !corpo || !contador) return;

    function idServidorAtual() {
        const params = new URLSearchParams(window.location.search);
        const informado = params.get('id_servidor') || params.get('servidor');
        const id = Number(informado || window.CONFIG_SERVIDOR?.id || 3);
        return Number.isInteger(id) && id > 0 ? id : 3;
    }

    function renderizar(alertas) {
        contador.textContent = String(alertas.length);
        corpo.replaceChildren();

        if (alertas.length === 0) {
            const linha = document.createElement('tr');
            const celula = document.createElement('td');
            celula.colSpan = 3;
            celula.textContent = 'Nenhum alerta registrado no banco';
            linha.append(celula);
            corpo.append(linha);
            return;
        }

        for (const alerta of alertas) {
            const linha = document.createElement('tr');
            const horario = document.createElement('td');
            const nivel = document.createElement('td');
            const valor = document.createElement('td');
            const selo = document.createElement('span');
            const critico = String(alerta.nivel).toUpperCase() === 'CRITICO';

            horario.textContent = alerta.horario_captura || alerta.data || '--:--';
            selo.className = `alert-level alert-level--${critico ? 'critical' : 'warning'}`;
            selo.textContent = critico ? 'CRÍTICO' : 'ATENÇÃO';
            nivel.append(selo);
            valor.textContent = `${Number(alerta.valor_medido).toFixed(1)} ${alerta.unidade || ''}`.trim();
            linha.append(horario, nivel, valor);
            corpo.append(linha);
        }
    }

    async function atualizar() {
        try {
            const resposta = await fetch(
                `/alertas?id_servidor=${idServidorAtual()}&recurso=${encodeURIComponent(recurso)}`,
                { cache: 'no-store' }
            );
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
            const dados = await resposta.json();
            if (!Array.isArray(dados.alertas)) throw new Error('Resposta /alertas inválida.');
            renderizar(dados.alertas.slice(0, 4));
        } catch (erro) {
            console.error(`Falha ao buscar alertas de ${recurso}:`, erro);
        }
    }

    atualizar();
    setInterval(atualizar, 5000);
})();
