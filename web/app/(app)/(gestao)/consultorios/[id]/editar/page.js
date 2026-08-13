import ConsultorioForm from "@/components/ConsultorioForm";
import { buscarConsultorio } from "@/lib/data/consultorios";
import { atualizarConsultorio } from "@/lib/actions/consultorios";

export default async function PaginaEditarConsultorio({ params }) {
  const { id } = await params;
  const consultorio = await buscarConsultorio(Number(id));
  const acaoComId = atualizarConsultorio.bind(null, Number(id));

  return (
    <div className="space-y-4">
      <h1 className="page-title">Editar Consultório</h1>
      <ConsultorioForm action={acaoComId} consultorio={consultorio} />
    </div>
  );
}
