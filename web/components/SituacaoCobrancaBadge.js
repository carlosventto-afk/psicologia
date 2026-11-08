const ROTULOS = { aberta: "Em aberto", recebida: "Recebida", cancelada: "Cancelada" };
const CORES = {
  aberta: "bg-yellow-100 text-yellow-800",
  recebida: "bg-green-100 text-green-800",
  cancelada: "bg-gray-100 text-gray-600",
};

export const ROTULOS_DOCUMENTO = { nenhum: "Nenhum", recibo: "Recibo", nota_fiscal: "Nota Fiscal" };

export function dataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export default function SituacaoCobrancaBadge({ situacao }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CORES[situacao] ?? CORES.cancelada}`}>
      {ROTULOS[situacao] ?? situacao}
    </span>
  );
}
