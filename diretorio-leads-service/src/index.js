import { createPool } from "./db.js";
import { runSourceBatch } from "./runSourceBatch.js";
import { discoverRjPsicologoUrls, fetchDoctoraliaLead } from "./sources/doctoraliaCrawler.js";
import { discoverProfileSlugs, fetchNossosPsicologosLead } from "./sources/nossosPsicologosCrawler.js";
import { numEnv } from "./env.js";

const BATCH_SIZE = numEnv("BATCH_SIZE", 500);
const RUN_INTERVAL_HOURS = numEnv("RUN_INTERVAL_HOURS", 24);
const DELAY_MIN_MS = numEnv("DELAY_MIN_MS", 1000);
const DELAY_MAX_MS = numEnv("DELAY_MAX_MS", 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOneSource({ pool, fonte, discover, fetchLead, label }) {
  const candidateKeys = await discover();
  const result = await runSourceBatch({
    pool, fonte, candidateKeys, fetchLead,
    batchSize: BATCH_SIZE, delayMinMs: DELAY_MIN_MS, delayMaxMs: DELAY_MAX_MS,
  });
  console.log(
    `[diretorio-leads] ${label}: candidatos=${candidateKeys.length} processados=${result.processed} ` +
      `encontrados=${result.found} última_key=${result.lastKey} parada=${result.haltedReason ?? "nenhuma"}`
  );
}

async function main() {
  const pool = createPool();
  for (;;) {
    try {
      await runOneSource({
        pool, fonte: "doctoralia", discover: discoverRjPsicologoUrls,
        fetchLead: fetchDoctoraliaLead, label: "doctoralia",
      });
    } catch (err) {
      console.error("[diretorio-leads] falha no lote doctoralia:", err);
    }
    try {
      await runOneSource({
        pool, fonte: "nossos_psicologos", discover: discoverProfileSlugs,
        fetchLead: fetchNossosPsicologosLead, label: "nossos_psicologos",
      });
    } catch (err) {
      console.error("[diretorio-leads] falha no lote nossos_psicologos:", err);
    }
    await sleep(RUN_INTERVAL_HOURS * 60 * 60 * 1000);
  }
}

main();
