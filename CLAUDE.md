# CLAUDE.md — Cavalry MoGraph panel

A Cinema 4D-style dockable Script UI panel for Cavalry. This file is the **playbook for abstracting new presets from example Cavalry scenes fast**. General Cavalry-dev practice (dual-env modules, the Stallion bridge, the silent-failure discipline) lives in the **`cavalry-dev` skill** — read it once; this file is the project-specific accelerator. Runtime `api.*` rigging recipes live in the **`cavalry-composer` skill**.

> **The prime directive: discover, then build.** Never guess Cavalry strings (attr paths, generator names, enum ints). They fail *silently* — `connect`/`set`/`setGenerator` return success and drive nothing. Probe the live app first; only then encode. Every fact in the "Verified API facts" table below was confirmed live and cost real time to find — trust it instead of re-deriving.

---

## The mission: example scene → reusable preset

The user opens example scenes one at a time. We **don't** clone a whole scene as a preset (too specific to reuse). We find the **reusable segment** and ship it as a panel preset that:
- declares its **prerequisites** so the panel shows a live ✓/•/✗ checklist and **auto-stubs** what's missing, and
- sets up the required elements the smart way (alignment, clipping, hidden stencils) so the result actually looks right.

**Distill every scene through this lens** before writing code:

| Field | Question |
|---|---|
| **Produces** | The one reusable thing (e.g. "text revealed inside a shape") |
| **Prerequisites** | What the user must supply; for each: can we stub it? how do we detect it? |
| **Parameters** | User-facing controls to expose (often none for v1) |
| **Add-ons** | Optional layered effects → separate buttons, not baked in |
| **Mechanism** | The actual layer graph — **discovered from the file, never guessed** |

---

## Architecture & where things live

ES5-only in `src/` (Cavalry's engine is ES5: `var`, function expressions, string concat — no arrow/let/const/template/class). Tests run in Node and may use modern JS.

```
src/typemap.js   data registries (cloners, effectors, presets, textPresets, gridPresets, highlights, rigs, fields) — declarative
src/engine.js    UI-free imperative core: create layers, wire, validate/resolve prerequisites, build presets
src/selection.js introspect the current selection (describe())
src/panel.js      ui.* widget tree + refresh; renders the requirements checklist generically
src/selftest.js   in-app self-check that builds every recipe and asserts zero warnings
src/entry.js      Cavalry-only bootstrap (ui.show())
build.js          concatenates src/ in ORDER -> dist/MoGraph.js, node --check, --install to Scripts folder
test/mock-api.js  headless api/cavalry/ui mock for node:test
tools/probe_scene.js   dump the live scene graph (reusable for the NEXT scene)
tools/verify_reveal.js  concatenate src/ + run in the live app (verification template)
```

Concat/dependency order: **`typemap → engine → selection → panel → selftest → entry`**. A module may only use ones before it.

**Commands:**
```bash
node --test                 # unit tests — must be green before building
node build.js --install     # build + node --check + copy to %APPDATA%\Roaming\Cavalry\Scripts\MoGraph.js
                            #   then close/reopen the panel in Cavalry to hot-reload
node tools/probe_scene.js   # dump the live scene -> tools/scene_dump.json (Stallion must be open)
```

---

## Add a new preset — the 7-step loop

1. **Map the scene.** Open it in Cavalry. `node tools/probe_scene.js` → read `tools/scene_dump.json`. Note layer types, parent/children, `inputs`/`outputs` (connections), generators. Identify the reusable sub-graph.
2. **Read the real values.** Write a throwaway bridge probe (copy `tools/verify_reveal.js`'s POST skeleton) that `api.get`s the key nodes' attributes and dumps how list/array attrs are populated. Confirm exact strings.
3. **Distill** through the lens above. Decide roles, stub policy, mechanism.
4. **Build from scratch in a probe.** Recreate the recipe on stub layers via the bridge; verify every wire round-trips (source-side, like `_wire`) with **zero warnings**; clean up. This locks the exact `create/connect/set` sequence before it touches `src/`.
5. **Encode:**
   - `typemap.js` → add a `textPresets` entry (see model below).
   - `engine.js` → add `_buildX(res)`; register it in `buildTextPreset`'s dispatch; add any new `_stub` builders. Reuse `_fitTextToMask`, the mask-hide, `_wire`, `_create`/`_nextName`.
   - `panel.js` → usually nothing (the checklist + button loop is generic over `textPresets`). Only touch the stub-note block if you add new role ids.
   - `test/engine.<preset>.test.js` → assert role resolution, build wiring via the `drives()` helper, stubbing, and `Engine.warnings.length === 0`. Add a few checks to `selftest.js`.
   - `test/mock-api.js` → extend only if the recipe calls a new `api.*` method.
6. **Verify headless → install:** `node --test` green → `node build.js --install`.
7. **Live-verify the shipped code.** Bridge-run the concatenated `src/` (`tools/verify_reveal.js` pattern): build on real/stub layers, dump `getInConnectedAttributes` + `Engine.warnings`, clean up. For a visual check, render in an **isolated comp** (see facts table) and Read the PNG.

Most of a new preset is steps 1–4 (discovery). Steps 5–7 are mechanical because the prerequisite/checklist/stub/verify machinery already exists.

---

## The prerequisite model (declarative — this is the accelerator)

A `textPresets` entry. The panel renders the checklist and gates the build **generically** from this data — you rarely touch `panel.js`.

```js
{ key: "revealInShape", label: "Reveal Text in Shape", kind: "revealInShape", assign: "stack",
  hint: "<one line: the stack-role rule + what to select>",           // button tooltip
  requires: [
    { id: "fillIn", label: "Fill-in (top layer)", check: "textShape", stub: "loremText",
      missing: "Put a text layer (or any shape) on top as the fill-in." },
    { id: "mask",   label: "Mask (bottom layer)", check: "shape",     stub: "maskGlyph",
      missing: "Put a shape or letter below as the mask." }
  ] }
```

Per requirement: `id`, `label` (shown in the checklist with ✓/•/✗), `check` (a predicate name), `stub` (an `Engine._stub` builder name; omit ⇒ hard-required), `missing` (imperative gate message), `multi: true` (collects an **array** of layers).

**Role assignment (`assign: "stack"`)** — deterministic by **layer-stack order** (top = first role, bottom = last role), verified reorder-correct:
- **last single requirement = bottommost layer**, working upward; a `multi` requirement absorbs **all remaining (top) layers** as an array. So `[fillIn, mask]` → mask = bottom, fillIn = above; `[fills(multi), mask]` → mask = bottom, fills = everything above.
- A preset with a `multi` role **always** uses stack order. Others use it once `selection.length >= roles`; with fewer, they fall back to the `check` types (a lone shape → mask, a lone text → fill-in).

**Engine plumbing you reuse (don't reinvent):**
- `Engine.validateRequires(spec, selectionIds)` → `[{id,label,status:"ok"|"stub"|"missing", layerId|layerIds}]`. Pure; the panel calls it every selection change.
- `Engine.resolveRequires(spec, sel)` → `{values, stubbed, missing}`; creates stub layers for absent stubbable roles. `values[id]` is a layer id, or an **array** for `multi` roles.
- `Engine.buildTextPreset(key, sel)` → resolves, gates on `missing`, dispatches by `kind`. Returns `{ok:false, missing}` if a non-stubbable role is absent (panel shows the modal), else the build result.
- Checks: `_passesCheck(name,id)` / `_checkSpec(name)` (`textShape` spec 2, `shape` spec 1); `_isMaskShape(id)`. Stubs: `_stub(name)` (`loremText`, `maskGlyph`, `defaultCells`). Stack: `_byStackOrder(ids)`.

**Stub policy:** auto-stub anything fabricatable so **Build always yields a working result to customize**; hard-gate (no `stub`) only what we genuinely can't invent. The checklist makes the policy visible (• = will stub).

**Help-text conventions:** `label` = role + position (`"Fill-in (top layer)"`); `hint` states the stack rule and what to select; `missing` is an imperative one-liner. Stencil masks are **hidden** after building (`api.set(maskId,{hidden:true})`) so only the result shows.

---

## Verified API facts & silent-failure traps (live-confirmed)

| Topic | Fact |
|---|---|
| **Shape generators** | `api.setGenerator(id,"generator",name)` needs the **"Shape" suffix**: `"ellipseShape"`, `"rectangleShape"`, `"starShape"`, `"polygonShape"`. **Bare `"ellipse"`/`"rectangle"` silently fall back to a polygon (pentagon).** |
| **Distribution generators** | Duplicator distributions are a *different* family, set by `*Distribution` names (`gridDistribution`, `circleDistribution`, `randomDistribution`, `shapeEdgeDistribution`, `pathDistribution`) — **no** "Shape" suffix. Each has different attrs (grid: `count{x,y}`+`size{x,y}`; circle: scalar `count`+`radius`). |
| **Fill color** | `material.materialColor` (accepts a hex string `"#RRGGBB"`, stored ARGB 0-255). Not `fill.color`. |
| **List inputs** | `shapes`, `masks`, `deformers`, `falloffs`, `materialBehaviours`, `styleBehaviours` are **lists**. Connect to the **bare list name** (`"shapes"`, `"deformers"`, `"masks"`) — Cavalry auto-appends `.0/.1/.2`. **Do NOT** use `addArrayIndex`+`"shapes.N"` (fails for shapes). |
| **Value Array** | `array` is a `"list"` type; a fresh Value Array has **1** entry. Grow with `api.addArrayIndex(id,"array")`, then `api.set(id,{"array.0":100,"array.1":0})`. |
| **Hidden stencils** | `api.set(id,{"hidden":true})`. A hidden shape **still works** as an `isWithin` boundary AND as a `masks` clip. |
| **Reveal mechanism** | per-glyph opacity mask: `subMesh`(`levels{3,3}`,`levelMode 3`,`indexMode 0`,`opacityMode 0`,`useIndex true`) parented to the body; `isWithin`(`invert true`, `inputShape←mask`); `valueArray`[`array.0`=100 visible, `array.1`=0 hidden]. Wire: mask→`isWithin.inputShape`, isWithin→`valueArray.arrayIndex`, valueArray→`subMesh.shapeOpacity`, subMesh→`body.deformers`. |
| **Highlight words** | recolour/bold matched words on **any** textShape via native behaviours. Colour = `applyTextMaterial`(`regex "(word)"` capture group, `mode 0`, `indexMode 2`, `material.materialColor` **accepts a hex string**) → `text.materialBehaviours`. Bold = `applyTypeface`(same `regex`/`mode`/`indexMode`, `font {font,style}` — keep the body family, change weight) → `text.styleBehaviours`. Both are LIST inputs (auto-indexed). Treat the user's word as **literal**: regex-escape it before wrapping in `(...)`. |
| **ColorChip widget** | `ui.ColorChip` ctor takes **0 args** and uses **`setColor(hex)`/`getColor()`** — **NOT** `setValue`/`getValue` (those don't exist on it; live-confirmed, contradicting the generic widget doc). `getColor()` returns lowercase hex. `LineEdit` is fine: `setText`/`getText`/`setPlaceholder`. |
| **Per-copy duplicator `shapeId`** | A duplicator with multiple shapes **cycles them by copy index** (a checkerboard in 2D). Driving `shapeId` per-copy by a region is **NOT** a simple kernel: `isWithin→numberRange→shapeId`, a `value` effector + falloff, `useIndex`, and parenting the effector all yield the same uniform/checker result from scratch (the value reaches `shapeId` as a constant). The BLOXEL template makes it per-copy by computing every copy's position through ~10 helper nodes. **Reliable region shape-swap = two aligned grids + a mask clip (next row), not `shapeId`.** |
| **Region shape-swap (two-grid)** | Two grid duplicators with the **same** `count`/`size`/`position`: a base shape tiled everywhere + a region shape tiled in the same grid but **clipped to the mask** (`mask → regionDup.masks`) and drawn **on top**. Since `api.reorder(a,b)` moves `a` BELOW `b` (docs), put the BASE under the region: **`api.reorder(baseDup, regionDup)`** — else the base cells hide the swap. Inside the mask you see the region shape; outside, the base. Render-confirmed against both orderings. |
| **Falloff vs isWithin attrs** | A falloff's `id` does **not** feed `numberRange.value` (falloffs drive only via an effector's `falloffs` list). A shape-type falloff's input is **`inputShapes`** (plural list); `isWithin`'s is **`inputShape`** (singular). |
| **Boolean (hole) layer** | `boolean` has only `{clippingShapes, id}` — no `booleanType` enum. Subtract by connecting the hole shape → `boolean.clippingShapes` (auto-indexed list). *Making the clipped hole render transparent still needs discovery — the square-with-hole stub is deferred.* |
| **Clip a layer to a shape** | `mask → layer.masks` = alpha clip to the mask outline (clean, per-pixel; great for clipping a duplicator). |
| **Fit text to a shape** | textShape `position` anchors at the box **top-left** (y-up): center on a mask via `{cx - w/2, cy + h/2}`. Set `autoWidth/autoHeight=false`, `textBoxSize={w,h}`, `horizontalAlignment/verticalAlignment=1` (centre/middle). Fill density ∝ amount of text. |
| **Stack order** | `api.getCompLayers(true|false)` index **0 = TOP** of stack (reorder-confirmed; `false` includes nested). `api.reorder(a,b)` = move `a` UNDER `b`. **Don't infer stack from creation order** — programmatic insertion position is ambiguous; `reorder` explicitly in tests. |
| **Bounding box** | `api.getBoundingBox(id, worldSpace=true)` → `{x,y,width,height,centre{x,y},left,right,top,bottom}`. |
| **Isolated render** | `api.createComp(name)` → `api.setActiveComp(comp)` → build → `api.renderPNGFrame(path, scalePercent)` → restore `setActiveComp(orig)` → `deleteLayer(comp)`. Read the PNG to eyeball a result without polluting the user's scene. |
| **Verify every wire** | `Engine._wire(from,fromAttr,to,toAttr,force)` connects then reads back from the **source** side (`getOutConnections`) and pushes to `Engine.warnings` on silent failure. Assert `warnings.length === 0`. List slots auto-index, so "it connected" ≠ "it drives" — always read back. |
| **`isWithin` evaluates at the duplicator CENTER, not per-copy** | Connecting `isWithin → numberRange → shapeId` gives a uniform value for ALL copies — even with `sortDistribution` + `useIndex:true`. The BLOXEL scene's per-copy swap requires `shapePosition.x/y` to be explicitly driven with each copy's world position (via a `getVector`/`value2`/`round` animation chain). For a static grid, the reliable path is the **two-grid mask-clip** (see "Region shape-swap" row). |
| **`sortDistribution` nesting** | `api.setGenerator(dup,"generator","sortDistribution")` + `api.setGenerator(dup,"generator.input","gridDistribution")` gives a nested distribution. Inner grid attrs are accessed with the `generator.input.*` prefix: `generator.input.count`, `generator.input.size`, `generator.input.distributionMode`. |

---

## Shipped presets (reference implementations)

- **Reveal Text in Shape** (`kind:"revealInShape"`, `_buildRevealInShape`): the reveal mechanism above + `_fitTextToMask` + hide mask. Roles: top = fill-in, bottom = mask.
- **Fill-in & Repeat** (`kind:"fillRepeat"`, `_buildFillRepeat`): grid `duplicator` of the fill shape(s) sized to the mask bbox, clipped via `mask→duplicator.masks`, mask hidden. Roles: `fills` (multi, all top layers) + `mask` (bottom). Use for sparse content (stars/squares) that should pack a shape.
- **Highlight Words** (Add-on, `Engine.highlightWords`/`boldWords`): the panel's first **parameterised** feature — not a `requires`-checklist preset. A new "Add-ons" panel section with `highlights.maxRows` word+colour rows (`LineEdit`+`ColorChip`, "Add Highlight" reveals the next), two buttons (colour, optional bold). Resolves the target text from the selection or auto-stubs a sample (`highlights.sampleText` contains the default words so a first click is visibly correct). Registry: `typemap.highlights`. The colour/bold mechanism is the "Highlight words" facts-table row.
- **Shape Swap Grid** (Grid FX, `kind:"shapeSwap"`, `_buildShapeSwap`): distilled from the **BLOXEL** template. Two aligned grids — base shape everywhere + region shape clipped to a mask — per the "Region shape-swap" facts row. Registry: `typemap.gridPresets` (same `requires`/`assign:"stack"`/checklist machinery as `textPresets`). Roles top→bottom: region shape, base shape, mask. The `requires`/checklist/stub system is now **generic over both registries**: `panel._buildReqSection` renders any group; `buildGridPreset` mirrors `buildTextPreset`. **Discovery lesson:** the obvious per-copy `shapeId` swap is a dead end (see facts table) — the two-grid mask-clip was the reliable path, found by render-probing from scratch.

The first two are thin (discovery was the work; ~30-line builders) because the prerequisite/stub/checklist machinery is shared. Highlight Words shows the **parameterised** path: pre-build a fixed set of rows (Cavalry builds layout once — reveal hidden rows instead of adding them) and collect their values at build time.

---

## Deferred / backlog

- **Highlight Words — possible follow-ups:** raw-regex toggle (currently literal-only); a per-row "remove"/reset; expose the bold weight (`Black` vs `Bold`) as a choice. None requested yet.
- **Highlight Words — possible follow-ups:** raw-regex toggle (currently literal-only); a per-row "remove"/reset; expose the bold weight (`Black` vs `Bold`) as a choice. None requested yet.
- **Image-cloner generator bug:** `_buildImageCloner` uses bare `"ellipse"`/`"rectangle"` → silently polygons. Fix to `"ellipseShape"`/`"rectangleShape"`.

---

## Gotchas specific to this codebase

- **ES5 only in `src/`** (tests can use modern JS).
- **Panel `_suspend` guard:** programmatic widget updates fire `onValueChanged`; set `Panel._suspend` during refresh to avoid loops.
- **`setHidden` is widgets/`Container` only** — wrap a hideable row in a `ui.Container`.
- **Panel tests** pass a `spyEngine` lacking the new methods; `_refreshTextPresets` guards on `typeof Panel.engine.validateRequires === "function"`. Write checklist tests with the **real** `Engine` (`Panel.build(Engine)`).
- **Mock list inputs:** `test/mock-api.js` appends for `LIST_INPUTS` and last-wins otherwise — keep that set in sync with real list attrs, or multi-connect tests will lie.
- **Persistent project memory** lives in `C:\Users\madei\.claude\projects\E--DEV-LOCAL-Cavalry4D\memory\` — see `preset-abstraction-initiative.md` for the running state of this work.
