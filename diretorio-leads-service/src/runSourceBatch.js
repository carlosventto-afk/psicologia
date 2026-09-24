import { getScanState, upsertLead, saveScanState } from "./db.js";
import { computeDelayMs, shouldHaltOnTransportError } from "./batchControl.js";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSourceBatch({
  pool, fonte, candidateKeys, fetchLead, batchSize, delayMinMs, delayMaxMs, sleep = defaultSleep,
}) {
  const state = await getScanState(pool, fonte);
  const cursor = state.cursor ?? "";
  const sorted = [...new Set(candidateKeys)].sort();
  let pending = sorted.filter((key) => key > cursor);
  if (pending.length === 0) pending = sorted; // fim da lista: reinicia no próximo lote
  const batch = pending.slice(0, batchSize);

  let i = 0;
  let processed = 0;
  let found = 0;
  let consecutiveTransportFailures = 0;
  let haltedReason = null;
  let lastKey = cursor;

  try {
    while (i < batch.length) {
      const key = batch[i];
      let lead;
      try {
        lead = await fetchLead(key);
      } catch (err) {
        consecutiveTransportFailures += 1;
        if (shouldHaltOnTransportError(consecutiveTransportFailures)) {
          haltedReason = `falha persistente em ${key}: ${err.message}`;
          break;
        }
        await sleep(computeDelayMs(delayMinMs, delayMaxMs));
        continue; // retenta a mesma key, não avança i
      }

      consecutiveTransportFailures = 0;
      if (lead) {
        await upsertLead(pool, lead);
        found += 1;
      }
      lastKey = key;
      processed += 1;
      i += 1;
      await saveScanState(pool, fonte, { cursor: lastKey, lastError: null });
      await sleep(computeDelayMs(delayMinMs, delayMaxMs));
    }
  } catch (err) {
    // fetchLead/upsertLead podem lançar fora do try interno (ex.: upsertLead
    // falhando por erro de conexão). Sem este catch a exceção subiria sem
    // persistir last_error, deixando o scan_state com last_error = null e o
    // serviço parecendo saudável apesar da falha.
    haltedReason = `exceção em ${batch[i]}: ${err.message}`;
  }

  if (haltedReason) {
    await saveScanState(pool, fonte, { cursor: lastKey, lastError: haltedReason });
  }

  return { processed, found, lastKey, haltedReason };
}
