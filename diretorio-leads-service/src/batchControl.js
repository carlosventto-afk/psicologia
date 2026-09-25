export function computeDelayMs(minMs, maxMs, randomFn = Math.random) {
  return Math.floor(minMs + randomFn() * (maxMs - minMs));
}

export function shouldHaltOnTransportError(consecutiveTransportFailures) {
  return consecutiveTransportFailures >= 3;
}
