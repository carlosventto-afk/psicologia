import { createClient } from "@/lib/supabase/server";
import { normalizarIds, normalizarIdsLista } from "@/lib/normalizar-ids";

// PerfilPublico foi criada separada de Usuarios de propósito (Usuarios não
// tem policy de leitura pública — só id_user = auth.uid() ou admin). Isso
// significa que um select embutido tipo `.select("id, Usuarios!inner(nome)")`
// NÃO funciona pra visitante anônimo: o join embutido do PostgREST fica sob
// a RLS de Usuarios, não enxerga nenhuma linha, e por ser "!inner" zera o
// resultado inteiro — confirmado empiricamente contra o banco real (Task 3).
// A função `usuarios_publicos` (security definer, migration
// 20260804000001) expõe só nome/crp/contato pra usuarios com perfil
// visível+aprovado, sem depender de RLS de Usuarios pro visitante.
async function buscarNomesPublicos(supabase, usuarioIds) {
  const ids = [...new Set(usuarioIds.map((id) => Number(id)))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.rpc("usuarios_publicos", {
    p_usuario_ids: ids,
  });
  if (error) throw new Error(error.message);

  return new Map((data || []).map((u) => [Number(u.id), u]));
}

export async function listarEspecialidades() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Especialidade")
    .select("id, nome")
    .order("nome");

  if (error) throw new Error(error.message);
  return data;
}

export async function buscarPerfisPublicos(filtros = {}) {
  const supabase = await createClient();

  let query = supabase
    .from("PerfilPublico")
    .select(
      `id, usuario_id, slug, cidade, estado, modalidade, valor_sessao, foto_url,
       PerfilEspecialidade(Especialidade(id, nome))`
    )
    .eq("visivel_diretorio", true)
    .order("criado_em", { ascending: false });

  if (filtros.cidade) {
    query = query.ilike("cidade", `%${filtros.cidade}%`);
  }
  if (filtros.modalidade) {
    query = query.in("modalidade", [filtros.modalidade, "ambos"]);
  }
  if (filtros.valorMax) {
    query = query.lte("valor_sessao", filtros.valorMax);
  }
  if (filtros.especialidade) {
    // `.eq("PerfilEspecialidade.especialidade_id", ...)` embutido não filtra
    // o PerfilPublico pai — só esvazia o array aninhado de quem não bate
    // (confirmado empiricamente: perfil sem a especialidade continuava na
    // lista, só com PerfilEspecialidade: []). Fallback documentado no brief:
    // busca os perfil_ids com essa especialidade primeiro, filtra por
    // .in("id", ids) depois.
    const { data: perfilEspecialidades, error: erroEspecialidade } = await supabase
      .from("PerfilEspecialidade")
      .select("perfil_id")
      .eq("especialidade_id", filtros.especialidade);

    if (erroEspecialidade) throw new Error(erroEspecialidade.message);

    const perfilIds = (perfilEspecialidades || []).map((pe) => pe.perfil_id);
    if (perfilIds.length === 0) return [];
    query = query.in("id", perfilIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const perfis = normalizarIdsLista(data, []);
  const nomes = await buscarNomesPublicos(
    supabase,
    perfis.map((p) => p.usuario_id)
  );

  return perfis.map((p) => ({
    id: p.id,
    slug: p.slug,
    nome: nomes.get(Number(p.usuario_id))?.nome ?? null,
    cidade: p.cidade,
    estado: p.estado,
    modalidade: p.modalidade,
    valor_sessao: p.valor_sessao,
    foto_url: p.foto_url,
    especialidades: (p.PerfilEspecialidade || []).map((pe) => pe.Especialidade.nome),
  }));
}

export async function buscarPerfilPorSlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("PerfilPublico")
    .select(
      `id, usuario_id, slug, bio, cidade, estado, modalidade, valor_sessao, foto_url,
       PerfilEspecialidade(Especialidade(id, nome))`
    )
    .eq("slug", slug)
    .eq("visivel_diretorio", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const nomes = await buscarNomesPublicos(supabase, [data.usuario_id]);
  const usuario = nomes.get(Number(data.usuario_id));

  return {
    id: data.id,
    slug: data.slug,
    bio: data.bio,
    cidade: data.cidade,
    estado: data.estado,
    modalidade: data.modalidade,
    valor_sessao: data.valor_sessao,
    foto_url: data.foto_url,
    nome: usuario?.nome ?? null,
    crp: usuario?.crp ?? null,
    contato: usuario?.contato ?? null,
    especialidades: (data.PerfilEspecialidade || []).map((pe) => pe.Especialidade),
  };
}

export async function buscarMeuPerfil() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // `.eq("Usuarios.id_user", user.id)` embutido sem "Usuarios" estar
  // presente no select() dá erro PGRST108 ("'Usuarios' is not an embedded
  // resource in this request") — confirmado empiricamente contra o banco
  // real. Fallback (já previsto no brief): busca Usuarios.id a partir de
  // user.id primeiro, depois filtra PerfilPublico por usuario_id — mesmo
  // padrão já usado em contarMeusContatos abaixo.
  const { data: usuario, error: erroUsuario } = await supabase
    .from("Usuarios")
    .select("id")
    .eq("id_user", user.id)
    .single();

  if (erroUsuario) throw new Error(erroUsuario.message);

  const { data, error } = await supabase
    .from("PerfilPublico")
    .select(
      `id, slug, bio, cidade, estado, modalidade, valor_sessao, foto_url,
       visivel_diretorio,
       PerfilEspecialidade(especialidade_id)`
    )
    .eq("usuario_id", usuario.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return normalizarIds(
    {
      ...data,
      especialidade_ids: (data.PerfilEspecialidade || []).map((pe) => pe.especialidade_id),
    },
    []
  );
}

export async function contarMeusContatos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: usuario } = await supabase
    .from("Usuarios")
    .select("id")
    .eq("id_user", user.id)
    .single();

  const { count, error } = await supabase
    .from("ContatoDiretorio")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuario.id);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
