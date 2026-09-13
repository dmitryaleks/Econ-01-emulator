# ЭКОН-01 emulator — development plan

Companion to [`SPEC.md`](./SPEC.md), which is the authority on what the device *is*. This document
is the authority on what we *build*.

## Goal

A browser emulator of the 1982 Soviet solderless electronics kit ЭКОН-01: place yellow modules on
the 36-cell field in any arrangement, and the circuit you actually built is solved as a real
circuit at audio rate and heard through the loudspeaker.

## Decisions

| | |
|---|---|
| Simulation | **Real transient MNA solver** — Ebers-Moll BJTs, Shockley diodes, companion-model R/C/L. Not pattern matching. |
| Stack | **Vite + TypeScript, no framework.** Vitest for the engine. Canvas 2D for the panel. |
| Audio | The solver runs *inside* an `AudioWorkletProcessor` and is the sample source. |
| Skins | **Three, toggleable**: the grey and black production variants and a clean schematic mode. A skin is a full palette plus structural choices (carry-rail dimples, boxed badge, grille packing, knob knurling, module cap), so the two real variants differ in more than colour. |
| Radio | Behavioural (see SPEC §7.3) — the one documented departure from first principles. |

## Layout

```
package.json  vite.config.ts  tsconfig.json  index.html  .gitignore
SPEC.md  DEVPLAN.md
src/
  main.ts
  model/      types.ts  catalogue.ts  panel.ts  board.ts
  netlist/    build.ts  unionfind.ts
  sim/        matrix.ts  mna.ts  models.ts  transient.ts  radio.ts
  audio/      engine.ts  solver-worklet.ts
  ui/         app.ts  panel-canvas.ts  probe.ts  symbols.ts
              skins/skin.ts  skins/grey.ts  skins/black.ts  skins/schematic.ts
  circuits/   index.ts
test/         netlist.test.ts  mna.test.ts  integration.test.ts
              circuits.test.ts  perf.test.ts
research/     (gitignored — manual scans and photographs)
```

`main.py` and `.venv` are the leftover PyCharm stub; `.venv` (Pillow) stays, because the manual
page tooling is Python. Neither is part of the app.

---

## Phase 0 — Manual extraction ✅ done

DjVuLibre installed via winget; `ddjvu -format=tiff -eachpage` → 53 pages → grayscale PNG.
`research/manual/book/NN.png` are keyed by printed page number (`bookmap.json`).
Appendices 1–3 read; catalogue, terminal map and amplifier BOM captured in `SPEC.md`.

## Phase 1 — Spec and plan ✅ done

`SPEC.md`, `DEVPLAN.md`.

## Phase 2 — Scaffold ✅ done

Vite + TS strict, Vitest, `npm run dev | test | build`.

## Phase 3 — Model and geometry ✅ done

- `model/types.ts` — `Pin = 'N'|'E'|'S'|'W'`, `Element`, `ModuleDef`, `Placement`, `CellId`.
- `model/catalogue.ts` — the 26 module types of SPEC §4 with quantities; elements declared
  between the module's own pins so **rotation is a cyclic permutation** of N→E→S→W.
- `model/panel.ts` — cell rectangles for `main[6×5]`, the antenna slot and `bottom[6×1]`;
  the perimeter contact list; the fixed nets `GND`, `VCC`, `XT1…XT7`, `AMP_IN`, `C10_A`, `C10_B`,
  `SPK`, `ANT_EXT`.
- `model/board.ts` — placement map, parts-bin inventory, knob state; URL-hash serialisation.

**Done when** unit tests confirm rotation permutes pins correctly and every catalogue entry's
quantities sum to 36.

## Phase 4 — Netlist builder ✅ done

`netlist/build.ts`: union-find over contact nodes. Each occupied cell contributes four nodes;
union each with the facing node of its orthogonal neighbour; union right-edge contacts with
XT1…XT7 and top-edge contacts with their shared strip; apply user leads. Then emit each module's
elements between resolved net ids, plus the built-in amplifier's fixed subcircuit (SPEC §5.2) and
the battery.

**Done when**: two adjacent «Линия» links collapse to one net; a «Мостик» keeps its two paths
distinct; rotating a module changes connectivity as expected; a known manual layout yields the
expected node and element counts.

## Phase 5 — Circuit solver ✅ done

- `sim/matrix.ts` — LU replaying a Markowitz elimination plan, SPICE-style, with the determinant's
  sign for the switching-edge check (see "Resolved: astable start-up").
- `sim/mna.ts` — stamps: R; C and L by backward-Euler companion (`Geq = C/h`, `Ieq`);
  independent V and I sources; diode (Shockley, `Vt`-limited, with `gmin`); BJT (Ebers-Moll,
  per-part parameters so germanium and silicon stages behave differently); potentiometer; switch.
- `sim/models.ts` — the parameter sets from SPEC §4 and §5.2.
- `sim/transient.ts` — DC operating point by gmin stepping then source stepping; fixed-step
  transient with damped Newton-Raphson (≤ 30 iterations, voltage limiting) per step.

**Done when** these analytic checks pass:
- RC step response within 1 % of `1 − e^(−t/RC)`;
- diode current at 0.6 V within 5 % of Shockley;
- common-emitter DC bias within 10 % of hand calculation;
- astable multivibrator period within 5 % of `1.38·R·C`;
- an empty board draws no current and outputs silence.

## Phase 6 — Audio ✅ done

`audio/solver-worklet.ts` — an `AudioWorkletProcessor` that owns the solver, one solver step per
sample at 48 kHz, netlist and knob changes over the worklet `port` (no SharedArrayBuffer, so no
COOP/COEP headers). Speaker node voltage is the sample.

Fallback: if a board is too stiff for real time, drop to 12 kHz with 4× interpolation and show a
"reduced fidelity" indicator rather than glitching.

**Done when** a hand-placed multivibrator is audible and its pitch tracks its R and C.

## Phase 7 — UI ✅ done

- `ui/panel-canvas.ts` — one Canvas 2D, DPR-aware, hit-testing against `model/panel.ts`. Drag and
  drop from the parts bin, `R` or right-click to rotate, drag the wheels for volume and tuning.
- `ui/symbols.ts` — draws any module's cap symbol from its actual wiring, shared by every skin.
- `ui/skins/{grey,black,schematic}.ts` — vector-drawn, no photo assets. The grey skin is matched
  to `assets/the-original-econ-01-body.jpg`: matte grey case, dimpled carry rail, boxed badge,
  hex speaker grille with six moulded bridges, bronze contacts, pale lemon domed module caps and
  thin engraved markings. Panel geometry is measured off that photograph in millimetres.
- `ui/probe.ts` — click any contact to scope `V(t)`; two probes give a differential trace.
- Live feedback: speaker cone animates with output amplitude; the button and sensor modules are
  interactive; over-current and reverse-bias warnings surface here.

**Done when** both skins render the full panel correctly at 1440 px and at 400 px.

## Phase 8 — Circuit library ◻ next, and the largest piece left

Transcribe the 30 mounting drawings from `research/manual/book/10…39.png` into
`src/circuits/` (Russian title, description, cube placements with rotations, expected behaviour).
Loading a preset fills the board; the solver still runs it for real.

Done so far: the harness (`src/circuits/index.ts`, `test/circuits.test.ts`), the module
registry, the panel terminal map, and four circuits.

- **Module registry** — `assets/blocks/block_spec.json` holds every module type with a confirmed
  face-to-face pinout, and `src/model/catalogue.ts` is generated from it. Module ids are the
  registry's block names (`block_001` …). Cap symbols are drawn from each module's real wiring.
  `assets/blocks/how_to_process_raw_blocks.md` is the recipe for adding to it.
- **Panel terminals** — XT1…XT7 are the right-edge contacts, the top-edge contacts share a strip,
  and the left-edge contacts are lead clip points only. Read off the mounting drawings of devices 6
  and 26 (SPEC §5.1).
- **Детекторный приёмник** — kit-legal reconstruction with no leads, fully working: it proves the
  whole chain end to end (antenna → tuned circuit → Д9Б → XT4 → amplifier → loudspeaker) and
  demonstrably goes quiet when you tune off station.
- **Мультивибратор (устройство 6)** — the factory mounting drawing transcribed cell by cell: all
  30 cells filled, no leads, `kitLegal: true`. Its netlist, traced from contact alone, is the
  schematic, and the test checks it part by part. Held, it sounds at about 2,4 кГц at every
  sample rate; see "Resolved: astable start-up" below for what that took, and what it costs.
- **Пищалка (устройство 9)** — transcribed the same way and checked part by part against its
  schematic. The netlist is the schematic, and three spare modules touch it at one end only (1 МОм,
  12 кОм, 0,01 мкФ). It is two amplifying stages in a loop rather than cross-coupled switches, so
  unlike device 6 it starts on its own and sounds: silent with the кнопка up, and a tone while it is
  held. The pitch carries backward Euler's first-order error: 2,14 kHz at 48 kHz, 1,98 kHz at 96 kHz
  and 1,87 kHz at 768 kHz. It is the first multivibrator preset with `simulates: true`.
- **Двухтональный генератор (устройство 27)** — transcribed the same way and checked part by part
  against its schematic. It is device 26's antenna oscillator with the moisture probe replaced by
  68 кОм ∥ 3300 пФ ∥ кнопка on L2's return. Run through the RF solver it squegs at 1,28 kHz released
  and 1,10 kHz held, the same at 24, 48 and 96 kHz, so `simulates: true`. The page's replacement
  module, 0,01 мкФ turned 180°, is a second preset: 1,13 kHz released, 1,10 kHz held.
- **Электронная няня (устройство 26)** — transcribed the same way, antenna included, and checked
  part by part against its schematic. It is a radio-frequency oscillator on the antenna, which an
  audio-rate solver cannot run, so `simulates: false`. Its two supplied wires are a moisture probe
  with free ends, which the lead model (contact to contact) cannot express yet, so they are
  described rather than placed.
- **Реле времени (устройство 24)** — transcribed the same way and checked part by part against its
  schematic: device 26's antenna oscillator with its base fed from a 20 мкФ timing capacitor that
  the кнопка charges through 68 кОм. The charging while held and the slow run-down after release
  are solved and tested. The RF solver reproduces its squegging: held from the operating point it
  bursts about 455 times a second at 48 and 96 кГц, so `simulates: true`. This layout also
  corrected the кнопка's pinout: W–E is a plain wire and pressing joins S to it.
- **Сирена (устройство 12)** — transcribed the same way and checked against its schematic with
  `test/schematic.ts`. A classic multivibrator whose left emitter goes to ground through 20 мкФ,
  shorted by the кнопка. Held: a steady 410 Гц. Let go: the pitch climbs to about 1,3 кГц in half a
  second and the tone dies within 1,5 s, the same at 24 and 48 кГц; the manual's «сирена». Six
  modules carry only a wire or nothing.
- **Медленный мультивибратор (устройство 8)** — device 6's circuit with 20 мкФ coupling
  capacitors. The collectors switch every 1,06 с at 12 and 48 кГц alike, and the loudspeaker clicks.
  The manual speaks of intervals of several seconds; +80 % electrolytics would stretch towards that.
- **Звуковой генератор (устройство 13)** — device 9's two-stage loop with other values and no
  кнопка: about 400 Гц at every rate. Its two output wires have loose far ends and are described,
  not placed.
- **Азбука Морзе с помехами (устройство 15)** — a multivibrator whose кнопка adds 0,01 мкФ beside
  the 680 пФ: it whistles at 1,6 кГц (the interference) and drops to 570 Гц while held, from 24 to
  96 кГц. The right transistor only conducts for an 18 мкс pulse a cycle, which is what made the
  step-bend threshold scale with the step (sim/mna.ts). Transcribed from a faint scan with its
  contrast raised.
- **Генератор сигналов (устройство 28)** — device 26's oscillator with L2 to ground; it squegs at
  about 1,1 кГц at 12 to 96 кГц.
- **Метроном (устройство 29)** — the oscillator with the base held by 20 мкФ + 20 мкФ and C10 across
  part of L1 only. It squegs every ~85 мс: a brute-force transient gives 78–85 мс, the hybrid RF
  solver 85–100 мс with more jitter, at 24 кГц and above. This device found a burst-solver bug: a
  burst starts from the envelope's swing laid over the circuit, which can forward-bias a junction by
  volts; Newton then walked it down a thermal voltage per iteration, ran out of iterations, and the
  solution blew up. Junctions in `sim/burst.ts` are now linearised no higher than 12 Vt above their
  critical voltage.
- **Морзянка (устройство 30)** — device 28 keyed by the кнопка: silent released, squegging at about
  1,1 кГц held.

Devices 9 and 27 and every preset since are checked with `test/schematic.ts`, which searches for
an assignment of the schematic's nodes to nets under which every part is a module element and no
spare bridges two of them.

Pressing the кнопка or moving a knob only changes element values, so the running simulation now
takes the new values in place (`Simulation.update`) instead of restarting from a DC operating
point. That keeps capacitors charged across a press, which a time relay depends on.

A preset flagged `simulates: false` is guarded by a test that fails once the solver reproduces
it: silent, or a sound whose pitch differs by more than 10 % between 48 and 96 kHz.

Presets carry two honest flags, `kitLegal` and `simulates`, and the UI shows both.

With the pinouts confirmed, each of the other layouts is a mechanical transcription: crop the
chart cell by cell, match every icon to a block and rotation, then trace the netlist from contact
alone and compare it with the schematic. The factory fills every cell and uses some parts only for
their wires, so a hand-designed circuit generally will not fit the box; that is why free-play mode
exists.

**Done when** each preset has a golden test: load, run 2 s, assert the expected outcome
(oscillation frequency band, audio RMS, or quiescent current).

## Resolved: astable start-up ✅ — multivibrators run, but the fast ones are expensive

**What it was.** Two separate things kept every cross-coupled multivibrator silent.

1. **Its operating point is a stable state, not an unstable one.** Both transistors saturated, the
   loop has no gain, and nothing leaves it. A real one leaves it only because its capacitors charge
   unevenly as it is powered. `Simulation` now starts the field's capacitors empty
   (`Circuit.dischargeModules`): a module is plugged into a case that is already on. Boards with
   the antenna keep the operating point, which the RF envelope starts from.
2. **Backward Euler damps a switching edge instead of following it.** The edge is a mode that
   grows at around 10⁹ /s through the junction capacitances. For hλ ≫ 1 backward Euler's
   amplification 1/(1 − hλ) is tiny, so an audio-rate step settles on the unstable balance between
   the two states, and the oscillation dies there within a few cycles (device 12 held: 0,16 s at
   48 кГц).

**The fix, in `sim/mna.ts` (`advance`).**
- Transistors carry constant junction capacitances (`cje`, `cjc` in `sim/models.ts`), so an edge
  is a fast mode rather than a jump with no time scale at all. Boards with the antenna leave them
  out.
- The determinant of the step's matrix, which the LU already has, changes sign exactly when a
  real mode grows with hλ > 1 (`unstable`). A trial solve that meets such a matrix, or does not
  converge in 10 iterations, is abandoned at once.
- The step is then covered in substeps, from h/8 down to picoseconds as needed, bounded by how fast
  the circuit is speeding up, and growing again after the edge. A step whose junction voltages
  bend by more than 2 V is taken in substeps too, so a low sample rate cannot jump an edge.
- `sim/matrix.ts` reports the determinant's sign; the linear part of the matrix is built once per
  step size instead of every Newton iteration, and every element writes straight into fixed
  matrix positions. That made every solve about twice as fast (the perf test went from 2,2× to
  2,9× real time).

**Result.** Device 6 sounds at 2,36–2,40 кГц and device 12 at 410 Гц held, the same at 24, 48 and
96 кГц. Device 24's squegging needed only its flag updated.

**Cost.** An edge costs about 40 substeps and 170 solves, whatever the sample rate. Device 12
(two edges at 410 Гц) runs at 0,4× real time in Node and keeps up in Chrome at 48 кГц. Device 6
switches 4700 times a second and needs about 2× real time in Node; in Chrome the worklet manages
34 % of real time, and the status line now says so (`EngineStatus.pace`). `chooseDivisor` times
each solver rate separately, with the кнопка held, and stops lowering the rate once that no longer
pays. See UNSOLVED.md for what was tried to make edges cheaper.

## Phase 9 — Polish ◻ partly done

Done: save and share via URL hash, reset, free-play sandbox, the preset picker.
Left: Morse table (Приложение 5) for devices 14 and 30; a short "what is this thing" panel citing
the sources; interactive sensor modules; over-current and reverse-bias warnings.

---

## Verification

- `npm run test` — netlist, solver and golden-circuit suites green.
- `npm run dev`, then drive the page with the Chrome MCP tools: place a multivibrator, confirm the
  scope trace oscillates and audio output is non-zero; toggle both skins; check 400 px width.
- Compare a grey-skin screenshot against `assets/the-original-econ-01-body.jpg` side by side,
  and a black-skin screenshot against `research/photos/047_001.jpg`.
- Cross-check three assembled circuits against their manual pages.

## Out of scope

RF-accurate simulation; a schematic-capture editor; multiplayer; ЭКОН-02 «Юный электроник»
compatibility (a different, spring-and-wire kit).
