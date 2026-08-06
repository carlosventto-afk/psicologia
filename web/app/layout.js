import "./globals.css";

export const metadata = {
  title: "PsiAgente",
  description: "Gestão de consultório para psicólogos, com um agente que cuida da parte administrativa.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
