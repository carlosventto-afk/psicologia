export const metadata = {
  title: "Termos de Uso do Diretório | PsiAgente",
  description: "Termos de uso do diretório público de psicólogos do PsiAgente.",
};

export default function PaginaTermos() {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <a href="/">
          <img src="/logo.svg" alt="PsiAgente" className="h-8 w-auto mb-8" />
        </a>

        <div className="card p-8 space-y-4">
          <h1 className="page-title">Termos de Uso do Diretório PsiAgente</h1>
          <p className="text-navy">
            Ao ativar seu perfil no diretório público
            (busca.psiagente.com.br), você concorda com o seguinte:
          </p>
          <ol className="list-decimal list-inside space-y-3 text-navy">
            <li>
              O serviço é gratuito por enquanto. Podemos no futuro passar a
              cobrar pela manutenção do diretório, com aviso prévio
              razoável.
            </li>
            <li>
              Estes termos podem ser alterados a qualquer momento — a
              versão vigente é sempre a publicada nesta página.
            </li>
            <li>
              Você é responsável pela veracidade das informações do seu
              perfil (nome, CRP, especialidades, valores, contato).
            </li>
            <li>
              O contato entre paciente e profissional acontece diretamente
              pelo WhatsApp informado — o PsiAgente não intermedeia nem se
              responsabiliza pelo atendimento, agendamento ou cobrança
              feitos fora da plataforma.
            </li>
            <li>
              Podemos remover ou ocultar perfis com informação falsa,
              ofensiva ou que violem estes termos.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
