import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { listarProfissionais } from "@/lib/data/profissionais";
import { aprovarProfissional, alternarCriadorConteudo } from "@/lib/actions/profissionais";
import SeletorPlano from "@/components/SeletorPlano";
import LiberarTesteForm from "@/components/LiberarTesteForm";

export default async function PaginaProfissionais() {
  const usuario = await buscarUsuarioAtual();
  if (usuario.role !== "admin") {
    redirect("/admin/artigos");
  }

  const profissionais = await listarProfissionais();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Profissionais</h1>
        <Link href="/admin/profissionais/novo" className="btn-primary">
          Convidar profissional
        </Link>
      </div>

      {profissionais.length === 0 ? (
        <p className="empty-state">Nenhum profissional cadastrado ainda.</p>
      ) : (
        <div className="space-y-3">
          {profissionais.map((p) => (
            <div
              key={p.id}
              className="card flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy">{p.nome}</p>
                <p className="text-sm text-muted">
                  {p.email} · {p.contato}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted">
                  {p.role === "admin" ? "Admin" : "Psicólogo"}
                </span>
                {p.aprovado ? (
                  <span className="text-sm text-green-700">Aprovado</span>
                ) : (
                  <form action={aprovarProfissional.bind(null, p.id)}>
                    <button type="submit" className="btn-outline text-sm">
                      Aprovar (pendente)
                    </button>
                  </form>
                )}
                {p.role !== "admin" && (
                  <form action={alternarCriadorConteudo.bind(null, p.id, p.criador_conteudo)}>
                    <button type="submit" className="btn-outline text-sm">
                      {p.criador_conteudo ? "Remover criador de conteúdo" : "Tornar criador de conteúdo"}
                    </button>
                  </form>
                )}
                <SeletorPlano id={p.id} planoAtual={p.plano} />
                <LiberarTesteForm id={p.id} planoPago={p.plano_pago} planoTesteExpiraEm={p.plano_teste_expira_em} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
