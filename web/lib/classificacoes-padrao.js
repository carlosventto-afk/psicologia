// Plano de contas padrão sugerido pra quem está começando: cobre as
// naturezas de receita/despesa mais comuns de um consultório/empresa de
// serviço. Carregado automaticamente no cadastro de um profissional novo
// (ver web/lib/actions/auth.js e web/lib/actions/profissionais.js) e
// disponível sob demanda pra quem já tem conta, via o botão "Carregar lista
// padrão" em /financeiro/classificacoes.
export const CLASSIFICACOES_PADRAO = [
  { nome: "Atendimentos", tipo: "Receita" },
  { nome: "Pacotes de Sessões", tipo: "Receita" },
  { nome: "Supervisão Oferecida", tipo: "Receita" },
  { nome: "Cursos e Workshops", tipo: "Receita" },
  { nome: "Outras Receitas", tipo: "Receita" },
  { nome: "Aluguel", tipo: "Despesa" },
  { nome: "Condomínio", tipo: "Despesa" },
  { nome: "Água, Luz e Internet", tipo: "Despesa" },
  { nome: "Material de Escritório", tipo: "Despesa" },
  { nome: "Marketing e Publicidade", tipo: "Despesa" },
  { nome: "Softwares e Assinaturas", tipo: "Despesa" },
  { nome: "Supervisão Clínica", tipo: "Despesa" },
  { nome: "Educação Continuada", tipo: "Despesa" },
  { nome: "Contabilidade", tipo: "Despesa" },
  { nome: "Impostos e Taxas", tipo: "Despesa" },
  { nome: "Salários e Pró-labore", tipo: "Despesa" },
  { nome: "Manutenção e Limpeza", tipo: "Despesa" },
  { nome: "Tarifas Bancárias", tipo: "Despesa" },
  { nome: "Outras Despesas", tipo: "Despesa" },
];

// Insere só as classificações padrão que o dono ainda não tem. Upsert com
// ignoreDuplicates (ON CONFLICT DO NOTHING via a constraint única em
// owner+nome, ver migration 20260826000003) em vez de "SELECT existentes,
// calcula faltantes, INSERT" — esse padrão não é atômico e duas chamadas
// concorrentes (ex: clique duplo em "Carregar lista padrão") inseririam os
// mesmos itens duas vezes. Chamável tanto com o client normal (RLS, owner
// vem do default auth.uid()) quanto com o client admin (service_role, sem
// sessão própria, por isso "ownerId" é sempre explícito aqui).
export async function criarClassificacoesPadrao(supabase, ownerId) {
  const { data, error } = await supabase
    .from("ClassificacaoFinanceira")
    .upsert(
      CLASSIFICACOES_PADRAO.map((c) => ({ ...c, owner: ownerId })),
      { onConflict: "owner,nome", ignoreDuplicates: true }
    )
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
