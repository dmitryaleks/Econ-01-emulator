/** A two-channel scope that traces whatever contacts the user clips onto. */

export interface Trace {
  label: string;
  colour: string;
  data: Float32Array;
  head: number;
}

export class Scope {
  private readonly ctx: CanvasRenderingContext2D;
  readonly traces: Trace[] = [];
  /** Seconds of history shown. */
  span = 0.05;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
  }

  setChannels(labels: string[], colours: string[], samples: number): void {
    this.traces.length = 0;
    labels.forEach((label, i) => {
      this.traces.push({
        label,
        colour: colours[i] ?? '#4ad3ff',
        data: new Float32Array(samples),
        head: 0,
      });
    });
  }

  push(values: number[]): void {
    this.traces.forEach((t, i) => {
      t.data[t.head] = values[i] ?? 0;
      t.head = (t.head + 1) % t.data.length;
    });
  }

  render(background: string, grid: string): void {
    const c = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    if (this.canvas.width !== Math.round(rect.width * dpr)) {
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;

    c.clearRect(0, 0, w, h);
    c.fillStyle = background;
    c.fillRect(0, 0, w, h);

    c.strokeStyle = grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      c.moveTo(0, y);
      c.lineTo(w, y);
    }
    for (let i = 1; i < 8; i++) {
      const x = (w * i) / 8;
      c.moveTo(x, 0);
      c.lineTo(x, h);
    }
    c.stroke();

    if (this.traces.length === 0) return;

    // Fixed +-10 V window: everything in this toy sits inside the 8,7 V supply.
    const scale = h / 2 / 10;
    for (const t of this.traces) {
      c.beginPath();
      c.strokeStyle = t.colour;
      c.lineWidth = 1.5;
      const n = t.data.length;
      for (let i = 0; i < n; i++) {
        const v = t.data[(t.head + i) % n]!;
        const x = (i / (n - 1)) * w;
        const y = h / 2 - v * scale;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    c.font = '11px ui-monospace, monospace';
    c.textBaseline = 'top';
    this.traces.forEach((t, i) => {
      c.fillStyle = t.colour;
      c.fillText(t.label, 8, 6 + i * 14);
    });
  }
}
