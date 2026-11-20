import { useCallback, useState } from "react";
import type { Composition } from "@/lib/composition";

interface History {
  past: Composition[];
  present: Composition;
  future: Composition[];
}

const LIMIT = 200;

/** The composition with undo and redo. */
export function useHistory(initial: Composition) {
  const [history, setHistory] = useState<History>({
    past: [],
    present: initial,
    future: [],
  });

  /** A change that can be undone. */
  const change = useCallback((update: (current: Composition) => Composition) => {
    setHistory((h) => {
      const next = update(h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  /** A change in progress, such as a drag: shown, not yet in the history. */
  const preview = useCallback((update: (current: Composition) => Composition) => {
    setHistory((h) => ({ ...h, present: update(h.present) }));
  }, []);

  /** Ends a change in progress that started from `base`. */
  const commit = useCallback((base: Composition) => {
    setHistory((h) =>
      h.present === base
        ? h
        : { past: [...h.past, base].slice(-LIMIT), present: h.present, future: [] },
    );
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const previous = h.past.at(-1);
      if (!previous) return h;
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      const [next, ...rest] = h.future;
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future: rest };
    });
  }, []);

  return {
    composition: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    change,
    preview,
    commit,
    undo,
    redo,
  };
}
