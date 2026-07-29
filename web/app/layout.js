import "./globals.css";

export const metadata = {
  title: "PsiFácil",
  description: "Gestão de consultório para psicólogos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
