export function formatarNomePaciente(nome, apelido) {
  return apelido ? `${nome} (${apelido})` : nome;
}
