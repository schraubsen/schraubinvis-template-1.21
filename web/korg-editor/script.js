import {
  PARTS,
  createDefaultState,
  createPatternSteps,
  createStep,
  getStepDurationMs,
  nextStepIndex,
  parsePattern,
  randomStep,
  safeFilename,
  validatePattern
} from "./editor-core.js";

const state = createDefaultState();
const refs = {
  body: document.body,
  partTabs: document.getElementById("partTabs"),
  stepGrid: document.getElementById("stepGrid"),
  mixer: document.getElementById("mixer"),
  pageSelect: document.getElementById("pageSelect"),
  jsonPreview: document.getElementById("jsonPreview"),
  led: document.getElementById("ledDisplay"),
  status: document.getElementById("statusMessage"),
  undo: document.getElementById("undoBtn"),
  redo: document.getElementById("redoBtn")
};

let sequencerTimer = null;
let nextStepAt = 0;
let currentStep = 0;
let tapTimes = [];
let audioCtx = null;
const undoStack = [];
const redoStack = [];

function setStatus(message, type = "info") {
  refs.status.textContent = message;
  refs.status.dataset.type = type;
}

function updateHistoryButtons() {
  refs.undo.disabled = undoStack.length === 0;
  refs.redo.disabled = redoStack.length === 0;
}

function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function restoreFrom(raw) {
  const restored = typeof raw === "string" ? parsePattern(raw) : validatePattern(raw);
  stopSequencer(false);
  Object.assign(state, restored);
  currentStep = state.currentPage * 16;
  syncInputs();
  updatePageSelect();
  applyTheme(state.theme);
  setModel(state.model);
  renderAll();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state));
  restoreFrom(undoStack.pop());
  updateHistoryButtons();
  setStatus("Änderung rückgängig gemacht.");
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state));
  restoreFrom(redoStack.pop());
  updateHistoryButtons();
  setStatus("Änderung wiederhergestellt.");
}

function updateLed(status) {
  refs.led.textContent = `${state.patternName} | ${state.bpm} BPM | P${state.currentPage + 1} | ${status}`;
}

function getGlobalStepIndex(localStep) {
  return state.currentPage * 16 + localStep;
}

async function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") await audioCtx.resume();
}

function playVoice(partIdx, stepData = { on: true, accent: false, ghost: false }, when = audioCtx.currentTime) {
  const channel = state.mixer[partIdx];
  const baseFrequencies = [58, 185, 520, 235, 310, 345, 460, 92, 730, 155];
  const pitchRatio = 2 ** (channel.pitch / 12);
  const baseFrequency = baseFrequencies[partIdx] * pitchRatio;
  const cutoff = 80 * (150 ** (state.motion.cutoff / 127));
  const decay = 0.035 + (state.motion.decay / 127) * 0.32;
  const level = (state.masterVolume / 100) * (channel.level / 127);
  const velocity = stepData.ghost ? 0.42 : stepData.accent ? 1.3 : 0.82;
  const repeatCount = { Off: 1, "1/8": 2, "1/16": 3, "1/32": 4 }[state.motion.rollType] ?? 1;
  const stepSeconds = getStepDurationMs(state.bpm, state.swing, currentStep) / 1000;

  for (let repeat = 0; repeat < repeatCount; repeat++) {
    const startAt = when + repeat * (stepSeconds / repeatCount);
    const oscillator = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const panner = audioCtx.createStereoPanner();
    const dryGain = audioCtx.createGain();
    const delay = audioCtx.createDelay(0.5);
    const wetGain = audioCtx.createGain();

    oscillator.type = state.model === "emx"
      ? ["sine", "triangle", "square", "triangle"][partIdx % 4]
      : ["sine", "triangle", "square"][partIdx % 3];
    oscillator.frequency.setValueAtTime(baseFrequency, startAt);
    if (partIdx === 0) oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, baseFrequency * 0.45), startAt + decay);

    filter.type = "lowpass";
    filter.Q.value = (state.motion.resonance / 127) * 18;
    filter.frequency.setValueAtTime(Math.min(18_000, cutoff * (0.75 + state.motion.eg / 127)), startAt);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.42), startAt + decay);

    const combinedPan = Math.max(-1, Math.min(1, (channel.pan + state.motion.pan) / 64));
    panner.pan.value = combinedPan;
    const amplitude = Math.max(0.0001, Math.min(0.22, level * velocity * 0.13 / Math.sqrt(repeatCount)));
    dryGain.gain.setValueAtTime(amplitude, startAt);
    dryGain.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
    delay.delayTime.value = Math.min(0.35, stepSeconds * 1.5);
    wetGain.gain.value = (channel.fx / 127) * 0.24;

    oscillator.connect(filter);
    filter.connect(panner);
    panner.connect(dryGain).connect(audioCtx.destination);
    panner.connect(delay).connect(wetGain).connect(audioCtx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + decay + delay.delayTime.value + 0.02);
  }
}

async function audition(partIdx) {
  await ensureAudio();
  playVoice(partIdx, { on: true, accent: true, ghost: false });
}

function renderPartTabs() {
  refs.partTabs.replaceChildren();
  PARTS.forEach((name, idx) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `part-tab ${idx === state.selectedPart ? "active" : ""}`;
    button.textContent = name;
    button.setAttribute("aria-pressed", String(idx === state.selectedPart));
    button.onclick = () => {
      state.selectedPart = idx;
      renderPartTabs();
      renderSteps();
    };
    refs.partTabs.appendChild(button);
  });
}

function renderSteps() {
  refs.stepGrid.replaceChildren();
  for (let localIndex = 0; localIndex < 16; localIndex++) {
    const globalIndex = getGlobalStepIndex(localIndex);
    const stepData = state.steps[state.selectedPart][globalIndex];
    const button = document.createElement("button");
    const marker = document.createElement("small");
    button.type = "button";
    button.className = `step ${stepData.on ? "on" : ""} ${stepData.accent ? "accent" : ""} ${stepData.ghost ? "ghost" : ""} ${globalIndex === currentStep ? "current" : ""}`;
    button.dataset.step = String(globalIndex);
    button.textContent = String(localIndex + 1);
    button.setAttribute("aria-label", `Step ${globalIndex + 1}: ${stepData.on ? stepData.accent ? "Accent" : stepData.ghost ? "Ghost" : "An" : "Aus"}`);
    marker.textContent = stepData.accent ? "ACC" : stepData.ghost ? "GST" : "";
    button.appendChild(marker);

    button.onclick = (event) => {
      snapshot();
      if (event.shiftKey) {
        stepData.ghost = !stepData.ghost;
        stepData.on = stepData.on || stepData.ghost;
        if (stepData.ghost) stepData.accent = false;
      } else {
        stepData.on = !stepData.on;
        if (!stepData.on) Object.assign(stepData, createStep());
      }
      renderSteps();
      refreshJSONPreview();
    };

    button.oncontextmenu = (event) => {
      event.preventDefault();
      snapshot();
      stepData.on = true;
      stepData.accent = !stepData.accent;
      if (stepData.accent) stepData.ghost = false;
      renderSteps();
      refreshJSONPreview();
    };
    refs.stepGrid.appendChild(button);
  }
}

function historyOnControl(control) {
  control.addEventListener("pointerdown", snapshot);
  control.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) snapshot();
  });
}

function renderMixer() {
  const template = document.getElementById("mixerChannelTemplate");
  refs.mixer.replaceChildren();
  PARTS.forEach((name, idx) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const channel = state.mixer[idx];
    node.querySelector("h3").textContent = name;
    node.classList.toggle("muted", channel.mute);
    node.classList.toggle("solo", channel.solo);

    node.querySelectorAll("[data-param]").forEach((input) => {
      const key = input.dataset.param;
      input.value = channel[key];
      historyOnControl(input);
      input.oninput = () => {
        channel[key] = Number(input.value);
        refreshJSONPreview();
      };
    });

    node.querySelector('[data-action="mute"]').onclick = () => {
      snapshot();
      channel.mute = !channel.mute;
      renderMixer();
      refreshJSONPreview();
    };
    node.querySelector('[data-action="solo"]').onclick = () => {
      snapshot();
      channel.solo = !channel.solo;
      renderMixer();
      refreshJSONPreview();
    };
    node.querySelector('[data-action="audition"]').onclick = () => audition(idx);
    refs.mixer.appendChild(node);
  });
}

function refreshJSONPreview() {
  refs.jsonPreview.value = JSON.stringify(state, null, 2);
  updateLed(sequencerTimer ? "PLAY" : "EDIT");
}

function playCurrentStep() {
  const soloActive = state.mixer.some((channel) => channel.solo);
  state.steps.forEach((partSteps, partIdx) => {
    const channel = state.mixer[partIdx];
    const stepData = partSteps[currentStep];
    if (!stepData.on || channel.mute || (soloActive && !channel.solo)) return;
    playVoice(partIdx, stepData);
  });
  const page = Math.floor(currentStep / 16);
  if (page !== state.currentPage) {
    state.currentPage = page;
    refs.pageSelect.value = String(page);
  }
  renderSteps();
  updateLed("PLAY");
}

function scheduleNextStep() {
  if (!sequencerTimer) return;
  const duration = getStepDurationMs(state.bpm, state.swing, currentStep);
  nextStepAt += duration;
  sequencerTimer = setTimeout(() => {
    currentStep = nextStepIndex(currentStep, state.patternLength);
    playCurrentStep();
    scheduleNextStep();
  }, Math.max(0, nextStepAt - performance.now()));
}

async function startSequencer() {
  if (sequencerTimer) return;
  await ensureAudio();
  playCurrentStep();
  nextStepAt = performance.now();
  sequencerTimer = setTimeout(() => {}, 0);
  scheduleNextStep();
}

function stopSequencer(reset = true) {
  if (sequencerTimer) clearTimeout(sequencerTimer);
  sequencerTimer = null;
  if (reset) currentStep = state.currentPage * 16;
  renderSteps();
  updateLed("STOP");
}

function retimeSequencer() {
  if (!sequencerTimer) return;
  clearTimeout(sequencerTimer);
  nextStepAt = performance.now();
  sequencerTimer = setTimeout(() => {}, 0);
  scheduleNextStep();
}

function fillPattern(type) {
  snapshot();
  const base = state.currentPage * 16;
  const part = state.steps[state.selectedPart];
  for (let index = 0; index < 16; index++) {
    if (type === "offbeat") part[base + index] = { on: index % 2 === 1, accent: false, ghost: false };
    else if (type === "four") part[base + index] = { on: index % 4 === 0, accent: index % 8 === 0, ghost: false };
    else part[base + index] = createStep();
  }
  renderSteps();
  refreshJSONPreview();
}

function randomizePattern() {
  snapshot();
  state.steps = state.steps.map((part) => part.map(() => randomStep()));
  renderSteps();
  refreshJSONPreview();
}

function copyBar() {
  if (state.patternLength < 32) {
    setStatus("Für Page Copy zuerst 32 oder 64 Steps wählen.", "warning");
    return;
  }
  snapshot();
  const part = state.steps[state.selectedPart];
  for (let index = 0; index < 16; index++) part[index + 16] = { ...part[index] };
  renderSteps();
  refreshJSONPreview();
  setStatus("Page 1 wurde auf Page 2 kopiert.", "success");
}

function applyTheme(theme) {
  refs.body.classList.remove("theme-esx", "theme-emx", "theme-night");
  refs.body.classList.add(theme);
  state.theme = theme;
}

function setModel(model) {
  state.model = model;
  refs.body.dataset.model = model;
}

function setPatternLength(length) {
  const nextLength = Number(length);
  if (nextLength === state.patternLength) return;
  snapshot();
  state.steps = state.steps.map((part) => {
    const clone = part.map((step) => ({ ...step }));
    while (clone.length < nextLength) clone.push(createStep());
    clone.length = nextLength;
    return clone;
  });
  state.patternLength = nextLength;
  state.currentPage = Math.min(state.currentPage, nextLength / 16 - 1);
  currentStep = state.currentPage * 16;
  updatePageSelect();
  renderSteps();
  refreshJSONPreview();
}

function updatePageSelect() {
  refs.pageSelect.replaceChildren();
  for (let page = 0; page < state.patternLength / 16; page++) {
    const option = document.createElement("option");
    option.value = String(page);
    option.textContent = `Page ${page + 1}`;
    refs.pageSelect.appendChild(option);
  }
  refs.pageSelect.value = String(state.currentPage);
}

function saveLocal() {
  try {
    localStorage.setItem("korgEditorPattern", JSON.stringify(state));
    updateLed("SAVED");
    setStatus("Pattern wurde lokal gespeichert.", "success");
  } catch {
    setStatus("Lokales Speichern ist in diesem Browser nicht verfügbar.", "error");
  }
}

function loadLocal() {
  try {
    const data = localStorage.getItem("korgEditorPattern");
    if (!data) {
      setStatus("Noch kein lokales Pattern vorhanden.", "warning");
      return;
    }
    snapshot();
    restoreFrom(data);
    updateLed("LOADED");
    setStatus("Lokales Pattern geladen und geprüft.", "success");
  } catch (error) {
    setStatus(`Laden fehlgeschlagen: ${error.message}`, "error");
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(state.patternName)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("Geprüftes Pattern als JSON exportiert.", "success");
}

function importJSON(file) {
  if (file.size > 2_000_000) {
    setStatus("Import abgelehnt: Datei ist größer als 2 MB.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parsePattern(String(reader.result));
      snapshot();
      restoreFrom(imported);
      updateLed("IMPORTED");
      setStatus("Pattern importiert und vollständig geprüft.", "success");
    } catch (error) {
      setStatus(`Import abgelehnt: ${error.message}`, "error");
    }
  };
  reader.onerror = () => setStatus("Import fehlgeschlagen: Datei konnte nicht gelesen werden.", "error");
  reader.readAsText(file);
}

function syncInputs() {
  document.getElementById("modelSelect").value = state.model;
  document.getElementById("themeSelect").value = state.theme;
  document.getElementById("patternName").value = state.patternName;
  document.getElementById("bpmInput").value = String(state.bpm);
  document.getElementById("swingInput").value = String(state.swing);
  document.getElementById("patternLength").value = String(state.patternLength);
  document.getElementById("masterVolume").value = String(state.masterVolume);
  Object.entries(state.motion).forEach(([key, value]) => {
    const element = document.getElementById(key);
    if (element) element.value = String(value);
  });
}

function renderAll() {
  renderPartTabs();
  renderSteps();
  renderMixer();
  refreshJSONPreview();
  updateHistoryButtons();
}

function bindEvents() {
  const model = document.getElementById("modelSelect");
  const theme = document.getElementById("themeSelect");
  const patternName = document.getElementById("patternName");
  const bpm = document.getElementById("bpmInput");
  const swing = document.getElementById("swingInput");
  const master = document.getElementById("masterVolume");

  model.onchange = (event) => { snapshot(); setModel(event.target.value); refreshJSONPreview(); };
  theme.onchange = (event) => { snapshot(); applyTheme(event.target.value); refreshJSONPreview(); };
  patternName.onfocus = snapshot;
  patternName.oninput = (event) => {
    state.patternName = event.target.value.slice(0, 80) || "Unbenannt";
    refreshJSONPreview();
  };
  bpm.onfocus = snapshot;
  bpm.oninput = (event) => {
    const value = Number(event.target.value);
    if (value >= 40 && value <= 240) {
      state.bpm = value;
      retimeSequencer();
      refreshJSONPreview();
      event.target.setCustomValidity("");
    } else event.target.setCustomValidity("BPM muss zwischen 40 und 240 liegen.");
  };
  historyOnControl(swing);
  swing.oninput = (event) => { state.swing = Number(event.target.value); retimeSequencer(); refreshJSONPreview(); };
  document.getElementById("patternLength").onchange = (event) => setPatternLength(event.target.value);
  refs.pageSelect.onchange = (event) => {
    state.currentPage = Number(event.target.value);
    currentStep = state.currentPage * 16;
    renderSteps();
    refreshJSONPreview();
  };
  historyOnControl(master);
  master.oninput = (event) => { state.masterVolume = Number(event.target.value); refreshJSONPreview(); };

  ["cutoff", "resonance", "eg", "decay", "pan", "rollType"].forEach((key) => {
    const control = document.getElementById(key);
    if (control.type === "range") historyOnControl(control);
    control.onchange = control.type === "range" ? null : snapshot;
    control.oninput = (event) => {
      state.motion[key] = key === "rollType" ? event.target.value : Number(event.target.value);
      refreshJSONPreview();
    };
  });

  document.getElementById("playBtn").onclick = startSequencer;
  document.getElementById("stopBtn").onclick = () => stopSequencer();
  document.getElementById("tapBtn").onclick = () => {
    const now = Date.now();
    if (tapTimes.length && now - tapTimes.at(-1) > 2_000) tapTimes = [];
    tapTimes.push(now);
    tapTimes = tapTimes.slice(-4);
    if (tapTimes.length >= 2) {
      const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
      const nextBpm = Math.round(60_000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
      if (nextBpm >= 40 && nextBpm <= 240) {
        snapshot();
        state.bpm = nextBpm;
        bpm.value = String(nextBpm);
        retimeSequencer();
        refreshJSONPreview();
      }
    }
  };

  document.getElementById("newPatternBtn").onclick = () => {
    snapshot();
    state.steps = createPatternSteps(state.patternLength);
    renderSteps();
    refreshJSONPreview();
    setStatus("Leeres Pattern angelegt.", "success");
  };
  document.getElementById("randomizeBtn").onclick = randomizePattern;
  document.getElementById("copyBarBtn").onclick = copyBar;
  refs.undo.onclick = undo;
  refs.redo.onclick = redo;
  document.querySelectorAll("[data-fill]").forEach((button) => { button.onclick = () => fillPattern(button.dataset.fill); });
  document.getElementById("saveLocalBtn").onclick = saveLocal;
  document.getElementById("loadLocalBtn").onclick = loadLocal;
  document.getElementById("exportBtn").onclick = exportJSON;
  document.getElementById("importInput").onchange = (event) => {
    const file = event.target.files?.[0];
    if (file) importJSON(file);
    event.target.value = "";
  };

  document.addEventListener("keydown", (event) => {
    const interactive = event.target.closest("input, select, textarea, button");
    if (interactive) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (sequencerTimer) stopSequencer(); else startSequencer();
    } else if (event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if (event.key.toLowerCase() === "y" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      redo();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      state.currentPage = Math.max(0, Math.min(state.patternLength / 16 - 1, state.currentPage + direction));
      refs.pageSelect.value = String(state.currentPage);
      currentStep = state.currentPage * 16;
      renderSteps();
    }
  });
}

bindEvents();
syncInputs();
updatePageSelect();
applyTheme(state.theme);
setModel(state.model);
renderAll();
updateLed("READY");
setStatus("Editor bereit. Änderungen werden vor Import und Laden geprüft.", "success");
