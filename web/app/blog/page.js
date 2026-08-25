import Link from "next/link";
import { listarArtigosPublicados } from "@/lib/data/artigos";
import { calcularTempoLeitura } from "@/lib/tempo-leitura";

export default async function PaginaBlog() {
  const artigos = await listarArtigosPublicados();

  if (artigos.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Blog</h1>
        <p className="empty-state">Nenhum artigo publicado ainda.</p>
      </div>
    );
  }

  const [destaque, ...restantes] = artigos;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="page-title mb-6">Blog</h1>

        <Link href={`/${destaque.slug}`} className="blog-hero">
          {destaque.imagem_capa ? (
            <img src={destaque.imagem_capa} alt={destaque.titulo} className="blog-hero-img" />
          ) : (
            <div className="blog-hero-fallback" />
          )}
          <div className="blog-hero-body">
            <p className="blog-meta">
              {new Date(destaque.publicado_em).toLocaleDateString("pt-BR")}
              {destaque.autor && ` · ${destaque.autor}`}
              {` · ${calcularTempoLeitura(destaque.conteudo)} min de leitura`}
            </p>
            <h2 className="font-display text-2xl font-bold text-navy mt-2">{destaque.titulo}</h2>
            {destaque.resumo && <p className="text-muted mt-2">{destaque.resumo}</p>}
          </div>
        </Link>
      </div>

      {restantes.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
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
    </div>
  );
}
