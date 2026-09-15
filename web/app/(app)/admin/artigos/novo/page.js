import ArtigoForm from "@/components/ArtigoForm";
import { criarArtigo } from "@/lib/actions/artigos";
import { listarCategorias } from "@/lib/data/categorias";

export default async function PaginaNovoArtigo() {
  const categorias = await listarCategorias();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Artigo</h1>
      <ArtigoForm action={criarArtigo} categorias={categorias} />
    </div>
  );
}
