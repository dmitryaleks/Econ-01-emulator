# ЭКОН-01 — reverse-engineered device specification

> Reference specification for the browser emulator in this repository.
> Every claim is tagged **[C]** confirmed by the factory manual or a photograph,
> **[I]** inferred from those sources, or **[G]** a deliberate guess.

---

## 1. Provenance

| Source | Used for |
|---|---|
| **Руководство по эксплуатации «Электронный конструктор ЭКОН-01»**, ВНИИ «Электронстандарт», 1986, изд. № 522, зак. 790, 49 pp. — scanned DjVu from [retropc.org](http://retropc.org/Elektronnyj_konstruktor_Ekon-01_s_59.html) (`biblioteka/0123.djvu`) | Technical data, kit contents, construction, module catalogue, built-in amplifier schematic, all 30 circuits |
| retropc.org photographs `047.jpg`, `047_001…003.jpg` | Box art, front/rear panel, modules |
| [sovtech.su](https://www.sovtech.su/2024/11/30/) photographs | Module internals, base contacts, inner PCB |
| [rw6ase.narod.ru](https://www.rw6ase.narod.ru/index1/konstr/rk_mnog_funkc/ekon01.html), rdwiki.com, radionic.ru | Production history |

The extracted manual lives in `research/manual/` (gitignored): `png/pNNN.png` are the raw DjVu
pages, `book/NN.png` are the same pages renamed to **printed page numbers** via `bookmap.json`
(the DjVu holds printed pages 21–28 out of order at the end; the map fixes that).

Manual structure: Общие указания 3 · Технические данные 4 · Комплект поставки 4 ·
Устройство конструктора 4 · Подготовка к работе 6 · Порядок работы 6 ·
**Схемы электрические принципиальные и монтажные рисунки электронных устройств 9–39** ·
Неисправности 40 · Хранение 40 · Прил. 1 обозначения элементов 41 · **Прил. 2 модули 43** ·
**Прил. 3 схема конструктора 45** · Прил. 4 комнатная антенна 46 · Прил. 5 азбука Морзе 47 ·
Литература 48.

---

## 2. The device

**[C]** «Электронный конструктор ЭКОН-01», a solderless electronics construction toy for children
aged 10–15. Designed and produced by ВНИИ «Электронстандарт» (Гатчинский опытный завод), Gatchina
near Leningrad, from 1982 into the early 1990s. Арт. ЛО-085-01-2141, ТУ 16-12-077-83. Retail price
15 руб. Manual © 1986; cover art by С. В. Журавский.

### 2.1 Technical data **[C]**

| | |
|---|---|
| Overall size (in retail box) | 206 × 190 × 38 mm |
| Mass | ≤ 0.8 kg |
| Supply voltage | 8.7 V (6 × А316 «Квант» or «Прима», 1.45 V each) |
| Max current | ≤ 120 mA |
| Battery life at max current | ≥ 8 h |
| Ambient | +15 … +30 °C |
| Buildable devices | **30** |
| External PSU (alternative) | 9 V — БП-9/60, ПУ-1М, БПС-6/12, БПС 4—12, ВБ-1 |

### 2.2 Kit contents **[C]**

| Item | Qty |
|---|---|
| модуль антенный (ferrite-rod antenna module) | 1 |
| модуль (element module, "cube") | **36** |
| провод (1.5 m lead: one end bare, one end a spade lug) | 2 |
| элемент А316 | 6 |
| руководство по эксплуатации | 1 |
| потребительская тара | 1 |

**[C]** The spade lug of a lead is inserted *between* a module contact and a panel contact — that
is how external signals get in and out.

---

## 3. Physical layout

Black moulded ABS case with an integral carry handle along the top edge and a sloped front.
Silkscreen: «ЭКОН-01» badge top right, «30 ЭЛЕКТРОННЫХ УСТРОЙСТВ» in the top-left corner of the
field surround. Modules are chrome yellow (**[G]** `#F5C518` top face, `#E0A800` sides).

Front panel, from Рис. 1 of the manual and the retropc photographs:

```
+---------------------- carry handle ---------------------+
|                                                          |
|  +-- assembly field ------------+   +----------------+   |
|  |  6 cols x 5 rows  = 30 cells |   |  ((( speaker   |   |
|  |                              |   |     grille     |   |
|  |                              |   |    0,5ГДШ-2    |   |
|  |------------------------------|   +----------------+   |
|  |  antenna slot (6 wide)       |   |  [||] volume + |   |
|  |------------------------------|   |       power R2 |   |
|  |  6 cols x 1 row   =  6 cells |   |  (O)  tuning   |   |
|  +------------------------------+   |       C10      |   |
|                                     +----------------+   |
+----------------------------------------------------------+
```

- **[C]** 5 + 1 + 1 rows of cell positions: **36 cube cells**, exactly matching the 36 modules,
  plus one full-width antenna slot.
- **[C]** Contacts are fitted *around the perimeter* of the field («поле с установленными по
  периметру контактами»): small clamp contacts along the top, right and bottom edges, and seven
  larger, outset contacts down the **left** edge.
- **[C]** Leftover modules are stored in the field; Рис. 1 shows the storage arrangement, which
  also presses the antenna module against the panel contacts.
- **[C]** Controls on the right: `2` = **volume control combined with the power switch**
  (СП3-3вм-6,8 кОм-В-П-22, a ribbed thumbwheel in a slot window); `3` = **tuning knob** for the
  variable capacitor C10 (the large ribbed wheel); `4` = battery compartment lid on the rear.
- **[C]** The built-in low-frequency amplifier and the loudspeaker are inside the case.

### 3.1 Modules **[C]**

Hollow yellow cubes, ~19 mm **[G]**, with a round top face carrying an embossed schematic symbol
and a moulded diagonal **prising slot**. **One metal contact pad is centred on each of the four
side faces.** Two modules in adjacent cells touch pad to pad; that is the only wiring mechanism.
Modules may be inserted in any of four rotations, and the mounting drawings depend on it:
*«Модуль должен находиться не только на своем месте, но и в таком положении, в каком он изображён
на монтажном рисунке.»*

Four module shapes exist (Рис. 2): `1` antenna module (long bar), `2` кнопка (taller, with a cap),
`3` element module, `4` перемычка (link).

---

## 4. Module catalogue (Приложение 2) **[C]**

Pin span is **opposite** (element bridges two opposite faces, e.g. W–E) or **adjacent** (two faces
at 90°, e.g. N–E). **[I]** — the appendix distinguishes the two variants of each value by drawing
the element across the diameter versus across a quadrant.

| Id | Component | Value | Span | Qty |
|---|---|---|---|---|
| `r22k-o` | Resistor МЛТ-0,5 | 2.2 kΩ ±10 % | opposite | **2** |
| `r12k-a` | Resistor МЛТ-0,5 | 12 kΩ ±10 % | adjacent | 1 |
| `r68k-o` | Resistor МЛТ-0,5 | 68 kΩ ±10 % | opposite | 1 |
| `r68k-a` | Resistor МЛТ-0,5 | 68 kΩ ±10 % | adjacent | 1 |
| `r680k-o` | Resistor МЛТ-0,5 | 680 kΩ ±10 % | opposite | 1 |
| `r680k-a` | Resistor МЛТ-0,5 | 680 kΩ ±10 % | adjacent | 1 |
| `r1m-a` | Resistor МЛТ-0,5 | 1 MΩ ±10 % | adjacent | 1 |
| `r1m-o` | Resistor МЛТ-0,5 | 1 MΩ ±10 % | opposite | 1 |
| `c10n-o` | Capacitor К10-7В-Н90 | 0.01 µF | opposite | 1 |
| `c680p-a` | Capacitor КТ-1-Н70 | 680 pF | adjacent | 1 |
| `c3n3-o` | Capacitor КТ-1-Н70 | 3300 pF | opposite | 1 |
| `c10n-a` | Capacitor К10-7В-Н90 | 0.01 µF | adjacent | 1 |
| `c10n-o2` | Capacitor К10-7В-Н90 | 0.01 µF | opposite | 1 |
| `c20u-o` | Electrolytic К50-6-1 | 20 µF / 10 V | opposite | 1 |
| `c20u-a` | Electrolytic К50-6-1 | 20 µF / 10 V | adjacent | 1 |
| `dd9b` | **Two** diodes Д9Б | germanium point-contact | — | 1 |
| `q315-a` | Transistor КТ315Б | npn silicon | pinout A | 1 |
| `q315-b` | Transistor КТ315Б | npn silicon | pinout B | 1 |
| `ant` | **Magnetic antenna** | ferrite 400НН 8 × 80 mm; L1 = 100 + 230 turns ПЭВ-2 0.16 mm; L2 = 25 turns | — | 1 |
| `j-ugol` | «Угол» — link between two **adjacent** faces | — | — | 1 |
| `j-krest` | «Крест» — **all four** faces joined | — | — | 1 |
| `j-shchel` | «Щель» — **blank**, prising slot only, no connection | — | — | **2** |
| `j-liniya` | «Линия» — link between two **opposite** faces | — | — | **4** |
| `j-troynik` | «Тройник» — **three** faces joined (T) | — | — | **4** |
| `j-mostik` | «Мостик» — **two isolated crossing links** (W–E and N–S, insulated at the crossing) | — | — | **4** |
| `sb` | «Кнопка» — normally-open pushbutton between two opposite faces | — | — | 1 |

**Total 36 cube modules + 1 antenna module** — exactly the kit contents. **[C]**

Notes
- **[C]** The kit contains only **two** transistors, both КТ315Б. The germanium types МП26А, МП38
  and МП42Б belong to the built-in amplifier, not to the modules.
- **[C]** «Мостик» is what makes non-planar circuits possible on a 2-D grid.
- **[I]** «Щель» is a blank filler: its symbol shows only the prising slot, with no lead reaching a
  face contact.
- **[G]** Д9Б model: `Is ≈ 1e-6 A`, `n ≈ 1.4`, forward drop ≈ 0.25 V.
- **[G]** КТ315Б model: `βF ≈ 80`, `Is ≈ 1e-14 A`, `Vaf ≈ 100 V`.

---

## 5. Built-in circuitry (Приложение 3) **[C]**

The case holds a **five-transistor low-frequency amplifier with switching and control elements**,
presented to the field through terminals **XT1…XT7**.

### 5.1 Terminal map

| Terminal | Function |
|---|---|
| **XT1** | common / 0 V (battery −) |
| **XT2** | +8.7 V, switched (same node as XT3) |
| **XT3** | +8.7 V, switched |
| **XT4** | amplifier input → R1/C1/C3 → volume pot R2 → C5 → base of VT1 |
| **XT5** | tuning capacitor C10, terminal 1 |
| **XT6** | tuning capacitor C10, terminal 2 |
| **XT7** | common / 0 V (same node as XT1) |

**[I]** The seven terminals are the seven outset contacts down the left edge of the field, top to
bottom: XT1 beside main-grid row 1 … XT5 beside row 5, XT6 beside the antenna slot, XT7 beside the
bottom row. This matches Рис. 1, the photographs, and the antenna needing to reach C10 (XT5/XT6)
from the antenna slot.

**[C]** In every one of the 30 device schematics the built-in amplifier appears as a dashed box
labelled **«А»** showing only its XT terminals. Cross-checked: device 1 draws XT1 as its ground,
XT3 as its supply and XT4 as its output into the amplifier — consistent with the map above.

### 5.2 Bill of materials

Capacitors — C1 К10-7В-Н90 0,01 µF · C2 К10-7В-Н90 0,022 µF · C3 К10-7В-Н90 0,01 µF ·
C4 К50-12-12В 50 µF · C5 К50-12-12В 20 µF · C6, C7 К50-12-12В 50 µF · C8 К50-12-6,3В 100 µF ·
C9 К10-7В-Н90 0,022 µF · **C10 КПК3-10÷100 пФ** (tuning).

Resistors (МЛТ-0,25 unless noted) — R1 1,5 k · **R2 СП3-3вм-6,8 k-В-П-22** (volume + power switch) ·
R3 820 Ω · R4 10 k · R5 30 k · R6 220 Ω · R7 3,3 k · R8 470 Ω · R9 4,7 k · R10 30 Ω · R11 1,8 k ·
R12 30 Ω · R13 820 Ω.

Semiconductors — **VT1, VT2 КТ315Б** (npn Si) · **VT3 МП26А** (pnp Ge) · **VT4 МП38** (npn Ge) ·
**VT5 МП42Б** (pnp Ge).

Loudspeaker **BA1 0,5ГДШ-2**. Battery GB1 = 6 × А316 = 8.7 V.

Topology, as far as the scan supports: VT1/VT2 are a two-stage preamplifier, VT3 (МП26А) drives
the complementary germanium output pair VT4 (МП38, npn) / VT5 (МП42Б, pnp) into BA1, R3/C4
decouple a sub-rail and C10 sits alone between XT5 and XT6 as the tuning element of whatever
resonant circuit the user builds.

### 5.3 How the emulator models it — and why

The **input network is modelled component by component** exactly as drawn: XT4 → R1 → the volume
pot R2, with C1 and C3 shunting radio frequencies to ground and C5 coupling onward. So is the
battery, the power switch ganged with the volume control, C10, C8 and the loudspeaker.

The **five transistors themselves are modelled as one behavioural block**, not device by device.
Two reasons, and the second is the honest one:

1. The manual draws the amplifier in every single device schematic as a sealed dashed box
   labelled «А» with only XT1…XT7 showing. It is a black box in the real product too — the child
   never sees inside it, and none of the 30 circuits depend on its internals.
2. **The scan does not resolve its interconnections reliably.** The part *values* and *types*
   above are legible and certain; which node each lead runs to is not. Wiring them up from
   guesswork produced an amplifier that did not work, and a plausible-looking wrong schematic is
   worse than an honest block.

The block is a saturating voltage amplifier: gain ≈ 260, output clipping at ±3,6 V (a 8,7 V
single supply, so about half the rail either way), output resistance 1,5 Ω for the
emitter-follower pair, 3,3 kΩ input impedance, feeding BA1 through C8. **[G]** Everything the
user builds outside the dashed box is still solved exactly.

**[G]** Germanium parameters, kept in `sim/models.ts` for user circuits and for the day the
amplifier is reconstructed properly: МП26А / МП42Б `Is ≈ 2e-7 A`, `βF ≈ 40`; МП38 `Is ≈ 2e-7 A`,
`βF ≈ 30`; forward `Vbe ≈ 0.25 V`. Speaker `Re = 8 Ω` **[G]** (0,5ГДШ-2 is an 8 Ω, 0.5 W head).

---

## 6. The 30 electronic devices (pp. 9–39) **[C]**

One printed page per device: title, schematic (with the dashed «А» block), a mounting drawing of
the whole field, and an explanatory paragraph.

| # | Page | Title | Gloss |
|---|---|---|---|
| 1 | 10 | Усилительный каскад | Common-emitter amplifier stage |
| 2 | 11 | Эмиттерный повторитель | Emitter follower |
| 3 | 12 | Усилительный каскад | Amplifier stage (variant) |
| 4 | 13 | Входное устройство | Input network |
| 5 | 14 | Высокочастотный пробник | RF probe |
| 6 | 15 | Мультивибратор | Astable multivibrator |
| 7 | 16 | *(title obscured in scan)* | — |
| 8 | 17 | Мультивибратор | Multivibrator (variant) |
| 9 | 18 | «Пищалка» | Squeaker |
| 10 | 19 | Управляемый генератор | Gated oscillator |
| 11 | 20 | «Сторож» | Liquid-level / leak guard |
| 12 | 21 | «Сирена» | Siren |
| 13 | 22 | Звуковой генератор | Audio generator (low-Z and high-Z outputs) |
| 14 | 23 | Пробник с генератором | Probe with built-in oscillator |
| 15 | 24 | Генератор | Oscillator |
| 16 | 25 | *(title obscured in scan)* | — |
| 17 | 26 | Приемник по рефлексной схеме (средние и длинные волны) | Reflex MW/LW receiver |
| 18 | 27 | Приемник со стабилизацией | Receiver with stabilised bias |
| 19 | 28 | Приемник с эмиттерным повторителем | Receiver with emitter follower |
| 20 | 29 | Приемник с двухкаскадным усилителем высокой частоты | Receiver, two-stage RF amplifier |
| 21 | 30 | Приемник … | Receiver (variant) |
| 22 | 31 | Приемник с эмиттерным повторителем в высокочастотном усилителе | Receiver, EF in the RF stage |
| 23 | 32 | Приемник … | Receiver (variant) |
| 24 | 33 | Реле времени | Time-delay relay |
| 25 | 34 | «Мегафон» | Megaphone |
| 26 | 35 | «Электронная няня» | Baby monitor |
| 27 | 36 | Двухтональный генератор | Two-tone generator |
| 28 | 37 | Генератор сигналов | Signal generator |
| 29 | 38 | «Метроном» | Metronome |
| 30 | 39 | «Морзянка» | Morse practice key |

Titles for 7, 16, 21 and 23 sit behind the scan watermark and are to be recovered from the body
text when the mounting drawings are transcribed. Appendix 5 is a Morse table, used by devices 30
and 14.

---

## 7. Emulation model

### 7.1 Field and netlist

- 36 cube cells: `main[6×5]` and `bottom[6×1]`, plus `antenna[1]` spanning six columns. **[C]**
- Every occupied cell contributes four **contact nodes** N/E/S/W. Two orthogonally adjacent
  occupied cells have their facing contacts shorted. Left-edge perimeter contacts are shorted to
  XT1…XT7; the remaining perimeter contacts are mechanical only. **[I]**
- A module declares its elements between its own pin names; **rotation is a cyclic permutation**
  N→E→S→W, so one declaration covers all four orientations.
- The two supplied leads let the user tie any module contact to any panel contact; modelled as an
  explicit user wire between two contact nodes.

### 7.2 What is simulated exactly

A modified-nodal-analysis transient solver runs the *actual* placed circuit at audio rate: linear
R/C/L, Shockley diodes, Ebers-Moll BJTs (silicon and germanium parameter sets), the volume
potentiometer, the power switch, the pushbutton, the loudspeaker load, and the amplifier's input
network. No behaviour is scripted: a wrongly built multivibrator does not oscillate, and a
correctly built one oscillates at the frequency its own R and C dictate.

The sealed amplifier block is the one *structural* simplification (§5.3); the behavioural radio
below is the one *physical* one.

### 7.3 What is behavioural, and why

**Radio reception.** Carriers at 0.15–1.6 MHz cannot be integrated at a 48 kHz audio step. The
ferrite antenna is a real inductor in the netlist; separately, the resonant frequency of whatever
L–C loop the user forms with it and C10 is computed analytically, matched against a table of
fictional stations, and the recovered audio envelope is injected as a current source at the
coupling winding, scaled by the resonance curve. Detuning yields noise. This is the single
deliberate departure from first-principles simulation and is stated in the UI.

**Ambient inputs.** The «сторож» water sensor and the «электронная няня» microphone are UI
controls that vary a source or a resistance in the netlist.

### 7.4 Deliberate deviations from the real toy **[G]**

- Nothing can be destroyed. The manual warns in capitals that a mis-built circuit can kill the
  batteries, the transistors or the amplifier; the emulator flags over-current and reverse-bias
  conditions as warnings instead.
- Battery voltage is held at 8.7 V and does not sag.
- Tolerances (±10 %, −20/+80 % on the ceramics) are nominal by default, with an optional
  "real parts" mode that samples within tolerance.

---

## 8. Open questions

1. Exact face-to-face pinout of the "adjacent" module variants, and whether the straight line in
   those symbols is a second internal conductor (a resistor tee) rather than the prising slot.
   Resolve by cross-reading a mounting drawing against its schematic.
2. Which perimeter contacts besides the left-edge seven are electrically live, if any.
3. Titles of devices 7, 16, 21 and 23.
4. Whether the antenna module presents L1 as a tapped winding (100 + 230) on three separate
   contacts, and where L2 sits — Приложение 2 draws four contacts on the bar.
5. The interconnections of the built-in amplifier (§5.3). Resolving this needs a cleaner scan of
   Приложение 3, or a photograph of the inner PCB's track side, and would let the five
   transistors be simulated device by device like everything else.
