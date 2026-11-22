const usuarioModel = require("../models/usuarioModel");
const senhaService = require("../services/senhaService");
const sessaoService = require("../services/sessaoService");
const emailService = require("../database/email");

const UMA_HORA = 60 * 60 * 1000;

function linkSenha(req, token) {
    const base = (process.env.APP_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    return `${base}/definir-senha.html?token=${encodeURIComponent(token)}`;
}

async function emitirLink(req, usuario, assunto) {
    const token = senhaService.gerarToken();
    const expiracao = new Date(Date.now() + UMA_HORA);
    await usuarioModel.atualizarToken(usuario.id, senhaService.hashToken(token), expiracao);
    await emailService.enviarLink(usuario.email, usuario.nome, linkSenha(req, token), assunto);
}

async function autenticar(req, res) {
    const email = String(req.body.emailServer || "").trim();
    const senha = String(req.body.senhaServer || "");
    if (!email || !senha) return res.status(400).send("Informe email e senha.");

    try {
        const usuarios = await usuarioModel.autenticar(email);
        if (usuarios.length !== 1 || !usuarios[0].senha) {
            return res.status(403).send("Email e/ou senha inválido(s). Verifique se já definiu sua senha pelo link enviado por email.");
        }

        const usuario = usuarios[0];
        if (!(await senhaService.verificar(senha, usuario.senha))) {
            return res.status(403).send("Email e/ou senha inválido(s).");
        }
        // Migra a senha em texto puro das contas de demonstração assim que fizerem login.
        if (!usuario.senha.startsWith("scrypt$")) {
            await usuarioModel.atualizarSenha(usuario.id, await senhaService.gerarHash(senha));
        }
        return res.json({
            id: usuario.id,
            email: usuario.email,
            nome: usuario.nome,
            cargo: usuario.cargo,
            fk_empresa: usuario.empresaId,
            token: sessaoService.criar(usuario)
        });
    } catch (erro) {
        console.error("Erro ao autenticar usuário:", erro.message);
        return res.status(500).send("Não foi possível realizar o login.");
    }
}

async function cadastrar(req, res) {
    const nome = String(req.body.nomeServer || "").trim();
    const email = String(req.body.emailServer || "").trim().toLowerCase();
    const cargo = String(req.body.cargoServer || "").trim().toLowerCase();
    const empresaId = Number(req.body.fk_empresaServer);

    if (!nome || !email || !cargo || !Number.isInteger(empresaId) || empresaId < 1) {
        return res.status(400).send("Preencha nome, email, perfil e empresa.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).send("Informe um email válido.");
    if (!["rh", "analista", "gestor", "admin"].includes(cargo)) return res.status(400).send("Perfil inválido.");
    if (!emailService.estaConfigurado()) return res.status(503).send("O envio de email ainda não está configurado no .env.dev.");

    const token = senhaService.gerarToken();
    const expiracao = new Date(Date.now() + UMA_HORA);
    try {
        const resultado = await usuarioModel.cadastrarConvite(
            nome, email, cargo, empresaId, senhaService.hashToken(token), expiracao
        );
        try {
            await emailService.enviarLink(email, nome, linkSenha(req, token), "Defina sua senha da EcomCore");
        } catch (erroEmail) {
            console.error("Falha ao enviar convite:", erroEmail.message);
            await usuarioModel.remover(resultado.insertId, empresaId);
            return res.status(502).send("O email não foi enviado. Confira a configuração SMTP e tente cadastrar novamente.");
        }
        return res.status(201).json({ id: resultado.insertId, mensagem: "Convite enviado por email." });
    } catch (erro) {
        if (erro.code === "ER_DUP_ENTRY") return res.status(409).send("Já existe um usuário cadastrado com este email.");
        console.error("Erro ao cadastrar usuário:", erro.message);
        return res.status(500).send("Não foi possível cadastrar o usuário.");
    }
}

async function definirSenha(req, res) {
    const token = String(req.body.token || "");
    const senha = String(req.body.senha || "");
    if (senha.length < 8) return res.status(400).send("A senha precisa ter pelo menos 8 caracteres.");
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).send("Link inválido ou expirado. Solicite um novo email.");

    try {
        const encontrados = await usuarioModel.buscarPorToken(senhaService.hashToken(token));
        if (encontrados.length !== 1) return res.status(400).send("Link inválido ou expirado. Solicite um novo email.");
        const resultado = await usuarioModel.definirSenha(
            encontrados[0].id,
            await senhaService.gerarHash(senha),
            senhaService.hashToken(token)
        );
        if (!resultado.affectedRows) return res.status(400).send("Link inválido ou expirado. Solicite um novo email.");
        return res.json({ mensagem: "Senha definida com sucesso. Você já pode entrar." });
    } catch (erro) {
        console.error("Erro ao definir senha:", erro.message);
        return res.status(500).send("Não foi possível definir a senha.");
    }
}

async function solicitarRedefinicao(req, res) {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).send("Informe seu email.");
    if (!emailService.estaConfigurado()) return res.status(503).send("O envio de email ainda não está configurado.");
    try {
        const usuarios = await usuarioModel.buscarPorEmail(email);
        if (usuarios.length) {
            await emitirLink(req, usuarios[0], "Redefina sua senha da EcomCore");
        }
        return res.json({ mensagem: "Se o email estiver cadastrado, enviaremos um link para definir a senha." });
    } catch (erro) {
        console.error("Erro ao solicitar redefinição:", erro.message);
        return res.status(500).send("Não foi possível enviar o email de redefinição.");
    }
}

async function reenviarConvite(req, res) {
    if (!emailService.estaConfigurado()) return res.status(503).send("O envio de email ainda não está configurado.");
    try {
        const empresaId = req.usuarioSessao.fk_empresa;
        const usuarios = await usuarioModel.buscarConvitePendente(req.body.idServer, empresaId);
        if (!usuarios.length) return res.status(404).send("Convite pendente não encontrado.");
        await emitirLink(req, usuarios[0], "Defina sua senha da EcomCore");
        return res.json({ mensagem: "Convite reenviado." });
    } catch (erro) {
        console.error("Erro ao reenviar convite:", erro.message);
        return res.status(502).send("Não foi possível reenviar o convite.");
    }
}

async function atualizar(req, res) {
    const id = Number(req.body.idServer);
    const senha = String(req.body.senhaServer || "");
    const empresaId = Number(req.body.fk_empresaServer);
    if (!Number.isInteger(id) || !Number.isInteger(empresaId) || !senha) return res.status(400).send("Dados incompletos.");
    if (senha.length < 8) return res.status(400).send("A senha precisa ter pelo menos 8 caracteres.");
    try {
        const resultado = await usuarioModel.atualizar(id, await senhaService.gerarHash(senha), empresaId);
        if (!resultado.affectedRows) return res.status(404).send("Usuário não encontrado.");
        return res.json(resultado);
    } catch (erro) {
        console.error("Erro ao atualizar senha:", erro.message);
        return res.status(500).send("Não foi possível atualizar a senha.");
    }
}

async function remover(req, res) {
    try {
        const resultado = await usuarioModel.remover(req.body.idServer, req.body.fk_empresaServer);
        if (!resultado.affectedRows) return res.status(404).send("Usuário não encontrado.");
        return res.json(resultado);
    } catch (erro) {
        return res.status(500).send("Não foi possível remover o usuário.");
    }
}

async function listar(req, res) {
    if (!req.body.fk_empresaServer) return res.status(400).send("Informe a empresa.");
    try {
        return res.status(200).json(await usuarioModel.listar(req.body.fk_empresaServer));
    } catch (erro) {
        return res.status(500).send("Não foi possível listar os usuários.");
    }
}

module.exports = { autenticar, cadastrar, definirSenha, solicitarRedefinicao, reenviarConvite, atualizar, remover, listar };
