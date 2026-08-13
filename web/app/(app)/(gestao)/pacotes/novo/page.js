import PacoteForm from "@/components/PacoteForm";
import { criarPacote } from "@/lib/actions/pacotes";
import { listarTiposAtendimento, listarTiposCobranca } from "@/lib/data/lookups";

export default async function PaginaNovoPacote() {
  const [tiposAtendimento, tiposCobranca] = await Promise.all([
    listarTiposAtendimento(),
    listarTiposCobranca(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Novo Pacote</h1>
      <PacoteForm action={criarPacote} tiposAtendimento={tiposAtendimento} tiposCobranca={tiposCobranca} />
    </div>
  );
}
