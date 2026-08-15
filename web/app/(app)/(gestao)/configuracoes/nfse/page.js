import DadosFiscaisForm from "@/components/DadosFiscaisForm";
import CertificadoForm from "@/components/CertificadoForm";
import { salvarDadosFiscais, enviarCertificado } from "@/lib/actions/dados-fiscais";
import { buscarDadosFiscais } from "@/lib/data/dados-fiscais";

export default async function PaginaNfseConfig() {
  const dadosFiscais = await buscarDadosFiscais();

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dados de Emissão de NFS-e</h1>

      {dadosFiscais?.certificado_validade &&
        new Date(dadosFiscais.certificado_validade) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
            Certificado digital vence em {dadosFiscais.certificado_validade} — providencie a renovação.
          </p>
        )}

      <DadosFiscaisForm action={salvarDadosFiscais} dadosFiscais={dadosFiscais} />
      <CertificadoForm action={enviarCertificado} dadosFiscais={dadosFiscais} />
    </div>
  );
}
