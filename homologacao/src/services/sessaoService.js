const crypto = require("crypto");

function segredo() {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (process.env.AMBIENTE_PROCESSO === "producao") {
        throw new Error("Defina SESSION_SECRET no ambiente de produção.");
    }
    return "ecomcore-chave-academica-apenas-desenvolvimento";
}

function assinar(conteudo) {
    return crypto.createHmac("sha256", segredo()).update(conteudo).digest("base64url");
}

function criar(usuario) {
    const agora = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        id: usuario.id,
        fk_empresa: usuario.empresaId,
        cargo: usuario.cargo,
        exp: agora + 8 * 60 * 60
    })).toString("base64url");
    return `${payload}.${assinar(payload)}`;
}

function validar(token) {
    if (!token || typeof token !== "string") return null;
    const partes = token.split(".");
    if (partes.length !== 2) return null;
    const assinaturaEsperada = Buffer.from(assinar(partes[0]));
    const assinaturaRecebida = Buffer.from(partes[1]);
    if (assinaturaEsperada.length !== assinaturaRecebida.length ||
        !crypto.timingSafeEqual(assinaturaEsperada, assinaturaRecebida)) return null;
    try {
        const payload = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
        if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

module.exports = { criar, validar };
