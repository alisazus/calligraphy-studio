import { useRef } from "react";
import { ARTBOARD, type Composition } from "@/lib/composition";
import { transformBox } from "@/client/calligraphy/geometry";
import type { Layout, PlacedLetter } from "@/client/calligraphy/layout";

export interface DragHandlers {
  /** A letter was pressed: select it. */
  onSelect: (key: string | null) => void;
  /** A drag moved the selected letter by (dx, dy) design units from where it started. */
  onDrag: (key: string, dx: number, dy: number) => void;
  onDragEnd: () => void;
}

/** The artboard: the design drawn as vector letters. */
export function Canvas({
  layout,
  composition,
  ready,
  selected,
  editable,
  handlers,
}: {
  layout: Layout | null;
  composition: Composition;
  ready: boolean;
  selected: string | null;
  editable: boolean;
  handlers: DragHandlers;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);

  function unitsPerPixel(): number {
    const ctm = svg.current?.getScreenCTM();
    return ctm && ctm.a ? 1 / ctm.a : 1;
  }

  function letterGroup(letter: PlacedLetter, testId: string, interactive: boolean) {
    return (
      <g
        key={letter.key}
        data-testid={testId}
        data-key={letter.key}
        data-gid={letter.gid}
        data-glyphs={letter.paths.length}
        data-selected={interactive && selected === letter.key ? "true" : undefined}
        fill={letter.color}
        stroke={letter.adjustment.thickness > 0 ? letter.color : undefined}
        strokeWidth={letter.adjustment.thickness > 0 ? letter.adjustment.thickness : undefined}
        strokeLinejoin={letter.adjustment.thickness > 0 ? "round" : undefined}
        transform={letter.transform ?? undefined}
        className={interactive && editable ? "cursor-move" : undefined}
        onPointerDown={
          interactive && editable
            ? (event) => {
                event.stopPropagation();
                svg.current?.setPointerCapture(event.pointerId);
                drag.current = { key: letter.key, x: event.clientX, y: event.clientY, moved: false };
                handlers.onSelect(letter.key);
              }
            : undefined
        }
      >
        {interactive ? (
          <rect
            x={letter.box.x}
            y={letter.box.y}
            width={letter.box.width}
            height={letter.box.height}
            fill="transparent"
            stroke="none"
          />
        ) : null}
        {letter.paths.map((commands, index) => (
          <path key={index} d={pathData(commands)} />
        ))}
      </g>
    );
  }

  // Reading order puts the first letter on top where boxes overlap, and the
  // selected letter above all of them.
  const ordered = (letters: PlacedLetter[]) => {
    const reversed = [...letters].reverse();
    return selected
      ? [...reversed.filter((l) => l.key !== selected), ...reversed.filter((l) => l.key === selected)]
      : reversed;
  };

  const selectedLetter = layout?.lines
    .flatMap((line) => line.letters)
    .find((letter) => letter.key === selected);
  const selectionBox = selectedLetter
    ? transformBox(layout!.original.matrix, transformBox(selectedLetter.matrix, selectedLetter.box))
    : null;

  return (
    <svg
      ref={svg}
      data-testid="canvas"
      data-ready={ready && layout ? "true" : "false"}
      data-style={layout?.style}
      viewBox={`0 0 ${ARTBOARD} ${ARTBOARD}`}
      className="block size-full touch-none select-none"
      role="img"
      aria-label="Design"
      onPointerDown={() => editable && handlers.onSelect(null)}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (!current.moved && Math.hypot(dx, dy) < 3) return;
        current.moved = true;
        const k = unitsPerPixel();
        handlers.onDrag(current.key, Math.round(dx * k), Math.round(dy * k));
      }}
      onPointerUp={() => {
        if (drag.current?.moved) handlers.onDragEnd();
        drag.current = null;
      }}
      onPointerCancel={() => {
        if (drag.current?.moved) handlers.onDragEnd();
        drag.current = null;
      }}
    >
      <rect width={ARTBOARD} height={ARTBOARD} fill={composition.background} />
      {layout ? (
        <>
          <g data-testid="half-original" transform={layout.original.transform ?? undefined}>
            {layout.lines.map((line) => (
              <g key={line.index}>
                <rect
                  data-testid={`line-${line.index}`}
                  x={line.box.x}
                  y={line.box.y}
                  width={Math.max(line.box.width, 0.01)}
                  height={line.box.height}
                  fill="none"
                  stroke="none"
                  pointerEvents="none"
                />
                {ordered(line.letters).map((letter) => letterGroup(letter, "letter", true))}
              </g>
            ))}
          </g>
          {layout.copy ? (
            <g data-testid="half-copy" transform={layout.copy.transform ?? undefined} pointerEvents="none">
              {layout.lines.flatMap((line) =>
                line.letters.map((letter) => letterGroup(letter, "letter-copy", false)),
              )}
            </g>
          ) : null}
          {selectionBox && editable ? (
            <rect
              data-testid="selection-box"
              x={selectionBox.x - 6}
              y={selectionBox.y - 6}
              width={selectionBox.width + 12}
              height={selectionBox.height + 12}
              fill="none"
              strokeWidth={2}
              strokeDasharray="8 6"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              className="stroke-primary"
            />
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

const pathCache = new WeakMap<object, string>();

function pathData(commands: PlacedLetter["paths"][number]): string {
  let d = pathCache.get(commands);
  if (d === undefined) {
    d = commands
      .map((c) => c.type + c.points.map((p) => `${p[0]} ${p[1]}`).join(" "))
      .join("");
    pathCache.set(commands, d);
  }
  return d;
}
