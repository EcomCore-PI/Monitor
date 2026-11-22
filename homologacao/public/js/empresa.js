var FK_EMPRESA = sessionStorage.FK_EMPRESA;
var ID_LOGADO = sessionStorage.ID_USUARIO;

var CARGO_USUARIO = String(
    sessionStorage.CARGO_USUARIO || ""
).trim().toLowerCase();

if (
    CARGO_USUARIO !== "rh" ||
    !FK_EMPRESA ||
    FK_EMPRESA === "undefined" ||
    FK_EMPRESA === "null"
) {
    window.location = "./login.html";
}

var listaUsuarios = document.getElementById("listaUsuarios");
var formCadastro = document.getElementById("formCadastro");
var modalSenha = document.getElementById("modalSenha");
var formSenha = document.getElementById("formSenha");
var modalNome = document.getElementById("modalNome");
var modalErro = document.getElementById("modalErro");

var idEmEdicao = null;


var NOME_DO_CARGO = { Analista: "ANALISTA", Gestor: "GESTOR", RH: "RH" };


function chamarApi(rota, corpo) {
    return fetch("/usuarios/" + rota, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + (sessionStorage.TOKEN_SESSAO || "")
        },
        body: JSON.stringify(corpo)
    }).then(function (resposta) {
        var ehJson = (resposta.headers.get("content-type") || "").includes("application/json");

        return (ehJson ? resposta.json() : resposta.text()).then(function (dados) {
            if (!resposta.ok) {
                throw new Error(typeof dados == "string" ? dados : "Erro inesperado. Tente novamente.");
            }
            return dados;
        });
    });
}



function carregarUsuarios() {
    chamarApi("listar", { fk_empresaServer: FK_EMPRESA })
        .then(mostrarUsuarios)
        .catch(function (erro) {
            listaUsuarios.textContent = "Não foi possível carregar os funcionários. " + erro.message;
        });
}

function mostrarUsuarios(usuarios) {
    listaUsuarios.innerHTML = "";

    if (usuarios.length == 0) {
        listaUsuarios.textContent = "Nenhum funcionário cadastrado ainda.";
        return;
    }

    usuarios.forEach(function (usuario) {
        listaUsuarios.appendChild(criarLinha(usuario));
    });
}

function criarLinha(usuario) {
    var linha = document.createElement("div");
    linha.className = "user-item";
    linha.dataset.id = usuario.id;
    linha.dataset.nome = usuario.nome;

    linha.innerHTML =
        '<div class="avatar"><img src="./assets/imgs/perfil-usuario.png" alt="Perfil do funcionário"></div>' +
        '<div class="user-info"><div class="nome"></div><div class="cargo"></div></div>' +
        '<div class="user-actions">' +
        (usuario.convite_pendente ? '<button class="reenviar" type="button" data-acao="reenviar">REENVIAR CONVITE</button>' : '') +
        '<button class="alterar" type="button" data-acao="alterar">ALTERAR</button>' +
        '<button class="deletar" type="button" data-acao="deletar">DELETAR</button>' +
        '</div>';

    linha.querySelector(".nome").textContent = usuario.nome;
    linha.querySelector(".cargo").textContent = (NOME_DO_CARGO[usuario.cargo] || usuario.cargo) +
        (usuario.convite_pendente ? " · convite pendente" : "");

    if (usuario.id == ID_LOGADO) {
        linha.querySelector(".deletar").remove();
    }

    return linha;
}



formCadastro.addEventListener("submit", function (evento) {
    evento.preventDefault();

    var nome = document.getElementById("nomeCompleto").value.trim();
    var email = document.getElementById("email").value.trim();
    var cargo = document.getElementById("cargo").value;
    chamarApi("cadastrar", {
        nomeServer: nome,
        emailServer: email,
        cargoServer: cargo,
        fk_empresaServer: FK_EMPRESA
    }).then(function () {
        formCadastro.reset();
        carregarUsuarios();
        alert("Convite enviado! A pessoa receberá um email para definir a senha.");
    }).catch(function (erro) {
        alert(erro.message);
    });
});


listaUsuarios.addEventListener("click", function (evento) {
    var botao = evento.target.closest("button[data-acao]");
    if (!botao) return;

    var linha = botao.closest(".user-item");
    var id = linha.dataset.id;
    var nome = linha.dataset.nome;

    if (botao.dataset.acao == "reenviar") {
        chamarApi("reenviar-convite", { idServer: id, fk_empresaServer: FK_EMPRESA })
            .then(function () { alert("Convite reenviado por email."); })
            .catch(function (erro) { alert(erro.message); });
        return;
    }

    if (botao.dataset.acao == "alterar") {
        idEmEdicao = id;
        modalNome.textContent = nome;
        modalErro.textContent = "";
        formSenha.reset();
        modalSenha.showModal();
    }

    if (botao.dataset.acao == "deletar") {
        if (!confirm("Excluir " + nome + "? Essa ação não pode ser desfeita.")) return;

        chamarApi("remover", { idServer: id, fk_empresaServer: FK_EMPRESA })
            .then(function () {
                linha.remove();
                if (!listaUsuarios.querySelector(".user-item")) {
                    mostrarUsuarios([]);
                }
            })
            .catch(function (erro) {
                alert(erro.message);
            });
    }
});

formSenha.addEventListener("submit", function (evento) {
    evento.preventDefault();

    var novaSenha = document.getElementById("novaSenha").value;
    var confirmacao = document.getElementById("confirmarNovaSenha").value;

    if (novaSenha != confirmacao) {
        modalErro.textContent = "A senha e a confirmação não são iguais.";
        return;
    }

    chamarApi("atualizar", {
        idServer: idEmEdicao,
        senhaServer: novaSenha,
        fk_empresaServer: FK_EMPRESA
    }).then(function () {
        modalSenha.close();
        alert("Senha alterada com sucesso.");
    }).catch(function (erro) {
        modalErro.textContent = erro.message;
    });
});

document.getElementById("cancelarModal").addEventListener("click", function () {
    modalSenha.close();
});


modalSenha.addEventListener("click", function (evento) {
    if (evento.target == modalSenha) modalSenha.close();
});

carregarUsuarios();
