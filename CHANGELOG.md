# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.2] - 2026-09-25

### Fixed
- The rendered diagram's SVG had a role but no accessible name unless the definition set
  `accTitle` itself, so a screen reader announced it with nothing to read out. It now falls
  back to a name built from the diagram type (e.g. "Flowchart", "State diagram").

## [0.3.1] - 2026-09-23

### Changed
- The four TB, LR, BT and RL direction buttons are now one **Direction** menu with the
  directions spelled out (Top to bottom, Left to right, Bottom to top, Right to left); the
  current one shows as selected.

### Fixed
- In the Designer, Enter or Space on a focused editor button or menu item did nothing or
  ended deep-select, because the Designer also acted on the keystroke. The editor now handles
  both keys itself on keydown and keeps them from the Designer; each press acts once.
- The Shape and Direction menus now work from the keyboard: opening one focuses the current
  item, the arrow keys (and Home/End) move between items without nudging the component on
  the canvas, and Escape or a choice closes the menu and returns focus to its button.

## [0.3.0] - 2026-09-23

### Fixed
- The Zoom out/in, Fit, Download and Shape controls showed only a glyph (`-`, `+`, `▾`), so a
  screen reader read the glyph itself ("hyphen", "black down-pointing small triangle") instead of
  the control's purpose. Each now carries an `aria-label` naming what it does.
- Escape now closes the graphical editor's shape menu; it previously had no keyboard handling
  at all and stayed open until a shape was clicked or focus moved elsewhere by mouse.

## [0.2.1] - 2026-09-22

### Fixed
- The fit no longer puts the top of the diagram under the zoom and Download bar, which hid the
  first node of every top-to-bottom flowchart. The fit uses the area below the bar, measured
  rather than assumed, with `padding` on top of it; with the bar present the diagram's top edge
  stays below it in every `fitMode`. No bar, no inset.

## [0.2.0] - 2026-09-22

### Added
- Graphical flowchart editor on the Designer canvas, behind `edit.enabled` (default `false`).
  Double-click the diagram to use it: select nodes and edges, add, connect, rename, change shape,
  label edges, delete, change direction, and undo/redo its own edits. Each edit rewrites
  `definition`; the first edit of a definition that would lose comments or layout asks first.

### Fixed
- Design mode is now detected from the page's `isPreviewing` flag. The store's
  `isDesigner`/`isPreviewing` that 0.1.x read are never set in the real Designer, so pan was not
  switched off there and the no-`zoomLevel`-write guard never applied.
- The fit now applies when zoom is off or the view is in design mode. Both used the zoom
  library's `disabled` flag, which turns its `setTransform` into a no-op while `zoomIn` still
  runs, so the label and the library disagreed and "+" jumped from the stale scale.
- The zoom and download controls are inert while the component is deep-selected in the Designer.

## [0.1.3] - 2026-09-22

### Fixed
- `zoomLevel` is no longer written on an auto-fit (mount, resize, a definition change, or the
  Reset button) — only for a user zoom (buttons, wheel) or a script value the component had to
  clamp. Previously opening a view in the Designer alone dirtied its `zoomLevel`.

## [0.1.2] - 2026-09-22

### Added
- `zoom.wheelModifier`: `false` zooms on a plain wheel; the default `true` keeps Ctrl or Cmd + wheel.
- The zoom controls say "Ctrl + scroll to zoom" (or the Cmd form on a Mac) while a modifier is needed.

## [0.1.1] - 2026-09-22

### Changed
- Rebuilt for the licence text change in `license.html`; no functional change.

## [0.1.0] - 2026-09-22

### Added
- Fork of Cognidata Mermaid Chart 1.0.0 for Ignition 8.3: module id `com.gaskony.mermaid`, component `gaskony.display.mermaid`, Cognidata's property schema unchanged.
- Hooks rebuilt on the 8.3 SDK with `requiredIgnitionVersion` 8.3.0; 8.3 faults the 8.1-targeted original.
- Component rewritten in TypeScript on mermaid 12.0.0 and react-zoom-pan-pinch 4.2.0, bundled with every diagram type so it renders offline.
- Renders queue through one chain, since `mermaid.initialize` is global and charts with different themes would otherwise race.
- Ctrl or Cmd + wheel zoom uses the `KeyboardEvent.key` names react-zoom-pan-pinch 4 matches.
- Pan is off in the Designer's design mode so a click selects the component instead of being swallowed.
- Parse errors no longer leave mermaid's own error graphic in the page.
- `THIRD-PARTY-LICENSES.txt` ships with the bundle; lodash-es pinned to 4.18.1 over mermaid's vulnerable 4.17.23.
