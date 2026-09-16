import Link from "next/link";
import { listarArtigosPublicados } from "@/lib/data/artigos";
import { listarCategorias } from "@/lib/data/categorias";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";

export default async function PaginaBlog({ searchParams }) {
  const { categoria } = await searchParams;
  const [artigos, categorias] = await Promise.all([
    listarArtigosPublicados(categoria),
    listarCategorias(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="page-title mb-4">Blog</h1>

        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/"
            className={`blog-categoria-pill ${!categoria ? "blog-categoria-pill-ativa" : ""}`}
          >
            Todos
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.slug}
              href={`/?categoria=${c.slug}`}
              className={`blog-categoria-pill ${categoria === c.slug ? "blog-categoria-pill-ativa" : ""}`}
            >
              {c.nome}
            </Link>
          ))}
        </div>

        {artigos.length === 0 ? (
          <p className="empty-state">
            {categoria ? "Nenhum artigo publicado nessa categoria ainda." : "Nenhum artigo publicado ainda."}
          </p>
        ) : (
          (() => {
            const [destaque, ...restantes] = artigos;
            return (
              <>
                <Link href={`/${destaque.slug}`} className="blog-hero">
                  {destaque.imagem_capa ? (
                    <img src={destaque.imagem_capa} alt={destaque.titulo} className="blog-hero-img" />
                  ) : (
                    <div className="blog-hero-fallback" />
                  )}
                  <div className="blog-hero-body">
                    {destaque.categorias.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {destaque.categorias.map((c) => (
                          <span key={c.slug} className="blog-categoria-badge">
                            {c.nome}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="blog-meta">
                      {new Date(destaque.publicado_em).toLocaleDateString("pt-BR")}
                      {destaque.autor && ` · ${destaque.autor}`}
                      {` · ${calcularTempoLeitura(destaque.conteudo)} min de leitura`}
                    </p>
                    <h2 className="font-display text-2xl font-bold text-navy mt-2">{destaque.titulo}</h2>
                    {destaque.resumo && <p className="text-muted mt-2">{destaque.resumo}</p>}
                  </div>
                </Link>

                {restantes.length > 0 && (
                  <div className="grid gap-5 sm:grid-cols-2 mt-8">
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
                          {a.categorias.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {a.categorias.map((c) => (
                                <span key={c.slug} className="blog-categoria-badge">
                                  {c.nome}
                                </span>
                              ))}
                            </div>
                          )}
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
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
