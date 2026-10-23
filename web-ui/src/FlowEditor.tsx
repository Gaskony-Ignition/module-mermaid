import * as React from 'react';
import {
  BRACKET_SHAPES,
  Direction,
  FlowModel,
  Unsupported,
  addNode,
  connect,
  deleteEdge,
  deleteNode,
  edgeIds,
  isUnsupported,
  parseFlowchart,
  renameNode,
  serialiseFlowchart,
  setDirection,
  setEdgeLabel,
  setShape,
} from './flowModel';
import { EditHistory, edgeIdFromDataId, needsRewriteConfirm, nodeIdFromDomId } from './editorLogic';

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string };

/** Lives on the chart, so undo and the rewrite answer outlast one deep-select. */
export interface EditSession {
  history: EditHistory;
  rewriteAccepted: boolean;
}

interface Props {
  definition: string;
  session: EditSession;
  write(text: string): void;
  renderTarget: HTMLElement;
  /** The component root; the inline input is positioned against it. */
  root: HTMLElement;
  /** Changes after every render of the diagram, which replaces its DOM. */
  renderCount: number;
}

interface InlineEdit {
  selection: Selection;
  value: string;
  box: { left: number; top: number; width: number; height: number };
}

interface State {
  model: FlowModel | Unsupported | null;
  selection: Selection | null;
  connecting: boolean;
  menu: Menu | null;
  inline: InlineEdit | null;
  confirming: boolean;
  error: string | null;
}

type Edit = (model: FlowModel) => { model: FlowModel; select?: Selection | null };
type Menu = 'shape' | 'direction';

const DIRECTIONS: [Direction, string][] = [
  ['TB', 'Top to bottom'],
  ['LR', 'Left to right'],
  ['BT', 'Bottom to top'],
  ['RL', 'Right to left'],
];
const SHAPES = Object.keys(BRACKET_SHAPES);
const SELECTED = 'mermaid-chart-selected';
const shapeName = (shape: string): string => shape.replace(/_/g, ' ');

function edgeIndex(model: FlowModel, id: string): number {
  return edgeIds(model.edges).indexOf(id);
}

export class FlowEditor extends React.Component<Props, State> {
  state: State = {
    model: null,
    selection: null,
    connecting: false,
    menu: null,
    inline: null,
    confirming: false,
    error: null,
  };

  private parseSequence = 0;
  // Edits parse the definition asynchronously; chaining them keeps each one reading the text
  // the previous one wrote rather than the prop, which updates later.
  private editChain: Promise<void> = Promise.resolve();
  private current: string;
  private pendingText: string | null = null;
  private pendingSelect: Selection | null | undefined;
  private readonly inlineRef = React.createRef<HTMLInputElement>();
  private readonly menuRef = React.createRef<HTMLUListElement>();
  private readonly menuButtons: Record<Menu, React.RefObject<HTMLButtonElement>> = {
    shape: React.createRef(),
    direction: React.createRef(),
  };

  constructor(props: Props) {
    super(props);
    this.current = props.definition;
  }

  componentDidMount(): void {
    this.props.renderTarget.addEventListener('click', this.handleDiagramClick);
    void this.parse();
  }

  componentDidUpdate(prevProps: Props, prevState: State): void {
    if (prevProps.definition !== this.props.definition) {
      this.current = this.props.definition;
      void this.parse();
    }
    if (prevProps.renderCount !== this.props.renderCount || prevState.selection !== this.state.selection) {
      this.markSelection();
    }
    // Opening a menu puts focus on its checked item, as a menu button should.
    if (!prevState.menu && this.state.menu) {
      const items = this.menuItems();
      (items.find((b) => b.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    }
    if (!prevState.inline && this.state.inline) {
      this.inlineRef.current?.focus();
      this.inlineRef.current?.select();
    }
  }

  componentWillUnmount(): void {
    this.parseSequence += 1;
    this.props.renderTarget.removeEventListener('click', this.handleDiagramClick);
    this.clearMarks();
  }

  private async parse(): Promise<void> {
    const sequence = ++this.parseSequence;
    const model = await parseFlowchart(this.props.definition).catch((e: unknown) => ({
      unsupported: e instanceof Error ? e.message : String(e),
    }));
    if (sequence !== this.parseSequence) {
      return;
    }
    // Drop a selection the new text no longer has (an external edit, or an undo).
    let { selection } = this.state;
    if (selection && !isUnsupported(model)) {
      const exists = selection.kind === 'node'
        ? model.nodes.some((n) => n.id === selection?.id)
        : edgeIndex(model, selection.id) >= 0;
      if (!exists) selection = null;
    }
    this.setState({ model, selection: isUnsupported(model) ? null : selection });
  }

  // ---- Selection ----

  private clearMarks(): void {
    this.props.renderTarget.querySelectorAll(`.${SELECTED}`).forEach((el) => el.classList.remove(SELECTED));
  }

  // Mermaid's DOM ids carry a counter that changes on every redraw, so marks go back on by id.
  private markSelection(): void {
    this.clearMarks();
    const { selection } = this.state;
    if (selection) {
      this.selectionElements(selection).forEach((el) => el.classList.add(SELECTED));
    }
  }

  private selectionElements(selection: Selection): Element[] {
    const { model } = this.state;
    if (!model || isUnsupported(model)) {
      return [];
    }
    const target = this.props.renderTarget;
    if (selection.kind === 'node') {
      const ids = model.nodes.map((n) => n.id);
      return Array.from(target.querySelectorAll('g.node')).filter((g) => this.nodeIdOf(g, ids) === selection.id);
    }
    const ids = edgeIds(model.edges);
    return Array.from(target.querySelectorAll('path[data-id], g.edgeLabel [data-id]')).filter(
      (el) => edgeIdFromDataId(el.getAttribute('data-id') ?? '', ids) === selection.id,
    );
  }

  private nodeIdOf(g: Element, ids: string[]): string | null {
    const fromDom = nodeIdFromDomId(g.id, ids);
    if (fromDom) return fromDom;
    const dataId = g.getAttribute('data-id');
    return dataId && ids.includes(dataId) ? dataId : null;
  }

  private selectionAt(target: Element): Selection | null {
    const { model } = this.state;
    if (!model || isUnsupported(model)) {
      return null;
    }
    const node = target.closest('g.node');
    if (node) {
      const id = this.nodeIdOf(node, model.nodes.map((n) => n.id));
      return id ? { kind: 'node', id } : null;
    }
    const edgeEl = target.closest('g.edgeLabel')?.querySelector('[data-id]') ?? target.closest('path[data-id]');
    const id = edgeEl ? edgeIdFromDataId(edgeEl.getAttribute('data-id') ?? '', edgeIds(model.edges)) : null;
    return id ? { kind: 'edge', id } : null;
  }

  private readonly handleDiagramClick = (event: MouseEvent): void => {
    const { model, selection, connecting } = this.state;
    if (!model || isUnsupported(model) || !(event.target instanceof Element)) {
      return;
    }
    const hit = this.selectionAt(event.target);
    if (connecting) {
      this.setState({ connecting: false });
      if (hit?.kind === 'node' && selection?.kind === 'node') {
        const from = selection.id;
        this.edit(() => (m) => ({ model: connect(m, { from, to: hit.id }), select: hit }));
      }
      return;
    }
    // Shift-click a second node: the edge between it and the selected node, either way round.
    if (event.shiftKey && hit?.kind === 'node' && selection?.kind === 'node') {
      const ids = edgeIds(model.edges);
      const i = model.edges.findIndex(
        (e) => (e.from === selection.id && e.to === hit.id) || (e.from === hit.id && e.to === selection.id),
      );
      if (i >= 0) {
        this.setState({ selection: { kind: 'edge', id: ids[i] }, menu: null });
      }
      return;
    }
    this.setState({ selection: hit, menu: null });
  };

  // ---- Edits ----

  /** Queues an edit. make() runs when the edit's turn comes, against the latest text. */
  private edit(make: () => Edit): void {
    this.editChain = this.editChain.then(() => this.runEdit(make())).catch((e: unknown) => {
      this.setState({ error: e instanceof Error ? e.message : String(e) });
    });
  }

  private async runEdit(edit: Edit): Promise<void> {
    const before = this.current;
    const model = await parseFlowchart(before);
    if (isUnsupported(model)) {
      this.setState({ error: model.unsupported });
      return;
    }
    const result = edit(model);
    const after = serialiseFlowchart(result.model);
    if (after === before) {
      if (result.select !== undefined) this.setState({ selection: result.select });
      return;
    }
    const { session } = this.props;
    if (needsRewriteConfirm(before, serialiseFlowchart(model), model.hasComments, session.rewriteAccepted)) {
      this.pendingText = after;
      this.pendingSelect = result.select;
      this.setState({ confirming: true, menu: null });
      return;
    }
    this.commit(before, after, result.select);
  }

  private commit(before: string, after: string, select: Selection | null | undefined): void {
    this.props.session.history.record(before);
    this.current = after;
    this.props.write(after);
    this.setState((s) => ({ error: null, selection: select === undefined ? s.selection : select }));
  }

  private readonly handleConfirm = (): void => {
    const text = this.pendingText;
    this.props.session.rewriteAccepted = true;
    this.setState({ confirming: false });
    if (text !== null) {
      this.commit(this.current, text, this.pendingSelect);
    }
    this.pendingText = null;
  };

  private readonly handleCancelConfirm = (): void => {
    this.pendingText = null;
    this.setState({ confirming: false });
  };

  private selectedNode(): string | null {
    const { selection } = this.state;
    return selection?.kind === 'node' ? selection.id : null;
  }

  private readonly handleAddNode = (): void => {
    const from = this.selectedNode() ?? undefined;
    this.edit(() => (m) => {
      const next = addNode(m, { label: 'New node', from: m.nodes.some((n) => n.id === from) ? from : undefined });
      return { model: next, select: { kind: 'node', id: next.nodes[next.nodes.length - 1].id } };
    });
  };

  private readonly handleConnect = (): void => {
    this.setState((s) => ({ connecting: !s.connecting, menu: null }));
  };

  private readonly handleDelete = (): void => {
    const { selection } = this.state;
    if (!selection) return;
    this.edit(() => (m) => {
      if (selection.kind === 'node') return { model: deleteNode(m, { id: selection.id }), select: null };
      return { model: deleteEdge(m, { index: edgeIndex(m, selection.id) }), select: null };
    });
  };

  private readonly handleToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && this.state.menu) {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
    }
  };

  private menuItems(): HTMLButtonElement[] {
    return Array.from(this.menuRef.current?.querySelectorAll('button') ?? []);
  }

  /** Closes the open menu and hands focus back to the button that opened it. */
  private closeMenu(): void {
    const { menu } = this.state;
    if (!menu) return;
    this.setState({ menu: null });
    this.menuButtons[menu].current?.focus();
  }

  // Arrow keys must not bubble: on the Designer canvas they nudge the selected component.
  private readonly handleMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    event.stopPropagation();
    const items = this.menuItems();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  /**
   * Keyboard activation for a toolbar button or menu item, run from keydown rather than left
   * to the native click. In the Designer an Enter or Space the page leaves un-prevented also
   * reaches the Designer itself, which ends deep-select and unmounts the toolbar before the
   * native click lands. preventDefault is what stops that (stopPropagation alone did not); it
   * also cancels the native click Enter (keypress) and Space (keyup) would fire, so one press
   * acts once.
   */
  private keys(action: () => void): Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onKeyDown' | 'onKeyUp'> {
    const stop = (event: React.KeyboardEvent<HTMLButtonElement>): boolean => {
      if (event.key !== 'Enter' && event.key !== ' ') return false;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      return true;
    };
    return {
      onKeyDown: (event) => {
        if (stop(event) && !event.repeat) action();
      },
      onKeyUp: (event) => {
        stop(event);
      },
    };
  }

  private toggleMenu(menu: Menu): void {
    if (this.state.menu === menu) {
      this.closeMenu();
    } else {
      this.setState({ menu });
    }
  }

  private readonly toggleShapeMenu = (): void => this.toggleMenu('shape');
  private readonly toggleDirectionMenu = (): void => this.toggleMenu('direction');

  private readonly handleShape = (shape: string): void => {
    const id = this.selectedNode();
    this.closeMenu();
    if (id) this.edit(() => (m) => ({ model: setShape(m, { id, shape }) }));
  };

  private readonly handleDirection = (direction: Direction): void => {
    this.closeMenu();
    this.edit(() => (m) => ({ model: setDirection(m, { direction }) }));
  };

  private readonly handleUndo = (): void => {
    this.editChain = this.editChain.then(() => this.step(this.props.session.history.undo(this.current)));
  };

  private readonly handleRedo = (): void => {
    this.editChain = this.editChain.then(() => this.step(this.props.session.history.redo(this.current)));
  };

  private step(text: string | undefined): void {
    if (text === undefined) return;
    this.current = text;
    this.props.write(text);
    this.forceUpdate();
  }

  // ---- Inline rename / edge label ----

  private readonly openInline = (): void => {
    const { model, selection } = this.state;
    if (!model || isUnsupported(model) || !selection) return;
    let value: string;
    if (selection.kind === 'node') {
      value = model.nodes.find((n) => n.id === selection.id)?.label ?? '';
    } else {
      value = model.edges[edgeIndex(model, selection.id)]?.label ?? '';
    }
    // An edge's label box if it has one, else its path; a node's shape.
    const elements = this.selectionElements(selection);
    const anchor = elements.find((el) => !(el instanceof SVGPathElement) && el.getBoundingClientRect().width > 0) ?? elements[0];
    if (!anchor) return;
    // The Designer canvas can be scaled with a CSS transform; positions are in the root's own px.
    const rootRect = this.props.root.getBoundingClientRect();
    const scale = this.props.root.offsetWidth > 0 ? rootRect.width / this.props.root.offsetWidth : 1;
    const r = anchor.getBoundingClientRect();
    const width = Math.max(120, r.width / scale);
    const box = {
      left: (r.left - rootRect.left) / scale + (r.width / scale - width) / 2,
      top: (r.top - rootRect.top) / scale + (r.height / scale - 26) / 2,
      width,
      height: 26,
    };
    this.setState({ inline: { selection, value, box }, menu: null, connecting: false });
  };

  private readonly handleInlineChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    this.setState((s) => (s.inline ? { inline: { ...s.inline, value } } : null));
  };

  private readonly handleInlineKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // Keep Backspace, Delete and Enter from reaching the Designer's own shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.setState({ inline: null });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const { inline } = this.state;
      this.setState({ inline: null });
      if (!inline) return;
      const { selection, value } = inline;
      this.edit(() => (m) => {
        if (selection.kind === 'node') return { model: renameNode(m, { id: selection.id, label: value }) };
        return { model: setEdgeLabel(m, { index: edgeIndex(m, selection.id), label: value }) };
      });
    }
  };

  // Blur cancels: clicking outside the component also ends the deep-select that shows it.
  private readonly handleInlineBlur = (): void => {
    this.setState({ inline: null });
  };

  // ---- Render ----

  render(): React.ReactNode {
    const { model, selection, connecting, menu, inline, confirming, error } = this.state;
    if (!model) {
      return null;
    }
    if (isUnsupported(model)) {
      return (
        <div className="mermaid-chart-edit-toolbar" role="status">
          <span className="mermaid-chart-edit-note">Graphical editing supports flowcharts; edit the definition text</span>
        </div>
      );
    }
    const { history } = this.props.session;
    const nodeSelected = selection?.kind === 'node';
    const currentShape = nodeSelected ? model.nodes.find((n) => n.id === selection.id)?.shape : undefined;
    const direction = model.direction ?? 'TB';

    return (
      <>
        {inline ? (
          <input
            ref={this.inlineRef}
            className="mermaid-chart-inline-input"
            style={{ left: inline.box.left, top: inline.box.top, width: inline.box.width, height: inline.box.height }}
            aria-label={inline.selection.kind === 'node' ? 'Node label' : 'Edge label'}
            value={inline.value}
            onChange={this.handleInlineChange}
            onKeyDown={this.handleInlineKeyDown}
            onBlur={this.handleInlineBlur}
          />
        ) : null}
        <div className="mermaid-chart-edit-toolbar" role="toolbar" aria-label="Diagram editor"
          onKeyDown={this.handleToolbarKeyDown}>
          {confirming ? (
            <>
              <span className="mermaid-chart-edit-note">
                Editing rewrites this definition: comments are dropped and layout text is normalised. Continue?
              </span>
              <button type="button" onClick={this.handleConfirm} {...this.keys(this.handleConfirm)}>Continue</button>
              <button type="button" onClick={this.handleCancelConfirm}
                {...this.keys(this.handleCancelConfirm)}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" onClick={this.handleAddNode} {...this.keys(this.handleAddNode)}
                title={nodeSelected ? 'Add a node linked from the selected one' : 'Add an unlinked node'}>Add node</button>
              <button type="button" onClick={this.handleConnect} {...this.keys(this.handleConnect)} disabled={!nodeSelected} aria-pressed={connecting}
                title="Then click the node to connect to">{connecting ? 'Click target…' : 'Connect'}</button>
              <button type="button" onClick={this.openInline} {...this.keys(this.openInline)}
                disabled={!nodeSelected}>Rename</button>
              <div className="mermaid-chart-edit-menu">
                {/* Visible text includes the glyph, so the accessible name would read it out too
                    ("Shape black down-pointing small triangle") without this override. */}
                <button type="button" ref={this.menuButtons.shape} disabled={!nodeSelected} aria-haspopup="menu"
                  aria-expanded={menu === 'shape'}
                  aria-label="Shape" onClick={this.toggleShapeMenu} {...this.keys(this.toggleShapeMenu)}>Shape &#9662;</button>
                {menu === 'shape' && nodeSelected ? (
                  <ul className="mermaid-chart-edit-options" role="menu" aria-label="Shape" ref={this.menuRef}
                    onKeyDown={this.handleMenuKeyDown}>
                    {SHAPES.map((shape) => (
                      <li role="none" key={shape}>
                        <button type="button" role="menuitemradio" aria-checked={shape === (currentShape ?? 'square')}
                          onClick={() => this.handleShape(shape)}
                          {...this.keys(() => this.handleShape(shape))}>{shapeName(shape)}</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button type="button" onClick={this.openInline} {...this.keys(this.openInline)}
                disabled={selection?.kind !== 'edge'}>Edge label</button>
              <button type="button" onClick={this.handleDelete} {...this.keys(this.handleDelete)}
                disabled={!selection}>Delete</button>
              <div className="mermaid-chart-edit-menu">
                <button type="button" ref={this.menuButtons.direction} aria-haspopup="menu"
                  aria-expanded={menu === 'direction'} aria-label="Direction" onClick={this.toggleDirectionMenu}
                  {...this.keys(this.toggleDirectionMenu)}>Direction &#9662;</button>
                {menu === 'direction' ? (
                  <ul className="mermaid-chart-edit-options mermaid-chart-edit-options-end" role="menu" aria-label="Direction" ref={this.menuRef}
                    onKeyDown={this.handleMenuKeyDown}>
                    {DIRECTIONS.map(([d, name]) => (
                      <li role="none" key={d}>
                        <button type="button" role="menuitemradio" aria-checked={d === direction}
                          onClick={() => this.handleDirection(d)}
                          {...this.keys(() => this.handleDirection(d))}>{name}</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button type="button" onClick={this.handleUndo} {...this.keys(this.handleUndo)}
                disabled={!history.canUndo}>Undo</button>
              <button type="button" onClick={this.handleRedo} {...this.keys(this.handleRedo)}
                disabled={!history.canRedo}>Redo</button>
              <span className="mermaid-chart-edit-note">{error ?? 'Click outside to finish'}</span>
            </>
          )}
        </div>
      </>
    );
  }
}
