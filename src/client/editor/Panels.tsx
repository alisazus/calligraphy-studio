import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react";
import { useId } from "react";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import {
  NEUTRAL_LETTER,
  STYLES,
  type Composition,
  type LetterAdjustment,
  type Mirror,
} from "@/lib/composition";
import { canElongate } from "@/client/calligraphy/layout";
import { ColorField, NumberField } from "./NumberField";

type Change = (update: (current: Composition) => Composition) => void;

const NUDGE = 5;

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  testPrefix,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
  testPrefix: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label id={id}>{label}</Label>
      <ToggleGroup
        aria-labelledby={id}
        variant="outline"
        spacing={0}
        className="flex w-full flex-wrap"
        value={[value]}
        onValueChange={(next: string[]) => {
          const picked = options.find((option) => option.id === next[0]);
          if (picked) onChange(picked.id);
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            data-testid={`${testPrefix}-${option.id}`}
            className="flex-1"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function Nudges({
  onMove,
  testPrefix,
}: {
  onMove: (dx: number, dy: number) => void;
  testPrefix: string;
}) {
  const moves = [
    { id: "left", label: "Move left", icon: ArrowLeft, dx: -NUDGE, dy: 0 },
    { id: "up", label: "Move up", icon: ArrowUp, dx: 0, dy: -NUDGE },
    { id: "down", label: "Move down", icon: ArrowDown, dx: 0, dy: NUDGE },
    { id: "right", label: "Move right", icon: ArrowRight, dx: NUDGE, dy: 0 },
  ];
  return (
    <div className="flex gap-2">
      {moves.map((move) => (
        <Button
          key={move.id}
          variant="outline"
          size="icon"
          aria-label={move.label}
          data-testid={`${testPrefix}-${move.id}`}
          onClick={() => onMove(move.dx, move.dy)}
        >
          <move.icon aria-hidden />
        </Button>
      ))}
    </div>
  );
}

export function TextPanel({
  composition,
  change,
}: {
  composition: Composition;
  change: Change;
}) {
  const textId = useId();
  const set = <K extends keyof Composition>(key: K, value: Composition[K]) =>
    change((c) => (c[key] === value ? c : { ...c, [key]: value }));
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={textId}>Text</Label>
        <Textarea
          id={textId}
          dir="rtl"
          lang="ar"
          rows={3}
          data-testid="text-input"
          className="text-lg"
          value={composition.text}
          maxLength={2000}
          onChange={(event) => {
            const text = event.target.value;
            change((c) => ({ ...c, text, letters: keepUnchanged(c, text) }));
          }}
        />
      </div>
      <Choice
        label="Style"
        value={composition.style}
        options={STYLES}
        onChange={(style) => set("style", style)}
        testPrefix="style"
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Size"
          testId="size-input"
          value={composition.size}
          min={10}
          max={800}
          onChange={(size) => set("size", size)}
        />
        <NumberField
          label="Line spacing"
          testId="line-spacing-input"
          value={composition.lineHeight}
          min={0.5}
          max={4}
          step={0.1}
          onChange={(lineHeight) => set("lineHeight", lineHeight)}
        />
        <ColorField
          label="Ink"
          testId="color-input"
          value={composition.color}
          onChange={(color) => set("color", color)}
        />
        <ColorField
          label="Background"
          testId="background-input"
          value={composition.background}
          onChange={(background) => set("background", background)}
        />
      </div>
      <Choice
        label="Line alignment"
        value={composition.align}
        options={[
          { id: "right", label: "Right" },
          { id: "center", label: "Centre" },
          { id: "left", label: "Left" },
        ]}
        onChange={(align) => set("align", align)}
        testPrefix="align"
      />
    </div>
  );
}

/** Letter adjustments that still sit on the same character after a text edit. */
function keepUnchanged(composition: Composition, text: string): Composition["letters"] {
  const before = composition.text.split("\n");
  const after = text.split("\n");
  return Object.fromEntries(
    Object.entries(composition.letters).filter(([key]) => {
      const [line, index] = key.split(":").map(Number) as [number, number];
      const char = before[line]?.[index];
      return char !== undefined && after[line]?.[index] === char;
    }),
  );
}

function updateLetter(
  composition: Composition,
  key: string,
  patch: Partial<LetterAdjustment>,
): Composition {
  const current = composition.letters[key] ?? NEUTRAL_LETTER;
  const next = { ...current, ...patch };
  const letters = { ...composition.letters };
  if (Object.entries(next).every(([k, v]) => NEUTRAL_LETTER[k as keyof LetterAdjustment] === v)) {
    delete letters[key];
  } else {
    letters[key] = next;
  }
  return { ...composition, letters };
}

export function moveLetter(composition: Composition, key: string, x: number, y: number) {
  return updateLetter(composition, key, { x, y });
}

export function LetterPanel({
  composition,
  selected,
  change,
}: {
  composition: Composition;
  selected: string | null;
  change: Change;
}) {
  if (!selected) {
    return (
      <p data-testid="letter-hint" className="text-sm text-muted-foreground">
        Select a letter on the artboard to adjust it.
      </p>
    );
  }
  const adjustment = composition.letters[selected] ?? NEUTRAL_LETTER;
  const [line, index] = selected.split(":").map(Number) as [number, number];
  const lineText = composition.text.split("\n")[line] ?? "";
  const elongates = canElongate(lineText, index);
  const set = (patch: Partial<LetterAdjustment>) =>
    change((c) => updateLetter(c, selected, patch));

  return (
    <div className="space-y-5" data-testid="letter-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">
          Letter <span lang="ar" className="text-lg font-medium">{lineText[index]}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => change((c) => {
            if (!c.letters[selected]) return c;
            const letters = { ...c.letters };
            delete letters[selected];
            return { ...c, letters };
          })}
        >
          <RotateCcw data-icon="inline-start" aria-hidden />
          Reset
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Thickness"
          testId="letter-thickness"
          value={adjustment.thickness}
          min={0}
          max={60}
          onChange={(thickness) => set({ thickness })}
        />
        <NumberField
          label="Elongation"
          testId="letter-elongation"
          value={adjustment.elongation}
          min={0}
          max={20}
          disabled={!elongates}
          onChange={(elongation) => set({ elongation: Math.round(elongation) })}
        />
        <NumberField
          label="Scale"
          testId="letter-scale"
          unit="%"
          value={Math.round(adjustment.scale * 100)}
          min={10}
          max={500}
          onChange={(scale) => set({ scale: scale / 100 })}
        />
        <NumberField
          label="Rotation"
          testId="letter-rotation"
          unit="°"
          value={adjustment.rotate}
          min={-360}
          max={360}
          onChange={(rotate) => set({ rotate })}
        />
        <NumberField
          label="Horizontal"
          testId="letter-x"
          value={adjustment.x}
          min={-2000}
          max={2000}
          onChange={(x) => set({ x })}
        />
        <NumberField
          label="Vertical"
          testId="letter-y"
          value={adjustment.y}
          min={-2000}
          max={2000}
          onChange={(y) => set({ y })}
        />
      </div>
      <Nudges
        testPrefix="nudge"
        onMove={(dx, dy) =>
          change((c) => {
            const current = c.letters[selected] ?? NEUTRAL_LETTER;
            return updateLetter(c, selected, { x: current.x + dx, y: current.y + dy });
          })
        }
      />
      <ColorField
        label="Colour"
        testId="letter-color"
        value={adjustment.color ?? composition.color}
        onChange={(color) => set({ color })}
      />
    </div>
  );
}

export function MirrorPanel({
  composition,
  half,
  onHalf,
  change,
}: {
  composition: Composition;
  half: "original" | "copy";
  onHalf: (half: "original" | "copy") => void;
  change: Change;
}) {
  const mirror = composition.mirror;
  if (!mirror) {
    return (
      <div>
        <Button
          data-testid="mirror-add"
          onClick={() =>
            change((c) => ({
              ...c,
              mirror: {
                axis: "horizontal",
                gap: 20,
                original: { x: 0, y: 0 },
                copy: { x: 0, y: 0 },
              },
            }))
          }
        >
          Add mirrored copy
        </Button>
      </div>
    );
  }
  const set = (patch: Partial<Mirror>) =>
    change((c) => (c.mirror ? { ...c, mirror: { ...c.mirror, ...patch } } : c));
  return (
    <div className="space-y-5">
      <Choice
        label="Mirror"
        value={mirror.axis}
        options={[
          { id: "horizontal", label: "Side by side" },
          { id: "vertical", label: "Above and below" },
        ]}
        onChange={(axis) => set({ axis })}
        testPrefix="mirror-axis"
      />
      <NumberField
        label="Gap"
        testId="mirror-gap"
        value={mirror.gap}
        min={-1000}
        max={1000}
        onChange={(gap) => set({ gap })}
      />
      <Choice
        label="Move"
        value={half}
        options={[
          { id: "original", label: "Original" },
          { id: "copy", label: "Copy" },
        ]}
        onChange={onHalf}
        testPrefix="half-select"
      />
      <Nudges
        testPrefix="half-nudge"
        onMove={(dx, dy) =>
          change((c) => {
            if (!c.mirror) return c;
            const at = c.mirror[half];
            return { ...c, mirror: { ...c.mirror, [half]: { x: at.x + dx, y: at.y + dy } } };
          })
        }
      />
      <Button
        variant="outline"
        data-testid="mirror-remove"
        onClick={() => change((c) => ({ ...c, mirror: null }))}
      >
        Remove copy
      </Button>
    </div>
  );
}
