# Home Institucional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a home institucional do PsiAgente em `psiagente.com.br/` (hoje inexistente — a raiz 404/redireciona pro login), com nav, hero, recursos, preços, blog em destaque, FAQ e footer institucional com WhatsApp/Instagram.

**Architecture:** Página única server component (`web/app/page.js`), mesmo padrão de `web/app/comece/page.js` — sem quebrar em múltiplos arquivos de seção. Único componente novo extraído: `HeaderInstitucional` (client, por causa do menu mobile). Reaproveita dados já existentes (`PLANOS`, `listarArtigosPublicados`) e componentes já existentes (`LogoPsiAgente`, `ConsentimentoCookies`, ícones de `NavIcons.js`). Pré-requisito: o middleware de sessão (`web/lib/supabase/proxy.js`) precisa liberar a raiz `/`, hoje redirecionada pro `/login` por não estar em `PUBLIC_PATHS`.

**Tech Stack:** Next.js 16 App Router (Server Components), Tailwind v4 (`@theme inline` em `web/app/globals.css`), Supabase (só leitura, via `listarArtigosPublicados` já existente).

**Spec:** `docs/superpowers/specs/2026-09-11-home-institucional-design.md`

## Global Constraints

- `/comece` (landing paga) **não é tocada** nesta entrega — fica em `comece.psiagente.com.br`, sem alteração.
- **Não tocar em `web/app/comece/comece.css` nem `comece/layout.js`** — qualquer CSS/efeito visual compartilhado é duplicado em `globals.css` com nome próprio, nunca movido de lá.
- Cor **menta (`#6FCBB6`) não pode ser usada na home** — reservada a conteúdo gerado por IA (ver comentário em `web/app/globals.css:4-11`). Onde `/comece` usa menta (faixa de estatística, glow), a home usa branco/petróleo no lugar.
- Sem depoimentos nesta entrega — usuário decidiu adiar. A seção entra **comentada** no JSX, não renderizada, com o formato de dado esperado documentado no comentário.
- CTAs de conta usam `/cadastro?origem=home` e `/login` — sem pré-seleção de plano (fora de escopo alterar `CadastroForm`/`PaginaCadastro`).
- WhatsApp de contato: `https://wa.me/5591981910295`. Instagram: `https://instagram.com/psiagente`. Footer sem CNPJ/endereço; texto "Criado por GESTÃO TECNOLOGIA".
- Preços vêm de `web/lib/planos.js` (`PLANOS`) — nunca duplicar valor numérico solto no componente.
- Sem framework de teste automatizado (convenção já estabelecida no projeto) — verificação via `npm run build` + `npm run start` (nunca contra dev server) e curl/inspeção manual no navegador.

---

## Arquivos deste plano

- Modificar: `web/lib/supabase/proxy.js` (libera `/` no middleware de sessão).
- Modificar: `web/app/globals.css` (classe `.glow-suave` nova).
- Criar: `web/components/HeaderInstitucional.js`.
- Criar: `web/app/page.js` (a home em si, construída em 4 tasks incrementais).
- Modificar: `web/app/sitemap.js` (inclui a home).

---

### Task 1: Middleware — liberar `/` sem abrir o resto do app

**Files:**
- Modify: `web/lib/supabase/proxy.js:26-27`

**Interfaces:**
- Produces: comportamento de `updateSession(request)` inalterado pra qualquer rota exceto `/` — que passa a não redirecionar mais pro `/login`. Consumido implicitamente por todas as tasks seguintes (sem essa mudança, ninguém deslogado veria a home nova).

- [ ] **Step 1: Editar `web/lib/supabase/proxy.js`**

Trocar:

```js
export async function updateSession(request) {
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isPublicPath) {
    return NextResponse.next({ request });
  }
```

Por:

```js
export async function updateSession(request) {
  // "/" comparado por igualdade, não por startsWith — comparar por
  // prefixo tornaria toda rota pública, já que qualquer path começa
  // com "/".
  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isPublicPath) {
    return NextResponse.next({ request });
  }
```

- [ ] **Step 2: Build e subir preview local**

```bash
cd web
npm run build
npm run start
```

(deixar rodando em background pra rodar os `curl` do próximo passo; a porta padrão é 3000)

- [ ] **Step 3: Verificar que `/` não redireciona mais, e que o resto do app continua protegido**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/agenda
```

Expected: primeiro comando imprime `404` (ainda não existe `page.js` na raiz — é o esperado até a Task 2; o importante é **não ser 307/302**). Segundo comando imprime `307` (redirecionamento pro `/login`, comportamento que não pode ter mudado).

Parar o servidor (`Ctrl+C` ou matar o processo) antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add web/lib/supabase/proxy.js
git commit -m "$(cat <<'EOF'
fix(auth): libera a home ("/") do redirecionamento pro login

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Home — header, hero, faixa de estatística e recursos

**Files:**
- Create: `web/components/HeaderInstitucional.js`
- Modify: `web/app/globals.css` (adicionar `.glow-suave` ao final do bloco `@layer components`, logo após `.blog-meta`)
- Create: `web/app/page.js`

**Interfaces:**
- Consumes: `LogoPsiAgente` (`@/components/LogoPsiAgente`, já existe), `IconeMenu`/`IconeFechar`/`IconeWhatsapp`/`IconeAgenda`/`IconeFinanceiro`/`IconeConsultorio`/`IconeCarneLeao`/`IconeDocumentos` (`@/components/icons/NavIcons`, já existem).
- Produces: `HeaderInstitucional` (componente sem props) — consumido só por `web/app/page.js`. Classe CSS `.glow-suave` — consumida só pelo hero desta página. `PaginaInicial` (default export de `web/app/page.js`) — Tasks 3, 4 e 5 modificam este mesmo arquivo.

- [ ] **Step 1: Criar `web/components/HeaderInstitucional.js`**

```jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import LogoPsiAgente from "./LogoPsiAgente";
import { IconeMenu, IconeFechar } from "./icons/NavIcons";

const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL ?? "https://blog.psiagente.com.br";

const LINKS_NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#precos", label: "Preços" },
  { href: BLOG_URL, label: "Blog" },
];

export default function HeaderInstitucional() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoPsiAgente className="h-8 w-auto" />
          <span className="font-display text-lg font-bold text-navy">PsiAgente</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS_NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-navy hover:text-primary-dark transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="btn-outline">
            Entrar
          </Link>
          <Link href="/cadastro?origem=home" className="btn-primary">
            Criar conta grátis
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          className="md:hidden text-navy p-2 -mr-2"
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
        >
          {menuAberto ? <IconeFechar width={24} height={24} /> : <IconeMenu width={24} height={24} />}
        </button>
      </div>

      {menuAberto && (
        <div className="md:hidden border-t border-border bg-surface px-4 py-4">
          <nav className="flex flex-col gap-3">
            {LINKS_NAV.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuAberto(false)}
                className="text-sm font-semibold text-navy"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/login" className="btn-outline w-full" onClick={() => setMenuAberto(false)}>
              Entrar
            </Link>
            <Link
              href="/cadastro?origem=home"
              className="btn-primary w-full"
              onClick={() => setMenuAberto(false)}
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Adicionar `.glow-suave` em `web/app/globals.css`**

Localizar o final do bloco `@layer components` (a última regra é `.blog-meta`, seguida do `}` que fecha o `@layer`). Adicionar logo antes desse `}` de fechamento:

```css
  .glow-suave {
    animation: respirar-suave 7s ease-in-out infinite;
  }

  @keyframes respirar-suave {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.08);
      opacity: 0.8;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow-suave {
      animation: none;
    }
  }
```

(nome `respirar-suave`, não `respirar` — evita colidir com o `@keyframes respirar` já definido em `comece.css`, que também carrega globalmente dentro de `/comece`)

- [ ] **Step 3: Criar `web/app/page.js`**

```jsx
import Link from "next/link";
import HeaderInstitucional from "@/components/HeaderInstitucional";
import {
  IconeWhatsapp,
  IconeAgenda,
  IconeFinanceiro,
  IconeConsultorio,
  IconeCarneLeao,
  IconeDocumentos,
} from "@/components/icons/NavIcons";

const CADASTRO_URL = "/cadastro?origem=home";

export const metadata = {
  title: "PsiAgente — Gestão de consultório para psicólogos",
  description:
    "Agenda, pacientes, financeiro e lembrete automático de sessão por WhatsApp, com um agente que cuida da parte administrativa do seu consultório.",
  openGraph: {
    title: "PsiAgente — Gestão de consultório para psicólogos",
    description:
      "Agenda, pacientes, financeiro e lembrete automático de sessão por WhatsApp, com um agente que cuida da parte administrativa do seu consultório.",
    type: "website",
    images: ["/og-default.png"],
  },
};

const RECURSOS = [
  {
    Icone: IconeWhatsapp,
    titulo: "Lembrete automático",
    texto: "O sistema confirma e avisa cada paciente sozinho, por WhatsApp, no horário certo.",
  },
  {
    Icone: IconeAgenda,
    titulo: "Agenda unificada",
    texto: "A semana inteira organizada, com sessões recorrentes automáticas.",
  },
  {
    Icone: IconeFinanceiro,
    titulo: "Financeiro em dia",
    texto: "Recibo, pagamento e inadimplência reunidos num painel só.",
  },
  {
    Icone: IconeConsultorio,
    titulo: "Múltiplos consultórios",
    texto: "Cada consultório com sua própria agenda e seus próprios pacientes, numa conta só.",
  },
  {
    Icone: IconeCarneLeao,
    titulo: "Carnê-Leão automático",
    texto: "Carnê-Leão do paciente gerado e enviado sem trabalho manual todo mês.",
  },
  {
    Icone: IconeDocumentos,
    titulo: "Anamnese e documentos",
    texto: "Anamnese, prontuário e documentos organizados por paciente.",
  },
];

export default function PaginaInicial() {
  return (
    <>
      <HeaderInstitucional />

      <main>
        <section className="relative overflow-hidden px-4 py-20 md:py-28 text-center">
          <div
            aria-hidden="true"
            className="glow-suave pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[32rem] w-[32rem] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--color-navy) 0%, transparent 70%)" }}
          />
          <div className="relative max-w-2xl mx-auto">
            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.08] text-foreground">
              Menos trabalho repetitivo.{" "}
              <em className="font-display italic text-navy">Mais paciente.</em>
            </h1>
            <p className="mt-6 text-lg text-muted max-w-lg mx-auto">
              Agenda, pacientes, financeiro e lembrete automático de sessão, com
              um agente cuidando da parte repetitiva — pra sobrar você pra quem
              senta na sua frente.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3">
              <Link href={CADASTRO_URL} className="btn-primary px-8 py-3.5 text-base">
                Criar conta grátis
              </Link>
              <p className="text-xs text-muted">Sem cartão de crédito.</p>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 md:py-20 bg-navy text-center">
          <div className="max-w-2xl mx-auto">
            <p className="font-display font-mono text-6xl md:text-8xl font-bold text-white leading-none">
              1 a 12<span className="text-3xl md:text-5xl ml-2">horas</span>
            </p>
            <p className="mt-4 text-base md:text-lg text-white/80 max-w-md mx-auto">
              é o que a documentação manual consome de você{" "}
              <strong className="text-white">por mês</strong>.
            </p>
          </div>
        </section>

        <section id="recursos" className="px-4 py-20 md:py-24 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground text-center">
              Tudo que seu consultório precisa, num só lugar
            </h2>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {RECURSOS.map(({ Icone, titulo, texto }) => (
                <div key={titulo} className="card p-6">
                  <Icone width={28} height={28} className="text-navy" />
                  <h3 className="mt-4 font-display font-bold text-foreground">{titulo}</h3>
                  <p className="mt-1.5 text-sm text-muted">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Build e verificar visualmente**

```bash
cd web
npm run build
npm run start
```

Acessar `http://localhost:3000/` no navegador. Confirmar: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` agora imprime `200` (a Task 1 já garantia que não redireciona; agora a página existe de verdade). Visualmente: header fixo com logo, links "Recursos"/"Preços"/"Blog" e botões "Entrar"/"Criar conta grátis"; redimensionar a janela pra largura de celular e confirmar que o menu vira hambúrguer e abre/fecha; hero com o glow sutil atrás do título; faixa "1 a 12 horas" em fundo petróleo; grid de 6 cards de recursos. Parar o servidor.

- [ ] **Step 5: Commit**

```bash
git add web/components/HeaderInstitucional.js web/app/globals.css web/app/page.js
git commit -m "$(cat <<'EOF'
feat(home): adiciona header, hero, faixa de estatistica e recursos da home institucional

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Home — seção de preços

**Files:**
- Modify: `web/app/page.js`

**Interfaces:**
- Consumes: `PLANOS` (`@/lib/planos`, já existe — `gratis`/`gestao`/`gestao_marketing`/`marketing`, cada um com `{id, nome, preco, ...}`), `formatarMoeda` (`@/lib/formatar-moeda`, já existe).
- Produces: constante `PRECOS` (array de 4 planos com `beneficios` e `destaque`) — usada só dentro de `page.js`.

- [ ] **Step 1: Adicionar os imports e a constante `PRECOS`**

Trocar:

```js
} from "@/components/icons/NavIcons";

const CADASTRO_URL = "/cadastro?origem=home";
```

Por:

```js
} from "@/components/icons/NavIcons";
import { PLANOS } from "@/lib/planos";
import { formatarMoeda } from "@/lib/formatar-moeda";

const CADASTRO_URL = "/cadastro?origem=home";
```

E trocar:

```js
];

export default function PaginaInicial() {
```

Por:

```js
];

const PRECOS = [
  {
    ...PLANOS.gratis,
    destaque: false,
    beneficios: ["Gestão básica de agenda e pacientes", "1 consultório"],
  },
  {
    ...PLANOS.marketing,
    destaque: false,
    beneficios: ["Perfil no diretório público de psicólogos", "Consultórios ilimitados"],
  },
  {
    ...PLANOS.gestao,
    destaque: false,
    beneficios: [
      "Agenda, financeiro e documentos",
      "Lembrete automático por WhatsApp",
      "Carnê-Leão automático",
    ],
  },
  {
    ...PLANOS.gestao_marketing,
    destaque: true,
    beneficios: ["Tudo do Psi Gestão", "Perfil no diretório público de psicólogos"],
  },
];

export default function PaginaInicial() {
```

- [ ] **Step 2: Adicionar a seção de preços antes de fechar `<main>`**

Trocar (final do arquivo):

```jsx
        </section>
      </main>
    </>
  );
}
```

Por:

```jsx
        </section>

        <section id="precos" className="px-4 py-20 md:py-24 border-t border-border bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground text-center">
              Um plano pra cada momento do consultório
            </h2>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {PRECOS.map((plano) => (
                <div
                  key={plano.id}
                  className={`card p-6 flex flex-col ${plano.destaque ? "border-2 border-primary" : ""}`}
                >
                  {plano.destaque && (
                    <span className="self-start rounded-full bg-primary/10 text-primary-dark text-xs font-bold px-2.5 py-1 mb-3">
                      Mais completo
                    </span>
                  )}
                  <h3 className="font-display font-bold text-lg text-navy">{plano.nome}</h3>
                  <p className="mt-2">
                    <span className="font-display text-3xl font-bold text-foreground">
                      {plano.preco === 0 ? "Grátis" : formatarMoeda(plano.preco)}
                    </span>
                    {plano.preco > 0 && <span className="text-sm text-muted"> /mês</span>}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-muted flex-1">
                    {plano.beneficios.map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                  </ul>
                  <Link href={CADASTRO_URL} className="btn-outline mt-6 justify-center">
                    Começar
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Build e verificar**

```bash
cd web
npm run build
npm run start
```

Acessar `http://localhost:3000/#precos`. Confirmar 4 cards, nesta ordem: Grátis (R$ 0,00 exibido como "Grátis"), Psi Marketing (R$ 39,90 /mês), Psi Gestão (R$ 49,90 /mês), Psi Gestão + Marketing (R$ 79,90 /mês, com selo "Mais completo" e borda destacada). Todos os botões "Começar" levam pra `/cadastro?origem=home`. Parar o servidor.

- [ ] **Step 4: Commit**

```bash
git add web/app/page.js
git commit -m "$(cat <<'EOF'
feat(home): adiciona secao de precos na home institucional

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Home — blog em destaque, depoimentos (estrutura pronta, oculta) e FAQ

**Files:**
- Modify: `web/app/page.js`

**Interfaces:**
- Consumes: `listarArtigosPublicados()` (`@/lib/data/artigos`, já existe — retorna array ordenado por `publicado_em desc`, cada item com `{id, titulo, slug, resumo, autor, publicado_em, imagem_capa}`).
- Produces: `PaginaInicial` passa a ser `async`. Constante `FAQ` (array de `{pergunta, resposta}`) — usada só dentro de `page.js`.

- [ ] **Step 1: Import, constante `FAQ` e tornar a página `async`**

Trocar:

```js
import { formatarMoeda } from "@/lib/formatar-moeda";

const CADASTRO_URL = "/cadastro?origem=home";
```

Por:

```js
import { formatarMoeda } from "@/lib/formatar-moeda";
import { listarArtigosPublicados } from "@/lib/data/artigos";

const CADASTRO_URL = "/cadastro?origem=home";
const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL ?? "https://blog.psiagente.com.br";
```

E trocar:

```js
];

export default function PaginaInicial() {
  return (
```

Por:

```js
];

const FAQ = [
  {
    pergunta: "Preciso de cartão de crédito para começar?",
    resposta: "Não. O plano Grátis não pede cartão; você faz upgrade quando quiser.",
  },
  {
    pergunta: "Já uso planilha ou outra agenda — dá pra migrar meus pacientes?",
    resposta: "Sim, tem um assistente de importação que lê a sua planilha de pacientes existente.",
  },
  {
    pergunta: "O lembrete de sessão é automático?",
    resposta: "Sim, por WhatsApp, nos planos Psi Gestão e Psi Gestão + Marketing.",
  },
  {
    pergunta: "Posso usar em mais de um consultório na mesma conta?",
    resposta: "Sim — nos planos pagos não há limite de consultórios.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta: "Sim, direto no painel, sem burocracia.",
  },
  {
    pergunta: "Meus dados e os dos pacientes ficam seguros?",
    resposta:
      "Sim — os dados ficam armazenados com controle de acesso e criptografia, seguindo os princípios da LGPD.",
  },
];

export default async function PaginaInicial() {
  const artigos = await listarArtigosPublicados();
  const artigosDestaque = artigos.slice(0, 3);

  return (
```

(atenção: no arquivo, `];` acima é o fechamento de `PRECOS` — é o único `];` seguido diretamente de `export default function PaginaInicial() {`, então a substituição é inequívoca)

- [ ] **Step 2: Adicionar depoimentos (comentado), blog em destaque e FAQ antes de fechar `<main>`**

Trocar (final do arquivo):

```jsx
        </section>
      </main>
    </>
  );
}
```

Por:

```jsx
        </section>

        {/* Depoimentos — aguardando conteúdo real do usuário (ver
            docs/superpowers/specs/2026-09-11-home-institucional-design.md).
            Formato esperado por item: { nome, cargo_ou_cidade, foto_url?, texto }.
        <section id="depoimentos"> ... </section>
        */}

        {artigosDestaque.length > 0 && (
          <section className="px-4 py-20 md:py-24 border-t border-border">
            <div className="max-w-5xl mx-auto">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground text-center">
                Do blog
              </h2>
              <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
                {artigosDestaque.map((a) => (
                  <a key={a.id} href={`${BLOG_URL}/${a.slug}`} className="card overflow-hidden block">
                    {a.imagem_capa ? (
                      <img src={a.imagem_capa} alt={a.titulo} className="blog-card-img" />
                    ) : (
                      <div className="blog-card-fallback">
                        <span>{a.titulo}</span>
                      </div>
                    )}
                    <div className="p-5">
                      <p className="blog-meta">{new Date(a.publicado_em).toLocaleDateString("pt-BR")}</p>
                      <h3 className="mt-1 font-display font-bold text-navy">{a.titulo}</h3>
                      {a.resumo && <p className="mt-2 text-sm text-muted">{a.resumo}</p>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="px-4 py-20 md:py-24 border-t border-border bg-white">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground text-center">
              Perguntas frequentes
            </h2>
            <div className="mt-10 space-y-3">
              {FAQ.map(({ pergunta, resposta }) => (
                <details key={pergunta} className="card p-5 group">
                  <summary className="font-display font-bold text-navy cursor-pointer list-none flex items-center justify-between gap-4">
                    {pergunta}
                    <span className="text-muted group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted">{resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Build e verificar**

```bash
cd web
npm run build
npm run start
```

Acessar `http://localhost:3000/`. Se já existir algum artigo publicado (`listarArtigosPublicados`), confirmar que até 3 aparecem em "Do blog", cada card levando pra `https://blog.psiagente.com.br/<slug>`; se não houver nenhum, confirmar que a seção inteira não aparece (sem grade vazia). Confirmar que a seção de depoimentos **não aparece em lugar nenhum** (`curl -s http://localhost:3000/ | grep -c "depoimentos"` deve dar `0` — o comentário JSX não é enviado ao HTML). Na seção FAQ, clicar em cada pergunta e confirmar que abre/fecha (acordeão nativo). Parar o servidor.

- [ ] **Step 4: Commit**

```bash
git add web/app/page.js
git commit -m "$(cat <<'EOF'
feat(home): adiciona blog em destaque e FAQ na home institucional

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Home — CTA final, footer institucional e cookies

**Files:**
- Modify: `web/app/page.js`

**Interfaces:**
- Consumes: `ConsentimentoCookies` (`@/components/ConsentimentoCookies`, já existe, sem props), `LogoPsiAgente` (`@/components/LogoPsiAgente`, já existe), `IconeWhatsapp` (já importado na Task 2).
- Produces: `IconeInstagram` (função local, só usada neste arquivo — não exportada, não vai pra `NavIcons.js` porque é de uso único).

- [ ] **Step 1: Adicionar os imports**

Trocar:

```js
import { listarArtigosPublicados } from "@/lib/data/artigos";

const CADASTRO_URL = "/cadastro?origem=home";
```

Por:

```js
import { listarArtigosPublicados } from "@/lib/data/artigos";
import ConsentimentoCookies from "@/components/ConsentimentoCookies";
import LogoPsiAgente from "@/components/LogoPsiAgente";

const CADASTRO_URL = "/cadastro?origem=home";
```

- [ ] **Step 2: Adicionar `IconeInstagram` antes da página**

Trocar:

```js
];

export default async function PaginaInicial() {
```

Por:

```js
];

function IconeInstagram(props) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="14" height="14" rx="4" />
      <circle cx="10" cy="10" r="3.2" />
      <circle cx="14.3" cy="5.7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default async function PaginaInicial() {
```

(`];` acima é o fechamento de `FAQ` — único `];` seguido de `export default async function PaginaInicial() {` neste ponto)

- [ ] **Step 3: Adicionar CTA final, footer e cookies, fechando o arquivo**

Trocar (final do arquivo):

```jsx
        </section>
      </main>
    </>
  );
}
```

Por:

```jsx
        </section>

        <section className="px-4 py-20 md:py-28 border-t border-border bg-navy text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white">Pronto pra começar?</h2>
            <p className="mt-4 text-white/80">Sua primeira sessão organizada é gratuita.</p>
            <div className="mt-8">
              <Link href={CADASTRO_URL} className="btn-primary px-8 py-3.5 text-base">
                Criar conta grátis
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 py-10 border-t border-border">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <LogoPsiAgente className="h-7 w-auto" />
            <span className="font-display font-bold text-navy">PsiAgente</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-navy">
            <a href={BLOG_URL}>Blog</a>
            <Link href="/login">Entrar</Link>
            <Link href="/termos">Termos</Link>
            <a
              href="https://wa.me/5591981910295"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              <IconeWhatsapp width={16} height={16} />
              WhatsApp
            </a>
            <a
              href="https://instagram.com/psiagente"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              <IconeInstagram />
              @psiagente
            </a>
          </nav>
        </div>
        <p className="mt-8 text-center text-xs text-muted">
          Criado por GESTÃO TECNOLOGIA · © {new Date().getFullYear()} PsiAgente
        </p>
      </footer>

      <ConsentimentoCookies />
    </>
  );
}
```

- [ ] **Step 4: Build e verificar (regressão completa da página)**

```bash
cd web
npm run build
npm run start
```

Verificar na home completa: seção final "Pronto pra começar?" em fundo petróleo; footer com logo, links Blog/Entrar/Termos, link do WhatsApp abrindo `https://wa.me/5591981910295`, link do Instagram abrindo `https://instagram.com/psiagente`, texto "Criado por GESTÃO TECNOLOGIA" e o ano atual. Repetir a checagem de middleware da Task 1 (`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` → `200`; mesmo comando em `/agenda` → `307`). Confirmar que `/comece` continua funcionando sem alteração (`curl -s -o /dev/null -w "%{http_code}\n" -H "Host: comece.psiagente.com.br" http://localhost:3000/` → `200`, mesmo comportamento de antes desta entrega). Parar o servidor.

- [ ] **Step 5: Commit**

```bash
git add web/app/page.js
git commit -m "$(cat <<'EOF'
feat(home): adiciona CTA final, footer institucional e cookies na home

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: SEO — incluir a home no sitemap

**Files:**
- Modify: `web/app/sitemap.js`

**Interfaces:**
- Consumes: nenhuma interface nova — só adiciona uma entrada estática ao array já retornado por `sitemap()`.

- [ ] **Step 1: Adicionar a home ao sitemap**

Trocar:

```js
export default async function sitemap() {
  const origemBlog = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const origemBusca = process.env.NEXT_PUBLIC_BUSCA_URL ?? "http://localhost:3000";

  const [artigos, perfis] = await Promise.all([
    listarArtigosPublicados(),
    buscarPerfisPublicos({}),
  ]);

  return [
    {
      url: origemBlog,
      changeFrequency: "weekly",
      priority: 0.8,
    },
```

Por:

```js
export default async function sitemap() {
  const origemHome = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const origemBlog = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";
  const origemBusca = process.env.NEXT_PUBLIC_BUSCA_URL ?? "http://localhost:3000";

  const [artigos, perfis] = await Promise.all([
    listarArtigosPublicados(),
    buscarPerfisPublicos({}),
  ]);

  return [
    {
      url: origemHome,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: origemBlog,
      changeFrequency: "weekly",
      priority: 0.8,
    },
```

- [ ] **Step 2: Build e verificar**

```bash
cd web
npm run build
npm run start
curl -s http://localhost:3000/sitemap.xml
```

Confirmar que a primeira `<url>` do XML é a home (`priority` `1`, `changefreq` `monthly`), antes das entradas de blog/busca. Parar o servidor.

- [ ] **Step 3: Commit**

```bash
git add web/app/sitemap.js
git commit -m "$(cat <<'EOF'
feat(seo): inclui a home institucional no sitemap

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
