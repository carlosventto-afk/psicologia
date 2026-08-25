"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarSlug } from "@/lib/slugify";

export async function fazerUploadImagemArtigo(slugArtigo, formData) {
  const supabase = await createClient();
  const arquivo = formData.get("imagem");

  if (!arquivo || arquivo.size === 0) {
    return { error: "Nenhuma imagem selecionada." };
  }

  const slugNormalizado = normalizarSlug(slugArtigo);
  if (!slugNormalizado) {
    return { error: "Preencha o slug do artigo antes de inserir uma imagem." };
  }

  const extensao = arquivo.type.split("/")[1] || "png";
  const caminho = `${slugNormalizado}/${Date.now()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from("artigos-imagens")
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

  if (erroUpload) {
    return { error: "Não foi possível enviar a imagem." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("artigos-imagens").getPublicUrl(caminho);

  return { url: publicUrl };
}

async function resolverImagemCapa(supabase, slugNormalizado, formData, capaAtual) {
  const removerCapa = formData.get("remover_capa") === "on";
  if (removerCapa) return null;

  const arquivoCapa = formData.get("imagem_capa");
  if (!arquivoCapa || arquivoCapa.size === 0) {
    return capaAtual ?? null;
  }

  const extensao = arquivoCapa.type.split("/")[1] || "png";
  const caminho = `${slugNormalizado}/capa.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from("artigos-imagens")
    .upload(caminho, arquivoCapa, { upsert: true, contentType: arquivoCapa.type });

  if (erroUpload) {
    throw new Error("Não foi possível enviar a imagem de capa.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("artigos-imagens").getPublicUrl(caminho);

  return `${publicUrl}?v=${Date.now()}`;
}

export async function criarArtigo(prevState, formData) {
  const supabase = await createClient();

  const publicado = formData.get("publicado") === "on";
  const slugNormalizado = normalizarSlug(formData.get("slug"));

  let imagemCapa;
  try {
    imagemCapa = await resolverImagemCapa(supabase, slugNormalizado, formData, null);
  } catch (e) {
    return { error: e.message };
  }

  const { error } = await supabase.from("artigos").insert({
    titulo: formData.get("titulo"),
    slug: slugNormalizado,
    resumo: formData.get("resumo") || null,
    conteudo: formData.get("conteudo"),
    autor: formData.get("autor") || null,
    imagem_capa: imagemCapa,
    publicado,
    publicado_em: publicado ? new Date().toISOString() : null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um artigo com esse slug." };
    }
    return { error: "Não foi possível salvar o artigo." };
  }

  revalidatePath("/admin/artigos");
  revalidatePath("/blog");
  redirect("/admin/artigos");
}

export async function atualizarArtigo(id, prevState, formData) {
  const supabase = await createClient();

  const { data: atual, error: erroAtual } = await supabase
    .from("artigos")
    .select("publicado, publicado_em, slug, imagem_capa")
    .eq("id", id)
    .single();

  if (erroAtual) {
    return { error: "Não foi possível carregar o artigo." };
  }

  const publicado = formData.get("publicado") === "on";
  const publicadoEm = publicado ? atual.publicado_em ?? new Date().toISOString() : null;
  const slugNormalizado = normalizarSlug(formData.get("slug"));

  let imagemCapa;
  try {
    imagemCapa = await resolverImagemCapa(supabase, slugNormalizado, formData, atual.imagem_capa);
  } catch (e) {
    return { error: e.message };
  }

  const { error } = await supabase
    .from("artigos")
    .update({
      titulo: formData.get("titulo"),
      slug: slugNormalizado,
      resumo: formData.get("resumo") || null,
      conteudo: formData.get("conteudo"),
      autor: formData.get("autor") || null,
      imagem_capa: imagemCapa,
      publicado,
      publicado_em: publicadoEm,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um artigo com esse slug." };
    }
    return { error: "Não foi possível atualizar o artigo." };
  }

  revalidatePath("/admin/artigos");
  revalidatePath("/blog");
  revalidatePath(`/blog/${atual.slug}`);
  redirect("/admin/artigos");
}
