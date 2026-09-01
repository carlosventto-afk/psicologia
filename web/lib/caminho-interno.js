export function caminhoInterno(valor) {
  return typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//") ? valor : "/";
}
