# Known issues

- The graphical editor supports flowcharts only. Other diagram types show "Graphical
  editing supports flowcharts; edit the definition text" instead of a toolbar.
- Editing a flowchart normalises it on the first edit: `%%` comments are dropped and the
  text is rewritten one statement per line (nodes first, then edges), so `A --> B --> C`
  becomes two lines and `TD` becomes `TB`. The editor asks once before the first edit
  that would change a definition this way.
- Undo history is the editor's own stack (about 50 edits), held in memory only. It is
  lost when the view is closed or deep-select ends, and lost on switching to Preview,
  since the editor never shows there.
- The flow model (`flowModel.ts`) parses and serialises flowcharts through Mermaid's own
  internal, deprecated `getDiagramFromText` API, not a published interface. It is tested
  only against the pinned `mermaid` version in `package.json` — re-run the flowModel
  round-trip tests (`npm test`) after any Mermaid upgrade, since the parser internals can
  change without notice in a minor release.
- Maker Edition and the SVG download are untested.
- Running on a fully offline gateway (no outbound network at all) is unverified; the
  component itself makes no network calls, but the gateway's own module install and
  licence steps have not been exercised offline.
