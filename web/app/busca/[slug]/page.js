import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarPerfilPorSlug } from "@/lib/data/diretorio";
import { iniciais } from "@/lib/iniciais";
import { formatarMoeda } from "@/lib/formatar-moeda";
import {
  IMAGEM_PADRAO,
  descricaoPerfil,
  montarCompartilhamento,
  origens,
  tituloPerfil,
} from "@/lib/seo";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);
  if (!perfil) return {};

  const url = `${origens().busca}/${perfil.slug}`;
  const titulo = tituloPerfil(perfil);
  const descricao = descricaoPerfil(perfil);

  return {
    // Absoluto: o sufixo " | Encontre um psicólogo" do layout estouraria os
    // ~60 caracteres que o Google exibe, e o título já diz "Psicólogo(a)".
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: url },
    ...montarCompartilhamento({
      titulo,
      descricao,
      url,
      tipo: "profile",
      imagens: [perfil.foto_url ?? IMAGEM_PADRAO],
    }),
  };
}

export default async function PaginaPerfilPublico({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);

  if (!perfil) {
    notFound();
  }

  return (
    <article>
      {/* Faixa de cabeçalho — mesma linguagem visual da listagem de busca */}
      <section className="relative overflow-hidden bg-navy">
        <div
          className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-12 bottom-0 h-48 w-48 rounded-full bg-white/5 blur-2xl"
          aria-hidden="true"
        />

        <div className="relative max-w-3xl mx-auto px-4 pt-6 pb-8 sm:pt-8 sm:pb-10">
          <Link href="/" className="text-sm font-semibold text-white/70 hover:text-white">
            ‹ Voltar à busca
          </Link>

          <div className="mt-4 flex items-center gap-4">
            {perfil.foto_url ? (
              <img
                src={perfil.foto_url}
                alt={perfil.nome}
                className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-white/15"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white ring-4 ring-white/15">
                {iniciais(perfil.nome)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{perfil.nome}</h1>
              <p className="mt-1 text-sm text-white/75">
                {perfil.crp && `CRP ${perfil.crp} · `}
                {perfil.cidade ? `${perfil.cidade}/${perfil.estado}` : "Atendimento online"} ·{" "}
                {perfil.modalidade}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {perfil.bio && <p className="text-foreground leading-relaxed">{perfil.bio}</p>}

        {perfil.especialidades.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {perfil.especialidades.map((e) => (
              <span key={e.id} className="text-xs font-semibold text-navy bg-background rounded-full px-3 py-1">
                {e.nome}
              </span>
            ))}
          </div>
        )}

        <div className="card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="font-bold text-navy">
            {perfil.valor_sessao ? (
              <>
                {formatarMoeda(perfil.valor_sessao)} <span className="font-normal text-muted">/ sessão</span>
              </>
            ) : (
              "Valor a combinar"
            )}
          </p>
          {/* /ir/<id> registra o contato e redireciona para o WhatsApp: robô não
              deve seguir (robots.txt também bloqueia). */}
          <a href={`/ir/${perfil.id}`} rel="nofollow" className="btn-primary whitespace-nowrap">
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
