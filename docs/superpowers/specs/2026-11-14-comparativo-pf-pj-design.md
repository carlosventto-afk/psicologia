# Comparativo Carnê-Leão x Simples Nacional (`/comparativo`) — design

Data: 2026-11-14. Origem: pedido do usuário em brainstorming (sessão de 2026-11-14).

## Intenção

Página pública de captação. O psicólogo que ainda não é cliente informa o
faturamento e as despesas e vê quanto pagaria de imposto como pessoa física
(Carnê-Leão) e como pessoa jurídica (Simples Nacional). O resultado leva a dois
caminhos: falar com o especialista do PsiAgente ou criar conta.

## Decisões do usuário

- URL: `psiagente.com.br/comparativo` (path no domínio principal, **não** subdomínio).
- Página pública, sem login.
- O resultado só aparece depois de o visitante informar **nome, WhatsApp e e-mail**.
- Despesas dedutíveis: 4 principais + "Outros" (com exemplos entre parênteses).
- O cenário PJ inclui o custo do contador (valor padrão editável).
- Dois CTAs no resultado: falar com o especialista; cadastrar no PsiAgente.

## Metas, não-metas, anti-metas

- Meta: gerar lead qualificado (já com contato e perfil de faturamento) e levar ao cadastro.
- Não-meta: substituir contador; calcular ISS fixo municipal da PF, Fator R detalhado por folha, lucro presumido, MEI, dependentes, outras fontes de renda.
- Anti-meta: número errado. Um comparativo que erra o imposto queima a marca. Todo resultado leva aviso de estimativa.

## Fluxo (mockup aprovado)

1. **Dados:** faturamento mensal; despesas (aluguel do consultório; supervisão e formação; contas do consultório — luz, internet, telefone; material e software; Outros — ex.: anuidade do CRP, marketing); custo do contador (padrão R$ 300, editável). Botão "Ver comparativo".
2. **Contato:** nome, WhatsApp, e-mail. Resultado desfocado ao fundo até o envio.
3. **Resultado:** dois cartões (PF/Carnê-Leão e PJ/Simples) com imposto, contador (PJ) e líquido; destaque da economia mensal e anual (ou de que PF compensa mais); gráfico de barras lado a lado; botões "Falar com o especialista (WhatsApp)" e "Cadastrar no PsiAgente"; aviso de estimativa.

## Regras de cálculo (vigência 2026; verificar antes de publicar)

Todos os parâmetros ficam num único arquivo (`web/lib/comparativo/parametros-2026.js`) com comentário de fonte e vigência, para trocar em janeiro sem mexer na lógica.

**PF — Carnê-Leão** (receita de pessoa física, mensal):
- Base = faturamento − despesas dedutíveis (livro-caixa) − INSS.
- INSS do autônomo: plano normal, 20% sobre o salário de contribuição limitado ao teto (R$ 8.475,55); piso do salário mínimo (R$ 1.621,00). *Escolha minha:* assumir o plano normal (o simplificado de 11% limita benefício ao mínimo e confunde a comparação).
- IRPF: tabela progressiva mensal vigente + redutor da Lei 15.270/2025: para base ≤ R$ 5.000 o imposto zera; entre R$ 5.000,01 e R$ 7.350 redução = R$ 978,62 − 0,133145 × base; acima de R$ 7.350 sem redutor.
- **Ponto em aberto de fonte:** as fontes divergem se o limite de R$ 5.000 vale sobre a base líquida ou sobre o rendimento bruto. Implementar conforme a orientação oficial da Receita (ver "Fontes"); se não for conclusivo, usar a leitura mais conservadora (bruto) e registrar como hipótese.

**PJ — Simples Nacional:**
- Pró-labore = 28% do faturamento (para manter Fator R ≥ 28% e ficar no Anexo III), com mínimo de um salário mínimo; INSS 11% sobre o pró-labore até o teto; IRRF do pró-labore pela tabela mensal.
- Imposto do Simples: alíquota efetiva do Anexo III sobre o RBT12 estimado (faturamento mensal × 12), com a fórmula `(RBT12 × alíq − PD) / RBT12`.
- Contador: valor informado.
- Líquido PJ = faturamento − Simples − INSS pró-labore − IRRF pró-labore − contador − despesas. Despesas entram nos dois cenários como custo real, mas só reduzem a base no Carnê-Leão. *Escolha minha:* a distribuição de lucro é considerada isenta (válido para faturamentos mensais baixos; acima do limite de retenção sobre dividendos da Lei 15.270, mostrar aviso em vez de calcular).
- Faturamento anual acima do limite do Simples (R$ 4,8 mi) ou valores inválidos: mensagem de validação.

## Lead e CTAs

- Ao enviar o contato, gravar um `Lead` (origem nova `comparativo`, estágio `novo`, `visitante_sessao_id` do cookie `pv_id`) e avisar o ADM por e-mail com os números do comparativo. Insert com service-role (RLS do CRM é admin-only), melhor esforço: falha de gravação não impede de mostrar o resultado.
- Gravar nos dados do Lead (nota inicial em `LeadNota`) o faturamento, despesas e resultado, para o ADM abrir a conversa já sabendo.
- CTA especialista: link `wa.me/5591981910295` (`NUMERO_GESTOR` em `web/lib/whatsapp.js`) com mensagem pré-preenchida mencionando o comparativo. *Minha escolha:* link direto em vez de acionar o agente comercial.
- CTA cadastro: `/cadastro` com `origem=comparativo` (o formulário já aceita `origem`).
- Telefone duplicado: não pode quebrar; o índice único de telefone vale só para origem `whatsapp`.

## Rastreio e SEO

- Adicionar `/comparativo` a `PATHS_FUNIL` em `web/proxy.js` (pageviews no funil) e a `PUBLIC_PATHS` em `web/lib/supabase/proxy.js`.
- Adicionar ao `sitemap.js`; metadata própria (título, descrição, Open Graph).
- Visual: mesma identidade da home institucional/`/comece` (Sora + Inter, tokens existentes).

## Fora de escopo / a decidir pelo construtor

- Gráfico: SVG/CSS simples, sem biblioteca nova.
- Estrutura de pastas e testes: `web/lib/comparativo/` com cálculo puro e testes `.test.mjs` no padrão dos já existentes (`node --test`).
- Validação de WhatsApp (formato BR) e e-mail no servidor; proteção básica contra spam (honeypot e limite por sessão).

## Fontes consultadas (conferir antes de publicar)

- Receita Federal sobre o redutor a partir de 2026 (via [Fenacon](https://fenacon.org.br/noticias/receita-federal-orienta-fontes-pagadoras-e-contribuintes-a-calcular-a-reducao-do-imposto-de-renda-a-partir-de-1o-de-janeiro-de-2026/) e [Coad](https://coad.com.br/home/noticias-detalhe/135095/receita-federal-orienta-fontes-pagadoras-e-contribuintes-a-calcular-a-reducao-do-imposto-de-renda-a-partir-de-1-de-janeiro-de-2026)).
- Tabela e teto do INSS 2026 ([Contabilizei](https://www.contabilizei.com.br/contabilidade-online/tabela-inss/), [Trivium](https://triviumcontabil.com.br/tabela-inss-2026/)).
- Tabela mensal do IRPF e Anexo III do Simples: ainda não consultados; o construtor deve buscar a fonte oficial (Receita Federal / LC 123).
- **Validação final por contador** é pré-requisito para divulgar a página.
