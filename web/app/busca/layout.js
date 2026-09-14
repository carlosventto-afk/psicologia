export const metadata = {
  title: {
    default: "Encontre um psicólogo | PsiAgente",
    template: "%s | Encontre um psicólogo",
  },
  description: "Encontre psicólogos por especialidade, cidade e modalidade de atendimento.",
};

export default function LayoutBusca({ children }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <a href="/">
            <img src="/logo.svg" alt="PsiAgente" className="h-8 w-auto" />
          </a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
