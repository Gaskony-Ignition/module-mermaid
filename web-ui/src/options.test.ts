import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZOOM,
  diagramAccessibleName,
  fitTransform,
  normaliseSecurityLevel,
  normaliseTheme,
  normaliseZoom,
  roundScale,
} from './options';

describe('normalisers', () => {
  it('falls back to strict for an unknown security level', () => {
    expect(normaliseSecurityLevel('loose')).toBe('loose');
    expect(normaliseSecurityLevel('LOOSE')).toBe('strict');
    expect(normaliseSecurityLevel('')).toBe('strict');
  });

  it('falls back to the default theme', () => {
    expect(normaliseTheme('dark')).toBe('dark');
    expect(normaliseTheme('solarized')).toBe('default');
  });

  it('keeps max at or above min and clamps the initial zoom into range', () => {
    const z = normaliseZoom({ min: 2, max: 1, initial: 10 });
    expect(z.max).toBe(2);
    expect(z.initial).toBe(2);
  });

  it('replaces non-finite numbers with defaults', () => {
    expect(normaliseZoom({ step: NaN }).step).toBe(DEFAULT_ZOOM.step);
  });

  it('needs a modifier for wheel zoom unless told otherwise', () => {
    expect(normaliseZoom({}).wheelModifier).toBe(true);
    expect(normaliseZoom({ wheelModifier: false }).wheelModifier).toBe(false);
  });
});

describe('diagramAccessibleName', () => {
  it('drops the -vN suffix mermaid adds to some diagram types', () => {
    expect(diagramAccessibleName('flowchart-v2')).toBe('Flowchart');
    expect(diagramAccessibleName('stateDiagram-v2')).toBe('State diagram');
  });

  it('splits camelCase ids into words', () => {
    expect(diagramAccessibleName('classDiagram')).toBe('Class diagram');
    expect(diagramAccessibleName('gitGraph')).toBe('Git graph');
  });

  it('appends "diagram" only when the id does not already name its own kind', () => {
    expect(diagramAccessibleName('sequence')).toBe('Sequence diagram');
    expect(diagramAccessibleName('pie')).toBe('Pie diagram');
    expect(diagramAccessibleName('mindmap')).toBe('Mindmap');
  });
});

describe('fitTransform', () => {
  const zoom = normaliseZoom({});

  it('returns null until the viewport has a size', () => {
    expect(fitTransform({ width: 100, height: 50 }, { width: 0, height: 0 }, 'contain', 0, zoom, false)).toBeNull();
  });

  it('contains a wide diagram by its width and centres it vertically', () => {
    const t = fitTransform({ width: 400, height: 100 }, { width: 200, height: 200 }, 'contain', 0, zoom, false);
    expect(t).toEqual({ x: 0, y: 75, scale: 0.5 });
  });

  it('applies the initial zoom only on the first fit', () => {
    const z = normaliseZoom({ initial: 2 });
    const first = fitTransform({ width: 100, height: 100 }, { width: 100, height: 100 }, 'contain', 0, z, true);
    const later = fitTransform({ width: 100, height: 100 }, { width: 100, height: 100 }, 'contain', 0, z, false);
    expect(first?.scale).toBe(2);
    expect(later?.scale).toBe(1);
  });

  it('fits below a control bar, keeping padding under it', () => {
    // 200x200 viewport, 40px bar: the diagram gets the 160px below it, less 8px padding each side.
    const t = fitTransform({ width: 100, height: 400 }, { width: 200, height: 200 }, 'contain', 8, zoom, false, 40);
    expect(t?.scale).toBeCloseTo(144 / 400);
    expect(t?.y).toBeCloseTo(48);
    const wide = fitTransform({ width: 400, height: 100 }, { width: 200, height: 200 }, 'contain', 0, zoom, false, 40);
    expect(wide).toEqual({ x: 0, y: 40 + (160 - 50) / 2, scale: 0.5 });
  });

  it('never puts the top of the diagram under the bar, whatever the fit mode', () => {
    const tall = { width: 100, height: 1000 };
    for (const mode of ['contain', 'width', 'height', 'none'] as const) {
      const t = fitTransform(tall, { width: 200, height: 200 }, mode, 8, zoom, false, 40);
      expect(t?.y, mode).toBeGreaterThanOrEqual(48);
    }
    const z = normaliseZoom({ initial: 2 });
    expect(fitTransform({ width: 100, height: 100 }, { width: 100, height: 100 }, 'contain', 0, z, true, 30)?.y).toBe(30);
  });

  it('keeps plain centring when there is no bar', () => {
    const t = fitTransform({ width: 100, height: 1000 }, { width: 200, height: 200 }, 'width', 0, zoom, false, 0);
    expect(t?.y).toBe((200 - 2000) / 2);
  });

  it('respects the zoom limits', () => {
    const t = fitTransform({ width: 10, height: 10 }, { width: 1000, height: 1000 }, 'contain', 0, zoom, false);
    expect(t?.scale).toBe(zoom.max);
  });
});

describe('roundScale', () => {
  it('rounds to three decimals so echoes compare equal', () => {
    expect(roundScale(0.12345)).toBe(0.123);
  });
});
