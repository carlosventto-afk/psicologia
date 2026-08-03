import ArtigoForm from "@/components/ArtigoForm";
import { buscarArtigoAdmin } from "@/lib/data/artigos";
import { atualizarArtigo } from "@/lib/actions/artigos";

export default async function PaginaEditarArtigo({ params }) {
  const { id } = await params;
  const artigo = await buscarArtigoAdmin(id);
  const acaoComId = atualizarArtigo.bind(null, id);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Artigo</h1>
      <ArtigoForm action={acaoComId} artigo={artigo} />
    </div>
  );
}
