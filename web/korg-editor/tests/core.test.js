import test from "node:test";
import assert from "node:assert/strict";
import {
  PARTS,
  createDefaultState,
  getStepDurationMs,
  nextStepIndex,
  parsePattern,
  randomStep,
  safeFilename,
  validatePattern
} from "../editor-core.js";

test("default pattern passes complete validation", () => {
  const state = validatePattern(createDefaultState());
  assert.equal(state.steps.length, PARTS.length);
  assert.equal(state.steps[0].length, 16);
  assert.equal(state.schemaVersion, 1);
});

test("legacy v1 pattern without schemaVersion remains importable", () => {
  const state = createDefaultState();
  delete state.schemaVersion;
  assert.equal(parsePattern(JSON.stringify(state)).schemaVersion, 1);
});

test("malformed JSON and invalid ranges are rejected", () => {
  assert.throws(() => parsePattern("{"), /gültiges JSON/);
  const state = createDefaultState();
  state.bpm = 999;
  assert.throws(() => validatePattern(state), /BPM/);
});

test("step matrix must match the declared pattern length", () => {
  const state = createDefaultState();
  state.patternLength = 32;
  assert.throws(() => validatePattern(state), /32 Steps/);
});

test("accent and ghost are normalized to a consistent state", () => {
  const state = createDefaultState();
  state.steps[0][0] = { on: false, accent: true, ghost: true };
  state.steps[0][1] = { on: true, accent: true, ghost: true };
  const checked = validatePattern(state);
  assert.deepEqual(checked.steps[0][0], { on: false, accent: false, ghost: false });
  assert.deepEqual(checked.steps[0][1], { on: true, accent: true, ghost: false });
});

test("random steps never attach accent or ghost to an off step", () => {
  const off = randomStep(() => 0.1);
  assert.deepEqual(off, { on: false, accent: false, ghost: false });
  const accent = randomStep(() => 0.99);
  assert.deepEqual(accent, { on: true, accent: true, ghost: false });
});

test("swing keeps each two-step pair at the same total duration", () => {
  const straightPair = getStepDurationMs(160, 0, 0) + getStepDurationMs(160, 0, 1);
  const swungPair = getStepDurationMs(160, 40, 0) + getStepDurationMs(160, 40, 1);
  assert.equal(swungPair, straightPair);
  assert.ok(getStepDurationMs(160, 40, 0) > getStepDurationMs(160, 40, 1));
});

test("sequencer wraps from the last step to step one", () => {
  assert.equal(nextStepIndex(0, 16), 1);
  assert.equal(nextStepIndex(15, 16), 0);
});

test("export filenames are filesystem-safe", () => {
  assert.equal(safeFilename("A.01 / Schraubi: Tekk?"), "A.01_Schraubi_Tekk");
  assert.equal(safeFilename("***"), "korg_pattern");
});
