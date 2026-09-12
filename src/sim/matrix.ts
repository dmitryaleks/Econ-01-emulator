/** Dense LU with partial pivoting. Boards stay well under a hundred unknowns. */

export class Matrix {
  readonly n: number;
  readonly a: Float64Array;
  readonly b: Float64Array;
  private readonly piv: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.a = new Float64Array(n * n);
    this.b = new Float64Array(n);
    this.piv = new Int32Array(n);
  }

  clear(): void {
    this.a.fill(0);
    this.b.fill(0);
  }

  add(row: number, col: number, value: number): void {
    if (row < 0 || col < 0) return;
    this.a[row * this.n + col]! += value;
  }

  addRhs(row: number, value: number): void {
    if (row < 0) return;
    this.b[row]! += value;
  }

  /**
   * Solve in place. Returns the solution vector (aliases `b`), or null if the matrix is
   * singular — which happens for a floating sub-circuit and is handled by the caller.
   */
  solve(): Float64Array | null {
    const { n, a, b, piv } = this;
    for (let i = 0; i < n; i++) piv[i] = i;

    for (let k = 0; k < n; k++) {
      let max = 0;
      let pivot = -1;
      for (let i = k; i < n; i++) {
        const v = Math.abs(a[i * n + k]!);
        if (v > max) {
          max = v;
          pivot = i;
        }
      }
      if (pivot < 0 || max < 1e-18) return null;

      if (pivot !== k) {
        for (let j = 0; j < n; j++) {
          const t = a[k * n + j]!;
          a[k * n + j] = a[pivot * n + j]!;
          a[pivot * n + j] = t;
        }
        const tb = b[k]!;
        b[k] = b[pivot]!;
        b[pivot] = tb;
      }

      const akk = a[k * n + k]!;
      for (let i = k + 1; i < n; i++) {
        const f = a[i * n + k]! / akk;
        if (f === 0) continue;
        a[i * n + k] = 0;
        for (let j = k + 1; j < n; j++) a[i * n + j]! -= f * a[k * n + j]!;
        b[i]! -= f * b[k]!;
      }
    }

    for (let i = n - 1; i >= 0; i--) {
      let sum = b[i]!;
      for (let j = i + 1; j < n; j++) sum -= a[i * n + j]! * b[j]!;
      b[i] = sum / a[i * n + i]!;
    }
    return b;
  }
}
