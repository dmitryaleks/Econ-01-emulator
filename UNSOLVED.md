# Unsolved

State as of 2026-09-13.

## Fast multivibrators are slower than real time

Each edge is followed in substeps (DEVPLAN, "Resolved: astable start-up") at about 40 substeps and
170 solves, independent of the sample rate. Cost as a fraction of real time:

| Device | Node, 48 кГц | Chrome (dev server), what the engine picks |
|---|---|---|
| 6, held (4700 edges/s) | 1,85× | 48 кГц, 34 % of real time |
| 15, released (1,6 кГц whistle) | 1,15× | 48 кГц, 53 % of real time |
| 15, held | 0,51× | — |
| 12, 13 | 0,35–0,6× | 48 кГц, keeps up |

Chrome runs the solver about 3× slower than Node here. The status line reports the shortfall
(«не успевает: N %»). `chooseDivisor` now times the кнопка up and held and takes the worse, and
stops lowering the rate once that stops paying, since the edges cost the same at any rate.

Where the solves go, per edge of device 6: about 25 substeps approaching the edge while the
growth rate climbs to ~10⁹ /s, 8 through the flip, 10–15 settling, plus ~8 abandoned trial solves.

Tried, none of which moved the total by more than ~15 %:
- a step controller from the backward-Euler amplification, found by power iteration on the step
  matrix (fewer substeps, more failures);
- kicking Newton past the edge along its last update, at the full step or at h/8 (finds the far
  state, but needs 20–40 iterations and often fails);
- giving up on trial solves whose updates stop shrinking (rejects good slow-converging steps);
- predictor off, a memory of the last failed step size, gentler shrinking, larger growth.

Still open: a cheaper solve during substeps (the amplifier's 15 nodes ride along untouched), or
a second-order method with error control that spends fewer steps between edges.

## Device 29 «Метроном» needs 24 кГц, and the browser gives it 12

At 24 кГц and above the hybrid RF solver ticks every 85–100 мс (sd ≈ 11–30 мс), against 78–85 мс
from a brute-force transient of the whole circuit (`scratchpad/d29/brute.mts`, 32 steps a cycle,
110× real time). At 12 кГц a burst runs on across several audio steps in segments, pumps the base
to −0,5 V instead of 0,40 V, and the ticks come 0,25–0,9 с apart. In Chrome the engine's benchmark
picks 12 кГц for it (24 кГц costs about 0,6× real time in Node, so ~2× in the browser).

Two things to look at:
- Why a burst splits into segments: the tank beats between the 413 кГц mode and the short L1
  section with the output capacitors (~100 кГц), and the "quiet for 2 cycles" test ends the burst
  on a dip. Requiring 4, 8 or 16 quiet cycles did not change the jitter.
- The radio's audio-rate hiss is injected into L2 on every antenna board (`sim/radio.ts`); it is
  not the source of the jitter (silencing it changes nothing), but it has no business in a
  transmitter.

# RF oscillators (devices 24 and 26)

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
   - **Correction:** the trusted-envelope handling *is* in the code, committed with device 24 in 79ccbe2, not merely drafted. Once `RfBurst` certifies a steady swing (2% spread over 64 cycles) the envelope takes over, skips the burst-entry tests, and runs a 24-cycle offline look-ahead every 50 ms. The freeze code is gone.
   - **Unverified:** its CPU cost on device 26 with a resistive probe has not been re-measured.
2. **Device 26 behaviour is unclear.**
   - It squegs (≈700–900 bursts/s, loud) only with the probe shorted. It is silent when dry, which is correct.
   - With 1–100 kΩ it oscillates steadily with no audible tone.
   - Unknown whether that is physical or a consequence of the guessed Q/k/β. The manual only says a warning signal sounds, also audible on a nearby long-wave radio.
   - There is also no UI for a probe resistance: leads are plain wires.
   - Device 27 (p. 36) is the same oscillator with 68 kΩ ∥ 3300 pF ∥ кнопка in place of the probe,
     and it squegs audibly in both positions. The 3300 pF gives L2's RF current a path around the
     68 kΩ; a purely resistive probe has none. So what a wet probe really presents at RF (a
     capacitance across it, or a lower resistance) probably decides whether device 26 squegs.
3. **Real-time budget.** Much improved; margins are still thin.
   - **What changed:**
     - The matrix solve now replays a Markowitz elimination plan, SPICE-style (`sim/matrix.ts`).
     - A burst ends mid-step as soon as its tank settles.
     - The burst's per-step closures are gone.
   - **Now, in Node (cost as a fraction of real time):**

     | Circuit | 6 kHz | 12 kHz | 48 kHz |
     |---|---|---|---|
     | device 24 (held) | 0.51× | 0.53× | 0.63× |
     | device 27 | 0.71× | 0.69× | 0.98× |
     | detector | 0.07× | — | 0.36× |

   - **In the browser:** device 27 keeps up at its benchmarked 6 kHz: status reports arrive at the full 23.4/s with a steady peak.
   - **Engine gap:** `AudioEngine.chooseDivisor` assumes cost scales with the solver rate. For squegging circuits the burst cost is roughly constant per second, so a lower rate saves less than it expects. It also benchmarks the netlist as given, which misses bursts that only start when the button is pressed (device 24).
   - **Before the fixes:** a burst ran to the end of its audio step. At 6 kHz that is about 49 RF cycles, so device 27 ran 8× slower than real time there and the worklet went silent while the scope, on the main thread, still moved.
4. **Presets, tests and docs not updated for this.**
   - **`DEVICE_24`:** now `simulates: true` (gated by the кнопка, 400–520 Гц held); its description is updated.
   - **Tests:** the generic preset test covers it held from the operating point. Still wanted: pitch rising with charge after a press, and still sounding after release.
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
