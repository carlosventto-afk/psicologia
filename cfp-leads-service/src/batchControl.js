export function computeDelayMs(minMs, maxMs, randomFn = Math.random) {
  return Math.floor(minMs + randomFn() * (maxMs - minMs));
}

export function shouldHaltOnCaptcha(consecutiveCaptchaFailures) {
  return consecutiveCaptchaFailures >= 2;
}

export function shouldHaltOnTransportError(consecutiveTransportFailures) {
  return consecutiveTransportFailures >= 3;
}

export function shouldHaltOnValidationError(consecutiveValidationErrors) {
  return consecutiveValidationErrors >= 3;
}
