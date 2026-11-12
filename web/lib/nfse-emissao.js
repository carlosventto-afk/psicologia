// Serviço de emissão de NFS-e por cobrança recebida (orquestração).
//
// As regras puras (descrição, competência, tomador, pré-condições, montagem do
// payload) ficam em nota-fiscal.js. Aqui só há acesso a banco e a chamada ao
// microserviço, seguindo o fluxo de emitirNotaFiscal (actions/notas-fiscais.js).
//
// Contrato: emitirNotasDaCobranca NUNCA lança; toda falha vira o objeto de retorno.
// Uma nota só é reservada (número consumido) depois de todas as pré-condições, e
// toda nota reservada termina gravada como autorizada, rejeitada ou, no pior caso
// (falha ao gravar o resultado), continua pendente e bloqueia reemissão duplicada.

import { chamarServicoNfse } from "@/lib/nfse-client";
import { hojeSaoPaulo } from "@/lib/cobranca";
import {
  escolherTomador,
  validarPreCondicoes,
  planejarNotas,
  notasAtivas,
  contarRejeitadas,
  montarPayloadEmissao,
  montarAtualizacaoResultado,
  montarAtualizacaoFalha,
} from "@/lib/nota-fiscal";

const COLUNAS_NOTA = "id, status, cobranca, recebimento_sessao, tentativas, ultimo_erro";

const resumo = (n) => ({
  id: n.id,
  status: n.status,
  ...(n.status === "rejeitada" && n.ultimo_erro ? { erro: n.ultimo_erro } : {}),
});

// "NOTA: mensagem" (RPC) -> "mensagem"
const semPrefixo = (msg) => String(msg ?? "erro desconhecido").replace(/^NOTA:\s*/, "");

async function gravarComRetry(supabase, notaId, colunas) {
  let ultimoErro;
  for (let i = 0; i < 2; i++) {
    const { error } = await supabase.from("NotaFiscal").update(colunas).eq("id", notaId);
    if (!error) return null;
    ultimoErro = error;
  }
  return ultimoErro;
}

// Reserva o número, chama o serviço e persiste o resultado de UMA nota.
async function emitirUmaNota({ supabase, owner, cobrancaId, plano, fiscal, usuario, tomador, tentativas }) {
  const { data: registro, error: erroRegistro } = plano.recebimentoSessao
    ? await supabase.rpc("registrar_nota_fiscal_pendente", {
        p_recebimento_sessao: plano.recebimentoSessao,
        ...(owner ? { p_owner: owner } : {}),
      })
    : await supabase.rpc("registrar_nota_fiscal_cobranca_pendente", {
        p_cobranca: cobrancaId,
        ...(owner ? { p_owner: owner } : {}),
      });

  const reserva = registro?.[0];
  if (erroRegistro || !reserva) {
    return { pendencia: "Não foi possível reservar o número da nota: " + semPrefixo(erroRegistro?.message) };
  }

  const notaId = reserva.id;
  const nota = { id: notaId };

  try {
    // Snapshot do tomador: entrega e reprocessamento leem daqui.
    const { error: erroTomador } = await supabase
      .from("NotaFiscal")
      .update({
        tomador_nome: tomador.nome,
        tomador_documento: tomador.documento,
        tomador_email: tomador.email,
        tomador_telefone: tomador.telefone,
      })
      .eq("id", notaId);
    if (erroTomador) throw new Error("Falha ao gravar o tomador da nota: " + erroTomador.message);

    const payload = montarPayloadEmissao({
      reserva,
      fiscal,
      plano,
      tomador,
      nomeProfissional: usuario.nome,
      crp: usuario.crp,
    });

    let resultado;
    try {
      resultado = await chamarServicoNfse("/emitir", payload);
    } catch (erro) {
      const falha = montarAtualizacaoFalha(erro?.message ?? String(erro), tentativas);
      const erroGravar = await gravarComRetry(supabase, notaId, falha);
      if (erroGravar) {
        return { nota: { ...nota, status: "pendente", erro: "Falha ao emitir e ao gravar a rejeição: " + falha.ultimo_erro } };
      }
      return { nota: { ...nota, status: "rejeitada", erro: falha.ultimo_erro } };
    }

    const atualizacao = montarAtualizacaoResultado(resultado, tentativas);
    const erroGravar = await gravarComRetry(supabase, notaId, atualizacao);
    if (erroGravar) {
      // A nota pode já estar autorizada no governo: registra para recuperação manual
      // e deixa a linha pendente (bloqueia nova emissão para a mesma cobrança).
      console.error(
        `[nfse-emissao] resultado não gravado (nota ${notaId}, numero ${reserva.numero}, status ${atualizacao.status}, chave ${atualizacao.chave_acesso}): ${erroGravar.message}`,
      );
      return { nota: { ...nota, status: "pendente", erro: "Nota emitida, mas o resultado não pôde ser gravado: " + erroGravar.message } };
    }

    return {
      nota: {
        ...nota,
        status: atualizacao.status,
        ...(atualizacao.status === "rejeitada" ? { erro: atualizacao.ultimo_erro } : {}),
      },
    };
  } catch (erro) {
    // Exceção inesperada depois da reserva: nunca deixa a nota pendente sem tentativa de fechar.
    const falha = montarAtualizacaoFalha(erro?.message ?? String(erro), tentativas);
    const erroGravar = await gravarComRetry(supabase, notaId, falha).catch((e) => e);
    return {
      nota: { ...nota, status: erroGravar ? "pendente" : "rejeitada", erro: falha.ultimo_erro },
    };
  }
}

export async function emitirNotasDaCobranca(supabase, cobrancaId, { owner } = {}) {
  try {
    const { data: cobranca, error: erroCobranca } = await supabase
      .from("Cobranca")
      .select("id, owner, situacao, tipo_documento, emissao_por, recebimento, paciente, responsavel_financeiro")
      .eq("id", cobrancaId)
      .maybeSingle();

    if (erroCobranca || !cobranca) return { notas: [], pendencia: "Cobrança não encontrada." };
    if (owner && cobranca.owner !== owner) {
      return { notas: [], pendencia: "Cobrança não pertence ao profissional informado." };
    }
    if (cobranca.situacao !== "recebida" || !cobranca.recebimento) {
      return { notas: [], pendencia: "A cobrança precisa estar recebida para emitir a nota." };
    }
    if (cobranca.tipo_documento !== "nota_fiscal") {
      return { notas: [], pendencia: "A cobrança não é do tipo nota fiscal." };
    }

    const emissaoPor = cobranca.emissao_por === "sessao" ? "sessao" : "cobranca";

    // Rateio do recebimento, com a data de cada sessão.
    const { data: linhas, error: erroRateio } = await supabase
      .from("RecebimentoSessao")
      .select("id, valor_aplicado, Sessao(data)")
      .eq("recebimento", cobranca.recebimento)
      .order("id");
    if (erroRateio) return { notas: [], pendencia: "Não foi possível carregar o recebimento: " + erroRateio.message };

    const rateios = (linhas ?? []).map((l) => ({
      id: l.id,
      valor_aplicado: l.valor_aplicado,
      data: l.Sessao?.data ?? null,
    }));

    // Notas existentes (idempotência e contagem de tentativas).
    let consultaNotas = supabase.from("NotaFiscal").select(COLUNAS_NOTA).order("id");
    if (emissaoPor === "sessao") {
      if (rateios.length === 0) return { notas: [], pendencia: "Recebimento sem sessões aplicadas." };
      consultaNotas = consultaNotas.in("recebimento_sessao", rateios.map((r) => r.id));
    } else {
      consultaNotas = consultaNotas.eq("cobranca", cobranca.id);
    }
    const { data: existentes, error: erroNotas } = await consultaNotas;
    if (erroNotas) return { notas: [], pendencia: "Não foi possível consultar as notas existentes: " + erroNotas.message };

    const ativas = notasAtivas(existentes);

    let plano;
    try {
      plano = planejarNotas({ emissaoPor, rateios });
    } catch (erro) {
      // Se já há nota ativa, devolve-a mesmo que o plano não monte mais.
      if (ativas.length > 0) return { notas: ativas.map(resumo) };
      return { notas: [], pendencia: erro.message };
    }

    // Itens ainda sem nota ativa.
    const pendentesDeEmissao = plano.filter((p) =>
      emissaoPor === "sessao"
        ? !ativas.some((n) => n.recebimento_sessao === p.recebimentoSessao)
        : ativas.length === 0,
    );
    if (pendentesDeEmissao.length === 0) return { notas: ativas.map(resumo) };

    // Pré-condições ANTES de reservar qualquer número.
    const donoId = cobranca.owner;
    const [fiscalRes, usuarioRes, respRes, pacRes] = await Promise.all([
      supabase.from("DadosFiscaisProfissional").select("*").eq("owner", donoId).maybeSingle(),
      supabase.from("Usuarios").select("nome, crp").eq("id_user", donoId).maybeSingle(),
      supabase
        .from("ResponsavelFinanceiro")
        .select("nome, cpf_cnpj, email, telefone")
        .eq("id", cobranca.responsavel_financeiro)
        .maybeSingle(),
      supabase.from("Paciente").select("nome, cpf, email, telefone").eq("id", cobranca.paciente).maybeSingle(),
    ]);
    for (const r of [fiscalRes, usuarioRes, respRes, pacRes]) {
      if (r.error) return { notas: ativas.map(resumo), pendencia: "Não foi possível carregar os dados da nota: " + r.error.message };
    }

    const fiscal = fiscalRes.data;
    const usuario = usuarioRes.data;
    const tomador = escolherTomador({ responsavel: respRes.data, paciente: pacRes.data });

    const pre = validarPreCondicoes({ fiscal, usuario, tomador, hoje: hojeSaoPaulo() });
    if (!pre.ok) return { notas: ativas.map(resumo), pendencia: pre.motivo };
    if (!String(usuario.nome ?? "").trim() || !String(tomador.nome ?? "").trim()) {
      return { notas: ativas.map(resumo), pendencia: "Faltam o nome do profissional ou do tomador para montar a nota." };
    }

    const notas = ativas.map(resumo);
    let pendencia;
    for (const item of pendentesDeEmissao) {
      const rejeitadasAntes = contarRejeitadas(
        (existentes ?? []).filter((n) =>
          emissaoPor === "sessao" ? n.recebimento_sessao === item.recebimentoSessao : true,
        ),
      );
      let r;
      try {
        r = await emitirUmaNota({
          supabase,
          owner,
          cobrancaId: cobranca.id,
          plano: item,
          fiscal,
          usuario,
          tomador,
          tentativas: rejeitadasAntes + 1,
        });
      } catch (erro) {
        // Só pode ocorrer antes da reserva (rede na RPC); preserva as notas já emitidas.
        r = { pendencia: "Erro inesperado ao reservar a nota: " + (erro?.message ?? String(erro)) };
      }
      if (r.nota) notas.push(r.nota);
      if (r.pendencia) pendencia = pendencia ? `${pendencia} ${r.pendencia}` : r.pendencia;
    }

    return { notas, ...(pendencia ? { pendencia } : {}) };
  } catch (erro) {
    return { notas: [], pendencia: "Erro inesperado ao emitir a nota: " + (erro?.message ?? String(erro)) };
  }
}
