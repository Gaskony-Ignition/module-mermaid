// Flowchart model for a two-way editor. Mermaid's own parser reads the text and
// serialiseFlowchart writes it back, so the text stays the source of truth. Kept free of
// React and Perspective so it can be unit-tested.

import { withMermaid } from './renderMermaid';

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';
export type EdgeType =
  | 'arrow_point'
  | 'arrow_open'
  | 'arrow_cross'
  | 'arrow_circle'
  | 'double_arrow_point'
  | 'double_arrow_cross'
  | 'double_arrow_circle';
export type EdgeStroke = 'normal' | 'thick' | 'dotted' | 'invisible';

export type FlowClick = { kind: 'link'; url: string; target?: string } | { kind: 'call'; fn: string; args?: string };

export interface FlowNode {
  id: string;
  /** Source form: entities stay as `#quot;`, `<br>` stays a tag. */
  label: string;
  markdown: boolean;
  /** Mermaid's shape name; undefined for a bare id, which draws as a rectangle. */
  shape?: string;
  /** Id of the subgraph that holds it. */
  parent?: string;
  classes: string[];
  styles: string[];
  click?: FlowClick;
  tooltip?: string;
}

export interface FlowEdge {
  /** Only an id written in the source (`A e1@--> B`). Generated ids are worked out on output. */
  id?: string;
  from: string;
  to: string;
  label: string;
  markdown: boolean;
  type: EdgeType;
  stroke: EdgeStroke;
  /** Extra rank span: `-->` is 1, `--->` is 2. */
  length: number;
  styles: string[];
  classes: string[];
  interpolate?: string;
  animate?: boolean;
  animation?: string;
}

export interface FlowSubgraph {
  id: string;
  title: string;
  markdown: boolean;
  parent?: string;
  direction?: string;
  classes: string[];
  styles: string[];
}

export interface FlowClassDef {
  id: string;
  styles: string[];
}

export interface FlowModel {
  /** Front matter, `---` lines included, verbatim. */
  frontMatter?: string;
  /** `%%{init: ...}%%` and other directives, verbatim. */
  directives: string[];
  /** The source had `%%` comments; the serialiser cannot keep them. */
  hasComments: boolean;
  keyword: 'flowchart' | 'graph' | 'flowchart-elk';
  direction?: Direction;
  accTitle?: string;
  accDescr?: string;
  nodes: FlowNode[];
  /** In source order: linkStyle indices and generated edge ids depend on it. */
  edges: FlowEdge[];
  /** In Mermaid's order, innermost first. */
  subgraphs: FlowSubgraph[];
  classDefs: FlowClassDef[];
  linkStyleDefault: string[];
  interpolateDefault?: string;
}

export interface Unsupported {
  unsupported: string;
}

export function isUnsupported(result: FlowModel | Unsupported): result is Unsupported {
  return 'unsupported' in result;
}

// The parts of mermaid's FlowDB this file reads. It is not public API: getDiagramFromText is
// marked internal, and these names are the jison grammar's calls into its `yy` object.
interface FlowVertex {
  id: string;
  text?: string;
  labelType: string;
  type?: string;
  styles: string[];
  classes: string[];
  props?: Record<string, unknown>;
  icon?: string;
  img?: string;
  form?: string;
  pos?: string;
  constraint?: string;
  assetWidth?: number;
  assetHeight?: number;
}

interface FlowDbEdge {
  start: string;
  end: string;
  type?: string;
  stroke?: string;
  length?: number;
  text: string;
  labelType: string;
  style?: string[];
  classes: string[];
  interpolate?: string;
  isUserDefinedId: boolean;
  id?: string;
  animate?: boolean;
  animation?: string;
}

interface FlowDbSubGraph {
  id: string;
  nodes: string[];
  title: string;
  labelType: string;
  classes: string[];
  dir?: string;
  metadata?: unknown;
}

interface FlowDb {
  sanitizeText(text: string): string;
  setLink(ids: string, url: string, target?: string): void;
  setClickEvent(ids: string, fn: string, args?: string): void;
  setTooltip(ids: string, tooltip?: string): void;
  getDirection(): string | undefined;
  getVertices(): Map<string, FlowVertex>;
  getEdges(): FlowDbEdge[] & { defaultStyle?: string[]; defaultInterpolate?: string };
  getSubGraphs(): FlowDbSubGraph[];
  getClasses(): Map<string, { id: string; styles: string[] }>;
  getAccTitle(): string;
  getAccDescription(): string;
}

interface JisonParser {
  parser: { yy: unknown };
  parse(text: string): unknown;
}

const FLOWCHART_TYPES = ['flowchart-v2', 'flowchart', 'flowchart-elk'];

// Mermaid's own patterns (diagram-api/frontmatter.ts and utils.ts in mermaid 12).
const FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
const COMMENT = /^\s*%%(?!{)[^\n]+/m;

// Mermaid swaps `#name;` for these markers before parsing and back at render time.
function decodeEntities(text: string): string {
  return text.replace(/\uFB02\u00B0\u00B0(\d+)\u00B6\u00DF/g, '#$1;').replace(/\uFB02\u00B0(\w+)\u00B6\u00DF/g, '#$1;');
}

function unquote(text: string): string {
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads a flowchart through Mermaid's parser; anything this model cannot carry is refused. */
export function parseFlowchart(text: string): Promise<FlowModel | Unsupported> {
  return withMermaid(async (mermaid) => {
    const source = text.replace(/\r\n?/g, '\n');
    try {
      // Also registers the diagram types, which getDiagramFromText needs.
      await mermaid.parse(source);
    } catch (error) {
      return { unsupported: `Mermaid cannot parse this: ${message(error)}` };
    }
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    if (!FLOWCHART_TYPES.includes(diagram.type)) {
      return { unsupported: `This is a ${diagram.type} diagram, not a flowchart.` };
    }

    // Parse again into a fresh db of the same class: its sanitizeText runs DOMPurify, which
    // would store cleaned-up labels rather than the source text, and under the default strict
    // security level the db drops click callbacks, so they are captured on the way in.
    const Db = (diagram.db as object).constructor as new () => FlowDb;
    const db = new Db();
    db.sanitizeText = (t) => t;
    const clicks = new Map<string, FlowClick>();
    const tooltips = new Map<string, string>();
    const setLink = db.setLink;
    const setClickEvent = db.setClickEvent;
    const setTooltip = db.setTooltip;
    db.setLink = (ids, url, target) => {
      for (const id of ids.split(',')) clicks.set(id, { kind: 'link', url: unquote(url), target });
      setLink(ids, url, target);
    };
    db.setClickEvent = (ids, fn, args) => {
      for (const id of ids.split(',')) clicks.set(id, { kind: 'call', fn, args });
      setClickEvent(ids, fn, args);
    };
    db.setTooltip = (ids, tooltip) => {
      if (tooltip !== undefined) for (const id of ids.split(',')) tooltips.set(id, unquote(tooltip));
      setTooltip(ids, tooltip);
    };
    const parser = diagram.parser as unknown as JisonParser;
    parser.parser.yy = db;
    await parser.parse(diagram.text);

    const keyword = /^\s*(flowchart-elk|flowchart|graph)\b/.exec(diagram.text)?.[1] as FlowModel['keyword'] | undefined;
    const frontMatter = FRONT_MATTER.exec(source)?.[0].trimEnd();
    return buildModel(db, clicks, tooltips, {
      frontMatter,
      directives: source.match(DIRECTIVE) ?? [],
      hasComments: COMMENT.test(source.replace(DIRECTIVE, '')),
      keyword: keyword ?? 'flowchart',
    });
  });
}

function buildModel(
  db: FlowDb,
  clicks: Map<string, FlowClick>,
  tooltips: Map<string, string>,
  header: Pick<FlowModel, 'frontMatter' | 'directives' | 'hasComments' | 'keyword'>,
): FlowModel | Unsupported {
  const dbSubgraphs = db.getSubGraphs();
  const subgraphIds = new Set(dbSubgraphs.map((s) => s.id));
  const vertices = db.getVertices();

  // Same precedence as FlowDB.getData: a node goes to the first subgraph listing it, a
  // subgraph to the last.
  const nodeParent = new Map<string, string>();
  const subgraphParent = new Map<string, string>();
  for (const sg of dbSubgraphs) {
    for (const member of sg.nodes) {
      if (subgraphIds.has(member)) subgraphParent.set(member, sg.id);
      else if (!nodeParent.has(member)) nodeParent.set(member, sg.id);
    }
  }
  for (const id of subgraphIds) {
    const seen = new Set<string>();
    for (let at: string | undefined = id; at !== undefined; at = subgraphParent.get(at)) {
      if (seen.has(at)) return { unsupported: `Subgraph ${id} ends up inside itself.` };
      seen.add(at);
    }
  }

  const nodes: FlowNode[] = [];
  for (const v of vertices.values()) {
    // An edge or style line naming a subgraph creates a vertex with its id; it is the subgraph.
    if (subgraphIds.has(v.id)) continue;
    if (v.icon || v.img || v.form || v.pos || v.constraint || v.assetWidth || v.assetHeight) {
      return { unsupported: `Node ${v.id} uses icon or image options.` };
    }
    if (v.props && Object.keys(v.props).length > 0) {
      return { unsupported: `Node ${v.id} uses rect properties.` };
    }
    const click = clicks.get(v.id);
    const node: FlowNode = {
      id: v.id,
      label: decodeEntities(v.text ?? v.id),
      markdown: v.labelType === 'markdown',
      shape: v.type,
      parent: nodeParent.get(v.id),
      // A click adds the class `clickable`; the click line puts it back.
      classes: click ? v.classes.filter((c) => c !== 'clickable') : [...v.classes],
      styles: v.styles.map(decodeEntities),
    };
    if (click) node.click = click;
    if (click && tooltips.has(v.id)) node.tooltip = tooltips.get(v.id);
    nodes.push(node);
  }

  const subgraphs: FlowSubgraph[] = [];
  for (const sg of dbSubgraphs) {
    if (sg.metadata !== undefined) return { unsupported: `Subgraph ${sg.id} uses @{ } options.` };
    const vertex = vertices.get(sg.id);
    const subgraph: FlowSubgraph = {
      id: sg.id,
      title: decodeEntities(sg.title),
      markdown: sg.labelType === 'markdown',
      parent: subgraphParent.get(sg.id),
      direction: sg.dir,
      classes: [...new Set([...sg.classes, ...(vertex?.classes ?? [])])],
      styles: (vertex?.styles ?? []).map(decodeEntities),
    };
    subgraphs.push(subgraph);
  }

  const dbEdges = db.getEdges();
  const edges: FlowEdge[] = dbEdges.map((e) => {
    const edge: FlowEdge = {
      from: e.start,
      to: e.end,
      label: decodeEntities(e.text),
      markdown: e.labelType === 'markdown',
      type: (e.type ?? 'arrow_point') as EdgeType,
      stroke: (e.stroke ?? 'normal') as EdgeStroke,
      length: e.length ?? 1,
      styles: linkStyles(e.style),
      classes: [...e.classes],
    };
    if (e.isUserDefinedId && e.id) edge.id = e.id;
    if (e.interpolate !== undefined) edge.interpolate = e.interpolate;
    if (e.animate !== undefined) edge.animate = e.animate;
    if (e.animation !== undefined) edge.animation = e.animation;
    return edge;
  });

  const direction = db.getDirection() as Direction | undefined;
  const model: FlowModel = {
    ...header,
    direction: direction || undefined,
    nodes,
    edges,
    subgraphs,
    classDefs: [...db.getClasses().values()].map((c) => ({ id: c.id, styles: c.styles.map(decodeEntities) })),
    linkStyleDefault: linkStyles(dbEdges.defaultStyle),
    interpolateDefault: dbEdges.defaultInterpolate,
  };
  const accTitle = db.getAccTitle();
  const accDescr = db.getAccDescription();
  if (accTitle) model.accTitle = accTitle;
  if (accDescr) model.accDescr = accDescr;
  return model;
}

// Mermaid appends fill:none to a linkStyle without a fill; it comes back on the next parse.
function linkStyles(style: string[] | undefined): string[] {
  if (!style) return [];
  const fills = style.filter((s) => s.startsWith('fill'));
  const trimmed = fills.length === 1 && style[style.length - 1] === 'fill:none' ? style.slice(0, -1) : style;
  return trimmed.map(decodeEntities);
}

/** Model equality: node order and subgraph member order do not count, everything else does. */
export function canonicalModel(model: FlowModel): unknown {
  const node = (n: FlowNode) => ({
    id: n.id,
    label: n.label,
    markdown: n.markdown,
    shape: n.shape ?? null,
    parent: n.parent ?? null,
    classes: n.classes,
    styles: n.styles,
    click: n.click ? { ...n.click, target: n.click.kind === 'link' ? (n.click.target ?? null) : null } : null,
    tooltip: n.tooltip ?? null,
  });
  const edge = (e: FlowEdge) => ({
    id: e.id ?? null,
    from: e.from,
    to: e.to,
    label: e.label,
    markdown: e.markdown,
    type: e.type,
    stroke: e.stroke,
    length: e.length,
    styles: e.styles,
    classes: e.classes,
    interpolate: e.interpolate ?? null,
    animate: e.animate ?? null,
    animation: e.animation ?? null,
  });
  const subgraph = (s: FlowSubgraph) => ({
    id: s.id,
    title: s.title,
    markdown: s.markdown,
    parent: s.parent ?? null,
    direction: s.direction ?? null,
    classes: [...s.classes].sort(),
    styles: s.styles,
  });
  return {
    frontMatter: model.frontMatter ?? null,
    directives: model.directives,
    keyword: model.keyword,
    direction: model.direction ?? null,
    accTitle: model.accTitle ?? null,
    accDescr: model.accDescr ?? null,
    nodes: [...model.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(node),
    edges: model.edges.map(edge),
    subgraphs: model.subgraphs.map(subgraph),
    classDefs: model.classDefs,
    linkStyleDefault: model.linkStyleDefault,
    interpolateDefault: model.interpolateDefault ?? null,
  };
}

export function modelsEqual(a: FlowModel, b: FlowModel): boolean {
  return JSON.stringify(canonicalModel(a)) === JSON.stringify(canonicalModel(b));
}

// ---- Serialiser ----

const INDENT = '    ';

/** Shapes with a bracket form; any other Mermaid shape is written as `id@{ shape: ... }`. */
export const BRACKET_SHAPES: Readonly<Record<string, readonly [string, string]>> = {
  square: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  subroutine: ['[[', ']]'],
  cylinder: ['[(', ')]'],
  circle: ['((', '))'],
  doublecircle: ['(((', ')))'],
  odd: ['>', ']'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  lean_right: ['[/', '/]'],
  lean_left: ['[\\', '\\]'],
  trapezoid: ['[/', '\\]'],
  inv_trapezoid: ['[\\', '/]'],
  ellipse: ['(-', '-)'],
};

// Letters, digits and light punctuation read the same unquoted; anything else is quoted.
const PLAIN_LABEL = /^[\p{L}\p{N}_`](?:[\p{L}\p{N}_ .,?!'`]*[\p{L}\p{N}_.?!'`])?$/u;
const KEYWORDS = /^(end|subgraph|graph|flowchart|style|class|classDef|click|linkStyle|call|href|default|direction|interpolate|accTitle|accDescr)$/i;

/** Label text as it goes between a shape's brackets or an edge's pipes. */
export function labelSource(label: string, markdown: boolean): string {
  // A quoted string cannot hold a double quote; #quot; is Mermaid's way to write one.
  const safe = label.replace(/"/g, '#quot;');
  if (markdown) return `"\`${safe}\`"`;
  if (PLAIN_LABEL.test(label) && !KEYWORDS.test(label)) return label;
  // "`...`" would read as markdown; #96; is the backtick, so the text changes but not what shows.
  if (safe.length > 1 && safe.startsWith('`') && safe.endsWith('`')) return `"#96;${safe.slice(1)}"`;
  return `"${safe}"`;
}

function yamlString(text: string): string {
  return JSON.stringify(text.replace(/"/g, '#quot;'));
}

function nodeSource(n: FlowNode): string {
  const brackets = n.shape === undefined ? undefined : BRACKET_SHAPES[n.shape];
  if (brackets) return n.id + brackets[0] + labelSource(n.label, n.markdown) + brackets[1];
  if (n.shape === undefined && !n.markdown && n.label === n.id) return n.id;
  const data: string[] = [];
  if (n.shape !== undefined) data.push(`shape: ${n.shape}`);
  if (n.markdown || n.label !== n.id) {
    data.push(`label: ${yamlString(n.label)}`);
    // An @{ } label is markdown unless told otherwise.
    if (!n.markdown) data.push('labelType: "string"');
  }
  return `${n.id}@{ ${data.join(', ')} }`;
}

export function arrowSource(e: Pick<FlowEdge, 'type' | 'stroke' | 'length'>): string {
  const n = Math.max(1, e.length);
  const double = e.type.startsWith('double_');
  const head = e.type.endsWith('point') ? '>' : e.type.endsWith('cross') ? 'x' : e.type.endsWith('circle') ? 'o' : '';
  const tail = double ? (head === '>' ? '<' : head) : '';
  const open = head === '';
  switch (e.stroke) {
    case 'thick':
      return tail + '='.repeat(n + (open ? 2 : 1)) + head;
    case 'dotted':
      return tail + '-' + '.'.repeat(n) + '-' + head;
    case 'invisible':
      return '~'.repeat(n + 2);
    default:
      return tail + '-'.repeat(n + (open ? 2 : 1)) + head;
  }
}

/** Ids Mermaid gives edges, in order: the written id, or L_from_to_n as FlowDB counts them. */
export function edgeIds(edges: readonly FlowEdge[]): string[] {
  const ids: string[] = [];
  edges.forEach((e, i) => {
    if (e.id !== undefined && !ids.includes(e.id)) {
      ids.push(e.id);
      return;
    }
    const earlier = edges.slice(0, i).filter((p) => p.from === e.from && p.to === e.to).length;
    ids.push(`L_${e.from}_${e.to}_${earlier === 0 ? 0 : earlier + 1}`);
  });
  return ids;
}

// `class A,B hot` when that keeps every target's class order, else one line per assignment:
// class order decides which classDef wins.
function classLines(targets: { id: string; classes: string[] }[]): string[] {
  const order: string[] = [];
  for (const t of targets) for (const c of t.classes) if (!order.includes(c)) order.push(c);
  const inOrder = targets.every((t) => t.classes.every((c, i) => i === 0 || order.indexOf(t.classes[i - 1]) < order.indexOf(c)));
  if (!inOrder) return targets.flatMap((t) => t.classes.map((c) => `class ${t.id} ${c}`));
  return order.map((c) => `class ${targets.filter((t) => t.classes.includes(c)).map((t) => t.id).join(',')} ${c}`);
}

/** Writes the model as normalised Mermaid text, one statement per line. */
export function serialiseFlowchart(model: FlowModel): string {
  const out: string[] = [];
  if (model.frontMatter) out.push(model.frontMatter);
  out.push(...model.directives);
  out.push(model.direction ? `${model.keyword} ${model.direction}` : model.keyword);
  const body = (line: string) => out.push(INDENT + line);

  if (model.accTitle) body(`accTitle: ${model.accTitle}`);
  if (model.accDescr) {
    if (model.accDescr.includes('\n')) body(`accDescr {\n${model.accDescr}\n${INDENT}}`);
    else body(`accDescr: ${model.accDescr}`);
  }

  const writeLevel = (parent: string | undefined, depth: number) => {
    const pad = INDENT.repeat(depth);
    for (const n of model.nodes) if (n.parent === parent) out.push(pad + nodeSource(n));
    for (const s of model.subgraphs) {
      if (s.parent !== parent) continue;
      const titled = s.markdown || s.title !== s.id;
      out.push(`${pad}subgraph ${s.id}${titled ? ` [${labelSource(s.title, s.markdown)}]` : ''}`);
      if (s.direction) out.push(`${pad}${INDENT}direction ${s.direction}`);
      writeLevel(s.id, depth + 1);
      out.push(`${pad}end`);
    }
  };
  writeLevel(undefined, 1);

  const ids = edgeIds(model.edges);
  model.edges.forEach((e, i) => {
    const label = e.label !== '' || e.markdown ? `|${labelSource(e.label, e.markdown)}|` : '';
    const id = e.id !== undefined && ids[i] === e.id ? `${e.id}@` : '';
    body(`${e.from} ${id}${arrowSource(e)}${label} ${e.to}`);
  });

  for (const c of model.classDefs) body(`classDef ${c.id} ${c.styles.map((s) => s.replace(/,/g, '\\,')).join(',')}`);
  // Style lines before class lines: a style line on a subgraph id creates the vertex that
  // the class line then has to reach too.
  for (const t of [...model.nodes, ...model.subgraphs]) if (t.styles.length > 0) body(`style ${t.id} ${t.styles.join(',')}`);
  const classTargets = [
    ...model.nodes,
    ...model.subgraphs,
    ...model.edges.map((e, i) => ({ id: ids[i], classes: e.classes })),
  ].filter((t) => t.classes.length > 0);
  for (const line of classLines(classTargets)) body(line);

  if (model.linkStyleDefault.length > 0 || model.interpolateDefault) {
    body(linkStyleLine('default', model.interpolateDefault, model.linkStyleDefault));
  }
  model.edges.forEach((e, i) => {
    if (e.styles.length > 0 || e.interpolate) body(linkStyleLine(String(i), e.interpolate, e.styles));
  });
  model.edges.forEach((e, i) => {
    const data: string[] = [];
    if (e.animate !== undefined) data.push(`animate: ${e.animate}`);
    if (e.animation !== undefined) data.push(`animation: ${e.animation}`);
    if (data.length > 0) body(`${ids[i]}@{ ${data.join(', ')} }`);
  });

  for (const n of model.nodes) {
    if (!n.click) continue;
    const tooltip = n.tooltip !== undefined ? ` "${n.tooltip.replace(/"/g, '#quot;')}"` : '';
    if (n.click.kind === 'link') {
      body(`click ${n.id} href "${n.click.url}"${tooltip}${n.click.target ? ` ${n.click.target}` : ''}`);
    } else {
      // `call fn` without brackets leaves the lexer in its callback state and breaks the next line.
      const call = n.click.args !== undefined ? `call ${n.click.fn}(${n.click.args})` : n.click.fn;
      body(`click ${n.id} ${call}${tooltip}`);
    }
  }
  return out.join('\n') + '\n';
}

function linkStyleLine(target: string, interpolate: string | undefined, styles: string[]): string {
  const parts = [`linkStyle ${target}`];
  if (interpolate) parts.push(`interpolate ${interpolate}`);
  if (styles.length > 0) parts.push(styles.join(','));
  return parts.join(' ');
}

// ---- Edits: each returns a new model and leaves its input alone ----

function usedIds(model: FlowModel): Set<string> {
  return new Set([...model.nodes.map((n) => n.id), ...model.subgraphs.map((s) => s.id), ...edgeIds(model.edges)]);
}

/** A node id not used by any node, subgraph or edge: n1, n2, ... */
export function newNodeId(model: FlowModel): string {
  const used = usedIds(model);
  let i = model.nodes.length + 1;
  while (used.has(`n${i}`)) i++;
  return `n${i}`;
}

function nodeIndex(model: FlowModel, id: string): number {
  const i = model.nodes.findIndex((n) => n.id === id);
  if (i < 0) throw new Error(`No node ${id}`);
  return i;
}

function edgeAt(model: FlowModel, index: number): FlowEdge {
  const edge = model.edges[index];
  if (!edge) throw new Error(`No edge ${index}`);
  return edge;
}

function isEndpoint(model: FlowModel, id: string): boolean {
  return model.nodes.some((n) => n.id === id) || model.subgraphs.some((s) => s.id === id);
}

function newEdge(from: string, to: string, label = ''): FlowEdge {
  return { from, to, label, markdown: false, type: 'arrow_point', stroke: 'normal', length: 1, styles: [], classes: [] };
}

function updateNode(model: FlowModel, id: string, change: Partial<FlowNode>): FlowModel {
  const i = nodeIndex(model, id);
  const nodes = [...model.nodes];
  nodes[i] = { ...nodes[i], ...change };
  return { ...model, nodes };
}

function updateEdge(model: FlowModel, index: number, change: Partial<FlowEdge>): FlowModel {
  const edges = [...model.edges];
  edges[index] = { ...edgeAt(model, index), ...change };
  return { ...model, edges };
}

export interface AddNodeArgs {
  label: string;
  /** Defaults to newNodeId(model). */
  id?: string;
  shape?: string;
  /** Adds an edge from this node to the new one, and puts the new one in its subgraph. */
  from?: string;
  parent?: string;
}

export function addNode(model: FlowModel, args: AddNodeArgs): FlowModel {
  const id = args.id ?? newNodeId(model);
  if (usedIds(model).has(id)) throw new Error(`Id ${id} is already in use`);
  const from = args.from === undefined ? undefined : model.nodes[nodeIndex(model, args.from)];
  const node: FlowNode = {
    id,
    label: args.label,
    markdown: false,
    shape: args.shape ?? 'square',
    parent: args.parent ?? from?.parent,
    classes: [],
    styles: [],
  };
  return {
    ...model,
    nodes: [...model.nodes, node],
    edges: from ? [...model.edges, newEdge(from.id, id)] : model.edges,
  };
}

export function renameNode(model: FlowModel, args: { id: string; label: string }): FlowModel {
  return updateNode(model, args.id, { label: args.label });
}

/** shape undefined makes a bare node, drawn as a rectangle. */
export function setShape(model: FlowModel, args: { id: string; shape: string | undefined }): FlowModel {
  return updateNode(model, args.id, { shape: args.shape });
}

export function connect(model: FlowModel, args: { from: string; to: string; label?: string }): FlowModel {
  for (const id of [args.from, args.to]) if (!isEndpoint(model, id)) throw new Error(`No node or subgraph ${id}`);
  return { ...model, edges: [...model.edges, newEdge(args.from, args.to, args.label)] };
}

/** Removes the node and its edges; its classes, style and click go with it. */
export function deleteNode(model: FlowModel, args: { id: string }): FlowModel {
  nodeIndex(model, args.id);
  return {
    ...model,
    nodes: model.nodes.filter((n) => n.id !== args.id),
    edges: model.edges.filter((e) => e.from !== args.id && e.to !== args.id),
  };
}

export function deleteEdge(model: FlowModel, args: { index: number }): FlowModel {
  edgeAt(model, args.index);
  return { ...model, edges: model.edges.filter((_, i) => i !== args.index) };
}

export function setEdgeLabel(model: FlowModel, args: { index: number; label: string }): FlowModel {
  return updateEdge(model, args.index, { label: args.label });
}

export function setDirection(model: FlowModel, args: { direction: Direction }): FlowModel {
  return { ...model, direction: args.direction };
}
