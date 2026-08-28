"use server";

import { revalidatePath } from "next/cache";
import { desmarcarPagamentoGerado } from "@/lib/data/carne-leao";

export async function desmarcarGeradoCarneLeao(pagamentoId) {
  await desmarcarPagamentoGerado(pagamentoId);
  revalidatePath("/carne-leao");
}
