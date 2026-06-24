"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");
const TM = global.MG.TypeMap;

function setup() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  return global.api;
}
function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
function drives(api, from, to, toAttr) {
  return api.getOutConnections(from, "id").some(o => layerOf(o) === to && (!toAttr || String(o).includes(toAttr)));
}
function revealSpec() { return TM.textPresets.find(p => p.key === "revealInShape"); }
function statusOf(list, id) { return list.find(s => s.id === id); }

// In the mock, getCompLayers returns creation order = stack order (first = top),
// mirroring real Cavalry. So the FIRST-created layer is the topmost.

// ---- stack-order assignment (2+ selected) ---------------------------------

test("stack order decides roles: topmost = fill-in, below it = mask (regardless of selection order)", () => {
  const api = setup();
  const top = api.create("textShape", "Top");     // created first -> topmost
  const bottom = api.create("basicShape", "Bottom");
  const v = Engine.validateRequires(revealSpec(), [bottom, top]); // selection order reversed on purpose
  assert.equal(statusOf(v, "fillIn").status, "ok");
  assert.equal(statusOf(v, "fillIn").layerId, top);     // top of stack -> fill-in
  assert.equal(statusOf(v, "mask").status, "ok");
  assert.equal(statusOf(v, "mask").layerId, bottom);    // below it -> mask
});

test("stack order is positional, not type-based: a shape on top becomes the fill-in", () => {
  const api = setup();
  const topShape = api.create("basicShape", "TopShape"); // topmost
  const bottomText = api.create("textShape", "BottomText");
  const v = Engine.validateRequires(revealSpec(), [topShape, bottomText]);
  assert.equal(statusOf(v, "fillIn").layerId, topShape);   // top wins even though it's a shape
  assert.equal(statusOf(v, "mask").layerId, bottomText);
});

// ---- single-selection type fallback ---------------------------------------

test("a lone shape is treated as the mask (fill-in stubbed)", () => {
  const api = setup();
  const mask = api.create("basicShape", "Mask");
  const v = Engine.validateRequires(revealSpec(), [mask]);
  assert.equal(statusOf(v, "mask").status, "ok");
  assert.equal(statusOf(v, "mask").layerId, mask);
  assert.equal(statusOf(v, "fillIn").status, "stub");
});

test("a lone text is treated as the fill-in (mask stubbed)", () => {
  const api = setup();
  const t = api.create("textShape", "Copy");
  const v = Engine.validateRequires(revealSpec(), [t]);
  assert.equal(statusOf(v, "fillIn").status, "ok");
  assert.equal(statusOf(v, "fillIn").layerId, t);
  assert.equal(statusOf(v, "mask").status, "stub");
});

test("empty selection marks both roles stubbable", () => {
  setup();
  const v = Engine.validateRequires(revealSpec(), []);
  assert.equal(statusOf(v, "fillIn").status, "stub");
  assert.equal(statusOf(v, "mask").status, "stub");
});

test("a non-stubbable requirement is reported missing (gate path)", () => {
  setup();
  const spec = { requires: [{ id: "needed", label: "Needed", check: "textShape" }] }; // no stub, no stack
  const v = Engine.validateRequires(spec, []);
  assert.equal(statusOf(v, "needed").status, "missing");
});

// ---- buildTextPreset / _buildRevealInShape (the verified recipe) -----------

test("buildRevealInShape wires subMesh+isWithin+valueArray with zero warnings", () => {
  const api = setup();
  const fill = api.create("textShape", "Fill");   // top -> fill-in
  const mask = api.create("basicShape", "Mask");  // below -> mask
  const r = Engine.buildTextPreset("revealInShape", [fill, mask]);

  assert.equal(r.ok, true);
  assert.equal(r.bodyId, fill);
  assert.equal(r.maskId, mask);
  assert.equal(api.getLayerType(r.subMeshId), "subMesh");
  assert.equal(api.getLayerType(r.isWithinId), "isWithin");
  assert.equal(api.getLayerType(r.valueArrayId), "valueArray");

  assert.ok(drives(api, mask, r.isWithinId, "inputShape"), "mask -> isWithin.inputShape");
  assert.ok(drives(api, r.isWithinId, r.valueArrayId, "arrayIndex"), "isWithin -> valueArray.arrayIndex");
  assert.ok(drives(api, r.valueArrayId, r.subMeshId, "shapeOpacity"), "valueArray -> subMesh.shapeOpacity");
  assert.ok(drives(api, r.subMeshId, fill, "deformers"), "subMesh -> fill.deformers");

  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("buildRevealInShape sets the verified node settings", () => {
  const api = setup();
  const fill = api.create("textShape", "Fill");
  const mask = api.create("basicShape", "Mask");
  const r = Engine.buildTextPreset("revealInShape", [fill, mask]);

  assert.deepEqual(api.get(r.subMeshId, "levels"), { x: 3, y: 3 });
  assert.equal(api.get(r.subMeshId, "levelMode"), 3);
  assert.equal(api.get(r.subMeshId, "useIndex"), true);
  assert.equal(api.get(r.isWithinId, "invert"), true);
  assert.equal(api.get(r.valueArrayId, "array.0"), 100);
  assert.equal(api.get(r.valueArrayId, "array.1"), 0);
  assert.equal(api.getParent(r.subMeshId), fill);
  assert.equal(api.get(mask, "hidden"), true);   // mask is a hidden stencil
});

test("buildRevealInShape fits the fill-in text box to the mask's bounding box and centers it", () => {
  const api = setup();
  const fill = api.create("textShape", "Fill");
  const mask = api.create("basicShape", "Mask");
  Engine.buildTextPreset("revealInShape", [fill, mask]);
  // mock getBoundingBox returns a 100×80 box centred at the origin
  assert.deepEqual(api.get(fill, "textBoxSize"), { x: 100, y: 80 });
  assert.equal(api.get(fill, "autoWidth"), false);
  assert.equal(api.get(fill, "horizontalAlignment"), 1);
  assert.equal(api.get(fill, "verticalAlignment"), 1);
  assert.deepEqual(api.get(fill, "position"), { x: -50, y: 40 }); // {cx - w/2, cy + h/2}
});

test("buildRevealInShape with empty selection stubs both roles and still builds", () => {
  const api = setup();
  const before = Object.keys(api._layers).length;
  const r = Engine.buildTextPreset("revealInShape", []);
  assert.equal(r.ok, true);
  assert.equal(r.stubbed.fillIn, true);
  assert.equal(r.stubbed.mask, true);
  assert.equal(api.getLayerType(r.bodyId), "textShape"); // lorem fill-in stub
  assert.equal(api.getLayerType(r.maskId), "textShape"); // mask glyph stub
  assert.ok(Object.keys(api._layers).length > before);
  assert.ok(drives(api, r.subMeshId, r.bodyId, "deformers"));
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("buildRevealInShape with only a shape stubs just the fill-in", () => {
  const api = setup();
  const mask = api.create("basicShape", "Mask");
  const r = Engine.buildTextPreset("revealInShape", [mask]);
  assert.equal(r.maskId, mask);
  assert.equal(r.stubbed.mask, false);
  assert.equal(r.stubbed.fillIn, true);
  assert.equal(api.getLayerType(r.bodyId), "textShape");
});

test("buildTextPreset rejects an unknown preset key", () => {
  setup();
  assert.throws(() => Engine.buildTextPreset("nope", []), /unknown text preset/);
});
