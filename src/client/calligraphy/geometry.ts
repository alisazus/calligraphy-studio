/** An affine transform [a, b, c, d, e, f], as in SVG's matrix(). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m then n: the point is transformed by n first, then m (SVG order). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (x: number, y = x): Matrix => [x, 0, 0, y, 0, 0];
export function rotate(degrees: number): Matrix {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The axis-aligned box around a transformed box. */
export function transformBox(m: Matrix, box: Box): Box {
  const corners = [
    apply(m, box.x, box.y),
    apply(m, box.x + box.width, box.y),
    apply(m, box.x, box.y + box.height),
    apply(m, box.x + box.width, box.y + box.height),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export const round = (n: number) => Math.round(n * 100) / 100;

export interface PathCommand {
  type: "M" | "L" | "Q" | "C" | "Z";
  points: [number, number][];
}

/** Reads the absolute M/L/Q/C/Z paths glyph outlines are made of. */
export function parsePath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let current: PathCommand | null = null;
  let pending: number[] = [];
  for (const token of tokens) {
    if (/^[MLQCZ]$/i.test(token)) {
      current = { type: token.toUpperCase() as PathCommand["type"], points: [] };
      commands.push(current);
      pending = [];
    } else if (current) {
      pending.push(Number(token));
      if (pending.length === 2) {
        current.points.push([pending[0]!, pending[1]!]);
        pending = [];
      }
    }
  }
  return commands;
}

/** Writes commands back as an SVG path, each point through `m`. */
export function writePath(commands: PathCommand[], m: Matrix): string {
  let out = "";
  for (const command of commands) {
    out += command.type;
    out += command.points
      .map((point) => {
        const [x, y] = apply(m, point[0], point[1]);
        return `${round1(x)} ${round1(y)}`;
      })
      .join(" ");
  }
  return out;
}

const round1 = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};
