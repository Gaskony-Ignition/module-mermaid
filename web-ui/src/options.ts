// Prop normalisation, kept free of React and Perspective so it can be unit-tested.

export type MermaidTheme = 'default' | 'base' | 'dark' | 'forest' | 'neutral';
export type SecurityLevel = 'strict' | 'antiscript' | 'loose' | 'sandbox';
export type FitMode = 'contain' | 'width' | 'height' | 'none';

export interface ZoomOptions {
  enabled: boolean;
  showControls: boolean;
  wheel: boolean;
  wheelModifier: boolean;
  initial: number;
  min: number;
  max: number;
  step: number;
}

export interface DownloadOptions {
  enabled: boolean;
  showControls: boolean;
  svg: boolean;
}

export interface Size {
  width: number;
  height: number;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_DEFINITION = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Render chart]
    B -->|No| D[Update definition]`;

export const DEFAULT_ZOOM: ZoomOptions = {
  enabled: true,
  showControls: true,
  wheel: true,
  wheelModifier: true,
  initial: 1,
  min: 0.25,
  max: 4,
  step: 0.25,
};

export const DEFAULT_DOWNLOAD: DownloadOptions = {
  enabled: true,
  showControls: true,
  svg: true,
};

const THEMES: readonly MermaidTheme[] = ['default', 'base', 'dark', 'forest', 'neutral'];
const SECURITY_LEVELS: readonly SecurityLevel[] = ['strict', 'antiscript', 'loose', 'sandbox'];
const FIT_MODES: readonly FitMode[] = ['contain', 'width', 'height', 'none'];

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const normaliseTheme = (value: string): MermaidTheme => oneOf(THEMES, value, 'default');

// Anything unrecognised falls back to strict, never to a looser level.
export const normaliseSecurityLevel = (value: string): SecurityLevel => oneOf(SECURITY_LEVELS, value, 'strict');

export const normaliseFitMode = (value: string): FitMode => oneOf(FIT_MODES, value, 'contain');

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

export function normaliseZoom(value: Partial<ZoomOptions>): ZoomOptions {
  const min = Math.max(0.05, finite(value.min ?? DEFAULT_ZOOM.min, DEFAULT_ZOOM.min));
  const max = Math.max(min, finite(value.max ?? DEFAULT_ZOOM.max, DEFAULT_ZOOM.max));
  const step = Math.max(0.05, finite(value.step ?? DEFAULT_ZOOM.step, DEFAULT_ZOOM.step));
  return {
    enabled: value.enabled ?? DEFAULT_ZOOM.enabled,
    showControls: value.showControls ?? DEFAULT_ZOOM.showControls,
    wheel: value.wheel ?? DEFAULT_ZOOM.wheel,
    wheelModifier: value.wheelModifier ?? DEFAULT_ZOOM.wheelModifier,
    initial: clamp(finite(value.initial ?? DEFAULT_ZOOM.initial, DEFAULT_ZOOM.initial), min, max),
    min,
    max,
    step,
  };
}

export function normaliseDownload(value: Partial<DownloadOptions>): DownloadOptions {
  return {
    enabled: value.enabled ?? DEFAULT_DOWNLOAD.enabled,
    showControls: value.showControls ?? DEFAULT_DOWNLOAD.showControls,
    svg: value.svg ?? DEFAULT_DOWNLOAD.svg,
  };
}

/**
 * Scale and offset that fit a diagram into the viewport; null until both sizes are known.
 * topInset is the height of the control bar over the top of the viewport: the fit uses only the
 * area below it, and with a bar the diagram's top edge never goes under it, even when fitMode
 * or the initial zoom makes the diagram taller than that area.
 */
export function fitTransform(
  natural: Size | null,
  viewport: Size,
  fitMode: FitMode,
  padding: number,
  zoom: ZoomOptions,
  useInitialZoom: boolean,
  topInset = 0,
): Transform | null {
  if (!natural || viewport.width === 0 || viewport.height === 0) {
    return null;
  }
  const inset = Math.min(Math.max(topInset, 0), viewport.height - 1);
  const widthScale = Math.max(viewport.width - padding * 2, 1) / natural.width;
  const heightScale = Math.max(viewport.height - inset - padding * 2, 1) / natural.height;
  let fitScale: number;
  switch (fitMode) {
    case 'width':
      fitScale = widthScale;
      break;
    case 'height':
      fitScale = heightScale;
      break;
    case 'none':
      fitScale = 1;
      break;
    default:
      fitScale = Math.min(widthScale, heightScale);
  }
  const scale = clamp(useInitialZoom ? fitScale * zoom.initial : fitScale, zoom.min, zoom.max);
  const t = centred(natural, viewport, scale, inset);
  if (inset > 0) {
    t.y = Math.max(t.y, inset + padding);
  }
  return t;
}

/** Centred in the part of the viewport below topInset. */
export function centred(natural: Size, viewport: Size, scale: number, topInset = 0): Transform {
  return {
    x: (viewport.width - natural.width * scale) / 2,
    y: topInset + (viewport.height - topInset - natural.height * scale) / 2,
    scale,
  };
}

/**
 * Mermaid gives every rendered SVG role="graphics-document document" and, only when the
 * definition sets `accTitle`, an aria-labelledby title -- without one the diagram has a role
 * but no accessible name (WCAG 1.1.1). Falls back to a readable version of aria-roledescription,
 * mermaid's own diagram-type id (e.g. "flowchart-v2", "stateDiagram").
 */
export function diagramAccessibleName(diagramType: string): string {
  const label = diagramType
    .replace(/-v\d+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .join(' ');
  const withKind = /diagram|chart|graph|map|timeline$/i.test(label) ? label : `${label} diagram`;
  return withKind.charAt(0).toUpperCase() + withKind.slice(1);
}
