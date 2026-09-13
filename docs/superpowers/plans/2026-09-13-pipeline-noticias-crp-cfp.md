# Pipeline diário de notícias CRP/CFP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monitorar diariamente CFP + CRP-SP/RJ/SC, manter um banco de notícias pra dedup, e publicar 3 rascunhos/dia no blog reescrevendo o conteúdo (citação da fonte + aviso de IA + CTA pro PsiAgente + foto Pexels), substituindo a routine na nuvem que hoje está inoperante.

**Architecture:** Tabela nova `noticias_conselhos` guarda o histórico de notícias encontradas. Endpoint novo `POST/GET /api/noticias` segue exatamente o padrão já em produção de `POST /api/blog/artigos` (segredo compartilhado em header, `createAdminClient()`). A routine na nuvem existente (`trig_01UaT7JzVFXo2iiEJ2APZmAf`) é reconfigurada — mesmo horário, prompt novo — pra pesquisar via `WebSearch`/`WebFetch`, checar dedup, reescrever, buscar foto na Pexels, e publicar via `curl` contra os dois endpoints.

**Tech Stack:** Next.js App Router (Route Handlers), Supabase (Postgres + RLS), Pexels API, Claude Code cloud routine (`RemoteTrigger`).

**Spec:** `docs/superpowers/specs/2026-09-13-pipeline-noticias-crp-cfp-design.md`

## Global Constraints

- Cadência: 3 posts/dia, todos a partir de notícias CRP/CFP (decisão do usuário).
- Publicação como rascunho (`publicado: false`) — sem publicação automática direta nesta fase.
- Imagem: Pexels (banco de imagem editorial), não geração por IA.
- Fontes v1: CFP, CRP-SP, CRP-RJ, CRP-SC — via `WebSearch`/`WebFetch` a cada execução, sem scraper de HTML fixo.
- Reaproveita o mesmo segredo `BLOG_API_SECRET` pras duas rotas (`/api/blog/artigos` e `/api/noticias`) — sem segredo novo.
- Sem framework de teste automatizado (convenção do projeto) — verificação por `curl`/script direto, mesmo padrão do resto do projeto.
- Migrations aplicadas direto contra produção (convenção já estabelecida, sem staging).
- **Push e deploy exigem aprovação explícita do usuário antes de executar** (política do projeto) — commits locais podem ser feitos livremente, mas o Task 3 deste plano PARA e pede confirmação antes de `git push` / acionar o deploy do EasyPanel.
- Reconfigurar a routine (`RemoteTrigger action: update`) substitui a routine "Daily blog post" existente — não cria uma nova em paralelo.

---

## Arquivos deste plano

- Criar: `supabase/migrations/20260913000001_add_noticias_conselhos.sql`.
- Criar: `web/app/api/noticias/route.js`.
- Modificar: `web/lib/supabase/proxy.js` (`PUBLIC_PATHS`).
- Modificar: `docs/status-implementacao.md`.
- Reconfigurar (via API, não é arquivo do repo): routine `trig_01UaT7JzVFXo2iiEJ2APZmAf`.

---

### Task 1: Migration — tabela `noticias_conselhos`

**Files:**
- Create: `supabase/migrations/20260913000001_add_noticias_conselhos.sql`

**Interfaces:**
- Produces: tabela `public.noticias_conselhos` (`id`, `fonte`, `url` unique, `titulo`, `resumo_original`, `publicado_em_origem`, `usado_em_artigo_id` → `artigos.id`, `descoberto_em`) + policy `noticias_conselhos_admin_all` — consumida pela Task 2.

- [ ] **Step 1: Escrever a migration**

```sql
-- Banco de notícias dos Conselhos de Psicologia (CFP/CRP) — histórico de
-- toda notícia encontrada pela routine diária, usada ou não, pra nunca
-- reescrever a mesma duas vezes. Sem policy de leitura pública: só a
-- automação (via createAdminClient, ignora RLS) e o admin acessam.
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

- [ ] **Step 2: Aplicar contra produção**

Verificar antes que `SUPABASE_DB_PASSWORD` está no ambiente (`if [ -n "$SUPABASE_DB_PASSWORD" ]; then echo presente; fi`) — se ausente, pedir ao usuário em vez de assumir. Usar a pooler URL (o host direto é IPv6-only e falha nesta rede, ver `psifacil-vps-access` memory):

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const fs = await import('fs');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260913000001_add_noticias_conselhos.sql', 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log('Migration aplicada com sucesso.');
  } catch (e) {
    await client.query('rollback');
    console.error('Falhou:', e.message);
    process.exit(1);
  }
  await client.end();
});
"
```

Expected: `Migration aplicada com sucesso.`

- [ ] **Step 3: Verificar**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const tabela = await client.query(\"select table_name from information_schema.tables where table_name = 'noticias_conselhos'\");
  console.log('tabela existe:', tabela.rows.length === 1);
  const policy = await client.query(\"select policyname from pg_policies where tablename = 'noticias_conselhos'\");
  console.log('policies:', policy.rows.map(r => r.policyname));
  await client.end();
});
"
```

Expected: `tabela existe: true`, `policies: [ 'noticias_conselhos_admin_all' ]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260913000001_add_noticias_conselhos.sql
git commit -m "$(cat <<'EOF'
feat(blog): adiciona tabela noticias_conselhos pro banco de noticias CRP/CFP

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Endpoint `/api/noticias`

**Files:**
- Create: `web/app/api/noticias/route.js`
- Modify: `web/lib/supabase/proxy.js`

**Interfaces:**
- Consumes: `createAdminClient` de `web/lib/supabase/admin.js`.
- Produces: `GET /api/noticias?urls=<url1>,<url2>` → `{conhecidas: [...]}`. `POST /api/noticias` body `{fonte, url, titulo, resumo_original?, publicado_em_origem?, usado_em_artigo_id?}` → `{success: true, data}` (upsert por `url`) — consumida pela routine reconfigurada na Task 5.

- [ ] **Step 1: Criar a rota**

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

- [ ] **Step 2: Liberar a rota em `PUBLIC_PATHS`**

Em `web/lib/supabase/proxy.js`, adicionar `"/api/noticias"` ao array `PUBLIC_PATHS`:

```js
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/completar-cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/sitemap.xml",
  "/robots.txt",
  "/termos",
  "/carne-leao-automatico",
  "/api/agent/call-tool",
  "/api/agent/onboarding",
  "/api/blog/artigos",
  "/api/noticias",
  "/api/asaas/webhook",
  "/api/assinaturas/aplicar-pendencias",
  "/api/emails/reprocessar-fila",
  "/api/relatorios/resumo-diario",
];
```

- [ ] **Step 3: Build local (checagem de sintaxe, sem `next dev`)**

```bash
cd web && npm run build
```

Expected: build conclui sem erro.

- [ ] **Step 4: Commit**

```bash
git add web/app/api/noticias/route.js web/lib/supabase/proxy.js
git commit -m "$(cat <<'EOF'
feat(blog): adiciona rota /api/noticias pro dedup do pipeline CRP/CFP

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Push e deploy (checkpoint de aprovação)

**Files:** nenhum arquivo novo — só integração.

**Interfaces:** nenhuma nova.

- [ ] **Step 1: PARAR e pedir aprovação explícita do usuário pra `git push`**

Política do projeto: nunca fazer push sem pedido explícito. Mostrar o
`git log --oneline origin/main..HEAD` e perguntar em texto livre antes de
prosseguir — não assumir que "pode fazer" dito na fase de design
autoriza o push.

- [ ] **Step 2: Push (só depois do "sim" explícito)**

```bash
git push origin main
```

- [ ] **Step 3: Disparar o deploy via EasyPanel API**

Esse projeto não faz auto-deploy no push (confirmado, ver
`easypanel-traefik-routing`/`psifacil-vps-access` memory) — precisa
acionar manualmente. Requer um token fresco de `Settings → API` no
dashboard do EasyPanel (o token não é persistido entre sessões — pedir
ao usuário se não estiver disponível nesta conversa):

```bash
curl -s -X POST "http://179.198.103.130:3000/api/trpc/services.app.deployService" \
  -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"psifacil","serviceName":"psifacil"}}'
```

Expected: resposta `{}` (sucesso). Confirmar com `docker service inspect` (via SSH) que `UpdatedAt` avançou, ou aguardar ~1-2 min e testar o endpoint novo (Task 4).

---

### Task 4: Verificar `/api/noticias` e `BLOG_API_SECRET` em produção

**Files:** nenhum.

**Interfaces:**
- Consumes: `BLOG_API_SECRET` já configurado em produção (recuperar valor real via EasyPanel API `projects.inspectProject`, não gerar um novo — a rota `/api/blog/artigos` já usa esse mesmo segredo, gerar um novo quebraria a rota existente).

- [ ] **Step 1: Recuperar o valor real de `BLOG_API_SECRET`**

```bash
curl -s "http://179.198.103.130:3000/api/trpc/projects.inspectProject?input=%7B%22json%22%3A%7B%22projectName%22%3A%22psifacil%22%7D%7D" \
  -H "Authorization: Bearer $EASYPANEL_TOKEN" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j = JSON.parse(d);
  const app = j.result.data.json.services.find(s => s.name === 'psifacil' || s.serviceName === 'psifacil');
  console.log(JSON.stringify(app?.env ?? app, null, 2));
});
"
```

Extrair `BLOG_API_SECRET` da saída (tratar como sensível — não logar em lugar persistente, só usar em memória pro resto desta task e pra Task 5).

- [ ] **Step 2: Testar a rota nova contra produção**

```bash
BLOG_SECRET="<valor extraído no Step 1>"
curl -s -X POST "https://psiagente.com.br/api/noticias" \
  -H "Content-Type: application/json" \
  -H "x-blog-secret: $BLOG_SECRET" \
  -d '{"fonte":"CFP","url":"https://exemplo.org/teste-apagar","titulo":"Notícia de teste (apagar)"}'
```

Expected: `{"success":true,"data":{...}}`.

```bash
curl -s "https://psiagente.com.br/api/noticias?urls=https://exemplo.org/teste-apagar" \
  -H "x-blog-secret: $BLOG_SECRET"
```

Expected: `{"conhecidas":["https://exemplo.org/teste-apagar"]}`.

```bash
curl -s -X POST "https://psiagente.com.br/api/noticias" -H "Content-Type: application/json" -d '{"fonte":"CFP","url":"x","titulo":"x"}'
```

Expected: `401` (sem segredo).

- [ ] **Step 3: Apagar a linha de teste**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(\"delete from noticias_conselhos where url = 'https://exemplo.org/teste-apagar'\");
  console.log('Linha de teste apagada.');
  await client.end();
});
"
```

---

### Task 5: Reconfigurar a routine na nuvem

**Files:** nenhum arquivo do repo — chamada de API (`RemoteTrigger`).

**Interfaces:**
- Consumes: `BLOG_API_SECRET` (Task 4), `PEXELS_API_KEY` (fornecida pelo usuário), endpoints `/api/blog/artigos` e `/api/noticias` (Tasks 2-4).

- [ ] **Step 1: Confirmar que o usuário já forneceu a `PEXELS_API_KEY`**

Se ainda não foi fornecida na conversa, pedir antes de prosseguir (conta
grátis em pexels.com/api, aprovação instantânea).

- [ ] **Step 2: Montar o prompt da routine**

Prompt autocontido (a sessão cloud começa sem contexto nenhum):

```
Você é a rotina diária de conteúdo do blog do PsiAgente
(https://psiagente.com.br), um SaaS de gestão de consultório pra
psicólogos. Sua tarefa: monitorar notícias dos Conselhos de Psicologia e
publicar até 3 rascunhos de post por dia.

FONTES (pesquisar via WebSearch/WebFetch a cada execução, sem depender de
estrutura fixa de HTML — os sites podem mudar):
- Conselho Federal de Psicologia (CFP) — site.cfp.org.br
- CRP-SP (Conselho Regional de Psicologia de São Paulo)
- CRP-RJ (Conselho Regional de Psicologia do Rio de Janeiro)
- CRP-SC (Conselho Regional de Psicologia de Santa Catarina)

PASSO A PASSO:
1. Pesquise notícias/comunicados recentes (últimos dias) de cada fonte.
2. Antes de escrever qualquer coisa, confira quais URLs já foram usadas:
   GET https://psiagente.com.br/api/noticias?urls=<url1>,<url2>,...
   Header: x-blog-secret: $BLOG_API_SECRET
   Descarte qualquer URL que aparecer em "conhecidas".
3. Escolha até 3 notícias novas e genuinamente relevantes pra um
   psicólogo clínico/consultório autônomo (variedade de fonte quando der).
   Se achar menos de 3 notícias boas, publique só o que houver de
   qualidade — não force conteúdo raso pra bater 3.
4. Para cada notícia escolhida, escreva um post de 400-700 palavras:
   - Reescreva 100% com suas próprias palavras — nunca copie frase da
     fonte, só os fatos.
   - Tom institucional e profissional, sem sensacionalismo, sem
     alegação de resultado clínico, sem linguagem promocional exagerada
     — alinhado ao Código de Ética Profissional do Psicólogo e à
     Resolução CFP nº 011/2018 (publicidade profissional em Psicologia).
   - Estrutura em markdown com subtítulos (##).
   - Rodapé obrigatório, nesta ordem:
     a) Citação da fonte original com link (nome do conselho + URL).
     b) Crédito da foto (fotógrafo + link, ver passo 5).
     c) Aviso: "Este texto foi produzido com apoio de Inteligência
        Artificial a partir de informações públicas divulgadas por
        [fonte]."
     d) Um parágrafo de CTA suave conectando o tema da notícia a algum
        recurso do PsiAgente (agenda, financeiro, prontuário, NFS-e,
        WhatsApp) — nunca um banner, um parágrafo natural de fechamento,
        no mesmo tom dos artigos já publicados no blog.
5. Busque 1 foto no Pexels pro tema:
   GET https://api.pexels.com/v1/search?query=<2-4 palavras em inglês>&orientation=landscape&per_page=5
   Header: Authorization: $PEXELS_API_KEY
   Escolha uma foto com contexto de psicologia/terapia/atendimento,
   evite clichê genérico de banco de imagem. Pegue `src.large` (URL da
   imagem) e `photographer`/`photographer_url` (pro crédito no rodapé).
6. Publique o rascunho:
   POST https://psiagente.com.br/api/blog/artigos
   Header: x-blog-secret: $BLOG_API_SECRET, Content-Type: application/json
   Body: {"titulo": "...", "slug": "...", "resumo": "...", "conteudo": "...markdown completo com rodapé...", "autor": "Equipe PsiAgente", "publicado": false, "imagem_capa_url": "<url da foto Pexels>"}
7. Registre a notícia como usada (pegue o "id" retornado no passo 6 como usado_em_artigo_id):
   POST https://psiagente.com.br/api/noticias
   Header: x-blog-secret: $BLOG_API_SECRET, Content-Type: application/json
   Body: {"fonte": "CFP|CRP-SP|CRP-RJ|CRP-SC", "url": "<url da notícia original>", "titulo": "<título original>", "resumo_original": "<1-2 frases do original>", "usado_em_artigo_id": "<id do passo 6>"}
8. Repita 4-7 pra cada notícia escolhida (até 3).
9. Ao final, envie uma notificação (PushNotification) resumindo os
   rascunhos criados hoje: título de cada um, fonte, e um lembrete de
   que estão como rascunho em /admin/artigos aguardando aprovação.
   Se não publicou nenhum (sem notícia nova relevante), diga isso
   explicitamente na notificação.

Nunca publique com publicado:true — sempre rascunho (publicado:false)
nesta fase.
```

- [ ] **Step 3: Atualizar a routine via `RemoteTrigger`**

```
RemoteTrigger({
  action: "update",
  trigger_id: "trig_01UaT7JzVFXo2iiEJ2APZmAf",
  body: {
    name: "Notícias CRP/CFP — blog diário",
    job_config: {
      ccr: {
        environment_id: "env_01W2zKSApajxuCLkhhAhBxmT",
        session_context: {
          model: "claude-sonnet-5",
          allowed_tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"]
        },
        events: [{ data: {
          uuid: "<uuid v4 novo>",
          session_id: "",
          type: "user",
          parent_tool_use_id: null,
          message: { role: "user", content: "<prompt do Step 2>" }
        }}],
        environment_variables: {
          BLOG_API_SECRET: "<valor extraído na Task 4>",
          PEXELS_API_KEY: "<fornecida pelo usuário>"
        }
      }
    }
  }
})
```

Nota: o formato exato de onde `environment_variables` entra no
`job_config.ccr` não está 100% documentado — se a chamada falhar
reclamando do campo, inspecionar a resposta de
`RemoteTrigger({action:"get", trigger_id:"trig_01UaT7JzVFXo2iiEJ2APZmAf"})`
feita ANTES desta mudança (que já mostra `session_request.environment_variables`
como um objeto no mesmo nível de `config`/`events`) e ajustar o payload
pra bater com esse formato.

- [ ] **Step 4: Confirmar a atualização**

```
RemoteTrigger({action: "get", trigger_id: "trig_01UaT7JzVFXo2iiEJ2APZmAf"})
```

Expected: `name` atualizado, `cron_expression` inalterado (`0 9 * * *`), prompt novo refletido em `derived_state.prompt`.

---

### Task 6: Rodar a routine uma vez e verificar o resultado

**Files:** nenhum.

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Disparar a execução manual**

```
RemoteTrigger({action: "run", trigger_id: "trig_01UaT7JzVFXo2iiEJ2APZmAf"})
```

- [ ] **Step 2: Acompanhar a execução**

```
RemoteTrigger({action: "list_runs", trigger_id: "trig_01UaT7JzVFXo2iiEJ2APZmAf"})
```

Pegar o `session_id` do run mais recente, depois:

```
RemoteTrigger({action: "get_run_log", session_id: "<session_id>"})
```

Verificar no log: pesquisou as 4 fontes, chamou `GET /api/noticias` antes de escrever, chamou `POST /api/blog/artigos` e `POST /api/noticias` pra cada rascunho, chamou a Pexels API, e terminou com `PushNotification`. Se travar em algum ponto (ex.: erro 401, campo obrigatório faltando), o log mostra o `tool_result` de erro — corrigir a rota ou o prompt conforme o erro real, não especular.

- [ ] **Step 3: Confirmar os rascunhos no banco**

```bash
DATABASE_URL="postgresql://postgres.rohulajgyxdangxfurha:${SUPABASE_DB_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(\"select titulo, slug, publicado, imagem_capa is not null as tem_capa, criado_em from artigos order by criado_em desc limit 5\");
  console.log(r.rows);
  const n = await client.query(\"select fonte, titulo, usado_em_artigo_id is not null as usado from noticias_conselhos order by descoberto_em desc limit 5\");
  console.log(n.rows);
  await client.end();
});
"
```

Expected: até 3 artigos novos com `publicado: false` e `tem_capa: true`, e as notícias correspondentes em `noticias_conselhos` com `usado: true`. Conferir manualmente em `/admin/artigos` que o conteúdo tem tom profissional, cita a fonte, tem o aviso de IA e o CTA — se algo estiver fora do esperado, ajustar o prompt da routine (Task 5) e rodar de novo.

---

### Task 7: Documentação

**Files:**
- Modify: `docs/status-implementacao.md`

**Interfaces:** nenhuma.

- [ ] **Step 1: Documentar o pipeline**

Adicionar uma seção descrevendo: tabela `noticias_conselhos`, rota
`/api/noticias` (reaproveita `BLOG_API_SECRET`), a routine
`trig_01UaT7JzVFXo2iiEJ2APZmAf` reconfigurada (nome novo, mesmo horário,
env vars `BLOG_API_SECRET`/`PEXELS_API_KEY`), e o estado atual
(publicação em rascunho, aguardando validação antes de auto-publicar).

- [ ] **Step 2: Commit**

```bash
git add docs/status-implementacao.md
git commit -m "$(cat <<'EOF'
docs: documenta o pipeline diario de noticias CRP/CFP

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Cobertura da spec:** fontes/escopo (prompt da Task 5), banco de
notícias (Task 1), endpoint de dedup (Task 2), Pexels (prompt da Task
5), reescrita/compliance (prompt da Task 5), publicação em rascunho
(prompt da Task 5 + `Global Constraints`), automação substituindo a
routine antiga (Task 5), verificação end-to-end (Task 6) — todas as
seções da spec têm task ou trecho de prompt correspondente.

**Placeholders:** os únicos valores não-literais são credenciais
(`BLOG_API_SECRET`, `PEXELS_API_KEY`, `EASYPANEL_TOKEN`) e o `uuid` do
evento da routine — inerentes a segredo/valor gerado em runtime, não
"TBD" de design deixado em aberto.

**Consistência:** `x-blog-secret`/`BLOG_API_SECRET` usado
identicamente nas Tasks 2, 4 e 5. Nome de coluna `usado_em_artigo_id`
consistente entre a migration (Task 1), a rota (Task 2) e o prompt da
routine (Task 5). `trigger_id` da routine (`trig_01UaT7JzVFXo2iiEJ2APZmAf`)
o mesmo em todas as referências (Tasks 5 e 6).
