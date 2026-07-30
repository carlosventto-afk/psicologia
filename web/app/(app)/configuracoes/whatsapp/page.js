import VincularWhatsappForm from "@/components/VincularWhatsappForm";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function PaginaConfiguracoesWhatsapp() {
  const usuario = await buscarUsuarioAtual();

  return (
    <div className="space-y-4">
      <h1 className="page-title">Vincular WhatsApp</h1>

      {usuario.whatsapp_verified ? (
        <div className="card p-6 max-w-md space-y-2">
          <p className="text-sm text-navy">
            Seu WhatsApp já está vinculado: <strong>{usuario.whatsapp_number}</strong>
          </p>
          <p className="text-xs text-muted">
            Para trocar de número, gere um novo código abaixo e confirme pelo WhatsApp.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted max-w-md">
          Vincule seu número para consultar sua agenda, pacientes e financeiro diretamente pelo WhatsApp.
        </p>
      )}

      <VincularWhatsappForm />
    </div>
  );
}
