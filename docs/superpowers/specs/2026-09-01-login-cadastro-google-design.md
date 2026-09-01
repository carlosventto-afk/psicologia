# Login e cadastro de profissional via Google

**Status:** aprovado, pronto para implementação.

## Objetivo

Hoje o único jeito de um profissional entrar no PsiAgente é e-mail/senha
(`/login`, `/cadastro`) ou convite do admin (`/admin/profissionais/novo`).
Este item adiciona **login e autocadastro via Google** como método
alternativo — mesmo botão cobre os dois casos, já que tecnicamente não há
diferença entre "entrar" e "cadastrar" num provedor OAuth: o Supabase cria
a conta na hora, na primeira vez que alguém autentica com um Google novo.

## Não são objetivos desta entrega

- Login via Google para pacientes (não existe conta de paciente hoje).
- Outros provedores OAuth (Microsoft, Apple etc.) — só Google, por ser o
  pedido explícito.
- Mudar o fluxo de convite do admin (`convidarProfissional`) — continua
  só por e-mail, sem opção de Google.

## O problema central: provisionamento sem telefone

`Usuarios.contato` é **`NOT NULL`** no banco (e o formulário de cadastro
de hoje pede telefone como obrigatório). O perfil do Google só devolve
nome e e-mail — nunca telefone. Isso significa que, na primeira vez que
alguém autentica via Google, existe uma sessão autenticada (`auth.users`)
sem nenhuma linha correspondente em `Usuarios` — um estado que **não
existe hoje** em lugar nenhum do app. Toda página logada assume que
`Usuarios` existe (`buscarUsuarioAtual()` faz `.select(...).single()`, que
lança erro se a linha não existir), então esse gap precisa ser fechado
antes do usuário conseguir usar qualquer tela.

**Decisão:** interstitial obrigatório. Depois do primeiro login via
Google, antes de qualquer outra tela, o profissional passa por
`/completar-perfil` pra informar o telefone (CRP continua opcional, igual
hoje) — só depois disso a linha em `Usuarios` é criada e ele entra no app
normalmente.

## Fluxo

### 1. Botão "Entrar com Google" (`/login` e `/cadastro`)

Mesma Server Action nos dois lugares — `entrarComGoogle(origem)` em
`web/lib/actions/auth.js`:

```js
export async function entrarComGoogle(origem) {
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = origem === "busca" ? "/diretorio" : "/";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data?.url) {
    redirect("/login?erro=google");
  }

  redirect(data.url);
}
```

Em `/login`: `<form action={entrarComGoogle.bind(null, null)}>` (sempre
volta pra `/`). Em `/cadastro`: `entrarComGoogle.bind(null, origem)`, onde
`origem` é o mesmo parâmetro que a tela já recebe hoje (`?origem=busca`
vindo do CTA de `/busca`) — preserva o redirecionamento pro `/diretorio`
depois do cadastro, igual ao fluxo de e-mail/senha já existente.

Botão simples abaixo do formulário de senha, com um divisor "ou" — sem
biblioteca nova, é HTML/CSS que já existe no design system do app.

### 2. Callback ganha checagem de provisionamento

`web/app/auth/callback/route.js`, depois de `exchangeCodeForSession`:

```js
const { data: { user } } = await supabase.auth.getUser();

const { data: usuarioExistente } = await supabase
  .from("Usuarios")
  .select("id")
  .eq("id_user", user.id)
  .maybeSingle();

if (!usuarioExistente) {
  return NextResponse.redirect(`${origin}/completar-perfil?next=${encodeURIComponent(next)}`);
}

return NextResponse.redirect(`${origin}${next}`);
```

Essa checagem é um no-op pro fluxo de recuperação de senha que já usa essa
mesma rota (`?next=/redefinir-senha`) — quem pede recuperação de senha já
tem `Usuarios` de antes, então cai direto no `return` final de sempre.

### 3. Nova rota `web/app/completar-perfil/page.js`

De propósito **fora** do grupo `(app)` — não pode passar por
`(app)/layout.js`, que chama `buscarUsuarioAtual()` e quebraria pra um
usuário autenticado sem linha em `Usuarios` ainda. É uma rota de topo,
mesmo nível de `(auth)`/`(app)`, com sua própria checagem:

- Sem sessão → redireciona pra `/login`.
- Sessão existe mas `Usuarios` já existe pra esse `id_user` → redireciona
  pro `next` (evita reentrar aqui à toa, ex. usuário voltando com o botão
  do navegador).
- Sessão existe e `Usuarios` não existe → renderiza o formulário.

Formulário (`web/components/CompletarPerfilForm.js`, mesmo padrão visual
de `CadastroForm.js`): nome pré-preenchido de
`user.user_metadata.full_name ?? user.user_metadata.name` (editável — o
profissional pode corrigir), e-mail mostrado como texto (não editável —
vem do Google), telefone obrigatório, CRP opcional. Sem campo de senha (a
conta já está autenticada via Google, não precisa de senha local). O
`next` lido pela `page.js` a partir do `searchParams` (mandado pelo
callback) vira um `<input type="hidden" name="next" />`, mesmo padrão já
usado pro `origem` em `CadastroForm.js`.

Server Action nova, `completarPerfilGoogle(prevState, formData)` em
`web/lib/actions/auth.js`:

```js
export async function completarPerfilGoogle(prevState, formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nome = formData.get("nome");
  const contato = formData.get("contato");
  const crp = formData.get("crp");
  const next = formData.get("next") || "/";

  const { error } = await supabase.from("Usuarios").insert({
    id_user: user.id,
    nome,
    email: user.email,
    contato: Number(String(contato).replace(/\D/g, "")),
    crp: crp || null,
    role: "psicologo",
    aprovado: false,
  });

  if (error) {
    return { error: "Não foi possível salvar seu cadastro. Tente novamente." };
  }

  await criarClassificacoesPadrao(supabase, user.id).catch(() => {});

  redirect(next);
}
```

Mesma paridade do autocadastro por e-mail de hoje: `role: "psicologo"`,
`aprovado: false` (aparece pendente pro admin em `/admin/profissionais`,
mesmo aviso amarelo de "cadastro pendente" já existente em
`(app)/layout.js` — nada novo aí).

## Vinculação de conta existente (mesmo e-mail, provedores diferentes)

Se um profissional que já tem conta por e-mail/senha clicar "Entrar com
Google" usando o mesmo e-mail, o comportamento padrão do Supabase Auth
(sem "automatic linking" habilitado) é recusar ou criar uma segunda
identidade solta, dependendo da configuração do projeto — nenhum dos dois
é o que queremos. **Precisa habilitar "Enable automatic linking" nas
configurações de Auth do Supabase** (config de projeto, não código) pra
que um e-mail já verificado vire a mesma conta independente do provedor
usado pra entrar. Sem isso, existe risco real de duplicidade de cadastro
pra quem já é profissional cadastrado por e-mail.

## Arquivos tocados

- Modify: `web/lib/actions/auth.js` (`entrarComGoogle`, `completarPerfilGoogle`)
- Modify: `web/app/auth/callback/route.js` (checagem de provisionamento)
- Modify: `web/app/(auth)/login/page.js` (botão Google)
- Modify: `web/components/CadastroForm.js` (botão Google)
- Create: `web/app/completar-perfil/page.js`
- Create: `web/components/CompletarPerfilForm.js`

Nenhuma migration — não precisa de coluna nova, só reaproveita o schema
de `Usuarios` que já existe.

## Configuração externa (fora do código, bloqueante)

- Criar OAuth Client ID no Google Cloud Console, com redirect URI
  `https://rohulajgyxdangxfurha.supabase.co/auth/v1/callback` (URL fixa
  do Supabase, não do nosso domínio).
- Habilitar o provider Google no Supabase Auth (Client ID + Secret) —
  via Management API se o token de acesso salvo continuar funcionando,
  senão manual no dashboard.
- Habilitar "Enable automatic linking" (ver seção acima).

Sem essas 3 configurações, o botão "Entrar com Google" existe no código
mas devolve erro do próprio Supabase ao ser clicado — não dá pra testar
o fluxo ponta a ponta sem elas.

## Testes/verificação

Sem framework de testes automatizados no projeto (convenção já
registrada em itens anteriores). Verificação prevista:

- Build (`npm run build`) confirma que as rotas novas compilam.
- Não é possível clicar de verdade no fluxo OAuth completo sem as
  credenciais do Google configuradas (ver seção acima) — depende de ação
  externa do usuário antes de qualquer teste real.
- Depois de configurado: teste manual (não Playwright, dado o bug
  pré-existente de cookie em POST de Server Action já registrado no
  projeto) — clicar "Entrar com Google" num Google novo, confirmar
  redirecionamento pra `/completar-perfil`, preencher telefone, confirmar
  que `Usuarios` é criado com `aprovado: false` e que a sidebar mostra o
  aviso de pendente; depois, clicar "Entrar com Google" de novo com a
  mesma conta e confirmar que vai direto pro destino sem passar pelo
  interstitial.

## Riscos e decisões em aberto pra implementação

- **Token de acesso do Supabase Management API pode estar expirado** —
  se estiver, a habilitação do provider Google e do automatic linking
  precisa ser feita manualmente no dashboard pelo usuário.
- **Nome do usuário no metadata do Google**: o campo exato
  (`full_name` vs `name`) pode variar; a implementação deve checar os
  dois antes de deixar o campo em branco.
