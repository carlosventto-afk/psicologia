# Importação de pacientes via planilha — design

Status: aprovado em conversa, aguardando revisão do arquivo escrito.
Implementa o item 5 do backlog (`docs/backlog.md`): "Importar pacientes via
planilha Excel, com tela de mapeamento de colunas".

## Contexto

Hoje o único jeito de cadastrar paciente é um a um, pelo formulário manual
em `/pacientes/novo` (`web/components/PacienteForm.js` +
`web/lib/actions/pacientes.js`). Profissionais migrando de outro sistema
(ou de planilha própria) precisam de um jeito de importar vários pacientes
de uma vez.

Durante a conversa surgiu um pedido adicional, fora do escopo original do
item 5 mas que toca os mesmos pontos do código: um campo novo no cadastro
de paciente, "Precisa de recibo" (sim/não), porque nem todo paciente
precisa de recibo emitido. Esse campo entra tanto no formulário manual
quanto na planilha de importação, e passa a filtrar a tela `/recibos`.

## Decisões de escopo (da conversa de brainstorming)

1. **Entrada pela própria página `/pacientes`** — botão "Importar planilha"
   ao lado de "Novo Paciente", levando a uma página dedicada
   (`/pacientes/importar`), não um modal nem um fluxo inline.
2. **Formatos aceitos no upload**: `.xlsx` e `.csv`.
3. **Parsing no navegador**, com a lib `xlsx` (SheetJS) — não há envio do
   arquivo bruto pro servidor. Evita uma rodada de rede extra por etapa do
   wizard e casa com o padrão já usado no projeto (client components com
   `useActionState`, como `PacienteForm`). Só os dados já mapeados (JSON)
   vão pro servidor, na confirmação final.
4. **Consultório é escolhido uma vez, fora da planilha** — um único select
   no wizard, aplicado a todos os pacientes importados naquela leva. Se o
   profissional tiver pacientes de mais de um consultório, faz importações
   separadas. Evita ter que casar texto livre da planilha com os
   consultórios cadastrados.
5. **Pacote de cobrança fica sempre em branco** na importação — não faz
   parte do mapeamento. É campo secundário, ajustável depois no cadastro
   manual.
6. **Linhas e campos problemáticos são ignorados, não bloqueiam a
   importação**:
   - Nome ausente → linha inteira pulada.
   - Nome duplicado (contra pacientes já cadastrados do profissional, ou
     duplicado dentro da própria planilha) → linha pulada.
   - Data de nascimento ou valor da sessão em formato não reconhecido →
     só aquele campo fica em branco, o resto da linha é importado.
   - Um relatório final explica o que foi pulado/ignorado e por quê.
7. **Volume esperado**: algumas dezenas de linhas por importação. A prévia
   mostra a planilha inteira, sem paginação/amostragem.
8. **Campo novo "Precisa de recibo"**: booleano, nasce como `false` (Não)
   tanto pra pacientes já existentes (migration) quanto pra novos
   cadastros sem essa informação — decisão explícita do usuário, mesmo
   sabendo que isso esvazia a tela `/recibos` até o profissional revisar e
   marcar quem precisa.
9. **`/recibos` passa a filtrar** por `precisa_recibo = true` — hoje lista
   todas as sessões realizadas sem recibo emitido, de qualquer paciente.
10. **Cancelamento em duas frentes**: um "Cancelar" nos passos 1–3 (antes
    de confirmar), que só descarta o estado local e volta pra
    `/pacientes` — e um "Desfazer importação" na tela de resultado, depois
    de já ter confirmado, que apaga em lote só os pacientes inseridos
    naquela leva específica.

## Arquitetura de dados

Migration nova (`supabase/migrations/20260804000003_add_precisa_recibo_paciente.sql`):

```sql
alter table public."Paciente"
  add column precisa_recibo boolean not null default false;
```

Sem RLS nova — a policy de escrita já existente na tabela `Paciente` (dono
via `owner = auth.uid()`) já cobre esse campo.

## Campo "Precisa de recibo" no cadastro manual

- `web/components/PacienteForm.js`: checkbox "Precisa de recibo", ao lado
  dos demais campos.
- `web/lib/actions/pacientes.js` (`dadosDoFormulario`): inclui
  `precisa_recibo: formData.get("precisa_recibo") === "on"`.
- `web/lib/data/pacientes.js` (`buscarPaciente`): inclui `precisa_recibo`
  no `select`, pra edição carregar o valor atual.
- `web/lib/data/recibos.js` (`listarSessoesElegiveisParaRecibo`): troca o
  select de `Paciente!inner(id, nome)` para `Paciente!inner(id, nome,
  precisa_recibo)` e adiciona `.eq("Paciente.precisa_recibo", true)` à
  query (mesmo padrão de filtro em relacionamento embutido já usado com
  `.eq("Realizado", true)`).

## Fluxo do wizard de importação

Botão "Importar planilha" em `web/app/(app)/pacientes/page.js`, ao lado de
"Novo Paciente", linkando pra `/pacientes/importar` (página nova). A
página é majoritariamente um client component
(`web/components/ImportarPacientesWizard.js`) com estado local em 4
passos. Nos passos 1–3, um botão "Cancelar" descarta o estado local e
volta pra `/pacientes` (só navegação — nada foi persistido até o passo 4).

**Passo 1 — Upload**
- Input de arquivo (`.xlsx`, `.csv`) + link "Baixar planilha modelo".
- Ao selecionar o arquivo, parseia com `xlsx` no navegador (via
  `FileReader`/`arrayBuffer`) e extrai cabeçalhos (primeira linha) + linhas
  de dados.

**Passo 2 — Consultório**
- Um select simples (mesma lista usada em `PacienteForm`), aplicado a
  todos os pacientes da planilha.

**Passo 3 — Mapear colunas**
- Um dropdown por campo do sistema: Nome\* (obrigatório), Data de
  Nascimento, Telefone, E-mail, Endereço, Valor da Sessão, Observações,
  Precisa de recibo. Cada dropdown lista as colunas detectadas na planilha
  + opção "Nenhuma" (exceto Nome, que exige uma coluna pra avançar).
- Auto-preenchimento: se o cabeçalho da planilha bate (case-insensitive)
  com o nome de um campo do sistema, o dropdown já vem pré-selecionado com
  aquela coluna — atalho de UX, não obrigatório pro funcionamento.

**Passo 4 — Prévia + confirmação**
- Tabela com todas as linhas já mapeadas segundo a seleção do passo 3
  (recalculada no cliente a cada mudança de mapeamento, sem round-trip).
- Botão "Confirmar importação" envia `{ consultorioId, linhas }` (linhas =
  array de objetos já mapeados, ainda "crus"/não validados) pra uma server
  action.

**Tela de resultado**, após a confirmação: relatório retornado pela server
action (ver próxima seção) + botão "Voltar para pacientes" + botão
"Desfazer importação" (só aparece se `importados > 0`). O desfazer chama
`desfazerImportacao(idsInseridos)`, que apaga exatamente os pacientes
daquela leva; depois de usado, o botão some (evita apagar duas vezes) e
mostra confirmação "Importação desfeita". Não há prazo de expiração — o
botão fica disponível enquanto a tela de resultado estiver aberta (ao sair
da página, perde-se a lista de IDs e a chance de desfazer por essa tela;
os pacientes continuariam existindo até serem apagados manualmente).

## Validação, deduplicação e relatório (server action)

Nova função em `web/lib/actions/pacientes.js` (ou arquivo dedicado
`web/lib/actions/importar-pacientes.js`), `importarPacientes(consultorioId,
linhas)`. É a única fonte de verdade da validação — o cliente não
pré-valida nada, só manda os dados mapeados.

Para cada linha recebida:
- **Nome**: obrigatório (após `trim`). Vazio → linha pulada, contabilizada
  como "sem nome".
- **Duplicado**: nome normalizado (trim + lowercase) comparado contra (a)
  pacientes já cadastrados do profissional autenticado e (b) nomes já
  processados nesta mesma importação. Bate com algum → linha pulada,
  contabilizada como "duplicado" (guarda o nome pro relatório).
- **Data de nascimento**: tenta interpretar (datas seriais do Excel via
  `xlsx`, ou strings comuns tipo `DD/MM/AAAA`); se não der, campo fica
  `null` e entra como aviso ("data de nascimento inválida, campo deixado
  em branco"), linha segue sendo importada.
- **Valor da sessão**: tenta converter pra número; se não der (ou for
  negativo), campo fica `null` e entra como aviso, linha segue.
- **Telefone, E-mail, Endereço, Observações**: texto livre, só `trim`,
  sem validação de formato.
- **Precisa de recibo**: reconhece variações case-insensitive de
  "sim/não/nao/yes/no/true/false/1/0"; qualquer outro valor ou célula
  vazia vira `false` (mesmo default da coluna) — não gera aviso, é
  comportamento esperado.
- **Pacote**: sempre `null`.
- **Consultório**: fixo, vindo do passo 2.

Linhas válidas restantes são inseridas em uma única chamada
`supabase.from("Paciente").insert([...])` (lote); `owner` é preenchido
automaticamente pela RLS.

Retorno da server action (relatório):
```
{
  totalLinhas,
  importados,
  idsInseridos: [...],
  puladosSemNome,
  puladosDuplicados: [{ linha, nome }],
  avisos: [{ linha, nome, campo, motivo }],
}
```

`idsInseridos` vem direto do `.select("id")` encadeado no `insert` — é o
que permite desfazer depois.

### Desfazer importação

Segunda server action, `desfazerImportacao(ids)`: `supabase.from("Paciente")
.delete().in("id", ids)`. Não precisa de nenhuma outra checagem de posse —
a RLS de `Paciente` já restringe delete a linhas com `owner = auth.uid()`,
então só apaga o que pertence ao profissional autenticado mesmo que os IDs
tenham sido adulterados no cliente. Como é chamada logo em seguida da
criação, dentro da mesma sessão, não tem efeito colateral em sessões,
recibos ou lançamentos financeiros — os pacientes recém-criados ainda não
têm nada vinculado a eles.

## Planilha modelo

Arquivo estático gerado uma vez (script local com a lib `xlsx`, não
gerado em runtime) e salvo em `web/public/planilha-modelo-pacientes.xlsx`.
Link "Baixar planilha modelo" no passo 1 do wizard aponta direto pra esse
arquivo estático.

Colunas, nessa ordem, com nomes exatos (facilita o auto-match do passo 3):
`Nome`, `Data de Nascimento`, `Telefone`, `E-mail`, `Endereço`, `Valor da
Sessão`, `Observações`, `Precisa de recibo`. Uma linha de exemplo
preenchida abaixo do cabeçalho, mostrando o formato esperado (data
`DD/MM/AAAA`, "Precisa de recibo" como `Sim`/`Não`).

## Fora de escopo nesta entrega

- Mapear Consultório ou Pacote por coluna da planilha (texto livre casado
  por nome) — descartado em favor do select único de consultório.
- Atualizar pacientes já existentes via planilha (import é só criação;
  duplicado é sempre pulado, nunca vira update).
- Importação em background/assíncrona — volume esperado (dezenas de
  linhas) não justifica.
- Instruções em aba separada dentro da planilha modelo.

## Verificação (pra quando for implementado)

- `npm run build` sem erro; rota `/pacientes/importar` listada.
- Migration aplicada; `precisa_recibo` aparece em `Paciente` com default
  `false`.
- Fluxo completo no navegador (chrome-devtools MCP): upload de uma
  planilha de teste (`.xlsx` e `.csv`) com pelo menos uma linha válida, uma
  sem nome, uma duplicada e uma com data inválida → prévia reflete o
  mapeamento → confirmar → relatório mostra as contagens certas →
  pacientes válidos aparecem em `/pacientes`.
- Botão "Cancelar" nos passos 1–3 volta pra `/pacientes` sem persistir
  nada.
- Botão "Desfazer importação" na tela de resultado apaga exatamente os
  pacientes daquela leva (e nenhum outro) e some depois de usado.
- Cadastro manual: checkbox "Precisa de recibo" salva e recarrega
  corretamente na edição.
- `/recibos` só lista sessões de pacientes com `precisa_recibo = true`.
- Planilha modelo baixa corretamente e abre com as colunas esperadas.
