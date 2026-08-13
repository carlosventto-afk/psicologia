# Backlog — PsiAgente

Visão consolidada do backlog de novas funcionalidades, em 2 grupos. Ao
implementar um item, mova-o de "A realizar" para "Implementado" e registre a
data. Detalhamento de escopo/decisões de cada item está em
`docs/backlog-novas-funcionalidades.md`; histórico técnico de cada entrega em
`docs/status-implementacao.md`.

## Implementado

| Item | Descrição | Data | Observações |
| --- | --- | --- | --- |
| 1 | Blog de psicologia e saúde mental (`/blog`, `blog.psiagente.com.br`, CRUD `/admin/artigos`) | 2026-08-03 | CRUD ainda não testado clicando no formulário do navegador |
| 3 | Painel administrativo + cadastro de profissionais (convite + autocadastro) | 2026-08-03 (convite) / 2026-08-04 (autocadastro) | Fluxo de convite ainda não verificado ponta a ponta em produção; sem gate funcional por `aprovado` (depende do item 2) |
| 4 | Landing page para tráfego pago — Google Ads (`comece.psiagente.com.br`) | 2026-08-04 | Redesenhada com a identidade PsiAgente em 2026-08-06; no ar em produção |
| 2 | Diretório público de psicólogos (`busca.psiagente.com.br`: listagem/filtro, perfil individual, contato via WhatsApp) + CTA de cadastro, Termos de Uso obrigatórios, barreira de qualidade e ferramentas de divulgação | 2026-08-03/04 | Perfil só aparece publicamente quando `aprovado` (item 3) e `visivel_diretorio = true`; fluxo de convite do item 3 ainda não verificado ponta a ponta em produção. Redesenho visual (marketplace, cards de perfil, hero) em 2026-08-13 |
| 5 | Importar pacientes via planilha Excel, com tela de mapeamento de colunas | 2026-08-04 | Inclui também o campo "Precisa de recibo" no cadastro de paciente (fora do escopo original do item, surgiu na mesma sessão) e o filtro correspondente em `/recibos`. Estendido em 2026-08-11 pra aceitar CPF/RG |
| 1b | Papel de "criador de conteúdo" separado de admin (evolução pedida do item 1) | 2026-08-06 | — |

## A realizar

| Item | Descrição | Depende de |
| --- | --- | --- |
| 6 | Diferenciar Recibo de Nota Fiscal no cadastro do paciente (campo "Documento": Receita Saúde ou Nota Fiscal) | — |
| 7 | Emitir Nota Fiscal (NFS-e) direto pelo sistema, usando o kit em `NotaFiscal/nfse-nacional-kit`, com envio automático por e-mail ao paciente | 6 |
| 8 | Gerar arquivo TXT do movimento de atendimentos "Recibo" pro Carnê-Leão (layout a apresentar) | 6 |
| 9 | Rotina periódica (semanal/quinzenal/mensal) de envio automático do TXT do Carnê-Leão por e-mail | 8 |
| 10 | Marcar atendimento como "já gerado em TXT", avisando o operador e excluindo das gerações automáticas seguintes | 8, 9 |

Detalhamento de cada item em `docs/backlog-novas-funcionalidades.md`. Ver também
`docs/status-implementacao.md` pra funcionalidades feitas fora do backlog original
(rebrand PsiAgente, documentos/dependente financeiro do paciente, excluir/desativar
paciente, cartão de usuário logado na sidebar).
