import Link from "next/link";
import ConsentimentoCookies from "@/components/ConsentimentoCookies";
import LogoPsiAgente from "@/components/LogoPsiAgente";
import SessionClock from "./SessionClock";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CADASTRO_URL = `${SITE_URL}/cadastro`;
const LOGIN_URL = `${SITE_URL}/login`;

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
          <div className="max-w-3xl mx-auto lg:mx-0 lg:ml-8 flex items-center gap-2.5">
            <LogoPsiAgente className="h-8 w-auto" />
            <span className="font-display text-xl font-bold text-[var(--petroleo)]">
              PsiAgente
            </span>
          </div>
        </header>

        <main>
          {/* Chegada */}
          <section id="chegada" className="relative overflow-hidden px-4 py-20 md:py-28">
            <div
              aria-hidden="true"
              className="respiracao pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[32rem] w-[32rem] rounded-full opacity-60 blur-3xl"
              style={{
                background: "radial-gradient(circle, var(--menta) 0%, transparent 70%)",
              }}
            />
            <div className="relative max-w-2xl mx-auto lg:mx-0 lg:ml-8 text-center lg:text-left">
              <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.08] text-[var(--grafite)]">
                Menos trabalho repetitivo.{" "}
                <em className="font-display italic text-[var(--petroleo)]">Mais paciente.</em>
              </h1>
              <p className="mt-6 text-lg text-[var(--cinza-pedra)] max-w-lg mx-auto lg:mx-0">
                Agenda, pacientes, financeiro e lembrete automático de sessão, com um
                agente cuidando da parte repetitiva — pra sobrar você pra quem senta
                na sua frente.
              </p>
              <div className="mt-9 flex flex-col items-center lg:items-start gap-3">
                <Link
                  href={CADASTRO_URL}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--ambar)] text-white font-bold px-8 py-3.5 text-base transition-colors hover:bg-[var(--ambar-escuro)]"
                >
                  Criar conta gratuita
                </Link>
                <p className="text-xs text-[var(--cinza-pedra)]">Sem cartão de crédito.</p>
              </div>
            </div>
          </section>

          {/* Faixa de estatística — assinatura visual da marca */}
          <section className="px-4 py-16 md:py-20 bg-[var(--petroleo)]">
            <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-8 text-center lg:text-left">
              <p className="font-display font-mono text-6xl md:text-8xl font-bold text-[var(--menta)] leading-none">
                1 a 12<span className="text-3xl md:text-5xl ml-2">horas</span>
              </p>
              <p className="mt-4 text-base md:text-lg text-[#dce9e6] max-w-md mx-auto lg:mx-0">
                é o que a documentação manual consome de você{" "}
                <strong className="text-white">por mês</strong>.
              </p>
              <div className="mt-7">
                <Link
                  href={CADASTRO_URL}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--ambar)] text-white font-bold px-7 py-3 text-sm transition-colors hover:bg-[var(--ambar-escuro)]"
                >
                  Recuperar esse tempo
                </Link>
              </div>
            </div>
          </section>

          {/* O que pesa / muda */}
          <section id="pesa" className="px-4 py-20 md:py-24 border-t border-[var(--linha)]">
            <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-8">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[var(--grafite)]">
                O que hoje pesa no seu dia
              </h2>
              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                {CARDS.map((c) => (
                  <div
                    key={c.titulo}
                    className="rounded-2xl border border-[var(--linha)] bg-white p-7"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--cinza-pedra)]">
                      Pesa
                    </p>
                    <p className="mt-1.5 text-[var(--grafite)]">{c.pesa}</p>
                    <div className="my-5 h-px bg-[var(--linha)]" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--petroleo)]">
                      Muda
                    </p>
                    <h3 className="mt-1.5 font-display text-xl font-bold text-[var(--grafite)]">
                      {c.titulo}
                    </h3>
                    <p className="mt-1 text-[var(--cinza-pedra)]">{c.muda}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Como começa */}
          <section
            id="comeca"
            className="px-4 py-20 md:py-24 border-t border-[var(--linha)] bg-white"
          >
            <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-8">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[var(--grafite)]">
                Como começa
              </h2>
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
                {PASSOS.map((passo) => (
                  <div key={passo.numero}>
                    <span className="font-display font-mono text-4xl text-[var(--petroleo)]">
                      {passo.numero}
                    </span>
                    <h3 className="mt-2 font-display font-bold text-[var(--grafite)]">
                      {passo.titulo}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--cinza-pedra)]">{passo.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA final */}
          <section
            id="marcar"
            className="px-4 py-20 md:py-28 border-t border-[var(--linha)] bg-[var(--petroleo)] text-center lg:text-left"
          >
            <div className="max-w-2xl mx-auto lg:mx-0 lg:ml-8">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
                Pronto pra começar?
              </h2>
              <p className="mt-4 text-[#dce9e6]">
                Sua primeira sessão organizada é gratuita.
              </p>
              <div className="mt-8">
                <Link
                  href={CADASTRO_URL}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--ambar)] text-white font-bold px-8 py-3.5 text-base transition-colors hover:bg-[var(--ambar-escuro)]"
                >
                  Criar conta gratuita
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="px-4 py-8 border-t border-[var(--linha)] text-center">
          <Link href={LOGIN_URL} className="text-sm font-semibold text-[var(--petroleo)]">
            Já tem conta? Entrar
          </Link>
        </footer>
      </div>

      <ConsentimentoCookies />
    </>
  );
}
