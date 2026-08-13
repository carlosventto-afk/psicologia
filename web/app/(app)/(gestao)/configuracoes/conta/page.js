import MeusDadosForm from "@/components/MeusDadosForm";
import { atualizarMeusDados } from "@/lib/actions/usuario";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function PaginaMeusDados() {
  const usuario = await buscarUsuarioAtual();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Meus Dados</h1>
      <MeusDadosForm action={atualizarMeusDados} usuario={usuario} />
    </div>
  );
}
