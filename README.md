# RFTrec Client Template

This repository provides a minimal Fabric 1.21.5 client template for the RFTrec PvP mod.

## Project structure

```text
src/main/java/com/rftrec/
  RFTrecClient.java      - main entrypoint
  gui/                   - GUI classes
  modules/               - individual modules
  cosmetics/             - cosmetic renderers
  framework/             - basic module system
```

The project is configured via Gradle for Minecraft `1.21.5`, Fabric Loom `1.10.5` and Fabric API `0.119.5+1.21.5`.

## KORG ESX/EMX-1 Web Editor

The standalone browser editor lives in `web/korg-editor/`. It is a pattern designer and WebAudio preview for rapid ESX/EMX-oriented sequencing work.

Current features:

- ESX/EMX preview modes and three hardware-inspired themes
- model-specific 16-part layouts: 9 drums plus the ESX sample parts and accent lane, or 5 EMX synths plus separate drum/synth accent lanes
- 16 to 128 steps in 16-step pages, including the intermediate 48/80/96/112 lengths
- normal and ghost hits plus hardware-style accent step patterns and per-part Accent switches
- KORG-style Swing 50–75 with a separate Swing switch for every playable part
- Roll types 2/3/4 with a separate Roll switch for every playable part
- audible master/part level, pitch, pan, FX send, filter, resonance, EG, decay and roll controls
- mute, solo and per-part audition
- undo/redo, fill, randomize, page copy and tap tempo
- Schema V2 JSON import/export with strict part topology validation and automatic V1 migration
- local save/load with error handling
- responsive layout and keyboard shortcuts that ignore active form fields

This version does **not** read or write KORG's proprietary `.esx`/`.emx` machine files and does not transfer patterns directly to hardware.

Schema V1 imports map legacy parts 1–5 to D1–D5. On ESX, legacy parts 6–10 map to Keyboard 1, Keyboard 2, Stretch 1, Slice and Audio In; on EMX they map to Synth 1–5. Embedded V1 accents become the ESX Accent lane or the matching EMX Drum/Synth Accent lane.

### Run locally

```bash
python3 -m http.server 4173 --directory web/korg-editor
```

Open `http://localhost:4173`.

### Validate

```bash
npm ci
npx playwright install chromium
npm run test:web
```

GitHub Actions runs the Java/Gradle build independently from the editor's syntax checks, unit tests and Chromium smoke tests. It also publishes a ready-to-open `korg-editor` ZIP artifact.

See `web/korg-editor/TESTING.md` for the manual browser and audio checklist.
