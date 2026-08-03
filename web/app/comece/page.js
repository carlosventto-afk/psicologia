import Link from "next/link";
import ConsentimentoCookies from "@/components/ConsentimentoCookies";

const CADASTRO_URL = "https://psifacil.com.br/cadastro";
const LOGIN_URL = "https://psifacil.com.br/login";

const DORES = [
  {
    titulo: "Lembretes automáticos",
    dor: "Perder tempo confirmando sessão por sessão no WhatsApp, um por um.",
    solucao:
      "O agente de WhatsApp do PsiFácil confirma e lembra seus pacientes sozinho, sem você precisar digitar nada.",
  },
  {
    titulo: "Financeiro integrado",
    dor: "Não saber ao certo quem está devendo, nem quando cobrar.",
    solucao:
      "Recibos, pagamentos e inadimplência num painel só — sem planilha paralela pra conferir.",
  },
  {
    titulo: "Agenda única",
    dor: "Agenda espalhada entre papel, planilha e conversa de WhatsApp.",
    solucao:
      "Toda a sua semana organizada num só lugar, com recorrência automática pros pacientes fixos.",
  },
  {
    titulo: "Múltiplos consultórios",
    dor: "Atender em mais de um endereço e perder o controle de qual agenda é qual.",
    solucao:
      "Cada consultório com sua própria agenda e pacientes, tudo dentro da mesma conta.",
  },
];

const PASSOS = [
  { numero: "1", titulo: "Crie sua conta", texto: "Gratuito, leva menos de um minuto." },
  {
    numero: "2",
    titulo: "Configure seu consultório",
    texto: "Cadastre seus pacientes e sua agenda do jeito que você já trabalha.",
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
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <img src="/logo.svg" alt="PsiFácil" className="h-8 w-auto" />
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-background">
          <div className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
            <h1 className="text-3xl md:text-5xl font-extrabold text-navy leading-tight max-w-3xl mx-auto">
              Sua rotina de consultório, finalmente em um só lugar
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted max-w-xl mx-auto">
              Agenda, pacientes, financeiro e lembretes automáticos por
              WhatsApp — sem planilha, sem caderno, sem perder tempo.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link href={CADASTRO_URL} className="btn-primary text-base px-8 py-3">
                Criar conta grátis
              </Link>
              <p className="text-xs text-muted">Sem cartão de crédito.</p>
            </div>
          </div>
        </section>

        {/* Dores -> Soluções */}
        <section className="max-w-5xl mx-auto px-4 py-16 md:py-20">
          <h2 className="text-2xl md:text-3xl font-extrabold text-navy text-center">
            O que hoje toma seu tempo, o PsiFácil resolve
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
            {DORES.map((item) => (
              <div key={item.titulo} className="card p-6">
                <p className="text-sm text-muted line-through decoration-red-400">
                  {item.dor}
                </p>
                <h3 className="mt-2 text-lg font-bold text-navy">{item.titulo}</h3>
                <p className="mt-1 text-sm text-muted">{item.solucao}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section className="bg-background">
          <div className="max-w-5xl mx-auto px-4 py-16 md:py-20">
            <h2 className="text-2xl md:text-3xl font-extrabold text-navy text-center">
              Como funciona
            </h2>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              {PASSOS.map((passo) => (
                <div key={passo.numero} className="text-center">
                  <div className="mx-auto h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    {passo.numero}
                  </div>
                  <h3 className="mt-3 font-bold text-navy">{passo.titulo}</h3>
                  <p className="mt-1 text-sm text-muted">{passo.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="max-w-3xl mx-auto px-4 py-16 md:py-20 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-navy">
            Pronto pra organizar seu consultório?
          </h2>
          <div className="mt-6">
            <Link href={CADASTRO_URL} className="btn-primary text-base px-8 py-3">
              Criar conta grátis
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-muted">
          <Link href={LOGIN_URL} className="link">
            Já tem conta? Entrar
          </Link>
        </div>
      </footer>

      <ConsentimentoCookies />
    </>
  );
}
