"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function vincularWhatsapp(prevState, formData) {
  const supabase = await createClient();
  const whatsappNumber = formData.get("whatsapp_number");

  const { data, error } = await supabase.rpc("gerar_codigo_verificacao_whatsapp", {
    p_whatsapp_number: whatsappNumber,
  });

  if (error) {
    return { error: "Não foi possível gerar o código. Tente novamente." };
  }

  revalidatePath("/configuracoes/whatsapp");
  return { codigo: data, whatsappNumber };
}
