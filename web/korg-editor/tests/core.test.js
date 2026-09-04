import test from "node:test";
import assert from "node:assert/strict";
import {
  PARTS_BY_MODEL,
  changeModel,
  createDefaultState,
  getAccentTrack,
  getStepDurationMs,
  nextStepIndex,
  parsePattern,
  randomStep,
  resizePattern,
  safeFilename,
  validatePattern
} from "../editor-core.js";

function legacyPattern(model = "esx") {
  return {
    model,
    theme: model === "emx" ? "theme-emx" : "theme-esx",
    patternName: "A.01 Detroit Bounce",
    bpm: 172,
    swing: 40,
    patternLength: 16,
    currentPage: 0,
    selectedPart: 0,
    masterVolume: 72,
    steps: Array.from({ length: 10 }, () => Array.from({ length: 16 }, () => ({ on: false, accent: false, ghost: false }))),
    mixer: Array.from({ length: 10 }, () => ({ level: 100, pitch: 0, pan: 0, fx: 20, mute: false, solo: false })),
    motion: { cutoff: 78, resonance: 35, eg: 49, decay: 72, pan: 0, rollType: "Off" }
  };
}

test("default ESX and EMX patterns expose the exact 16-part topologies", () => {
  const esx = validatePattern(createDefaultState("esx"));
  const emx = validatePattern(createDefaultState("emx"));
  assert.equal(esx.schemaVersion, 2);
  assert.equal(esx.tracks.length, 16);
  assert.equal(emx.tracks.length, 16);
  assert.deepEqual(esx.tracks.map((track) => track.id), PARTS_BY_MODEL.esx.map((part) => part.id));
  assert.deepEqual(emx.tracks.map((track) => track.id), PARTS_BY_MODEL.emx.map((part) => part.id));
  assert.deepEqual(esx.tracks.slice(-7).map((track) => track.id), ["K1", "K2", "ST1", "ST2", "SLICE", "AIN", "ACC"]);
  assert.deepEqual(emx.tracks.slice(-7).map((track) => track.id), ["S1", "S2", "S3", "S4", "S5", "DACC", "SACC"]);
});

test("legacy V1 patterns migrate steps, mixer data, accent lanes and swing", () => {
  const legacy = legacyPattern("esx");
  legacy.steps[0][0] = { on: true, accent: true, ghost: true };
  legacy.steps[1][1] = { on: true, accent: false, ghost: true };
  legacy.mixer[0].level = 88;
  const migrated = parsePattern(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.swing, 60);
  assert.equal(migrated.machineName, "A01DETRO");
  assert.equal(migrated.tracks.find((track) => track.id === "D1").level, 88);
  assert.equal(migrated.tracks.find((track) => track.id === "D1").steps[0].ghost, false);
  assert.deepEqual(migrated.tracks.find((track) => track.id === "D2").steps[1], { on: true, ghost: true });
  assert.equal(migrated.tracks.find((track) => track.id === "ACC").steps[0].on, true);
});

test("legacy EMX accents split into drum and synth lanes and malformed V1 is rejected", () => {
  const legacy = legacyPattern("emx");
  legacy.steps[0][2] = { on: true, accent: true, ghost: false };
  legacy.steps[5][3] = { on: true, accent: true, ghost: false };
  const migrated = validatePattern(legacy);
  assert.equal(migrated.tracks.find((track) => track.id === "DACC").steps[2].on, true);
  assert.equal(migrated.tracks.find((track) => track.id === "SACC").steps[3].on, true);

  legacy.steps.pop();
  assert.throws(() => validatePattern(legacy), /genau 10 Parts/);
});

test("128-step patterns validate and retain data through JSON round-trips", () => {
  const state = createDefaultState();
  resizePattern(state, 128);
  state.tracks[0].steps[127] = { on: true, ghost: false };
  const roundTrip = parsePattern(JSON.stringify(validatePattern(state)));
  assert.equal(roundTrip.patternLength, 128);
  assert.equal(roundTrip.tracks[0].steps.length, 128);
  assert.equal(roundTrip.tracks[0].steps[127].on, true);
});

test("resizing preserves available steps and validates all Korg bar lengths", () => {
  const state = createDefaultState();
  state.tracks[0].steps[0].on = true;
  for (const length of [32, 48, 64, 80, 96, 112, 128]) {
    resizePattern(state, length);
    assert.equal(validatePattern(state).patternLength, length);
    assert.equal(state.tracks[0].steps[0].on, true);
  }
  resizePattern(state, 16);
  assert.equal(state.tracks[0].steps.length, 16);
});

test("model changes preserve common drum parts and translate accent lanes", () => {
  const state = createDefaultState("esx");
  state.tracks.find((track) => track.id === "D1").steps[0].on = true;
  state.tracks.find((track) => track.id === "ACC").steps[0].on = true;
  changeModel(state, "emx");
  assert.equal(state.tracks.find((track) => track.id === "D1").steps[0].on, true);
  assert.equal(state.tracks.find((track) => track.id === "DACC").steps[0].on, true);
  assert.equal(state.tracks.find((track) => track.id === "SACC").steps[0].on, true);
  changeModel(state, "esx");
  assert.equal(state.tracks.find((track) => track.id === "ACC").steps[0].on, true);
});

test("accent tracks are resolved independently for EMX drum and synth parts", () => {
  const state = createDefaultState("emx");
  assert.equal(getAccentTrack(state, "D1").id, "DACC");
  assert.equal(getAccentTrack(state, "S1").id, "SACC");
  assert.equal(getAccentTrack(state, "DACC"), null);
});

test("malformed JSON, invalid ranges and invalid part order are rejected", () => {
  assert.throws(() => parsePattern("{"), /gültiges JSON/);
  const state = createDefaultState();
  assert.throws(() => validatePattern({ ...state, schemaVersion: 99 }), /Nicht unterstützte Pattern-Version/);
  state.bpm = 999;
  assert.throws(() => validatePattern(state), /BPM/);
  state.bpm = 172;
  state.swing = 49;
  assert.throws(() => validatePattern(state), /Swing/);
  state.swing = 50;
  [state.tracks[0], state.tracks[1]] = [state.tracks[1], state.tracks[0]];
  assert.throws(() => validatePattern(state), /Part-ID/);
});

test("machine names enforce the Electribe eight-character constraint", () => {
  const state = createDefaultState();
  state.machineName = "SCHRAUBI";
  assert.equal(validatePattern(state).machineName, "SCHRAUBI");
  state.machineName = "TOO-LONG9";
  assert.throws(() => validatePattern(state), /1 bis 8 Zeichen/);
});

test("ghost is removed from off steps and accent-lane steps", () => {
  const state = createDefaultState();
  state.tracks[0].steps[0] = { on: false, ghost: true };
  state.tracks.find((track) => track.id === "ACC").steps[0] = { on: true, ghost: true };
  const checked = validatePattern(state);
  assert.deepEqual(checked.tracks[0].steps[0], { on: false, ghost: false });
  assert.deepEqual(checked.tracks.find((track) => track.id === "ACC").steps[0], { on: true, ghost: false });
});

test("random steps never attach ghost to an off step", () => {
  assert.deepEqual(randomStep(() => 0.1), { on: false, ghost: false });
  assert.deepEqual(randomStep(() => 0.99), { on: true, ghost: true });
});

test("Korg swing uses 50 as straight, 66 as shuffle and preserves pair duration", () => {
  const straight = getStepDurationMs(160, 50, 0);
  const disabled = getStepDurationMs(160, 75, 0, false);
  const swungPair = getStepDurationMs(160, 66, 0) + getStepDurationMs(160, 66, 1);
  assert.equal(straight, disabled);
  assert.equal(swungPair, straight * 2);
  assert.ok(getStepDurationMs(160, 66, 0) > getStepDurationMs(160, 66, 1));
});

test("sequencer wraps from step 128 to step one", () => {
  assert.equal(nextStepIndex(126, 128), 127);
  assert.equal(nextStepIndex(127, 128), 0);
});

test("export filenames remain filesystem-safe", () => {
  assert.equal(safeFilename("A.01 / Schraubi: Tekk?"), "A.01_Schraubi_Tekk");
  assert.equal(safeFilename("***"), "korg_pattern");
});
