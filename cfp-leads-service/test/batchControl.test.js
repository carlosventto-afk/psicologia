import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDelayMs,
  shouldHaltOnCaptcha,
  shouldHaltOnTransportError,
  shouldHaltOnValidationError,
} from "../src/batchControl.js";

test("computeDelayMs respeita o intervalo min/max com randomFn determinístico", () => {
  assert.equal(computeDelayMs(2500, 5000, () => 0), 2500);
  assert.equal(computeDelayMs(2500, 5000, () => 1), 5000);
  assert.equal(computeDelayMs(2500, 5000, () => 0.5), 3750);
});

test("shouldHaltOnCaptcha só é true a partir de 2 falhas seguidas", () => {
  assert.equal(shouldHaltOnCaptcha(0), false);
  assert.equal(shouldHaltOnCaptcha(1), false);
  assert.equal(shouldHaltOnCaptcha(2), true);
  assert.equal(shouldHaltOnCaptcha(3), true);
});

test("shouldHaltOnTransportError só é true a partir de 3 falhas seguidas", () => {
  assert.equal(shouldHaltOnTransportError(1), false);
  assert.equal(shouldHaltOnTransportError(2), false);
  assert.equal(shouldHaltOnTransportError(3), true);
});

test("shouldHaltOnValidationError só é true a partir de 3 falhas seguidas", () => {
  assert.equal(shouldHaltOnValidationError(0), false);
  assert.equal(shouldHaltOnValidationError(1), false);
  assert.equal(shouldHaltOnValidationError(2), false);
  assert.equal(shouldHaltOnValidationError(3), true);
  assert.equal(shouldHaltOnValidationError(4), true);
});
