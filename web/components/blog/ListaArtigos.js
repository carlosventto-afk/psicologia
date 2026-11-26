import Link from "next/link";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";

function Selos({ categorias }) {
  if (!categorias?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {categorias.map((c) => (
        <span key={c.slug} className="blog-categoria-badge">
          {c.nome}
        </span>
      ))}
    </div>
  );
}

function Paginacao({ paginacao, caminhoBase }) {
  if (paginacao.totalPaginas <= 1) return null;

  // Página 1 não leva parâmetro: é o mesmo endereço do canonical.
  const href = (n) => (n === 1 ? caminhoBase : `${caminhoBase}?pagina=${n}`);
  const numeros = paginacao.totalPaginas <= 9 ? Array.from({ length: paginacao.totalPaginas }, (_, i) => i + 1) : [];

  return (
    <nav aria-label="Paginação" className="mt-10 flex items-center justify-between gap-4 text-sm font-semibold">
      {paginacao.anterior ? (
        <Link href={href(paginacao.anterior)} rel="prev" className="btn-outline">
          ‹ Mais recentes
        </Link>
      ) : (
        <span />
      )}

      {numeros.length > 0 ? (
        <ol className="flex items-center gap-1">
          {numeros.map((n) => (
            <li key={n}>
              {n === paginacao.pagina ? (
                <span aria-current="page" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-navy text-white">
                  {n}
                </span>
              ) : (
                <Link href={href(n)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-navy hover:bg-border">
                  {n}
                </Link>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <span className="text-muted">
          Página {paginacao.pagina} de {paginacao.totalPaginas}
        </span>
      )}

      {paginacao.proxima ? (
        <Link href={href(paginacao.proxima)} rel="next" className="btn-outline">
          Mais antigos ›
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

// Listagem de artigos de uma página: destaque grande só na primeira página,
// grade nas demais, e a navegação entre páginas. `caminhoBase` é o endereço
// da primeira página ("/" ou "/categoria/<slug>").
export default function ListaArtigos({ artigos, paginacao, caminhoBase, vazio }) {
  if (artigos.length === 0) return <p className="empty-state">{vazio}</p>;

  const destaque = paginacao.pagina === 1 ? artigos[0] : null;
  const restantes = destaque ? artigos.slice(1) : artigos;

  return (
    <>
      {destaque && (
        <Link href={`/${destaque.slug}`} className="blog-hero">
          {destaque.imagem_capa ? (
            <img src={destaque.imagem_capa} alt={destaque.titulo} className="blog-hero-img" />
          ) : (
            <div className="blog-hero-fallback" />
          )}
          <div className="blog-hero-body">
            <Selos categorias={destaque.categorias} />
            <p className="blog-meta">
              {new Date(destaque.publicado_em).toLocaleDateString("pt-BR")}
              {destaque.autor && ` · ${destaque.autor}`}
              {` · ${calcularTempoLeitura(destaque.conteudo)} min de leitura`}
            </p>
            <h2 className="font-display text-2xl font-bold text-navy mt-2">{destaque.titulo}</h2>
            {destaque.resumo && <p className="text-muted mt-2">{destaque.resumo}</p>}
          </div>
        </Link>
      )}

      {restantes.length > 0 && (
        <div className={`grid gap-5 sm:grid-cols-2 ${destaque ? "mt-8" : ""}`}>
          {restantes.map((a) => (
            <Link key={a.id} href={`/${a.slug}`} className="card overflow-hidden block">
              {a.imagem_capa ? (
                <img src={a.imagem_capa} alt={a.titulo} className="blog-card-img" />
              ) : (
                <div className="blog-card-fallback">
                  <span>{a.titulo}</span>
                </div>
              )}
              <div className="p-5">
                <Selos categorias={a.categorias} />
                <p className="blog-meta">
                  {new Date(a.publicado_em).toLocaleDateString("pt-BR")}
                  {a.autor && ` · ${a.autor}`}
                  {` · ${calcularTempoLeitura(a.conteudo)} min`}
                </p>
                <h2 className="text-lg font-bold text-navy mt-1">{a.titulo}</h2>
                {a.resumo && <p className="text-sm text-muted mt-2">{a.resumo}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Paginacao paginacao={paginacao} caminhoBase={caminhoBase} />
    </>
  );
}
