import ArtigoForm from "@/components/ArtigoForm";
import { criarArtigo } from "@/lib/actions/artigos";

export default function PaginaNovoArtigo() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Artigo</h1>
      <ArtigoForm action={criarArtigo} />
    </div>
  );
}
