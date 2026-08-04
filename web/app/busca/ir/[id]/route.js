import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: perfil, error } = await supabase
    .from("PerfilPublico")
    .select("usuario_id")
    .eq("id", id)
    .eq("visivel_diretorio", true)
    .maybeSingle();

  if (error || !perfil) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Usuarios não tem policy de leitura pública (só id_user = auth.uid() ou
  // admin) — um embedded join `.select("usuario_id, Usuarios!inner(...)")`
  // aqui ficaria sob a RLS de Usuarios e, sendo "!inner", zeraria a linha
  // inteira pra visitante anônimo (mesma classe de bug já corrigida em
  // web/lib/data/diretorio.js, Task 3 / migration 20260804000001). Usa o
  // RPC security definer `usuarios_publicos` pra contornar isso.
  const { data: usuarios, error: erroUsuario } = await supabase.rpc("usuarios_publicos", {
    p_usuario_ids: [perfil.usuario_id],
  });

  const usuario = usuarios?.[0];
  if (erroUsuario || !usuario) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await supabase
    .from("ContatoDiretorio")
    .insert({ usuario_id: perfil.usuario_id, origem: "perfil" });

  // Nem todo Usuarios.contato segue o formato "só DDD+número" (confirmado
  // empiricamente no Step 2: o único usuário real hoje tem contato
  // "559182333610", já com o DDI 55 incluso — sinal de que o cadastro
  // (web/lib/actions/auth.js e profissionais.js) só faz replace(/\D/g, "")
  // no que a pessoa digitou, sem normalizar DDI). DDD+número (sem DDI) tem
  // no máximo 11 dígitos (2 de DDD + até 9 do número); com DDI já incluso
  // passa a ter 12 ou 13. Só prefixa "55" quando ainda não tiver DDI, pra
  // não gerar link quebrado tipo wa.me/55559182333610.
  const digitos = String(usuario.contato).replace(/\D/g, "");
  const numero = digitos.length > 11 ? digitos : `55${digitos}`;
  const mensagem = encodeURIComponent(
    `Olá ${usuario.nome}, vi seu perfil no PsiFácil e gostaria de conversar.`
  );

  return NextResponse.redirect(`https://wa.me/${numero}?text=${mensagem}`);
}
