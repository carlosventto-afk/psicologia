import { notFound } from "next/navigation";
import { buscarPerfilPorSlug } from "@/lib/data/diretorio";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);
  if (!perfil) return {};

  return {
    title: perfil.nome,
    description: perfil.bio ?? undefined,
  };
}

export default async function PaginaPerfilPublico({ params }) {
  const { slug } = await params;
  const perfil = await buscarPerfilPorSlug(slug);

  if (!perfil) {
    notFound();
  }

  return (
    <article className="space-y-4">
      <div className="flex items-center gap-4">
        {perfil.foto_url && (
          <img
            src={perfil.foto_url}
            alt={perfil.nome}
            className="h-20 w-20 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="page-title">{perfil.nome}</h1>
          <p className="text-sm text-muted">
            {perfil.crp && `CRP ${perfil.crp} · `}
            {perfil.cidade ? `${perfil.cidade}/${perfil.estado}` : "Atendimento online"} ·{" "}
            {perfil.modalidade}
          </p>
        </div>
      </div>

      {perfil.bio && <p className="text-navy">{perfil.bio}</p>}

      {perfil.especialidades.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {perfil.especialidades.map((e) => (
            <span key={e.id} className="text-xs font-semibold text-navy bg-background rounded-full px-3 py-1">
              {e.nome}
            </span>
          ))}
        </div>
      )}

      <p className="font-semibold text-navy">
        {perfil.valor_sessao ? `A partir de R$ ${perfil.valor_sessao}` : "Valor a combinar"}
      </p>

      <a href={`/ir/${perfil.id}`} className="btn-primary inline-flex">
        Falar no WhatsApp
      </a>
    </article>
  );
}
