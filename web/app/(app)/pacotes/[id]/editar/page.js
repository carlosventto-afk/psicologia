import PacoteForm from "@/components/PacoteForm";
import { buscarPacote } from "@/lib/data/pacotes";
import { atualizarPacote } from "@/lib/actions/pacotes";
import { listarTiposAtendimento, listarTiposCobranca } from "@/lib/data/lookups";

export default async function PaginaEditarPacote({ params }) {
  const { id } = await params;
  const [pacote, tiposAtendimento, tiposCobranca] = await Promise.all([
    buscarPacote(Number(id)),
    listarTiposAtendimento(),
    listarTiposCobranca(),
  ]);
  const acaoComId = atualizarPacote.bind(null, Number(id));

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Pacote</h1>
      <PacoteForm
        action={acaoComId}
        pacote={pacote}
        tiposAtendimento={tiposAtendimento}
        tiposCobranca={tiposCobranca}
      />
    </div>
  );
}
