-- Migration: buffer de debounce para mensagens fragmentadas do WhatsApp
--
-- Problema: quando o profissional manda a pergunta em várias mensagens
-- curtas seguidas (comum no WhatsApp), o "WA - Inbound Router" chamava o
-- Agent Psicólogo (Gemini) uma vez por mensagem — cada fragmento virava uma
-- chamada de LLM isolada e sem contexto do resto da frase, desperdiçando
-- tokens e gerando respostas picadas/confusas.
--
-- Esta tabela guarda os fragmentos por número enquanto o workflow espera
-- alguns segundos por mais mensagens. "versao" é incrementada a cada
-- fragmento novo; a mensagem só é "consumida" (DELETE ... WHERE versao =
-- <versao que ela mesma criou> ... RETURNING) se nenhum fragmento mais novo
-- chegou durante a espera — isso resolve o debounce sem lock explícito,
-- comparando a versão antes/depois do wait.
create table if not exists agent_buffer_mensagens (
  whatsapp_number text primary key,
  mensagens text[] not null default '{}',
  versao bigint not null default 0,
  atualizado_em timestamptz not null default now()
);
