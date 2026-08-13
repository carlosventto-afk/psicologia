import Link from "next/link";
import { buscarPerfisPublicos, listarEspecialidades } from "@/lib/data/diretorio";
import { iniciais } from "@/lib/iniciais";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CADASTRO_URL = `${SITE_URL}/cadastro?origem=busca`;

const RESUMO_MODALIDADE = {
  presencial: "Presencial",
  online: "Online",
  ambos: "Presencial ou online",
};

const PONTO_MODALIDADE = {
  presencial: { cor: "bg-navy", titulo: "Atende presencial" },
  online: { cor: "bg-primary", titulo: "Atende online" },
  ambos: { cor: "bg-gradient-to-br from-navy to-primary", titulo: "Atende presencial e online" },
};

export default async function PaginaBusca({ searchParams }) {
  const params = await searchParams;

  const filtros = {
    cidade: params.cidade || undefined,
    modalidade: params.modalidade || undefined,
    especialidade: params.especialidade || undefined,
    valorMax: params.valorMax || undefined,
  };

  const [perfis, especialidades] = await Promise.all([
    buscarPerfisPublicos(filtros),
    listarEspecialidades(),
  ]);

  const especialidadesEmDestaque = especialidades.slice(0, 7);

  return (
    <div>
      {/* Hero — banda cheia com formas orgânicas, inspirada no brief de
          marketplace (TaskRabbit), mas só com a paleta PsiAgente. */}
      <section className="relative overflow-hidden bg-navy">
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-16 top-10 h-56 w-56 rounded-full bg-primary/15 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-0 right-1/4 h-40 w-40 rounded-full bg-white/5 blur-xl"
          aria-hidden="true"
        />

        <div className="relative max-w-5xl mx-auto px-4 pt-12 pb-10 sm:pt-16 sm:pb-14">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight">
              Encontre o psicólogo certo pra você
            </h1>
            <p className="mt-3 text-white/75 text-base sm:text-lg">
              Filtre por cidade, especialidade e modalidade — e entre em contato direto pelo
              WhatsApp, sem intermediários.
            </p>
          </div>

          <form className="mt-8 card p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
            <input
              name="cidade"
              type="text"
              defaultValue={filtros.cidade}
              placeholder="Sua cidade"
              aria-label="Cidade"
              className="field mt-0 flex-1"
            />
            <select
              name="modalidade"
              defaultValue={filtros.modalidade || ""}
              aria-label="Modalidade"
              className="field mt-0 sm:w-44 rounded-full"
            >
              <option value="">Qualquer modalidade</option>
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
            </select>
            <select
              name="especialidade"
              defaultValue={filtros.especialidade || ""}
              aria-label="Especialidade"
              className="field mt-0 sm:w-48 rounded-full"
            >
              <option value="">Qualquer especialidade</option>
              {especialidades.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            <input
              name="valorMax"
              type="number"
              step="0.01"
              defaultValue={filtros.valorMax}
              placeholder="Valor máx."
              aria-label="Valor máximo"
              className="field mt-0 sm:w-32"
            />
            <button type="submit" className="btn-primary sm:px-6">
              Buscar
            </button>
          </form>

          {especialidadesEmDestaque.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {especialidadesEmDestaque.map((e) => (
                <Link
                  key={e.id}
                  href={`?especialidade=${e.id}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    String(filtros.especialidade) === String(e.id)
                      ? "bg-primary text-white"
                      : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >
                  {e.nome}
                </Link>
              ))}
            </div>
          )}

          <p className="mt-6 text-sm text-white/70">
            É psicólogo?{" "}
            <Link href={CADASTRO_URL} className="font-semibold text-white underline underline-offset-2">
              Cadastre-se grátis
            </Link>{" "}
            e comece a ser encontrado por pacientes.
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <p className="text-sm text-muted">
          {perfis.length === 0
            ? "Nenhum psicólogo encontrado"
            : `${perfis.length} psicólogo${perfis.length > 1 ? "s" : ""} encontrado${perfis.length > 1 ? "s" : ""}`}
          {filtros.cidade || filtros.modalidade || filtros.especialidade || filtros.valorMax
            ? " com esses filtros."
            : "."}
        </p>

        {perfis.length === 0 ? (
          <p className="empty-state">Nenhum psicólogo encontrado com esses filtros.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {perfis.map((p) => {
              const ponto = PONTO_MODALIDADE[p.modalidade];
              return (
                <Link
                  key={p.id}
                  href={`/${p.slug}`}
                  className="card p-5 flex flex-col transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      {p.foto_url ? (
                        <img
                          src={p.foto_url}
                          alt={p.nome}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {iniciais(p.nome)}
                        </div>
                      )}
                      {ponto && (
                        <span
                          title={ponto.titulo}
                          className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${ponto.cor}`}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-navy truncate">{p.nome}</p>
                      <p className="text-sm text-muted">
                        {p.cidade ? `${p.cidade}/${p.estado}` : "Atendimento online"}
                      </p>
                      <p className="text-xs text-muted">{RESUMO_MODALIDADE[p.modalidade] ?? p.modalidade}</p>
                    </div>
                  </div>

                  {p.especialidades.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.especialidades.slice(0, 3).map((esp) => (
                        <span
                          key={esp}
                          className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-navy"
                        >
                          {esp}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mt-auto pt-3 text-sm font-bold text-navy">
                    {p.valor_sessao ? (
                      <>
                        R$ {p.valor_sessao} <span className="font-normal text-muted">/ sessão</span>
                      </>
                    ) : (
                      <span className="font-normal text-muted">Valor a combinar</span>
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
