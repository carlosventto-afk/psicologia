import { createPool } from "./db.js";
import { launchBrowser, openSearchPage } from "./crawler.js";
import { runBatch } from "./runBatch.js";
import { numEnv } from "./env.js";

// Hardcoded: o crawler (openSearchPage) só sabe selecionar "Rio de Janeiro -
// CRP 5ª Região" no formulário. Tornar isso configurável exigiria mapear
// região -> label do select em crawler.js, fora de escopo desta entrega.
const CRP_REGIAO = 5;
const BATCH_SIZE = numEnv("BATCH_SIZE", 3000);
const RUN_INTERVAL_HOURS = numEnv("RUN_INTERVAL_HOURS", 24);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(pool) {
  const browser = await launchBrowser();
  try {
    const page = await openSearchPage(browser);
    const result = await runBatch({ pool, page, crpRegiao: CRP_REGIAO, batchSize: BATCH_SIZE });
    console.log(
      `[cfp-leads] lote concluído: processados=${result.processed} encontrados=${result.found} ` +
        `último_registro=${result.lastRegistro} parada=${result.haltedReason ?? "nenhuma"}`
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  const pool = createPool();
  for (;;) {
    try {
      await runOnce(pool);
    } catch (err) {
      console.error("[cfp-leads] falha no lote:", err);
    }
    await sleep(RUN_INTERVAL_HOURS * 60 * 60 * 1000);
  }
}

main();
