import Link from "next/link";

// Filtros do blog. Cada categoria é uma página própria (/categoria/<slug>) e
// não um parâmetro de URL: página com endereço fixo pode ser indexada,
// linkada e compartilhada.
export default function CategoriasBlog({ categorias, ativa }) {
  return (
    <nav aria-label="Categorias" className="flex flex-wrap gap-2 mb-6">
      <Link href="/" className={`blog-categoria-pill ${!ativa ? "blog-categoria-pill-ativa" : ""}`}>
        Todos
      </Link>
      {categorias.map((c) => (
        <Link
          key={c.slug}
          href={`/categoria/${c.slug}`}
          className={`blog-categoria-pill ${ativa === c.slug ? "blog-categoria-pill-ativa" : ""}`}
        >
          {c.nome}
        </Link>
      ))}
    </nav>
  );
}
