import "./globals.css";
import { NOME_SITE, origens } from "@/lib/seo";

export const metadata = {
  // Base dos endereços relativos de canonical, Open Graph e ícones. Blog e
  // busca redefinem em seus layouts, porque vivem em outros hosts.
  metadataBase: new URL(origens().site),
  title: "PsiAgente",
  description: "Gestão de consultório para psicólogos, com um agente que cuida da parte administrativa.",
  applicationName: NOME_SITE,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
