import { slugify } from "../parsing.js";

export function extractSlugFromSitemapUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  if (parts[0] !== "profissional" || !parts[1]) return null;
  return parts[1];
}

export function isRjCity(citySlug) {
  return typeof citySlug === "string" && citySlug.endsWith("-rj");
}

// Construção campo a campo (allowlist), nunca spread do objeto bruto: mesmo
// que a API inclua CPF ou outro dado novo no payload, esta função só copia
// os campos explicitamente listados abaixo. `data_online.professional_profile_cpf`
// é deliberadamente nunca lido (ver spec, "Não são objetivos").
export function mapResponseToLead(apiResponse, slug, url) {
  const professional = apiResponse?.data?.message?.professional;
  if (!professional || !professional.name) return null;

  const council = professional.council ?? {};
  const crp = council.number ? `${council.number}${council.state ? `-${council.state}` : ""}` : null;

  const schema = professional.schema ?? {};
  const clinic = professional.clinic ?? {};
  const address = clinic.address ?? {};
  const enderecoParts = [
    address.street, address.number, address.complement,
    address.neighborhood, address.city, address.state,
  ].filter(Boolean);

  // A API real não tem `professional.schema` (campo assumido nos fixtures
  // originais mas ausente no payload de verdade — confirmado inspecionando
  // a resposta real em 24/09/2026: o payload traz `clinic.address.city`/
  // `state`, não `schema.city`). Sem esse fix, `cidade` era sempre `null` e
  // `filterRjLead` descartava 100% dos leads, mesmo os do RJ.
  const cidade = address.city ? slugify(`${address.city}-${address.state ?? ""}`) : null;

  return {
    fonte: "nossos_psicologos",
    slug,
    nome: professional.name,
    crp,
    especialidade: schema.specialty_name ?? professional.occupation ?? null,
    cidade,
    telefone: clinic.telephone ?? null,
    endereco: enderecoParts.length > 0 ? enderecoParts.join(", ") : null,
    url,
  };
}

export function filterRjLead(lead) {
  if (!lead) return null;
  return isRjCity(lead.cidade) ? lead : null;
}
