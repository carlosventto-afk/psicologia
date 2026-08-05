import Link from "next/link";
import { buscarPerfisPublicos, listarEspecialidades } from "@/lib/data/diretorio";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CADASTRO_URL = `${SITE_URL}/cadastro?origem=busca`;

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

  return (
    <div className="space-y-6">
      <h1 className="page-title">Encontre um psicólogo</h1>

      <div className="card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">É psicólogo? Apareça aqui gratuitamente.</p>
          <p className="text-sm text-muted">
            Cadastre seu perfil e comece a ser encontrado por pacientes.
          </p>
        </div>
        <Link href={CADASTRO_URL} className="btn-primary whitespace-nowrap">
          Cadastre-se grátis
        </Link>
      </div>

      <form className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="cidade" className="block text-xs font-semibold text-navy">
            Cidade
          </label>
          <input
            id="cidade"
            name="cidade"
            type="text"
            defaultValue={filtros.cidade}
            className="field mt-0"
          />
        </div>
        <div>
          <label htmlFor="modalidade" className="block text-xs font-semibold text-navy">
            Modalidade
          </label>
          <select
            id="modalidade"
            name="modalidade"
            defaultValue={filtros.modalidade || ""}
            className="field mt-0"
          >
            <option value="">Qualquer</option>
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
        </div>
        <div>
          <label htmlFor="especialidade" className="block text-xs font-semibold text-navy">
            Especialidade
          </label>
          <select
            id="especialidade"
            name="especialidade"
            defaultValue={filtros.especialidade || ""}
            className="field mt-0"
          >
            <option value="">Qualquer</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="valorMax" className="block text-xs font-semibold text-navy">
            Valor máximo
          </label>
          <input
            id="valorMax"
            name="valorMax"
            type="number"
            step="0.01"
            placeholder="Sem limite"
            defaultValue={filtros.valorMax}
            className="field mt-0"
          />
        </div>
        <button type="submit" className="btn-primary">
          Filtrar
        </button>
      </form>

      {perfis.length === 0 ? (
        <p className="empty-state">Nenhum psicólogo encontrado com esses filtros.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {perfis.map((p) => (
            <Link key={p.id} href={`/${p.slug}`} className="card p-5 block">
              <div className="flex items-center gap-3">
                {p.foto_url && (
                  <img
                    src={p.foto_url}
                    alt={p.nome}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-navy">{p.nome}</p>
                  <p className="text-sm text-muted">
                    {p.cidade ? `${p.cidade}/${p.estado}` : "Atendimento online"} ·{" "}
                    {p.modalidade}
                  </p>
                </div>
              </div>
              {p.especialidades.length > 0 && (
                <p className="text-sm text-muted mt-3">{p.especialidades.join(", ")}</p>
              )}
              <p className="text-sm font-semibold text-navy mt-2">
                {p.valor_sessao ? `A partir de R$ ${p.valor_sessao}` : "Valor a combinar"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
