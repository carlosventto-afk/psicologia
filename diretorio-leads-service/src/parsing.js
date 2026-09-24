export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Os 92 municípios do Rio de Janeiro (fonte: IBGE). Usado pra restringir a
// coleta a RJ nesta entrega (ver spec, "Não são objetivos: cobertura
// nacional").
export const RJ_MUNICIPIOS = [
  "Angra dos Reis", "Aperibé", "Araruama", "Areal", "Armação dos Búzios",
  "Arraial do Cabo", "Barra do Piraí", "Barra Mansa", "Belford Roxo",
  "Bom Jardim", "Bom Jesus do Itabapoana", "Cabo Frio", "Cachoeiras de Macacu",
  "Cambuci", "Campos dos Goytacazes", "Cantagalo", "Carapebus",
  "Cardoso Moreira", "Carmo", "Casimiro de Abreu",
  "Comendador Levy Gasparian", "Conceição de Macabu", "Cordeiro",
  "Duas Barras", "Duque de Caxias", "Engenheiro Paulo de Frontin",
  "Guapimirim", "Iguaba Grande", "Itaboraí", "Itaguaí", "Italva", "Itaocara",
  "Itaperuna", "Itatiaia", "Japeri", "Laje do Muriaé", "Macaé", "Macuco",
  "Magé", "Mangaratiba", "Maricá", "Mendes", "Mesquita", "Miguel Pereira",
  "Miracema", "Natividade", "Nilópolis", "Niterói", "Nova Friburgo",
  "Nova Iguaçu", "Paracambi", "Paraíba do Sul", "Paraty",
  "Paty do Alferes", "Petrópolis", "Pinheiral", "Piraí", "Porciúncula",
  "Porto Real", "Quatis", "Queimados", "Quissamã", "Resende", "Rio Bonito",
  "Rio Claro", "Rio das Flores", "Rio das Ostras", "Rio de Janeiro",
  "Santa Maria Madalena", "Santo Antônio de Pádua", "São Fidélis",
  "São Francisco de Itabapoana", "São Gonçalo", "São João da Barra",
  "São João de Meriti", "São José de Ubá", "São José do Vale do Rio Preto",
  "São Pedro da Aldeia", "São Sebastião do Alto", "Sapucaia", "Saquarema",
  "Seropédica", "Silva Jardim", "Sumidouro", "Tanguá", "Teresópolis",
  "Trajano de Morais", "Três Rios", "Valença", "Varre-Sai", "Vassouras",
  "Volta Redonda",
];

// Doctoralia usa o sufixo "-2" no slug de Paraty porque colide com o nome de
// outra cidade/registro em outro estado (confirmado inspecionando
// sitemap.city.xml em 24/09/2026: "paraty" sozinho não aparece, "paraty-2"
// sim). Alias documentado aqui em vez de assumido — outras colisões
// eventuais em municípios menores não são cobertas nesta entrega (risco
// aceito, ver spec).
const EXTRA_DOCTORALIA_SLUG_ALIASES = ["paraty-2"];

export function buildRjCitySlugSet() {
  const set = new Set(RJ_MUNICIPIOS.map(slugify));
  for (const alias of EXTRA_DOCTORALIA_SLUG_ALIASES) set.add(alias);
  return set;
}

export function parseSitemapLocs(xml) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return [...new Set(urls)];
}
