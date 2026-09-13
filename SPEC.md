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
| **`assets/the-original-econ-01-body.jpg`** — an orthogonal photograph of a grey-cased unit | Case proportions, panel geometry in millimetres, the full colour palette, and the mouldings: dimpled carry rail, boxed badge, hex speaker grille, bronze contacts |

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

The manual gives the size as "206 × 190 × 38 mm" without saying which is which. The orthogonal
photograph settles it: the case measures 1.09 times taller than wide, so it is **height × width
× depth** and the case is portrait. **[C]**

| | |
|---|---|
| Overall size | **190 wide × 206 tall × 38 deep mm** |
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

### 3.0 Two production variants **[C]**

Photographs show two cases, identical in mouldings and layout but not in colour or finish:

| | **Grey** (`assets/the-original-econ-01-body.jpg`) | **Black** (retropc.org) |
|---|---|---|
| Case | warm grey ABS, matte, `#A7ACAC` with a light `#C2C7C6` top and `#868B8C` shadow | black, `#1F1F22` |
| Modules | pale lemon, `#EFE774` cap → `#C9BC53` sides | chrome yellow, `#F6C81F` → `#B98405` |
| Markings | thin engraved lines, near-black `#241D0B` | embossed, raised plastic |
| Contacts | tarnished phosphor bronze, `#7A6A44` | bright nickel |
| Badge | «ЭКОН·01» inside a rounded outline box | plain silkscreen |

Both are reproduced as skins; the grey one is the default because it is the variant we have a
square-on reference photograph of. Colours above are sampled from the photographs. **[C]**

### 3.1 Mouldings **[C]**

- **Carry rail** across the top, 47 mm deep: a row of **11 shallow finger dimples** (r ≈ 7.9 mm,
  centres 17.2 mm apart) above a **through-slot** 172 × 23 mm with rounded corners. Below the
  rail a bevel band catches the light before the flat front face begins.
- **Silkscreen** top left: a large «30» with «ЭЛЕКТРОННЫХ» / «УСТРОЙСТВ» set tight beside it on
  two lines, in a squarish Soviet techno grotesque.
- **Badge** top right: «ЭКОН·01» with a raised middle dot.
- **Speaker**: a recessed disc, r ≈ 29.8 mm, of **hex-packed holes** with **six moulded bridges**
  notching the rim at 60° intervals.
- **Volume**: a small recessed window 29 × 11.5 mm with «ВКЛ.» and a left-pointing arrow above
  it; a finely ribbed cream thumbwheel shows through, carrying a red index mark.
- **Tuning**: a cream **knurled knob**, r ≈ 16 mm, on the speaker's centre line below the volume
  window, with a raised inner platform, a dished
  centre, and an engraved dial arc with four index dots.
- **Modules** sit as square bodies with a **large domed circular cap**, the square shoulders just
  showing at the corners. The кнопка module carries a **black push cap**.

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
- **[C]** Measured from the photograph: field origin 8.2 mm from the left edge and 83.4 mm from
  the top, **cell pitch 16.2 mm**, the antenna slot about 1.1 cells tall with small gaps above
  and below it, and only a thin lip of frame below the bottom row. The field runs almost to the bottom edge and hard against the left side, which
  is why the seven XT terminals have no room for printed labels on the real panel.
- **[C]** Contacts are fitted *around the perimeter* of the field («поле с установленными по
  периметру контактами»): small clamp contacts along the top, right and bottom edges, and seven
  larger, outset contacts down the **left** edge.
- **[C]** Leftover modules are stored in the field; Рис. 1 shows the storage arrangement, which
  also presses the antenna module against the panel contacts.
- **[C]** Controls on the right: `2` = **volume control combined with the power switch**
  (СП3-3вм-6,8 кОм-В-П-22, a ribbed thumbwheel in a slot window); `3` = **tuning knob** for the
  variable capacitor C10 (the large ribbed wheel); `4` = battery compartment lid on the rear.
- **[C]** The built-in low-frequency amplifier and the loudspeaker are inside the case.

### 3.2 Modules **[C]**

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

The authority is the registry `assets/blocks/block_spec.json`: one entry per module type, with the
icon cropped from Приложение 2, the printed description, structured values and a **confirmed
face-to-face pinout**. `src/model/catalogue.ts` is generated from it. The icons encode the wiring
exactly: a line that reaches the rim at N, E, S or W is a contact, a chord near the rim is a plain
wire between the two faces it joins, and a line that humps over another crosses it without joining.
Almost every element module therefore carries extra plain wires besides its part, which is how the
factory layouts route a whole circuit through the field with no leads. Pinouts are given at
rotation 0, the module turned as its icon is drawn.

| Block | Component | Value | Pinout at rotation 0 | Qty |
|---|---|---|---|---|
| `block_001` | Resistor МЛТ-0,5 | 2,2 kΩ ±10 % | R W–E; wires E–N, E–S | **2** |
| `block_002` | Resistor МЛТ-0,5 | 12 kΩ ±10 % | wire W–E; R E–S | 1 |
| `block_003` | Resistor МЛТ-0,5 | 68 kΩ ±10 % | R W–E; wires E–N, E–S | 1 |
| `block_004` | Resistor МЛТ-0,5 | 68 kΩ ±10 % | R N–E; separate wire W–S | 1 |
| `block_005` | Resistor МЛТ-0,5 | 680 kΩ ±10 % | R W–E; wires W–N, E–S | 1 |
| `block_006` | Resistor МЛТ-0,5 | 680 kΩ ±10 % | wire W–E; R E–S | 1 |
| `block_007` | Resistor МЛТ-0,5 | 1 MΩ ±10 % | R N–E; separate wire W–S | 1 |
| `block_008` | Resistor МЛТ-0,5 | 1 MΩ ±10 % | R W–E; wire E–N | 1 |
| `block_009` | Capacitor К10-7В-Н90 | 0,01 µF +80/−20 % | C W–E; wires E–N, E–S | 1 |
| `block_010` | Capacitor КТ-1-Н70 | 680 pF +80/−20 % | wires W–E and N–S, crossing apart; C N–E | 1 |
| `block_011` | Capacitor КТ-1-Н70 | 3300 pF +80/−20 % | C W–E; wire E–N | 1 |
| `block_012` | Capacitor К10-7В-Н90 | 0,01 µF +80/−20 % | C W–E; wire E–N | 1 |
| `block_013` | Capacitor К10-7В-Н90 | 0,01 µF +80/−20 % | C W–E; wire E–S | 1 |
| `block_014` | Electrolytic К50-6-1 | 20 µF / 10 V | C W(+)–E; wire E–S | 1 |
| `block_015` | Electrolytic К50-6-1 | 20 µF / 10 V | C W(+)–E; wire E–N | 1 |
| `block_016` | **Two** diodes Д9Б | germanium point-contact | D W→S, D S→E; wire W–N | 1 |
| `block_017` | Transistor КТ315Б | npn silicon | base W, collector N, emitter S; wire N–E | 1 |
| `block_018` | Transistor КТ315Б | npn silicon | base W, collector N, emitter S; wire S–E | 1 |
| `block_019` | **Magnetic antenna** | ferrite 400НН 8 × 80 mm; ПЭВ-2 0,16 mm | L1 100 turns N2–N6, 230 turns N6–E; wire N2–N5; L2 25 turns N3–N4 | 1 |
| `block_020` | «Угол» | — | E–S | 1 |
| `block_021` | «Крест» | — | all four joined | 1 |
| `block_022` | «Щель» | — | two separate corners, N–W and E–S | **2** |
| `block_023` | «Линия» | — | W–E | **4** |
| `block_024` | «Тройник» | — | W, E, S joined | **4** |
| `block_025` | «Мостик» | — | W–E and N–S, crossing apart | **4** |
| `block_026` | «Кнопка» | normally open | wire W–E; S joined to them while held | 1 |

The antenna's contacts are named by cell along the bar: N1…N6 on its top edge, left to right,
and E for its right-hand end. Nothing reaches its W end or its bottom edge.

**Total 36 cube modules + 1 antenna module** — exactly the kit contents. **[C]**

Notes
- **[C]** The kit contains only **two** transistors, both КТ315Б. The germanium types МП26А, МП38
  and МП42Б belong to the built-in amplifier, not to the modules.
- **[C]** «Мостик», and the crossing wires in `block_010`, are what make non-planar circuits
  possible on a 2-D grid.
- **[C]** A small ring on the icons of blocks 003, 004, 006 and 012 tells each apart from a module
  drawn with exactly the same wiring but a different value: 003 (68 kΩ) from 001 (2,2 kΩ), 004
  (68 kΩ) from 007 (1 MΩ), 006 (680 kΩ) from 002 (12 kΩ), and 012 (0,01 µF) from 011 (3300 pF).
  The registry records each ring's position and the emulator draws it on the cap.
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
| **XT2** | **wired to nothing** |
| **XT3** | supply for the field: the switched +8.7 V rail **through R3 (820 Ω)**, decoupled by C4 50 µF and C2 0,022 µF |
| **XT4** | amplifier input → R1/C1/C3 → volume pot R2 → C5 → base of VT1 |
| **XT5** | tuning capacitor C10, terminal 1 |
| **XT6** | tuning capacitor C10, terminal 2 |
| **XT7** | **the loudspeaker's live side**, after the output capacitor C8 (R13 bootstraps the driver from it) |

**[C]** Functions read off the clean scan of Приложение 3, `assets/core/core-schematics.png`.
R3 means the field never sees a stiff supply: whatever a device draws from XT3 drops across
820 Ω, which also keeps a short on the field from flattening the battery.

**[I]** The seven terminals are the contacts down the **right** edge of the field, top to bottom:
XT1 beside main-grid row 1 … XT5 beside row 5, XT6 beside the antenna slot, XT7 beside the bottom
row. The contacts along the **top** edge are joined to one another by a strip, and to nothing else.
The contacts down the **left** edge are separate clip points for the leads and reach nothing.

This is read off the factory mounting drawings, traced from module contact alone with the
confirmed pinouts of §4, and checked against each device's schematic:
- **Device 6** «Мультивибратор» (p. 15): the supply rail reaches the perimeter only at the right
  of row 3 (XT3) and the output capacitor only at the right of row 4 (XT4). A collector touches the
  left contact of row 3, so the left edge cannot carry XT3. The кнопка reaches ground only through
  the top edge, which a «Щель» in the top-right cell ties to the right of row 1 (XT1).
- **Device 26** «Электронная няня» (p. 35): the 20 µF capacitor's − side reaches the right of row
  1 (XT1), the supply the right of row 3 (XT3), the output capacitor the right of row 4 (XT4), the
  tank node the right of row 5 (XT5), and L1's far end the antenna bar's right end (XT6). The
  «Вход» leads clip to the left contacts of rows 1 and 4; the ground one reaches XT1 only through
  the top strip, which the electrolytic in the top-right cell ties to XT1.

Both layouts deliberately tie the top strip to XT1 with a module, so the strip is taken to be wired
to nothing inside the case. The positions of XT2 and XT7 follow by sequence; no layout traced so
far touches them decisively.

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

Topology **[C]**, from `assets/core/core-schematics.png`:
- GB1 → the switch ganged with R2 → the amplifier rail. R3 feeds XT3 from it (C4, C2 to ground).
- XT4 → R1 → R2's top; C1 from XT4 and C3 from R2's top to ground; R2's wiper → C5 → VT1 base.
- **VT1** (КТ315Б): collector load R7 from the R6/C6-filtered rail, emitter R8 to ground, base R4 to
  ground and R5 to VT2's emitter.
- **VT2** (КТ315Б): base on VT1's collector, collector load R9, emitter to ground through C7 + R10,
  and R11 from its emitter to the output midpoint (the DC feedback loop).
- **VT3** (МП26А, pnp): emitter on the rail, base on VT2's collector, collector on VT4's base and
  through R12 on VT5's base.
- **VT4** (МП38, npn) / **VT5** (МП42Б, pnp): complementary emitter followers, collectors on the
  rail and ground, emitters joined at the output midpoint.
- C8 (+ on the midpoint) → BA1 → ground; R13 from VT5's base to the loudspeaker side of C8
  (bootstrap, which is XT7); C9 from the rail to VT5's base.
- C10 sits alone between XT5 and XT6 as the tuning element of whatever resonant circuit the user
  builds.

### 5.3 How the emulator models it

**Everything inside the case is modelled part by part, exactly as drawn** in §5.2: the battery,
the switch, R3 and its decoupling, C10, the input network, the five transistors with every
resistor and capacitor around them, C8 and the loudspeaker. `netlist/build.ts` stamps it onto every
board; nothing about the amplifier is scripted.

An earlier version stood a behavioural block in for the transistors (gain ≈ 260, clipping at
±3,6 V), because the old scan did not show the wiring. Those numbers were guesses. Checked against
this circuit in the same solver, the block's sound was in the right range but it drew no current
at all, so it was replaced.

The transcription checks out on three independent counts **[C]**: the solver finds the output
midpoint at 4,6 V, half the 8,7 V rail as a single-supply push-pull stage should sit; the
amplifier idles at about 6,5 mA; and driven to clipping it draws about 130 mA, against the
manual's rated maximum consumption of 120 mA (§2.1). Driven from XT4 at 1 kHz with the volume at
0,8 its gain is about 60–75, rising with signal level as the germanium output stage leaves its
crossover region, and it clips at about ±4 V into the 8 Ω head.

**[G]** Germanium parameters in `sim/models.ts`: МП26А / МП42Б `Is ≈ 2e-7 A`, `βF ≈ 40`;
МП38 `Is ≈ 2e-7 A`, `βF ≈ 30`; forward `Vbe ≈ 0.25 V`. Speaker `Re = 8 Ω` **[G]** (0,5ГДШ-2 is an
8 Ω, 0.5 W head).

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
  occupied cells have their facing contacts shorted. Right-edge perimeter contacts are shorted to
  XT1…XT7, top-edge contacts to one shared strip; left-edge contacts reach nothing. **[I]**, §5.1
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

The built-in amplifier is solved transistor by transistor too (§5.3), so the behavioural radio
below is the one departure from first principles.

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

1. ~~Exact face-to-face pinout of the module variants.~~ Resolved: every module's pinout is
   confirmed in `assets/blocks/block_spec.json` (§4).
2. Terminal positions are read from two factory layouts (§5.1). Still to confirm against more
   devices: XT2 and XT7, whether the top strip is wired to anything inside the case, and whether
   the bottom row's contacts are live.
3. Titles of devices 7, 16, 21 and 23.
4. ~~How the antenna module presents its windings.~~ Resolved: L1 on N2/N5, tap N6 and E; L2 on
   N3–N4, apart from L1 (§4).
5. ~~The interconnections of the built-in amplifier.~~ Resolved from the clean scan of
   Приложение 3; the amplifier is now simulated part by part (§5.2, §5.3).
6. ~~What the small ring on four module icons means.~~ Resolved: it tells look-alike modules of
   different values apart (§4).
