import { searchByRegistro } from "./crawler.js";
import { getScanState, upsertLead, saveScanState } from "./db.js";
import { classifyBuscaResponse, mapApiResultToLead } from "./parsing.js";
import {
  computeDelayMs,
  shouldHaltOnCaptcha,
  shouldHaltOnTransportError,
  shouldHaltOnValidationError,
} from "./batchControl.js";
import { numEnv } from "./env.js";

const DELAY_MIN_MS = numEnv("DELAY_MIN_MS", 2500);
const DELAY_MAX_MS = numEnv("DELAY_MAX_MS", 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `search` é injetável só pra teste: o default preserva o comportamento real
// (index.js não precisa passar nada). Sem isso, o sequenciamento das paradas —
// a restrição mais dura do plano — ficaria sem cobertura.
export async function runBatch({ pool, page, crpRegiao, batchSize, search = searchByRegistro }) {
  const state = await getScanState(pool, crpRegiao);
  let current = state.maxRegistroChecked;
  const end = current + batchSize;
  let processed = 0;
  let found = 0;
  let consecutiveCaptchaFailures = 0;
  let consecutiveTransportFailures = 0;
  let consecutiveValidationErrors = 0;
  let haltedReason = null;

  try {
    while (current < end) {
      const registro = current + 1;
      const { status, body } = await search(page, registro);

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
        console.warn(
          `[cfp-leads] registro ${registro}: resposta com ${body.length} resultados, filtrando por match exato`
        );
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

      // validation_error é o "resto" do 422 em classifyBuscaResponse (tudo que
      // não tem recaptchaToken no corpo). Se o formato de erro da API do CFP
      // mudar, sem esse contador o serviço queimaria o backfill inteiro
      // marcando cada registro como "checado" com last_error = null — saudável
      // por fora, silenciosamente corrompido por dentro.
      if (outcome.type === "validation_error") {
        consecutiveValidationErrors += 1;
        console.warn(
          `[cfp-leads] registro ${registro}: erro de validação (${consecutiveValidationErrors} seguido(s)): ${outcome.detail}`
        );
        if (shouldHaltOnValidationError(consecutiveValidationErrors)) {
          haltedReason = `erro de validação 3x seguidas no registro ${registro}: ${outcome.detail}`;
          break;
        }
        await sleep(computeDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
        continue;
      }

      consecutiveCaptchaFailures = 0;
      consecutiveTransportFailures = 0;
      consecutiveValidationErrors = 0;

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
  } catch (err) {
    // searchByRegistro pode lançar (timeout de ação do Playwright em
    // .fill()/.click(), page crash, mudança no formulário do CFP). Sem esse
    // catch a exceção pularia o saveScanState abaixo e o last_error ficaria no
    // último valor bem-sucedido (null), fazendo o serviço parecer saudável.
    haltedReason = `exceção no registro ${current + 1}: ${err.message}`;
  }

  if (haltedReason) {
    await saveScanState(pool, crpRegiao, { maxRegistroChecked: current, lastError: haltedReason });
  }

  return { processed, found, lastRegistro: current, haltedReason };
}
