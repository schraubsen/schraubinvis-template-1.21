import {
  changeModel,
  createDefaultState,
  createStep,
  createTracks,
  getAccentTrack,
  getPartDefinitions,
  getStepDurationMs,
  nextStepIndex,
  parsePattern,
  randomStep,
  resizePattern,
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

function getSelectedTrack() {
  return state.tracks.find((track) => track.id === state.selectedPartId);
}

function getSelectedDefinition() {
  return getPartDefinitions(state.model).find((definition) => definition.id === state.selectedPartId);
}

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

function playVoice(partIdx, track, stepData = { on: true, ghost: false }, accented = false, accentLevel = 0, when = audioCtx.currentTime) {
  const baseFrequencies = [58, 185, 520, 235, 310, 345, 460, 92, 730, 155];
  const pitchRatio = 2 ** (track.pitch / 12);
  const baseFrequency = (baseFrequencies[partIdx % baseFrequencies.length] ?? 220) * pitchRatio;
  const cutoff = 80 * (150 ** (state.motion.cutoff / 127));
  const decay = 0.035 + (state.motion.decay / 127) * 0.32;
  const level = (state.masterVolume / 100) * (track.level / 127);
  const accentBoost = 1 + (accentLevel / 127) * 0.6;
  const velocity = stepData.ghost ? 0.42 : accented ? 0.82 * accentBoost : 0.82;
  const repeatCount = track.rollEnabled ? state.rollType : 1;
  const stepSeconds = getStepDurationMs(state.bpm, state.swing, currentStep, track.swingEnabled) / 1000;

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

    const combinedPan = Math.max(-1, Math.min(1, (track.pan + state.motion.pan) / 64));
    panner.pan.value = combinedPan;
    const amplitude = Math.max(0.0001, Math.min(0.22, level * velocity * 0.13 / Math.sqrt(repeatCount)));
    dryGain.gain.setValueAtTime(amplitude, startAt);
    dryGain.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
    delay.delayTime.value = Math.min(0.35, stepSeconds * 1.5);
    wetGain.gain.value = (track.fx / 127) * 0.24;

    oscillator.connect(filter);
    filter.connect(panner);
    panner.connect(dryGain).connect(audioCtx.destination);
    panner.connect(delay).connect(wetGain).connect(audioCtx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + decay + delay.delayTime.value + 0.02);
  }
}

function getSwingDelaySeconds(track, stepIndex) {
  if (!track.swingEnabled || stepIndex % 2 === 0) return 0;
  const straightSeconds = (60 / state.bpm) / 4;
  return 2 * straightSeconds * (state.swing / 100 - 0.5);
}

async function audition(partIdx) {
  await ensureAudio();
  const track = state.tracks[partIdx];
  const accentTrack = getAccentTrack(state, track.id);
  playVoice(partIdx, track, { on: true, ghost: false }, true, accentTrack?.level ?? 0);
}

function renderPartTabs() {
  refs.partTabs.replaceChildren();
  getPartDefinitions(state.model).forEach((definition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `part-tab ${definition.id === state.selectedPartId ? "active" : ""} ${definition.kind === "accent" ? "accent-part" : ""}`;
    button.textContent = definition.name;
    button.dataset.partId = definition.id;
    button.setAttribute("aria-pressed", String(definition.id === state.selectedPartId));
    button.onclick = () => {
      state.selectedPartId = definition.id;
      renderPartTabs();
      renderSteps();
      refreshJSONPreview();
    };
    refs.partTabs.appendChild(button);
  });
}

function renderSteps() {
  refs.stepGrid.replaceChildren();
  const track = getSelectedTrack();
  const definition = getSelectedDefinition();
  const accentTrack = getAccentTrack(state, track.id);
  for (let localIndex = 0; localIndex < 16; localIndex++) {
    const globalIndex = getGlobalStepIndex(localIndex);
    const stepData = track.steps[globalIndex];
    const accented = definition.kind !== "accent" && track.accentEnabled && accentTrack?.steps[globalIndex].on;
    const button = document.createElement("button");
    const marker = document.createElement("small");
    button.type = "button";
    button.className = `step ${stepData.on ? "on" : ""} ${accented ? "accent" : ""} ${stepData.ghost ? "ghost" : ""} ${definition.kind === "accent" ? "accent-lane" : ""} ${globalIndex === currentStep ? "current" : ""}`;
    button.dataset.step = String(globalIndex);
    button.textContent = String(localIndex + 1);
    button.setAttribute("aria-label", `${definition.name} Step ${globalIndex + 1}: ${stepData.on ? definition.kind === "accent" || accented ? "Accent" : stepData.ghost ? "Ghost" : "An" : "Aus"}`);
    marker.textContent = definition.kind === "accent" && stepData.on ? "ACC" : accented ? "ACC" : stepData.ghost ? "GST" : "";
    button.appendChild(marker);

    button.onclick = (event) => {
      snapshot();
      if (event.shiftKey && definition.kind !== "accent") {
        stepData.ghost = !stepData.ghost;
        stepData.on = stepData.on || stepData.ghost;
      } else {
        stepData.on = !stepData.on;
        if (!stepData.on) Object.assign(stepData, createStep());
      }
      renderSteps();
      refreshJSONPreview();
    };

    button.oncontextmenu = (event) => {
      event.preventDefault();
      if (definition.kind === "accent" || !accentTrack) return;
      snapshot();
      stepData.on = true;
      stepData.ghost = false;
      accentTrack.steps[globalIndex].on = !accentTrack.steps[globalIndex].on;
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
  getPartDefinitions(state.model).forEach((definition, idx) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const track = state.tracks[idx];
    const accent = definition.kind === "accent";
    node.dataset.partId = definition.id;
    node.querySelector("h3").textContent = definition.name;
    node.classList.toggle("muted", track.mute);
    node.classList.toggle("solo", track.solo);
    node.classList.toggle("accent-channel", accent);
    node.querySelectorAll("[data-non-accent]").forEach((element) => { element.hidden = accent; });
    const levelLabel = node.querySelector('[data-control="level"]');
    if (accent) levelLabel.firstChild.textContent = "Accent Level";

    node.querySelectorAll("[data-param]").forEach((input) => {
      const key = input.dataset.param;
      input.value = track[key];
      historyOnControl(input);
      input.oninput = () => {
        track[key] = Number(input.value);
        refreshJSONPreview();
      };
    });

    const bindToggle = (action, key) => {
      const button = node.querySelector(`[data-action="${action}"]`);
      if (!button) return;
      button.classList.toggle("active", track[key]);
      button.setAttribute("aria-pressed", String(track[key]));
      button.onclick = () => {
        snapshot();
        track[key] = !track[key];
        renderMixer();
        if (key === "accentEnabled") renderSteps();
        refreshJSONPreview();
      };
    };
    bindToggle("mute", "mute");
    bindToggle("solo", "solo");
    bindToggle("swing", "swingEnabled");
    bindToggle("roll", "rollEnabled");
    bindToggle("accent", "accentEnabled");
    const auditionButton = node.querySelector('[data-action="audition"]');
    if (auditionButton) auditionButton.onclick = () => audition(idx);
    refs.mixer.appendChild(node);
  });
}

function refreshJSONPreview() {
  refs.jsonPreview.value = JSON.stringify(state, null, 2);
  updateLed(sequencerTimer ? "PLAY" : "EDIT");
}

function playCurrentStep() {
  const definitions = getPartDefinitions(state.model);
  const soloActive = state.tracks.some((track, index) => definitions[index].kind !== "accent" && track.solo);
  state.tracks.forEach((track, partIdx) => {
    const definition = definitions[partIdx];
    if (definition.kind === "accent") return;
    const stepData = track.steps[currentStep];
    if (!stepData.on || track.mute || (soloActive && !track.solo)) return;
    const accentTrack = getAccentTrack(state, track.id);
    const accented = track.accentEnabled && Boolean(accentTrack?.steps[currentStep].on);
    const when = audioCtx.currentTime + getSwingDelaySeconds(track, currentStep);
    playVoice(partIdx, track, stepData, accented, accentTrack?.level ?? 0, when);
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
  const duration = getStepDurationMs(state.bpm, 50, currentStep, false);
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
  const track = getSelectedTrack();
  const accent = getSelectedDefinition().kind === "accent";
  for (let index = 0; index < 16; index++) {
    if (type === "offbeat") track.steps[base + index] = { on: index % 2 === 1, ghost: false };
    else if (type === "four") track.steps[base + index] = { on: index % 4 === 0, ghost: false };
    else track.steps[base + index] = createStep();
    if (accent) track.steps[base + index].ghost = false;
  }
  renderSteps();
  refreshJSONPreview();
}

function randomizePattern() {
  snapshot();
  const definitions = getPartDefinitions(state.model);
  state.tracks = state.tracks.map((track, index) => ({
    ...track,
    steps: track.steps.map(() => definitions[index].kind === "accent"
      ? { on: Math.random() > 0.82, ghost: false }
      : randomStep())
  }));
  renderMixer();
  renderSteps();
  refreshJSONPreview();
}

function copyBar() {
  if (state.patternLength < 32) {
    setStatus("Für Page Copy mindestens 32 Steps wählen.", "warning");
    return;
  }
  snapshot();
  const track = getSelectedTrack();
  for (let index = 0; index < 16; index++) track.steps[index + 16] = { ...track.steps[index] };
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
  resizePattern(state, nextLength);
  currentStep = state.currentPage * 16;
  updatePageSelect();
  renderMixer();
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
  const checked = validatePattern(state);
  Object.assign(state, checked);
  const blob = new Blob([JSON.stringify(checked, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.machineName}_${safeFilename(state.patternName)}.json`;
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
  document.getElementById("machineName").value = state.machineName;
  document.getElementById("bpmInput").value = String(state.bpm);
  document.getElementById("swingInput").value = String(state.swing);
  document.getElementById("swingValue").textContent = String(state.swing);
  document.getElementById("patternLength").value = String(state.patternLength);
  document.getElementById("masterVolume").value = String(state.masterVolume);
  document.getElementById("rollType").value = String(state.rollType);
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
  const machineName = document.getElementById("machineName");
  const bpm = document.getElementById("bpmInput");
  const swing = document.getElementById("swingInput");
  const master = document.getElementById("masterVolume");

  model.onchange = (event) => {
    snapshot();
    changeModel(state, event.target.value);
    setModel(state.model);
    syncInputs();
    renderAll();
    setStatus(`${state.model.toUpperCase()}-Partstruktur geladen. Gemeinsame Parts wurden übernommen.`, "success");
  };
  theme.onchange = (event) => { snapshot(); applyTheme(event.target.value); refreshJSONPreview(); };
  patternName.onfocus = snapshot;
  patternName.oninput = (event) => {
    state.patternName = event.target.value.slice(0, 80) || "Unbenannt";
    refreshJSONPreview();
  };
  machineName.onfocus = snapshot;
  machineName.oninput = (event) => {
    const value = event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 8);
    event.target.value = value;
    if (value) {
      state.machineName = value;
      event.target.setCustomValidity("");
      refreshJSONPreview();
    } else {
      event.target.setCustomValidity("Korg-Name darf nicht leer sein.");
    }
  };
  machineName.onblur = () => {
    if (!machineName.value) machineName.value = state.machineName;
    machineName.setCustomValidity("");
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
  swing.oninput = (event) => {
    state.swing = Number(event.target.value);
    document.getElementById("swingValue").textContent = String(state.swing);
    refreshJSONPreview();
  };
  document.getElementById("patternLength").onchange = (event) => setPatternLength(event.target.value);
  refs.pageSelect.onchange = (event) => {
    state.currentPage = Number(event.target.value);
    currentStep = state.currentPage * 16;
    renderSteps();
    refreshJSONPreview();
  };
  historyOnControl(master);
  master.oninput = (event) => { state.masterVolume = Number(event.target.value); refreshJSONPreview(); };

  ["cutoff", "resonance", "eg", "decay", "pan"].forEach((key) => {
    const control = document.getElementById(key);
    historyOnControl(control);
    control.oninput = (event) => {
      state.motion[key] = Number(event.target.value);
      refreshJSONPreview();
    };
  });
  const rollType = document.getElementById("rollType");
  rollType.onchange = (event) => {
    snapshot();
    state.rollType = Number(event.target.value);
    refreshJSONPreview();
  };

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
    state.tracks = createTracks(state.model, state.patternLength);
    state.selectedPartId = state.tracks[0].id;
    renderAll();
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
