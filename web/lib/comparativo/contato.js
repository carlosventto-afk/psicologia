const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarContato({ nome, whatsapp, email } = {}) {
  const nomeLimpo = typeof nome === "string" ? nome.trim() : "";
  if (nomeLimpo.length < 2) {
    return { ok: false, erro: "Informe seu nome." };
  }

  const digitos = typeof whatsapp === "string" ? whatsapp.replace(/\D/g, "") : "";
  if (digitos.length < 10 || digitos.length > 13) {
    return { ok: false, erro: "Informe um WhatsApp válido, com DDD." };
  }

  const emailLimpo = typeof email === "string" ? email.trim() : "";
  if (!EMAIL_RE.test(emailLimpo)) {
    return { ok: false, erro: "Informe um e-mail válido." };
  }

  return { ok: true, valor: { nome: nomeLimpo, whatsapp: digitos, email: emailLimpo } };
}
