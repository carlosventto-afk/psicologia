// web/lib/planos.js
export const PLANOS = {
  gratis: {
    id: "gratis",
    nome: "Grátis",
    preco: 0,
    temGestao: true,
    temDiretorio: true,
    temDocumentos: false,
    temWhatsapp: false,
    temCarneLeao: false,
    limiteConsultorios: 1,
  },
  gestao: {
    id: "gestao",
    nome: "Psi Gestão",
    preco: 49.9,
    temGestao: true,
    temDiretorio: false,
    temDocumentos: true,
    temWhatsapp: true,
    temCarneLeao: true,
    limiteConsultorios: null,
  },
  gestao_marketing: {
    id: "gestao_marketing",
    nome: "Psi Gestão + Marketing",
    preco: 79.9,
    temGestao: true,
    temDiretorio: true,
    temDocumentos: true,
    temWhatsapp: true,
    temCarneLeao: true,
    limiteConsultorios: null,
  },
  marketing: {
    id: "marketing",
    nome: "Psi Marketing",
    preco: 39.9,
    temGestao: false,
    temDiretorio: true,
    temDocumentos: false,
    temWhatsapp: false,
    temCarneLeao: false,
    limiteConsultorios: null,
  },
};

export function temAcessoPago(usuario) {
  return usuario.plano !== "gratis";
}
