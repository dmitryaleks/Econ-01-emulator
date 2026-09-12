# Processing a raw block table

Input: `blocks_NNN-MMM_raw_table.png`, a scan of rows from the manual's parts table. Left column is
the module icon, right column the Russian description, split by a vertical rule.
Output: one `block_NNN.png` icon crop per row and one entry per row in `block_spec.json`.

## 1. Segment and crop (Pillow)

There is no OCR engine on this machine (no Tesseract), and one isn't needed: Pillow finds the
geometry, and the text is read by eye from enlarged crops. Use the system `python` (the project
`.venv` has no Pillow). Extract this block to the scratchpad and run it from there, not the repo:
`awk '/^```python$/{f=1;next} /^```$/{f=0} f' how_to_process_raw_blocks.md > segment.py`

```python
import sys
from PIL import Image
src, out, first = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGBA')
im = Image.alpha_composite(Image.new('RGBA', im.size, 'white'), im)
g = im.convert('L'); W, H = g.size; px = g.load()
dark = [[px[x, y] < 128 for x in range(W)] for y in range(H)]
cols = [sum(dark[y][x] for y in range(H)) for x in range(W)]
div = max(range(W), key=cols.__getitem__)            # the vertical rule = darkest column

def bands(x0, x1, min_len=25, min_px=3):             # vertical runs of ink = rows
    on = [sum(dark[y][x0:x1]) >= min_px for y in range(H)] + [False]
    res, s = [], None
    for y, v in enumerate(on):
        if v and s is None: s = y
        if not v and s is not None:
            if y - s >= min_len: res.append((s, y))
            s = None
    return res

def hspan(x0, x1, y0, y1, max_gap, min_px=3):         # widest ink cluster, so specks don't stretch it
    xs = [x for x in range(x0, x1) if sum(dark[y][x] for y in range(y0, y1)) >= min_px]
    runs = [[xs[0], xs[0]]]
    for x in xs[1:]:
        if x - runs[-1][1] <= max_gap: runs[-1][1] = x
        else: runs.append([x, x])
    a, b = max(runs, key=lambda r: r[1] - r[0])
    return a, b + 1

ib, tb = bands(0, div - 10), bands(div + 10, W)
assert len(tb) >= len(ib), (ib, tb)                  # every icon needs at least one text line
while len(tb) > len(ib):                             # multi-line descriptions: join across the smallest gap
    k = min(range(len(tb) - 1), key=lambda i: tb[i + 1][0] - tb[i][1])
    tb[k:k + 2] = [(tb[k][0], tb[k + 1][1])]
for i, ((iy0, iy1), (ty0, ty1)) in enumerate(zip(ib, tb)):
    n = first + i
    ix0, ix1 = hspan(0, div - 10, iy0, iy1, max_gap=10)
    im.crop((max(ix0-12, 0), max(iy0-12, 0), min(ix1+12, div-10), min(iy1+12, H))) \
      .save(f'{out}/icon_{n:03d}.png', dpi=im.info.get('dpi', (120, 120)))
    tx0, tx1 = hspan(div + 10, W, ty0, ty1, max_gap=60)
    t = g.crop((max(tx0-8, 0), max(ty0-8, 0), min(tx1+8, W), min(ty1+8, H)))
    t.resize((t.width*2, t.height*2), Image.LANCZOS).save(f'{out}/text_{n:03d}.png')
    print(n, 'icon', (ix0, iy0, ix1, iy1), 'text', (tx0, ty0, tx1, ty1),
          'TOUCHES EDGE' if 0 in (ix0, iy0) or iy1 >= H or tx1 >= W or ty1 >= H else '')
```

Run: `python segment.py assets/blocks/<raw>.png <scratchpad> <first block number>`.

Checks before trusting it:
- The printed rows match the rows you can see. A description wrapped over two lines is joined back
  into one row across the smallest vertical gap. Don't pair lines to the nearest icon: text drifts
  downward relative to the icons, so a row's text can start level with the next icon. If the
  grouping still looks wrong, adjust `min_len` (specks make extra bands; touching rows merge).
- Every cube icon box should be roughly square (about 130 px across at this scan size). One that is
  much wider means a speck survived; raise `min_px` or lower `max_gap`. The antenna bar is the
  exception: its icon is a wide rectangle.
- `TOUCHES EDGE` means the scan itself cuts that row off. Look at it: say so in the entry's `notes`
  and tell the user, who may be able to re-export with more margin. Don't pad or repair it.
- Paste the icon crops side by side, enlarged, and look at them: full circle, margin on every side,
  no stray text. Ink blots in the scan stay in the crop; mention them in `notes`.

## 2. Read the text

Read each `text_NNN.png` (2x enlarged) one at a time. Transcribe `rus_orig_desc` as printed, on one
line:
- decimal comma (`0,5`), `±` rather than `+-`, `кОм` / `МОм`, `пФ` / `мкФ`, no space before `±`;
- a stacked tolerance (`+80` above `−20`) is written `+80/−20 %`;
- a description wrapped over several lines is joined with single spaces, and a word hyphenated
  across a line break is rejoined (`вит-` / `ков` → `витков`);
- italic Latin labels such as `L1`, `L2` stay Latin; keep `×` and the source's final punctuation;
- the typeface's `К` has a hooked tail; it's an ordinary Cyrillic `К`, not `Қ`.

Watch for `68` vs `680`, `1 МОм` vs `1 кОм`, `680 пФ` vs `3300 пФ`. Two rows with the same text are
two different modules if their icons differ; give each its own block.

## 3. Write the entries

- Refuse to overwrite an existing `block_NNN.png`, then copy the icon crops in.
- `short_id` continues the running chain, where each id starts with the previous id's last letter
  (AB, BC, CD, ... XY, YZ), with Z wrapping around to A (`ZA`). The chain ends there, because the
  next id would be `AB` again; ask the user before adding a 27th.
- `category` and `schematic_prop.kind` use `ElementKind` from `src/model/types.ts`. The antenna is
  the exception: `category: "antenna"`, `shape: "antenna"`, `kind: "inductor"`.
- Size and placement: `width_cells` (every module is one cell tall). Only a module that can't be
  turned or placed freely sets `rotatable: false` and a `slot`: the antenna is `width_cells: 6`,
  `rotatable: false`, `slot: "antenna"` (see the file's `placement_convention`).
- `eng_interpret` transliterates part series into Latin and spells out the codes:
  - `МЛТ-0,5-68 кОм` → `Resistor, type MLT, 0.5 W, 68 kΩ ±10%`. `0,5` is the power in watts, not
    part of a range.
  - `К10-7В-Н90-0,01 мкФ` → `Capacitor, ceramic type K10-7V, temperature group N90, 0.01 µF +80/−20%`.
    `Н90` / `Н70` is how far capacitance may drift over temperature, not a value. `КТ-1` is a
    ceramic tubular type.
  - `Конденсатор электролитический К50-6-1-10В-20 мкФ` → `Capacitor, aluminium electrolytic type
    K50-6-1, 10 V, 20 µF`. `10В` is the rated voltage.
  - `Два диода Д9Б` → `Two diodes, germanium point-contact type D9B`;
    `Транзистор КТ315Б` → `Transistor, silicon NPN type KT315B` (Д → D, Б → B).
  - `Сердечник 400НН-8×80 мм` → `Core: ferrite grade 400NN, 8 × 80 mm` (diameter × length);
    `ПЭВ-2` → `PEV-2 enamelled wire`.
  - `Перемычка «Угол»` → `Jumper link "Corner" (Ugol)`: translate the name, keep it transliterated
    in brackets. Крест = Cross, Щель = Slot, Линия = Line, Тройник = Tee, Мостик = Bridge.
- `schematic_prop` by kind:
  - `resistor`: `series`, `power_watts`, `value` (ohm), `tolerance_pct`.
  - `capacitor`: `series`, `temp_coeff_group`, `value` (farad; `1e-8` for 0,01 мкФ),
    `tolerance_pct_minus` + `tolerance_pct_plus` (asymmetric, as `catalogue.ts` does with
    `tolLow`/`tolHigh`).
  - `electrolytic`: `series`, `polarized: true`, `voltage_rating_v`, `value` (farad).
  - `diode`: `model`, `material`, `count` when one module holds several.
  - `bjt`: `model`, `polarity`, `material`.
  - `link`: just `{ "kind": "link" }`; its whole behaviour is in `pinout`.
  - `button`: `{ "kind": "button", "normally_open": true }` (from SPEC.md), with `shape: "button"`
    since it's taller than a cube.
  - antenna (`inductor`): `core` {`material`, `grade`, `diameter_mm`, `length_mm`} and `windings`,
    each {`name`, `turns_sections`, `wire`, `wire_diameter_mm`}. A tapped winding lists its sections
    (`100+230` → `[100, 230]`). No inductance is printed, so there is no `value`.
  - Only record what's printed or already established in SPEC.md. If no tolerance is printed, leave
    the tolerance fields out and say so in `notes`.
- `num_in_kit`: count identical icon+text rows; otherwise check SPEC.md's module table. The table
  lists each link type once even though the kit has several (Щель 2, Линия 4, Тройник 4, Мостик 4),
  so for links always take SPEC.md's count and say so in `notes`. Sanity check: all entries'
  `num_in_kit` should end up summing to 37 (36 cubes + the antenna).
- `pinout`: `status: "unknown"`, empty `connections`, unless the user has given the pinout. Don't
  read pinouts off icons as fact. A user-given pinout is `status: "confirmed"`, `source: "user"`,
  one connection per element or plain wire, written as the user describes it. Two-terminal parts and
  wires are `{from, to, via}`; for a diode or electrolytic `from` is the anode / +. A part with more
  legs is `{via, terminals: {base: "W", ...}}`. Both forms are defined in the file's
  `connection_convention`. Record the pinout as given, then enlarge the icon and note any line it
  leaves out. Mention the likely `catalogue.ts` id in `notes`: the table's row
  order follows the catalogue's. Flag it when the icon's drawing style disagrees with that entry's
  opposite/adjacent span.
- Validate: the JSON parses, every `raw_orig_icon` exists, and `name` and `short_id` are unique.
