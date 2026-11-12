import { formatarDataHoraSaoPaulo } from "@/lib/nota-fiscal";

const ROTULOS = { pendente: "Pendente", autorizada: "Autorizada", rejeitada: "Rejeitada", cancelada: "Cancelada" };
const CORES = {
  pendente: "bg-yellow-100 text-yellow-800",
  autorizada: "bg-green-100 text-green-800",
  rejeitada: "bg-red-100 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
};

function entrega(nota) {
  const itens = [];
  if (nota.enviada_email_em) itens.push(`E-mail enviado em ${formatarDataHoraSaoPaulo(nota.enviada_email_em)}`);
  if (nota.enviada_whatsapp_em) itens.push(`WhatsApp enviado em ${formatarDataHoraSaoPaulo(nota.enviada_whatsapp_em)}`);
  return itens;
}

// Estado das notas da cobrança (server component). `pendencia` é um aviso opcional
// de por que ainda não há nota.
export default function NotaCobrancaStatus({ notas, pendencia }) {
  const lista = notas ?? [];
  if (lista.length === 0 && !pendencia) return null;

  return (
    <div className="card space-y-3 p-4 text-sm">
      <h2 className="text-lg font-bold text-navy">Nota fiscal</h2>
      {pendencia && lista.length === 0 && <p className="text-yellow-700">{pendencia}</p>}
      {lista.map((n) => (
        <div key={n.id} className="space-y-1 border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CORES[n.status] ?? CORES.cancelada}`}>
              {ROTULOS[n.status] ?? n.status}
            </span>
            {n.numero != null && <span className="text-muted">Nº {n.numero}</span>}
          </p>
          {n.status === "autorizada" && n.chave_acesso && (
            <p className="break-all">
              <span className="font-semibold text-navy">Chave de acesso:</span> {n.chave_acesso}
            </p>
          )}
          {n.status === "autorizada" &&
            (entrega(n).length > 0 ? (
              entrega(n).map((t) => (
                <p key={t} className="text-muted">
                  {t}
                </p>
              ))
            ) : (
              <p className="text-muted">Ainda não enviada ao tomador.</p>
            ))}
          {n.status === "pendente" && (
            <p className="text-yellow-700">
              Aguardando confirmação da prefeitura — não emita de novo; confira no portal da NFS-e
            </p>
          )}
          {n.status === "rejeitada" && n.ultimo_erro && <p className="text-red-600">{n.ultimo_erro}</p>}
        </div>
      ))}
    </div>
  );
}
