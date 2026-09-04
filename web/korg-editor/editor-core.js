export const SCHEMA_VERSION = 2;
export const PATTERN_LENGTHS = [16, 32, 48, 64, 80, 96, 112, 128];
export const THEMES = ["theme-esx", "theme-emx", "theme-night"];
export const MODELS = ["esx", "emx"];
export const ROLL_TYPES = [2, 3, 4];

const drumParts = ["D1", "D2", "D3", "D4", "D5", "D6A", "D6B", "D7A", "D7B"];

function part(id, name, kind, accentGroup) {
  return Object.freeze({ id, name, kind, accentGroup });
}

export const PARTS_BY_MODEL = Object.freeze({
  esx: Object.freeze([
    ...drumParts.map((id) => part(id, `DRUM ${id.slice(1)}`, "drum", "main")),
    part("K1", "KEYBOARD 1", "keyboard", "main"),
    part("K2", "KEYBOARD 2", "keyboard", "main"),
    part("ST1", "STRETCH 1", "stretch", "main"),
    part("ST2", "STRETCH 2", "stretch", "main"),
    part("SLICE", "SLICE", "slice", "main"),
    part("AIN", "AUDIO IN", "audio", "main"),
    part("ACC", "ACCENT", "accent", "main")
  ]),
  emx: Object.freeze([
    ...drumParts.map((id) => part(id, `DRUM ${id.slice(1)}`, "drum", "drum")),
    ...[1, 2, 3, 4, 5].map((number) => part(`S${number}`, `SYNTH ${number}`, "synth", "synth")),
    part("DACC", "DRUM ACCENT", "accent", "drum"),
    part("SACC", "SYNTH ACCENT", "accent", "synth")
  ])
});

const LEGACY_TARGETS = Object.freeze({
  esx: ["D1", "D2", "D3", "D4", "D5", "K1", "K2", "ST1", "SLICE", "AIN"],
  emx: ["D1", "D2", "D3", "D4", "D5", "S1", "S2", "S3", "S4", "S5"]
});
const LEGACY_PATTERN_LENGTHS = [16, 32, 64];
const LEGACY_ROLL_TYPES = ["Off", "1/8", "1/16", "1/32"];

export const getPartDefinitions = (model) => PARTS_BY_MODEL[model] ?? [];
export const createStep = () => ({ on: false, ghost: false });

function defaultTrack(definition, length) {
  const accent = definition.kind === "accent";
  return {
    id: definition.id,
    level: 100,
    pitch: 0,
    pan: 0,
    fx: accent ? 0 : 20,
    mute: false,
    solo: false,
    swingEnabled: true,
    rollEnabled: false,
    accentEnabled: !accent,
    steps: Array.from({ length }, createStep)
  };
}

export function createTracks(model, length) {
  return getPartDefinitions(model).map((definition) => defaultTrack(definition, length));
}

export function createDefaultState(model = "esx") {
  if (!MODELS.includes(model)) throw new Error(`Unbekanntes Modell: ${model}.`);
  return {
    schemaVersion: SCHEMA_VERSION,
    model,
    theme: model === "emx" ? "theme-emx" : "theme-esx",
    patternName: "A.01 Detroit Bounce",
    machineName: "DETROIT",
    bpm: 128,
    swing: 50,
    patternLength: 16,
    currentPage: 0,
    selectedPartId: getPartDefinitions(model)[0].id,
    masterVolume: 72,
    rollType: 2,
    tracks: createTracks(model, 16),
    motion: { cutoff: 78, resonance: 35, eg: 49, decay: 72, pan: 0 }
  };
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} muss ein Objekt sein.`);
  return value;
}

function numberIn(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} muss zwischen ${min} und ${max} liegen.`);
  return value;
}

function integerIn(value, min, max, label) {
  if (!Number.isInteger(value)) throw new Error(`${label} muss eine ganze Zahl sein.`);
  return numberIn(value, min, max, label);
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} ist ungültig.`);
  return value;
}

function bool(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} muss true oder false sein.`);
  return value;
}

function normalizeMachineName(value) {
  const clean = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "")
    .toUpperCase()
    .slice(0, 8);
  return clean || "PATTERN";
}

export function normalizeStep(value, label = "Step", allowGhost = true) {
  const source = object(value, label);
  const on = bool(source.on, `${label}.on`);
  const ghostValue = source.ghost ?? false;
  const ghost = allowGhost && on && bool(ghostValue, `${label}.ghost`);
  return { on, ghost };
}

function legacySwing(value) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(50, Math.min(75, Math.round(50 + Math.min(90, Math.max(0, value)) / 4)));
}

function legacyAccentTargets(model, legacyIndex) {
  if (model === "emx") return legacyIndex < 5 ? ["DACC"] : ["SACC"];
  return ["ACC"];
}

export function migrateV1Pattern(input) {
  const source = object(input, "Pattern V1");
  const model = oneOf(source.model, MODELS, "V1 Modell");
  const theme = oneOf(source.theme, THEMES, "V1 Theme");
  const length = oneOf(source.patternLength, LEGACY_PATTERN_LENGTHS, "V1 Pattern-Länge");
  const pageCount = length / 16;
  const patternName = typeof source.patternName === "string" ? source.patternName.trim() : "";
  if (!patternName || patternName.length > 80) throw new Error("V1 Pattern-Name muss 1 bis 80 Zeichen enthalten.");
  if (!Array.isArray(source.steps) || source.steps.length !== 10) {
    throw new Error("V1 Steps müssen genau 10 Parts enthalten.");
  }
  if (!Array.isArray(source.mixer) || source.mixer.length !== 10) {
    throw new Error("V1 Mixer muss genau 10 Kanäle enthalten.");
  }
  const motion = object(source.motion, "V1 Motion");

  const migrated = createDefaultState(model);
  migrated.patternLength = length;
  migrated.patternName = patternName;
  migrated.machineName = normalizeMachineName(source.machineName ?? migrated.patternName);
  migrated.theme = theme;
  migrated.bpm = numberIn(source.bpm, 40, 240, "V1 BPM");
  migrated.swing = legacySwing(numberIn(source.swing, 0, 100, "V1 Swing"));
  migrated.currentPage = integerIn(source.currentPage, 0, pageCount - 1, "V1 Step-Seite");
  integerIn(source.selectedPart, 0, 9, "V1 ausgewählter Part");
  migrated.masterVolume = numberIn(source.masterVolume, 0, 100, "V1 Master Volume");
  const legacyRollType = oneOf(motion.rollType, LEGACY_ROLL_TYPES, "V1 Roll Type");
  migrated.rollType = { "1/8": 2, "1/16": 3, "1/32": 4 }[legacyRollType] ?? 2;
  migrated.tracks = createTracks(model, length);

  const targetIds = LEGACY_TARGETS[model];
  targetIds.forEach((targetId, legacyIndex) => {
    const target = migrated.tracks.find((track) => track.id === targetId);
    const legacySteps = source.steps[legacyIndex];
    if (!Array.isArray(legacySteps) || legacySteps.length !== length) {
      throw new Error(`V1 Part ${legacyIndex + 1} muss genau ${length} Steps enthalten.`);
    }
    target.steps = legacySteps.map((step, stepIndex) => {
      const checked = normalizeStep(step, `V1 Part ${legacyIndex + 1} Step ${stepIndex + 1}`);
      const accented = bool(step.accent, `V1 Part ${legacyIndex + 1} Step ${stepIndex + 1}.accent`);
      if (checked.on && accented) {
        checked.ghost = false;
        legacyAccentTargets(model, legacyIndex).forEach((accentId) => {
          const accentTrack = migrated.tracks.find((track) => track.id === accentId);
          if (accentTrack) accentTrack.steps[stepIndex] = { on: true, ghost: false };
        });
      }
      return checked;
    });

    const legacyMixer = object(source.mixer[legacyIndex], `V1 Part ${legacyIndex + 1} Mixer`);
    target.level = numberIn(legacyMixer.level, 0, 127, `V1 Part ${legacyIndex + 1} Level`);
    target.pitch = numberIn(legacyMixer.pitch, -24, 24, `V1 Part ${legacyIndex + 1} Pitch`);
    target.pan = numberIn(legacyMixer.pan, -64, 63, `V1 Part ${legacyIndex + 1} Pan`);
    target.fx = numberIn(legacyMixer.fx, 0, 127, `V1 Part ${legacyIndex + 1} FX Send`);
    target.mute = bool(legacyMixer.mute, `V1 Part ${legacyIndex + 1} Mute`);
    target.solo = bool(legacyMixer.solo, `V1 Part ${legacyIndex + 1} Solo`);
    target.rollEnabled = legacyRollType !== "Off";
  });

  migrated.motion.cutoff = numberIn(motion.cutoff, 0, 127, "V1 Cutoff");
  migrated.motion.resonance = numberIn(motion.resonance, 0, 127, "V1 Resonance");
  migrated.motion.eg = numberIn(motion.eg, 0, 127, "V1 EG Intensity");
  migrated.motion.decay = numberIn(motion.decay, 0, 127, "V1 Decay");
  migrated.motion.pan = numberIn(motion.pan, -64, 63, "V1 Motion Pan");
  return migrated;
}

function validateV2Pattern(input) {
  const source = object(input, "Pattern");
  if (source.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Nicht unterstützte Pattern-Version: ${source.schemaVersion}.`);
  }

  const model = oneOf(source.model, MODELS, "Modell");
  const definitions = getPartDefinitions(model);
  const patternLength = oneOf(source.patternLength, PATTERN_LENGTHS, "Pattern-Länge");
  const pageCount = patternLength / 16;
  const patternName = typeof source.patternName === "string" ? source.patternName.trim() : "";
  if (!patternName || patternName.length > 80) throw new Error("Pattern-Name muss 1 bis 80 Zeichen enthalten.");
  const machineName = typeof source.machineName === "string" ? source.machineName.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{1,8}$/.test(machineName)) {
    throw new Error("Korg-Name muss 1 bis 8 Zeichen aus A-Z, 0-9, _ oder - enthalten.");
  }

  if (!Array.isArray(source.tracks) || source.tracks.length !== definitions.length) {
    throw new Error(`Tracks müssen genau ${definitions.length} ${model.toUpperCase()}-Parts enthalten.`);
  }

  const tracks = source.tracks.map((raw, index) => {
    const definition = definitions[index];
    const track = object(raw, `${definition.name} Track`);
    if (track.id !== definition.id) throw new Error(`${definition.name} muss die Part-ID ${definition.id} besitzen.`);
    if (!Array.isArray(track.steps) || track.steps.length !== patternLength) {
      throw new Error(`${definition.name} muss genau ${patternLength} Steps enthalten.`);
    }
    const accent = definition.kind === "accent";
    return {
      id: definition.id,
      level: numberIn(track.level, 0, 127, `${definition.name} Level`),
      pitch: numberIn(track.pitch, -24, 24, `${definition.name} Pitch`),
      pan: numberIn(track.pan, -64, 63, `${definition.name} Pan`),
      fx: numberIn(track.fx, 0, 127, `${definition.name} FX Send`),
      mute: bool(track.mute, `${definition.name} Mute`),
      solo: bool(track.solo, `${definition.name} Solo`),
      swingEnabled: bool(track.swingEnabled, `${definition.name} Swing Switch`),
      rollEnabled: bool(track.rollEnabled, `${definition.name} Roll`),
      accentEnabled: bool(track.accentEnabled, `${definition.name} Accent Switch`),
      steps: track.steps.map((step, stepIndex) => normalizeStep(step, `${definition.name} Step ${stepIndex + 1}`, !accent))
    };
  });

  const selectedPartId = oneOf(source.selectedPartId, definitions.map((definition) => definition.id), "Ausgewählter Part");
  const motion = object(source.motion, "Motion");
  return {
    schemaVersion: SCHEMA_VERSION,
    model,
    theme: oneOf(source.theme, THEMES, "Theme"),
    patternName,
    machineName,
    bpm: numberIn(source.bpm, 40, 240, "BPM"),
    swing: integerIn(source.swing, 50, 75, "Swing"),
    patternLength,
    currentPage: integerIn(source.currentPage, 0, pageCount - 1, "Step-Seite"),
    selectedPartId,
    masterVolume: numberIn(source.masterVolume, 0, 100, "Master Volume"),
    rollType: oneOf(source.rollType, ROLL_TYPES, "Roll Type"),
    tracks,
    motion: {
      cutoff: numberIn(motion.cutoff, 0, 127, "Cutoff"),
      resonance: numberIn(motion.resonance, 0, 127, "Resonance"),
      eg: numberIn(motion.eg, 0, 127, "EG Intensity"),
      decay: numberIn(motion.decay, 0, 127, "Decay"),
      pan: numberIn(motion.pan, -64, 63, "Motion Pan")
    }
  };
}

export function validatePattern(input) {
  const source = object(input, "Pattern");
  if (source.schemaVersion === undefined || source.schemaVersion === 1) {
    return validateV2Pattern(migrateV1Pattern(source));
  }
  return validateV2Pattern(source);
}

export function parsePattern(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Die Datei enthält kein gültiges JSON.");
  }
  return validatePattern(parsed);
}

export function resizePattern(state, nextLength) {
  const length = oneOf(Number(nextLength), PATTERN_LENGTHS, "Pattern-Länge");
  state.tracks = state.tracks.map((track) => {
    const steps = track.steps.map((step) => ({ ...step }));
    while (steps.length < length) steps.push(createStep());
    steps.length = length;
    return { ...track, steps };
  });
  state.patternLength = length;
  state.currentPage = Math.min(state.currentPage, length / 16 - 1);
  return state;
}

export function changeModel(state, nextModel) {
  const model = oneOf(nextModel, MODELS, "Modell");
  if (state.model === model) return state;
  const previousTracks = state.tracks;
  const tracks = createTracks(model, state.patternLength);

  tracks.forEach((target) => {
    const source = previousTracks.find((track) => track.id === target.id);
    if (source) Object.assign(target, structuredClone(source), { id: target.id });
  });

  const oldAccent = previousTracks.find((track) => track.id === "ACC");
  if (oldAccent && model === "emx") {
    for (const id of ["DACC", "SACC"]) {
      const target = tracks.find((track) => track.id === id);
      target.steps = oldAccent.steps.map((step) => ({ on: step.on, ghost: false }));
      target.level = oldAccent.level;
    }
  }
  if (model === "esx") {
    const target = tracks.find((track) => track.id === "ACC");
    const sources = previousTracks.filter((track) => track.id === "DACC" || track.id === "SACC");
    if (sources.length) {
      target.steps = target.steps.map((_, index) => ({ on: sources.some((track) => track.steps[index].on), ghost: false }));
      target.level = Math.max(...sources.map((track) => track.level));
    }
  }

  state.model = model;
  state.tracks = tracks;
  state.selectedPartId = tracks.some((track) => track.id === state.selectedPartId)
    ? state.selectedPartId
    : tracks[0].id;
  return state;
}

export function getAccentTrack(state, trackId) {
  const definition = getPartDefinitions(state.model).find((candidate) => candidate.id === trackId);
  if (!definition || definition.kind === "accent") return null;
  const accentDefinition = getPartDefinitions(state.model)
    .find((candidate) => candidate.kind === "accent" && candidate.accentGroup === definition.accentGroup);
  return accentDefinition ? state.tracks.find((track) => track.id === accentDefinition.id) ?? null : null;
}

export function nextStepIndex(currentStep, patternLength) {
  return (currentStep + 1) % patternLength;
}

export function getStepDurationMs(bpm, swing, stepIndex, swingEnabled = true) {
  const straight = (60_000 / bpm) / 4;
  if (!swingEnabled) return straight;
  const longShare = Math.max(0.5, Math.min(0.75, swing / 100));
  return 2 * straight * (stepIndex % 2 === 0 ? longShare : 1 - longShare);
}

export function randomStep(random = Math.random) {
  const on = random() > 0.62;
  if (!on) return createStep();
  return { on: true, ghost: random() > 0.9 };
}

export function safeFilename(value) {
  const clean = String(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "")
    .slice(0, 64);
  return clean || "korg_pattern";
}
