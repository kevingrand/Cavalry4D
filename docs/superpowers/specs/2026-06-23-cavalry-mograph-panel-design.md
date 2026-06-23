# Cavalry MoGraph Panel — Design

- **Date:** 2026-06-23
- **Status:** Approved (design), pending implementation plan
- **Author:** framesbykg@gmail.com (with Claude)

## 1. Goal

Build a dockable Cavalry panel that gives a Cinema 4D artist the **MoGraph workflow they already know** — Cloner, Effectors, Fields — while creating only **native Cavalry layers** under the hood, intuitively renamed and auto-wired. Cavalry already has every primitive (Duplicator, Falloff, behaviours, the connection graph); what it lacks is the one-click, C4D-shaped front door. This panel is that front door.

The win is twofold:
1. **Naming & grouping** a C4D user recognizes (Cloner / Random Effector / Linear Field, color-coded by category).
2. **Auto-wiring** — clicking a button does the native Cavalry plumbing (`falloff → effector → duplicator.shapeRotation`) so the user never hand-wires connections.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| **V1 scope** | Core MoGraph: Cloner (Grid/Radial/Linear/Object) + Effectors (Random, Plain, Step, Shader) + Fields (Linear, Spherical, Box, Random), all auto-wired |
| **Targeting model** | Selection-based: select a layer in Cavalry's scene, click to add, it auto-wires to the selection |
| **Architecture** | Standalone hot-loadable `MoGraph.js` in Cavalry's `Scripts` folder, internally split into an `Engine` (operations) + thin UI |
| **Clone family v1** | Cloner only (Matrix/MoText/Fracture deferred to v2) |
| **Panel layout** | Single color-coded scrolling column (Clone=green, Effectors=purple, Fields=blue) + live Selection panel at the bottom |
| **Naming** | C4D terminology on the surface; created layers renamed (e.g. "Cloner 1", "Random Effector") |

## 3. Context & references

- **Platform:** Cavalry Script UIs (`ui.*` widgets). Following Cavalry's acquisition by Canva, formerly-Professional features (including Script UIs) are **free** — no license gate. Scripts live in `C:\Users\<USER>\AppData\Roaming\Cavalry\Scripts`, hot-load on save, appear in the Scripts menu, and can be docked.
- **Proven foundation:** `E:\DEV LOCAL\MIG Cavalry Composer\MIG_Cavalry_Toolkit.js` is an existing working dockable panel using these exact widgets (`ui.TabView`, `ui.Button`, `ui.ColorChip`, `ui.NumericField`, callbacks, `ui.getThemeColor`). It already implements a noise driver, grid duplicator, falloff rig, and selection callbacks — directly reusable patterns.
- **Reference library (not a runtime dependency):** `E:\DEV LOCAL\MIG Cavalry Composer\knowledge\docs\` — 373 pages of official Cavalry docs (node attributes, scripting API, Script UI reference) plus curated, verified API references. Used during implementation to confirm exact attribute names.
- **Relationship to the MCP:** The cavalry-mcp project is a *Claude-driven* bridge (Stallion HTTP). This panel is **independent** and runs entirely inside Cavalry. The `Engine` is deliberately UI-free so it could later be lifted into a shared file the MCP also calls, but that is not a v1 requirement.

### C4D → Cavalry mental model

In C4D you nest objects: a Cloner holds Effectors in a list; each Effector holds Fields in a list. In Cavalry the same relationships are expressed as **attribute connections** in a flat layer graph. The panel's job is to present the C4D nesting while building the Cavalry connections.

## 4. The translation table

| C4D term | Panel button | Native Cavalry layer | Distribution / config | Wires to |
|---|---|---|---|---|
| Cloner · Grid | Clone → Grid | `duplicator` | distribution `grid` | selection → `shapes.0` |
| Cloner · Radial | Clone → Radial | `duplicator` | distribution `circle` | selection → `shapes.0` |
| Cloner · Linear | Clone → Linear | `duplicator` | distribution `linear` | selection → `shapes.0` |
| Cloner · Object | Clone → Object | `duplicator` | distribution `path` (spline) or `shapePoints`/`subMesh` (mesh) | selection → `shapes.0`, target shape → distribution input |
| Random Effector | Effectors → Random | `random` | per-copy random | → `duplicator.shapeRotation` / `shapeScale` / `shapePosition` |
| Plain Effector | Effectors → Plain | `value` (amount + strength + falloff slot) | constant offset | → same channels |
| Step Effector | Effectors → Step | `stagger` (min→max by index) | gradient across clones | → same channels |
| Shader Effector | Effectors → Shader | `colorArray` / shader | per-copy color | → duplicator per-copy material color |
| Linear Field | Fields → Linear | `falloff` | `shapeType=Linear` | → effector falloff slot |
| Spherical Field | Fields → Spherical | `falloff` | `shapeType=Circle` | → effector falloff slot |
| Box Field | Fields → Box | `falloff` | `shapeType=Rectangle` | → effector falloff slot |
| Random Field | Fields → Random | `falloff` | `Probability` (seeded) | → effector falloff slot |

> Exact attribute paths (e.g. `generator.count.x`, `shapeRotation`, the `value` behaviour's amount/strength names, stagger min/max, `colorArray` wiring) are **verified during implementation** against the doc library and live layer inspection — see §10. The table fixes the *mapping*; implementation fixes the *strings*.

## 5. Architecture

One file, `MoGraph.js`, with four internal modules. The `Engine` has no `ui.*` references (clean seam — extractable, testable in isolation by driving `api` on a scratch comp).

```
MoGraph.js
├─ TypeMap   — pure data: every cloner mode, effector, field and its recipe
├─ Engine    — operations on api.*; returns created layer IDs; no UI
├─ Selection — introspects the live connection graph for the Selection panel
└─ Panel     — builds ui.* widgets from TypeMap, reads selection, calls Engine, refreshes
```

### 5.1 Engine interface (the deep module)

```
Engine.createCloner(mode, selectionIds)       -> { clonerId }
Engine.addEffector(effectorType, clonerId, channels) -> { effectorId, comboIds[] }
Engine.addField(fieldType, effectorId)        -> { fieldId, extraIds[] }
Engine.setEffectorChannels(effectorId, channels)     // channels = {position, scale, rotation}:bool
Engine.inspect(layerId)                       -> { type, role, params, attached[] }
```

Private helpers: `_create(type,name)`, `_wire(fromId,fromAttr,toId,toAttr)` (connect **then** verify with `getInConnection`, warn on silent failure), `_attr(layerId, logicalName)` (resolve a verified attribute path), `_renamed(id, niceName)`.

### 5.2 TypeMap (data-driven)

```js
TypeMap.cloners = {
  grid:   { distribution: "grid",   defaults: {/* count, size */} },
  radial: { distribution: "circle", defaults: {/* count, radius */} },
  linear: { distribution: "linear", defaults: {/* count, offset */} },
  object: { distribution: "path",   needsTarget: true }   // or shapePoints/subMesh
};
// channelAttrs map a logical channel -> the duplicator per-copy attribute the
// effector's output connects to. The three transform effectors share the same
// targets (shapePosition/shapeScale/shapeRotation); they differ in their own
// source layer. Shader targets per-copy color instead.
var XFORM = { position:"shapePosition", scale:"shapeScale", rotation:"shapeRotation" };
TypeMap.effectors = {
  random: { layer: "random",    channelAttrs: XFORM, fieldSlot: null /* needs combiner */ },
  plain:  { layer: "value",     channelAttrs: XFORM, fieldSlot: "falloffs.0.id" },
  step:   { layer: "stagger",   channelAttrs: XFORM, fieldSlot: "falloffs.0.id" },
  shader: { layer: "colorArray", channelAttrs: { color: "material.materialColor" }, fieldSlot: "falloffs.0.id" }
};
TypeMap.fields = {
  linear:    { layer: "falloff", config: { shapeType: "Linear" } },
  spherical: { layer: "falloff", config: { shapeType: "Circle" } },
  box:       { layer: "falloff", config: { shapeType: "Rectangle" } },
  random:    { layer: "falloff", config: { probability: true } }
};
```

Adding an effector/field later is a new row, not new code. The Panel iterates these maps to render its buttons.

### 5.3 Auto-wiring rules (selection-based)

- **Cloner** — selection → `shapes.0` of a new duplicator; distribution set per mode. Object mode defaults to distributing along a **spline** (`path`); if the picked target is a mesh/shape it uses `shapePoints`/`subMesh` instead. The target is the second selected layer (or the panel prompts for one).
- **Effector** — selected Cloner → new effector layer; its output connects to the duplicator per-copy channel(s) chosen by the effector's **P/S/R toggles**. Defaults: Random → rotation+position; Plain → position; Step → rotation; Shader → color.
- **Field** — selected Effector → field connects into that effector's `fieldSlot`. **Special case:** `random` has no native falloff slot (`fieldSlot: null`), so the Engine inserts a combiner (`math`/`modulate`): `random × field → channel`. Hidden from the user. The Engine owns one recipe per `(effectorType, fieldType)`; the combiner is only used where `fieldSlot` is null.
- **Wrong target** — if a Field is clicked with a Cloner (not an effector) selected, the panel explains it needs an effector and offers to create a Plain effector to host the field.

### 5.4 Effector "Parameter tab" (channels)

Each effector carries which transform channels it affects (Position / Scale / Rotation, plus Color for Shader). These render as toggles in the Selection panel when that effector is selected — the C4D Parameter-tab equivalent. Toggling calls `Engine.setEffectorChannels`, which connects/disconnects the relevant `shape*` channels live.

### 5.5 Selection panel via graph introspection

`Selection.describe(selectionId)` reads the live graph — no name-matching:
- If a `duplicator` is selected: report mode + key params (count, spacing/radius); find attached effectors by following out-connections into `shapeRotation/Scale/Position`/material; for each effector, find its falloff inputs to show the `Effector → Field` chain.
- If an effector/field is selected: report its params and what it drives.

This keeps the panel honest even if the user hand-edits the graph outside the panel.

## 6. UI layout

Single `ui.VLayout` (optionally inside a `ui.ScrollView`), sections top-to-bottom in MoGraph build order:

1. **Title bar** — "MoGraph".
2. **Clone** (green) — primary "Add Cloner" button + a 4-way mode selector (Grid / Radial / Linear / Object).
3. **Effectors** (purple) — 4 icon buttons: Random, Plain, Step, Shader.
4. **Fields** (blue) — 4 icon buttons: Linear, Spherical, Box, Random + caption "auto-wires to selected effector".
5. **Selection** — live context: selected layer, inline key params, P/S/R toggles for effectors, attached-effectors/fields chips.

- **Color coding:** Clone `#8BC34A`, Effectors `#9D7CD8`, Fields `#4A90D9` (adjustable). Applied via icon color + a category accent, themed against Cavalry's dark UI; use `ui.getThemeColor` where it fits.
- **Icons:** rendered with Cavalry-native means — preference order: (a) procedural vectors via `ui.Draw` (themeable, no asset files), else (b) small PNGs in a `MoGraph_assets/` folder referenced via `ui.scriptLocation`. The Tabler icons in the mockup were stand-ins only.
- **Refresh:** an `onSelectionChanged` callback (registered via `ui.addCallbackObject`) updates the Selection panel.

## 7. Naming conventions

Created layers get C4D-recognizable nice-names: "Cloner 1", "Random Effector", "Linear Field", etc. (numbered to avoid collisions). The Selection panel does **not** rely on names — it uses the connection graph — so a user renaming a layer never breaks the panel.

## 8. Error handling

- **No selection / wrong type** → friendly `ui.Modal.showMessage` stating exactly what to select (pattern from the existing toolkit's `getSelection()` guard).
- **Silent wiring failure** → every `_wire` verifies with `getInConnection`; failure logs a console warning and flags the panel rather than failing invisibly.
- **Cavalry not running / Script UIs unavailable** → the panel simply won't load from the Scripts menu; the only prerequisite is a current Cavalry build (Script UIs are free post-Canva).

## 9. Testing strategy

- **In-app self-test:** a bundled `selftest()` routine builds each recipe (cloner, each effector, each field, each combiner) on a scratch comp and asserts via `getLayerType` / `getInConnection`, logging pass/fail to the JS Console. This is the realistic equivalent of unit tests (Cavalry scripts can't run in an external harness).
- **Manual checklist:** documented steps to verify each button against a known scene.
- **Incremental live verification:** during implementation, each recipe is confirmed in Cavalry before moving on (discover → build → verify).

## 10. To verify during implementation (not blockers)

Exact strings to confirm against docs + live inspection before each recipe is finalized:
- Duplicator distribution config attrs per mode (`generator.count.x/y`, `generator.size`, radial radius, linear offset, path/shapePoints inputs).
- `random` layer output + whether it exposes any falloff slot (drives combiner decision).
- `value` behaviour amount/strength attribute names and its `falloffs.0.id`.
- `stagger` min/max attribute names when driving non-time channels.
- Per-copy color wiring (`colorArray` → duplicator material; arrayIndex/random selection).
- `math`/`modulate` combiner exact input/output attrs.
- Whether `ui.Draw` is the right vehicle for the category icons vs. PNG assets.

## 11. Out of scope (v2+)

Matrix / MoText / Fracture / MoInstance / Tracer; remaining effectors (Delay, Inheritance, Push Apart, Target, Time, Sound, Formula); remaining field types and field layer-stacking/remapping; shared Engine extraction for the MCP; preset/template system.

## 12. Success criteria

A C4D artist can, with no Cavalry connection knowledge: select an object → make a Grid Cloner → add a Random Effector that randomizes rotation → drop a Spherical Field so the randomization only happens inside a sphere — entirely from the panel, producing a clean, correctly-wired native Cavalry scene, with the Selection panel reflecting the full Cloner → Effector → Field chain.
