// @vitest-environment happy-dom
// Mermaid's parser sanitises text with DOMPurify, which needs a DOM.
import { describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import { ER_DEFINITION, SAMPLE_DEFINITIONS } from './flowModel.fixtures';
import {
  BRACKET_SHAPES,
  EdgeStroke,
  EdgeType,
  FlowModel,
  addNode,
  arrowSource,
  canonicalModel,
  connect,
  deleteEdge,
  deleteNode,
  isUnsupported,
  labelSource,
  modelsEqual,
  newNodeId,
  parseFlowchart,
  renameNode,
  serialiseFlowchart,
  setDirection,
  setEdgeLabel,
  setShape,
} from './flowModel';
import { DEFAULT_DEFINITION } from './options';

async function parsed(text: string): Promise<FlowModel> {
  const result = await parseFlowchart(text);
  if (isUnsupported(result)) throw new Error(result.unsupported);
  return result;
}

async function roundTrip(text: string): Promise<{ model: FlowModel; text: string; again: FlowModel }> {
  const model = await parsed(text);
  const out = serialiseFlowchart(model);
  const again = await parsed(out);
  expect(canonicalModel(again)).toEqual(canonicalModel(model));
  return { model, text: out, again };
}

const node = (m: FlowModel, id: string) => m.nodes.find((n) => n.id === id);

describe('parseFlowchart', () => {
  it('reads the sample definition', async () => {
    const m = await parsed(DEFAULT_DEFINITION);
    expect(m.direction).toBe('TB');
    expect(m.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Start', 'square'],
      ['B', 'Decision', 'diamond'],
      ['C', 'Render chart', 'square'],
      ['D', 'Update definition', 'square'],
    ]);
    expect(m.edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ['A', 'B', ''],
      ['B', 'C', 'Yes'],
      ['B', 'D', 'No'],
    ]);
  });

  it('captures every statement kind', async () => {
    const m = await parsed(`%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart LR
    %% a comment
    A([Start]):::hot ==> B[(Store)]
    B -.->|maybe| C((End))
    subgraph outer [Outer box]
        direction TB
        D
        subgraph inner
            E
        end
    end
    classDef hot fill:#f96,stroke:#333
    class D,E hot
    style C fill:#0f0
    linkStyle 1 stroke:red
    click C href "https://example.com" "Go" _blank
    click D call doThing("x")`);
    expect(m.directives).toEqual(['%%{init: {"flowchart": {"curve": "basis"}}}%%']);
    expect(m.hasComments).toBe(true);
    expect(m.direction).toBe('LR');
    expect(node(m, 'A')).toMatchObject({ shape: 'stadium', classes: ['hot'] });
    expect(node(m, 'B')?.shape).toBe('cylinder');
    expect(node(m, 'C')).toMatchObject({
      shape: 'circle',
      styles: ['fill:#0f0'],
      classes: [],
      click: { kind: 'link', url: 'https://example.com', target: '_blank' },
      tooltip: 'Go',
    });
    expect(node(m, 'D')).toMatchObject({ parent: 'outer', classes: ['hot'], click: { kind: 'call', fn: 'doThing', args: '"x"' } });
    expect(node(m, 'E')?.parent).toBe('inner');
    expect(m.edges.map((e) => [e.stroke, e.type, e.label])).toEqual([
      ['thick', 'arrow_point', ''],
      ['dotted', 'arrow_point', 'maybe'],
    ]);
    expect(m.edges[1].styles).toEqual(['stroke:red']);
    expect(m.subgraphs.map((s) => [s.id, s.title, s.parent, s.direction])).toEqual([
      ['inner', 'inner', 'outer', undefined],
      ['outer', 'Outer box', undefined, 'TB'],
    ]);
    expect(m.classDefs).toEqual([{ id: 'hot', styles: ['fill:#f96', 'stroke:#333'] }]);
  });

  it('keeps labels as written, not as Mermaid sanitises them', async () => {
    const m = await parsed('flowchart TD\n    A["say #quot;hi#quot; &amp; <b>bye</b>"] --> B["a<br>b"]');
    expect(node(m, 'A')?.label).toBe('say #quot;hi#quot; &amp; <b>bye</b>');
    expect(node(m, 'B')?.label).toBe('a<br>b');
  });

  it('refuses a diagram that is not a flowchart', async () => {
    const result = await parseFlowchart(ER_DEFINITION.definition);
    expect(isUnsupported(result) && result.unsupported).toMatch(/er.* not a flowchart/i);
  });

  it('refuses text Mermaid cannot parse', async () => {
    const result = await parseFlowchart('flowchart TD\n    A --> ');
    expect(isUnsupported(result) && result.unsupported).toMatch(/cannot parse/);
  });

  it('refuses icon nodes', async () => {
    const result = await parseFlowchart('flowchart TD\n    A@{ icon: "fa:user", form: "square", label: "User" }');
    expect(isUnsupported(result)).toBe(true);
  });
});

describe('edge cases', () => {
  it('quoted labels with brackets and colons', async () => {
    const { model, text } = await roundTrip('flowchart LR\n    A["Pump [P-101]: running (auto)"] -->|"flow: 12 L/s"| B{"Level > 80%?"}');
    expect(node(model, 'A')?.label).toBe('Pump [P-101]: running (auto)');
    expect(node(model, 'B')?.label).toBe('Level > 80%?');
    expect(model.edges[0].label).toBe('flow: 12 L/s');
    expect(text).toContain('A["Pump [P-101]: running (auto)"]');
  });

  it('<br> in a label', async () => {
    const { model } = await roundTrip('flowchart TD\n    A[Line one<br>line two] --> B["x<br/>y"]');
    expect(node(model, 'A')?.label).toBe('Line one<br>line two');
    expect(node(model, 'B')?.label).toBe('x<br/>y');
  });

  it('a subgraph with a title', async () => {
    const { model, text } = await roundTrip('flowchart TD\n    subgraph plant ["Treatment plant (north)"]\n        A --> B\n    end');
    expect(model.subgraphs[0]).toMatchObject({ id: 'plant', title: 'Treatment plant (north)' });
    expect(text).toContain('subgraph plant ["Treatment plant (north)"]');
  });

  it('a subgraph titled without an id gets a generated one', async () => {
    const { model } = await roundTrip('flowchart TD\n    subgraph Raw water\n        A\n    end');
    expect(model.subgraphs[0]).toMatchObject({ id: 'subGraph0', title: 'Raw water' });
  });

  it('several edges on one line', async () => {
    const { model } = await roundTrip('flowchart TD\n    A --> B & C\n    D & E --> F');
    expect(model.edges.map((e) => `${e.from}${e.to}`)).toEqual(['AB', 'AC', 'DF', 'EF']);
  });

  it('chained edges', async () => {
    const { model } = await roundTrip('flowchart LR\n    A --> B -.-> C ==> D');
    expect(model.edges.map((e) => [e.from, e.to, e.stroke])).toEqual([
      ['A', 'B', 'normal'],
      ['B', 'C', 'dotted'],
      ['C', 'D', 'thick'],
    ]);
  });

  it('both edge label forms', async () => {
    const { model, text } = await roundTrip('flowchart LR\n    A -- inline text --> B\n    B -->|piped text| C\n    C -. dotted text .-> D\n    D == thick text ==> E');
    expect(model.edges.map((e) => [e.label, e.stroke])).toEqual([
      ['inline text', 'normal'],
      ['piped text', 'normal'],
      ['dotted text', 'dotted'],
      ['thick text', 'thick'],
    ]);
    expect(text).toContain('A -->|inline text| B');
  });

  it('a node declared only through an edge', async () => {
    const { model, text } = await roundTrip('flowchart LR\n    A[Start] --> Ghost');
    expect(node(model, 'Ghost')).toMatchObject({ label: 'Ghost', shape: undefined });
    expect(text).toMatch(/^ {4}Ghost$/m);
  });

  it('an edge to a subgraph, and a style on it', async () => {
    const { model } = await roundTrip('flowchart LR\n    A --> S\n    subgraph S\n        B\n    end\n    style S fill:#eee');
    expect(node(model, 'S')).toBeUndefined();
    expect(model.subgraphs[0].styles).toEqual(['fill:#eee']);
  });

  it('edge ids, animation and markdown labels', async () => {
    const { model } = await roundTrip('flowchart LR\n    A e1@==> B["`**bold** text`"]\n    e1@{ animate: true }\n    class e1 hot');
    expect(model.edges[0]).toMatchObject({ id: 'e1', animate: true, classes: ['hot'] });
    expect(node(model, 'B')).toMatchObject({ markdown: true, label: '**bold** text' });
  });

  it('front matter, accessibility text and link defaults', async () => {
    await roundTrip('---\ntitle: Plant\n---\nflowchart LR\n    accTitle: Plant flow\n    accDescr: Raw to treated\n    A --> B\n    linkStyle default interpolate basis stroke:#999');
  });

  it('a click callback survives the strict security level', async () => {
    const { model, text } = await roundTrip('flowchart LR\n    A --> B\n    click A notify "Tip"\n    click B call open(1, "x")');
    expect(node(model, 'A')).toMatchObject({ click: { kind: 'call', fn: 'notify' }, tooltip: 'Tip', classes: [] });
    expect(text).toContain('click B call open(1, "x")');
  });
});

describe('serialiseFlowchart', () => {
  it('writes the sample in normalised form', async () => {
    expect(serialiseFlowchart(await parsed(DEFAULT_DEFINITION))).toBe(`flowchart TB
    A[Start]
    B{Decision}
    C[Render chart]
    D[Update definition]
    A --> B
    B -->|Yes| C
    B -->|No| D
`);
  });

  it('quotes a label only where Mermaid needs it', () => {
    const cases: [string, string][] = [
      ['Start', 'Start'],
      ['Render chart', 'Render chart'],
      ["Operator's check, done?", "Operator's check, done?"],
      ['Café', 'Café'],
      ['Pump (P-101)', '"Pump (P-101)"'],
      ['x: [y]', '"x: [y]"'],
      ['a{b}', '"a{b}"'],
      ['a<br>b', '"a<br>b"'],
      ['#quot;hi#quot;', '"#quot;hi#quot;"'],
      ['a & b', '"a & b"'],
      ['a | b', '"a | b"'],
      ['a --> b', '"a --> b"'],
      ['end', '"end"'],
      ['50%', '"50%"'],
      ['say "hi"', '"say #quot;hi#quot;"'],
      ['', '""'],
      ['`tick`', '`tick`'],
      ['`a (b)`', '"#96;a (b)`"'],
    ];
    for (const [label, expected] of cases) expect(labelSource(label, false)).toBe(expected);
    expect(labelSource('**b**', true)).toBe('"`**b**`"');
  });

  it('round-trips awkward labels in nodes, edges and subgraph titles', async () => {
    const labels = [
      'Pump (P-101)', 'x: [y]', 'a{b}', 'a<br>b', '#quot;hi#quot;', '#35; #9829;', 'a & b', 'a | b', 'a --> b', 'end',
      '50%', 'Café', "it's", 'a;b', 'a/b\\c', '1.5 m³/h', '<b>bold</b>', '&amp; &lt;', 'x -- y', 'a = b', '`tick`',
    ];
    const m0 = await parsed('flowchart TD\n    A --> B\n    subgraph S\n        C\n    end');
    let m = m0;
    labels.forEach((label, i) => {
      m = addNode(m, { id: `N${i}`, label, from: 'A' });
      m = setEdgeLabel(m, { index: m.edges.length - 1, label });
    });
    m = { ...m, subgraphs: [{ ...m.subgraphs[0], title: 'Tank [T-1]: level (m)' }] };
    const again = await parsed(serialiseFlowchart(m));
    expect(canonicalModel(again)).toEqual(canonicalModel(m));
  });

  it('writes every arrow type, stroke and length Mermaid can read back', async () => {
    const types: EdgeType[] = [
      'arrow_point', 'arrow_open', 'arrow_cross', 'arrow_circle',
      'double_arrow_point', 'double_arrow_cross', 'double_arrow_circle',
    ];
    const strokes: EdgeStroke[] = ['normal', 'thick', 'dotted'];
    const wanted: { type: EdgeType; stroke: EdgeStroke; length: number }[] = [];
    for (const type of types) for (const stroke of strokes) for (const length of [1, 2, 3]) wanted.push({ type, stroke, length });
    for (const length of [1, 2, 3]) wanted.push({ type: 'arrow_open', stroke: 'invisible', length });
    const text = ['flowchart LR', ...wanted.map((w) => `    A ${arrowSource(w)} B`)].join('\n');
    const m = await parsed(text);
    expect(m.edges.map((e) => ({ type: e.type, stroke: e.stroke, length: e.length }))).toEqual(wanted);
  });

  it('writes every shape Mermaid can read back', async () => {
    const shapes = [...Object.keys(BRACKET_SHAPES), 'diam', 'cyl', 'doc', 'notch-rect'];
    let m = await parsed('flowchart LR\n    A');
    shapes.forEach((shape, i) => {
      m = addNode(m, { id: `S${i}`, label: `Shape ${i}`, shape });
    });
    m = setShape(addNode(m, { id: 'plain', label: 'Not the id' }), { id: 'plain', shape: undefined });
    const out = serialiseFlowchart(m);
    expect(out).toContain('S0[Shape 0]');
    expect(out).toContain('plain@{ label: "Not the id", labelType: "string" }');
    const again = await parsed(out);
    expect(canonicalModel(again)).toEqual(canonicalModel(m));
  });

  it('groups class lines unless that would reorder a node’s classes', async () => {
    const grouped = await roundTrip('flowchart LR\n    A --> B\n    class A,B one\n    class A two');
    expect(grouped.text).toContain('class A,B one');
    const split = await roundTrip('flowchart LR\n    A --> B\n    class A one\n    class A two\n    class B two\n    class B one');
    expect(split.text).toContain('class B two\n    class B one');
  });
});

describe('corpus', () => {
  const flowcharts = [{ name: 'Cognidata sample', definition: DEFAULT_DEFINITION }, ...SAMPLE_DEFINITIONS.filter((d) => d !== ER_DEFINITION)];

  it('has the flowcharts it should', () => {
    expect(flowcharts.length).toBe(5);
  });

  for (const item of flowcharts) {
    it(`round-trips ${item.name}, and the output still parses`, async () => {
      const { text } = await roundTrip(item.definition);
      await expect(mermaid.parse(text)).resolves.toMatchObject({ diagramType: 'flowchart-v2' });
    });
  }
});

describe('edits', () => {
  const base = () => parsed(`flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Go]
    B -->|No| D[Stop]
    subgraph S [Group]
        C
    end
    classDef hot fill:#f96
    class B,C hot
    style B fill:#eee
    linkStyle 2 stroke:red
    click B href "https://example.com" "Help"`);

  it('addNode gives a new id that collides with nothing', async () => {
    let m = await base();
    m = { ...m, nodes: [...m.nodes, { ...m.nodes[0], id: 'n6' }], subgraphs: [...m.subgraphs, { ...m.subgraphs[0], id: 'n7' }] };
    const id = newNodeId(m);
    expect(id).toBe('n8');
    const added = addNode(m, { label: 'Next', from: 'C' });
    const n = node(added, id);
    expect(n).toMatchObject({ label: 'Next', shape: 'square', parent: 'S' });
    expect(added.edges[added.edges.length - 1]).toMatchObject({ from: 'C', to: id });
    expect(() => addNode(m, { id: 'A', label: 'Clash' })).toThrow(/in use/);
    expect(() => addNode(m, { id: 'S', label: 'Clash' })).toThrow(/in use/);
  });

  it('renameNode', async () => {
    const m = renameNode(await base(), { id: 'C', label: 'Go (auto)' });
    expect((await roundTrip(serialiseFlowchart(m))).model.nodes.find((n) => n.id === 'C')?.label).toBe('Go (auto)');
  });

  it('setShape', async () => {
    const m = setShape(await base(), { id: 'D', shape: 'stadium' });
    expect(serialiseFlowchart(m)).toContain('D([Stop])');
  });

  it('connect', async () => {
    const m = connect(await base(), { from: 'D', to: 'A', label: 'retry' });
    expect(m.edges[m.edges.length - 1]).toMatchObject({ from: 'D', to: 'A', label: 'retry' });
    expect(connect(m, { from: 'A', to: 'S' }).edges[m.edges.length]?.to).toBe('S');
    expect(() => connect(m, { from: 'A', to: 'nope' })).toThrow();
  });

  it('deleteNode removes its edges, classes, style and click, and keeps linkStyle on the right edge', async () => {
    const before = await base();
    const m = deleteNode(before, { id: 'B' });
    expect(m.edges).toEqual([]);
    const out = serialiseFlowchart(m);
    expect(out).not.toMatch(/\bB\b/);
    expect(out).toContain('class C hot');
    expect(out).not.toContain('linkStyle');
    expect(before.nodes.some((n) => n.id === 'B')).toBe(true);
    await roundTrip(out);
  });

  it('deleteEdge renumbers linkStyle', async () => {
    const m = deleteEdge(await base(), { index: 0 });
    expect(m.edges.map((e) => e.to)).toEqual(['C', 'D']);
    expect(serialiseFlowchart(m)).toContain('linkStyle 1 stroke:red');
    const again = await parsed(serialiseFlowchart(m));
    expect(again.edges[1].styles).toEqual(['stroke:red']);
  });

  it('setEdgeLabel', async () => {
    const m = setEdgeLabel(await base(), { index: 1, label: 'Yes: [go]' });
    expect(serialiseFlowchart(m)).toContain('B -->|"Yes: [go]"| C');
    expect(setEdgeLabel(m, { index: 1, label: '' }).edges[1].label).toBe('');
  });

  it('setDirection', async () => {
    const m = setDirection(await base(), { direction: 'LR' });
    expect(serialiseFlowchart(m).split('\n')[0]).toBe('flowchart LR');
  });

  it('leaves the input model alone', async () => {
    const m = await base();
    const snapshot = JSON.stringify(m);
    addNode(m, { label: 'x', from: 'A' });
    renameNode(m, { id: 'A', label: 'y' });
    deleteNode(m, { id: 'B' });
    deleteEdge(m, { index: 0 });
    setDirection(m, { direction: 'RL' });
    expect(JSON.stringify(m)).toBe(snapshot);
    expect(modelsEqual(m, await base())).toBe(true);
  });
});
