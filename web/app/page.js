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
import { listarArtigosPublicados } from "@/lib/data/artigos";

const CADASTRO_URL = "/cadastro?origem=home";
const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL ?? "https://blog.psiagente.com.br";

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
