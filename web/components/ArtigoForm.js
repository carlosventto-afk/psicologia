"use client";

import { useActionState } from "react";

const estadoInicial = {};

export default function ArtigoForm({ action, artigo }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-2xl space-y-4 card p-6">
      <div>
        <label htmlFor="titulo" className="block text-sm font-semibold text-navy">
          Título
        </label>
        <input
          id="titulo"
          name="titulo"
          type="text"
          required
          defaultValue={artigo?.titulo}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-semibold text-navy">
          Slug (URL)
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          placeholder="ex: como-lidar-com-ansiedade"
          defaultValue={artigo?.slug}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="resumo" className="block text-sm font-semibold text-navy">
          Resumo (opcional)
        </label>
        <textarea
          id="resumo"
          name="resumo"
          rows={2}
          defaultValue={artigo?.resumo}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="conteudo" className="block text-sm font-semibold text-navy">
          Conteúdo (Markdown)
        </label>
        <textarea
          id="conteudo"
          name="conteudo"
          required
          rows={16}
          defaultValue={artigo?.conteudo}
          className="field font-mono"
        />
      </div>

      <div>
        <label htmlFor="autor" className="block text-sm font-semibold text-navy">
          Autor (opcional)
        </label>
        <input
          id="autor"
          name="autor"
          type="text"
          defaultValue={artigo?.autor}
          className="field"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="publicado"
          name="publicado"
          type="checkbox"
          defaultChecked={artigo?.publicado}
          className="h-4 w-4"
        />
        <label htmlFor="publicado" className="text-sm font-semibold text-navy">
          Publicar agora
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar artigo"}
      </button>
    </form>
  );
}
