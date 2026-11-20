import type { StyleId } from "@/lib/composition";

export interface ShapedGlyph {
  gid: number;
  cluster: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface GlyphBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One style's font, ready to shape text and hand out glyph outlines. */
export interface Engine {
  style: StyleId;
  upem: number;
  shape(text: string): ShapedGlyph[];
  /** The glyph's outline in font units (y up), as absolute M/L/Q/C/Z commands. */
  path(gid: number): string;
  /** Ink box in font units (y up); null for an empty glyph. */
  box(gid: number): GlyphBox | null;
}

type HarfBuzz = typeof import("harfbuzzjs");

let harfbuzz: Promise<HarfBuzz> | null = null;
const engines = new Map<StyleId, Promise<Engine>>();

export function loadEngine(style: StyleId): Promise<Engine> {
  let engine = engines.get(style);
  if (!engine) {
    engine = createEngine(style);
    engine.catch(() => engines.delete(style));
    engines.set(style, engine);
  }
  return engine;
}

async function createEngine(style: StyleId): Promise<Engine> {
  harfbuzz ??= import("harfbuzzjs");
  const [hb, data] = await Promise.all([
    harfbuzz,
    fetch(`/fonts/${style}.ttf`).then((response) => {
      if (!response.ok) throw new Error(`Font ${style}: ${response.status}`);
      return response.arrayBuffer();
    }),
  ]);
  const face = new hb.Face(new hb.Blob(data));
  const font = new hb.Font(face);
  const paths = new Map<number, string>();
  const boxes = new Map<number, GlyphBox | null>();
  return {
    style,
    upem: face.upem,
    shape(text) {
      const buffer = new hb.Buffer();
      buffer.addText(text);
      buffer.setDirection(hb.Direction.RTL);
      buffer.setScript("Arab");
      buffer.setLanguage("ar");
      hb.shape(font, buffer);
      const infos = buffer.getGlyphInfos();
      const positions = buffer.getGlyphPositions();
      return infos.map((info, i) => ({
        gid: info.codepoint,
        cluster: info.cluster,
        xAdvance: positions[i]!.xAdvance,
        xOffset: positions[i]!.xOffset,
        yOffset: positions[i]!.yOffset,
      }));
    },
    path(gid) {
      let d = paths.get(gid);
      if (d === undefined) {
        d = font.glyphToPath(gid);
        paths.set(gid, d);
      }
      return d;
    },
    box(gid) {
      if (!boxes.has(gid)) {
        const extents = font.glyphExtents(gid);
        boxes.set(
          gid,
          extents && extents.width !== 0 && extents.height !== 0
            ? {
                x: extents.xBearing,
                y: extents.yBearing + extents.height,
                width: extents.width,
                height: -extents.height,
              }
            : null,
        );
      }
      return boxes.get(gid)!;
    },
  };
}
