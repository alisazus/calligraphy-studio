import { z } from "zod";

/** The bundled script styles: each one an OFL font in public/fonts. */
export const STYLES = [
  { id: "naskh", label: "Naskh" },
  { id: "ruqah", label: "Ruqʿah" },
  { id: "nastaliq", label: "Nastaʿlīq" },
  { id: "kufi", label: "Kufi" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const offset = z.number().min(-2000).max(2000);

export const letterAdjustment = z
  .object({
    x: offset.default(0),
    y: offset.default(0),
    scale: z.number().min(0.1).max(5).default(1),
    rotate: z.number().min(-360).max(360).default(0),
    thickness: z.number().min(0).max(60).default(0),
    elongation: z.number().int().min(0).max(20).default(0),
    color: hex.nullable().default(null),
  })
  .strict();

export type LetterAdjustment = z.infer<typeof letterAdjustment>;

export const mirrorSchema = z
  .object({
    axis: z.enum(["horizontal", "vertical"]),
    gap: z.number().min(-1000).max(1000),
    original: z.object({ x: offset, y: offset }).strict(),
    copy: z.object({ x: offset, y: offset }).strict(),
  })
  .strict();

export type Mirror = z.infer<typeof mirrorSchema>;

export const compositionSchema = z
  .object({
    text: z.string().max(2000),
    style: z.enum(["naskh", "ruqah", "nastaliq", "kufi"]),
    size: z.number().min(10).max(800),
    color: hex,
    background: hex,
    align: z.enum(["right", "center", "left"]),
    lineHeight: z.number().min(0.5).max(4),
    /** Keyed by "line:character", the character's index within its line. */
    letters: z
      .record(z.string().regex(/^\d{1,3}:\d{1,4}$/), letterAdjustment)
      .refine((letters) => Object.keys(letters).length <= 2000),
    mirror: mirrorSchema.nullable(),
  })
  .strict();

export type Composition = z.infer<typeof compositionSchema>;

/** The side of the square artboard, in design units. */
export const ARTBOARD = 1000;

export function defaultComposition(): Composition {
  return {
    text: "بسم الله",
    style: "naskh",
    size: 160,
    color: "#1f2a37",
    background: "#fbf7ef",
    align: "center",
    lineHeight: 1.6,
    letters: {},
    mirror: null,
  };
}

export const NEUTRAL_LETTER: LetterAdjustment = {
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  thickness: 0,
  elongation: 0,
  color: null,
};

/** A preview is an SVG drawn by the editor; nothing that could run. */
export const previewSchema = z
  .string()
  .max(900_000)
  .regex(/^<svg[\s>]/)
  .refine((svg) => !/<script|<foreignObject|\son[a-z]+\s*=|href\s*=/i.test(svg));
