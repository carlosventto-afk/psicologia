import { searchByRegistro } from "./crawler.js";
import { getScanState, upsertLead, saveScanState } from "./db.js";
import { classifyBuscaResponse, mapApiResultToLead } from "./parsing.js";
import { computeDelayMs, shouldHaltOnCaptcha, shouldHaltOnTransportError } from "./batchControl.js";

const DELAY_MIN_MS = Number(process.env.DELAY_MIN_MS ?? 2500);
const DELAY_MAX_MS = Number(process.env.DELAY_MAX_MS ?? 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBatch({ pool, page, crpRegiao, batchSize }) {
  const state = await getScanState(pool, crpRegiao);
  let current = state.maxRegistroChecked;
  const end = current + batchSize;
  let processed = 0;
  let found = 0;
  let consecutiveCaptchaFailures = 0;
  let consecutiveTransportFailures = 0;
  let haltedReason = null;

  while (current < end) {
    const registro = current + 1;
    const { status, body } = await searchByRegistro(page, registro);

    if (status === "timeout") {
      consecutiveTransportFailures += 1;
      if (shouldHaltOnTransportError(consecutiveTransportFailures)) {
        haltedReason = `timeout persistente no registro ${registro}`;
        break;
      }
      await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      continue;
    }

    let effectiveBody = body;
    if (status === 200 && Array.isArray(body) && body.length > 1) {
      const exactMatch = body.find((r) => parseInt(r.registro, 10) === registro);
      effectiveBody = exactMatch ? [exactMatch] : [];
    }

    const outcome = classifyBuscaResponse(status, effectiveBody);

    if (outcome.type === "captcha_failure") {
      consecutiveCaptchaFailures += 1;
      if (shouldHaltOnCaptcha(consecutiveCaptchaFailures)) {
        haltedReason = `reCAPTCHA falhou 2x seguidas no registro ${registro}`;
        break;
      }
      await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      continue;
    }

    consecutiveCaptchaFailures = 0;
    consecutiveTransportFailures = 0;

    if (outcome.type === "found") {
      await upsertLead(pool, mapApiResultToLead(outcome.result, crpRegiao));
      found += 1;
    } else if (outcome.type === "unexpected") {
      haltedReason = `resposta inesperada no registro ${registro}: ${outcome.detail}`;
      break;
    }

    current = registro;
    processed += 1;
    await saveScanState(pool, crpRegiao, { maxRegistroChecked: current, lastError: null });
    await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
  }

  if (haltedReason) {
    await saveScanState(pool, crpRegiao, { maxRegistroChecked: current, lastError: haltedReason });
  }

  return { processed, found, lastRegistro: current, haltedReason };
}
