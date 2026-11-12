# NFS-e automática a partir da Cobrança recebida (item 33)

## Intenção

O profissional trabalha o ciclo Agendado > Realizado > Cobrado > Recebido > Documentado.
Todos os passos até o recebimento continuam sendo dados pelo operador. A emissão da nota
fiscal é o único passo que passa a acontecer sozinho: quando a cobrança é recebida, o
sistema emite a NFS-e, envia ao paciente por e-mail e WhatsApp e marca o atendimento como
"Documentado". Hoje emitir é um clique por sessão em `/notas-fiscais`.

## Objetivos

- Ao receber uma Cobrança (item 32) cujo documento é `nota_fiscal`, emitir a NFS-e sem
  ação do usuário.
- **Padrão: uma nota por cobrança**, com o valor total recebido. **Exceção: uma nota por
  sessão** para os pacientes marcados assim (flag no cadastro do paciente, ver abaixo).
- Descrição da nota (modelo definido pelo usuário):
  ```
  Atendimento(s) psicológico(s) em 13/05/2026.

  Serviço prestado por:
  Ana Paula de Oliveira de Medeiros
  CRP: 05/59440 - RJ
  ```
  Com várias sessões as datas entram na mesma linha (formato: `13/05/2026, 20/05/2026 e
  27/05/2026`, escolha minha). Nome e CRP vêm do cadastro do profissional.
- Enviar a nota autorizada ao paciente por **e-mail** (já existe: `enviarEmailNotaFiscal`)
  e por **WhatsApp**.
- Estado derivado **"Documentada"** na sessão: aparece quando existe nota autorizada que a
  cobre (nota da cobrança ou nota da própria sessão). Visível nas listas de sessões e no
  detalhe da cobrança.
- Falhas não bloqueiam nem desfazem o recebimento: nota pendente/rejeitada fica visível,
  com motivo, e é reprocessada.

## Não-objetivos

- Não emite recibo automático (só NFS-e).
- Não muda os passos manuais anteriores; o operador continua cobrando e recebendo.
- Não cobre a cobrança pelo Asaas nem o recebimento automático (item 34), mas o serviço de
  emissão é desenhado para ser chamado também por um webhook sem sessão de usuário.
- Sem WhatsApp por número individual de cada profissional (projeto à parte).
- Sem alterar a regra fiscal já provada do `nfse-service` (tributação, assinatura).

## Decisões do usuário

1. Emissão **por cobrança** como padrão; **por sessão** em alguns casos.
2. A escolha por sessão é uma **flag no cadastro do paciente** ("emitir nota por sessão"),
   padrão desmarcada, e a cobrança pode trocá-la ao ser criada.
3. Modelo de descrição acima.
4. Envio por WhatsApp **a partir do número da plataforma** (instância Evolution já
   existente), com a mensagem identificando a psicóloga. O usuário pediu que eu decidisse e
   aceitou a recomendação.
5. O usuário ainda não respondeu se a NFS-e já foi aceita pela prefeitura em produção
   (ver "Pré-condição").

## Desenho técnico (base no que já existe)

Contexto no código: `NotaFiscal` está amarrada a `RecebimentoSessao` (uma nota por sessão,
índice único parcial `notafiscal_recebimento_ativo`) por `check num_nonnulls(
pagamento_sessao, recebimento_sessao) = 1`; a numeração sai da RPC
`registrar_nota_fiscal_pendente(p_recebimento_sessao)`, que usa `auth.uid()`; a emissão é
a server action `emitirNotaFiscal` (`web/lib/actions/notas-fiscais.js`), que chama o
microserviço `nfse-service` (`/emitir`, que também tenta buscar o PDF/DANFSe na SEFIN) e
manda o e-mail. O recebimento da cobrança é a função SQL `receber_cobranca` (item 32). O
envio de WhatsApp existente é o workflow n8n `WA - Enviar Mensagem`, que só faz
`sendText` pela instância Evolution da plataforma.

- **Modelo**: `NotaFiscal` ganha `cobranca bigint null` (referência a `Cobranca`) e o check
  passa a exigir exatamente um entre `pagamento_sessao`, `recebimento_sessao` e `cobranca`;
  índice único parcial por `cobranca` para notas `pendente`/`autorizada` (impede nota
  duplicada para a mesma cobrança). Colunas de entrega: `enviada_email_em`,
  `enviada_whatsapp_em`, `tentativas`, `ultimo_erro` (para reprocessar sem reenviar).
  `Paciente.nota_por_sessao boolean default false`; `Cobranca.emissao_por text
  ('cobranca'|'sessao')`, preenchido na criação a partir da flag do paciente.
  `DadosFiscaisProfissional.emissao_automatica boolean default false`: a emissão automática
  é **opt-in do profissional** em `/configuracoes/nfse` (tem consequência fiscal).
- **Serviço de emissão reutilizável**: uma função de servidor `emitirNotasDaCobranca(
  cobrancaId, supabase)` que aceita o cliente Supabase (hoje a sessão do operador; no item
  34, o cliente de serviço dentro do webhook). Como a RPC de numeração usa `auth.uid()`,
  prever uma variante que receba o dono explicitamente (somente `service_role`) ou
  equivalente. A decisão de como fazer isso é do construtor, mas o serviço não pode
  depender de uma sessão de usuário.
- **Gatilho**: logo depois de `receber_cobranca` ter sucesso, a ação de receber chama o
  serviço quando a cobrança tem `tipo_documento = 'nota_fiscal'` e o profissional ativou a
  emissão automática. A falha da emissão nunca altera o recebimento.
- **Regras de emissão**:
  - por cobrança: uma nota com `valor = soma dos valor_aplicado` do recebimento da cobrança
    e descrição pelo modelo; `competência = data da última sessão da cobrança` (escolha
    minha: precisa ser ≤ data de emissão e refletir a prestação do serviço);
  - por sessão: uma nota por `RecebimentoSessao` do recebimento, como hoje, com a data da
    sessão como competência e descrição do modelo com uma única data.
  - Pré-condições (as mesmas validações de hoje): dados fiscais completos, certificado
    válido, CPF do paciente. Se faltar algo, não emite: a cobrança mostra "Nota pendente:
    <motivo>" e o item aparece em `/notas-fiscais` para correção manual.
- **Reprocessamento**: uma rotina periódica (o job diário já agendado no n8n) tenta de novo
  notas `rejeitada` por falha transitória e entregas que falharam, com limite de tentativas
  (escolha minha: 3); ao esgotar, avisa o profissional por e-mail. Idempotente.
- **Entrega ao paciente** (só quando o `ambiente` fiscal é `producao`; em homologação a
  nota é emitida mas não é enviada): e-mail com XML e PDF (já existe); WhatsApp com o PDF
  em anexo (nova ação de mídia no workflow de envio) e, se o PDF não existir, o texto com a
  chave de acesso. Só envia por WhatsApp se o paciente tem telefone e o opt-in de WhatsApp
  que já existe no cadastro (`20260727000001_add_whatsapp_agent.sql`) está ativo; sem isso,
  só e-mail. Mensagem abre identificando a psicóloga (escolha minha).
- **"Documentada"**: estado derivado na consulta (mesmo padrão do selo "Cobrada" do item
  32), não um novo `Sessao.status`.
- **Telas**: flag no formulário do paciente; seletor "uma nota por cobrança/por sessão" na
  criação da cobrança (pré-selecionado); interruptor de emissão automática em
  `/configuracoes/nfse`; no detalhe da cobrança, a situação da nota (pendente, autorizada
  com chave e link, rejeitada com motivo), e o selo "Documentada".

## Pré-condição (verificada em 2026-11-12)

Consulta ao banco de produção: a tabela `NotaFiscal` está **vazia** (nenhuma nota guardada,
nem em homologação, pois os dados de teste foram apagados) e existe um único perfil fiscal,
em `homologacao`, com certificado. Ou seja, **nenhuma NFS-e foi emitida em produção**. Antes:
não estava confirmado que a NFS-e já foi **aceita** pela prefeitura em produção. O último
teste real do item 7 parou numa regra da SEFIN (assinatura exige certificado do próprio
prestador). Automatizar uma emissão que ainda não é aceita só automatiza a rejeição.
Resolver ou confirmar isso é a primeira tarefa, e a emissão automática deve ficar atrás do
interruptor por profissional justamente por isso.

## Deixado ao construtor

Nomes de colunas e rotas, texto exato da mensagem de WhatsApp e dos e-mails, como obter
nome e CRP para a descrição a partir de `Usuarios`/`DadosFiscaisProfissional` (ver pergunta
ao usuário), estratégia de transação e de lock na emissão, layout das telas.

## Verificação

Sem framework de testes: lógica pura (montar descrição, datas, somas, elegibilidade) com
`node --test`; o resto ponta a ponta contra homologação e dados descartáveis (receber uma
cobrança com nota por cobrança e por sessão, falha forçada e reprocessamento, entrega
bloqueada em homologação, idempotência de duplo recebimento).


## Resoluções da revisão do construtor

Decisões minhas (marcadas; o usuário pode reverter):
- **Fase 0 (bloqueante)**: o plano começa por provar uma emissão **aceita em homologação**
  com o certificado do próprio prestador (e-CNPJ) e só então liberar produção. Essa tarefa
  depende de o profissional fornecer o certificado e a senha em uso real; as demais
  tarefas podem ser construídas e testadas contra homologação sem ela.
- **Convivência com o fluxo manual**: uma sessão coberta por nota `pendente`/`autorizada`
  de uma cobrança não pode receber nota por sessão, e o inverso; a guarda fica nas duas
  RPCs de numeração (cada uma checa a outra relação). Em `/notas-fiscais`, sessões de uma
  cobrança com nota própria saem da lista de emissão por sessão.
- **Emissão manual da nota da cobrança**: o detalhe da cobrança ganha o botão "Emitir nota"
  (e "Tentar de novo" quando rejeitada) chamando o mesmo serviço `emitirNotasDaCobranca`.
  Vale para cobranças com `tipo_documento = 'nota_fiscal'` sem nota autorizada, inclusive
  quando a emissão automática está desligada. Sem tela nova de emissão.
- **PDF**: o PDF devolvido pelo `nfse-service` é guardado em `NotaFiscal` (coluna de texto
  base64), para reenvio e reprocessamento não precisarem consultar a SEFIN de novo. O
  workflow n8n de envio ganha uma ação de mídia (PDF em base64), implantada junto com o app.
- **Reprocessamento**: novo endpoint autenticado por segredo compartilhado (mesmo padrão de
  `/api/assinaturas/aplicar-pendencias`) chamado por um workflow n8n próprio; o job diário
  de assinaturas já existe e prova o padrão, mas não é reutilizado para separar assuntos.
- **Nome e CRP na descrição**: `Usuarios.nome` e `Usuarios.crp`. O CRP passa a ser
  obrigatório para ativar a emissão automática. (Se o nome empresarial for preferido, é uma
  troca de uma linha.)
- **Competência** por cobrança = data da última sessão (a mais próxima da data de emissão
  e nunca posterior a ela). Vale confirmar com o contador do profissional.

Decisão do usuário (2026-11-12): o **tomador** é o responsável financeiro da cobrança (o
pagador) quando existir; quando não existir, é o paciente. CPF/CNPJ, nome, e-mail e telefone
do tomador vêm do cadastro do responsável (`cpf_cnpj`, `telefone`, `email`) ou do paciente.
O desenho foi **aprovado** pelo usuário em 2026-11-12.

Correção de fato (descoberta ao montar o plano): o app **já envia WhatsApp direto** pela
Evolution API em `web/lib/whatsapp.js` (`sendText`, chave `EVOLUTION_API_KEY`); o workflow
n8n `WA - Enviar Mensagem` é só um subfluxo interno e não é chamável pelo app. Logo, a ação
de mídia (PDF) entra em `web/lib/whatsapp.js` (`sendMedia`), sem mexer no n8n. O opt-in de
WhatsApp é `Paciente.whatsapp_lembrete_opt_in` (já existe); para o tomador responsável usa-se
o telefone do responsável e o mesmo opt-in do paciente.
