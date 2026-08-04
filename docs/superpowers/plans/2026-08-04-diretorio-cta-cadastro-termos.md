# Diretório — CTA de Cadastro, Termos de Uso e Divulgação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a `busca.psifacil.com.br` um convite de cadastro pra profissionais,
com Termos de Uso obrigatórios e uma barreira mínima de qualidade antes de
publicar o perfil, mais duas ferramentas de divulgação (compartilhar link,
Open Graph).

**Architecture:** Extensão do diretório público já implementado
(`docs/superpowers/specs/2026-08-03-diretorio-publico-psicologos-design.md`).
Uma coluna nova em `PerfilPublico`, uma página estática nova (`/termos`),
ajustes pontuais no formulário/Server Action já existentes de `/diretorio`,
e um parâmetro de origem no fluxo de autocadastro já existente
(`/cadastro`). Nenhuma tabela nova, nenhuma dependência nova.

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions),
Supabase (Postgres + RLS), Tailwind v4.

## Global Constraints

- Este projeto **não tem suíte de testes automatizados** — verificação é
  `npm run build`, consulta SQL direta via `node -e` com `pg`, `curl -H
  "Host: <subdominio>.localhost:3000"` e teste manual no navegador via
  chrome-devtools MCP. Não introduzir framework de testes como efeito
  colateral desta feature.
- Seguir exatamente os padrões já estabelecidos: Server Actions com `"use
  server"` + `(prevState, formData)` + `useActionState` no client; data
  layer em `web/lib/data/*.js` sempre com `createClient()` de
  `@/lib/supabase/server`; classes CSS existentes (`.field`, `.btn-primary`,
  `.btn-outline`, `.card`, `.empty-state`, `.page-title`, `.link`,
  `text-navy`, `text-muted`) — não criar classes globais novas.
- Migration aplicada via o mesmo script inline `node -e` com `pg` já usado
  nas migrations anteriores (ver Task 1) — não existe Supabase CLI
  funcional neste ambiente.
- Links pra fora do host atual em `busca.` precisam ser absolutos
  (`https://psifacil.com.br/...`) — qualquer link relativo em
  `busca.psifacil.com.br` é reescrito por `web/proxy.js` pra dentro de
  `/busca/...` e quebra. Mesmo padrão já usado em `web/app/comece/page.js`
  (`CADASTRO_URL`).
- Commits em português, um por task, seguindo o estilo do `git log`.
- Antes de `git push`: pedir confirmação do usuário (histórico de
  incidentes de produção neste projeto — porta errada, variável de
  ambiente com nome errado, certificado SSL).

---

### Task 1: Migration — coluna `termos_aceitos_em`

**Files:**
- Create: `supabase/migrations/20260804000002_add_diretorio_termos_aceitos.sql`

**Interfaces:**
- Produces: coluna `public."PerfilPublico".termos_aceitos_em` (timestamptz,
  nullable). Tasks 2 e 4 dependem dela.

- [ ] **Step 1: Escrever a migration**

```sql
-- Aceite dos Termos de Uso do diretório público (extensão do item 2 do
-- backlog — CTA de cadastro + termos). Sem versionamento: se o texto
-- mudar de forma relevante no futuro, o reforço de consentimento é por
-- e-mail, não reabrindo esta coluna.
alter table public."PerfilPublico"
  add column termos_aceitos_em timestamptz;
```

- [ ] **Step 2: Aplicar a migration no banco real**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const fs = require("fs");
const { Client } = require("pg");
(async () => {
  const sql = fs.readFileSync("supabase/migrations/20260804000002_add_diretorio_termos_aceitos.sql", "utf8");
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("Migration aplicada com sucesso.");
  } catch (err) {
    await client.query("rollback");
    console.error("ERRO:", err.message);
    process.exitCode = 1;
  }
  await client.end();
})();
'
```

Expected: `Migration aplicada com sucesso.`

- [ ] **Step 3: Verificar que a coluna existe**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select column_name, data_type from information_schema.columns where table_name = $1 and column_name = $2`, ["PerfilPublico", "termos_aceitos_em"]);
  console.log(JSON.stringify(rows));
  await client.end();
})();
'
```

Expected: uma linha com `data_type: "timestamp with time zone"`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260804000002_add_diretorio_termos_aceitos.sql
git commit -m "Migration: coluna termos_aceitos_em em PerfilPublico"
```

---

### Task 2: Data layer — expor `termos_aceitos_em` em `buscarMeuPerfil`

**Files:**
- Modify: `web/lib/data/diretorio.js:153-161`

**Interfaces:**
- Consumes: coluna `termos_aceitos_em` (Task 1).
- Produces: `buscarMeuPerfil()` agora retorna também `termos_aceitos_em`
  (string ISO ou `null`). Consumido pela Task 5 (formulário).

- [ ] **Step 1: Adicionar a coluna ao `select` de `buscarMeuPerfil`**

Trocar (linhas 153-161 do arquivo atual):

```js
  const { data, error } = await supabase
    .from("PerfilPublico")
    .select(
      `id, slug, bio, cidade, estado, modalidade, valor_sessao, foto_url,
       visivel_diretorio,
       PerfilEspecialidade(especialidade_id)`
    )
    .eq("usuario_id", usuario.id)
    .maybeSingle();
```

por:

```js
  const { data, error } = await supabase
    .from("PerfilPublico")
    .select(
      `id, slug, bio, cidade, estado, modalidade, valor_sessao, foto_url,
       visivel_diretorio, termos_aceitos_em,
       PerfilEspecialidade(especialidade_id)`
    )
    .eq("usuario_id", usuario.id)
    .maybeSingle();
```

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/data/diretorio.js
git commit -m "Data layer: buscarMeuPerfil expõe termos_aceitos_em"
```

---

### Task 3: Página `/termos` (pública)

**Files:**
- Create: `web/app/termos/page.js`
- Modify: `web/lib/supabase/proxy.js:7-15`

**Interfaces:**
- Produces: rota `/termos`, acessível sem login. Linkada pela Task 5.

- [ ] **Step 1: Criar `web/app/termos/page.js`**

```js
export const metadata = {
  title: "Termos de Uso do Diretório | PsiFácil",
  description: "Termos de uso do diretório público de psicólogos do PsiFácil.",
};

export default function PaginaTermos() {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <a href="/">
          <img src="/logo.svg" alt="PsiFácil" className="h-8 w-auto mb-8" />
        </a>

        <div className="card p-8 space-y-4">
          <h1 className="page-title">Termos de Uso do Diretório PsiFácil</h1>
          <p className="text-navy">
            Ao ativar seu perfil no diretório público
            (busca.psifacil.com.br), você concorda com o seguinte:
          </p>
          <ol className="list-decimal list-inside space-y-3 text-navy">
            <li>
              O serviço é gratuito por enquanto. Podemos no futuro passar a
              cobrar pela manutenção do diretório, com aviso prévio
              razoável.
            </li>
            <li>
              Estes termos podem ser alterados a qualquer momento — a
              versão vigente é sempre a publicada nesta página.
            </li>
            <li>
              Você é responsável pela veracidade das informações do seu
              perfil (nome, CRP, especialidades, valores, contato).
            </li>
            <li>
              O contato entre paciente e profissional acontece diretamente
              pelo WhatsApp informado — o PsiFácil não intermedeia nem se
              responsabiliza pelo atendimento, agendamento ou cobrança
              feitos fora da plataforma.
            </li>
            <li>
              Podemos remover ou ocultar perfis com informação falsa,
              ofensiva ou que violem estes termos.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Liberar `/termos` em `PUBLIC_PATHS`**

Em `web/lib/supabase/proxy.js`, trocar:

```js
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/sitemap.xml",
  "/robots.txt",
];
```

por:

```js
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/sitemap.xml",
  "/robots.txt",
  "/termos",
];
```

- [ ] **Step 3: Validar com build e testar sem login**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro, rota `/termos` listada.

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

Em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/termos --max-time 15
```

Expected: `200` (não `307`/`302` pro `/login` — confirma que `/termos` está
liberado em `PUBLIC_PATHS` mesmo sem sessão).

Encerrar o servidor:

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 4: Commit**

```bash
git add "web/app/termos/page.js" web/lib/supabase/proxy.js
git commit -m "Página pública /termos + libera em PUBLIC_PATHS"
```

---

### Task 4: Server Action `salvarPerfil` — barreira de publicação

**Files:**
- Modify: `web/lib/actions/diretorio.js`

**Interfaces:**
- Consumes: coluna `termos_aceitos_em` (Task 1); campo de formulário novo
  `termos_aceite` (produzido pela Task 5, mas a Action precisa existir
  antes pro form da Task 5 funcionar de ponta a ponta).
- Produces: `salvarPerfil` agora rejeita `visivel_diretorio = true` sem
  bio + foto + especialidade + termos, e grava `termos_aceitos_em`.

- [ ] **Step 1: Reescrever `web/lib/actions/diretorio.js`**

Substituir o arquivo inteiro por:

```js
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarSlug } from "@/lib/slugify";

async function gerarSlugUnico(supabase, base) {
  const raiz = normalizarSlug(base) || "profissional";
  let slug = raiz;
  let sufixo = 1;

  while (true) {
    const { data } = await supabase
      .from("PerfilPublico")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return slug;
    sufixo += 1;
    slug = `${raiz}-${sufixo}`;
  }
}

export async function salvarPerfil(prevState, formData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Não autorizado." };
  }

  const { data: usuario, error: erroUsuario } = await supabase
    .from("Usuarios")
    .select("id, nome")
    .eq("id_user", user.id)
    .single();

  if (erroUsuario) {
    return { error: "Não foi possível carregar seu cadastro." };
  }

  const bio = formData.get("bio");
  const cidade = formData.get("cidade");
  const estado = formData.get("estado");
  const modalidade = formData.get("modalidade");
  const valorSessaoRaw = formData.get("valor_sessao");
  const visivel = formData.get("visivel_diretorio") === "on";
  const especialidadeIds = formData.getAll("especialidades");
  const foto = formData.get("foto");
  const termosAceite = formData.get("termos_aceite") === "on";

  const { data: perfilExistente } = await supabase
    .from("PerfilPublico")
    .select("id, slug, foto_url, termos_aceitos_em")
    .eq("usuario_id", usuario.id)
    .maybeSingle();

  if (visivel) {
    const temFoto = (foto && foto.size > 0) || Boolean(perfilExistente?.foto_url);
    const temTermos = termosAceite || Boolean(perfilExistente?.termos_aceitos_em);
    const faltando = [];
    if (!bio) faltando.push("bio");
    if (!temFoto) faltando.push("foto");
    if (especialidadeIds.length === 0) faltando.push("ao menos uma especialidade");
    if (!temTermos) faltando.push("aceite dos Termos de Uso");

    if (faltando.length > 0) {
      return {
        error: `Pra aparecer no diretório, preencha: ${faltando.join(", ")}.`,
      };
    }
  }

  let fotoUrl = perfilExistente?.foto_url ?? null;

  if (foto && foto.size > 0) {
    const caminho = `${user.id}/foto`;
    const { error: erroUpload } = await supabase.storage
      .from("perfis-publicos")
      .upload(caminho, foto, { upsert: true, contentType: foto.type });

    if (erroUpload) {
      return { error: "Não foi possível enviar a foto." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("perfis-publicos").getPublicUrl(caminho);
    fotoUrl = `${publicUrl}?v=${Date.now()}`;
  }

  const dadosPerfil = {
    usuario_id: usuario.id,
    bio: bio || null,
    cidade: cidade || null,
    estado: estado || null,
    modalidade: modalidade || "ambos",
    valor_sessao: valorSessaoRaw ? Number(valorSessaoRaw) : null,
    foto_url: fotoUrl,
    visivel_diretorio: visivel,
    termos_aceitos_em: termosAceite
      ? perfilExistente?.termos_aceitos_em ?? new Date().toISOString()
      : perfilExistente?.termos_aceitos_em ?? null,
    atualizado_em: new Date().toISOString(),
  };

  let perfilId = perfilExistente?.id;

  if (perfilExistente) {
    const { error } = await supabase
      .from("PerfilPublico")
      .update(dadosPerfil)
      .eq("id", perfilExistente.id);

    if (error) {
      return { error: "Não foi possível salvar o perfil." };
    }
  } else {
    const slug = await gerarSlugUnico(supabase, usuario.nome);
    const { data: novoPerfil, error } = await supabase
      .from("PerfilPublico")
      .insert({ ...dadosPerfil, slug })
      .select("id")
      .single();

    if (error) {
      return { error: "Não foi possível criar o perfil." };
    }
    perfilId = novoPerfil.id;
  }

  const { error: erroLimpaEspecialidades } = await supabase
    .from("PerfilEspecialidade")
    .delete()
    .eq("perfil_id", perfilId);

  if (erroLimpaEspecialidades) {
    return { error: "Perfil salvo, mas não foi possível atualizar as especialidades." };
  }

  if (especialidadeIds.length > 0) {
    const linhas = especialidadeIds.map((especialidadeId) => ({
      perfil_id: perfilId,
      especialidade_id: especialidadeId,
    }));
    const { error: erroEspecialidades } = await supabase
      .from("PerfilEspecialidade")
      .insert(linhas);

    if (erroEspecialidades) {
      return { error: "Perfil salvo, mas não foi possível atualizar as especialidades." };
    }
  }

  revalidatePath("/diretorio");
  return { mensagem: "Perfil salvo." };
}
```

**Nota:** a validação roda **antes** de qualquer upload ou escrita no
banco — se faltar algo, nada é persistido, e o usuário pode corrigir e
reenviar sem efeito colateral.

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add web/lib/actions/diretorio.js
git commit -m "salvarPerfil: exige bio/foto/especialidade/termos pra publicar no diretório"
```

---

### Task 5: Formulário `/diretorio` — foto obrigatória + checkbox de termos

**Files:**
- Modify: `web/components/PerfilDiretorioForm.js`

**Interfaces:**
- Consumes: `perfil.termos_aceitos_em` (Task 2); rota `/termos` (Task 3);
  campo `termos_aceite` esperado por `salvarPerfil` (Task 4).

- [ ] **Step 1: Atualizar o label do campo de foto**

Trocar:

```js
        <label htmlFor="foto" className="block text-sm font-semibold text-navy">
          Foto de perfil
        </label>
```

por:

```js
        <label htmlFor="foto" className="block text-sm font-semibold text-navy">
          Foto de perfil{" "}
          <span className="font-normal text-muted">
            (obrigatória para aparecer no diretório)
          </span>
        </label>
```

- [ ] **Step 2: Adicionar o bloco de termos logo depois do checkbox "Aparecer no diretório público"**

Trocar:

```js
      <div className="flex items-center gap-2">
        <input
          id="visivel_diretorio"
          name="visivel_diretorio"
          type="checkbox"
          defaultChecked={perfil?.visivel_diretorio}
          className="h-4 w-4"
        />
        <label htmlFor="visivel_diretorio" className="text-sm font-semibold text-navy">
          Aparecer no diretório público
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
```

por:

```js
      <div className="flex items-center gap-2">
        <input
          id="visivel_diretorio"
          name="visivel_diretorio"
          type="checkbox"
          defaultChecked={perfil?.visivel_diretorio}
          className="h-4 w-4"
        />
        <label htmlFor="visivel_diretorio" className="text-sm font-semibold text-navy">
          Aparecer no diretório público
        </label>
      </div>

      {perfil?.termos_aceitos_em ? (
        <p className="text-sm text-muted">
          Termos de Uso aceitos em{" "}
          {new Date(perfil.termos_aceitos_em).toLocaleDateString("pt-BR")}.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <input id="termos_aceite" name="termos_aceite" type="checkbox" className="h-4 w-4" />
          <label htmlFor="termos_aceite" className="text-sm text-navy">
            Li e concordo com os{" "}
            <a
              href="/termos"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Termos de Uso
            </a>
          </label>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
```

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 4: Commit**

```bash
git add web/components/PerfilDiretorioForm.js
git commit -m "Form /diretorio: foto obrigatória e checkbox de Termos de Uso"
```

---

### Task 6: Botão "Compartilhar meu perfil"

**Files:**
- Create: `web/components/BotaoCompartilharPerfil.js`
- Modify: `web/app/(app)/diretorio/page.js`

**Interfaces:**
- Consumes: `perfil.slug` (já produzido por `buscarMeuPerfil`);
  `process.env.NEXT_PUBLIC_BUSCA_URL` (já configurada em `web/.env.local`
  e no Dockerfile de produção).

- [ ] **Step 1: Criar `web/components/BotaoCompartilharPerfil.js`**

```js
"use client";

import { useState } from "react";

export default function BotaoCompartilharPerfil({ url }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button type="button" onClick={copiar} className="btn-outline">
      {copiado ? "Link copiado!" : "Compartilhar meu perfil"}
    </button>
  );
}
```

- [ ] **Step 2: Integrar em `web/app/(app)/diretorio/page.js`**

Substituir o arquivo inteiro por:

```js
import PerfilDiretorioForm from "@/components/PerfilDiretorioForm";
import BotaoCompartilharPerfil from "@/components/BotaoCompartilharPerfil";
import { salvarPerfil } from "@/lib/actions/diretorio";
import { buscarMeuPerfil, listarEspecialidades, contarMeusContatos } from "@/lib/data/diretorio";

export default async function PaginaDiretorio() {
  const [perfil, especialidades, totalContatos] = await Promise.all([
    buscarMeuPerfil(),
    listarEspecialidades(),
    contarMeusContatos(),
  ]);

  const buscaUrl = process.env.NEXT_PUBLIC_BUSCA_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Meu Perfil no Diretório</h1>
        <p className="text-sm text-muted">{totalContatos} contato(s) recebido(s)</p>
      </div>
      {perfil?.slug && <BotaoCompartilharPerfil url={`${buscaUrl}/${perfil.slug}`} />}
      <PerfilDiretorioForm action={salvarPerfil} perfil={perfil} especialidades={especialidades} />
    </div>
  );
}
```

- [ ] **Step 3: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 4: Commit**

```bash
git add web/components/BotaoCompartilharPerfil.js "web/app/(app)/diretorio/page.js"
git commit -m "Botão de compartilhar link do perfil em /diretorio"
```

---

### Task 7: CTA "Cadastre-se grátis" em `/busca`

**Files:**
- Modify: `web/app/busca/page.js`

**Interfaces:**
- Produces: banner sempre visível no topo de `/busca`, link absoluto pro
  autocadastro com `?origem=busca` (consumido pela Task 8).

- [ ] **Step 1: Adicionar a constante e o banner**

Trocar as duas primeiras linhas do arquivo:

```js
import Link from "next/link";
import { buscarPerfisPublicos, listarEspecialidades } from "@/lib/data/diretorio";
```

por:

```js
import Link from "next/link";
import { buscarPerfisPublicos, listarEspecialidades } from "@/lib/data/diretorio";

const CADASTRO_URL = "https://psifacil.com.br/cadastro?origem=busca";
```

E trocar:

```js
    <div className="space-y-6">
      <h1 className="page-title">Encontre um psicólogo</h1>

      <form className="card p-4 flex flex-wrap gap-3 items-end">
```

por:

```js
    <div className="space-y-6">
      <h1 className="page-title">Encontre um psicólogo</h1>

      <div className="card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">É psicólogo? Apareça aqui gratuitamente.</p>
          <p className="text-sm text-muted">
            Cadastre seu perfil e comece a ser encontrado por pacientes.
          </p>
        </div>
        <Link href={CADASTRO_URL} className="btn-primary whitespace-nowrap">
          Cadastre-se grátis
        </Link>
      </div>

      <form className="card p-4 flex flex-wrap gap-3 items-end">
```

**Nota:** o banner fica antes do formulário de filtro e não depende de
`perfis.length` — aparece igual com resultado vazio ou cheio, o que já
resolve o caso de "site parece vazio" sem lógica condicional extra.

- [ ] **Step 2: Validar localmente**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

```bash
curl -s -H "Host: busca.localhost:3000" http://localhost:3000/ --max-time 15 | grep -o "Cadastre-se grátis\|cadastro?origem=busca"
```

Expected: as duas ocorrências aparecem no HTML.

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 3: Commit**

```bash
git add "web/app/busca/page.js"
git commit -m "CTA de cadastro pra profissionais no topo de /busca"
```

---

### Task 8: Fluxo pós-cadastro — `/cadastro?origem=busca` cai em `/diretorio`

**Files:**
- Create: `web/components/CadastroForm.js`
- Modify: `web/app/(auth)/cadastro/page.js`
- Modify: `web/lib/actions/auth.js:46-82`

**Interfaces:**
- Consumes: `cadastrar` de `@/lib/actions/auth` (assinatura inalterada:
  `(prevState, formData)`).
- Produces: `cadastrar()` agora lê `formData.get("origem")` e redireciona
  condicionalmente.

- [ ] **Step 1: Extrair o formulário pra `web/components/CadastroForm.js`**

```js
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { cadastrar } from "@/lib/actions/auth";

const estadoInicial = {};

export default function CadastroForm({ origem }) {
  const [state, formAction, pending] = useActionState(cadastrar, estadoInicial);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="PsiFácil" className="h-10 w-auto mb-6" />
      <form action={formAction} className="w-full max-w-sm card p-8 space-y-4">
        <h1 className="page-title">Criar Conta</h1>

        {origem && <input type="hidden" name="origem" value={origem} />}

        <div>
          <label htmlFor="nome" className="block text-sm font-semibold text-navy">
            Nome
          </label>
          <input id="nome" name="nome" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-navy">
            E-mail
          </label>
          <input id="email" name="email" type="email" required className="field" />
        </div>

        <div>
          <label htmlFor="senha" className="block text-sm font-semibold text-navy">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            minLength={6}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="contato" className="block text-sm font-semibold text-navy">
            Telefone
          </label>
          <input id="contato" name="contato" type="text" required className="field" />
        </div>

        <div>
          <label htmlFor="crp" className="block text-sm font-semibold text-navy">
            CRP (opcional)
          </label>
          <input id="crp" name="crp" type="text" className="field" />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full disabled:opacity-50"
        >
          {pending ? "Criando conta..." : "Criar conta grátis"}
        </button>

        <Link href="/login" className="block text-sm link text-center">
          Já tem conta? Entrar
        </Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `web/app/(auth)/cadastro/page.js` como Server Component**

```js
import CadastroForm from "@/components/CadastroForm";

export default async function PaginaCadastro({ searchParams }) {
  const params = await searchParams;
  const origem = params.origem === "busca" ? "busca" : null;

  return <CadastroForm origem={origem} />;
}
```

- [ ] **Step 3: Ajustar `cadastrar()` em `web/lib/actions/auth.js`**

Trocar:

```js
export async function cadastrar(prevState, formData) {
  const nome = formData.get("nome");
  const email = formData.get("email");
  const senha = formData.get("senha");
  const contato = formData.get("contato");
  const crp = formData.get("crp");
```

por:

```js
export async function cadastrar(prevState, formData) {
  const nome = formData.get("nome");
  const email = formData.get("email");
  const senha = formData.get("senha");
  const contato = formData.get("contato");
  const crp = formData.get("crp");
  const origem = formData.get("origem");
```

E trocar a última linha da função:

```js
  redirect("/");
}
```

por:

```js
  redirect(origem === "busca" ? "/diretorio" : "/");
}
```

(é a última linha de `cadastrar`, não confundir com o `redirect("/")` de
`atualizarSenha`, que fica mais abaixo no mesmo arquivo e não muda.)

- [ ] **Step 4: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -30
```

Expected: build sem erro, rota `/cadastro` continua listada.

- [ ] **Step 5: Testar o fluxo completo no navegador (chrome-devtools MCP)**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

Navegar até `http://localhost:3000/cadastro?origem=busca`, preencher o
formulário com um e-mail de teste novo, submeter, confirmar que a página
final é `http://localhost:3000/diretorio` (não `/`). Depois apagar o
usuário de teste criado:

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia" && node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.rohulajgyxdangxfurha.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select id, id_user from "Usuarios" where email = $1`, ["<EMAIL_DE_TESTE_USADO>"]);
  if (rows.length) {
    await client.query(`delete from "Usuarios" where id = $1`, [rows[0].id]);
    await client.query(`delete from auth.users where id = $1`, [rows[0].id_user]);
    console.log("usuário de teste removido");
  }
  await client.end();
})();
'
```

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 6: Commit**

```bash
git add web/components/CadastroForm.js "web/app/(auth)/cadastro/page.js" web/lib/actions/auth.js
git commit -m "Cadastro vindo de busca.?origem=busca cai direto em /diretorio"
```

---

### Task 9: Open Graph na página de perfil público

**Files:**
- Modify: `web/app/busca/[slug]/page.js:4-13`

**Interfaces:**
- Consumes: `perfil.foto_url` (já produzido por `buscarPerfilPorSlug`).

- [ ] **Step 1: Adicionar `openGraph` em `generateMetadata`**

Trocar:

```js
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);
  if (!perfil) return {};

  return {
    title: perfil.nome,
    description: perfil.bio ?? undefined,
  };
}
```

por:

```js
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);
  if (!perfil) return {};

  return {
    title: perfil.nome,
    description: perfil.bio ?? undefined,
    openGraph: {
      title: perfil.nome,
      description: perfil.bio ?? undefined,
      images: perfil.foto_url ? [perfil.foto_url] : undefined,
    },
  };
}
```

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add "web/app/busca/[slug]/page.js"
git commit -m "Open Graph (foto do perfil) na página pública do diretório"
```

---

### Task 10: Verificação end-to-end completa + push

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Build completo**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -60
```

Expected: build sem erro, rotas `/termos`, `/diretorio`, `/cadastro`,
`/busca`, `/busca/[slug]` todas listadas.

- [ ] **Step 2: Teste completo no navegador (chrome-devtools MCP)**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

1. Login como um profissional de teste existente, ir em `/diretorio`.
2. Marcar "Aparecer no diretório público" **sem** preencher bio/foto/
   especialidade/termos e salvar → esperar mensagem de erro listando o
   que falta, e confirmar no banco que `visivel_diretorio` continua
   `false`.
3. Preencher bio, subir uma foto, marcar 1 especialidade, marcar o
   checkbox de Termos de Uso, marcar "Aparecer no diretório público",
   salvar → esperar "Perfil salvo.", e confirmar no banco que
   `visivel_diretorio = true` e `termos_aceitos_em` está preenchido.
4. Clicar em "Compartilhar meu perfil" → confirmar que a área de
   transferência recebeu `busca.localhost:3000/<slug>` (ou o valor de
   `NEXT_PUBLIC_BUSCA_URL` configurado).
5. Abrir `http://busca.localhost:3000/` (ou via `Host` header) → conferir
   que o banner de CTA aparece e que o perfil publicado no passo 3
   aparece na listagem.
6. Abrir o perfil individual e conferir no HTML (`view-source:` ou
   `curl`) que a tag `<meta property="og:image" ...>` aponta pra foto do
   perfil.
7. Abrir `http://localhost:3000/termos` deslogado → confirmar que carrega
   sem redirecionar pro login.
8. Reverter/limpar o perfil de teste alterado no passo 3 se ele não for um
   perfil real (voltar `visivel_diretorio` a `false` ou apagar
   `PerfilPublico`, conforme o que existia antes do teste).

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 3: Pedir confirmação do usuário antes de `git push`**

Mesma regra já estabelecida no projeto: sempre confirmar com o usuário
antes de `git push` (dispara possibilidade de deploy) e lembrar de clicar
em "Deploy" manualmente no EasyPanel depois (não reimplanta sozinho a
partir de um push).

---

### Task 11: Atualizar documentação de status do backlog

**Files:**
- Modify: `docs/backlog-novas-funcionalidades.md`
- Modify: `docs/status-implementacao.md`

**Interfaces:** nenhuma — task de documentação.

**Contexto:** o item 2 do backlog (diretório público) já foi implementado
numa sessão anterior (ver
`docs/superpowers/plans/2026-08-03-diretorio-publico-psicologos.md`, todos
os commits já em `git log`), mas ao contrário dos itens 1/3/4,
`docs/backlog-novas-funcionalidades.md` nunca ganhou a linha
"**Status: implementado**" pro item 2, e `docs/status-implementacao.md`
nunca ganhou uma seção sobre ele — as duas ficaram desatualizadas. Esta
task corrige isso e documenta também a extensão desta sessão (CTA +
termos).

- [ ] **Step 1: Atualizar o item 2 em `docs/backlog-novas-funcionalidades.md`**

Trocar a linha de abertura do item 2:

```markdown
## 2. Diretório público de psicólogos (busca por paciente)

**Objetivo:** site público onde pacientes em potencial encontram e
```

por:

```markdown
## 2. Diretório público de psicólogos (busca por paciente)

**Status: implementado** (2026-08-03/04) — `busca.psifacil.com.br`
(listagem com filtros, perfil individual, contato via WhatsApp registrado
em `ContatoDiretorio`), painel `/diretorio` pro profissional editar o
próprio perfil e controlar visibilidade. Extensão nesta sessão: CTA de
cadastro em `/busca`, Termos de Uso com aceite obrigatório, barreira
mínima de qualidade (bio/foto/especialidade obrigatórios pra publicar),
botão de compartilhar perfil e Open Graph na página pública.

**Objetivo:** site público onde pacientes em potencial encontram e
```

- [ ] **Step 2: Adicionar seção nova no topo de `docs/status-implementacao.md`**

Adicionar logo depois do título `# Status da implementação` e da linha
`Última atualização:` (atualizar a data também), antes da seção mais
recente existente:

```markdown
## Diretório público: CTA de cadastro, termos de uso e divulgação (2026-08-04)

Extensão do item 2 (`busca.psifacil.com.br`, que já estava implementado
desde 2026-08-03/04 mas nunca tinha ganho uma seção aqui — corrigido
junto com esta entrega).

- **CTA "Cadastre-se grátis"** sempre visível no topo de `/busca`, link
  absoluto pra `https://psifacil.com.br/cadastro?origem=busca` (mesmo
  motivo do `comece.`: link relativo em subdomínio reescrito quebra).
  Quem se cadastra por esse caminho cai direto em `/diretorio` em vez do
  dashboard padrão (`cadastrar()` em `web/lib/actions/auth.js` lê o campo
  oculto `origem`).
- **Termos de Uso** (`/termos`, público, liberado em `PUBLIC_PATHS`):
  aceite obrigatório pra publicar, registrado com timestamp em
  `PerfilPublico.termos_aceitos_em` (sem versionamento — reforço futuro de
  consentimento seria por e-mail, não reabrindo esta coluna).
- **Barreira de qualidade**: `salvarPerfil` agora exige bio, foto e ao
  menos 1 especialidade pra `visivel_diretorio = true`, validado antes de
  qualquer escrita no banco — perfil incompleto continua podendo ser
  salvo como rascunho invisível.
- **Divulgação**: botão "Compartilhar meu perfil" em `/diretorio` (copia
  o link público pra área de transferência) e `openGraph.images` na
  página de perfil (`/busca/[slug]`) usando a foto do profissional.
```

- [ ] **Step 3: Commit**

```bash
git add docs/backlog-novas-funcionalidades.md docs/status-implementacao.md
git commit -m "docs: atualiza status do item 2 (diretório) + registra extensão de CTA/termos"
```

---

## Self-Review

- **Cobertura da spec:** CTA em `busca.` (Task 7), redirect pós-cadastro
  (Task 8), Termos de Uso + aceite gravado (Tasks 1, 3, 4, 5), barreira de
  bio/foto/especialidade (Task 4), botão de compartilhar (Task 6), Open
  Graph (Task 9) — todas as seções do design de
  `2026-08-04-diretorio-cta-cadastro-termos-design.md` têm task
  correspondente.
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo step tem
  código completo ou comando exato.
- **Consistência de tipos/nomes:** `termos_aceite` (nome do campo do
  formulário) é o mesmo em Task 5 (form) e Task 4 (action); `origem` é o
  mesmo em Task 7 (query param), Task 8 Step 1-3 (form/page/action);
  `perfil.termos_aceitos_em` é o mesmo em Task 2 (data layer) e Task 5
  (form).
