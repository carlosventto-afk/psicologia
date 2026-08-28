import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { PLANOS } from "@/lib/planos";
import { escolherPlano } from "@/lib/actions/assinatura";
import EscolherPlanoForm from "@/components/EscolherPlanoForm";

export default async function PaginaAssinatura() {
  const usuario = await buscarUsuarioAtual();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Assinatura</h1>

      {usuario.assinatura_status === "inadimplente" && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          Seu último pagamento não foi confirmado. Você está temporariamente no plano Grátis. Regularize o
          pagamento para voltar ao plano {PLANOS[usuario.plano_pago]?.nome}.
        </p>
      )}

      {usuario.plano_pretendido && (
        <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          Sua mudança pra {PLANOS[usuario.plano_pretendido].nome} entra em vigor em{" "}
          {usuario.plano_pretendido_a_partir_de
            ? new Date(`${usuario.plano_pretendido_a_partir_de.slice(0, 10)}T00:00:00`).toLocaleDateString(
                "pt-BR"
              )
            : "breve"}
          .
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(PLANOS).map((plano) => (
          <div key={plano.id} className="card p-4 space-y-2">
            <p className="font-semibold text-navy">{plano.nome}</p>
            <p className="text-2xl font-bold text-navy">
              {plano.preco === 0 ? "Grátis" : `R$ ${plano.preco.toFixed(2).replace(".", ",")}`}
              {plano.preco > 0 && <span className="text-sm font-normal text-muted"> /mês</span>}
            </p>
            {usuario.plano === plano.id ? (
              <p className="text-sm text-muted">Plano atual</p>
            ) : (
              <EscolherPlanoForm action={escolherPlano.bind(null, plano.id)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
