import { serializarJsonLd } from "@/lib/seo";

// Dados estruturados (schema.org) em <script type="application/ld+json">.
// O objeto vem de lib/seo.js (testado) e passa por serializarJsonLd, que
// escapa o "<" — sem isso um título com "</script>" fecharia a tag antes da
// hora. Aceita null (nada a descrever) e então não renderiza nada.
export default function JsonLd({ dados }) {
  if (!dados) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(dados) }} />;
}
