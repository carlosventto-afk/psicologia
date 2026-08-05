# Link "Cadastre-se" na tela de login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar em `/login` um link pra `/cadastro`, completando o par
recíproco que já existe do outro lado.

**Architecture:** Uma linha de JSX a mais num Client Component já
existente. Sem novo componente, sem novo estado, sem Server Action.

**Tech Stack:** Next.js 16 (App Router), classe CSS `.link` já existente.

## Global Constraints

- Reaproveitar a classe `.link` já usada em `web/app/(auth)/login/page.js`
  (no link "Esqueci minha senha") e em `web/app/(auth)/cadastro/page.js`
  (no link "Já tem conta? Entrar") — não criar classe nova.
- Projeto sem suíte de testes automatizados — verificação é `npm run
  build` + conferência visual.

---

### Task 1: Link "Cadastre-se" em `/login`

**Files:**
- Modify: `web/app/(auth)/login/page.js:54-56`

**Interfaces:** nenhuma — só markup, sem novas funções/props.

- [ ] **Step 1: Adicionar o link logo depois de "Esqueci minha senha"**

Trocar:

```js
        <Link href="/esqueci-senha" className="block text-sm link text-center">
          Esqueci minha senha
        </Link>
      </form>
```

por:

```js
        <Link href="/esqueci-senha" className="block text-sm link text-center">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="block text-sm link text-center">
          Não tem conta? Cadastre-se
        </Link>
      </form>
```

- [ ] **Step 2: Validar com build**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run build 2>&1 | tail -20
```

Expected: build sem erro.

- [ ] **Step 3: Conferir visualmente**

```bash
cd "c:/Users/Administrador/Desktop/Projetos/Psicologia/web" && npm run dev
```

```bash
curl -s http://localhost:3000/login --max-time 15 | grep -o "Não tem conta? Cadastre-se"
```

Expected: a string aparece no HTML.

```bash
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F; done
```

- [ ] **Step 4: Commit**

```bash
git add "web/app/(auth)/login/page.js"
git commit -m "Adiciona link Cadastre-se na tela de login"
```

## Self-Review

- **Cobertura da spec:** único requisito (link recíproco em `/login`) tem
  task correspondente.
- **Placeholders:** nenhum.
- **Consistência:** classe `.link` e estrutura `<Link>` idênticas às já
  usadas no mesmo arquivo e em `/cadastro`.
