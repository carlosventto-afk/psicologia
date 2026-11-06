import Link from "next/link";
import { PLANOS } from "@/lib/planos";
import { DIAS_AVISO, diasRestantes } from "@/lib/teste-plano";

function textoPrazo(dias) {
  if (dias === 0) return "termina hoje";
  return `termina em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export default function BannerTestePlano({ plano, expiraEm, mostrarLink = true }) {
  if (!expiraEm) return null;

  const dias = diasRestantes(expiraEm, new Date());
  const aviso = dias <= DIAS_AVISO;
  const nome = PLANOS[plano]?.nome ?? plano;
  const data = new Date(expiraEm).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const estilo = aviso
    ? "border-orange-200 bg-orange-50 text-orange-800"
    : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div
      className={`px-4 py-2 text-sm ${
        mostrarLink ? "border-b" : "rounded-lg border"
      } ${estilo}`}
    >
      Você está testando o plano {nome}; {textoPrazo(dias)} ({data}), depois sua
      conta volta ao plano Grátis se você não contratar um plano pago.
      {mostrarLink && (
        <>
          {" "}
          <Link href="/assinatura" className="font-semibold underline">
            Contratar
          </Link>
        </>
      )}
    </div>
  );
}
