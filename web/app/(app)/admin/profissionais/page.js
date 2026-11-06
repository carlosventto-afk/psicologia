import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";
import { listarProfissionais } from "@/lib/data/profissionais";
import { aprovarProfissional, alternarCriadorConteudo, marcarCrpConferido, revogarAprovacao, encerrarTestePlano, estenderTestePlano } from "@/lib/actions/profissionais";
import SeletorPlano from "@/components/SeletorPlano";
import LiberarTesteForm from "@/components/LiberarTesteForm";
import { podeReceberTeste } from "@/lib/teste-plano";

const NOMES_PLANO = {
  gestao: "Psi Gestão",
  gestao_marketing: "Psi Gestão + Marketing",
  marketing: "Psi Marketing",
};

function formatarDataCurta(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

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
                {p.aprovado && p.role !== "admin" && !p.crp_conferido && (
                  <form action={marcarCrpConferido.bind(null, p.id)}>
                    <button type="submit" className="btn-outline text-sm">
                      CRP a conferir — marcar conferido
                    </button>
                  </form>
                )}
                {p.aprovado && p.role !== "admin" && (
                  <form action={revogarAprovacao.bind(null, p.id)}>
                    <button type="submit" className="btn-outline text-sm">
                      Revogar aprovação
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
                {p.role !== "admin" && p.teste_expira_em && (
                  <>
                    <span className="text-sm text-amber-700">
                      Em teste ({NOMES_PLANO[p.teste_plano] ?? p.teste_plano}) até{" "}
                      {formatarDataCurta(p.teste_expira_em)}
                    </span>
                    <form action={encerrarTestePlano.bind(null, p.id)}>
                      <button type="submit" className="btn-outline text-sm">
                        Encerrar
                      </button>
                    </form>
                    <form action={estenderTestePlano.bind(null, p.id, 7)}>
                      <button type="submit" className="btn-outline text-sm">
                        Estender (+7 dias)
                      </button>
                    </form>
                  </>
                )}
                {p.role !== "admin" && !p.teste_expira_em && podeReceberTeste(p) && (
                  <LiberarTesteForm id={p.id} />
                )}
                <SeletorPlano id={p.id} planoAtual={p.plano} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
