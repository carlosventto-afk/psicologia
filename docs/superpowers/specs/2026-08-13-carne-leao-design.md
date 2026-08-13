# Item 8 do backlog — Exportar TXT do Carnê-Leão (Receita Saúde)

**Status:** aprovado, pronto para implementação.

## Objetivo

Gerar um arquivo `.txt` no layout **"Recibos do Receita Saúde"** do Carnê-Leão
Web (Receita Federal), a partir dos pagamentos de sessão já registrados no
sistema, pra importação direta no Carnê-Leão — sem digitação manual e já
gerando o recibo oficial do paciente ao importar.

Depende do item 6 (campo `Paciente.documento`), já implementado.

## Layout do arquivo (confirmado pelo usuário)

Arquivo `Modelo Importação CarneLeão/Layout receita saide` — 16 campos por
linha, separados por `;`, sem cabeçalho:

| # | Campo | Valor nesta implementação |
| - | --- | --- |
| 1 | Data do pagamento | `DD/MM/AAAA` — ver regra de linha combinada abaixo |
| 2 | Código do rendimento | fixo `R01.001.001` |
| 3 | Código da ocupação | fixo `255` (Psicólogo) |
| 4 | Valor do pagamento | decimal com vírgula, sem separador de milhar (ex: `242,85`) |
| 5 | Valor da dedução | sempre vazio |
| 6 | Descrição | ver regra de linha simples/combinada abaixo |
| 7 | Recebido de | fixo `PF` |
| 8 | CPF do pagador | CPF de quem pagou (ver regra abaixo) |
| 9 | CPF do beneficiário | CPF do paciente que recebeu o atendimento |
| 10 | Ind. CPF não informado | sempre vazio (não se aplica a recibos) |
| 11 | CNPJ | sempre vazio |
| 12 | Indicador de IRRF | sempre vazio |
| 13 | Valor IRRF | sempre vazio |
| 14 | Indicador de recibo | fixo `S` |
| 15 | CPF do profissional | CPF de `Usuarios.cpf` do dono dos pacientes (o usuário logado) |
| 16 | Registro profissional | `Usuarios.crp` do usuário logado |

Todo texto gerado é ASCII sem acento (mesmo padrão dos exemplos oficiais),
pra não arriscar problema de encoding na importação. Arquivo salvo/baixado
como UTF-8 (conteúdo é só ASCII de qualquer forma).

**Restrição do próprio layout:** "todos os pagamentos devem ser referentes
ao mesmo ano" — por isso a geração é sempre de **um mês por vez** (nunca
intervalo livre), o que já garante isso por construção.

## Pré-requisito: dados do profissional

Hoje `Usuarios` não tem CPF (só `nome`, `crp`, `contato`, `role`, etc.) e não
existe nenhuma tela pra o profissional editar os próprios dados de conta
(e-mail vive no Supabase Auth, fora do escopo aqui).

- Migration: `Usuarios.cpf text` (nullable — sem CPF cadastrado, geração do
  TXT fica bloqueada com aviso claro).
- Nova tela `/configuracoes/conta`: formulário editando `nome`, `cpf`, `crp`,
  `contato` do usuário logado. Reaproveita o padrão de Server Action +
  `useActionState` já usado em `PacienteForm`/`ImportarPacientesWizard`.
- Link novo no menu de configurações (hoje só existe `/configuracoes/whatsapp`
  linkado direto na sidebar como "WhatsApp" — adicionar "Meus Dados" apontando
  pra `/configuracoes/conta` na `SidebarNav`, com ícone novo `IconeContaUsuario`
  seguindo o padrão SVG de `components/icons/NavIcons.js`).

## Origem dos dados e filtro de elegibilidade

Diferente de `/recibos` (que usa `Sessao.Realizado = true`), a exportação usa
**`PagamentoSessao`** como fonte — Carnê-Leão declara rendimento
*recebido*, não atendimento realizado, e `PagamentoSessao` tem o valor e a
data reais do recebimento (que podem diferir do `valor_sessao` padrão e da
data da sessão).

Query (nova função em `web/lib/data/carne-leao.js`,
`listarPagamentosElegiveis({ mes, ano })`):

```
PagamentoSessao
  inner join Sessao (via PagamentoSessao.sessao)
  inner join Paciente (via Sessao.paciente), filtro Paciente.documento = 'recibo'
  left join Paciente responsável financeiro (via Paciente.responsavel_financeiro)
onde PagamentoSessao.data_pagamento >= primeiro dia do mês/ano
  e PagamentoSessao.data_pagamento <= último dia do mês/ano
```

Pra cada pagamento elegível, resolver:
- `cpf_pagador` = CPF do responsável financeiro se `paciente.dependente`,
  senão CPF do próprio paciente.
- `cpf_beneficiario` = CPF do paciente (sempre).
- `data_atendimento` = `Sessao.data` (usada na Descrição de linha combinada,
  não confundir com `PagamentoSessao.data_pagamento`).

**Pagamento sem CPF disponível** (pagador ou beneficiário null/vazio): não
entra no arquivo. É acumulado numa lista de avisos exibida no fim da geração
("N pagamentos não exportados por falta de CPF — paciente X, Y").

## Tela `/carne-leao`

Nova rota em `app/(app)/(gestao)/carne-leao/page.js`, item novo na
`SidebarNav` (`IconeCarneLeao`, entre "Recibos" e "Consultórios").

1. **Seletor de mês/ano** no topo (mesmo padrão de mês de referência já usado
   em financeiro), recarrega a lista de elegíveis via query string
   (`?mes=8&ano=2026`).
2. **Lista de pagamentos elegíveis do mês**, agrupada visualmente por
   pagador (nome do responsável financeiro, ou do próprio paciente quando
   não é dependente). Cada linha tem checkbox.
3. **Combinar em um recibo**: operador marca 2+ pagamentos do *mesmo
   pagador* e clica "Combinar em um recibo" — isso funde as linhas
   selecionadas numa única linha de pré-visualização (estado local, cliente).
   Não hà desfazer manual — recarregar a página descarta a seleção, já que
   nada é persistido até a geração final.
4. Botão final **"Gerar TXT"** — submete os agrupamentos (array de arrays de
   `pagamento_sessao_id`) pro backend.
5. Aviso de pagamentos sem CPF (se houver) aparece **depois** da geração,
   junto com o link de download — não impede gerar o resto.

Sem `Usuarios.cpf` preenchido: a tela mostra um aviso bloqueando a geração,
com link direto pra `/configuracoes/conta`.

### Regra de linha simples vs. combinada

- **Linha simples** (1 pagamento): `Data do pagamento` = `data_pagamento`;
  `Descrição` = `"Atendimento psicologico"` (fixo).
- **Linha combinada** (2+ pagamentos do mesmo pagador, mesmo mês):
  `Data do pagamento` = a mais recente (`max(data_pagamento)`) do grupo;
  `Valor` = soma dos valores do grupo; `Descrição` =
  `"Atendimentos psicologicos realizados em: DD/MM, DD/MM, ..."` usando as
  **datas das sessões** (`Sessao.data`) do grupo, ordenadas crescente.

## Geração e download do arquivo

`app/(app)/(gestao)/carne-leao/gerar/route.js` — `POST`, mesmo padrão de
`route.js` já usado em `web/app/busca/ir/[id]/route.js`.

- Recebe `mes`, `ano` e o agrupamento (ids de `PagamentoSessao` por linha)
  via `FormData`.
- **Nunca confia em valor/CPF vindo do client** — refaz a query de
  elegibilidade no servidor a partir dos ids recebidos e recalcula tudo
  (valor, CPFs, descrição) do banco.
- Ids recebidos que não estejam mais entre os elegíveis do período (ex.:
  pagamento excluído entre a tela carregar e o submit) são ignorados
  silenciosamente — não interrompem a geração do resto.
- Monta o texto linha a linha (16 campos, `;` como separador, sem linha de
  cabeçalho, `\r\n` como quebra de linha — padrão de arquivo `.txt`
  Windows/Receita Federal) e devolve como `Response` com
  `Content-Type: text/plain; charset=utf-8` e
  `Content-Disposition: attachment; filename="carne-leao-MM-AAAA.txt"`.

**Avisos de falta de CPF não exigem round-trip pós-geração:**
`listarPagamentosElegiveis` já retorna dois grupos separados — elegíveis
(com CPF completo) e não-elegíveis (faltando CPF). A página renderiza os
elegíveis com checkbox normalmente e os não-elegíveis num bloco de aviso
read-only acima da lista, antes mesmo do operador clicar em "Gerar TXT".

## Fora de escopo (fica pros itens 9 e 10, já mapeados no backlog)

- Rotina periódica automática de geração/envio (item 9).
- Marcar pagamento como "já exportado" pra evitar duplicidade entre gerações
  (item 10) — gerar o TXT do mesmo mês duas vezes hoje inclui os mesmos
  pagamentos de novo, sem aviso de duplicidade.
- Qualquer alteração no fluxo atual de `/recibos` (recibo "simples" por
  sessão, gravado em `Recibo`) — os dois fluxos continuam independentes.
