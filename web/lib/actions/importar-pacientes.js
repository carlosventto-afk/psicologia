"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Chamadas diretamente do client component (não são <form action>): o
// wizard manda um array de linhas já mapeadas e precisa de volta um
// relatório rico, não o par {error}/{mensagem} usado pelos formulários
// com useActionState.

function normalizarNome(nome) {
  return (nome ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parsearData(texto) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((texto ?? "").trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function parsearValor(texto) {
  const limpo = (texto ?? "").trim().replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero;
}

function parsearRecibo(texto) {
  const normalizado = (texto ?? "").trim().toLowerCase();
  return ["sim", "yes", "true", "1"].includes(normalizado);
}

export async function importarPacientes(consultorioId, linhas) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Não autorizado." };
  }

  const { data: existentes, error: erroExistentes } = await supabase
    .from("Paciente")
    .select("nome")
    .eq("owner", user.id);
  if (erroExistentes) {
    return { error: "Não foi possível verificar pacientes já cadastrados." };
  }

  const nomesExistentes = new Set(existentes.map((p) => normalizarNome(p.nome)));
  const nomesNestaImportacao = new Set();

  const candidatos = [];
  const relatorio = {
    totalLinhas: linhas.length,
    importados: 0,
    idsInseridos: [],
    puladosSemNome: 0,
    puladosDuplicados: [],
    avisos: [],
  };

  for (const linha of linhas) {
    const nome = (linha.nome ?? "").trim();
    const numeroLinha = linha.numeroLinha;

    if (!nome) {
      relatorio.puladosSemNome += 1;
      continue;
    }

    const nomeNormalizado = normalizarNome(nome);
    if (nomesExistentes.has(nomeNormalizado) || nomesNestaImportacao.has(nomeNormalizado)) {
      relatorio.puladosDuplicados.push({ linha: numeroLinha, nome });
      continue;
    }
    nomesNestaImportacao.add(nomeNormalizado);

    const dataNascimento = parsearData(linha.data_nascimento);
    if (linha.data_nascimento && !dataNascimento) {
      relatorio.avisos.push({
        linha: numeroLinha,
        nome,
        campo: "Data de Nascimento",
        motivo: "formato inválido, campo deixado em branco",
      });
    }

    const valorSessao = parsearValor(linha.valor_sessao);
    if (linha.valor_sessao && valorSessao === null) {
      relatorio.avisos.push({
        linha: numeroLinha,
        nome,
        campo: "Valor da Sessão",
        motivo: "formato inválido, campo deixado em branco",
      });
    }

    const rgDataExpedicao = parsearData(linha.rg_data_expedicao);
    if (linha.rg_data_expedicao && !rgDataExpedicao) {
      relatorio.avisos.push({
        linha: numeroLinha,
        nome,
        campo: "Data de Expedição (RG)",
        motivo: "formato inválido, campo deixado em branco",
      });
    }

    candidatos.push({
      nome,
      data_nascimento: dataNascimento,
      telefone: (linha.telefone ?? "").trim() || null,
      email: (linha.email ?? "").trim() || null,
      endereco: (linha.endereco ?? "").trim() || null,
      valor_sessao: valorSessao,
      observacoes: (linha.observacoes ?? "").trim() || null,
      precisa_recibo: parsearRecibo(linha.precisa_recibo),
      cpf: (linha.cpf ?? "").trim() || null,
      rg_numero: (linha.rg_numero ?? "").trim() || null,
      rg_data_expedicao: rgDataExpedicao,
      rg_orgao_emissor: (linha.rg_orgao_emissor ?? "").trim() || null,
      consultorio: consultorioId,
      pacote: null,
    });
  }

  if (candidatos.length > 0) {
    const { data: inseridos, error } = await supabase.from("Paciente").insert(candidatos).select("id");
    if (error) {
      return { error: "Não foi possível importar os pacientes." };
    }
    relatorio.importados = inseridos.length;
    relatorio.idsInseridos = inseridos.map((p) => Number(p.id));
  }

  revalidatePath("/pacientes");
  return relatorio;
}

export async function desfazerImportacao(ids) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Não autorizado." };
  }

  const { error } = await supabase.from("Paciente").delete().in("id", ids).eq("owner", user.id);
  if (error) {
    return { error: "Não foi possível desfazer a importação." };
  }

  revalidatePath("/pacientes");
  return { error: null };
}
