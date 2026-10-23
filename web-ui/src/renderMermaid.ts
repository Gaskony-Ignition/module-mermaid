import type { MermaidTheme, SecurityLevel } from './options';

export interface RenderedDiagram {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

export type Mermaid = typeof import('mermaid').default;

// mermaid.initialize() sets one global config, so two charts on a page with different themes
// would race. mermaid.parse() writes the text's init directive into that same config. Every
// mermaid call runs in turn through this chain.
let queue: Promise<unknown> = Promise.resolve();

/** Runs fn once mermaid has loaded, after every mermaid call queued before it. */
export function withMermaid<T>(fn: (mermaid: Mermaid) => Promise<T>): Promise<T> {
  const job = queue.then(async () => {
    const { default: mermaid } = await import(/* webpackChunkName: "mermaid" */ 'mermaid');
    return fn(mermaid);
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Renders a definition to SVG markup; mermaid and its diagram chunks load on first use. */
export function renderMermaid(
  id: string,
  definition: string,
  theme: MermaidTheme,
  securityLevel: SecurityLevel,
): Promise<RenderedDiagram> {
  return withMermaid((mermaid) => {
    // suppressErrorRendering: without it a parse error leaves mermaid's own error graphic in <body>.
    mermaid.initialize({ startOnLoad: false, theme, securityLevel, suppressErrorRendering: true });
    return mermaid.render(id, definition);
  });
}
