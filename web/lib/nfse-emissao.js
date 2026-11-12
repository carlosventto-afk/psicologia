// Serviço de emissão de NFS-e por cobrança recebida (orquestração).
//
// As regras puras (descrição, competência, tomador, pré-condições, classificação
// do resultado, montagem do payload) ficam em nota-fiscal.js. Aqui só há acesso a
// banco e a chamada ao microserviço, seguindo o fluxo de emitirNotaFiscal
// (actions/notas-fiscais.js).
//
// Contrato: emitirNotasDaCobranca NUNCA lança; toda falha vira o objeto de retorno.
// Uma nota só é reservada (número consumido) depois de todas as pré-condições.
// Depois da chamada ao serviço o resultado pode ser INCERTO (timeout/5xx: a SEFIN
// pode ter autorizado): a nota fica `pendente`, nunca `rejeitada`, e nenhum número
// novo é reservado para ela. Só recusa definitiva vira `rejeitada`.

import { chamarServicoNfse } from "@/lib/nfse-client";
import { hojeSaoPaulo } from "@/lib/cobranca";
import {
  escolherTomador,
  validarPreCondicoes,
  validarCompetencias,
  responsavelParaTomador,
  planejarNotas,
  notasAtivas,
  itensSemNotaAtiva,
  tentativasDoItem,
  classificarResultadoEmissao,
  montarPayloadEmissao,
  montarAtualizacaoResultado,
  montarAtualizacaoFalha,
  montarAtualizacaoIncerta,
} from "@/lib/nota-fiscal";

const RESULTADO_INCERTO_GENERICO =
  "Resultado incerto; confirme no portal da NFS-e antes de emitir de novo.";

const COLUNAS_NOTA = "id, status, cobranca, recebimento_sessao, tentativas, ultimo_erro";

const resumo = (n) => ({
  id: n.id,
  status: n.status,
  ...(n.status !== "autorizada" && n.ultimo_erro ? { erro: n.ultimo_erro } : {}),
});

// "NOTA: mensagem" (RPC) -> "mensagem"
const semPrefixo = (msg) => String(msg ?? "erro desconhecido").replace(/^NOTA:\s*/, "");

// Update que não casa nenhuma linha (ex.: RLS) conta como falha.
async function gravarComRetry(supabase, notaId, colunas) {
  let ultimoErro;
  for (let i = 0; i < 2; i++) {
    const { data, error } = await supabase.from("NotaFiscal").update(colunas).eq("id", notaId).select("id");
    if (!error && Array.isArray(data) && data.length > 0) return null;
    ultimoErro = error ?? new Error("nenhuma linha atualizada");
  }
  return ultimoErro;
}

async function buscarNotas(supabase, { emissaoPor, cobrancaId, rateioIds }) {
  let consulta = supabase.from("NotaFiscal").select(COLUNAS_NOTA).order("id");
  consulta =
    emissaoPor === "sessao"
      ? consulta.in("recebimento_sessao", rateioIds)
      : consulta.eq("cobranca", cobrancaId);
  return consulta;
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
    const msg = semPrefixo(erroRegistro?.message);
    return {
      pendencia: "Não foi possível reservar o número da nota: " + msg,
      // Duplo clique / concorrência: outra chamada já reservou a nota.
      jaAtiva: /já tem nota fiscal pendente ou autorizada/i.test(msg),
    };
  }

  const notaId = reserva.id;
  const nota = { id: notaId };
  let serviceChamado = false;

  // Resultado incerto: mantém pendente (nunca rejeitada, nunca número novo).
  const fecharIncerta = async (entrada) => {
    try {
      const colunas = montarAtualizacaoIncerta(entrada, tentativas);
      const erroGravar = await gravarComRetry(supabase, notaId, colunas).catch((e) => e);
      if (erroGravar) {
        console.error(
          `[nfse-emissao] resultado incerto não gravado (nota ${notaId}, numero ${reserva.numero}): ${erroGravar.message}`,
        );
      }
      return { nota: { ...nota, status: "pendente", erro: colunas.ultimo_erro } };
    } catch (erro) {
      console.error(`[nfse-emissao] falha ao fechar resultado incerto (nota ${notaId}, numero ${reserva.numero}): ${erro?.message}`);
      return { nota: { ...nota, status: "pendente", erro: RESULTADO_INCERTO_GENERICO } };
    }
  };

  try {
    // Snapshot do tomador: entrega e reprocessamento leem daqui.
    const { data: gravado, error: erroTomador } = await supabase
      .from("NotaFiscal")
      .update({
        tomador_nome: tomador.nome,
        tomador_documento: tomador.documento,
        tomador_email: tomador.email,
        tomador_telefone: tomador.telefone,
      })
      .eq("id", notaId)
      .select("id");
    if (erroTomador || !gravado?.length) {
      throw new Error("Falha ao gravar o tomador da nota: " + (erroTomador?.message ?? "nenhuma linha atualizada"));
    }

    const payload = montarPayloadEmissao({
      reserva,
      fiscal,
      plano,
      tomador,
      nomeProfissional: usuario.nome,
      crp: usuario.crp,
    });

    serviceChamado = true;
    let resposta;
    try {
      resposta = await chamarServicoNfse("/emitir", payload);
    } catch (erro) {
      if (classificarResultadoEmissao({ erro }) === "incerta") return await fecharIncerta({ erro });
      const falha = montarAtualizacaoFalha(erro?.message ?? String(erro), tentativas);
      const erroGravar = await gravarComRetry(supabase, notaId, falha).catch((e) => e);
      if (erroGravar) {
        console.error(`[nfse-emissao] rejeição não gravada (nota ${notaId}): ${erroGravar.message}`);
        return { nota: { ...nota, status: "pendente", erro: falha.ultimo_erro } };
      }
      return { nota: { ...nota, status: "rejeitada", erro: falha.ultimo_erro } };
    }

    const classe = classificarResultadoEmissao({ resposta });
    if (classe === "incerta") return await fecharIncerta({ resposta });

    const atualizacao = montarAtualizacaoResultado(resposta, tentativas);
    const erroGravar = await gravarComRetry(supabase, notaId, atualizacao).catch((e) => e);
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
    // Exceção depois da chamada ao serviço: resultado incerto, nota fica pendente.
    if (serviceChamado) return await fecharIncerta({ erro });
    // Antes da chamada nada foi enviado: recusa segura.
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
    if (rateios.length === 0) return { notas: [], pendencia: "Recebimento sem sessões aplicadas." };
    const rateioIds = rateios.map((r) => r.id);

    // Notas existentes (idempotência e contagem de tentativas).
    const { data: existentes, error: erroNotas } = await buscarNotas(supabase, {
      emissaoPor,
      cobrancaId: cobranca.id,
      rateioIds,
    });
    if (erroNotas) return { notas: [], pendencia: "Não foi possível consultar as notas existentes: " + erroNotas.message };

    // Pendente (inclusive resultado incerto) conta como ativa: nunca reserva número novo.
    const ativas = notasAtivas(existentes);

    let plano;
    try {
      plano = planejarNotas({ emissaoPor, rateios });
    } catch (erro) {
      if (ativas.length > 0) return { notas: ativas.map(resumo) };
      return { notas: [], pendencia: erro.message };
    }

    const pendentesDeEmissao = itensSemNotaAtiva({ emissaoPor, plano, ativas });
    if (pendentesDeEmissao.length === 0) return { notas: ativas.map(resumo) };

    // Configuração ausente nunca pode queimar números de DPS.
    if (!process.env.NFSE_SERVICE_URL || !process.env.NFSE_SERVICE_SECRET) {
      return { notas: ativas.map(resumo), pendencia: "Serviço de NFS-e não configurado." };
    }

    // Pré-condições ANTES de reservar qualquer número.
    const comp = validarCompetencias({ planos: pendentesDeEmissao, hoje: hojeSaoPaulo() });
    if (!comp.ok) return { notas: ativas.map(resumo), pendencia: comp.motivo };

    const donoId = cobranca.owner;
    const [fiscalRes, usuarioRes, respRes, pacRes] = await Promise.all([
      supabase.from("DadosFiscaisProfissional").select("*").eq("owner", donoId).maybeSingle(),
      supabase.from("Usuarios").select("nome, crp").eq("id_user", donoId).maybeSingle(),
      supabase
        .from("ResponsavelFinanceiro")
        .select("nome, cpf_cnpj, email, telefone, paciente_vinculado")
        .eq("id", cobranca.responsavel_financeiro)
        .maybeSingle(),
      supabase.from("Paciente").select("nome, cpf, email, telefone").eq("id", cobranca.paciente).maybeSingle(),
    ]);
    for (const r of [fiscalRes, usuarioRes, respRes, pacRes]) {
      if (r.error) return { notas: ativas.map(resumo), pendencia: "Não foi possível carregar os dados da nota: " + r.error.message };
    }

    const fiscal = fiscalRes.data;
    const usuario = usuarioRes.data;
    const tomador = escolherTomador({
      responsavel: responsavelParaTomador({ responsavel: respRes.data, pacienteId: cobranca.paciente }),
      paciente: pacRes.data,
    });

    const pre = validarPreCondicoes({ fiscal, usuario, tomador, hoje: hojeSaoPaulo() });
    if (!pre.ok) return { notas: ativas.map(resumo), pendencia: pre.motivo };
    if (!String(usuario.nome ?? "").trim() || !String(tomador.nome ?? "").trim()) {
      return { notas: ativas.map(resumo), pendencia: "Faltam o nome do profissional ou do tomador para montar a nota." };
    }

    const notas = ativas.map(resumo);
    let pendencia;
    for (const item of pendentesDeEmissao) {
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
          tentativas: tentativasDoItem({
            emissaoPor,
            recebimentoSessao: item.recebimentoSessao,
            existentes,
          }),
        });
      } catch (erro) {
        // Só pode ocorrer antes da reserva (rede na RPC); preserva as notas já emitidas.
        r = { pendencia: "Erro inesperado ao reservar a nota: " + (erro?.message ?? String(erro)) };
      }
      if (r.nota) notas.push(r.nota);
      if (r.jaAtiva) {
        // Outra chamada reservou a nota no meio: devolve a(s) nota(s) ativa(s) atual(is).
        const { data: atuais, error: erroAtuais } = await buscarNotas(supabase, {
          emissaoPor,
          cobrancaId: cobranca.id,
          rateioIds,
        });
        const ativasAgora = erroAtuais ? [] : notasAtivas(atuais);
        for (const n of ativasAgora) {
          if (!notas.some((x) => x.id === n.id)) notas.push(resumo(n));
        }
        if (ativasAgora.length === 0) {
          const aviso = "A nota já está sendo emitida; recarregue a página para ver o resultado.";
          pendencia = pendencia ? `${pendencia} ${aviso}` : aviso;
        }
      } else if (r.pendencia) {
        pendencia = pendencia ? `${pendencia} ${r.pendencia}` : r.pendencia;
      }
    }

    return { notas, ...(pendencia ? { pendencia } : {}) };
  } catch (erro) {
    return { notas: [], pendencia: "Erro inesperado ao emitir a nota: " + (erro?.message ?? String(erro)) };
  }
}
