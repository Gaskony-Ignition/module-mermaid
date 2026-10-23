# Mermaid Chart module

Perspective component rendering Mermaid definitions. Fork of Cognidata Mermaid Chart; see
`README.md`. Workspace-wide module rules are in `../CLAUDE.md`.

## Layout

- `common/` holds `MermaidComponents` (ids, descriptor, browser resources) and
  `mermaid.props.json`, the schema. Property names stay Cognidata's so their docs apply.
- `gateway/` registers the component and mounts `mounted/` at `/res/gaskony-mermaid/`.
- `designer/` registers the palette entry.
- `web-ui/` is the React component. `npm run build` type-checks with `tsc`, bundles with
  webpack + esbuild-loader into `web-ui/build/generated-resources/mounted/`, and writes
  `THIRD-PARTY-LICENSES.txt`; the gateway jar picks that folder up as resources.

## Commands

```bash
rm -rf build/moduleContent && ./gradlew build   # full signed build + packaging check
./gradlew check                                 # adds the vitest unit tests
cd web-ui && npm run typecheck && npm test      # frontend only
```

## Gotchas

- The mount alias appears twice: `MermaidComponents.MOUNT_ALIAS` and webpack `publicPath`.
  Change one and diagram chunks 404.
- React is the Perspective page's global (`React`, 18.x); only `react/jsx-runtime` is bundled,
  pulled in by react-zoom-pan-pinch. Keep `react` at 18 in devDependencies.
- TypeScript 7 has no compiler API, so ts-loader cannot run; esbuild transpiles and
  `tsc --noEmit` type-checks.
- `mermaid.initialize` is global: every render goes through the queue in `renderMermaid.ts`.
- Design mode is `store.view.page.parent.isPreviewing === false` (`isDesignMode` in
  `designMode.ts`); `store.isDesigner`/`isPreviewing` are never set in the real Designer.
- react-zoom-pan-pinch stops propagation of the mousedown it pans on, so design mode turns pan,
  wheel and pinch off one by one or the Designer cannot select the component. Never use the
  library's `disabled` prop: it makes `setTransform` a no-op while `zoomIn` still runs.
- The graphical editor (`FlowEditor.tsx`) needs the Designer's interaction delegate
  (`isContentEditable`, registered in `index.ts`): input reaches the component only once it is
  deep-selected (double-click), and never under `.not-editable`. The Designer's Undo ignores
  component writes, so the editor keeps its own stack.
- `zoomLevel` is written with `store.props.write`, but only for a user zoom (buttons, wheel) or
  a script value the component had to clamp — never for an auto-fit (mount, resize, definition
  change, Reset), gated by `suppressZoomWrite` in `MermaidChart.tsx`. The component ignores the
  echo of its own writes through `pendingZoomEchoes`.
- Editing `license.html` changes the licence hash and sends an installed gateway to the
  licence-acceptance screen on next start.
