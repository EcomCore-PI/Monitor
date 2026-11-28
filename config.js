const parametros = new URLSearchParams(window.location.search);
const idUrl = parseInt(parametros.get('servidor') || parametros.get('id_servidor'), 10);
const nomeUrl = parametros.get('nome');
const cargoUrl = parametros.get('cargo');

if (Number.isInteger(idUrl) && idUrl > 0) {
    sessionStorage.setItem('SERVIDOR_LOGIN', idUrl);
}
if (nomeUrl) {
    sessionStorage.setItem('NOME_USUARIO', nomeUrl);
}
if (cargoUrl) {
    sessionStorage.setItem('CARGO_USUARIO', cargoUrl.trim().toLowerCase());
}

const idSessao = parseInt(sessionStorage.getItem('SERVIDOR_LOGIN'), 10);
const idAtivo = Number.isInteger(idSessao) && idSessao > 0 ? idSessao : null;
const cargoAtivo = (sessionStorage.getItem('CARGO_USUARIO') || 'analista').trim().toLowerCase();

window.CONFIG_SERVIDOR = {
    id: idAtivo,
    cargo: cargoAtivo
};

const SERVIDORES_POR_ROTA = {
    'cpu.html': 6,
    'memoria.html': 3,
    'disco.html': 4,
    'rede.html': 1,
    'financeiro.html': 5
};

// Impede que o Gestor acesse telas individuais de hardware pela URL
if (cargoAtivo === 'gestor') {
    const caminho = window.location.pathname.toLowerCase();
    const permitido = caminho === '/' || caminho.endsWith('/index.html') || caminho.endsWith('/financeiro.html');

    if (!permitido) {
        window.location.replace('/index.html');
    }
}

function executarLogout() {
    sessionStorage.clear();
    localStorage.clear();

    const destinoLogin = `${window.location.protocol}//${window.location.hostname}/login.html`;
    window.location.replace(destinoLogin);
}

window.logout = executarLogout;

document.addEventListener('DOMContentLoaded', () => {
    // Sobrescreve qualquer function logout() { window.history.back(); } declarada nos HTMLs individuais
    window.logout = executarLogout;

    const nomeSalvo = sessionStorage.getItem('NOME_USUARIO');
    if (nomeSalvo) {
        const elNome = document.getElementById('nomeAnalista') || document.querySelector('.user-name');
        if (elNome) elNome.textContent = nomeSalvo;
    }

    document.querySelectorAll('.nav-menu .nav-item').forEach((item) => {
        const texto = item.textContent.toLowerCase();
        let destino = null;
        let restritoAnalista = false;

        if (texto.includes('cpu')) {
            destino = '/Individuais/Marco/cpu.html?servidor=6';
            restritoAnalista = true;
        } else if (texto.includes('memória') || texto.includes('memoria')) {
            destino = '/Individuais/Jo%C3%A3o-Miguel/memoria.html?servidor=3';
            restritoAnalista = true;
        } else if (texto.includes('disco')) {
            destino = '/Individuais/Ana-Clara/disco.html?servidor=4';
            restritoAnalista = true;
        } else if (texto.includes('rede')) {
            destino = '/Individuais/Matheus/rede.html?servidor=1';
            restritoAnalista = true;
        } else if (texto.includes('financeiro')) {
            destino = '/Individuais/Isabelle/financeiro.html?servidor=5';
        } else if (texto.includes('dashboard')) {
            destino = '/index.html';
        }

        // Oculta os itens individuais do menu quando o perfil for Gestor
        if (cargoAtivo === 'gestor' && restritoAnalista) {
            item.style.display = 'none';
            return;
        }

        if (destino) {
            item.onclick = () => {
                window.location.href = destino;
            };
        }
    });

    document.querySelectorAll('.btn-logout').forEach((btn) => {
        btn.removeAttribute('onclick');
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            executarLogout();
        });
    });
});