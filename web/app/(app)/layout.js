import { buscarUsuarioAtual } from "@/lib/data/usuario";
import SidebarNav from "@/components/SidebarNav";

export default async function LayoutApp({ children }) {
  const usuario = await buscarUsuarioAtual();

  return (
    <div className="min-h-screen lg:flex">
      <SidebarNav ehAdmin={usuario.role === "admin"} nome={usuario.nome} papel={usuario.role} />

      <div className="min-w-0 flex-1">
        {!usuario.aprovado && (
          <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            Seu cadastro está pendente de aprovação por um administrador. Você já
            pode usar a ferramenta normalmente enquanto aguarda.
          </div>
        )}
        <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
