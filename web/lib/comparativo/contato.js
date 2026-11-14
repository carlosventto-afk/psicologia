const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NOME_MAX = 120;
const EMAIL_MAX = 254;

export function validarContato({ nome, whatsapp, email } = {}) {
  // CR/LF removidos: o nome vai para o assunto do e-mail (evita injeção de cabeçalho).
  const nomeLimpo = typeof nome === "string" ? nome.replace(/[\r\n]+/g, " ").trim() : "";
  if (nomeLimpo.length < 2) {
    return { ok: false, erro: "Informe seu nome." };
  }
  if (nomeLimpo.length > NOME_MAX) {
    return { ok: false, erro: `O nome deve ter no máximo ${NOME_MAX} caracteres.` };
  }

  const digitos = typeof whatsapp === "string" ? whatsapp.replace(/\D/g, "") : "";
  if (digitos.length < 10 || digitos.length > 13) {
    return { ok: false, erro: "Informe um WhatsApp válido, com DDD." };
  }

  const emailLimpo = typeof email === "string" ? email.trim() : "";
  if (emailLimpo.length > EMAIL_MAX) {
    return { ok: false, erro: `O e-mail deve ter no máximo ${EMAIL_MAX} caracteres.` };
  }
  if (!EMAIL_RE.test(emailLimpo)) {
    return { ok: false, erro: "Informe um e-mail válido." };
  }

  return { ok: true, valor: { nome: nomeLimpo, whatsapp: digitos, email: emailLimpo } };
}
