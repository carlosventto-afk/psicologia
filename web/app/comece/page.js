import Link from "next/link";
import ConsentimentoCookies from "@/components/ConsentimentoCookies";
import SessionClock from "./SessionClock";

const CADASTRO_URL = "https://psifacil.com.br/cadastro";
const LOGIN_URL = "https://psifacil.com.br/login";

const CARDS = [
  {
    pesa: "Confirmar sessão por sessão, um WhatsApp de cada vez.",
    titulo: "Lembrete automático",
    muda: "O sistema confirma e avisa cada paciente sozinho, no horário certo.",
  },
  {
    pesa: "Não saber ao certo quem está devendo, nem desde quando.",
    titulo: "Financeiro em dia",
    muda: "Recibo, pagamento e inadimplência reunidos num painel só.",
  },
  {
    pesa: "Agenda dividida entre caderno, planilha e conversa perdida.",
    titulo: "Uma agenda só",
    muda: "A semana inteira organizada, com sessões recorrentes automáticas.",
  },
  {
    pesa: "Mais de um consultório, mais de uma dor de cabeça.",
    titulo: "Todos os endereços, uma conta",
    muda: "Cada consultório com sua própria agenda e seus próprios pacientes.",
  },
];

const PASSOS = [
  { numero: "1", titulo: "Crie sua conta", texto: "Gratuita, leva menos de um minuto." },
  {
    numero: "2",
    titulo: "Configure seu consultório",
    texto: "Cadastre pacientes e agenda do jeito que você já trabalha.",
  },
  {
    numero: "3",
    titulo: "Comece a atender",
    texto: "Com lembrete automático, financeiro e recibo já funcionando.",
  },
];

export default function PaginaComece() {
  return (
    <>
      <SessionClock />

      <div className="lg:pl-20">
        <header className="px-4 py-5">
          <div className="max-w-3xl mx-auto lg:mx-0 lg:ml-8">
            <img src="/logo.svg" alt="PsiFácil" className="h-7 w-auto" />
          </div>
        </header>

        <main>
          {/* Chegada */}
          <section id="chegada" className="relative overflow-hidden px-4 py-20 md:py-28">
            <div
              aria-hidden="true"
              className="respiracao pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[32rem] w-[32rem] rounded-full opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, var(--moss-soft) 0%, transparent 70%)",
              }}
            />
            <div className="relative max-w-2xl mx-auto lg:mx-0 lg:ml-8 text-center lg:text-left">
              <h1 className="font-display text-4xl md:text-6xl font-medium leading-[1.08] text-[var(--ink)]">
                A parte administrativa do consultório,{" "}
                <em className="font-display italic text-[var(--moss-dark)]">fora</em> do
                seu caminho.
              </h1>
              <p className="mt-6 text-lg text-[var(--ink-soft)] max-w-lg mx-auto lg:mx-0">
                Agenda, pacientes, financeiro e lembrete automático de sessão por
                WhatsApp — tudo em um só lugar, pra sobrar você pra quem senta na
                sua frente.
              </p>
              <div className="mt-9 flex flex-col items-center lg:items-start gap-3">
                <Link
                  href={CADASTRO_URL}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--moss)] text-white font-bold px-8 py-3.5 text-base transition-colors hover:bg-[var(--moss-dark)]"
                >
                  Criar conta gratuita
                </Link>
                <p className="text-xs text-[var(--ink-soft)]">Sem cartão de crédito.</p>
              </div>
            </div>
          </section>

          {/* O que pesa / muda */}
          <section id="pesa" className="px-4 py-20 md:py-24 border-t border-[var(--border)]">
            <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-8">
              <h2 className="font-display text-3xl md:text-4xl font-medium text-[var(--ink)]">
                O que hoje pesa no seu dia
              </h2>
              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                {CARDS.map((c) => (
                  <div
                    key={c.titulo}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--paper-warm)] p-7"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                      Pesa
                    </p>
                    <p className="mt-1.5 text-[var(--ink-soft)]">{c.pesa}</p>
                    <div className="my-5 h-px bg-[var(--border)]" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--moss-dark)]">
                      Muda
                    </p>
                    <h3 className="mt-1.5 font-display text-xl font-medium text-[var(--ink)]">
                      {c.titulo}
                    </h3>
                    <p className="mt-1 text-[var(--ink-soft)]">{c.muda}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Como começa */}
          <section
            id="comeca"
            className="px-4 py-20 md:py-24 border-t border-[var(--border)] bg-[var(--paper-warm)]"
          >
            <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-8">
              <h2 className="font-display text-3xl md:text-4xl font-medium text-[var(--ink)]">
                Como começa
              </h2>
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
                {PASSOS.map((passo) => (
                  <div key={passo.numero}>
                    <span className="font-display text-4xl text-[var(--moss)]">
                      {passo.numero}
                    </span>
                    <h3 className="mt-2 font-bold text-[var(--ink)]">{passo.titulo}</h3>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">{passo.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA final */}
          <section
            id="marcar"
            className="px-4 py-20 md:py-28 border-t border-[var(--border)] text-center lg:text-left"
          >
            <div className="max-w-2xl mx-auto lg:mx-0 lg:ml-8">
              <h2 className="font-display text-3xl md:text-4xl font-medium text-[var(--ink)]">
                Pronto pra começar?
              </h2>
              <p className="mt-4 text-[var(--ink-soft)]">
                Sua primeira sessão organizada é gratuita.
              </p>
              <div className="mt-8">
                <Link
                  href={CADASTRO_URL}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--moss)] text-white font-bold px-8 py-3.5 text-base transition-colors hover:bg-[var(--moss-dark)]"
                >
                  Criar conta gratuita
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="px-4 py-8 border-t border-[var(--border)] text-center">
          <Link href={LOGIN_URL} className="text-sm font-semibold text-[var(--moss-dark)]">
            Já tem conta? Entrar
          </Link>
        </footer>
      </div>

      <ConsentimentoCookies />
    </>
  );
}
