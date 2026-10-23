import * as React from 'react';
import {
  ComponentMeta,
  ComponentProps,
  PropertyTree,
  SizeObject,
  StyleObject,
} from '@inductiveautomation/perspective-client';
import { ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { mergeEmitProps } from './emitUtils';
import {
  DEFAULT_DEFINITION,
  DEFAULT_DOWNLOAD,
  DEFAULT_ZOOM,
  DownloadOptions,
  FitMode,
  MermaidTheme,
  SecurityLevel,
  Size,
  ZoomOptions,
  centred,
  clamp,
  diagramAccessibleName,
  fitTransform,
  normaliseDownload,
  normaliseFitMode,
  normaliseSecurityLevel,
  normaliseTheme,
  normaliseZoom,
  roundScale,
} from './options';
import { renderMermaid } from './renderMermaid';
import { isDesignMode } from './designMode';
import { EditHistory } from './editorLogic';
import { EditSession, FlowEditor } from './FlowEditor';

export const COMPONENT_TYPE = 'gaskony.display.mermaid';

export interface MermaidChartProps {
  definition: string;
  theme: MermaidTheme;
  securityLevel: SecurityLevel;
  fitMode: FitMode;
  padding: number;
  zoom: ZoomOptions;
  zoomLevel: number;
  download: DownloadOptions;
  showError: boolean;
  edit: { enabled: boolean };
  style: StyleObject;
}

interface MermaidChartState {
  error: string | null;
  naturalSize: Size | null;
  viewportSize: Size;
  currentScale: number;
  downloadMenuOpen: boolean;
  deepSelected: boolean;
  renderCount: number;
  /** Bottom edge of the control bar in the viewport; 0 with no bar. */
  topInset: number;
}

type Props = ComponentProps<MermaidChartProps>;

let chartCounter = 0;

// react-zoom-pan-pinch matches KeyboardEvent.key names; 'ctrlKey' never matches anything.
const ctrlOrCmd = (keys: string[]): boolean => keys.includes('Control') || keys.includes('Meta');

const WHEEL_HINT = /Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318 + scroll to zoom' : 'Ctrl + scroll to zoom';

export class MermaidChart extends React.Component<Props, MermaidChartState> {
  private readonly transformRef = React.createRef<ReactZoomPanPinchRef>();
  private readonly viewportRef = React.createRef<HTMLDivElement>();
  private readonly renderTarget = React.createRef<HTMLDivElement>();
  private readonly downloadMenuRef = React.createRef<HTMLDivElement>();
  private readonly chartId = `gaskony-mermaid-${++chartCounter}`;
  private renderSequence = 0;
  private isFirstRender = true;
  private resizeObserver?: ResizeObserver;
  private classObserver?: MutationObserver;
  private controlsObserver?: ResizeObserver;
  private controlsBar: HTMLDivElement | null = null;
  private readonly editSession: EditSession = { history: new EditHistory(50), rewriteAccepted: false };
  // Scales this component wrote to zoomLevel; their echo back through props must not re-apply.
  private pendingZoomEchoes = new Set<number>();
  // True while an auto-fit (mount, resize, definition change, Reset) is applying its transform,
  // so the library's onTransform callback for that change doesn't write zoomLevel.
  private suppressZoomWrite = false;

  constructor(props: Props) {
    super(props);
    this.state = {
      error: null,
      naturalSize: null,
      viewportSize: { width: 0, height: 0 },
      currentScale: props.props.zoom.initial,
      downloadMenuOpen: false,
      deepSelected: false,
      renderCount: 0,
      topInset: 0,
    };
  }

  componentDidMount(): void {
    const viewport = this.viewportRef.current;
    if (viewport) {
      this.resizeObserver = new ResizeObserver(this.updateViewportSize);
      this.resizeObserver.observe(viewport);
      this.updateViewportSize();
    }
    document.addEventListener('mousedown', this.handleDocumentMouseDown);
    // The Designer marks a double-clicked component with the class deep-selected on its root;
    // the editor shows only then, because that is when the Designer gives input back.
    const root = this.getRoot();
    if (root) {
      this.classObserver = new MutationObserver(this.updateDeepSelected);
      this.classObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
      this.updateDeepSelected();
    }
    void this.renderDiagram();
  }

  componentDidUpdate(prevProps: Props, prevState: MermaidChartState): void {
    const previous = prevProps.props;
    const current = this.props.props;
    if (
      previous.definition !== current.definition ||
      previous.theme !== current.theme ||
      previous.securityLevel !== current.securityLevel
    ) {
      void this.renderDiagram();
      return;
    }
    if (
      previous.fitMode !== current.fitMode ||
      previous.padding !== current.padding ||
      prevState.naturalSize !== this.state.naturalSize ||
      prevState.topInset !== this.state.topInset ||
      prevState.viewportSize.width !== this.state.viewportSize.width ||
      prevState.viewportSize.height !== this.state.viewportSize.height
    ) {
      this.applyFitTransform(false);
      return;
    }
    if (Math.abs(previous.zoomLevel - current.zoomLevel) > 0.001) {
      const incoming = roundScale(current.zoomLevel);
      if (this.pendingZoomEchoes.delete(incoming)) {
        return;
      }
      if (Math.abs(current.zoomLevel - this.state.currentScale) > 0.001) {
        this.applyZoomFromProp(current.zoomLevel);
      }
    }
  }

  componentWillUnmount(): void {
    this.renderSequence += 1;
    this.resizeObserver?.disconnect();
    this.classObserver?.disconnect();
    this.controlsObserver?.disconnect();
    document.removeEventListener('mousedown', this.handleDocumentMouseDown);
  }

  private async renderDiagram(): Promise<void> {
    const target = this.renderTarget.current;
    if (!target) {
      return;
    }
    const sequence = ++this.renderSequence;
    const { definition, theme, securityLevel } = this.props.props;
    const source = definition.trim();
    if (!source) {
      target.innerHTML = '';
      this.setState({ error: 'Mermaid definition is empty.', naturalSize: null });
      return;
    }
    try {
      const { svg, bindFunctions } = await renderMermaid(`${this.chartId}-${sequence}`, source, theme, securityLevel);
      // A newer definition arrived while this one rendered; drop the stale result.
      if (sequence !== this.renderSequence) {
        return;
      }
      target.innerHTML = svg;
      bindFunctions?.(target);
      this.ensureAccessibleName();
      const useInitialZoom = this.isFirstRender;
      this.isFirstRender = false;
      this.setState((s) => ({ error: null, naturalSize: this.measureSvg(), renderCount: s.renderCount + 1 }),
        () => this.applyFitTransform(useInitialZoom));
    } catch (error) {
      if (sequence !== this.renderSequence) {
        return;
      }
      target.innerHTML = '';
      this.setState({ error: error instanceof Error ? error.message : String(error), naturalSize: null });
    }
  }

  private readonly updateViewportSize = (): void => {
    const viewport = this.viewportRef.current;
    if (!viewport) {
      return;
    }
    const next = { width: viewport.clientWidth, height: viewport.clientHeight };
    const { width, height } = this.state.viewportSize;
    if (Math.abs(width - next.width) > 1 || Math.abs(height - next.height) > 1) {
      this.setState({ viewportSize: next });
    }
  };

  // The bar can wrap to two rows on a narrow component, so it is measured, not assumed.
  private readonly setControlsBar = (bar: HTMLDivElement | null): void => {
    this.controlsObserver?.disconnect();
    this.controlsBar = bar;
    if (bar) {
      this.controlsObserver ??= new ResizeObserver(this.updateTopInset);
      this.controlsObserver.observe(bar);
    }
    this.updateTopInset();
  };

  private readonly updateTopInset = (): void => {
    const bar = this.controlsBar;
    const topInset = bar ? bar.offsetTop + bar.offsetHeight : 0;
    if (Math.abs(topInset - this.state.topInset) > 0.5) {
      this.setState({ topInset });
    }
  };

  private getRoot(): HTMLElement | null {
    return this.viewportRef.current?.closest<HTMLElement>('.mermaid-chart-component') ?? null;
  }

  private readonly updateDeepSelected = (): void => {
    const deepSelected = this.getRoot()?.classList.contains('deep-selected') === true;
    if (deepSelected !== this.state.deepSelected) {
      this.setState({ deepSelected });
    }
  };

  private readonly writeDefinition = (text: string): void => {
    this.props.store.props.write('definition', text);
  };

  private getSvg(): SVGSVGElement | null {
    return this.renderTarget.current?.querySelector('svg') ?? null;
  }

  // Mermaid sets role="graphics-document document" on every SVG but only names it when the
  // definition itself has an `accTitle` line; without one a screen reader announces the role
  // with nothing to read out. aria-roledescription (mermaid's own diagram-type id) is always
  // present, so it stands in.
  private ensureAccessibleName(): void {
    const svg = this.getSvg();
    if (!svg || svg.hasAttribute('aria-labelledby') || svg.hasAttribute('aria-label')) {
      return;
    }
    const kind = svg.getAttribute('aria-roledescription');
    svg.setAttribute('aria-label', kind ? diagramAccessibleName(kind) : 'Diagram');
  }

  private measureSvg(): Size | null {
    const svg = this.getSvg();
    if (!svg) {
      return null;
    }
    const attr = (name: string): number => {
      const raw = svg.getAttribute(name) ?? '';
      return raw.endsWith('%') ? NaN : Number.parseFloat(raw);
    };
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const width = viewBox?.width || (Number.isFinite(attr('width')) ? attr('width') : 0) || rect.width;
    const height = viewBox?.height || (Number.isFinite(attr('height')) ? attr('height') : 0) || rect.height;
    if (width <= 0 || height <= 0) {
      return null;
    }
    // mermaid emits width="100%" with a max-width; inside the zoom wrapper, which sizes to its
    // content, that collapses the SVG below its viewBox and the fit comes out too small.
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.maxWidth = 'none';
    return { width, height };
  }

  // Fit is never a write: mount, resize, a definition change and the Reset button all land
  // here, and per Cognidata's docs "the fit button returns to the original fit" without
  // touching zoomLevel.
  private applyFitTransform(useInitialZoom: boolean): void {
    const { fitMode, padding, zoom } = this.props.props;
    const fit = fitTransform(this.state.naturalSize, this.state.viewportSize, fitMode, padding, zoom, useInitialZoom,
      this.state.topInset);
    if (fit) {
      this.setTransform(fit.x, fit.y, fit.scale, false);
    }
  }

  // A script/binding wrote zoomLevel; write back only happens if clamping changed the value
  // (syncZoomLevelToProp no-ops when the rounded scale already matches the prop).
  private applyZoomFromProp(scale: number): void {
    const { naturalSize, viewportSize } = this.state;
    if (!naturalSize || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }
    const { zoom } = this.props.props;
    const t = centred(naturalSize, viewportSize, clamp(scale, zoom.min, zoom.max), this.state.topInset);
    this.setTransform(t.x, t.y, t.scale, true);
  }

  private setTransform(x: number, y: number, scale: number, writeProp: boolean): void {
    // The ref call is synchronous (0 duration), so the flag brackets it safely; it gates the
    // library's onTransform callback below, which is what actually calls syncZoomLevelToProp.
    this.suppressZoomWrite = !writeProp;
    void this.transformRef.current?.setTransform(x, y, scale, 0);
    this.suppressZoomWrite = false;
    this.setState({ currentScale: scale });
  }

  private syncZoomLevelToProp(scale: number): void {
    // Belt-and-braces: the zoom controls are inert in design mode, but a write here would
    // dirty the view.
    if (isDesignMode(this.props.store)) {
      return;
    }
    const rounded = roundScale(scale);
    if (Math.abs(rounded - this.props.props.zoomLevel) <= 0.001) {
      return;
    }
    this.pendingZoomEchoes.add(rounded);
    if (this.pendingZoomEchoes.size > 32) {
      this.pendingZoomEchoes = new Set(Array.from(this.pendingZoomEchoes).slice(-16));
    }
    this.props.store.props.write('zoomLevel', rounded);
  }

  private readonly handleTransform = (_ref: ReactZoomPanPinchRef, state: { scale: number }): void => {
    const rounded = roundScale(state.scale);
    if (Math.abs(rounded - this.state.currentScale) > 0.001) {
      this.setState({ currentScale: rounded });
    }
    if (!this.suppressZoomWrite) {
      this.syncZoomLevelToProp(rounded);
    }
  };

  private readonly handleFitReset = (event: React.MouseEvent): void => {
    event.stopPropagation();
    this.applyFitTransform(false);
  };

  private readonly handleZoomIn = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (isDesignMode(this.props.store)) return;
    void this.transformRef.current?.zoomIn(this.props.props.zoom.step, 200);
  };

  private readonly handleZoomOut = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (isDesignMode(this.props.store)) return;
    void this.transformRef.current?.zoomOut(this.props.props.zoom.step, 200);
  };

  private readonly handleToggleDownloadMenu = (event: React.MouseEvent): void => {
    event.stopPropagation();
    this.setState((s) => ({ downloadMenuOpen: !s.downloadMenuOpen }));
  };

  private readonly handleDocumentMouseDown = (event: MouseEvent): void => {
    const root = this.downloadMenuRef.current;
    if (this.state.downloadMenuOpen && root && event.target instanceof Node && !root.contains(event.target)) {
      this.setState({ downloadMenuOpen: false });
    }
  };

  private readonly handleDownloadSvg = (event: React.MouseEvent): void => {
    event.stopPropagation();
    const svg = this.getSvg();
    if (!svg) {
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('xmlns:xlink')) {
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.setState({ downloadMenuOpen: false });
  };

  render(): React.ReactNode {
    const { emit, props, store } = this.props;
    const { error, currentScale, downloadMenuOpen, deepSelected, renderCount } = this.state;
    const { zoom, download } = props;
    // The zoom library stops propagation of every mousedown it pans on, so in the Designer's
    // design mode it would swallow the click that selects the component.
    const designing = isDesignMode(store);
    // Pan, wheel and pinch go off one by one, never through the library's own disabled flag:
    // that also turns setTransform into a no-op while zoomIn still runs, so the fit never
    // applied and "+" zoomed from the library's stale scale of 1, not the one on the label.
    const gesturesOff = !zoom.enabled || designing;
    const renderTarget = this.renderTarget.current;
    const root = this.getRoot();
    const editing = designing && props.edit.enabled && deepSelected && renderTarget !== null && root !== null;
    const showZoomControls = zoom.enabled && zoom.showControls;
    const showDownloadControls = download.enabled && download.showControls && download.svg;

    return (
      <div {...emit(mergeEmitProps(props.style, designing ? ['mermaid-chart-component', 'mermaid-chart-designing'] : ['mermaid-chart-component']))}>
        <div className={editing ? 'mermaid-chart-inner mermaid-chart-editing' : 'mermaid-chart-inner'}>
          <div ref={this.viewportRef} className="mermaid-chart-viewport">
            <TransformWrapper
              ref={this.transformRef}
              initialScale={1}
              minScale={zoom.min}
              maxScale={zoom.max}
              smooth={false}
              limitToBounds={false}
              centerOnInit={false}
              wheel={{ disabled: gesturesOff || !zoom.wheel, step: zoom.step, activationKeys: zoom.wheelModifier ? ctrlOrCmd : [] }}
              panning={{ disabled: gesturesOff, velocityDisabled: true }}
              pinch={{ disabled: gesturesOff }}
              doubleClick={{ disabled: true }}
              autoAlignment={{ disabled: true }}
              onTransform={this.handleTransform}
            >
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                <div ref={this.renderTarget} className="mermaid-chart-render-target" />
              </TransformComponent>
            </TransformWrapper>
          </div>
          {showZoomControls || showDownloadControls ? (
            // not-editable: the Designer keeps these inert while the component is deep-selected.
            <div ref={this.setControlsBar} className="mermaid-chart-controls not-editable" onMouseDown={(e) => e.stopPropagation()}>
              {showZoomControls ? (
                <>
                  {/* Visible text is a single glyph; the accessible name comes from that text, not
                      title, so a bare "-"/"+" reads as "hyphen"/"plus" to a screen reader. */}
                  <button type="button" title="Zoom out" aria-label="Zoom out" onClick={this.handleZoomOut}
                    disabled={currentScale <= zoom.min + 0.001}>-</button>
                  <span className="mermaid-chart-zoom-label">{`${Math.round(currentScale * 100)}%`}</span>
                  <button type="button" title="Fit to view" aria-label="Fit to view" onClick={this.handleFitReset}>Fit</button>
                  <button type="button" title="Zoom in" aria-label="Zoom in" onClick={this.handleZoomIn}
                    disabled={currentScale >= zoom.max - 0.001}>+</button>
                  {zoom.wheel && zoom.wheelModifier ? <span className="mermaid-chart-wheel-hint">{WHEEL_HINT}</span> : null}
                </>
              ) : null}
              {showDownloadControls ? (
                <div ref={this.downloadMenuRef} className="mermaid-chart-download">
                  <button type="button" title="Download" aria-label="Download diagram" aria-haspopup="menu"
                    aria-expanded={downloadMenuOpen} onClick={this.handleToggleDownloadMenu}>Download &#9662;</button>
                  {downloadMenuOpen ? (
                    <ul className="mermaid-chart-download-menu" role="menu">
                      <li role="none">
                        <button type="button" role="menuitem" onClick={this.handleDownloadSvg}>SVG</button>
                      </li>
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {editing ? (
            <FlowEditor
              definition={props.definition}
              session={this.editSession}
              write={this.writeDefinition}
              renderTarget={renderTarget}
              root={root}
              renderCount={renderCount}
            />
          ) : null}
          {props.showError && error ? <pre className="mermaid-chart-error" role="alert">{error}</pre> : null}
        </div>
      </div>
    );
  }
}

export class MermaidChartMeta implements ComponentMeta {
  getComponentType(): string {
    return COMPONENT_TYPE;
  }

  getViewComponent(): React.ComponentType<Props> {
    return MermaidChart;
  }

  getDefaultSize(): SizeObject {
    return { width: 480, height: 320 };
  }

  getPropsReducer(tree: PropertyTree): MermaidChartProps {
    const zoom = normaliseZoom({
      enabled: tree.readBoolean('zoom.enabled', DEFAULT_ZOOM.enabled),
      showControls: tree.readBoolean('zoom.showControls', DEFAULT_ZOOM.showControls),
      wheel: tree.readBoolean('zoom.wheel', DEFAULT_ZOOM.wheel),
      wheelModifier: tree.readBoolean('zoom.wheelModifier', DEFAULT_ZOOM.wheelModifier),
      initial: tree.readNumber('zoom.initial', DEFAULT_ZOOM.initial),
      min: tree.readNumber('zoom.min', DEFAULT_ZOOM.min),
      max: tree.readNumber('zoom.max', DEFAULT_ZOOM.max),
      step: tree.readNumber('zoom.step', DEFAULT_ZOOM.step),
    });
    return {
      definition: tree.readString('definition', DEFAULT_DEFINITION),
      theme: normaliseTheme(tree.readString('theme', 'default')),
      securityLevel: normaliseSecurityLevel(tree.readString('securityLevel', 'strict')),
      fitMode: normaliseFitMode(tree.readString('fitMode', 'contain')),
      padding: Math.max(0, tree.readNumber('padding', 8)),
      zoom,
      zoomLevel: tree.readNumber('zoomLevel', zoom.initial),
      download: normaliseDownload({
        enabled: tree.readBoolean('download.enabled', DEFAULT_DOWNLOAD.enabled),
        showControls: tree.readBoolean('download.showControls', DEFAULT_DOWNLOAD.showControls),
        svg: tree.readBoolean('download.svg', DEFAULT_DOWNLOAD.svg),
      }),
      showError: tree.readBoolean('showError', true),
      edit: { enabled: tree.readBoolean('edit.enabled', false) },
      style: tree.readStyle('style').toEmitProps(),
    };
  }
}
