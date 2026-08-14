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
| 5 | Importar pacientes via planilha Excel, com tela de mapeamento de colunas | 2026-08-04 | Inclui também o campo "Precisa de recibo" no cadastro de paciente (fora do escopo original do item, surgiu na mesma sessão) e o filtro correspondente em `/recibos`. Estendido em 2026-08-11 pra aceitar CPF/RG. Campo renomeado pro item 6 abaixo |
| 1b | Papel de "criador de conteúdo" separado de admin (evolução pedida do item 1) | 2026-08-06 | — |
| 11 (metade 1) | Planos do produto (Psi Gestão / Psi Gestão + Marketing / Psi Marketing) — modelo de plano e controle de acesso, atribuição manual pelo admin em `/admin/profissionais` | 2026-08-13 | Sem cobrança/gateway (fora de escopo, ver item 11 completo abaixo). Código mesclado e pushado; verificação end-to-end no navegador ainda pendente (ferramentas de browser desconectadas na sessão) |
| 6 | Diferenciar Recibo de Nota Fiscal no cadastro do paciente — campo `Paciente.documento` (Nenhum/Receita Saúde/Nota Fiscal) substitui o boolean `precisa_recibo` | 2026-08-13 | `/recibos` continua só lidando com Receita Saúde (Nota Fiscal ainda não tem emissão real — depende do item 7). Código mesclado e pushado; verificação end-to-end no navegador ainda pendente |
| 8 | Gerar arquivo TXT do movimento de atendimentos "Recibo" pro Carnê-Leão, no layout "Recibos do Receita Saúde" (16 campos) — tela `/carne-leao` com seletor de mês, agrupamento por pagador+paciente e opção de combinar múltiplos atendimentos pagos juntos numa única linha/recibo. Inclui nova tela `/configuracoes/conta` pro profissional cadastrar o próprio CPF/CRP (pré-requisito, campo `Usuarios.cpf` novo) | 2026-08-13 | Fonte de dados é `PagamentoSessao` (valor/data realmente recebidos), não `Sessao`. CPF validado (11 dígitos) antes de entrar no arquivo; pagamento sem CPF válido fica de fora com aviso. Geração sempre recalculada no servidor a partir dos ids (nunca confia em valor/CPF vindo do client). Verificação end-to-end no navegador ainda pendente |
| 9 | Rotina periódica (semanal/quinzenal/mensal) de envio automático do TXT do Carnê-Leão por e-mail, via n8n externo (implantado na mesma VPS) chamando um endpoint novo (`/carne-leao-automatico`, protegido por segredo compartilhado) que decide quem está na data, gera o conteúdo e devolve pro n8n distribuir | 2026-08-14 | Configuração de frequência/e-mail de destino em `/configuracoes/conta`. Evita duplicidade/lacuna sem depender do item 10: cobre o delta desde o último envio, nunca cruzando virada de mês. Nova tabela `EnvioAutomaticoCarneLeao` (auditoria, bloqueada com RLS). **Pendências de infra pra funcionar em produção**: configurar `CARNE_LEAO_CRON_SECRET` no EasyPanel e no nó HTTP do n8n (documentado em `docs/status-implementacao.md`); implantar o workflow do n8n em si (fora do escopo de código). Verificação end-to-end no navegador ainda pendente |

## A realizar

| Item | Descrição | Depende de |
| --- | --- | --- |
| 7 | Emitir Nota Fiscal (NFS-e) direto pelo sistema, usando o kit em `NotaFiscal/nfse-nacional-kit`, com envio automático por e-mail ao paciente | 6 |
| 10 | Marcar atendimento como "já gerado em TXT", avisando o operador e excluindo das gerações automáticas seguintes | 8, 9 |
| 11 (metade 2) | Cobrança/gateway de pagamento dos planos (preço, assinatura, inadimplência) | 11 (metade 1) |

Detalhamento de cada item em `docs/backlog-novas-funcionalidades.md`. Ver também
`docs/status-implementacao.md` pra funcionalidades feitas fora do backlog original
(rebrand PsiAgente, documentos/dependente financeiro do paciente, excluir/desativar
paciente, cartão de usuário logado na sidebar).
