import DadosFiscaisForm from "@/components/DadosFiscaisForm";
import { salvarDadosFiscais } from "@/lib/actions/dados-fiscais";
import { buscarDadosFiscais } from "@/lib/data/dados-fiscais";

export default async function PaginaNfseConfig() {
  const dadosFiscais = await buscarDadosFiscais();

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dados de Emissão de NFS-e</h1>
      <DadosFiscaisForm action={salvarDadosFiscais} dadosFiscais={dadosFiscais} />
    </div>
  );
}
