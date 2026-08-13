import ImportarPacientesWizard from "@/components/ImportarPacientesWizard";
import { listarConsultorios } from "@/lib/data/consultorios";

export default async function PaginaImportarPacientes() {
  const consultorios = await listarConsultorios();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Importar Pacientes</h1>
      <ImportarPacientesWizard consultorios={consultorios} />
    </div>
  );
}
