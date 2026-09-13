# Pipeline diário de notícias CRP/CFP para o blog — design

Status: aprovado em conversa ("pode fazer").
Pedido do usuário: monitorar diariamente os sites do CFP e dos Conselhos
Regionais de Psicologia (CRP-SP, CRP-RJ, CRP-SC como exemplos), manter um
banco de notícias, e publicar 3 posts/dia no blog reescrevendo (nunca
copiando) o conteúdo, citando a fonte, avisando uso de IA, com imagem
ligada ao assunto e CTA suave pro PsiAgente — tom profissional, respeitando
as diretrizes do CFP.

## Contexto

O blog (`web/app/blog`, tabela `public.artigos`) já existe e tem SEO
tratado (sitemap, robots, JSON-LD, Open Graph — ver
`docs/superpowers/specs/2026-08-25-blog-redesign-seo-imagens-design.md`) e
uma rota de automação `POST /api/blog/artigos` autenticada por
`BLOG_API_SECRET`.

Também já existe uma routine na nuvem (`trig_01UaT7JzVFXo2iiEJ2APZmAf`,
"Daily blog post", ambiente `PostBlog`) rodando todo dia às 9h UTC baseada
em canais do YouTube. Investigação do log real (`get_run_log` da última
execução, 2026-09-13) mostrou que ela está **inoperante desde sempre**: o
ambiente não tem `BLOG_API_SECRET` nem nenhuma credencial, não há
mecanismo de geração de imagem implementado, e a conta não tem GitHub
conectado. Ela pesquisa, escreve um rascunho, salva no scratchpad efêmero
da sandbox (perdido ao fim da execução) e manda um push dizendo que não
tem onde publicar — todo santo dia, sem o usuário perceber porque o
painel mostra "sucesso" (a sessão não travou, só não fez o que devia).

Decisão do usuário: substituir essa routine pela nova (não rodar as duas
em paralelo).

## Decisões já fechadas na conversa

1. **Cadência**: 3 posts/dia, todos a partir de notícias CRP/CFP.
2. **Routine antiga**: substituída (reconfigurar `trig_01UaT7JzVFXo2iiEJ2APZmAf`
   em vez de criar uma nova e deixar a antiga órfã).
3. **Publicação**: rascunho (`publicado:false`) — usuário aprova
   manualmente em `/admin/artigos` por enquanto. Migração pra publicação
   automática fica pra depois que o processo provar consistência.
4. **Imagem**: banco de imagem editorial (Pexels API), não geração por IA
   — grátis, sem serviço novo de cobrança, chave aprovada na hora.

## Escopo de fontes (v1)

CFP (site.cfp.org.br) + CRP-SP + CRP-RJ + CRP-SC. A routine usa
`WebSearch`/`WebFetch` a cada execução pra achar as notícias recentes de
cada fonte — sem scraper fixo com seletor de HTML, que quebraria a
qualquer redesign dos sites (mesmo raciocínio já usado na routine antiga
pro YouTube). Outros CRPs ficam de fora da v1; adicionar depois é só
editar a lista de fontes no prompt da routine, sem mudar código.

## Modelo de dados: `noticias_conselhos`

Banco de notícias pedido pelo usuário — registra toda notícia encontrada
(usada ou não) pra nunca reescrever a mesma duas vezes e manter histórico.

```sql
create table public.noticias_conselhos (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,
  url text not null unique,
  titulo text not null,
  resumo_original text,
  publicado_em_origem date,
  usado_em_artigo_id uuid references public.artigos(id),
  descoberto_em timestamptz not null default now()
);

alter table public.noticias_conselhos enable row level security;

create policy "noticias_conselhos_admin_all" on public.noticias_conselhos
  for all using (public.is_admin()) with check (public.is_admin());
```

Sem policy de leitura pública — esse dado não é consumido por visitante,
só pela rota de automação (que usa `createAdminClient()`, ignora RLS de
qualquer forma; a policy é só defesa em profundidade, mesmo padrão de
`artigos`).

Arquivo: `supabase/migrations/20260913000001_add_noticias_conselhos.sql`.

## Endpoint novo: `/api/noticias`

Mesmo padrão de `web/app/api/blog/artigos/route.js` (header
`x-blog-secret` comparado contra `BLOG_API_SECRET`, `createAdminClient()`
pra bypass de RLS). Dois métodos:

**GET** — dedup antes de escrever. Recebe URLs candidatas, devolve quais
já são conhecidas.

```
GET /api/noticias?urls=<url1>,<url2>,...
→ { conhecidas: ["<url1>"] }
```

**POST** — registra a notícia, já vinculando o artigo criado a partir
dela (upsert por `url`).

```js
// web/app/api/noticias/route.js
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request) {
  const segredo = request.headers.get("x-blog-secret");
  if (!segredo || segredo !== process.env.BLOG_API_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const urls = (searchParams.get("urls") ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) return Response.json({ conhecidas: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("noticias_conselhos")
    .select("url")
    .in("url", urls);

  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ conhecidas: data.map((r) => r.url) });
}

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

  const { fonte, url, titulo, resumo_original, publicado_em_origem, usado_em_artigo_id } = body;
  if (!fonte || !url || !titulo) {
    return Response.json({ success: false, error_code: "CAMPOS_OBRIGATORIOS_AUSENTES" }, { status: 400 });
  }

  const admin = createAdminClient();
  const dados = {
    fonte,
    url,
    titulo,
    resumo_original: resumo_original ?? null,
    publicado_em_origem: publicado_em_origem ?? null,
    usado_em_artigo_id: usado_em_artigo_id ?? null,
  };

  const { data, error } = await admin
    .from("noticias_conselhos")
    .upsert(dados, { onConflict: "url" })
    .select()
    .single();

  if (error) return Response.json({ success: false, error_code: error.message }, { status: 200 });
  return Response.json({ success: true, data });
}
```

Reaproveita o mesmo segredo `BLOG_API_SECRET` — é a mesma automação
chamando as duas rotas, não precisa de um segredo novo.

**`PUBLIC_PATHS`** (`web/lib/supabase/proxy.js`) ganha `"/api/noticias"` —
mesma lição já registrada no spec de blog anterior: rota autenticada por
segredo próprio precisa estar na lista, senão o middleware bloqueia antes
dela rodar.

## Geração de imagem: Pexels

A routine busca uma foto editorial na Pexels API
(`https://api.pexels.com/v1/search?query=...`, header
`Authorization: <PEXELS_API_KEY>`) usando 2-4 palavras-chave em inglês
derivadas do tema (Pexels indexa melhor em inglês — ex.: tema sobre saúde
mental no trabalho → `"therapy session"`, `"mental health professional"`).
Critérios: orientação horizontal (capa), evitar imagem clichê de banco de
imagem (aperto de mão genérico), preferir fotos com contexto de
psicologia/terapia/atendimento. A URL da foto (`src.large`) vira
`imagem_capa_url` no POST pro blog. Nome do fotógrafo
(`photographer`/`photographer_url` da resposta) entra no rodapé do post
como crédito — a licença Pexels recomenda atribuição, e isso reforça o
hábito de citar fonte que o usuário pediu.

## Reescrita e compliance (regras embutidas no prompt da routine)

- Reescrever 100% com as próprias palavras — nunca reaproveitar frase
  literal da fonte, só os fatos.
- Tom institucional e profissional, sem sensacionalismo, sem alegação de
  resultado clínico, sem linguagem promocional exagerada — alinhado ao
  Código de Ética Profissional do Psicólogo e à Resolução CFP nº 011/2018
  (publicidade profissional em Psicologia).
- Estrutura: título, 400-700 palavras, subtítulos em markdown (`##`),
  mesmo estilo dos 3 artigos já publicados (ver
  `docs/blog-pautas/2026-08-25-agenda-sem-planilha.md` como referência de
  tom).
- Rodapé obrigatório, nessa ordem:
  1. Citação da fonte original com link (nome do conselho + URL).
  2. Crédito da foto Pexels (fotógrafo + link).
  3. Aviso: "Este texto foi produzido com apoio de Inteligência
     Artificial a partir de informações públicas divulgadas por
     [fonte]."
  4. CTA suave pro PsiAgente relacionado ao tema da notícia (mesmo
     padrão não-ostensivo dos artigos atuais — parágrafo final, não
     banner).

## Fluxo da routine (execução diária única)

1. Pesquisar (`WebSearch`/`WebFetch`) notícias recentes de CFP, CRP-SP,
   CRP-RJ, CRP-SC.
2. `GET /api/noticias?urls=...` com as URLs candidatas — descartar as já
   conhecidas.
3. Selecionar até 3 notícias novas e relevantes (variedade de fonte
   quando possível). Se achar menos de 3 notícias genuinamente novas e
   relevantes, publicar só o que houver de qualidade — não forçar
   conteúdo raso pra bater a cota.
4. Para cada notícia escolhida: reescrever (regras acima), buscar foto
   na Pexels, montar o markdown completo.
5. `POST /api/blog/artigos` com `publicado: false`.
6. `POST /api/noticias` registrando a notícia com `usado_em_artigo_id`
   do artigo recém-criado.
7. Ao final, `PushNotification` resumindo os rascunhos do dia (título +
   fonte + link pra `/admin/artigos`) pra revisão do usuário.

## Automação: reconfigurar a routine existente

`RemoteTrigger action: update` em `trig_01UaT7JzVFXo2iiEJ2APZmAf`:
- Nome: "Notícias CRP/CFP — blog diário".
- Mesmo horário: `0 9 * * *` UTC (6h BRT) — usuário não pediu mudança.
- Mesmo `allowed_tools`: `Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch`.
- Prompt novo, autocontido (sessão cloud começa sem contexto), cobrindo
  o fluxo acima com as URLs de fonte, os endpoints, e as regras de
  reescrita/compliance por extenso.
- **Env vars novas na routine** (`environment_variables` do
  `session_request`, hoje vazio): `APP_BASE_URL` (domínio principal de
  produção, não o subdomínio do blog — a API não vive em
  `blog.psiagente.com.br`), `BLOG_API_SECRET` (valor real recuperado do
  EasyPanel de produção), `PEXELS_API_KEY` (fornecida pelo usuário).

## Fora de escopo

- Publicação automática direta (`publicado: true`) — fica pra quando o
  usuário validar a qualidade dos rascunhos por um tempo.
- Geração de imagem por IA — descartada em favor do banco de imagem
  editorial (decisão do usuário).
- Outros CRPs além de SP/RJ/SC — adicionar depois é mudança de prompt,
  não de arquitetura.
- Deduplicação por similaridade de tema entre fontes diferentes (ex.:
  CFP e um CRP noticiarem o mesmo fato) — dedup é só por URL exata nesta
  v1; risco aceito, baixo volume torna colisão rara.

## Testes / verificação

1. **Migration**: aplicar em produção, confirmar tabela
   `noticias_conselhos` e policy criadas.
2. **Endpoint `/api/noticias`**: `curl` GET (com/sem URLs conhecidas) e
   POST (criar, upsert por URL repetida), segredo certo/errado.
3. **`PUBLIC_PATHS`**: confirmar que a rota responde sem redirecionar
   pra `/login`.
4. **Routine**: rodar manualmente uma vez (`RemoteTrigger action: run`),
   conferir via `get_run_log` que ela pesquisou, chamou os dois
   endpoints, e que os 3 rascunhos aparecem em `/admin/artigos` com
   `publicado = false`, imagem de capa preenchida, e o rodapé completo
   (fonte + crédito da foto + aviso de IA + CTA).
