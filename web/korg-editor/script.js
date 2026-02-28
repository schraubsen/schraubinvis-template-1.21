const PARTS = ["KICK", "SNARE", "HH", "CLAP", "PERC", "SYNTH 1", "SYNTH 2", "BASS", "FX", "AUDIO IN"];

const createStep = () => ({ on: false, accent: false, ghost: false });
const createPatternSteps = (length) => PARTS.map(() => Array.from({ length }, createStep));

const state = {
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

const refs = {
  body: document.body,
  partTabs: document.getElementById("partTabs"),
  stepGrid: document.getElementById("stepGrid"),
  mixer: document.getElementById("mixer"),
  pageSelect: document.getElementById("pageSelect"),
  jsonPreview: document.getElementById("jsonPreview"),
  led: document.getElementById("ledDisplay")
};

let sequencerTimer = null;
let currentStep = 0;
let tapTimes = [];
let audioCtx = null;
const undoStack = [];
const redoStack = [];

function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
}

function restoreFrom(raw) {
  const parsed = JSON.parse(raw);
  Object.assign(state, parsed);
  syncInputs();
  updatePageSelect();
  applyTheme(state.theme);
  setModel(state.model);
  renderPartTabs();
  renderSteps();
  renderMixer();
  refreshJSONPreview();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state));
  restoreFrom(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state));
  restoreFrom(redoStack.pop());
}

function updateLed(status) {
  const page = state.currentPage + 1;
  refs.led.textContent = `${state.patternName} | ${state.bpm} BPM | P${page} | ${status}`;
}

function getGlobalStepIndex(localStep) {
  return state.currentPage * 16 + localStep;
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTick(partIdx, isAccent = false) {
  ensureAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const base = 90 + partIdx * 28;
  osc.frequency.value = isAccent ? base + 80 : base;
  gain.gain.value = (state.masterVolume / 100) * (isAccent ? 0.08 : 0.05);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.045);
}

function renderPartTabs() {
  refs.partTabs.innerHTML = "";
  PARTS.forEach((name, idx) => {
    const btn = document.createElement("button");
    btn.className = `part-tab ${idx === state.selectedPart ? "active" : ""}`;
    btn.textContent = name;
    btn.onclick = () => {
      state.selectedPart = idx;
      renderPartTabs();
      renderSteps();
      renderMixer();
    };
    refs.partTabs.appendChild(btn);
  });
}

function renderSteps() {
  refs.stepGrid.innerHTML = "";
  for (let localIdx = 0; localIdx < 16; localIdx++) {
    const globalIdx = getGlobalStepIndex(localIdx);
    const stepData = state.steps[state.selectedPart][globalIdx];
    const step = document.createElement("button");
    step.className = `step ${stepData.on ? "on" : ""} ${stepData.accent ? "accent" : ""} ${stepData.ghost ? "ghost" : ""} ${globalIdx === currentStep ? "current" : ""}`;
    step.innerHTML = `${localIdx + 1}<small>${stepData.accent ? "ACC" : stepData.ghost ? "GST" : ""}</small>`;

    step.onclick = (e) => {
      snapshot();
      if (e.shiftKey) {
        stepData.ghost = !stepData.ghost;
        if (stepData.ghost) stepData.on = true;
      } else {
        stepData.on = !stepData.on;
        if (!stepData.on) {
          stepData.accent = false;
          stepData.ghost = false;
        }
      }
      renderSteps();
      refreshJSONPreview();
    };

    step.oncontextmenu = (e) => {
      e.preventDefault();
      snapshot();
      if (!stepData.on) stepData.on = true;
      stepData.accent = !stepData.accent;
      if (stepData.accent) stepData.ghost = false;
      renderSteps();
      refreshJSONPreview();
    };

    refs.stepGrid.appendChild(step);
  }
}

function renderMixer() {
  const template = document.getElementById("mixerChannelTemplate");
  refs.mixer.innerHTML = "";
  PARTS.forEach((name, idx) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = name;
    const channel = state.mixer[idx];

    if (channel.mute) node.classList.add("muted");
    if (channel.solo) node.classList.add("solo");

    node.querySelectorAll("[data-param]").forEach((input) => {
      const key = input.dataset.param;
      input.value = channel[key];
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
    node.querySelector('[data-action="audition"]').onclick = () => playTick(idx, true);

    refs.mixer.appendChild(node);
  });
}

function refreshJSONPreview() {
  refs.jsonPreview.value = JSON.stringify(state, null, 2);
}

function nextStep() {
  currentStep = (currentStep + 1) % state.patternLength;
  const soloActive = state.mixer.some((c) => c.solo);
  state.steps.forEach((partSteps, partIdx) => {
    const channel = state.mixer[partIdx];
    const step = partSteps[currentStep];
    if (!step?.on) return;
    if (channel.mute) return;
    if (soloActive && !channel.solo) return;
    playTick(partIdx, step.accent);
  });
  renderSteps();
  updateLed("PLAY");
}

function startSequencer() {
  stopSequencer(false);
  const stepMs = (60_000 / state.bpm) / 4;
  sequencerTimer = setInterval(nextStep, stepMs);
  updateLed("PLAY");
}

function stopSequencer(reset = true) {
  if (sequencerTimer) clearInterval(sequencerTimer);
  sequencerTimer = null;
  if (reset) currentStep = state.currentPage * 16;
  renderSteps();
  updateLed("STOP");
}

function fillPattern(type) {
  snapshot();
  const base = state.currentPage * 16;
  const steps = state.steps[state.selectedPart];
  for (let i = 0; i < 16; i++) {
    if (type === "offbeat") steps[base + i] = { on: i % 2 === 1, accent: false, ghost: false };
    else if (type === "four") steps[base + i] = { on: i % 4 === 0, accent: i % 8 === 0, ghost: false };
    else steps[base + i] = createStep();
  }
  renderSteps();
  refreshJSONPreview();
}

function randomizePattern() {
  snapshot();
  state.steps = state.steps.map((part) => part.map(() => ({
    on: Math.random() > 0.62,
    accent: Math.random() > 0.87,
    ghost: Math.random() > 0.9
  })));
  renderSteps();
  refreshJSONPreview();
}

function copyBar() {
  snapshot();
  if (state.patternLength < 32) return;
  const steps = state.steps[state.selectedPart];
  for (let i = 0; i < 16; i++) steps[i + 16] = { ...steps[i] };
  renderSteps();
  refreshJSONPreview();
}

function applyTheme(theme) {
  refs.body.classList.remove("theme-esx", "theme-emx", "theme-night");
  refs.body.classList.add(theme);
  state.theme = theme;
}

function setModel(model) {
  state.model = model;
  refs.body.style.filter = model === "emx" ? "hue-rotate(16deg) saturate(1.15)" : "none";
}

function setPatternLength(length) {
  snapshot();
  const nextLength = Number(length);
  const previous = state.patternLength;
  if (nextLength === previous) return;
  state.steps = state.steps.map((part) => {
    const clone = [...part];
    if (nextLength > previous) {
      while (clone.length < nextLength) clone.push(createStep());
    } else {
      clone.length = nextLength;
    }
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
  refs.pageSelect.innerHTML = "";
  const pages = state.patternLength / 16;
  for (let i = 0; i < pages; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `Page ${i + 1}`;
    refs.pageSelect.appendChild(opt);
  }
  refs.pageSelect.value = String(state.currentPage);
}

function saveLocal() {
  localStorage.setItem("korgEditorPattern", JSON.stringify(state));
  updateLed("SAVED");
}

function loadLocal() {
  const data = localStorage.getItem("korgEditorPattern");
  if (!data) return;
  restoreFrom(data);
  updateLed("LOADED");
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.patternName.replace(/\s+/g, "_") || "korg_pattern"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => restoreFrom(String(reader.result));
  reader.readAsText(file);
}

function syncInputs() {
  document.getElementById("modelSelect").value = state.model;
  document.getElementById("themeSelect").value = state.theme;
  document.getElementById("patternName").value = state.patternName;
  document.getElementById("bpmInput").value = state.bpm;
  document.getElementById("swingInput").value = state.swing;
  document.getElementById("patternLength").value = String(state.patternLength);
  document.getElementById("masterVolume").value = String(state.masterVolume);
  Object.entries(state.motion).forEach(([k, v]) => {
    const el = document.getElementById(k);
    if (el) el.value = v;
  });
}

function bindEvents() {
  document.getElementById("modelSelect").onchange = (e) => { setModel(e.target.value); refreshJSONPreview(); };
  document.getElementById("themeSelect").onchange = (e) => { applyTheme(e.target.value); refreshJSONPreview(); };
  document.getElementById("patternName").oninput = (e) => { state.patternName = e.target.value; updateLed("EDIT"); refreshJSONPreview(); };
  document.getElementById("bpmInput").oninput = (e) => {
    state.bpm = Number(e.target.value);
    if (sequencerTimer) startSequencer();
    refreshJSONPreview();
  };
  document.getElementById("swingInput").oninput = (e) => { state.swing = Number(e.target.value); refreshJSONPreview(); };
  document.getElementById("patternLength").onchange = (e) => setPatternLength(e.target.value);
  document.getElementById("pageSelect").onchange = (e) => {
    state.currentPage = Number(e.target.value);
    currentStep = state.currentPage * 16;
    renderSteps();
    refreshJSONPreview();
  };
  document.getElementById("masterVolume").oninput = (e) => { state.masterVolume = Number(e.target.value); refreshJSONPreview(); };

  ["cutoff", "resonance", "eg", "decay", "pan", "rollType"].forEach((key) => {
    document.getElementById(key).oninput = (e) => {
      state.motion[key] = key === "rollType" ? e.target.value : Number(e.target.value);
      refreshJSONPreview();
    };
  });

  document.getElementById("playBtn").onclick = startSequencer;
  document.getElementById("stopBtn").onclick = () => stopSequencer();

  document.getElementById("tapBtn").onclick = () => {
    const now = Date.now();
    tapTimes.push(now);
    if (tapTimes.length > 4) tapTimes = tapTimes.slice(-4);
    if (tapTimes.length >= 2) {
      const intervals = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60_000 / avg);
      if (bpm >= 40 && bpm <= 240) {
        state.bpm = bpm;
        document.getElementById("bpmInput").value = bpm;
        if (sequencerTimer) startSequencer();
      }
    }
    refreshJSONPreview();
  };

  document.getElementById("newPatternBtn").onclick = () => {
    snapshot();
    state.steps = createPatternSteps(state.patternLength);
    renderSteps();
    refreshJSONPreview();
  };
  document.getElementById("randomizeBtn").onclick = randomizePattern;
  document.getElementById("copyBarBtn").onclick = copyBar;
  document.getElementById("undoBtn").onclick = undo;
  document.getElementById("redoBtn").onclick = redo;

  document.querySelectorAll("[data-fill]").forEach((btn) => {
    btn.onclick = () => fillPattern(btn.dataset.fill);
  });

  document.getElementById("saveLocalBtn").onclick = saveLocal;
  document.getElementById("loadLocalBtn").onclick = loadLocal;
  document.getElementById("exportBtn").onclick = exportJSON;
  document.getElementById("importInput").onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) importJSON(file);
  };

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (sequencerTimer) stopSequencer(); else startSequencer();
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) undo();
    if (e.key === "y" && (e.ctrlKey || e.metaKey)) redo();
    if (e.key === "ArrowRight") {
      const maxPage = state.patternLength / 16 - 1;
      state.currentPage = Math.min(state.currentPage + 1, maxPage);
      refs.pageSelect.value = String(state.currentPage);
      currentStep = state.currentPage * 16;
      renderSteps();
    }
    if (e.key === "ArrowLeft") {
      state.currentPage = Math.max(state.currentPage - 1, 0);
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
renderPartTabs();
renderSteps();
renderMixer();
refreshJSONPreview();
updateLed("READY");
