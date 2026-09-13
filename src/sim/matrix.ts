/**
 * LU solve for the circuit's matrix, which is mostly zeros: a board's 36 unknowns give a matrix
 * of 1296 entries of which some 140 are ever stamped. Stamping still writes into a dense array,
 * but the elimination runs from a plan, the way SPICE's sparse solver does.
 *
 * The first solve, and any after a stamp touches an entry for the first time, picks pivots by
 * Markowitz's rule — the entry whose row and column have the fewest other nonzeros, so little
 * fill-in appears — among entries within PIVOT_THRESHOLD of the largest in their column. It
 * records, for each step, which rows and columns that step updates, fill-in included. Later
 * solves replay only those operations. If a planned pivot has become too small against its
 * column, as when a junction switches, the matrix is restored and planned again.
 */

/** A pivot must be at least this fraction of the largest entry below it in its column. */
const PIVOT_THRESHOLD = 1e-3;
/** Below this a column has no usable pivot: the matrix is singular. */
const TINY = 1e-18;

export class Matrix {
  readonly n: number;
  readonly a: Float64Array;
  readonly b: Float64Array;
  private readonly x: Float64Array;

  /** Every entry a stamp has ever touched, and whether that set grew since the last plan. */
  private readonly pattern: Uint8Array;
  private patternGrew = true;
  /**
   * Where the matrix can be nonzero: the entries stamped, then the plan's fill-in. Clearing and
   * saving visit only these, not all n² entries.
   */
  private readonly used: Int32Array;
  private stamped = 0;
  private usedCount = 0;

  /**
   * The plan: each step's pivot row and column, and the rows and columns it updates, laid end to
   * end — step k's rows are planRows[rowStart[k]] up to planRows[rowStart[k + 1]].
   */
  private readonly pivotRow: Int32Array;
  private readonly pivotCol: Int32Array;
  private planRows: Int32Array;
  private planCols: Int32Array;
  private readonly rowStart: Int32Array;
  private readonly colStart: Int32Array;
  private planned = false;
  /** Sign of the plan's row and column permutations together. */
  private parity = 1;

  /** Sign of the last factorised matrix's determinant. */
  detSign = 1;

  /** The stamped matrix, kept while a planned factorisation might have to be abandoned. */
  private readonly savedA: Float64Array;
  private readonly savedB: Float64Array;
  /** Working space for planning. */
  private readonly struct: Uint8Array;
  private readonly rowCount: Int32Array;
  private readonly colCount: Int32Array;
  private readonly rowLive: Uint8Array;
  private readonly colLive: Uint8Array;

  constructor(n: number) {
    this.n = n;
    this.a = new Float64Array(n * n);
    this.b = new Float64Array(n);
    this.x = new Float64Array(n);
    this.pattern = new Uint8Array(n * n);
    this.pivotRow = new Int32Array(n);
    this.pivotCol = new Int32Array(n);
    this.planRows = new Int32Array(n);
    this.planCols = new Int32Array(n);
    this.rowStart = new Int32Array(n + 1);
    this.colStart = new Int32Array(n + 1);
    this.used = new Int32Array(n * n);
    this.savedA = new Float64Array(n * n);
    this.savedB = new Float64Array(n);
    this.struct = new Uint8Array(n * n);
    this.rowCount = new Int32Array(n);
    this.colCount = new Int32Array(n);
    this.rowLive = new Uint8Array(n);
    this.colLive = new Uint8Array(n);
  }

  /** Zero the matrix and the right-hand side. */
  clear(): void {
    const { a, used } = this;
    for (let k = 0; k < this.usedCount; k++) a[used[k]!] = 0;
    this.b.fill(0);
  }

  /**
   * The position of an entry in `a`, or -1 when its row or column is ground. The entry joins the
   * pattern, so callers that add to `a` directly at such positions keep the plan valid.
   */
  slot(row: number, col: number): number {
    if (row < 0 || col < 0) return -1;
    const i = row * this.n + col;
    if (this.pattern[i] === 0) {
      this.pattern[i] = 1;
      this.patternGrew = true;
      // Stamped entries stay ahead of the fill-in in `used`.
      const k = this.stamped++;
      if (k < this.usedCount) this.used[this.usedCount] = this.used[k]!;
      this.used[k] = i;
      this.usedCount++;
    }
    return i;
  }

  add(row: number, col: number, value: number): void {
    const i = this.slot(row, col);
    if (i >= 0) this.a[i]! += value;
  }

  addRhs(row: number, value: number): void {
    if (row < 0) return;
    this.b[row]! += value;
  }

  /**
   * Solve, destroying the stamped matrix. Returns the solution, or null if the matrix is
   * singular — which happens for a floating sub-circuit and is handled by the caller.
   */
  solve(): Float64Array | null {
    const { a, used, savedA } = this;
    if (this.planned && !this.patternGrew) {
      // Only stamped entries hold values yet; the fill-in is still zero.
      for (let k = 0; k < this.stamped; k++) savedA[k] = a[used[k]!]!;
      this.savedB.set(this.b);
      if (this.factorByPlan()) return this.substitute();
      for (let k = 0; k < this.stamped; k++) a[used[k]!] = savedA[k]!;
      for (let k = this.stamped; k < this.usedCount; k++) a[used[k]!] = 0;
      this.b.set(this.savedB);
    }
    return this.plan() ? this.substitute() : null;
  }

  /** Eliminate along the recorded plan. False if a pivot is no longer good enough. */
  private factorByPlan(): boolean {
    const { n, a, b, pivotRow, pivotCol, planRows, planCols, rowStart, colStart } = this;
    let sign = this.parity;
    for (let k = 0; k < n; k++) {
      const prow = pivotRow[k]!;
      const pr = prow * n;
      const pc = pivotCol[k]!;
      const pivot = a[pr + pc]!;
      const mag = Math.abs(pivot);
      if (!(mag >= TINY)) return false;
      if (pivot < 0) sign = -sign;
      // No entry below the pivot may exceed it by more than 1 / PIVOT_THRESHOLD.
      const largest = mag / PIVOT_THRESHOLD;
      const bp = b[prow]!;
      const c0 = colStart[k]!;
      const c1 = colStart[k + 1]!;
      for (let i = rowStart[k]!, i1 = rowStart[k + 1]!; i < i1; i++) {
        const r = planRows[i]!;
        const ri = r * n;
        const below = a[ri + pc]!;
        if (below === 0) continue;
        if (below > largest || -below > largest) return false;
        const f = below / pivot;
        for (let j = c0; j < c1; j++) {
          const c = planCols[j]!;
          a[ri + c]! -= f * a[pr + c]!;
        }
        b[r]! -= f * bp;
      }
    }
    this.detSign = sign;
    return true;
  }

  /** Back substitution through the factorised rows. */
  private substitute(): Float64Array {
    const { n, a, b, x, pivotRow, pivotCol, planCols, colStart } = this;
    for (let k = n - 1; k >= 0; k--) {
      const prow = pivotRow[k]!;
      const pr = prow * n;
      let s = b[prow]!;
      for (let j = colStart[k]!, j1 = colStart[k + 1]!; j < j1; j++) {
        const c = planCols[j]!;
        s -= a[pr + c]! * x[c]!;
      }
      const pc = pivotCol[k]!;
      x[pc] = s / a[pr + pc]!;
    }
    return x;
  }

  /** Choose pivots by Markowitz's rule while eliminating, and record the plan. */
  private plan(): boolean {
    const { n, a, b, struct, rowCount, colCount, rowLive, colLive } = this;
    this.planned = false;
    this.usedCount = this.stamped;
    struct.set(this.pattern);
    rowLive.fill(1);
    colLive.fill(1);
    rowCount.fill(0);
    colCount.fill(0);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (struct[r * n + c]) {
          rowCount[r]!++;
          colCount[c]!++;
        }
      }
    }

    const allRows: number[] = [];
    const allCols: number[] = [];
    let negative = 0;
    for (let k = 0; k < n; k++) {
      let pr = -1;
      let pc = -1;
      let bestCost = Infinity;
      let bestMag = 0;
      for (let c = 0; c < n; c++) {
        if (!colLive[c]) continue;
        let colMax = 0;
        for (let r = 0; r < n; r++) {
          if (rowLive[r] && struct[r * n + c]) colMax = Math.max(colMax, Math.abs(a[r * n + c]!));
        }
        if (colMax < TINY) continue;
        for (let r = 0; r < n; r++) {
          if (!rowLive[r] || !struct[r * n + c]) continue;
          const mag = Math.abs(a[r * n + c]!);
          if (mag < PIVOT_THRESHOLD * colMax) continue;
          const cost = (rowCount[r]! - 1) * (colCount[c]! - 1);
          if (cost < bestCost || (cost === bestCost && mag > bestMag)) {
            bestCost = cost;
            bestMag = mag;
            pr = r;
            pc = c;
          }
        }
      }
      if (pr < 0) return false;

      this.rowStart[k] = allRows.length;
      this.colStart[k] = allCols.length;
      for (let r = 0; r < n; r++) if (rowLive[r] && r !== pr && struct[r * n + pc]) allRows.push(r);
      for (let c = 0; c < n; c++) if (colLive[c] && c !== pc && struct[pr * n + c]) allCols.push(c);
      const r0 = this.rowStart[k]!;
      const c0 = this.colStart[k]!;

      const pivot = a[pr * n + pc]!;
      if (pivot < 0) negative++;
      for (let i = r0; i < allRows.length; i++) {
        const r = allRows[i]!;
        const f = a[r * n + pc]! / pivot;
        for (let j = c0; j < allCols.length; j++) {
          const c = allCols[j]!;
          const e = r * n + c;
          a[e]! -= f * a[pr * n + c]!;
          if (!struct[e]) {
            struct[e] = 1;
            rowCount[r]!++;
            colCount[c]!++;
            this.used[this.usedCount++] = e;
          }
        }
        b[r]! -= f * b[pr]!;
        rowCount[r]!--;
      }
      for (let j = c0; j < allCols.length; j++) colCount[allCols[j]!]!--;
      rowLive[pr] = 0;
      colLive[pc] = 0;

      this.pivotRow[k] = pr;
      this.pivotCol[k] = pc;
    }
    this.rowStart[n] = allRows.length;
    this.colStart[n] = allCols.length;
    this.planRows = Int32Array.from(allRows);
    this.planCols = Int32Array.from(allCols);
    this.parity = permutationSign(this.pivotRow) * permutationSign(this.pivotCol);
    this.detSign = negative % 2 ? -this.parity : this.parity;
    this.planned = true;
    this.patternGrew = false;
    return true;
  }
}

/** +1 for an even permutation, −1 for an odd one. */
function permutationSign(p: Int32Array): number {
  const seen = new Uint8Array(p.length);
  let sign = 1;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = p[j]!) {
      seen[j] = 1;
      length++;
    }
    if (length % 2 === 0) sign = -sign;
  }
  return sign;
}
