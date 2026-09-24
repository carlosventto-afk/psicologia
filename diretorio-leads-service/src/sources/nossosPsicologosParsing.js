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

  return {
    fonte: "nossos_psicologos",
    slug,
    nome: professional.name,
    crp,
    especialidade: schema.specialty_name ?? professional.occupation ?? null,
    cidade: schema.city ?? null,
    telefone: clinic.telephone ?? null,
    endereco: enderecoParts.length > 0 ? enderecoParts.join(", ") : null,
    url,
  };
}

export function filterRjLead(lead) {
  if (!lead) return null;
  return isRjCity(lead.cidade) ? lead : null;
}
