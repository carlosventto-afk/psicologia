import { redirect } from "next/navigation";
import PerfilDiretorioForm from "@/components/PerfilDiretorioForm";
import BotaoCompartilharPerfil from "@/components/BotaoCompartilharPerfil";
import { salvarPerfil } from "@/lib/actions/diretorio";
import { buscarMeuPerfil, listarEspecialidades, contarMeusContatos } from "@/lib/data/diretorio";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function PaginaDiretorio() {
  const [perfil, especialidades, totalContatos, usuario] = await Promise.all([
    buscarMeuPerfil(),
    listarEspecialidades(),
    contarMeusContatos(),
    buscarUsuarioAtual(),
  ]);

  if (usuario.plano === "gestao") {
    redirect("/");
  }

  const buscaUrl = process.env.NEXT_PUBLIC_BUSCA_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Meu Perfil no Diretório</h1>
        <p className="text-sm text-muted">{totalContatos} contato(s) recebido(s)</p>
      </div>
      {!usuario.aprovado && (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          Seu cadastro ainda não foi aprovado por um administrador — seu perfil
          só aparece publicamente no diretório depois da aprovação, mesmo que
          você marque "Aparecer no diretório público" e salve.
        </p>
      )}
      {perfil?.slug && perfil?.visivel_diretorio && (
        <BotaoCompartilharPerfil url={`${buscaUrl}/${perfil.slug}`} />
      )}
      <PerfilDiretorioForm action={salvarPerfil} perfil={perfil} especialidades={especialidades} />
    </div>
  );
}
