import CadastroForm from "@/components/CadastroForm";

export default async function PaginaCadastro({ searchParams }) {
  const params = await searchParams;
  const origem = params.origem === "busca" ? "busca" : null;

  return <CadastroForm origem={origem} />;
}
