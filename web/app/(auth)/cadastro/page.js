import CadastroForm from "@/components/CadastroForm";

export default async function PaginaCadastro({ searchParams }) {
  const params = await searchParams;
  const origem = ["busca", "comparativo"].includes(params.origem) ? params.origem : null;

  return <CadastroForm origem={origem} />;
}
