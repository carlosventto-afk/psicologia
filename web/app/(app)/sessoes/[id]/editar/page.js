import SessaoEditForm from "@/components/SessaoEditForm";
import { buscarSessao } from "@/lib/data/sessoes";
import { listarPacientesParaSelect } from "@/lib/data/pacientes";
import { listarTiposAtendimento } from "@/lib/data/lookups";
import { atualizarSessao, cancelarSessao } from "@/lib/actions/sessoes";

export default async function PaginaEditarSessao({ params }) {
  const { id } = await params;
  const sessaoId = Number(id);

  const [sessao, pacientes, tiposAtendimento] = await Promise.all([
    buscarSessao(sessaoId),
    listarPacientesParaSelect(),
    listarTiposAtendimento(),
  ]);

  const acaoAtualizar = atualizarSessao.bind(null, sessaoId);
  const acaoCancelar = cancelarSessao.bind(null, sessaoId);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Sessão</h1>
      <SessaoEditForm
        action={acaoAtualizar}
        cancelarAction={acaoCancelar}
        sessao={sessao}
        pacientes={pacientes}
        tiposAtendimento={tiposAtendimento}
      />
    </div>
  );
}
