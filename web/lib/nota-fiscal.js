// Regras puras da NFS-e por cobrança (sem acesso a banco nem dependências).

export const MOTIVOS = {
  semDadosFiscais: "Configure seus dados fiscais em Configurações → NFS-e.",
  certificadoAusente: "Envie o certificado digital em Configurações → NFS-e.",
  certificadoVencido: "O certificado digital está vencido. Envie um novo em Configurações → NFS-e.",
  semCrp: "Cadastre seu CRP em Meus Dados.",
  semDocumentoTomador:
    "O tomador da nota (responsável financeiro ou paciente) não tem CPF/CNPJ cadastrado.",
};

const apenasDigitos = (v) => String(v ?? "").replace(/\D/g, "");

// "YYYY-MM-DD" -> "dd/mm/aaaa" sem passar por Date (evita deslocamento de fuso).
function dataBR(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function datasUnicasOrdenadas(datasISO) {
  return [...new Set(datasISO)].sort();
}

export function formatarListaDatas(datasISO) {
  const d = datasUnicasOrdenadas(datasISO).map(dataBR);
  if (d.length <= 1) return d.join("");
  return `${d.slice(0, -1).join(", ")} e ${d[d.length - 1]}`;
}

export function montarDescricaoNota({ datasISO, nomeProfissional, crp }) {
  return `Atendimento(s) psicológico(s) em ${formatarListaDatas(datasISO)}.\n\nServiço prestado por:\n${nomeProfissional}\nCRP: ${crp}`;
}

export function competenciaDaNota(datasISO) {
  if (!datasISO || datasISO.length === 0) {
    throw new Error("Lista de datas vazia: não há competência para a nota.");
  }
  return datasUnicasOrdenadas(datasISO).at(-1);
}

export function escolherTomador({ responsavel, paciente }) {
  const usaResp = Boolean(responsavel);
  const origem = usaResp ? "responsavel" : "paciente";
  const parte = usaResp ? responsavel : paciente;
  const documento = apenasDigitos(usaResp ? responsavel.cpf_cnpj : paciente?.cpf);
  if (documento.length !== 11 && documento.length !== 14) {
    return { erro: "sem_documento", origem };
  }
  return {
    nome: parte?.nome,
    documento,
    email: parte?.email ?? null,
    telefone: parte?.telefone ?? null,
    origem,
  };
}

export function validarPreCondicoes({ fiscal, usuario, tomador, hoje }) {
  const falha = (motivo) => ({ ok: false, motivo });
  if (!fiscal) return falha(MOTIVOS.semDadosFiscais);
  if (!fiscal.certificado_pfx_cifrado) return falha(MOTIVOS.certificadoAusente);
  if (fiscal.certificado_validade && fiscal.certificado_validade < hoje) {
    return falha(MOTIVOS.certificadoVencido);
  }
  if (!usuario?.crp || !String(usuario.crp).trim()) return falha(MOTIVOS.semCrp);
  if (tomador?.erro) return falha(MOTIVOS.semDocumentoTomador);
  return { ok: true };
}

export function canaisDeEntrega({
  ambiente,
  tomador,
  optInWhatsapp,
  jaEnviadoEmail,
  jaEnviadoWhatsapp,
}) {
  const producao = ambiente === "producao";
  const email =
    producao && Boolean(tomador?.email && String(tomador.email).trim()) && !jaEnviadoEmail;
  const whatsapp =
    producao &&
    apenasDigitos(tomador?.telefone).length >= 10 &&
    optInWhatsapp === true &&
    !jaEnviadoWhatsapp;
  return { email, whatsapp };
}
