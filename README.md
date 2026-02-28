# RFTrec Client Template

This repository provides a minimal Fabric 1.21.5 client template for the RFTrec PvP mod.

## Project structure
```
src/main/java/com/rftrec/
  RFTrecClient.java      - main entrypoint
  gui/                   - GUI classes
  modules/               - individual modules
  cosmetics/             - cosmetic renderers
  framework/             - basic module system
```

The project is configured via Gradle and uses Fabric API `0.95.3+1.21`.

## KORG ESX/EMX-1 Web Editor (Prototype)

A standalone browser-based editor UI is available at:

- `web/korg-editor/index.html`

Features:
- ESX/EMX model switch and hardware-like LED display
- 10-part sequencer with 16/32/64 pattern lengths + page switch
- accent + ghost steps (click/right-click/shift-click editing)
- mixer controls with mute, solo and per-part audition
- built-in audio preview engine (WebAudio tick playback)
- undo/redo history and keyboard shortcuts (Space, Ctrl/Cmd+Z, Ctrl/Cmd+Y)
- ESX/EMX-style themes and local save/load + JSON import/export

To run locally:

```bash
cd web/korg-editor
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
