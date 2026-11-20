import { ARTBOARD, type Composition } from "@/lib/composition";
import {
  apply,
  multiply,
  writePath,
  IDENTITY,
  type Matrix,
  type PathCommand,
} from "./geometry";
import type { Layout, PlacedLetter } from "./layout";

type SvgMode = "color" | "transparent" | "outline";

function letterSvg(letter: PlacedLetter, mode: SvgMode): string {
  const paths = letter.paths
    .map((commands) => `<path d="${writePath(commands, IDENTITY)}"/>`)
    .join("");
  if (mode === "outline") {
    return `<g fill="none" stroke="#000" stroke-width="1"${letter.transform ? ` transform="${letter.transform}"` : ""}>${paths}</g>`;
  }
  const stroke =
    letter.adjustment.thickness > 0
      ? ` stroke="${letter.color}" stroke-width="${letter.adjustment.thickness}" stroke-linejoin="round"`
      : "";
  return `<g fill="${letter.color}"${stroke}${letter.transform ? ` transform="${letter.transform}"` : ""}>${paths}</g>`;
}

/** The design as an SVG document, the way exports and previews show it. */
export function toSvg(
  layout: Layout,
  composition: Composition,
  mode: SvgMode = "color",
): string {
  const content = layout.lines
    .flatMap((line) => line.letters.map((letter) => letterSvg(letter, mode)))
    .join("");
  const original = layout.original.transform
    ? `<g transform="${layout.original.transform}">${content}</g>`
    : `<g>${content}</g>`;
  const copy = layout.copy
    ? `<g transform="${layout.copy.transform}">${content}</g>`
    : "";
  const background =
    mode === "color"
      ? `<rect width="${ARTBOARD}" height="${ARTBOARD}" fill="${composition.background}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ARTBOARD}" height="${ARTBOARD}" viewBox="0 0 ${ARTBOARD} ${ARTBOARD}">${background}${original}${copy}</svg>`;
}

/** A raster of the design, `width` pixels on each side. */
export async function toPng(svg: string, width: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.width = width;
    image.height = width;
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw images");
    context.drawImage(image, 0, 0, width, width);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG failed"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Points per artboard unit: the page is 600 pt square. */
const PDF_SCALE = 0.6;

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
    .map((channel) => (channel / 255).toFixed(3))
    .join(" ");
}

const n = (value: number) => {
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

function pdfPath(commands: PathCommand[], m: Matrix): string {
  let out = "";
  let last: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  const p = (point: [number, number]) => {
    const [x, y] = apply(m, point[0], point[1]);
    return [x * PDF_SCALE, (ARTBOARD - y) * PDF_SCALE] as [number, number];
  };
  for (const command of commands) {
    const points = command.points.map(p);
    switch (command.type) {
      case "M":
        last = start = points[0]!;
        out += `${n(last[0])} ${n(last[1])} m\n`;
        break;
      case "L":
        last = points[0]!;
        out += `${n(last[0])} ${n(last[1])} l\n`;
        break;
      case "Q": {
        const [control, end] = points as [[number, number], [number, number]];
        const c1 = [last[0] + (2 / 3) * (control[0] - last[0]), last[1] + (2 / 3) * (control[1] - last[1])];
        const c2 = [end[0] + (2 / 3) * (control[0] - end[0]), end[1] + (2 / 3) * (control[1] - end[1])];
        out += `${n(c1[0]!)} ${n(c1[1]!)} ${n(c2[0]!)} ${n(c2[1]!)} ${n(end[0])} ${n(end[1])} c\n`;
        last = end;
        break;
      }
      case "C": {
        const [c1, c2, end] = points as [[number, number], [number, number], [number, number]];
        out += `${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(end[0])} ${n(end[1])} c\n`;
        last = end;
        break;
      }
      case "Z":
        out += "h\n";
        last = start;
        break;
    }
  }
  return out;
}

/** A one-page vector PDF of the design: outlines, not pixels. */
export function toPdf(layout: Layout, composition: Composition): Blob {
  const size = ARTBOARD * PDF_SCALE;
  let content = `${rgb(composition.background)} rg\n0 0 ${n(size)} ${n(size)} re f\n`;
  const halves = [layout.original, ...(layout.copy ? [layout.copy] : [])];
  for (const half of halves) {
    for (const line of layout.lines) {
      for (const letter of line.letters) {
        const m = multiply(half.matrix, letter.matrix);
        const thickness = letter.adjustment.thickness;
        content += `${rgb(letter.color)} rg\n`;
        if (thickness > 0) {
          content += `${rgb(letter.color)} RG ${n(thickness * PDF_SCALE)} w 1 j\n`;
        }
        for (const commands of letter.paths) content += pdfPath(commands, m);
        content += thickness > 0 ? "B\n" : "f\n";
      }
    }
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(size)} ${n(size)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
}

/** A file name from the project's title. */
export function fileName(title: string, suffix: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim() || "design";
  return `${base}${suffix}.${extension}`;
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
