export const JANELA_DUPLICIDADE_MIN = 10;

// Instante (ISO) a partir do qual um Lead do comparativo conta como recente.
export function limiteDuplicidade(agora = new Date(), minutos = JANELA_DUPLICIDADE_MIN) {
  return new Date(agora.getTime() - minutos * 60 * 1000).toISOString();
}

// Dado leads candidatos ({ id, telefone, visitante_sessao_id, created_at }), devolve o
// primeiro criado dentro da janela com o mesmo telefone ou a mesma sessão; senão null.
export function acharDuplicado(candidatos, { telefone, sessaoId, agora = new Date() }) {
  const corte = new Date(limiteDuplicidade(agora)).getTime();
  for (const c of candidatos ?? []) {
    const criado = new Date(c?.created_at).getTime();
    if (!Number.isFinite(criado) || criado < corte || criado > agora.getTime()) continue;
    if (telefone && c.telefone === telefone) return c;
    if (sessaoId && c.visitante_sessao_id === sessaoId) return c;
  }
  return null;
}
