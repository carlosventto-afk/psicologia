"use client";

import { useActionState, useRef, useState } from "react";
import { fazerUploadImagemArtigo } from "@/lib/actions/artigos";
import { normalizarSlug } from "@/lib/slugify";

const estadoInicial = {};

export default function ArtigoForm({ action, artigo }) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const capaOriginalExiste = Boolean(artigo?.imagem_capa);
  const [previewCapa, setPreviewCapa] = useState(artigo?.imagem_capa ?? null);
  const [capaRemovida, setCapaRemovida] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState(null);
  const conteudoRef = useRef(null);
  const slugRef = useRef(null);
  const inputImagemTextoRef = useRef(null);

  function handleCapaChange(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setPreviewCapa(URL.createObjectURL(arquivo));
    setCapaRemovida(false);
  }

  function handleRemoverCapaChange(e) {
    const marcado = e.target.checked;
    setCapaRemovida(marcado);
    setPreviewCapa(marcado ? null : artigo?.imagem_capa ?? null);
  }

  async function handleInserirImagem(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    const slugAtual = normalizarSlug(slugRef.current?.value || "");
    if (!slugAtual) {
      setErroImagem("Preencha o slug do artigo antes de inserir uma imagem no texto.");
      e.target.value = "";
      return;
    }

    setErroImagem(null);
    setEnviandoImagem(true);

    const formData = new FormData();
    formData.set("imagem", arquivo);
    const resultado = await fazerUploadImagemArtigo(slugAtual, formData);

    setEnviandoImagem(false);
    e.target.value = "";

    if (resultado.error) {
      setErroImagem(resultado.error);
      return;
    }

    const textarea = conteudoRef.current;
    const inicio = textarea.selectionStart ?? textarea.value.length;
    const fim = textarea.selectionEnd ?? textarea.value.length;
    const trecho = `\n![](${resultado.url})\n`;
    textarea.value = textarea.value.slice(0, inicio) + trecho + textarea.value.slice(fim);
    const novaPosicao = inicio + trecho.length;
    textarea.setSelectionRange(novaPosicao, novaPosicao);
    textarea.focus();
  }

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
          ref={slugRef}
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
        <span className="block text-sm font-semibold text-navy">Imagem de capa (opcional)</span>
        {previewCapa && (
          <img
            src={previewCapa}
            alt="Prévia da capa"
            className="mt-2 h-40 w-full rounded-xl object-cover"
          />
        )}
        <input
          id="imagem_capa"
          name="imagem_capa"
          type="file"
          accept="image/*"
          onChange={handleCapaChange}
          className="field mt-2"
        />
        {capaOriginalExiste && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              name="remover_capa"
              checked={capaRemovida}
              onChange={handleRemoverCapaChange}
              className="h-4 w-4"
            />
            Remover capa atual
          </label>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="conteudo" className="block text-sm font-semibold text-navy">
            Conteúdo (Markdown)
          </label>
          <label className="link cursor-pointer text-sm">
            {enviandoImagem ? "Enviando..." : "+ Inserir imagem no texto"}
            <input
              ref={inputImagemTextoRef}
              type="file"
              accept="image/*"
              onChange={handleInserirImagem}
              disabled={enviandoImagem}
              className="hidden"
            />
          </label>
        </div>
        {erroImagem && <p className="text-sm text-red-600">{erroImagem}</p>}
        <textarea
          id="conteudo"
          name="conteudo"
          ref={conteudoRef}
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
