import {
  ARTBOARD,
  NEUTRAL_LETTER,
  type Composition,
  type LetterAdjustment,
} from "@/lib/composition";
import type { Engine } from "./engine";
import {
  IDENTITY,
  multiply,
  parsePath,
  rotate,
  round,
  scale,
  transformBox,
  translate,
  union,
  writePath,
  type Box,
  type Matrix,
  type PathCommand,
} from "./geometry";

export interface PlacedLetter {
  key: string;
  /** The first glyph's id: a letter's joining form shows as a different glyph. */
  gid: number;
  /** Glyph outlines in artboard units, before the letter's own transform. */
  paths: PathCommand[][];
  box: Box;
  adjustment: LetterAdjustment;
  matrix: Matrix;
  /** The SVG transform, or null when the letter is where the text put it. */
  transform: string | null;
  color: string;
}

export interface PlacedLine {
  index: number;
  box: Box;
  letters: PlacedLetter[];
}

export interface Half {
  matrix: Matrix;
  transform: string | null;
}

export interface Layout {
  style: Composition["style"];
  lines: PlacedLine[];
  original: Half;
  copy: Half | null;
}

const TATWEEL = "ـ";
const HARAKAT = /[ً-ٰٟۖ-ۭ]/;
const ARABIC_LETTER = /[ؠ-يٮ-ۓۺ-ۿ]/;
/** Letters that join only to the letter before them. */
const RIGHT_JOINING = new Set(
  "ءآأؤإاةدذرزوٱٲٳٵٶٷڈډڊڋڌڍڎڏڐڑڒړڔڕږڗژڙۀۃۄۅۆۇۈۉۊۋۍۏےۓ",
);

/** Whether a stroke can be lengthened after the character at `index`. */
export function canElongate(line: string, index: number): boolean {
  const char = line[index];
  if (!char || !ARABIC_LETTER.test(char) || RIGHT_JOINING.has(char)) return false;
  let next = index + 1;
  while (next < line.length && HARAKAT.test(line[next]!)) next++;
  return next < line.length && ARABIC_LETTER.test(line[next]!);
}

/** Where the elongation goes: after the letter's marks. */
function elongationPoint(line: string, index: number): number {
  let next = index + 1;
  while (next < line.length && HARAKAT.test(line[next]!)) next++;
  return next;
}

export function letterAdjustment(
  composition: Composition,
  key: string,
): LetterAdjustment {
  return composition.letters[key] ?? NEUTRAL_LETTER;
}

export function layout(composition: Composition, engine: Engine): Layout {
  const k = composition.size / engine.upem;
  const center = ARTBOARD / 2;
  const sourceLines = composition.text.split("\n");

  const shaped = sourceLines.map((line, lineIndex) => {
    // The text as shaped: one tatweel after each elongated letter, which the
    // placement below repeats as many times as the letter asks.
    let text = "";
    const source: number[] = [];
    const repeat = new Map<number, number>();
    const inserts = new Map<number, { from: number; count: number }>();
    for (let i = 0; i < line.length; i++) {
      const count = composition.letters[`${lineIndex}:${i}`]?.elongation ?? 0;
      if (count > 0 && canElongate(line, i)) {
        inserts.set(elongationPoint(line, i), { from: i, count });
      }
    }
    for (let i = 0; i <= line.length; i++) {
      const insert = inserts.get(i);
      if (insert) {
        repeat.set(text.length, insert.count);
        source.push(insert.from);
        text += TATWEEL;
      }
      if (i < line.length) {
        source.push(i);
        text += line[i];
      }
    }
    const glyphs = engine.shape(text).flatMap((glyph) => {
      const count = repeat.get(glyph.cluster) ?? 1;
      return Array.from({ length: count }, () => ({
        ...glyph,
        source: source[glyph.cluster] ?? glyph.cluster,
      }));
    });
    const width = glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0) * k;
    return { line, glyphs, width };
  });

  const widest = Math.max(0, ...shaped.map((line) => line.width));
  const pitch = composition.size * composition.lineHeight;
  const firstBaseline =
    center - ((shaped.length - 1) * pitch) / 2 + composition.size * 0.25;
  const left = center - widest / 2;

  const lines: PlacedLine[] = shaped.map(({ line, glyphs, width }, index) => {
    const baseline = firstBaseline + index * pitch;
    const x0 =
      composition.align === "right"
        ? left + widest - width
        : composition.align === "center"
          ? left + (widest - width) / 2
          : left;
    const byLetter = new Map<
      number,
      { gid: number; paths: PathCommand[][]; boxes: Box[]; advance: Box[] }
    >();
    let pen = 0;
    for (const glyph of glyphs) {
      const gx = x0 + (pen + glyph.xOffset) * k;
      const gy = baseline - glyph.yOffset * k;
      const advance = glyph.xAdvance * k;
      pen += glyph.xAdvance;
      const char = line[glyph.source] ?? "";
      if (/\s/.test(char) || char === "") continue;
      const toArtboard: Matrix = [k, 0, 0, -k, gx, gy];
      let letter = byLetter.get(glyph.source);
      if (!letter) {
        letter = { gid: glyph.gid, paths: [], boxes: [], advance: [] };
        byLetter.set(glyph.source, letter);
      }
      const commands = parsePath(engine.path(glyph.gid));
      if (commands.length > 0) {
        letter.paths.push(
          parsePath(writePath(commands, toArtboard)),
        );
      }
      const box = engine.box(glyph.gid);
      if (box) letter.boxes.push(transformBox(toArtboard, box));
      letter.advance.push({
        x: Math.min(gx, gx + advance),
        y: gy - composition.size * 0.6,
        width: Math.abs(advance),
        height: composition.size * 0.7,
      });
    }
    const letters: PlacedLetter[] = [...byLetter.entries()]
      .sort(([a], [b]) => a - b)
      .map(([source, letter]) => {
        const key = `${index}:${source}`;
        const adjustment = letterAdjustment(composition, key);
        const box = union(letter.boxes) ?? union(letter.advance)!;
        const { matrix, transform } = letterTransform(adjustment, box);
        return {
          key,
          gid: letter.gid,
          paths: letter.paths,
          box,
          adjustment,
          matrix,
          transform,
          color: adjustment.color ?? composition.color,
        };
      });
    return {
      index,
      box: {
        x: x0,
        y: baseline - composition.size * 0.8,
        width,
        height: composition.size * 1.1,
      },
      letters,
    };
  });

  return { style: composition.style, lines, ...halves(composition, lines) };
}

function letterTransform(
  adjustment: LetterAdjustment,
  box: Box,
): { matrix: Matrix; transform: string | null } {
  const { x, y, scale: s, rotate: r } = adjustment;
  if (x === 0 && y === 0 && s === 1 && r === 0) {
    return { matrix: IDENTITY, transform: null };
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const matrix = [
    translate(x, y),
    translate(cx, cy),
    rotate(r),
    scale(s),
    translate(-cx, -cy),
  ].reduce(multiply);
  const transform = `translate(${round(x)} ${round(y)}) rotate(${round(r)} ${round(cx)} ${round(cy)}) translate(${round(cx)} ${round(cy)}) scale(${round(s)}) translate(${round(-cx)} ${round(-cy)})`;
  return { matrix, transform };
}

/** Where the composition and its mirrored copy sit on the artboard. */
function halves(
  composition: Composition,
  lines: PlacedLine[],
): { original: Half; copy: Half | null } {
  const mirror = composition.mirror;
  if (!mirror) return { original: { matrix: IDENTITY, transform: null }, copy: null };
  const bounds = union(
    lines.flatMap((line) =>
      line.letters.map((letter) => transformBox(letter.matrix, letter.box)),
    ),
  ) ?? { x: 0, y: 0, width: 0, height: 0 };
  const center = ARTBOARD / 2;
  if (mirror.axis === "horizontal") {
    const shift = center + mirror.gap / 2 - bounds.x;
    const ox = shift + mirror.original.x;
    const oy = mirror.original.y;
    const tx = ARTBOARD - shift + mirror.copy.x;
    const ty = mirror.copy.y;
    return {
      original: { matrix: translate(ox, oy), transform: `translate(${round(ox)} ${round(oy)})` },
      copy: {
        matrix: multiply(translate(tx, ty), scale(-1, 1)),
        transform: `translate(${round(tx)} ${round(ty)}) scale(-1, 1)`,
      },
    };
  }
  const shift = center - mirror.gap / 2 - (bounds.y + bounds.height);
  const ox = mirror.original.x;
  const oy = shift + mirror.original.y;
  const tx = mirror.copy.x;
  const ty = ARTBOARD - shift + mirror.copy.y;
  return {
    original: { matrix: translate(ox, oy), transform: `translate(${round(ox)} ${round(oy)})` },
    copy: {
      matrix: multiply(translate(tx, ty), scale(1, -1)),
      transform: `translate(${round(tx)} ${round(ty)}) scale(1, -1)`,
    },
  };
}
