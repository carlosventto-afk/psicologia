// web/lib/teste-plano.js
// Regras puras da liberação temporária (teste) de plano.

const DIA_MS = 24 * 60 * 60 * 1000;

// Planos que o admin pode liberar para teste.
export const PLANOS_LIBERAVEIS = ["gestao", "gestao_marketing", "marketing"];

// Quantos dias antes do fim o usuário é avisado.
export const DIAS_AVISO = 3;

// Elegível: plano grátis, sem plano pretendido e sem plano pago (um
// inadimplente pós-carência é rebaixado para grátis mas mantém plano_pago;
// o teste dele nunca expiraria e mascararia o plano pago). Também não é
// elegível quem tem assinatura viva (ativa/inadimplente).
export function podeReceberTeste(usuario) {
  return (
    usuario?.plano === "gratis" &&
    !usuario?.plano_pretendido &&
    !usuario?.plano_pago &&
    usuario?.assinatura_status !== "ativa" &&
    usuario?.assinatura_status !== "inadimplente"
  );
}

// Soma `dias` ao maior entre `agora` e `fimAtual` (estende teste vigente).
export function calcularFimTeste(agora, dias, fimAtual = null) {
  const base =
    fimAtual && fimAtual.getTime() > agora.getTime() ? fimAtual : agora;
  return new Date(base.getTime() + dias * DIA_MS);
}

// Dias inteiros restantes, arredondado para cima, mínimo 0.
export function diasRestantes(expiraEm, agora) {
  const fim = new Date(expiraEm).getTime();
  return Math.max(0, Math.ceil((fim - agora.getTime()) / DIA_MS));
}
