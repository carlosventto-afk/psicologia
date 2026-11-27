"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { publicarArtigosEmLote } from "@/lib/actions/artigos";

function quantosArtigos(n) {
  return n === 1 ? "1 artigo" : `${n} artigos`;
}

// A action devolve o resultado e a lista nova na mesma resposta; passando por
// useActionState os dois entram na tela juntos. Com um setState depois do await,
// a mensagem chegou a aparecer antes de a lista trocar "Rascunho" por "Publicado"
// (visto no smoke).
async function publicarLote(_anterior, ids) {
  try {
    return await publicarArtigosEmLote(ids);
  } catch {
    return { error: "Não foi possível publicar agora. Recarregue a página e tente de novo." };
  }
}

export default function ListaArtigosAdmin({ artigos }) {
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [resposta, publicar, pending] = useActionState(publicarLote, null);

  const rascunhos = artigos.filter((a) => !a.publicado);
  // Só vale a seleção de quem ainda é rascunho: depois de publicar, a lista muda.
  const marcados = rascunhos.filter((a) => selecionados.has(a.id));
  const todosMarcados = rascunhos.length > 0 && marcados.length === rascunhos.length;
  const algunsMarcados = marcados.length > 0 && !todosMarcados;

  function alternar(id) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(rascunhos.map((a) => a.id)));
  }

  // O confirm roda no clique, antes de chamar a action (não há <form>, então não
  // há submit para interceptar). Não precisa limpar a seleção: quem foi publicado
  // deixa de ser rascunho e sai de `marcados`; quem falhou continua marcado,
  // pronto para tentar de novo.
  function publicarSelecionados() {
    const ids = marcados.map((a) => a.id);
    if (ids.length === 0) return;

    const aviso = ids.length === 1 ? "Ele fica público" : "Eles ficam públicos";
    if (!window.confirm(`Publicar ${quantosArtigos(ids.length)} agora? ${aviso} no blog na hora.`)) return;

    startTransition(() => publicar(ids));
  }

  return (
    <div className="space-y-3">
      {rascunhos.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={todosMarcados}
              ref={(el) => {
                if (el) el.indeterminate = algunsMarcados;
              }}
              onChange={alternarTodos}
              disabled={pending}
            />
            Selecionar todos os rascunhos ({rascunhos.length})
          </label>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">
              {marcados.length === 0
                ? "Nenhum selecionado"
                : `${quantosArtigos(marcados.length)} selecionado${marcados.length === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              onClick={publicarSelecionados}
              disabled={pending || marcados.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              {pending ? "Publicando..." : "Publicar selecionados"}
            </button>
          </div>
        </div>
      )}

      {!pending && resposta && (
        <div role="status" className="space-y-1">
          {resposta.sucesso && <p className="text-sm text-green-700">{resposta.sucesso}</p>}
          {resposta.aviso && <p className="text-sm text-yellow-700">{resposta.aviso}</p>}
          {resposta.error && <p className="text-sm text-red-600">{resposta.error}</p>}
        </div>
      )}

      {artigos.map((a) => (
        <div key={a.id} className="card flex items-start gap-3 px-4 py-3 sm:items-center">
          {rascunhos.length > 0 && (
            <div className="mt-1 w-4 shrink-0 sm:mt-0">
              {!a.publicado && (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selecionados.has(a.id)}
                  onChange={() => alternar(a.id)}
                  disabled={pending}
                  aria-label={`Selecionar “${a.titulo}”`}
                />
              )}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy">{a.titulo}</p>
              <p className="text-sm text-muted">
                {a.publicado ? "Publicado" : "Rascunho"} · /blog/{a.slug}
              </p>
            </div>
            <Link href={`/admin/artigos/${a.id}/editar`} className="text-sm link">
              Editar
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
