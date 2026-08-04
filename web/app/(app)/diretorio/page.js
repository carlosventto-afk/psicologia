import PerfilDiretorioForm from "@/components/PerfilDiretorioForm";
import { salvarPerfil } from "@/lib/actions/diretorio";
import { buscarMeuPerfil, listarEspecialidades, contarMeusContatos } from "@/lib/data/diretorio";

export default async function PaginaDiretorio() {
  const [perfil, especialidades, totalContatos] = await Promise.all([
    buscarMeuPerfil(),
    listarEspecialidades(),
    contarMeusContatos(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Meu Perfil no Diretório</h1>
        <p className="text-sm text-muted">{totalContatos} contato(s) recebido(s)</p>
      </div>
      <PerfilDiretorioForm action={salvarPerfil} perfil={perfil} especialidades={especialidades} />
    </div>
  );
}
