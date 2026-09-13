# Unsolved: RF oscillators (devices 24 and 26)

State as of 2026-09-13. Everything below is **uncommitted** working-tree changes on `main`. `main` is
also one commit ahead of `origin` (735adbd, the кнопка fix, not pushed).

## Where it stands

### Works

- **Device 24 «Реле времени» squegs at the physical guesses (CORE_Q 150, k 0.8), with no fitting.**
  - **Pitch versus sample rate:** held from the DC point, the squeg period is 2.19–2.20 ms (about 455 Hz) at 24, 48 and 96 kHz.
  - **Against ground truth:** the brute-force RF transient gives about 2.2 ms, with bursts to about 40 V and the base pumped to −3.1 V. The hybrid matches.
  - **Through the full `Simulation` (amplifier and loudspeaker):**
    - Silent while the button is released.
    - After a press the tone rises from about 98 Hz to 361 Hz over 2 s as the 20 мкФ charges.
    - It keeps sounding after release. This is what the manual's page 33 describes.
- **Limiter-aware Newton convergence**, in both `mna.ts` and `burst.ts`. An iteration where a junction limiter clamped no longer counts as converged. This also fixed the astable multivibrator test.
- **Last full test run: 64 of 65 passed.** It ran *before* the two latest changes (current smoothing and freezing, below). The one failure is expected: the guard «Реле времени (устройство 24)» is still not reproduced, as flagged. Device 24 now *is* reproduced, so that guard is stale.

### Solver architecture as it now is

- **`src/sim/rf.ts` (`RfNetwork`):**
  - Single-mode envelope: mode shape from a passive AC solve, and growth rate σ from describing functions.
  - `topology` lays out the RF piece for a transient: solved nets, held rails, elements and the full mode shape.
  - Helpers: `activity()` (junction power as a fraction of tank losses), `passiveRate()`, `junctionSwing()`.
- **`src/sim/burst.ts` (`RfBurst`, new):** a true transient of the RF piece only.
  - 32 steps per RF cycle, BDF2, with the quiet rails held at the audio half's voltages.
  - Its junction currents pass through a one-cycle moving average and go to the audio half as averages over the audio step.
  - Stops once the tank rings down at at least half the passive rate for 2 cycles.
- **`src/sim/mna.ts` (`Circuit.step`), per step:**
  1. **Junctions quiet** (|activity| < 0.1): ln A advances explicitly and there is one solve.
  2. **Otherwise:** backward Euler on ln A with a bracketed search, holding ln A for each circuit solve (`solveAmplitude`).
  3. **Driven oscillator whose swing gets large:** climb one RF cycle at a time (`climb`), then hand over to `RfBurst` once the junction swing exceeds 10 Vt.
- **`src/model/antenna.ts`:** coupled windings. **`src/netlist/build.ts`:** K couplings and `rf.ground` / `rf.exclude`. **Also changed:** `models.ts` (bvEbo), `bessel.ts`, `complex-matrix.ts`.

### Why it had to be this way (don't re-derive)

- **The averaged model can't squeg this circuit.** In a pure single-mode averaged (describing-function) model, device 24 always settles into a collector-saturated steady oscillation, at any Q.
  - Earlier "squegging at low Q" and "squegging at fine sub-steps" were artefacts. Below about 0.5 µs, backward Euler stops damping the tank that also sits in the audio-rate netlist, so RF got counted twice.
  - Brute force (`scratchpad/d24/brute.mts`) shows the real mechanism, within 1–2 RF cycles: the tank overshoots, then the collector-base junction dumps its energy into the base capacitor.
- **Things tried and rejected:**
  - Joint Newton on (x, ln A).
  - Cycle-rate explicit growth, which either runs away or is capped at the saturation point and settles.
  - A rectification lag.
  - A series base resistance.
  - Fitting low Q.

## Unsolved

1. **Steady RF oscillation is far too slow.** Device 26 with a resistive moisture probe (1 kΩ–100 kΩ between the row-1 and row-4 clip contacts) oscillates steadily. `RfBurst` then never "settles" and runs continuously, 20–40× slower than real time.
   - **What's in the tree now:** a windowed steady test (2% spread over 64 cycles) plus "freeze the averaged currents until an RF-piece voltage drifts 10 mV or 100 ms pass". It **thrashes**: slow nodes such as the amplifier-input coupling caps keep drifting, giving 542 resumes in 0.2 s.
   - **Proposed replacement, drafted but not applied** (`scratchpad/trusted.py`): once the transient certifies steady, hand back to the envelope in a trusted mode that skips the burst-entry tests. Every 50 ms run an offline look-ahead of `RfBurst` for 24 cycles, and drop trust if it collapses or runs away. Remove the freeze, leave and resume code.
   - **Unverified after the latest edits:** the freeze code and the one-cycle current smoothing haven't been through the full test suite.
2. **Device 26 behaviour is unclear.**
   - It squegs (≈700–900 bursts/s, loud) only with the probe shorted. It is silent when dry, which is correct.
   - With 1–100 kΩ it oscillates steadily with no audible tone.
   - Unknown whether that is physical or a consequence of the guessed Q/k/β. The manual only says a warning signal sounds, also audible on a nearby long-wave radio.
   - There is also no UI for a probe resistance: leads are plain wires.
   - Device 27 (p. 36) is the same oscillator with 68 kΩ ∥ 3300 pF ∥ кнопка in place of the probe,
     and it squegs audibly in both positions. The 3300 pF gives L2's RF current a path around the
     68 kΩ; a purely resistive probe has none. So what a wet probe really presents at RF (a
     capacitance across it, or a lower resistance) probably decides whether device 26 squegs.
3. **Real-time budget.** In Node, device 24 at 48 kHz runs about 1.2× slower than real time.
   - **Split:** the audio-rate half (36 unknowns, dense LU) is now the larger cost; bursts are about 175 ms per 0.5 s.
   - **Engine gap:** `AudioEngine.chooseDivisor` benchmarks the netlist as given, with the button released and no bursts, so it underestimates the cost of the tone.
   - **Ideas:** a sparse LU; benchmarking with a forced burst.
4. **Presets, tests and docs not updated for this.**
   - **`DEVICE_24`:** still `simulates: false`, and its description still says the sound isn't reproduced.
   - **Tests:** replace the stale guard with dedicated device 24 tests: silent released, tone after press, pitch rising with charge, the same pitch at 24 and 48 kHz, still sounding after release.
   - **Device 26:** needs a decision after item 2.
   - **Docs:** SPEC.md and DEVPLAN.md still describe the old behavioural and baseband RF approach.
5. **The radio still injects baseband EMF.**
   - `sim/radio.ts` drives the ANTENNA_EMF source at audio rate. It is not moved to `rf.setDrive` / `rf.transfer`.
   - C10 now sits across the whole of L1 (≈5.3 mH). The detector receiver test still passes, but tuning calibration wasn't revisited.
6. **Cleanup.**
   - **Stale doc comments in `mna.ts`:** the `MAX_LOG_STEP` comment and the 'split' wording in `solveAmplitude`.
   - **Unused helper:** `limitJunction` is only called through `limit()`.
   - **Probe scripts:** everything under `scratchpad/d24/` (`squeg.mts`, `brute.mts`, `prof2.mts`, `d26.mts`, `bdiag.mts`, `binside.mts`, `bspike.mts`, `audible.mts`, `export.mts`).
   - **Leftover hooks:** all `PROBE-TEMP` hooks were removed from `src/`, so none remain.

## Useful reference numbers (device 24, button held, Vt ≈ 8 V)

- **Mode:** f0 ≈ 294 kHz, collector shape 0.2945, emitter shape 0.0633. Passive decay ≈ 4400 /s, loaded Q ≈ 210.
- **Brute force** at 100 steps per cycle, BDF2: period ≈ 2.2 ms; burst peak ≈ 40 V, collapsing to ≈ 22 V within a cycle; base pumped from +0.5 V to −3.1 V; recovery ≈ 2 V/ms.
- **Hybrid:** 2.19–2.20 ms at 24, 48 and 96 kHz; about 6 RF cycles per burst with climbing.
