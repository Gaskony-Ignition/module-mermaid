import { describe, expect, it } from 'vitest';
import { EditHistory, edgeIdFromDataId, needsRewriteConfirm, nodeIdFromDomId } from './editorLogic';
import { isDesignMode } from './designMode';

describe('EditHistory', () => {
  it('undoes and redoes in order', () => {
    const h = new EditHistory();
    h.record('a');
    h.record('b');
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeUndefined();
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.redo('c')).toBeUndefined();
  });

  it('drops the redo side on a new edit', () => {
    const h = new EditHistory();
    h.record('a');
    h.undo('b');
    expect(h.canRedo).toBe(true);
    h.record('a');
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(true);
  });

  it('keeps only the newest entries up to its limit', () => {
    const h = new EditHistory(3);
    for (const t of ['1', '2', '3', '4', '5']) h.record(t);
    expect(h.undo('6')).toBe('5');
    expect(h.undo('5')).toBe('4');
    expect(h.undo('4')).toBe('3');
    expect(h.undo('3')).toBeUndefined();
  });
});

describe('needsRewriteConfirm', () => {
  const serialised = 'flowchart TB\n    A[Start]\n    B\n    A --> B\n';

  it('does not ask when only whitespace differs', () => {
    expect(needsRewriteConfirm('flowchart TB\n  A[Start]  \n\n  B\nA --> B', serialised, false, false)).toBe(false);
    expect(needsRewriteConfirm('flowchart TB\r\n    A[Start]\r\n    B\r\n    A --> B\r\n', serialised, false, false)).toBe(false);
  });

  it('asks when statements are rewritten', () => {
    expect(needsRewriteConfirm('flowchart TB\n    A[Start] --> B', serialised, false, false)).toBe(true);
    expect(needsRewriteConfirm('flowchart TD\n    A[Start]\n    B\n    A --> B', serialised, false, false)).toBe(true);
  });

  it('asks when comments would be dropped', () => {
    expect(needsRewriteConfirm(serialised, serialised, true, false)).toBe(true);
  });

  it('never asks again once accepted', () => {
    expect(needsRewriteConfirm('graph TD\n%% note\nA-->B', serialised, true, true)).toBe(false);
  });
});

describe('nodeIdFromDomId', () => {
  const ids = ['A', 'my-node', 'n1', 'x-flowchart-y'];

  it('reads the node id from the DOM id', () => {
    expect(nodeIdFromDomId('gaskony-mermaid-1-3-flowchart-A-0', ids)).toBe('A');
    expect(nodeIdFromDomId('gaskony-mermaid-1-7-flowchart-A-12', ids)).toBe('A');
    expect(nodeIdFromDomId('gaskony-mermaid-2-1-flowchart-my-node-4', ids)).toBe('my-node');
    expect(nodeIdFromDomId('gaskony-mermaid-2-1-flowchart-x-flowchart-y-9', ids)).toBe('x-flowchart-y');
  });

  it('refuses ids that are not a known node', () => {
    expect(nodeIdFromDomId('gaskony-mermaid-1-3-flowchart-Z-0', ids)).toBeNull();
    expect(nodeIdFromDomId('gaskony-mermaid-1-3-L_A_B_0', ids)).toBeNull();
    expect(nodeIdFromDomId('gaskony-mermaid-1-3-flowchart-A', ids)).toBeNull();
  });
});

describe('edgeIdFromDataId', () => {
  const ids = ['L_A_B_0', 'e1', 'a-e1'];

  it('matches the id bare or behind a prefix', () => {
    expect(edgeIdFromDataId('L_A_B_0', ids)).toBe('L_A_B_0');
    expect(edgeIdFromDataId('gaskony-mermaid-1-3-L_A_B_0', ids)).toBe('L_A_B_0');
    expect(edgeIdFromDataId('a-e1', ids)).toBe('a-e1');
    expect(edgeIdFromDataId('e1', ids)).toBe('e1');
    expect(edgeIdFromDataId('L_A_C_0', ids)).toBeNull();
  });
});

describe('isDesignMode', () => {
  it('is true only when the page says it is not previewing', () => {
    expect(isDesignMode({ view: { page: { parent: { isPreviewing: false } } } })).toBe(true);
    expect(isDesignMode({ view: { page: { parent: { isPreviewing: true } } } })).toBe(false);
    expect(isDesignMode({ view: { page: { parent: {} } } })).toBe(false);
    expect(isDesignMode({ view: { page: {} } })).toBe(false);
    expect(isDesignMode({})).toBe(false);
    expect(isDesignMode(undefined)).toBe(false);
  });
});
