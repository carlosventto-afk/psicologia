# Backlog — PsiFácil

Visão consolidada do backlog de novas funcionalidades, em 2 grupos. Ao
implementar um item, mova-o de "A realizar" para "Implementado" e registre a
data. Detalhamento de escopo/decisões de cada item está em
`docs/backlog-novas-funcionalidades.md`; histórico técnico de cada entrega em
`docs/status-implementacao.md`.

## Implementado

| Item | Descrição | Data | Observações |
| --- | --- | --- | --- |
| 1 | Blog de psicologia e saúde mental (`/blog`, `blog.psifacil.com.br`, CRUD `/admin/artigos`) | 2026-08-03 | CRUD ainda não testado clicando no formulário do navegador |
| 3 | Painel administrativo + cadastro de profissionais (convite + autocadastro) | 2026-08-03 (convite) / 2026-08-04 (autocadastro) | Fluxo de convite ainda não verificado ponta a ponta em produção; sem gate funcional por `aprovado` (depende do item 2) |
| 4 | Landing page para tráfego pago — Google Ads (`comece.psifacil.com.br`) | 2026-08-04 | Testado local via chrome-devtools MCP; ainda não está no ar (faltam DNS + domínio no EasyPanel) |
| 2 | Diretório público de psicólogos (`busca.psifacil.com.br`: listagem/filtro, perfil individual, contato via WhatsApp) + CTA de cadastro, Termos de Uso obrigatórios, barreira de qualidade e ferramentas de divulgação | 2026-08-03/04 | Perfil só aparece publicamente quando `aprovado` (item 3) e `visivel_diretorio = true`; fluxo de convite do item 3 ainda não verificado ponta a ponta em produção |
| 5 | Importar pacientes via planilha Excel, com tela de mapeamento de colunas | 2026-08-04 | Inclui também o campo "Precisa de recibo" no cadastro de paciente (fora do escopo original do item, surgiu na mesma sessão) e o filtro correspondente em `/recibos` |

## A realizar

| Item | Descrição | Depende de |
| --- | --- | --- |
| 1b | Papel de "criador de conteúdo" separado de admin (evolução pedida do item 1) | — |
