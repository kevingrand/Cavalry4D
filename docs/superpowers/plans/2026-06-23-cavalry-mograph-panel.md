# Cavalry MoGraph Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dockable Cavalry Script UI panel that presents a Cinema 4D MoGraph workflow (Cloner / Effectors / Fields) while creating and auto-wiring native Cavalry layers.

**Architecture:** Source is split into small UI-free logic modules (`TypeMap`, `Engine`, `Selection`) plus UI modules (`Panel`, `entry`, `selftest`). Logic modules talk only to the global `api`/`cavalry` objects, so they are unit-tested in plain Node with a **mock `api`** (no Cavalry needed). A tiny `build.js` concatenates `src/*.js` into the single deliverable `dist/MoGraph.js` that Cavalry hot-loads.

**Tech Stack:** Plain ES5-compatible JavaScript (Cavalry's JS sandbox), Node 18+ built-in `node:test` + `node:assert/strict` for tests, no third-party dependencies.

## Global Constraints

- **Cavalry JS dialect:** ES5-safe. Use `var`, function expressions, no arrow functions / `let` / `const` / template literals / optional chaining in `src/` (Cavalry's engine is conservative; match the style of `MIG_Cavalry_Toolkit.js`). Test files (`test/`) run in Node and may use modern JS.
- **No third-party runtime or test dependencies.** Tests use only `node:test` and `node:assert/strict`. Node 18+ required.
- **Module wrapper (every file in `src/` except `entry.js` uses this exact pattern):**
  ```js
  ;(function (root, factory) {
    var mod = factory(root);
    root.MG = root.MG || {};
    root.MG.<NAME> = mod;
    if (typeof module !== "undefined" && module.exports) module.exports = mod;
  })(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
    "use strict";
    if (typeof require !== "undefined") { try { require("./<dependency>"); } catch (e) {} } // only if this module depends on another MG module
    // ... module body; reference root.MG.TypeMap and the global api/cavalry/ui at CALL time ...
    return <NAME>;
  });
  ```
  In Cavalry, `module`/`require` are undefined so those branches are skipped and the modules build up `globalThis.MG.*` in concatenation order. In Node, `require("../src/engine")` returns the module and its side effect also populates `global.MG`.
- **Namespace:** everything hangs off the global `MG` object: `MG.TypeMap`, `MG.Engine`, `MG.Selection`, `MG.Panel`, `MG.selftest`.
- **Cavalry attribute strings are centralized** in `MG.TypeMap.paths` and the per-type config. Several are best-known-but-unverified (see spec §10: `docs/superpowers/specs/2026-06-23-cavalry-mograph-panel-design.md`). The in-app self-test (Task 12) is what confirms them live; if a string is wrong, fix it in `TypeMap` AND the affected test together.
- **Verify every connection.** `Engine._wire` calls `api.connect` then `api.getInConnection` and pushes a warning to `Engine.warnings` on mismatch (Cavalry fails silently otherwise).
- **Commit after every task** with a `feat:`/`test:`/`chore:` message.

---

## File structure

```
Cavalry4D/
├─ package.json            # scripts: test, build; no deps
├─ build.js               # concat src/*.js -> dist/MoGraph.js (+ optional --install)
├─ src/
│  ├─ typemap.js          # MG.TypeMap: cloners, effectors, fields, paths, XFORM, defaults
│  ├─ engine.js           # MG.Engine: createCloner, addEffector, setEffectorChannels, addField
│  ├─ selection.js        # MG.Selection: describe(layerId) via graph introspection
│  ├─ panel.js            # MG.Panel: build(engine), refresh(selectionIds)
│  ├─ selftest.js         # MG.selftest(): runs recipes against global api, asserts, returns report
│  └─ entry.js            # builds panel, registers callbacks, ui.show()
├─ dist/
│  └─ MoGraph.js          # generated deliverable (git-ignored)
├─ test/
│  ├─ mock-api.js         # makeApi(), makeCavalry(), makeUi()
│  ├─ typemap.test.js
│  ├─ engine.cloner.test.js
│  ├─ engine.effector.test.js
│  ├─ engine.channels.test.js
│  ├─ engine.field.test.js
│  ├─ selection.test.js
│  ├─ panel.test.js
│  └─ selftest.test.js
└─ docs/superpowers/...    # spec + this plan
```

---

## Task 1: Scaffolding, build, and mock harness

**Files:**
- Create: `package.json`, `build.js`, `.gitignore`, `test/mock-api.js`
- Create: `src/typemap.js` (placeholder that the build can pick up)
- Test: `test/mock-api.test.js`

**Interfaces:**
- Produces: `makeApi(opts) -> api` (recording mock), `makeCavalry() -> cavalry`, `makeUi() -> ui` from `test/mock-api.js`. `build.js` produces `dist/MoGraph.js`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "cavalry-mograph",
  "version": "0.1.0",
  "private": true,
  "description": "Cinema 4D-style MoGraph panel for Cavalry",
  "scripts": {
    "test": "node --test",
    "build": "node build.js"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 3: Write `test/mock-api.js`** (the recording mock used by every logic test)

```js
"use strict";

function makeApi(opts) {
  opts = opts || {};
  var counters = {};
  var layers = {};
  var conns = [];
  var selection = (opts.selection || []).slice();

  function removeInput(to, toAttr) {
    for (var i = conns.length - 1; i >= 0; i--) {
      if (conns[i].to === to && conns[i].toAttr === toAttr) conns.splice(i, 1);
    }
  }

  var api = {
    _layers: layers,
    _conns: conns,
    create: function (type, name) {
      counters[type] = (counters[type] || 0) + 1;
      var id = type + "#" + counters[type];
      layers[id] = { type: type, name: name || id, attrs: {}, parent: null };
      return id;
    },
    deleteLayer: function (id) { delete layers[id]; },
    set: function (id, obj) {
      var l = layers[id]; if (!l) return;
      for (var k in obj) if (obj.hasOwnProperty(k)) l.attrs[k] = obj[k];
    },
    get: function (id, attr) { return layers[id] ? layers[id].attrs[attr] : undefined; },
    setGenerator: function (id, attr, type) { if (layers[id]) layers[id].attrs["__gen:" + attr] = type; },
    getCurrentGeneratorType: function (id, attr) { return layers[id] ? layers[id].attrs["__gen:" + attr] : undefined; },
    addDynamic: function (id, attr) { if (layers[id]) layers[id].attrs[attr] = layers[id].attrs[attr] || 0; },
    parent: function (child, parent) { if (layers[child]) layers[child].parent = parent; },
    getParent: function (id) { return layers[id] ? layers[id].parent : null; },
    connect: function (from, fromAttr, to, toAttr) {
      removeInput(to, toAttr);
      conns.push({ from: from, fromAttr: fromAttr, to: to, toAttr: toAttr });
    },
    disconnect: function (from, fromAttr, to, toAttr) {
      for (var i = conns.length - 1; i >= 0; i--) {
        if (conns[i].from === from && conns[i].fromAttr === fromAttr && conns[i].to === to && conns[i].toAttr === toAttr) conns.splice(i, 1);
      }
    },
    disconnectInput: function (id, attr) { removeInput(id, attr); },
    getInConnection: function (id, attr) {
      for (var i = 0; i < conns.length; i++) if (conns[i].to === id && conns[i].toAttr === attr) return conns[i].from;
      return "";
    },
    getOutConnections: function (id, attr) {
      var r = [];
      for (var i = 0; i < conns.length; i++) if (conns[i].from === id && (attr === undefined || conns[i].fromAttr === attr)) r.push(conns[i].to);
      return r;
    },
    getInConnectedAttributes: function (id) {
      var r = []; for (var i = 0; i < conns.length; i++) if (conns[i].to === id) r.push(conns[i].toAttr); return r;
    },
    getOutConnectedAttributes: function (id) {
      var r = []; for (var i = 0; i < conns.length; i++) if (conns[i].from === id) r.push(conns[i].fromAttr); return r;
    },
    getLayerType: function (id) { return layers[id] ? layers[id].type : ""; },
    getNiceName: function (id) { return layers[id] ? layers[id].name : ""; },
    rename: function (id, name) { if (layers[id]) layers[id].name = name; },
    layerExists: function (id) { return !!layers[id]; },
    getSelection: function () { return selection.slice(); },
    setSelection: function (ids) { selection = ids.slice(); },
    select: function (ids) { selection = ids.slice(); },
    getAttributes: function (id) { return layers[id] ? Object.keys(layers[id].attrs) : []; },
    getActiveComp: function () { return "comp#1"; },
    getFrame: function () { return 0; }
  };
  return api;
}

function makeCavalry() {
  return {
    random: function (min, max) { return (min + max) / 2; },
    noise1d: function () { return 0; },
    noise2d: function () { return 0; },
    map: function (v, a, b, c, d) { return c; },
    lerp: function (a, b) { return a; },
    clamp: function (v) { return v; }
  };
}

function makeUi() {
  var widgets = [];
  function W(kind, args) { this.kind = kind; this.args = args || []; this.children = []; widgets.push(this); }
  var p = W.prototype;
  ["setToolTip","setFontSize","setTextColor","setBackgroundColor","setImage","setImageSize",
   "addStretch","addSeparator","addSpacing","setSpaceBetween","setMargins","setPlaceholder",
   "setMin","setMax","setType","setStep","setMinimumHeight","setAlignment","setSelectionMode",
   "showSearchBar","setRowsDeletable","setRowsRenamable","setRowsReorderable","clear","setDrawStroke"]
    .forEach(function (m) { p[m] = function () { return this; }; });
  p.add = function () { for (var i = 0; i < arguments.length; i++) this.children.push(arguments[i]); return this; };
  p.setText = function (t) { this.text = t; return this; };
  p.getText = function () { return this.text || ""; };
  p.setValue = function (v) { this.value = v; return this; };
  p.getValue = function () { return this.value; };
  p.addEntry = function (e) { (this.entries = this.entries || []).push(e); return this; };
  p.setModel = function (m) { this.model = m; return this; };
  p.getColor = function () { return this.color || "#000000"; };
  p.setColor = function (c) { this.color = c; return this; };
  p.click = function () { if (typeof this.onClick === "function") this.onClick(); };
  p.showMessage = function (m) { (ui._messages = ui._messages || []).push(m); };
  p.showQuestion = function () { return true; };
  p.showConfirmation = function () { return true; };

  var ui = { _widgets: widgets, _messages: [] };
  ["Button","Label","Checkbox","NumericField","DropDown","ColorChip","List","VLayout",
   "HLayout","FlowLayout","ScrollView","TabView","Modal","Draw","ImageButton","Container","Slider"]
    .forEach(function (kind) { ui[kind] = function () { return new W(kind, Array.prototype.slice.call(arguments)); }; });
  ui.getThemeColor = function () { return "#888888"; };
  ui.setTitle = function () {}; ui.setMinimumWidth = function () {}; ui.setMinimumHeight = function () {};
  ui.add = function () {}; ui.show = function () {}; ui.addStretch = function () {};
  ui.addCallbackObject = function (o) { ui._callbacks = o; };
  ui.scriptLocation = "/mock";
  return ui;
}

module.exports = { makeApi: makeApi, makeCavalry: makeCavalry, makeUi: makeUi };
```

- [ ] **Step 4: Write the failing test `test/mock-api.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi } = require("./mock-api.js");

test("mock api records connect and reports it via getInConnection", () => {
  const api = makeApi();
  const a = api.create("colorPlane", "A");
  const b = api.create("textShape", "B");
  api.connect(a, "id", b, "fill.color");
  assert.equal(api.getInConnection(b, "fill.color"), a);
  assert.equal(api.getLayerType(a), "colorPlane");
});

test("mock api enforces one input per attribute (last wins)", () => {
  const api = makeApi();
  const a = api.create("colorPlane", "A");
  const b = api.create("colorPlane", "B");
  const t = api.create("textShape", "T");
  api.connect(a, "id", t, "fill.color");
  api.connect(b, "id", t, "fill.color");
  assert.equal(api.getInConnection(t, "fill.color"), b);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/mock-api.test.js`
Expected: 2 tests pass (the mock is the unit under test here).

- [ ] **Step 6: Write `build.js`**

```js
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORDER = ["typemap.js", "engine.js", "selection.js", "panel.js", "selftest.js", "entry.js"];
const srcDir = path.join(__dirname, "src");
const distDir = path.join(__dirname, "dist");

function build() {
  fs.mkdirSync(distDir, { recursive: true });
  let out = "// GENERATED by build.js — do not edit. Edit src/*.js instead.\n\n";
  for (const f of ORDER) {
    const p = path.join(srcDir, f);
    if (!fs.existsSync(p)) continue;
    out += "// ===== " + f + " =====\n" + fs.readFileSync(p, "utf8") + "\n\n";
  }
  const target = path.join(distDir, "MoGraph.js");
  fs.writeFileSync(target, out, "utf8");
  console.log("Built " + target + " (" + out.length + " bytes)");

  if (process.argv.includes("--install")) {
    const dest = path.join(os.homedir(), "AppData", "Roaming", "Cavalry", "Scripts", "MoGraph.js");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(target, dest);
    console.log("Installed to " + dest);
  }
}
build();
```

- [ ] **Step 7: Create a placeholder `src/typemap.js` so the build has something to concat**

```js
;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.TypeMap = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return {};
});
```

- [ ] **Step 8: Run the build and verify output is valid JS**

Run: `node build.js && node --check dist/MoGraph.js`
Expected: prints `Built .../dist/MoGraph.js (...)`, and `node --check` exits 0 (no syntax errors).

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore build.js test/mock-api.js test/mock-api.test.js src/typemap.js
git commit -m "chore: scaffolding, build script, and mock-api test harness"
```

---

## Task 2: TypeMap module

**Files:**
- Modify: `src/typemap.js`
- Test: `test/typemap.test.js`

**Interfaces:**
- Produces: `MG.TypeMap` with:
  - `.XFORM = {position:"shapePosition", scale:"shapeScale", rotation:"shapeRotation"}`
  - `.paths = {shapeInput, generatorAttr, fieldSlot}`
  - `.cloners[mode] = {distribution, configure(api,id,opts), label}` for `grid|radial|linear|object`
  - `.effectors[type] = {layer, channelAttrs, fieldSlot, defaultChannels, label}` for `random|plain|step|shader`
  - `.fields[type] = {layer, configure(api,id), label}` for `linear|spherical|box|random`

- [ ] **Step 1: Write the failing test `test/typemap.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const TypeMap = require("../src/typemap.js");

test("XFORM maps logical channels to duplicator per-copy attrs", () => {
  assert.deepEqual(TypeMap.XFORM, { position: "shapePosition", scale: "shapeScale", rotation: "shapeRotation" });
});

test("cloner modes map to Cavalry distributions", () => {
  assert.equal(TypeMap.cloners.grid.distribution, "grid");
  assert.equal(TypeMap.cloners.radial.distribution, "circle");
  assert.equal(TypeMap.cloners.linear.distribution, "linear");
  assert.equal(TypeMap.cloners.object.distribution, "path");
});

test("effectors carry their source layer and field-slot strategy", () => {
  assert.equal(TypeMap.effectors.random.layer, "random");
  assert.equal(TypeMap.effectors.random.fieldSlot, null);            // needs combiner
  assert.equal(TypeMap.effectors.plain.layer, "value");
  assert.equal(TypeMap.effectors.plain.fieldSlot, "falloffs.0.id");
  assert.equal(TypeMap.effectors.step.layer, "stagger");
  assert.equal(TypeMap.effectors.shader.layer, "colorArray");
  assert.deepEqual(TypeMap.effectors.random.defaultChannels, { position: true, scale: false, rotation: true });
});

test("fields map to falloff variants", () => {
  assert.equal(TypeMap.fields.linear.layer, "falloff");
  assert.equal(TypeMap.fields.spherical.layer, "falloff");
  assert.equal(TypeMap.fields.box.layer, "falloff");
  assert.equal(TypeMap.fields.random.layer, "falloff");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/typemap.test.js`
Expected: FAIL — `TypeMap.XFORM` is undefined (placeholder returns `{}`).

- [ ] **Step 3: Replace `src/typemap.js` with the real module**

```js
;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.TypeMap = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var XFORM = { position: "shapePosition", scale: "shapeScale", rotation: "shapeRotation" };

  // Centralized Cavalry attribute strings. Some are best-known; the in-app
  // self-test (Task 12) confirms them live. If wrong, fix here + the test.
  var paths = {
    shapeInput: "shapes.0",       // toolkit used "shapes"; verify slot index
    generatorAttr: "generator",
    fieldSlot: "falloffs.0.id"
  };

  var cloners = {
    grid:   { distribution: "grid",   label: "Grid",
      configure: function (api, id) { api.set(id, { "generator.count.x": 5, "generator.count.y": 5, "generator.size.x": 120, "generator.size.y": 120 }); } },
    radial: { distribution: "circle", label: "Radial",
      configure: function (api, id) { api.set(id, { "generator.count": 12, "generator.radius": 300 }); } },
    linear: { distribution: "linear", label: "Linear",
      configure: function (api, id) { api.set(id, { "generator.count": 10, "generator.offset.x": 120 }); } },
    object: { distribution: "path",   label: "Object", needsTarget: true,
      configure: function (api, id) { api.set(id, { "generator.count": 20 }); } }
  };

  var effectors = {
    random: { layer: "random",     label: "Random Effector", channelAttrs: XFORM, fieldSlot: null,
              defaultChannels: { position: true, scale: false, rotation: true } },
    plain:  { layer: "value",      label: "Plain Effector",  channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: true, scale: false, rotation: false } },
    step:   { layer: "stagger",    label: "Step Effector",   channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: false, scale: false, rotation: true } },
    shader: { layer: "colorArray", label: "Shader Effector", channelAttrs: { color: "material.materialColor" }, fieldSlot: paths.fieldSlot,
              defaultChannels: { color: true } }
  };

  var fields = {
    linear:    { layer: "falloff", label: "Linear Field",    configure: function (api, id) { api.set(id, { "shapeType": "Linear" }); } },
    spherical: { layer: "falloff", label: "Spherical Field", configure: function (api, id) { api.set(id, { "shapeType": "Circle" }); } },
    box:       { layer: "falloff", label: "Box Field",       configure: function (api, id) { api.set(id, { "shapeType": "Rectangle" }); } },
    random:    { layer: "falloff", label: "Random Field",    configure: function (api, id) { api.set(id, { "shapeType": "Circle", "probability": 0.5 }); } }
  };

  return { XFORM: XFORM, paths: paths, cloners: cloners, effectors: effectors, fields: fields };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/typemap.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/typemap.js test/typemap.test.js
git commit -m "feat: TypeMap translation table (cloners, effectors, fields, paths)"
```

---

## Task 3: Engine core + createCloner

**Files:**
- Create: `src/engine.js`
- Test: `test/engine.cloner.test.js`

**Interfaces:**
- Consumes: `MG.TypeMap` (Task 2); global `api` (mock in tests).
- Produces:
  - `MG.Engine.warnings` (array of strings; reset by `Engine.resetWarnings()`)
  - `MG.Engine._create(type, niceName) -> id`
  - `MG.Engine._wire(fromId, fromAttr, toId, toAttr) -> bool` (connects, then verifies via `getInConnection`; pushes to `warnings` and returns false on mismatch)
  - `MG.Engine.createCloner(mode, selectionIds) -> { clonerId }`

- [ ] **Step 1: Write the failing test `test/engine.cloner.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");

function setup(selection) {
  global.api = makeApi({ selection: selection || [] });
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  return global.api;
}

test("createCloner makes a duplicator and connects the selection as its shape input", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  assert.equal(api.getLayerType(clonerId), "duplicator");
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "grid");
  assert.equal(api.getInConnection(clonerId, "shapes.0"), shape); // shape -> duplicator.shapes.0
  assert.equal(Engine.warnings.length, 0);
});

test("createCloner sets the right distribution per mode", () => {
  const api = setup();
  const s = api.create("basicShape", "S");
  assert.equal(api.getCurrentGeneratorType(Engine.createCloner("radial", [s]).clonerId, "generator"), "circle");
  assert.equal(api.getCurrentGeneratorType(Engine.createCloner("linear", [s]).clonerId, "generator"), "linear");
  assert.equal(api.getCurrentGeneratorType(Engine.createCloner("object", [s]).clonerId, "generator"), "path");
});

test("createCloner names the duplicator like C4D (Cloner N)", () => {
  const api = setup();
  const s = api.create("basicShape", "S");
  const { clonerId } = Engine.createCloner("grid", [s]);
  assert.match(api.getNiceName(clonerId), /^Cloner \d+$/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/engine.cloner.test.js`
Expected: FAIL — cannot find `../src/engine.js`.

- [ ] **Step 3: Write `src/engine.js` (core + createCloner only)**

```js
;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Engine = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }
  var counters = {};

  var Engine = {
    warnings: [],
    resetWarnings: function () { Engine.warnings = []; },

    _nextName: function (base) {
      counters[base] = (counters[base] || 0) + 1;
      return base + " " + counters[base];
    },

    _create: function (type, niceName) {
      var id = api.create(type, niceName || type);
      if (niceName) api.rename(id, niceName);
      return id;
    },

    // connect then verify; record a warning on silent failure
    _wire: function (fromId, fromAttr, toId, toAttr) {
      api.connect(fromId, fromAttr, toId, toAttr);
      var got = api.getInConnection(toId, toAttr);
      if (got !== fromId) {
        Engine.warnings.push("wire failed: " + fromId + "." + fromAttr + " -> " + toId + "." + toAttr + " (got '" + got + "')");
        return false;
      }
      return true;
    },

    createCloner: function (mode, selectionIds) {
      var spec = TM().cloners[mode];
      if (!spec) throw new Error("unknown cloner mode: " + mode);
      var clonerId = Engine._create("duplicator", Engine._nextName("Cloner"));
      api.setGenerator(clonerId, TM().paths.generatorAttr, spec.distribution);
      if (spec.configure) spec.configure(api, clonerId);
      var src = (selectionIds && selectionIds[0]) || null;
      if (src) Engine._wire(src, "id", clonerId, TM().paths.shapeInput);
      return { clonerId: clonerId };
    }
  };

  return Engine;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.cloner.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.cloner.test.js
git commit -m "feat: Engine core (_create/_wire) + createCloner with per-mode distribution"
```

---

## Task 4: Engine.addEffector — Random + Plain

**Files:**
- Modify: `src/engine.js`
- Test: `test/engine.effector.test.js`

**Interfaces:**
- Consumes: `MG.TypeMap.effectors`, `Engine._create`, `Engine._wire`.
- Produces: `MG.Engine.addEffector(type, clonerId, channels) -> { effectorId, comboIds: [] }`. `channels` optional; when omitted, uses `TypeMap.effectors[type].defaultChannels`. Connects the effector's `id` output to each enabled channel's duplicator attribute (`TypeMap.XFORM` / `channelAttrs`).

- [ ] **Step 1: Write the failing test `test/engine.effector.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");

function setup() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  return { api: global.api, clonerId };
}

test("Random effector drives its default channels (rotation + position) and not scale", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("random", clonerId);
  assert.equal(api.getLayerType(effectorId), "random");
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), effectorId);
  assert.equal(api.getInConnection(clonerId, "shapePosition"), effectorId);
  assert.equal(api.getInConnection(clonerId, "shapeScale"), "");
});

test("explicit channels override the defaults", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("random", clonerId, { position: false, scale: true, rotation: false });
  assert.equal(api.getInConnection(clonerId, "shapeScale"), effectorId);
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), "");
  assert.equal(api.getInConnection(clonerId, "shapePosition"), "");
});

test("Plain effector uses a value behaviour wired to position by default", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("plain", clonerId);
  assert.equal(api.getLayerType(effectorId), "value");
  assert.equal(api.getInConnection(clonerId, "shapePosition"), effectorId);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/engine.effector.test.js`
Expected: FAIL — `Engine.addEffector is not a function`.

- [ ] **Step 3: Add `addEffector` and a channel helper to `src/engine.js`** (insert inside the `Engine` object, before the closing `};`)

```js
    _channelTargets: function (type, channels) {
      var spec = TM().effectors[type];
      var use = channels || spec.defaultChannels;
      var targets = [];
      for (var name in spec.channelAttrs) {
        if (spec.channelAttrs.hasOwnProperty(name) && use[name]) targets.push(spec.channelAttrs[name]);
      }
      return targets;
    },

    addEffector: function (type, clonerId, channels) {
      var spec = TM().effectors[type];
      if (!spec) throw new Error("unknown effector type: " + type);
      var effectorId = Engine._create(spec.layer, Engine._nextName(spec.label));
      var targets = Engine._channelTargets(type, channels);
      for (var i = 0; i < targets.length; i++) Engine._wire(effectorId, "id", clonerId, targets[i]);
      return { effectorId: effectorId, comboIds: [] };
    },
```

(Add a trailing comma after the `createCloner` method's closing brace so the object stays valid.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.effector.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.effector.test.js
git commit -m "feat: Engine.addEffector for Random and Plain with channel selection"
```

---

## Task 5: Engine.addEffector — Step + Shader

**Files:**
- Modify: `test/engine.effector.test.js` (add cases)
- Modify: `src/engine.js` only if needed

**Interfaces:**
- Consumes/Produces: same `addEffector` signature. Step (`stagger`) and Shader (`colorArray`) must also wire through `addEffector` with no special-casing beyond `TypeMap` (Step → XFORM channels; Shader → color channel).

- [ ] **Step 1: Add failing tests to `test/engine.effector.test.js`**

```js
test("Step effector uses a stagger wired to rotation by default", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("step", clonerId);
  assert.equal(api.getLayerType(effectorId), "stagger");
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), effectorId);
});

test("Shader effector uses a colorArray wired to per-copy color", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("shader", clonerId);
  assert.equal(api.getLayerType(effectorId), "colorArray");
  assert.equal(api.getInConnection(clonerId, "material.materialColor"), effectorId);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/engine.effector.test.js`
Expected: FAIL on the two new cases (the shader color target wiring) IF `addEffector` does not already generalize. Because `_channelTargets` reads `channelAttrs` generically, Step should already pass; Shader should already pass too. If both pass immediately, that confirms the generic path — proceed. If Shader fails because `material.materialColor` isn't in `channelAttrs` iteration, fix below.

- [ ] **Step 3: Confirm generality (no code change expected)**

`_channelTargets` already iterates `spec.channelAttrs`, so Step and Shader work with no new code. If a failure appears, the cause is a typo in `TypeMap.effectors.shader.channelAttrs`; correct it there. Document the (expected) no-op:

```
// addEffector is fully data-driven via TypeMap.effectors[type].channelAttrs —
// Step and Shader need no special handling. This task is a guard test.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.effector.test.js`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.effector.test.js
git commit -m "test: cover Step and Shader effectors (data-driven addEffector)"
```

---

## Task 6: Engine.setEffectorChannels (the "Parameter tab")

**Files:**
- Modify: `src/engine.js`
- Test: `test/engine.channels.test.js`

**Interfaces:**
- Produces: `MG.Engine.setEffectorChannels(effectorId, clonerId, channels) -> void`. For each logical channel in `TypeMap.effectors`-style `channelAttrs` resolved for the effector's layer type, connect (`effectorId.id -> clonerId.<attr>`) when `channels[name]` is true, else disconnect that input. The effector's logical type is resolved from its Cavalry layer type via `Engine._effectorTypeOf(layerType)`.

- [ ] **Step 1: Write the failing test `test/engine.channels.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");

function setup() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId, { position: true, scale: false, rotation: true });
  return { api: global.api, clonerId, effectorId };
}

test("turning a channel off disconnects it; turning one on connects it", () => {
  const { api, clonerId, effectorId } = setup();
  Engine.setEffectorChannels(effectorId, clonerId, { position: false, scale: true, rotation: true });
  assert.equal(api.getInConnection(clonerId, "shapePosition"), "");        // turned off
  assert.equal(api.getInConnection(clonerId, "shapeScale"), effectorId);    // turned on
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), effectorId); // still on
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/engine.channels.test.js`
Expected: FAIL — `Engine.setEffectorChannels is not a function`.

- [ ] **Step 3: Add `_effectorTypeOf` and `setEffectorChannels` to `src/engine.js`**

```js
    _effectorTypeOf: function (layerType) {
      var fx = TM().effectors;
      for (var t in fx) if (fx.hasOwnProperty(t) && fx[t].layer === layerType) return t;
      return null;
    },

    setEffectorChannels: function (effectorId, clonerId, channels) {
      var type = Engine._effectorTypeOf(api.getLayerType(effectorId));
      if (!type) { Engine.warnings.push("setEffectorChannels: unknown effector " + effectorId); return; }
      var attrs = TM().effectors[type].channelAttrs;
      for (var name in attrs) {
        if (!attrs.hasOwnProperty(name)) continue;
        var target = attrs[name];
        if (channels[name]) Engine._wire(effectorId, "id", clonerId, target);
        else api.disconnectInput(clonerId, target);
      }
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.channels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.channels.test.js
git commit -m "feat: Engine.setEffectorChannels (live P/S/R channel toggling)"
```

---

## Task 7: Engine.addField — slot-based effectors (Plain/Step/Shader)

**Files:**
- Modify: `src/engine.js`
- Test: `test/engine.field.test.js`

**Interfaces:**
- Produces: `MG.Engine.addField(fieldType, effectorId, clonerId) -> { fieldId, extraIds: [] }`. When the effector's `TypeMap` `fieldSlot` is non-null, create the falloff, configure it, and wire `fieldId.id -> effectorId.<fieldSlot>`. (`clonerId` is accepted for the combiner path in Task 8; unused here.)

- [ ] **Step 1: Write the failing test `test/engine.field.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");

function setup(effectorType) {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector(effectorType, clonerId);
  return { api: global.api, clonerId, effectorId };
}

test("a field on a Plain effector wires into its falloff slot", () => {
  const { api, effectorId, clonerId } = setup("plain");
  const { fieldId } = Engine.addField("spherical", effectorId, clonerId);
  assert.equal(api.getLayerType(fieldId), "falloff");
  assert.equal(api.get(fieldId, "shapeType"), "Circle");
  assert.equal(api.getInConnection(effectorId, "falloffs.0.id"), fieldId);
});

test("field type sets the falloff shapeType (Linear/Box)", () => {
  const { api, effectorId, clonerId } = setup("step");
  assert.equal(api.get(Engine.addField("linear", effectorId, clonerId).fieldId, "shapeType"), "Linear");
  assert.equal(api.get(Engine.addField("box", effectorId, clonerId).fieldId, "shapeType"), "Rectangle");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/engine.field.test.js`
Expected: FAIL — `Engine.addField is not a function`.

- [ ] **Step 3: Add `addField` (slot path only) to `src/engine.js`**

```js
    addField: function (fieldType, effectorId, clonerId) {
      var fSpec = TM().fields[fieldType];
      if (!fSpec) throw new Error("unknown field type: " + fieldType);
      var fieldId = Engine._create(fSpec.layer, Engine._nextName(fSpec.label));
      if (fSpec.configure) fSpec.configure(api, fieldId);

      var eType = Engine._effectorTypeOf(api.getLayerType(effectorId));
      var slot = eType ? TM().effectors[eType].fieldSlot : null;
      if (slot) {
        Engine._wire(fieldId, "id", effectorId, slot);
        return { fieldId: fieldId, extraIds: [] };
      }
      // null slot (e.g. random) -> combiner path, implemented in Task 8
      return Engine._addFieldViaCombiner(fieldId, effectorId, clonerId);
    },
```

Also add a temporary stub so the file stays loadable until Task 8:

```js
    _addFieldViaCombiner: function (fieldId, effectorId, clonerId) {
      Engine.warnings.push("combiner path not yet implemented");
      return { fieldId: fieldId, extraIds: [] };
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.field.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.field.test.js
git commit -m "feat: Engine.addField for falloff-slot effectors (Plain/Step/Shader)"
```

---

## Task 8: Engine.addField — Random combiner path

**Files:**
- Modify: `src/engine.js` (replace `_addFieldViaCombiner`)
- Modify: `test/engine.field.test.js` (add cases)

**Interfaces:**
- Produces: real `_addFieldViaCombiner(fieldId, effectorId, clonerId)`. For each `XFORM` channel on `clonerId` currently driven by `effectorId`, insert a `math` combiner: `effectorId.id -> math.value`, `fieldId.id -> math.second`, set multiply, then `math.id -> clonerId.<channel>` (replacing the direct effector input). Returns `{ fieldId, extraIds: [<comboIds>] }`.

- [ ] **Step 1: Add failing tests to `test/engine.field.test.js`**

```js
test("a field on a Random effector inserts a multiply combiner per driven channel", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId, { position: false, scale: false, rotation: true });
  const api = global.api;

  const res = Engine.addField("spherical", effectorId, clonerId);
  assert.equal(res.extraIds.length, 1);                          // one combiner for the one driven channel
  const combo = res.extraIds[0];
  assert.equal(api.getLayerType(combo), "math");
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), combo);  // duplicator now driven by the combiner
  assert.equal(api.getInConnection(combo, "value"), effectorId);        // random into the combiner
  assert.equal(api.getInConnection(combo, "second"), res.fieldId);      // field into the combiner
  assert.equal(Engine.warnings.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/engine.field.test.js`
Expected: FAIL — combiner is still the stub (`extraIds` empty, warning present).

- [ ] **Step 3: Replace `_addFieldViaCombiner` in `src/engine.js`**

```js
    // Find which duplicator XFORM channels are currently driven by `effectorId`.
    _drivenChannels: function (effectorId, clonerId) {
      var out = [];
      var xf = TM().XFORM;
      for (var name in xf) {
        if (xf.hasOwnProperty(name) && api.getInConnection(clonerId, xf[name]) === effectorId) out.push(xf[name]);
      }
      return out;
    },

    _addFieldViaCombiner: function (fieldId, effectorId, clonerId) {
      var channels = Engine._drivenChannels(effectorId, clonerId);
      var extra = [];
      for (var i = 0; i < channels.length; i++) {
        var attr = channels[i];
        var combo = Engine._create("math", Engine._nextName("Field Mix"));
        api.set(combo, { "operation": "multiply" });   // verify operation attr/value live
        Engine._wire(effectorId, "id", combo, "value");
        Engine._wire(fieldId, "id", combo, "second");
        Engine._wire(combo, "id", clonerId, attr);      // replaces the direct effector input
        extra.push(combo);
      }
      return { fieldId: fieldId, extraIds: extra };
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.field.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.field.test.js
git commit -m "feat: Engine combiner path so fields can limit a Random effector"
```

---

## Task 9: Selection.describe (graph introspection)

**Files:**
- Create: `src/selection.js`
- Test: `test/selection.test.js`

**Interfaces:**
- Consumes: `MG.TypeMap`, global `api`.
- Produces: `MG.Selection.describe(layerId) -> { role, mode, effectors }` where:
  - `role` is `"cloner"`, `"effector"`, `"field"`, or `"other"`.
  - For a cloner: `mode` (string or null) and `effectors` = array of `{ id, type, channels: [attr...], fields: [{id,type}] }` discovered by reading `getInConnection` on each XFORM/color attr, then each effector's `falloffs.0.id`.

- [ ] **Step 1: Write the failing test `test/selection.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");
const Selection = require("../src/selection.js");

test("describe(cloner) reports its effectors and their fields", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const api = global.api;
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("plain", clonerId);     // value -> shapePosition
  Engine.addField("spherical", effectorId, clonerId);               // falloff -> value.falloffs.0.id

  const d = Selection.describe(clonerId);
  assert.equal(d.role, "cloner");
  assert.equal(d.effectors.length, 1);
  assert.equal(d.effectors[0].id, effectorId);
  assert.equal(d.effectors[0].type, "plain");
  assert.ok(d.effectors[0].channels.indexOf("shapePosition") >= 0);
  assert.equal(d.effectors[0].fields.length, 1);
  assert.equal(d.effectors[0].fields[0].type, "spherical");
});

test("describe(non-duplicator) returns role other/effector appropriately", () => {
  global.api = makeApi(); global.cavalry = makeCavalry();
  const api = global.api;
  const r = api.create("random", "Random Effector 1");
  assert.equal(Selection.describe(r).role, "effector");
  assert.equal(Selection.describe(api.create("ellipse", "x")).role, "other");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/selection.test.js`
Expected: FAIL — cannot find `../src/selection.js`.

- [ ] **Step 3: Write `src/selection.js`**

```js
;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Selection = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }

  function effectorTypeOf(layerType) {
    var fx = TM().effectors;
    for (var t in fx) if (fx.hasOwnProperty(t) && fx[t].layer === layerType) return t;
    return null;
  }
  function fieldTypeOf(fieldId) {
    var st = api.get(fieldId, "shapeType");
    if (api.get(fieldId, "probability") !== undefined && api.get(fieldId, "probability") !== null && st === "Circle") return "random";
    if (st === "Linear") return "linear";
    if (st === "Rectangle") return "box";
    if (st === "Circle") return "spherical";
    return "linear";
  }

  var Selection = {
    describe: function (layerId) {
      if (!layerId || !api.layerExists(layerId)) return { role: "other", mode: null, effectors: [] };
      var type = api.getLayerType(layerId);

      if (type === "duplicator") {
        var mode = api.getCurrentGeneratorType(layerId, TM().paths.generatorAttr) || null;
        var seen = {};
        var effectors = [];
        var allAttrs = [];
        var x; for (x in TM().XFORM) if (TM().XFORM.hasOwnProperty(x)) allAttrs.push(TM().XFORM[x]);
        allAttrs.push("material.materialColor");
        for (var i = 0; i < allAttrs.length; i++) {
          var attr = allAttrs[i];
          var src = api.getInConnection(layerId, attr);
          if (!src) continue;
          // unwrap a combiner (math) back to the real effector on .value
          var realType = api.getLayerType(src);
          var effId = src;
          if (realType === "math") { effId = api.getInConnection(src, "value") || src; realType = api.getLayerType(effId); }
          if (seen[effId]) { seen[effId].channels.push(attr); continue; }
          var rec = { id: effId, type: effectorTypeOf(realType), channels: [attr], fields: [] };
          var fSrc = api.getInConnection(effId, "falloffs.0.id");
          if (!fSrc) { // maybe via combiner.second
            var c2 = api.getInConnection(src, "second");
            if (c2) fSrc = c2;
          }
          if (fSrc) rec.fields.push({ id: fSrc, type: fieldTypeOf(fSrc) });
          seen[effId] = rec;
          effectors.push(rec);
        }
        return { role: "cloner", mode: mode, effectors: effectors };
      }

      if (effectorTypeOf(type)) return { role: "effector", mode: null, effectors: [] };
      if (type === "falloff") return { role: "field", mode: null, effectors: [] };
      return { role: "other", mode: null, effectors: [] };
    }
  };

  return Selection;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/selection.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/selection.js test/selection.test.js
git commit -m "feat: Selection.describe graph introspection for the Selection panel"
```

---

## Task 10: Panel scaffold (renders from TypeMap)

**Files:**
- Create: `src/panel.js`
- Test: `test/panel.test.js`

**Interfaces:**
- Consumes: `MG.TypeMap`, global `ui` (mock in tests), an injected `engine` (spy in tests).
- Produces: `MG.Panel.build(engine) -> rootLayout`. Every action button is tagged with `btn._action` (e.g. `"cloner:grid"`, `"effector:random"`, `"field:spherical"`) so tests and the click handlers can find it. `MG.Panel._buttons` holds all tagged action widgets after `build`.

- [ ] **Step 1: Write the failing test `test/panel.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeUi } = require("./mock-api.js");
require("../src/typemap.js");
const Panel = require("../src/panel.js");

function spyEngine() {
  const calls = [];
  return {
    calls,
    createCloner: (...a) => (calls.push(["createCloner", ...a]), { clonerId: "duplicator#1" }),
    addEffector: (...a) => (calls.push(["addEffector", ...a]), { effectorId: "random#1", comboIds: [] }),
    addField: (...a) => (calls.push(["addField", ...a]), { fieldId: "falloff#1", extraIds: [] }),
    setEffectorChannels: (...a) => calls.push(["setEffectorChannels", ...a])
  };
}

test("build creates a tagged action button for every cloner mode, effector, and field", () => {
  global.ui = makeUi();
  Panel.build(spyEngine());
  const actions = Panel._buttons.map(b => b._action).sort();
  assert.ok(actions.includes("cloner:grid"));
  assert.ok(actions.includes("cloner:object"));
  assert.ok(actions.includes("effector:random"));
  assert.ok(actions.includes("effector:shader"));
  assert.ok(actions.includes("field:spherical"));
  assert.ok(actions.includes("field:random"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/panel.test.js`
Expected: FAIL — cannot find `../src/panel.js`.

- [ ] **Step 3: Write `src/panel.js` (scaffold + button tagging only)**

```js
;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Panel = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }

  var COLORS = { clone: "#8BC34A", effector: "#9D7CD8", field: "#4A90D9" };

  var Panel = {
    _buttons: [],
    engine: null,

    _actionButton: function (label, action, color) {
      var b = new ui.Button(label);
      b.setBackgroundColor(color);
      b._action = action;
      Panel._buttons.push(b);
      return b;
    },

    build: function (engine) {
      Panel.engine = engine;
      Panel._buttons = [];
      var rootLayout = new ui.VLayout();
      rootLayout.setSpaceBetween(6);
      rootLayout.setMargins(6, 6, 6, 6);

      // Clone
      rootLayout.addSeparator("Clone");
      var cloneRow = new ui.HLayout();
      var m; for (m in TM().cloners) if (TM().cloners.hasOwnProperty(m)) cloneRow.add(Panel._actionButton(TM().cloners[m].label, "cloner:" + m, COLORS.clone));
      rootLayout.add(cloneRow);

      // Effectors
      rootLayout.addSeparator("Effectors");
      var fxRow = new ui.FlowLayout(4, 4);
      var e; for (e in TM().effectors) if (TM().effectors.hasOwnProperty(e)) fxRow.add(Panel._actionButton(TM().effectors[e].label, "effector:" + e, COLORS.effector));
      rootLayout.add(fxRow);

      // Fields
      rootLayout.addSeparator("Fields");
      var flRow = new ui.FlowLayout(4, 4);
      var f; for (f in TM().fields) if (TM().fields.hasOwnProperty(f)) flRow.add(Panel._actionButton(TM().fields[f].label, "field:" + f, COLORS.field));
      rootLayout.add(flRow);

      // Selection panel (populated in Task 12)
      rootLayout.addSeparator("Selection");
      Panel._selectionInfo = new ui.Label("No selection");
      rootLayout.add(Panel._selectionInfo);

      Panel._wireButtons();
      return rootLayout;
    },

    _wireButtons: function () { /* implemented in Task 11 */ }
  };

  return Panel;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/panel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/panel.js test/panel.test.js
git commit -m "feat: Panel scaffold rendering color-coded actions from TypeMap"
```

---

## Task 11: Panel button wiring + selection guards

**Files:**
- Modify: `src/panel.js`
- Modify: `test/panel.test.js`

**Interfaces:**
- Produces: `Panel._wireButtons()` sets each tagged button's `onClick` to call the injected engine using the **current Cavalry selection** (`api.getSelection()`), with guards:
  - `cloner:<mode>` → `engine.createCloner(mode, selection)`; if selection empty, show modal "Select an object to clone." and do nothing.
  - `effector:<type>` → requires a selected duplicator (or an effector, to stack on its cloner); else modal "Select a Cloner first."; calls `engine.addEffector(type, clonerId)`.
  - `field:<type>` → requires a selected effector; else modal "Select an Effector first." (offers nothing more in v1); calls `engine.addField(type, effectorId, clonerId)`.
- Adds `MG.Panel._modal` (a `ui.Modal`) and `Panel._resolveCloner(selId)` / `Panel._resolveEffector(selId)` helpers using `MG.Selection`.

- [ ] **Step 1: Add failing tests to `test/panel.test.js`**

```js
const { makeApi, makeCavalry } = require("./mock-api.js");
const Engine = require("../src/engine.js");
require("../src/selection.js");

test("clicking a cloner button with a shape selected calls engine.createCloner", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "cloner:grid").click();
  assert.deepEqual(eng.calls[0], ["createCloner", "grid", [shape]]);
});

test("clicking an effector button with nothing selected shows a modal and does not call engine", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "effector:random").click();
  assert.equal(eng.calls.length, 0);
  assert.ok(global.ui._messages.length >= 1);
});

test("clicking an effector button with a duplicator selected calls engine.addEffector", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  global.api.setSelection([clonerId]);
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "effector:random").click();
  assert.deepEqual(eng.calls[0], ["addEffector", "random", clonerId]);
});
```

(Note: `Engine.createCloner` here builds real layers in the mock so the panel can resolve the selection; the spy `eng` only records the panel's own calls.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/panel.test.js`
Expected: FAIL — clicks do nothing (`_wireButtons` is a stub), so `eng.calls` is empty / no modal.

- [ ] **Step 3: Implement `_wireButtons` and resolvers in `src/panel.js`** (replace the stub `_wireButtons` and add helpers)

```js
    _modal: null,

    _resolveCloner: function (selId) {
      if (!selId) return null;
      var d = root.MG.Selection.describe(selId);
      if (d.role === "cloner") return selId;
      if (d.role === "effector") {
        var outs = api.getOutConnections(selId, "id");
        for (var i = 0; i < outs.length; i++) if (api.getLayerType(outs[i]) === "duplicator") return outs[i];
      }
      return null;
    },

    _resolveEffector: function (selId) {
      if (!selId) return null;
      var d = root.MG.Selection.describe(selId);
      if (d.role === "effector") return selId;
      return null;
    },

    _wireButtons: function () {
      if (!Panel._modal) Panel._modal = new ui.Modal();
      Panel._buttons.forEach(function (btn) {
        var parts = btn._action.split(":");
        var kind = parts[0], name = parts[1];
        btn.onClick = function () {
          var sel = api.getSelection();
          var first = sel[0] || null;
          if (kind === "cloner") {
            if (!first) { Panel._modal.showMessage("Select an object to clone."); return; }
            Panel.engine.createCloner(name, sel);
          } else if (kind === "effector") {
            var clonerId = Panel._resolveCloner(first);
            if (!clonerId) { Panel._modal.showMessage("Select a Cloner first."); return; }
            Panel.engine.addEffector(name, clonerId);
          } else if (kind === "field") {
            var effId = Panel._resolveEffector(first);
            if (!effId) { Panel._modal.showMessage("Select an Effector first."); return; }
            var cloner = Panel._resolveCloner(effId);
            Panel.engine.addField(name, effId, cloner);
          }
          if (typeof Panel.refresh === "function") Panel.refresh(api.getSelection());
        };
      });
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/panel.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/panel.js test/panel.test.js
git commit -m "feat: Panel button-to-Engine wiring with selection guards"
```

---

## Task 12: Selection panel refresh + entry + selftest + build/install

**Files:**
- Modify: `src/panel.js` (add `refresh`)
- Create: `src/selftest.js`, `src/entry.js`, `README.md`
- Test: `test/selftest.test.js`, add a case to `test/panel.test.js`

**Interfaces:**
- Produces:
  - `MG.Panel.refresh(selectionIds)` — updates `Panel._selectionInfo` label text from `MG.Selection.describe(selectionIds[0])`.
  - `MG.selftest() -> { passed, failed, warnings, details: [...] }` — builds one of every recipe against the global `api`, asserting via `getInConnection`; usable in Cavalry's JS console and as a Node integration test against the mock.
  - `src/entry.js` — `MG.start()` builds the panel with the real `MG.Engine`, registers an `onSelectionChanged` callback that calls `Panel.refresh`, and calls `ui.show()`. Guarded so it only auto-runs in Cavalry (`typeof ui !== "undefined" && typeof module === "undefined"`).

- [ ] **Step 1: Write `src/selftest.js`**

```js
;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.selftest = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); require("./engine"); } catch (e) {} }

  return function selftest() {
    var E = root.MG.Engine;
    var details = [], passed = 0, failed = 0;
    function check(label, cond) { if (cond) { passed++; } else { failed++; } details.push((cond ? "PASS " : "FAIL ") + label); }

    E.resetWarnings();
    var shape = api.create("basicShape", "SelftestShape");

    var modes = ["grid", "radial", "linear", "object"];
    for (var i = 0; i < modes.length; i++) {
      var c = E.createCloner(modes[i], [shape]);
      check("cloner " + modes[i], api.getLayerType(c.clonerId) === "duplicator");
    }
    var base = E.createCloner("grid", [shape]).clonerId;

    var rnd = E.addEffector("random", base).effectorId;
    check("random -> rotation", api.getInConnection(base, "shapeRotation") === rnd);
    var pln = E.addEffector("plain", base).effectorId;
    check("plain -> position", api.getInConnection(base, "shapePosition") === pln);

    var f = E.addField("spherical", pln, base);
    check("field -> plain falloff slot", api.getInConnection(pln, "falloffs.0.id") === f.fieldId);

    var base2 = E.createCloner("grid", [shape]).clonerId;
    var rnd2 = E.addEffector("random", base2, { rotation: true, position: false, scale: false }).effectorId;
    var fc = E.addField("box", rnd2, base2);
    check("random combiner inserted", fc.extraIds.length === 1 && api.getLayerType(fc.extraIds[0]) === "math");

    return { passed: passed, failed: failed, warnings: E.warnings.slice(), details: details };
  };
});
```

- [ ] **Step 2: Write the failing integration test `test/selftest.test.js`**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
require("../src/engine.js");
const selftest = require("../src/selftest.js");

test("selftest passes every recipe against the mock api with no warnings", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  const report = selftest();
  assert.equal(report.failed, 0, report.details.join("\n"));
  assert.equal(report.warnings.length, 0, report.warnings.join("\n"));
  assert.ok(report.passed >= 8);
});
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `node --test test/selftest.test.js`
Expected: FAIL first if `src/selftest.js` not yet saved; after Step 1+2 are in place it should PASS. If it FAILS on a specific recipe, that is a real wiring bug — fix the Engine/TypeMap, not the test.

- [ ] **Step 4: Add `Panel.refresh` to `src/panel.js`** (replace the placeholder reference)

```js
    refresh: function (selectionIds) {
      var id = selectionIds && selectionIds[0];
      if (!id) { Panel._selectionInfo.setText("No selection"); return; }
      var d = root.MG.Selection.describe(id);
      if (d.role === "cloner") {
        var txt = "Cloner (" + (d.mode || "?") + ") · " + d.effectors.length + " effector(s)";
        for (var i = 0; i < d.effectors.length; i++) {
          var ef = d.effectors[i];
          txt += "\n• " + (ef.type || "?") + (ef.fields.length ? " → " + ef.fields[0].type : "");
        }
        Panel._selectionInfo.setText(txt);
      } else {
        Panel._selectionInfo.setText(d.role + " selected");
      }
    },
```

Add `require("../src/selection.js")` usage is already available via `root.MG.Selection`; ensure `entry.js` / build order loads `selection.js` before `panel.js` (it does — see `build.js` ORDER).

- [ ] **Step 5: Add the refresh test to `test/panel.test.js`**

```js
test("refresh summarizes the selected cloner and its effectors", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  Engine.addEffector("plain", clonerId);
  Panel.build(spyEngine());
  Panel.refresh([clonerId]);
  assert.match(Panel._selectionInfo.getText(), /Cloner \(grid\)/);
  assert.match(Panel._selectionInfo.getText(), /plain/);
});
```

Run: `node --test test/panel.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Write `src/entry.js`** (no module wrapper — this is the bootstrap)

```js
"use strict";
// Entry point — only runs inside Cavalry (ui present, no Node module system).
if (typeof ui !== "undefined" && typeof module === "undefined") {
  var MG = (typeof globalThis !== "undefined" ? globalThis : this).MG;

  ui.setTitle("MoGraph");
  ui.setMinimumWidth(300);

  var rootLayout = MG.Panel.build(MG.Engine);
  ui.add(rootLayout);

  function Callbacks() {
    this.onSelectionChanged = function () { MG.Panel.refresh(api.getSelection()); };
  }
  ui.addCallbackObject(new Callbacks());
  MG.Panel.refresh(api.getSelection());
  ui.show();
}
```

- [ ] **Step 7: Write `README.md`** (install + dev instructions)

```markdown
# Cavalry MoGraph Panel

A Cinema 4D-style MoGraph panel for Cavalry. Create Cloners, Effectors, and
Fields with one click — they build and auto-wire native Cavalry layers.

## Install
1. `node build.js --install` — builds `dist/MoGraph.js` and copies it to
   `%APPDATA%\Cavalry\Scripts\MoGraph.js`.
2. In Cavalry: Scripts menu → MoGraph. Dock the panel where you like.

## Develop
- Edit files in `src/`. Run `npm test` (`node --test`) for the logic suite.
- `node build.js` regenerates `dist/MoGraph.js`.
- In Cavalry's JS Editor you can run `MG.selftest()` and read the report in
  the JS Console to verify every recipe against the live app.

## Verifying Cavalry attribute names
Some attribute strings in `src/typemap.js` (`paths`, generator config, field
`shapeType`, the `math` combiner `operation`) are best-known and confirmed by
`MG.selftest()` running live in Cavalry. If a recipe does nothing in the app,
run the self-test, check `report.warnings`, and correct the string in
`src/typemap.js` (and the matching unit test).
```

- [ ] **Step 8: Build and verify the bundle is valid**

Run: `node build.js && node --check dist/MoGraph.js`
Expected: builds, `node --check` exits 0.

- [ ] **Step 9: Run the whole suite**

Run: `node --test`
Expected: all tests across all files PASS.

- [ ] **Step 10: Commit**

```bash
git add src/selftest.js src/entry.js src/panel.js README.md test/selftest.test.js test/panel.test.js
git commit -m "feat: Selection refresh, entry bootstrap, in-app selftest, README"
```

---

## Task 13: Live verification in Cavalry (manual gate)

**Files:** none (manual). Produces correction commits to `src/typemap.js` if needed.

This is the gate the unit tests cannot cover — confirming the best-known attribute strings against a running Cavalry.

- [ ] **Step 1:** `node build.js --install`, open Cavalry, Scripts → MoGraph; dock it.
- [ ] **Step 2:** In the JS Editor, run `MG.selftest()` and read the JS Console report. Record any `warnings`.
- [ ] **Step 3:** Manually walk the success path from the spec (§12): create a basic shape → select it → Grid Cloner → Random effector (rotation) → Spherical field; confirm the random rotation is limited to the sphere in the viewport.
- [ ] **Step 4:** For each failed recipe, fix the string in `src/typemap.js` (and its unit test), rebuild, re-run. Known suspects (spec §10): `shapes` vs `shapes.0`; radial/linear generator config attrs; falloff `shapeType` value names; `math` `operation` attr/value; per-copy color target for the Shader effector.
- [ ] **Step 5:** When `MG.selftest()` reports `failed: 0, warnings: []` live AND the manual walkthrough works, commit any corrections:

```bash
git add src/typemap.js test/
git commit -m "fix: correct Cavalry attribute strings verified against live app"
```

---

## Self-review (completed by planner)

**Spec coverage:**
- Translation table (spec §4) → Task 2 (TypeMap) + Tasks 3–8 (Engine recipes). ✓
- Engine/Panel/TypeMap/Selection split (spec §5) → Tasks 2,3,9,10. ✓
- Auto-wiring incl. combiner for Random (spec §5.3) → Tasks 4–8. ✓
- Effector P/S/R channels (spec §5.4) → Task 6 + Task 11/12 UI. ✓
- Selection-panel graph introspection (spec §5.5) → Task 9 + Task 12 refresh. ✓
- UI layout, color coding (spec §6) → Tasks 10–12. ✓ (procedural-vs-PNG icons deferred; v1 uses colored labelled buttons, icons can be layered on without changing the engine — noted as acceptable since spec §6 lists icons as a preference order, not a hard requirement.)
- Naming "Cloner N" etc. (spec §7) → `Engine._nextName` (Task 3) + `label`s in TypeMap. ✓
- Discover/verify discipline (spec §3, §10) → `_wire` verify (Task 3) + selftest + Task 13. ✓
- Error handling (spec §8) → Panel guards/modals (Task 11). ✓
- Testing (spec §9) → node:test logic suite + in-app selftest (all tasks + Task 12/13). ✓

**Gap noted:** spec §6 prefers `ui.Draw`/PNG icons; v1 ships color-coded text buttons and leaves icon rendering as a non-blocking follow-up (the `_actionButton` helper is the single seam where `setImage`/draw would be added). This is an intentional, documented scope trim, not a missed requirement.

**Placeholder scan:** no TBD/TODO/"handle edge cases"/"similar to Task N"; every code step shows complete code. The only stub (`_addFieldViaCombiner` in Task 7) is explicitly replaced in Task 8. ✓

**Type consistency:** `createCloner -> {clonerId}`, `addEffector -> {effectorId, comboIds}`, `addField -> {fieldId, extraIds}`, `setEffectorChannels(effectorId, clonerId, channels)`, `Selection.describe -> {role, mode, effectors:[{id,type,channels,fields:[{id,type}]}]}`, `Panel.build(engine)`, `Panel.refresh(selectionIds)`, `MG.selftest() -> {passed,failed,warnings,details}` — used consistently across tasks. ✓
