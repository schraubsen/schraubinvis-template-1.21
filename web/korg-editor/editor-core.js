export const PARTS = ["KICK", "SNARE", "HH", "CLAP", "PERC", "SYNTH 1", "SYNTH 2", "BASS", "FX", "AUDIO IN"];
export const SCHEMA_VERSION = 1;
export const PATTERN_LENGTHS = [16, 32, 64];
export const THEMES = ["theme-esx", "theme-emx", "theme-night"];
export const MODELS = ["esx", "emx"];
export const ROLL_TYPES = ["Off", "1/8", "1/16", "1/32"];

export const createStep = () => ({ on: false, accent: false, ghost: false });
export const createPatternSteps = (length) => PARTS.map(() => Array.from({ length }, createStep));

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    model: "esx",
    theme: "theme-esx",
    patternName: "A.01 Detroit Bounce",
    bpm: 128,
    swing: 12,
    patternLength: 16,
    currentPage: 0,
    selectedPart: 0,
    masterVolume: 72,
    steps: createPatternSteps(16),
    mixer: PARTS.map(() => ({ level: 100, pitch: 0, pan: 0, fx: 20, mute: false, solo: false })),
    motion: { cutoff: 78, resonance: 35, eg: 49, decay: 72, pan: 0, rollType: "Off" }
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

export function normalizeStep(value, label = "Step") {
  const source = object(value, label);
  const on = bool(source.on, `${label}.on`);
  const accent = on && bool(source.accent, `${label}.accent`);
  const ghost = on && !accent && bool(source.ghost, `${label}.ghost`);
  return { on, accent, ghost };
}

export function validatePattern(input) {
  const source = object(input, "Pattern");
  const schemaVersion = source.schemaVersion ?? SCHEMA_VERSION;
  if (schemaVersion !== SCHEMA_VERSION) throw new Error(`Nicht unterstützte Pattern-Version: ${schemaVersion}.`);

  const patternLength = oneOf(source.patternLength, PATTERN_LENGTHS, "Pattern-Länge");
  const pageCount = patternLength / 16;
  const patternName = typeof source.patternName === "string" ? source.patternName.trim() : "";
  if (!patternName || patternName.length > 80) throw new Error("Pattern-Name muss 1 bis 80 Zeichen enthalten.");

  if (!Array.isArray(source.steps) || source.steps.length !== PARTS.length) {
    throw new Error(`Steps müssen genau ${PARTS.length} Parts enthalten.`);
  }
  const steps = source.steps.map((part, partIndex) => {
    if (!Array.isArray(part) || part.length !== patternLength) {
      throw new Error(`${PARTS[partIndex]} muss genau ${patternLength} Steps enthalten.`);
    }
    return part.map((step, stepIndex) => normalizeStep(step, `${PARTS[partIndex]} Step ${stepIndex + 1}`));
  });

  if (!Array.isArray(source.mixer) || source.mixer.length !== PARTS.length) {
    throw new Error(`Mixer muss genau ${PARTS.length} Kanäle enthalten.`);
  }
  const mixer = source.mixer.map((raw, index) => {
    const channel = object(raw, `${PARTS[index]} Mixer`);
    return {
      level: numberIn(channel.level, 0, 127, `${PARTS[index]} Level`),
      pitch: numberIn(channel.pitch, -24, 24, `${PARTS[index]} Pitch`),
      pan: numberIn(channel.pan, -64, 63, `${PARTS[index]} Pan`),
      fx: numberIn(channel.fx, 0, 127, `${PARTS[index]} FX Send`),
      mute: bool(channel.mute, `${PARTS[index]} Mute`),
      solo: bool(channel.solo, `${PARTS[index]} Solo`)
    };
  });

  const motion = object(source.motion, "Motion");
  return {
    schemaVersion,
    model: oneOf(source.model, MODELS, "Modell"),
    theme: oneOf(source.theme, THEMES, "Theme"),
    patternName,
    bpm: numberIn(source.bpm, 40, 240, "BPM"),
    swing: numberIn(source.swing, 0, 100, "Swing"),
    patternLength,
    currentPage: integerIn(source.currentPage, 0, pageCount - 1, "Step-Seite"),
    selectedPart: integerIn(source.selectedPart, 0, PARTS.length - 1, "Ausgewählter Part"),
    masterVolume: numberIn(source.masterVolume, 0, 100, "Master Volume"),
    steps,
    mixer,
    motion: {
      cutoff: numberIn(motion.cutoff, 0, 127, "Cutoff"),
      resonance: numberIn(motion.resonance, 0, 127, "Resonance"),
      eg: numberIn(motion.eg, 0, 127, "EG Intensity"),
      decay: numberIn(motion.decay, 0, 127, "Decay"),
      pan: numberIn(motion.pan, -64, 63, "Motion Pan"),
      rollType: oneOf(motion.rollType, ROLL_TYPES, "Roll Type")
    }
  };
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

export function nextStepIndex(currentStep, patternLength) {
  return (currentStep + 1) % patternLength;
}

export function getStepDurationMs(bpm, swing, stepIndex) {
  const straight = (60_000 / bpm) / 4;
  const offset = Math.min(0.45, swing / 200);
  return straight * (stepIndex % 2 === 0 ? 1 + offset : 1 - offset);
}

export function randomStep(random = Math.random) {
  const on = random() > 0.62;
  if (!on) return createStep();
  const accent = random() > 0.87;
  return { on: true, accent, ghost: !accent && random() > 0.9 };
}

export function safeFilename(value) {
  const clean = String(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "")
    .slice(0, 64);
  return clean || "korg_pattern";
}
