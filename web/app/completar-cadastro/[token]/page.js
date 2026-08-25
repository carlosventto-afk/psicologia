import { buscarDadosCompletarCadastro } from "@/lib/data/completar-cadastro";
import CompletarCadastroForm from "@/components/CompletarCadastroForm";

export default async function PaginaCompletarCadastro({ params }) {
  const { token } = await params;
  const dados = await buscarDadosCompletarCadastro(token);

  if (!dados) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center">
        <img src="/logo.svg" alt="PsiAgente" className="h-10 w-auto mb-6" />
        <div className="card p-8 max-w-sm space-y-2">
          <h1 className="page-title">Link inválido</h1>
          <p className="text-sm text-muted">
            Este link não é mais válido. Peça um novo ao seu profissional.
          </p>
        </div>
      </div>
    );
  }

  return <CompletarCadastroForm token={token} dados={dados} />;
}
