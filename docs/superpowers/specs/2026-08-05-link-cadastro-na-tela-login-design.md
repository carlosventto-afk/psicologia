# Link "Cadastre-se" na tela de login — design

Status: aprovado em conversa.

## Contexto

`psifacil.com.br` sem sessão redireciona pra `/login` — é a primeira tela
que qualquer visitante não autenticado vê. Essa tela só tem "Esqueci minha
senha"; não existe nenhum caminho visível pra quem ainda não tem conta
chegar em `/cadastro` (autocadastro público, já implementado — item 3 do
backlog). `/cadastro` já tem o link recíproco ("Já tem conta? Entrar" →
`/login`); só faltava o caminho inverso.

## Decisão

Adicionar em `web/app/(auth)/login/page.js`, logo abaixo do botão
"Entrar" (mesma posição relativa que `/cadastro` usa pro link inverso),
um `<Link href="/cadastro">` com o texto "Não tem conta? Cadastre-se",
usando a classe `.link` já existente (mesma classe do link "Esqueci minha
senha" logo acima, mesmo do link recíproco em `/cadastro`). Sem mudança de
lógica, sem novo componente — só markup.

## Fora de escopo

Nenhuma mudança em `/cadastro`, `/esqueci-senha`, ou em outros pontos de
entrada de cadastro (`comece.`, `busca.`) — só a tela `/login`.

## Verificação

`npm run build` sem erro; visualmente confirmar (chrome-devtools MCP ou
curl) que o link aparece em `/login` e leva pra `/cadastro`.
