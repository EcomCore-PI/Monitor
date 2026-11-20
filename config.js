const parametros = new URLSearchParams(window.location.search);
const idUrl = parseInt(parametros.get('servidor') || parametros.get('id_servidor'), 10);

if (Number.isInteger(idUrl) && idUrl > 0) {
    sessionStorage.setItem('SERVIDOR_LOGIN', idUrl);
}

const idSessao = parseInt(sessionStorage.getItem('SERVIDOR_LOGIN'), 10);
const idAtivo = Number.isInteger(idSessao) && idSessao > 0 ? idSessao : null;

window.CONFIG_SERVIDOR = {
    id: idAtivo
};

// Mapeia cada rota individual para o seu respectivo servidor
const SERVIDORES_POR_ROTA = {
    'cpu.html': 6,
    'memoria.html': 3,
    'disco.html': 4,
    'rede.html': 1,
    'financeiro.html': 5
};

// Função global de logout: limpa a sessão e vai direto para o login (sem porta 8000)
window.logout = function () {
    sessionStorage.clear();
    localStorage.clear();

    const destinoLogin = `${window.location.protocol}//${window.location.hostname}/login.html`;
    window.location.replace(destinoLogin);
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Garante o roteamento da barra lateral para o servidor correto de cada componente
    document.querySelectorAll('.nav-menu .nav-item').forEach((item) => {
        const texto = item.textContent.toLowerCase();
        let destino = null;

        if (texto.includes('cpu')) destino = '/Individuais/Marco/cpu.html?servidor=6';
        else if (texto.includes('memória') || texto.includes('memoria')) destino = '/Individuais/Jo%C3%A3o-Miguel/memoria.html?servidor=3';
        else if (texto.includes('disco')) destino = '/Individuais/Ana-Clara/disco.html?servidor=4';
        else if (texto.includes('rede')) destino = '/Individuais/Matheus/rede.html?servidor=1';
        else if (texto.includes('financeiro')) destino = '/Individuais/Isabelle/financeiro.html?servidor=5';
        else if (texto.includes('dashboard')) destino = '/index.html';

        if (destino) {
            item.onclick = () => {
                window.location.href = destino;
            };
        }
    });

    // 2. Força o botão Sair (.btn-logout) a ir direto para o login em todas as telas
    document.querySelectorAll('.btn-logout').forEach((btn) => {
        btn.onclick = (event) => {
            event.preventDefault();
            window.logout();
        };
    });
});