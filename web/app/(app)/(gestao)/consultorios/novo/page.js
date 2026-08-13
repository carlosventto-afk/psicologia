import ConsultorioForm from "@/components/ConsultorioForm";
import { criarConsultorio } from "@/lib/actions/consultorios";

export default function PaginaNovoConsultorio() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">Cadastrar Consultório</h1>
      <ConsultorioForm action={criarConsultorio} />
    </div>
  );
}
