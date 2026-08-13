import { redirect } from "next/navigation";
import { buscarUsuarioAtual } from "@/lib/data/usuario";

export default async function LayoutGestao({ children }) {
  const usuario = await buscarUsuarioAtual();

  if (usuario.plano === "marketing") {
    redirect("/diretorio");
  }

  return children;
}
