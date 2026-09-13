/**
 * Exponentially scaled modified Bessel functions of the first kind, e^−x·I0(x) and e^−x·I1(x),
 * for x ≥ 0 (Abramowitz & Stegun 9.8.1–9.8.4, accurate to about 1e-7).
 *
 * They are what an exponential junction does to a sinusoid: with v = V0 + A·cos θ,
 * exp(v/Vt) = exp(V0/Vt)·(I0(a) + 2·I1(a)·cos θ + …), a = A/Vt. Scaling by e^−a keeps the
 * product with exp(V0/Vt + a) finite for large drive.
 */

export function besselI0e(x: number): number {
  if (x < 3.75) {
    const t = (x / 3.75) ** 2;
    const i0 =
      1 +
      t * (3.5156229 +
        t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    return i0 * Math.exp(-x);
  }
  const t = 3.75 / x;
  return (
    (0.39894228 +
      t * (0.01328592 +
        t * (0.00225319 +
          t * (-0.00157565 +
            t * (0.00916281 +
              t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) /
    Math.sqrt(x)
  );
}

export function besselI1e(x: number): number {
  if (x < 3.75) {
    const t = (x / 3.75) ** 2;
    const i1OverX =
      0.5 +
      t * (0.87890594 +
        t * (0.51498869 +
          t * (0.15084934 + t * (0.02658733 + t * (0.00301532 + t * 0.00032411)))));
    return i1OverX * x * Math.exp(-x);
  }
  const t = 3.75 / x;
  return (
    (0.39894228 +
      t * (-0.03988024 +
        t * (-0.00362018 +
          t * (0.00163801 +
            t * (-0.01031555 +
              t * (0.02282967 + t * (-0.02895312 + t * (0.01787654 + t * -0.00420059)))))))) /
    Math.sqrt(x)
  );
}

/**
 * e^−x·2·I1(x)/x: the large-signal fundamental gain of an exponential junction relative to its
 * small-signal gain. 1 at x = 0, falling as the drive grows.
 */
export function besselGain(x: number): number {
  if (x < 1e-6) return 1 - x;
  return (2 * besselI1e(x)) / x;
}
