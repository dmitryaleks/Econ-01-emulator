/** Union-find over string keys, used to merge touching module contacts into nets. */

export class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();
  private pinned = new Set<string>();

  /**
   * Mark a key as the preferred representative of whatever set it lands in. The built-in
   * amplifier refers to its nets by name (GND, VCC, AMP_IN, …), so those names have to survive
   * being merged with a field contact — otherwise the amplifier and the field would end up on
   * two different nets that are supposed to be one.
   */
  pin(key: string): void {
    this.add(key);
    this.pinned.add(key);
  }

  add(key: string): string {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
    return key;
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression.
    let cur = key;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): string {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return ra;

    // A pinned key always stays the representative.
    const pa = this.pinned.has(ra);
    const pb = this.pinned.has(rb);
    if (pa !== pb) {
      const [keep, drop] = pa ? [ra, rb] : [rb, ra];
      this.parent.set(drop, keep);
      this.rank.set(keep, Math.max(this.rank.get(keep)!, this.rank.get(drop)! + 1));
      return keep;
    }

    const ka = this.rank.get(ra)!;
    const kb = this.rank.get(rb)!;
    if (ka < kb) {
      this.parent.set(ra, rb);
      return rb;
    }
    this.parent.set(rb, ra);
    if (ka === kb) this.rank.set(ra, ka + 1);
    return ra;
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  /** All distinct roots currently known. */
  roots(): string[] {
    const set = new Set<string>();
    for (const key of this.parent.keys()) set.add(this.find(key));
    return [...set];
  }

  keys(): string[] {
    return [...this.parent.keys()];
  }
}
