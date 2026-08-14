import { createAdminClient } from "@/lib/supabase/admin";
import { listarPagamentosElegiveis } from "@/lib/data/carne-leao";
import { agruparEmLinhas, montarArquivoTxt, cpfValido } from "@/lib/carne-leao-txt";
import { estaNaData, periodoParaEnvio } from "@/lib/carne-leao-automacao";
import { hojeISO } from "@/lib/periodo-agenda";

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.CARNE_LEAO_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  // hojeISO() calcula "hoje" em UTC (mesma convenção do resto do app,
  // ver web/lib/periodo-agenda.js) — o n8n precisa disparar esse endpoint
  // de manhã (horário de Brasília), nunca perto da meia-noite UTC (21h em
  // Brasília), senão "hoje" pode virar o dia seguinte por engano perto de
  // viradas de mês.
  const hoje = hojeISO();

  const { data: usuarios, error } = await admin
    .from("Usuarios")
    .select("id, id_user, cpf, crp, carne_leao_frequencia, carne_leao_email, carne_leao_ultimo_envio")
    .not("carne_leao_frequencia", "is", null);

  if (error) {
    return new Response("Erro ao buscar profissionais configurados.", { status: 500 });
  }

  const enviar = [];

  for (const usuario of usuarios) {
    try {
      if (!estaNaData(usuario.carne_leao_frequencia, usuario.carne_leao_ultimo_envio, hoje)) continue;

      if (!cpfValido(usuario.cpf)) {
        await admin.from("EnvioAutomaticoCarneLeao").insert({
          usuario: usuario.id,
          sucesso: false,
          mensagem_erro: "CPF do profissional não cadastrado ou inválido.",
          quantidade_linhas: 0,
        });
        continue;
      }

      const { inicio: dataInicio, fim: dataFim } = periodoParaEnvio(
        usuario.carne_leao_frequencia,
        usuario.carne_leao_ultimo_envio,
        hoje
      );

      // Mensal sempre cobre o mês anterior inteiro (periodoParaEnvio
      // ignora carne_leao_ultimo_envio pra essa frequência) — por isso o
      // valor gravado aqui precisa ser "hoje" (quando o envio aconteceu),
      // não "dataFim" (que seria sempre o mês passado, deixando
      // estaNaData permanentemente "no mês errado" e reenviando todo dia
      // pelo resto do mês). Semanal/quinzenal continuam gravando dataFim,
      // que é o dado real que o delta do próximo ciclo precisa.
      const proximoUltimoEnvio = usuario.carne_leao_frequencia === "mensal" ? hoje : dataFim;

      const { elegiveis } = await listarPagamentosElegiveis(
        { dataInicio, dataFim },
        { supabase: admin, ownerId: usuario.id_user }
      );

      if (elegiveis.length === 0) {
        if (dataFim < hoje) {
          // Janela PERMANENTEMENTE FECHADA: o período terminou num mês já
          // encerrado, então nunca mais vai ganhar pagamento novo (semanal
          // e quinzenal batem nisso em toda virada de mês, com a sobra de
          // 1 a 6 dias do mês anterior). Se não avançássemos
          // carne_leao_ultimo_envio aqui, o próximo ciclo recalcularia
          // exatamente a mesma janela vazia, pra sempre — a automação do
          // profissional pararia em silêncio, sem e-mail, sem erro e sem
          // linha de auditoria. Avança o marcador, mas sem e-mail e sem
          // linha de sucesso: não houve envio de verdade, só um período
          // vazio que ficou pra trás.
          const { error: erroUpdateVazio } = await admin
            .from("Usuarios")
            .update({ carne_leao_ultimo_envio: proximoUltimoEnvio })
            .eq("id", usuario.id);

          if (erroUpdateVazio) {
            await admin.from("EnvioAutomaticoCarneLeao").insert({
              usuario: usuario.id,
              sucesso: false,
              mensagem_erro: `Período sem pagamentos elegíveis, mas falha ao avançar carne_leao_ultimo_envio: ${erroUpdateVazio.message}`,
              quantidade_linhas: 0,
            });
          }
        }
        // Janela ainda ABERTA (dataFim === hoje): pode ganhar pagamento
        // novo até o próximo ciclo, então não conta como enviado, não
        // avança carne_leao_ultimo_envio nem gera e-mail vazio.
        continue;
      }

      const linhas = agruparEmLinhas(elegiveis);
      const conteudo = montarArquivoTxt(linhas, usuario);

      let email = usuario.carne_leao_email;
      if (!email) {
        const { data: authUser } = await admin.auth.admin.getUserById(usuario.id_user);
        email = authUser?.user?.email ?? null;
      }

      if (!email) {
        await admin.from("EnvioAutomaticoCarneLeao").insert({
          usuario: usuario.id,
          sucesso: false,
          mensagem_erro: "Sem e-mail de destino disponível.",
          quantidade_linhas: linhas.length,
        });
        continue;
      }

      const mesAno = dataFim.slice(0, 7).split("-").reverse().join("-"); // "AAAA-MM" -> "MM-AAAA"
      const nomeArquivo = `carne-leao-${mesAno}.txt`;

      // Empurra pro array de envio ANTES das escritas no banco — se algo
      // falhar a partir daqui, preferimos correr o risco de reenviar o
      // mesmo período no próximo ciclo (duplicado, visível) a perder o
      // conteúdo já gerado silenciosamente (o profissional nunca saberia
      // que um período ficou de fora).
      enviar.push({
        email,
        nomeArquivo,
        conteudoBase64: Buffer.from(conteudo, "utf-8").toString("base64"),
      });

      const { error: erroUpdate } = await admin
        .from("Usuarios")
        .update({ carne_leao_ultimo_envio: proximoUltimoEnvio })
        .eq("id", usuario.id);

      if (erroUpdate) {
        await admin.from("EnvioAutomaticoCarneLeao").insert({
          usuario: usuario.id,
          sucesso: false,
          mensagem_erro: `Envio gerado mas falha ao atualizar carne_leao_ultimo_envio: ${erroUpdate.message}`,
          quantidade_linhas: linhas.length,
        });
        continue;
      }

      await admin.from("EnvioAutomaticoCarneLeao").insert({
        usuario: usuario.id,
        sucesso: true,
        quantidade_linhas: linhas.length,
      });
    } catch (erro) {
      // Erro inesperado (ex.: falha transitória de rede/DB) em UM
      // profissional não pode derrubar a resposta inteira — isso
      // perderia silenciosamente os `enviar` já montados pra
      // profissionais anteriores no mesmo loop. Registra a falha e
      // segue pro próximo.
      await admin.from("EnvioAutomaticoCarneLeao").insert({
        usuario: usuario.id,
        sucesso: false,
        mensagem_erro: erro.message ?? "Erro inesperado ao gerar envio automático.",
        quantidade_linhas: 0,
      });
    }
  }

  return Response.json({ enviar });
}
