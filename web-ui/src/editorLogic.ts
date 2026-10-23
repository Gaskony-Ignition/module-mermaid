// The graphical editor's decisions, free of React and the DOM so they can be unit-tested.

/** Undo/redo over whole definition strings. The Designer's own Undo ignores component writes. */
export class EditHistory {
  private past: string[] = [];
  private future: string[] = [];

  constructor(private readonly limit = 50) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Call before writing a new definition, with the one it replaces. */
  record(before: string): void {
    this.past.push(before);
    if (this.past.length > this.limit) {
      this.past.splice(0, this.past.length - this.limit);
    }
    this.future = [];
  }

  /** The definition to go back to, or undefined; current goes on the redo side. */
  undo(current: string): string | undefined {
    const previous = this.past.pop();
    if (previous !== undefined) {
      this.future.push(current);
    }
    return previous;
  }

  redo(current: string): string | undefined {
    const next = this.future.pop();
    if (next !== undefined) {
      this.past.push(current);
    }
    return next;
  }
}

// Indentation, trailing spaces and blank lines are the only differences that don't matter.
function layoutFree(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Whether the first edit has to ask before rewriting: the serialiser drops comments and
 * normalises statement layout, so anything it would change beyond whitespace is lost text.
 */
export function needsRewriteConfirm(original: string, serialised: string, hasComments: boolean, accepted: boolean): boolean {
  if (accepted) {
    return false;
  }
  return hasComments || layoutFree(original) !== layoutFree(serialised);
}

const FLOWCHART_DOM_MARKER = '-flowchart-';

/**
 * The flowchart node id behind a rendered node's DOM id, `<svgId>-flowchart-<id>-<n>`. The
 * counter changes on every redraw, so selection is kept by node id. Returns null for an id
 * that isn't a known node's.
 */
export function nodeIdFromDomId(domId: string, nodeIds: readonly string[]): string | null {
  const at = domId.indexOf(FLOWCHART_DOM_MARKER);
  if (at < 0) {
    return null;
  }
  const match = /^(.*)-\d+$/.exec(domId.slice(at + FLOWCHART_DOM_MARKER.length));
  return match && nodeIds.includes(match[1]) ? match[1] : null;
}

/**
 * The edge id behind an edge path's or label's data-id: the id itself, or the id behind a
 * diagram prefix. The longest match wins: data-id `a-e1` is edge `a-e1`, not edge `e1`.
 */
export function edgeIdFromDataId(dataId: string, edgeIds: readonly string[]): string | null {
  let best: string | null = null;
  for (const id of edgeIds) {
    if ((dataId === id || dataId.endsWith(`-${id}`)) && (best === null || id.length > best.length)) {
      best = id;
    }
  }
  return best;
}
