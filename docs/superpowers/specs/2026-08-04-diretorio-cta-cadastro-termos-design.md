# Diretório público — CTA de cadastro, termos de uso e divulgação — design

Status: aprovado em conversa, aguardando revisão do arquivo escrito.
Extensão do item 2 do backlog (`docs/backlog-novas-funcionalidades.md`),
que já está implementado e em produção
(`docs/superpowers/specs/2026-08-03-diretorio-publico-psicologos-design.md`).

## Contexto

`busca.psifacil.com.br` (listagem + perfil individual + contato via
WhatsApp) já está no ar. O que falta, identificado nesta conversa: não
existe nenhum convite pra profissionais se cadastrarem a partir desse
próprio site (só existe em `comece.psifacil.com.br`, a landing paga), o
toggle "Aparecer no diretório público" em `/diretorio` não tem nenhuma
aceitação de termos nem exige um mínimo de conteúdo (dá pra publicar um
perfil vazio), e não existe nenhuma página de Termos de Uso no produto.

Motivação adicional do usuário: o site cumpre dois papéis — ferramenta de
divulgação do profissional (ele usa o link do próprio perfil pra se
promover) e ferramenta de busca do paciente — então vale reforçar os dois
lados nesta entrega, não só o cadastro.

## Decisões de escopo (da conversa de brainstorming)

1. **Cadastro livre por enquanto** — igual ao autocadastro que já existe
   (`/cadastro`, item 3): sem segunda aprovação de admin sobre o conteúdo do
   perfil, mantendo a decisão já tomada no design original do diretório.
2. **Entrada por `busca.` cai direto em `/diretorio` após o cadastro**, e
   não no dashboard padrão — diferente do fluxo vindo de `comece.`, que
   continua caindo em `/` (intenções diferentes: quem vem de `busca.` já
   demonstrou que quer aparecer no diretório).
3. **Termos de uso**: página estática `/termos`, aceite registrado com
   timestamp (sem versionamento — se o texto mudar de forma relevante no
   futuro, o reforço de consentimento é por e-mail, não reabrindo esta
   feature).
4. **Barreira mínima de qualidade pra publicar**: bio, foto e pelo menos 1
   especialidade são obrigatórios pra ativar "Aparecer no diretório
   público" (perfil incompleto ainda pode ser salvo como rascunho,
   invisível). Foto é obrigatória por pedido explícito do usuário — perfil
   sem foto não passa credibilidade num diretório público.
5. **Ferramentas de divulgação incluídas nesta entrega**: botão de
   compartilhar o link do próprio perfil, e imagem de Open Graph (a foto do
   perfil) na página pública — ambas de custo baixo e sem modelo de dado
   novo.
6. **Fora de escopo** (mantido do design original do item 2, não reaberto):
   avaliações de pacientes, verificação de CRP, segunda aprovação de admin
   sobre conteúdo do perfil, agendamento online.

## Arquitetura de dados

Uma coluna nova em `PerfilPublico`:

```sql
alter table public."PerfilPublico"
  add column termos_aceitos_em timestamptz;
```

Sem RLS nova — a policy de escrita já existente (`perfilpublico_update_dono`)
já cobre esse campo, por ser dono do perfil escrevendo na própria linha.

## Fluxo: CTA em `busca.` → cadastro → `/diretorio`

- Banner fixo no topo de `/busca` (`web/app/busca/page.js`), antes do
  formulário de filtro — visível sempre, independente do resultado da
  busca (cobre também o caso de lista vazia, sem precisar de lógica
  condicional separada pro empty state): "É psicólogo? Apareça aqui
  gratuitamente" + botão "Cadastre-se grátis".
- O link é absoluto pro domínio principal — necessário porque `busca.` reescreve
  qualquer caminho relativo pra dentro de `/busca/...` (`web/proxy.js`), então
  um `<Link href="/cadastro">` normal viraria `/busca/cadastro`, que não
  existe. Mesmo padrão já usado em `comece/page.js`
  (`https://psifacil.com.br/cadastro`), aqui com um parâmetro a mais:
  `https://psifacil.com.br/cadastro?origem=busca`.
- `web/app/(auth)/cadastro/page.js` (Server Component) lê
  `searchParams.origem` e, se for `"busca"`, inclui um campo oculto
  `<input type="hidden" name="origem" value="busca" />` no formulário.
- `cadastrar()` em `web/lib/actions/auth.js` lê
  `formData.get("origem")`: se for `"busca"`, `redirect("/diretorio")` ao
  final; caso contrário mantém o comportamento atual (`redirect("/")`).

## Fluxo: termos de uso + barreira de publicação

**Página `/termos`** (nova, pública — adicionar a `PUBLIC_PATHS` em
`web/lib/supabase/proxy.js`):

> **Termos de Uso do Diretório PsiFácil**
>
> Ao ativar seu perfil no diretório público (busca.psifacil.com.br), você
> concorda com o seguinte:
>
> 1. O serviço é gratuito por enquanto. Podemos no futuro passar a cobrar
>    pela manutenção do diretório, com aviso prévio razoável.
> 2. Estes termos podem ser alterados a qualquer momento — a versão vigente
>    é sempre a publicada nesta página.
> 3. Você é responsável pela veracidade das informações do seu perfil
>    (nome, CRP, especialidades, valores, contato).
> 4. O contato entre paciente e profissional acontece diretamente pelo
>    WhatsApp informado — o PsiFácil não intermedeia nem se responsabiliza
>    pelo atendimento, agendamento ou cobrança feitos fora da plataforma.
> 5. Podemos remover ou ocultar perfis com informação falsa, ofensiva ou
>    que violem estes termos.

**Formulário `/diretorio`** (`web/components/PerfilDiretorioForm.js`):
- Checkbox novo "Li e concordo com os [Termos de Uso](/termos)" (link abre
  em nova aba, `target="_blank"`).
- Se `perfil?.termos_aceitos_em` já existir, o checkbox some (ou aparece
  marcado e desabilitado, com "Aceito em `<data>`") — não faz sentido pedir
  de novo a cada salvamento.

**Server Action `salvarPerfil`** (`web/lib/actions/diretorio.js`) — validação
nova, **antes de qualquer escrita no banco**: se `visivel_diretorio` for
`true`, exigir todos:
- `bio` não vazia;
- foto presente — upload nesta submissão OU `perfilExistente?.foto_url` já
  existente;
- `especialidadeIds.length > 0`;
- termos aceitos — checkbox marcado nesta submissão OU
  `perfilExistente?.termos_aceitos_em` já preenchido.

Se qualquer um faltar, retornar `{ error: "..." }` explicando o que falta
(mensagem lista os itens pendentes) e não persistir nenhuma mudança. Se o
checkbox de termos foi marcado nesta submissão, gravar
`termos_aceitos_em: new Date().toISOString()` junto com o resto do
`update`/`insert` (não sobrescrever se já tinha data).

## Ferramentas de divulgação

**Compartilhar perfil** (`web/app/(app)/diretorio/page.js` +
componente client novo `web/components/BotaoCompartilharPerfil.js`): só
aparece quando `perfil?.slug` existe (perfil já foi salvo ao menos uma
vez). Botão copia `${NEXT_PUBLIC_BUSCA_URL}/${perfil.slug}` pra área de
transferência (`navigator.clipboard.writeText`) e mostra confirmação
("Link copiado!") por alguns segundos.

**Open Graph no perfil público** (`web/app/busca/[slug]/page.js`,
`generateMetadata`): adicionar

```js
openGraph: {
  title: perfil.nome,
  description: perfil.bio ?? undefined,
  images: perfil.foto_url ? [perfil.foto_url] : undefined,
},
```

## Fora de escopo nesta entrega

- Avaliações/reviews de pacientes, verificação de CRP, segunda aprovação de
  admin sobre conteúdo do perfil, agendamento online — já fora de escopo no
  design original do item 2, não reabertos aqui.
- Versionamento dos Termos de Uso (só timestamp de aceite).
- CTA de cadastro em outras páginas públicas (blog, perfil individual) —
  só no topo de `/busca`, conforme pedido.

## Verificação (pra quando for implementado)

- `npm run build` sem erro; rotas `/termos`, `/diretorio`, `/busca`
  continuam listadas.
- `curl -H "Host: busca.localhost:3000"` confirma que o banner e o link
  `https://psifacil.com.br/cadastro?origem=busca` aparecem em `/busca`.
- Fluxo completo no navegador (chrome-devtools MCP): cadastrar por
  `/cadastro?origem=busca` → cai em `/diretorio`; tentar marcar "Aparecer no
  diretório" sem bio/foto/especialidade/termos → bloqueado com mensagem
  clara; preencher tudo, aceitar termos, marcar o toggle → salva com
  sucesso e `termos_aceitos_em` gravado no banco; perfil aparece em
  `busca.localhost:3000`.
- Botão "Compartilhar meu perfil" copia a URL correta.
- Meta tag `og:image` presente no HTML de `/busca/[slug]` quando o perfil
  tem foto.
- `/termos` acessível sem login.
