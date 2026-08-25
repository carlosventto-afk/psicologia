# Blog: redesign, SEO, imagens e automação de publicação — design

Status: aprovado para plano de implementação
Data: 2026-08-25
Pedido do usuário, decorrente do plano de crescimento orgânico de 90 dias
(item central do plano é o blog do produto como canal de conteúdo, ver
artefato publicado na sessão). O blog já existe e funciona
(`web/app/blog/`, tabela `artigos`) desde o item 1 do backlog — esta
entrega melhora o que já está no ar, não cria o blog do zero.

## Objetivo

Quatro melhorias sobre o blog existente:

1. Tela inicial e página de artigo com aparência profissional, parecida
   com blogs de alto tráfego (hoje é uma lista simples de cards de
   texto).
2. Tratamento de SEO pra gerar fluxo orgânico de busca.
3. Suporte a imagem — de capa (destaque na lista e no topo do artigo) e
   inseridas no meio do texto (como matéria jornalística).
4. Uma rota autenticada pra permitir que uma sessão futura do Claude
   publique/atualize artigo sem precisar de acesso direto ao banco.

## O que já existe (não faz parte desta entrega)

- Tabela `public.artigos` (`titulo`, `slug`, `resumo`, `conteudo`
  markdown, `autor`, `publicado`, `publicado_em`, `criado_em`,
  `atualizado_em`), RLS: leitura pública só de publicado, escrita só
  admin (`supabase/migrations/20260803000001_add_artigos_blog.sql`).
- Papel "criador de conteúdo" (`Usuarios.criador_conteudo`) — profissional
  marcado assim publica artigo sem ser admin completo
  (`docs/superpowers/specs/2026-08-06-criador-de-conteudo-blog-design.md`).
- Renderização: `web/app/blog/[slug]/page.js` usa `marked.parse(artigo.conteudo)`
  pra converter markdown em HTML, injetado via `dangerouslySetInnerHTML`.
- `web/app/blog/page.js` (lista simples de cards) e `web/app/blog/layout.js`
  (header com logo + metadata básica de título/descrição).
- `web/lib/data/artigos.js` (`listarArtigosPublicados`,
  `buscarArtigoPublicadoPorSlug`, `listarArtigosAdmin`, `buscarArtigoAdmin`)
  e `web/lib/actions/artigos.js` (`criarArtigo`, `atualizarArtigo`,
  server actions).
- `web/components/ArtigoForm.js` — client component (`useActionState`),
  formulário único reaproveitado por criação e edição.
- Padrão de upload de imagem pública já em produção: bucket Supabase
  Storage `perfis-publicos`, usado em `web/lib/actions/diretorio.js`
  (`supabase.storage.from("perfis-publicos").upload(caminho, arquivo, {upsert:true, contentType})`
  seguido de `.getPublicUrl(caminho)`).
- Padrão de rota autenticada por segredo compartilhado:
  `web/app/api/agent/call-tool/route.js` (header customizado comparado
  contra env var, `createAdminClient()` pra bypass de RLS) — o modelo
  pra rota nova desta entrega.
- `web/lib/supabase/proxy.js` — middleware que redireciona pra `/login`
  qualquer rota não listada em `PUBLIC_PATHS`. **Lição já aprendida
  nesta mesma sessão** (rota do agente de WhatsApp ficou bloqueada até
  isso ser lembrado): toda rota de API autenticada por segredo próprio
  (não por sessão) precisa entrar em `PUBLIC_PATHS`, senão o middleware
  bloqueia antes mesmo dela rodar.

## Decisão de abordagem: editor de imagem

Duas opções levantadas e decididas com o usuário:

- **A (escolhida):** manter o editor de texto simples (textarea markdown)
  e adicionar upload de imagem que insere `![](url)` na posição do
  cursor — sem dependência nova, sem mudar como o conteúdo é
  armazenado/renderizado.
- **B (descartada):** editor rico (WYSIWYG, ex: TipTap) com
  drag-and-drop de imagem — mais bonito de usar, mas exige dependência
  nova e muda o formato de armazenamento do conteúdo (HTML ou JSON
  próprio em vez de markdown), quebrando compatibilidade com os 3
  artigos que já existem em markdown puro. Descartada por YAGNI — a
  opção A já resolve o pedido ("inserir imagem no meio, como matéria
  jornalística").

## Modelo de dados

### Coluna nova em `artigos`

```sql
alter table public.artigos add column imagem_capa text;
```

Guarda a URL pública da imagem de capa (ou `null` se o artigo não tem
capa — os 3 artigos já publicados nascem sem capa, adicionada depois se
o usuário quiser). Nenhuma coluna nova pra imagens do meio do texto —
elas vivem só como markdown `![alt](url)` dentro de `conteudo`, sem
estrutura própria no banco (mesmo raciocínio: markdown já resolve isso
sozinho, não precisa de tabela de relação artigo↔imagem).

### Bucket de Storage novo

`artigos-imagens` — público, mesmo padrão de criação/política do bucket
`perfis-publicos` já existente (conferir a migration que criou aquele
bucket e replicar a mesma política de leitura pública + escrita só
autenticada/admin). Caminho dos arquivos:
- Capa: `<slug-do-artigo>/capa.<ext>`
- Imagem do meio do texto: `<slug-do-artigo>/<timestamp>.<ext>`

Usar `upsert: true` na capa (mesma lógica do `perfis-publicos`: trocar a
capa reaproveita o mesmo caminho, sem acumular arquivo órfão) e nome
único (timestamp) pras imagens do meio do texto, já que pode haver
várias por artigo.

## Editor (`ArtigoForm.js`)

Dois elementos novos no formulário existente, ambos client-side:

1. **Campo de capa**: `<input type="file" accept="image/*">` com preview
   da imagem atual (se houver) ou da nova selecionada antes de salvar.
   Upload acontece no submit do formulário (mesmo ciclo de vida do resto
   do form), não upload imediato — evita criar uma imagem órfã no
   Storage se o usuário desistir de salvar.
2. **Botão "Inserir imagem no texto"**: abre seletor de arquivo, faz
   upload **imediato** (via uma server action dedicada, retorna a URL
   pública), e insere `![](url)` na posição do cursor do textarea de
   conteúdo (usando `ref` + `selectionStart`/`selectionEnd` do DOM, já
   que é um componente client). Diferente da capa, esse upload é
   imediato porque o usuário precisa ver a URL inserida no texto pra
   continuar escrevendo ao redor dela — não dá pra esperar o submit do
   formulário inteiro.

Server actions novas em `web/lib/actions/artigos.js`:
- `fazerUploadImagemArtigo(slug, arquivo)` — usada pelo botão de
  inserir-no-meio-do-texto, retorna `{url}` ou `{error}`.
- `criarArtigo`/`atualizarArtigo` (já existentes) ganham o parâmetro
  `imagem_capa` — se um novo arquivo de capa veio no FormData, faz
  upload antes de gravar a linha; se não veio nenhum e já existia
  capa, mantém a atual; se o usuário marcar "remover capa" (checkbox
  extra), grava `null`.

## Tela inicial do blog (`web/app/blog/page.js`)

- **Post em destaque**: o artigo mais recente aparece maior, com capa
  grande (ou um bloco de cor sólida com o título, se não tiver capa —
  nunca deixar buraco visual vazio).
- **Grade dos demais**: cards com capa em miniatura (ou o mesmo bloco de
  cor sólida como fallback), título, resumo, data, tempo de leitura
  estimado (`Math.ceil(contagemDePalavras / 200)` minutos — heurística
  padrão de blog, não precisa ser exata).
- **Sem categoria/tag** — só 3 artigos hoje; adicionar taxonomia agora
  seria estrutura sem uso real. Fica pra quando o volume justificar.
- Paleta e tipografia: reaproveitar os tokens de marca já definidos em
  `web/app/globals.css` (petróleo/âmbar/marfim, Sora+Inter) — o blog já
  usa essas classes (`text-navy`, `font-display`), só precisa de mais
  hierarquia visual, não de cores novas.

## Página do artigo (`web/app/blog/[slug]/page.js`)

- Capa em destaque no topo (se houver).
- Tempo de leitura estimado ao lado da data/autor.
- Corpo do artigo sem mudança de renderização (`marked.parse` continua
  igual — imagens do meio do texto já funcionam automaticamente, é
  markdown padrão).

## SEO

- **`sitemap.xml`**: usar a convenção de arquivo especial do Next.js App
  Router (`web/app/sitemap.js` ou, se já existir um sitemap raiz pro
  resto do site, estender ele) incluindo `/blog` e cada
  `/blog/[slug]` publicado, com `lastModified` = `atualizado_em`.
- **Dados estruturados**: JSON-LD tipo `BlogPosting` injetado em cada
  página de artigo (`headline`, `image`, `datePublished`,
  `dateModified`, `author`, `description`) — é o que habilita rich
  snippet no Google.
- **Open Graph**: `generateMetadata` (já existe em `[slug]/page.js`)
  ganha `openGraph.images` = `imagem_capa` do artigo (fallback: logo do
  PsiAgente, nunca deixar sem imagem no compartilhamento).
- **`robots.txt`**: conferir que `/blog` e `/blog/*` não estão
  bloqueados (checar o `robots.txt` atual do projeto, já que
  `/robots.txt` já é uma rota conhecida — ver `PUBLIC_PATHS` em
  `proxy.js`).

## Rota de automação: `POST /api/blog/artigos`

Segue exatamente o padrão de `web/app/api/agent/call-tool/route.js`:

```js
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarSlug } from "@/lib/slugify";

export async function POST(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { titulo, slug, resumo, conteudo, autor, publicado, imagem_capa_url } = body;

  if (!titulo || !slug || !conteudo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  const slugNormalizado = normalizarSlug(slug);
  const dados = {
    titulo,
    slug: slugNormalizado,
    resumo: resumo ?? null,
    conteudo,
    autor: autor ?? null,
    publicado: publicado ?? false,
    imagem_capa: imagem_capa_url ?? null,
  };

  const { data: existente } = await admin
    .from("artigos")
    .select("id, publicado_em")
    .eq("slug", slugNormalizado)
    .maybeSingle();

  if (existente) {
    if (dados.publicado && !existente.publicado_em) {
      dados.publicado_em = new Date().toISOString();
    }
    const { data, error } = await admin
      .from("artigos")
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq("id", existente.id)
      .select()
      .single();
    if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
    return Response.json({ success: true, data, acao: "atualizado" });
  }

  if (dados.publicado) dados.publicado_em = new Date().toISOString();
  const { data, error } = await admin.from("artigos").insert(dados).select().single();
  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ success: true, data, acao: "criado" });
}
```

**Nova env var**: `BLOG_API_SECRET` (mesmo padrão de `AGENT_TOOL_SECRET`
— gerada uma vez, configurada no EasyPanel).

**`PUBLIC_PATHS`** (`web/lib/supabase/proxy.js`) ganha
`"/api/blog/artigos"` — sem isso a rota fica inacessível (mesma lição
já registrada acima).

**Fora de escopo desta rota**: upload de arquivo binário de imagem via
API. A rota só aceita `imagem_capa_url` como uma URL já hospedada em
algum lugar (se uma sessão futura do Claude gerar uma imagem de capa,
ela hospeda em outro serviço e passa só a URL aqui) — implementar
upload binário automatizado não foi pedido e adicionaria complexidade
sem uso confirmado ainda.

## Testes

Sem framework automatizado (convenção já estabelecida no projeto).
Verificação por camadas, mesmo padrão dos itens anteriores:

1. **Migration + bucket**: aplicar direto contra produção, confirmar
   coluna `imagem_capa` existe e bucket `artigos-imagens` aceita upload
   público de leitura.
2. **Editor**: criar/editar artigo de teste com capa + uma imagem no
   meio do texto, confirmar que a imagem do meio aparece na posição
   certa do markdown e que a capa aparece na lista e no topo do artigo.
3. **SEO**: verificar `sitemap.xml` lista os artigos publicados,
   inspecionar o HTML de um artigo pra confirmar o JSON-LD e as tags
   Open Graph (incluindo imagem), conferir `robots.txt` não bloqueia
   `/blog`.
4. **Rota de automação**: chamar `POST /api/blog/artigos` com curl
   (segredo certo/errado, criar artigo novo, atualizar artigo
   existente pelo mesmo slug), confirmar que aparece em
   `/admin/artigos` e, se `publicado: true`, no `/blog` público.
5. **Regressão dos 3 artigos existentes**: confirmar que continuam
   renderizando normalmente (sem capa, sem imagem no meio) depois da
   migration — nenhum deles deve quebrar por não ter os campos novos
   preenchidos.
