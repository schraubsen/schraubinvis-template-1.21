# Web Editor Test Checklist

## Automated gate

- `npm run lint:web`
- `npm run test:core`
- `npm run test:browser`
- GitHub Actions jobs `build` and `web-editor` are green
- Downloaded `korg-editor.zip` opens through a local HTTP server

## Manual browser matrix

Run the checklist in current desktop releases of Chrome/Edge and Firefox. Mobile Safari/Chrome are layout checks only; WebAudio timing is not considered a release gate on mobile. Start with headphones or low monitor volume.

1. Open the editor with no console errors. Confirm 16 ESX tabs: D1–D5, D6A/B, D7A/B, Keyboard 1/2, Stretch 1/2, Slice, Audio In and Accent.
2. Switch to EMX. Confirm 16 tabs: D1–D5, D6A/B, D7A/B, Synth 1–5, Drum Accent and Synth Accent. Switch back and verify common drum steps survive.
3. On D1, enable Step 1 and press Play. Step 1 must sound first. Mute, Solo and HIT must work without affecting the accent lane as a voice.
4. Build straight 16ths on a high drum part. Compare Swing 50 and 66, then disable that part's SWING switch. At 50 or with SWING off the timing is straight; at 66 it is a shuffle. A second part with SWING off must remain straight alongside it.
5. On ESX, program the Accent lane and vary Accent Level. Toggle D1's ACCENT switch: the same hits must become louder only when the switch is on. Repeat on EMX and verify Drum Accent affects only drums while Synth Accent affects only synths.
6. Enable ROLL on one sustained part and compare global Roll Type 2, 3 and 4. The selected hit must retrigger 2/3/4 times per step; a second part with ROLL off must stay single-triggered.
7. Verify Ghost is quieter than a normal hit and that a right-click creates/removes the matching accent-lane step. Accent wins over Ghost when importing a legacy V1 step that contains both.
8. Verify part Level, Pitch, Pan and FX Send produce audible changes. Verify Cutoff, Resonance, EG and Decay produce audible changes.
9. Test 16, 32, 48, 64, 80, 96, 112 and 128 steps. Visit every page at 128, set Step 128, play across the 128→1 wrap and confirm the step survives a resize up/down whenever it remains in range.
10. Exercise fill, randomize, Copy 1→2, undo and redo on a normal part and on an accent lane.
11. Save locally, clear the pattern and load it again. Confirm model, all 16 tracks, page length, Swing/Roll/Accent switches and accent lanes return.
12. Export Schema V2 JSON and import it again. Confirm the exported `machineName` has 1–8 KORG-safe characters and that Step 128 survives.
13. Import a Schema V1 JSON pattern. Confirm its ten legacy parts map to the documented V2 targets and embedded accents appear in the appropriate accent lane(s).
14. Import malformed JSON, a wrong track order, an out-of-range value and an unsupported schema version. Each must be rejected without losing the current pattern.
15. Type spaces and arrow keys in form controls; transport/page shortcuts must not fire.
16. At 768 px and 375 px widths, reach every part tab and mixer control by touch/scroll. The 16-step row scrolls horizontally without clipping controls or triggering accidental context menus.

## Known scope

The audio engine is a deterministic browser preview, not an emulation of the ESX-1/EMX-1 sound engines. Schema V2 describes transferable pattern intent, but proprietary machine-file import/export, MIDI/SysEx conversion and hardware transfer are intentionally outside this release.
