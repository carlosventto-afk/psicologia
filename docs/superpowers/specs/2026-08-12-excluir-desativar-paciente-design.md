# Excluir/desativar paciente

## Contexto

Hoje não existe nenhuma forma de remover um paciente do cadastro — nem
excluir, nem "arquivar". Isso vira um problema quando um profissional
cadastra um paciente por engano, ou quando um paciente encerra o
acompanhamento e o profissional não quer mais vê-lo nas listas/seletores
do dia a dia, mas também não quer perder o histórico dele.

A tabela `Paciente` é referenciada por `Sessao.paciente`, `Recibo.paciente`,
`Recorrencia.paciente` e por `Paciente.responsavel_financeiro` (auto-
referência, adicionada na feature de documentos/dependente) — todas com
FK `NO ACTION`. Excluir um paciente com qualquer uma dessas referências
falha no banco. Este spec cobre exclusão real (quando seguro) e um
caminho alternativo de desativação (sempre seguro, reversível).

## Modelo de dados

Migration em `Paciente`:

```sql
alter table public."Paciente"
  add column ativo boolean not null default true;
```

`ativo` nasce `true` para todo paciente novo e para os já existentes
(default cobre o backfill). RLS não muda — as policies existentes
(`paciente_select_own`, `paciente_update_own`, `paciente_delete_own`) já
cobrem os dois fluxos (update pra desativar/reativar, delete pra
excluir).

## Verificação de exclusão

Nova função em `lib/data/pacientes.js`, `verificarVinculosPaciente(id)`,
que roda 4 checagens (cada uma um `count`/`select` simples, sem
depender de parsear mensagem de erro do Postgres):

```js
export async function verificarVinculosPaciente(id) {
  const supabase = await createClient();

  const [sessoes, recibos, recorrencias, dependentes] = await Promise.all([
    supabase.from("Sessao").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recibo").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Recorrencia").select("id", { count: "exact", head: true }).eq("paciente", id),
    supabase.from("Paciente").select("nome").eq("responsavel_financeiro", id),
  ]);

  const vinculos = [];
  if (sessoes.count > 0) vinculos.push({ tipo: "sessão(ões)", quantidade: sessoes.count });
  if (recibos.count > 0) vinculos.push({ tipo: "recibo(s)", quantidade: recibos.count });
  if (recorrencias.count > 0) vinculos.push({ tipo: "recorrência(s)", quantidade: recorrencias.count });
  if (dependentes.data?.length > 0) {
    vinculos.push({
      tipo: "é responsável financeiro de",
      nomes: dependentes.data.map((d) => d.nome),
    });
  }

  return vinculos; // [] significa livre para excluir
}
```

A checagem de `responsavel_financeiro` não filtra por `ativo` — um
dependente desativado ainda bloqueia a exclusão do responsável, porque a
FK no banco também não distingue isso (excluir quebraria a constraint de
qualquer forma).

## Server Actions (`lib/actions/pacientes.js`)

```js
export async function excluirPaciente(id, prevState, formData) {
  const supabase = await createClient();
  const vinculos = await verificarVinculosPaciente(id);
  if (vinculos.length > 0) {
    return { bloqueado: true, vinculos };
  }

  const { error } = await supabase.from("Paciente").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir o paciente." };

  revalidatePath("/pacientes");
  redirect("/pacientes");
}

export async function desativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: false }).eq("id", id);
  if (error) return { error: "Não foi possível desativar o paciente." };

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}

export async function reativarPaciente(id) {
  const supabase = await createClient();
  const { error } = await supabase.from("Paciente").update({ ativo: true }).eq("id", id);
  if (error) return { error: "Não foi possível reativar o paciente." };

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}
```

`desativarPaciente`/`reativarPaciente` não precisam que o cliente leia o
retorno (só têm dois desfechos: dá certo e a página revalida, ou falha e
não faz nada) — chamadas via `<form action={desativarPaciente.bind(null, id)}>`
simples, mesmo padrão já usado em `/recibos` pra "Gerar recibo".

`excluirPaciente`, por outro lado, precisa que o cliente saiba se foi
bloqueada (pra mostrar o aviso + botão Desativar) — por isso usa
`useActionState`, com a action pré-vinculada ao id
(`excluirPaciente.bind(null, pacienteId)`), mesmo padrão exato já usado em
`PacienteForm.js`/`atualizarPaciente`. Um componente cliente pequeno
(`ExcluirPacienteBotao`) chama `useActionState(acaoComId, {})` e decide o
que renderizar a partir do `state` retornado (aviso de bloqueio + botão
Desativar, ou nada — se deu certo, a própria action já redireciona antes
de qualquer re-render acontecer).

## UI (`app/(app)/pacientes/[id]/page.js`)

Ao lado de "Editar", dois novos controles, condicionados a `paciente.ativo`:

- Se `ativo`: um botão **Excluir** (link vermelho/de aviso) e um botão
  **Desativar** (link neutro, mesmo estilo de "Editar").
- Se não `ativo`: um botão **Reativar**.

O botão Excluir fica num pequeno client component (`ExcluirPacienteBotao`,
recebe `pacienteId` como prop) que:
1. Faz `const acaoComId = excluirPaciente.bind(null, pacienteId)` e
   `const [state, formAction, pending] = useActionState(acaoComId, {})`.
2. Renderiza `<form action={formAction} onSubmit={confirmarAntes}>` onde
   `confirmarAntes` chama `window.confirm("Tem certeza? Essa ação não pode ser desfeita.")`
   e faz `event.preventDefault()` se o usuário cancelar — só deixa o
   submit prosseguir (e a action rodar) se confirmar.
3. Se `state.bloqueado`, renderiza um card de aviso listando os vínculos
   (ex.: "3 sessão(ões)", "1 recibo(s)", "É responsável financeiro de:
   João Silva") e um botão **Desativar** logo abaixo, no lugar do botão
   Excluir original. Se a action tiver sucesso, ela mesma já redireciona
   (`redirect("/pacientes")`) antes de qualquer re-render com `state`
   acontecer.

## `/pacientes` — filtro de status

`listarPacientes({ busca, status })` ganha o parâmetro `status`
(`"ativos" | "inativos" | "todos"`, default `"ativos"`):

```js
if (status === "ativos") query = query.eq("ativo", true);
else if (status === "inativos") query = query.eq("ativo", false);
// "todos": sem filtro
```

A página `app/(app)/pacientes/page.js` ganha 3 links/abas simples
("Ativos" / "Inativos" / "Todos") acima da lista, lendo/escrevendo o
`status` via query string (`?status=inativos`), mesmo padrão de filtro
por query string já usado em `/financeiro/lancamentos`.

## `listarPacientesParaSelect` — sempre só ativos

```js
export async function listarPacientesParaSelect(excluirId) {
  const supabase = await createClient();
  let query = supabase.from("Paciente").select("id, nome, pacote").eq("ativo", true).order("nome");
  if (excluirId) query = query.neq("id", excluirId);
  ...
}
```

Afeta os 3 usos existentes automaticamente, sem mudança nos call sites:
seletor de paciente em nova sessão, editar sessão, e responsável
financeiro (novo/editar paciente).

## Import por planilha — sem mudança de comportamento

`importarPacientes` continua checando duplicidade de nome contra *todos*
os pacientes do profissional (ativos e inativos) — comportamento já
existente, mantido de propósito pra não recriar sem querer alguém que foi
desativado.

## Fora de escopo

- Exclusão/desativação em lote (múltiplos pacientes de uma vez).
- Qualquer alteração em `Sessao`/`Recibo`/`Recorrencia` — o vínculo é só
  consultado, nunca modificado ou removido em cascata.
- Um "modo confirmação" customizado (modal da própria aplicação) para o
  Excluir — usa o `confirm()` nativo do navegador, consistente com a
  simplicidade do resto do app (não há sistema de modal hoje).
