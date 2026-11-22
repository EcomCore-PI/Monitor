const nodemailer = require("nodemailer");

function criarTransportador() {
    const host = process.env.EMAIL_SMTP_HOST;
    const port = Number(process.env.EMAIL_SMTP_PORT || 587);
    const user = process.env.EMAIL_SMTP_USER;
    const pass = process.env.EMAIL_SMTP_PASSWORD;

    if (!host || !user || !pass) {
        throw new Error("Configure EMAIL_SMTP_HOST, EMAIL_SMTP_USER e EMAIL_SMTP_PASSWORD no .env.dev.");
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });
}

function estaConfigurado() {
    return Boolean(process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASSWORD);
}

async function enviarLink(to, nome, link, assunto) {
    const remetente = process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER;
    const transporter = criarTransportador();
    await transporter.sendMail({
        from: remetente,
        to,
        subject: assunto,
        text: `Olá, ${nome}!\n\nAcesse o link abaixo para definir sua senha da EcomCore. O link expira em 1 hora e pode ser usado uma única vez:\n\n${link}\n\nSe você não solicitou este acesso, ignore esta mensagem.`,
        html: `<p>Olá, ${escapeHtml(nome)}!</p><p>Acesse o link abaixo para definir sua senha da EcomCore. O link expira em 1 hora e pode ser usado uma única vez.</p><p><a href="${escapeHtml(link)}">Definir minha senha</a></p><p>Se você não solicitou este acesso, ignore esta mensagem.</p>`
    });
}

function escapeHtml(valor) {
    return String(valor).replace(/[&<>"']/g, caractere => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[caractere]));
}

module.exports = { enviarLink, estaConfigurado };
