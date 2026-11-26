// Entrar, recuperar e redefinir senha não têm nada a oferecer à busca: ficam
// fora do índice por padrão (e qualquer página nova deste grupo também). O
// cadastro, que é público e feito para ser encontrado, volta a ser indexável
// na própria página. O robots.txt NÃO bloqueia estas rotas: o Google só tira
// uma página do índice se puder abri-la e ler o noindex.
export const metadata = {
  robots: { index: false },
};

export default function LayoutAuth({ children }) {
  return children;
}
