"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function normalizarSlug(valor) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function criarArtigo(prevState, formData) {
  const supabase = await createClient();

  const publicado = formData.get("publicado") === "on";

  const { error } = await supabase.from("artigos").insert({
    titulo: formData.get("titulo"),
    slug: normalizarSlug(formData.get("slug")),
    resumo: formData.get("resumo") || null,
    conteudo: formData.get("conteudo"),
    autor: formData.get("autor") || null,
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
    .select("publicado, publicado_em, slug")
    .eq("id", id)
    .single();

  if (erroAtual) {
    return { error: "Não foi possível carregar o artigo." };
  }

  const publicado = formData.get("publicado") === "on";
  const publicadoEm = publicado ? atual.publicado_em ?? new Date().toISOString() : null;

  const { error } = await supabase
    .from("artigos")
    .update({
      titulo: formData.get("titulo"),
      slug: normalizarSlug(formData.get("slug")),
      resumo: formData.get("resumo") || null,
      conteudo: formData.get("conteudo"),
      autor: formData.get("autor") || null,
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
