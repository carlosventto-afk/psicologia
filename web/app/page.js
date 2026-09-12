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
import { PLANOS } from "@/lib/planos";
import { formatarMoeda } from "@/lib/formatar-moeda";

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
