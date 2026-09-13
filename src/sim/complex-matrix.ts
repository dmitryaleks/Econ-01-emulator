/** Dense complex LU with partial pivoting, for the radio-frequency phasor network. */

export class ComplexMatrix {
  readonly n: number;
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly bRe: Float64Array;
  readonly bIm: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.re = new Float64Array(n * n);
    this.im = new Float64Array(n * n);
    this.bRe = new Float64Array(n);
    this.bIm = new Float64Array(n);
  }

  clear(): void {
    this.re.fill(0);
    this.im.fill(0);
    this.bRe.fill(0);
    this.bIm.fill(0);
  }

  add(row: number, col: number, re: number, im = 0): void {
    if (row < 0 || col < 0) return;
    const k = row * this.n + col;
    this.re[k]! += re;
    this.im[k]! += im;
  }

  addRhs(row: number, re: number, im = 0): void {
    if (row < 0) return;
    this.bRe[row]! += re;
    this.bIm[row]! += im;
  }

  /** Solve in place; the solution is left in bRe/bIm. False if the matrix is singular. */
  solve(): boolean {
    const { n, re, im, bRe, bIm } = this;
    for (let k = 0; k < n; k++) {
      let max = 0;
      let pivot = -1;
      for (let i = k; i < n; i++) {
        const m = Math.abs(re[i * n + k]!) + Math.abs(im[i * n + k]!);
        if (m > max) {
          max = m;
          pivot = i;
        }
      }
      if (pivot < 0 || max < 1e-30) return false;
      if (pivot !== k) {
        for (let j = 0; j < n; j++) {
          const a = k * n + j;
          const b = pivot * n + j;
          let t = re[a]!;
          re[a] = re[b]!;
          re[b] = t;
          t = im[a]!;
          im[a] = im[b]!;
          im[b] = t;
        }
        let t = bRe[k]!;
        bRe[k] = bRe[pivot]!;
        bRe[pivot] = t;
        t = bIm[k]!;
        bIm[k] = bIm[pivot]!;
        bIm[pivot] = t;
      }

      // 1 / pivot
      const pr = re[k * n + k]!;
      const pi = im[k * n + k]!;
      const d = pr * pr + pi * pi;
      const ir = pr / d;
      const ii = -pi / d;

      for (let i = k + 1; i < n; i++) {
        const ar = re[i * n + k]!;
        const ai = im[i * n + k]!;
        if (ar === 0 && ai === 0) continue;
        const fr = ar * ir - ai * ii;
        const fi = ar * ii + ai * ir;
        re[i * n + k] = 0;
        im[i * n + k] = 0;
        for (let j = k + 1; j < n; j++) {
          const cr = re[k * n + j]!;
          const ci = im[k * n + j]!;
          if (cr === 0 && ci === 0) continue;
          re[i * n + j]! -= fr * cr - fi * ci;
          im[i * n + j]! -= fr * ci + fi * cr;
        }
        const br = bRe[k]!;
        const bi = bIm[k]!;
        bRe[i]! -= fr * br - fi * bi;
        bIm[i]! -= fr * bi + fi * br;
      }
    }

    for (let i = n - 1; i >= 0; i--) {
      let sr = bRe[i]!;
      let si = bIm[i]!;
      for (let j = i + 1; j < n; j++) {
        const ar = re[i * n + j]!;
        const ai = im[i * n + j]!;
        if (ar === 0 && ai === 0) continue;
        const xr = bRe[j]!;
        const xi = bIm[j]!;
        sr -= ar * xr - ai * xi;
        si -= ar * xi + ai * xr;
      }
      const pr = re[i * n + i]!;
      const pi = im[i * n + i]!;
      const d = pr * pr + pi * pi;
      bRe[i] = (sr * pr + si * pi) / d;
      bIm[i] = (si * pr - sr * pi) / d;
    }
    return true;
  }
}
