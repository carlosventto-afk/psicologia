import Link from "next/link";

// "Leia também" no fim do artigo: até três artigos, com preferência para os da
// mesma categoria (ver escolherRelacionados em lib/blog.js). Dá ao leitor o
// próximo passo e, de quebra, liga os artigos entre si para o robô.
export default function LeiaTambem({ artigos }) {
  if (artigos.length === 0) return null;

  return (
    <section aria-labelledby="leia-tambem" className="mt-12 pt-8 border-t border-border">
      <h2 id="leia-tambem" className="font-display text-xl font-bold text-navy">
        Leia também
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {artigos.map((a) => (
          <Link key={a.id} href={`/${a.slug}`} data-relacionado className="card block p-4 hover:shadow-md transition-shadow">
            <p className="blog-meta">{new Date(a.publicado_em).toLocaleDateString("pt-BR")}</p>
            <h3 className="mt-1 text-base font-bold text-navy leading-snug">{a.titulo}</h3>
            {a.resumo && <p className="mt-2 text-sm text-muted line-clamp-3">{a.resumo}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
