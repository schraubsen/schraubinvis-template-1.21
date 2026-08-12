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

The project is configured via Gradle and uses Fabric API `0.95.3+1.21`.

## KORG ESX/EMX-1 Web Editor

The standalone browser editor lives in `web/korg-editor/`. It is a pattern designer and WebAudio preview for rapid ESX/EMX-oriented sequencing work.

Current features:

- ESX/EMX preview modes and three hardware-inspired themes
- 10-part sequencer with 16/32/64-step patterns and page switching
- normal, accent and ghost steps with consistent state validation
- swing-aware playback that starts on the selected page's first step
- audible master/part level, pitch, pan, FX send, filter, resonance, EG, decay and roll controls
- mute, solo and per-part audition
- undo/redo, fill, randomize, page copy and tap tempo
- schema-versioned JSON import/export with range, shape and file-size validation
- local save/load with error handling
- responsive layout and keyboard shortcuts that ignore active form fields

This version does **not** read or write KORG's proprietary `.esx`/`.emx` machine files and does not transfer patterns directly to hardware.

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
