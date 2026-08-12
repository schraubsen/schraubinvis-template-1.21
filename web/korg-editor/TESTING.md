# Web Editor Test Checklist

## Automated gate

- `npm run lint:web`
- `npm run test:core`
- `npm run test:browser`
- GitHub Actions jobs `build` and `web-editor` are green
- Downloaded `korg-editor.zip` opens through a local HTTP server

## Manual browser matrix

Run the checklist in current desktop releases of Chrome/Edge and Firefox. Mobile Safari/Chrome are layout checks only; WebAudio timing is not considered a release gate on mobile.

1. Open the editor with no console errors.
2. Enable Step 1 and press Play; Step 1 must sound first.
3. Compare Swing 0 and Swing 40 on a 16th-note hat pattern.
4. Verify Ghost is quieter and Accent is louder than a normal step.
5. Verify part Level, Pitch, Pan and FX Send produce audible changes.
6. Verify Cutoff, Resonance, EG, Decay and Roll produce audible changes.
7. Test mute, solo and HIT on every channel.
8. Switch between 16, 32 and 64 steps and visit every page.
9. Exercise fill, randomize, copy, undo and redo.
10. Save locally, clear the pattern and load it again.
11. Export JSON and import the exported file again.
12. Import malformed JSON and out-of-range values; both must be rejected without losing the current pattern.
13. Type spaces and arrow keys in form controls; transport/page shortcuts must not fire.
14. Resize to 375 px width; all controls remain reachable and the step row scrolls horizontally.

## Known scope

The audio engine is a deterministic browser preview, not an emulation of the ESX-1/EMX-1 sound engines. Proprietary machine-file import/export and hardware transfer are intentionally outside this release.
