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
union each with the facing node of its orthogonal neighbour; union left-edge contacts with
XT1…XT7; apply user leads. Then emit each module's elements between resolved net ids, plus the
built-in amplifier's fixed subcircuit (SPEC §5.2) and the battery.

**Done when**: two adjacent «Линия» links collapse to one net; a «Мостик» keeps its two paths
distinct; rotating a module changes connectivity as expected; a known manual layout yields the
expected node and element counts.

## Phase 5 — Circuit solver ✅ done

- `sim/matrix.ts` — dense LU with partial pivoting (boards stay under ~80 nodes).
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
- `ui/symbols.ts` — one path-drawing function per module symbol, shared by both skins.
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

Done so far: the harness (`src/circuits/index.ts`, `test/circuits.test.ts`) and two circuits.

- **Детекторный приёмник** — kit-legal reconstruction, fully working: it proves the whole chain
  end to end (antenna → tuned circuit → Д9Б → XT4 → amplifier → loudspeaker) and demonstrably
  goes quiet when you tune off station.
- **Мультивибратор (устройство 6)** — the first genuine factory circuit. Topology transcribed
  from `assets/multivibrator-schematics-raw.png` (asymmetric arms, 12 кОм / 0,01 мкФ against
  68 кОм / 3300 пФ, кнопка in the common emitter return so the oscillator has no path to ground
  until it's held); physical layout follows the general scheme of the factory mounting drawing
  `assets/multivibrator-chart.png` (emitter bus and both transistors along the top, collector
  loads reached from below), built with real link-cube adjacency rather than loose wires —
  it uses all four «Тройник», all four «Линия», the one «Угол» and the one «Крест» the box
  contains. Six lead wires remain, all long jumps (a base-bias resistor or a cross-coupling
  capacitor reaching the supply rail or the opposite transistor's base), not substitutes for
  adjacency — the box ships two, so this is honestly `kitLegal: false`. Its netlist is verified
  component by component against the schematic; it does not yet make a sound, see the defect
  below.

Presets carry two honest flags, `kitLegal` and `simulates`, and the UI shows both.

The 30 authentic layouts are blocked on SPEC §8 open question 1: the exact pinout of the
"adjacent" module variants. The mounting drawings settle it — a single careful transcription of
device 6 «Мультивибратор» cross-read against its schematic will confirm or correct the catalogue,
and the remaining 29 then follow mechanically. Note the factory routed each layout to the exact
module budget in the box; a hand-designed circuit generally will not fit, which is why free-play
mode exists.

**Done when** each preset has a golden test: load, run 2 s, assert the expected outcome
(oscillation frequency band, audio RMS, or quiescent current).

## Known defect: astable start-up ◻ blocks the multivibrator presets

**Symptom.** Every preset built on an astable multivibrator loads with a correct netlist and
then sits silent. `test/circuits.test.ts` verifies device 6's netlist component by component
against the manual's schematic, so the transcription is right; the solver is what fails.

**Cause.** An astable's DC operating point is a genuine unstable equilibrium — both transistors
saturated, both coupling capacitors at rest. `Simulation` starts every transient from exactly
that point, so it balances there forever. A real one escapes during switch-on, when both
devices pass through the active region and the stronger one wins.

**What was tried, and what it cost** (all reverted; the solver in the repo is the known-good one):

| Attempt | Result |
|---|---|
| Per-device parameter spread (real parts are never identical) | Correct and cheap, but not sufficient alone |
| Cold start — capacitors discharged before the transient | Necessary, not sufficient |
| Ramping the supply over 0,05–20 ms to model the switch closing | Starts it, but the circuit then **latches** like a bistable |
| Emitter-base avalanche clamp at −6 V | Right physics — a real astable's base does break down every cycle, and without it the model ran to −539 V — but not the blocker |
| Rewriting `limitJunction` as SPICE's continuous `pnjlim` | A real bug fixed: the old one snapped to `vcrit` on a falling junction voltage, which is textbook limit-cycle behaviour. Still not sufficient |
| Adaptive sub-stepping down to h/64 | Produces a plausible 1,3 кГц square wave, but **87 % of steps need subdivision at every sample rate from 96 к to 768 кГц**, and it runs at 0,02× real time |

**Diagnosis.** Subdivision rate is flat across two decades of timestep, so this is not stiffness:
Newton is limit-cycling in the nonlinear iteration itself, and 2000 iterations do not help. The
remaining suspects are the convergence criterion (currently on node voltages only — SPICE also
tests device currents) and residual discontinuity in the limiting scheme.

**Next step.** Reproduce the limit cycle on the smallest possible circuit — two cross-coupled
transistors, no amplifier — and print the iterate sequence for one failing step. That will show
whether it oscillates between two states (limiting) or wanders (criterion).

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
