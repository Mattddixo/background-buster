export interface GridShape {
  rows: number;
  cols: number;
}

// Picks the rows x cols grid that best matches the target's aspect ratio,
// using empty-cell waste only as a tiebreaker between similarly-matched
// shapes. Aspect match is weighted far more heavily than waste on purpose:
// a prime count like 5 has two waste-free shapes (1x5 and 5x1), both
// degenerate strips of sliver-thin cells, and either would win outright
// under an aspect-agnostic or waste-first score. Tolerating one empty cell
// to land on a near-square 3x2 instead reads as an intentional layout
// rather than a graphics glitch.
export function chooseGrid(count: number, targetAspect: number): GridShape {
  let best: GridShape & { score: number } = { rows: count, cols: 1, score: Infinity };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const waste = rows * cols - count;
    const aspectDiff = Math.abs(Math.log(cols / rows / targetAspect));
    const score = aspectDiff * 8 + waste;
    if (score < best.score) best = { rows, cols, score };
  }
  return { rows: best.rows, cols: best.cols };
}

export interface AxisLayout {
  sizes: number[];
  offsets: number[];
}

// Splits `available` pixels into `count` cells whose sizes sum back to
// `available` exactly (rounding boundaries rather than each size
// independently), so cells never leave a stray gap or overlap by a pixel.
export function distribute(available: number, count: number): AxisLayout {
  const boundaries = Array.from({ length: count + 1 }, (_, i) => Math.round((i * available) / count));
  const sizes: number[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    offsets.push(boundaries[i]);
    sizes.push(boundaries[i + 1] - boundaries[i]);
  }
  return { sizes, offsets };
}

export function defaultGutter(target: { width: number; height: number }): number {
  const proportional = Math.round(Math.min(target.width, target.height) * 0.01);
  return Math.min(24, Math.max(2, proportional));
}
