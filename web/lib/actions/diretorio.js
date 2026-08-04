"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarSlug } from "@/lib/slugify";

async function gerarSlugUnico(supabase, base) {
  const raiz = normalizarSlug(base) || "profissional";
  let slug = raiz;
  let sufixo = 1;

  while (true) {
    const { data } = await supabase
      .from("PerfilPublico")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return slug;
    sufixo += 1;
    slug = `${raiz}-${sufixo}`;
  }
}

export async function salvarPerfil(prevState, formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Não autorizado." };
  }

  const { data: usuario, error: erroUsuario } = await supabase
    .from("Usuarios")
    .select("id, nome")
    .eq("id_user", user.id)
    .single();

  if (erroUsuario) {
    return { error: "Não foi possível carregar seu cadastro." };
  }

  const bio = formData.get("bio");
  const cidade = formData.get("cidade");
  const estado = formData.get("estado");
  const modalidade = formData.get("modalidade");
  const valorSessaoRaw = formData.get("valor_sessao");
  const visivel = formData.get("visivel_diretorio") === "on";
  const especialidadeIds = formData.getAll("especialidades");
  const foto = formData.get("foto");

  const { data: perfilExistente } = await supabase
    .from("PerfilPublico")
    .select("id, slug, foto_url")
    .eq("usuario_id", usuario.id)
    .maybeSingle();

  let fotoUrl = perfilExistente?.foto_url ?? null;

  if (foto && foto.size > 0) {
    const extensao = foto.name.split(".").pop();
    const caminho = `${user.id}/foto.${extensao}`;
    const { error: erroUpload } = await supabase.storage
      .from("perfis-publicos")
      .upload(caminho, foto, { upsert: true });

    if (erroUpload) {
      return { error: "Não foi possível enviar a foto." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("perfis-publicos").getPublicUrl(caminho);
    fotoUrl = `${publicUrl}?v=${Date.now()}`;
  }

  const dadosPerfil = {
    usuario_id: usuario.id,
    bio: bio || null,
    cidade: cidade || null,
    estado: estado || null,
    modalidade: modalidade || "ambos",
    valor_sessao: valorSessaoRaw ? Number(valorSessaoRaw) : null,
    foto_url: fotoUrl,
    visivel_diretorio: visivel,
    atualizado_em: new Date().toISOString(),
  };

  let perfilId = perfilExistente?.id;

  if (perfilExistente) {
    const { error } = await supabase
      .from("PerfilPublico")
      .update(dadosPerfil)
      .eq("id", perfilExistente.id);

    if (error) {
      return { error: "Não foi possível salvar o perfil." };
    }
  } else {
    const slug = await gerarSlugUnico(supabase, usuario.nome);
    const { data: novoPerfil, error } = await supabase
      .from("PerfilPublico")
      .insert({ ...dadosPerfil, slug })
      .select("id")
      .single();

    if (error) {
      return { error: "Não foi possível criar o perfil." };
    }
    perfilId = novoPerfil.id;
  }

  const { error: erroLimpaEspecialidades } = await supabase
    .from("PerfilEspecialidade")
    .delete()
    .eq("perfil_id", perfilId);

  if (erroLimpaEspecialidades) {
    return { error: "Perfil salvo, mas não foi possível atualizar as especialidades." };
  }

  if (especialidadeIds.length > 0) {
    const linhas = especialidadeIds.map((especialidadeId) => ({
      perfil_id: perfilId,
      especialidade_id: especialidadeId,
    }));
    const { error: erroEspecialidades } = await supabase
      .from("PerfilEspecialidade")
      .insert(linhas);

    if (erroEspecialidades) {
      return { error: "Perfil salvo, mas não foi possível atualizar as especialidades." };
    }
  }

  revalidatePath("/diretorio");
  return { mensagem: "Perfil salvo." };
}
