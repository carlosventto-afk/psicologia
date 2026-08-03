import ConvidarProfissionalForm from "@/components/ConvidarProfissionalForm";
import { convidarProfissional } from "@/lib/actions/profissionais";

export default function PaginaConvidarProfissional() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">Convidar Profissional</h1>
      <ConvidarProfissionalForm action={convidarProfissional} />
    </div>
  );
}
