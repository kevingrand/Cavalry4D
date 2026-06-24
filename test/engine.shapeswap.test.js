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
function drives(api, from, to) { return api.getOutConnections(from, "id").some(o => layerOf(o) === to); }
function spec() { return TM.gridPresets.find(p => p.key === "shapeSwap"); }
function statusOf(list, id) { return list.find(s => s.id === id); }

// In the mock, getCompLayers returns creation order = stack order (first = top).

test("stack order: top = region shape, middle = base shape, bottom = mask", () => {
  const api = setup();
  const region = api.create("basicShape", "Region");  // created first -> top
  const base = api.create("basicShape", "Base");
  const mask = api.create("basicShape", "Mask");       // created last -> bottom
  const v = Engine.validateRequires(spec(), [mask, base, region]); // selection order scrambled
  assert.equal(statusOf(v, "regionShape").layerId, region);
  assert.equal(statusOf(v, "baseShape").layerId, base);
  assert.equal(statusOf(v, "mask").layerId, mask);
});

test("buildShapeSwap makes two aligned grids, clips the region grid to the mask, zero warnings", () => {
  const api = setup();
  const region = api.create("basicShape", "Region");
  const base = api.create("basicShape", "Base");
  const mask = api.create("basicShape", "Mask");
  const r = Engine.buildGridPreset("shapeSwap", [region, base, mask]);

  assert.equal(r.ok, true);
  assert.equal(api.getLayerType(r.baseDupId), "duplicator");
  assert.equal(api.getLayerType(r.regionDupId), "duplicator");
  assert.notEqual(r.baseDupId, r.regionDupId);
  assert.ok(drives(api, base, r.baseDupId), "base shape -> base grid");
  assert.ok(drives(api, region, r.regionDupId), "region shape -> region grid");
  assert.ok(drives(api, mask, r.regionDupId), "mask -> region grid (clip)");
  assert.ok(api.getInConnectedAttributes(r.regionDupId).indexOf("masks") >= 0, "clipped via masks");
  assert.equal(api.get(mask, "hidden"), true, "mask hidden");
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("region grid is reordered ABOVE the base grid (reorder(base, region) puts base below)", () => {
  const api = setup();
  const r = Engine.buildGridPreset("shapeSwap",
    [api.create("basicShape", "R"), api.create("basicShape", "B"), api.create("basicShape", "M")]);
  // api.reorder(a, b) moves `a` BELOW `b`; to put the region grid on top the base
  // grid must be moved below it. (Doc-verified; the inverse hid the swap behind the base.)
  const last = api._reorders[api._reorders.length - 1];
  assert.deepEqual(last, [r.baseDupId, r.regionDupId]);
});

test("both grids share the same count/size/position so cells align", () => {
  const api = setup();
  const r = Engine.buildGridPreset("shapeSwap",
    [api.create("basicShape", "R"), api.create("basicShape", "B"), api.create("basicShape", "M")]);
  assert.deepEqual(api.get(r.baseDupId, "generator.count"), api.get(r.regionDupId, "generator.count"));
  assert.deepEqual(api.get(r.baseDupId, "generator.size"), api.get(r.regionDupId, "generator.size"));
  assert.deepEqual(api.get(r.baseDupId, "position"), api.get(r.regionDupId, "position"));
  assert.equal(api.getCurrentGeneratorType(r.baseDupId, "generator"), "gridDistribution");
});

test("empty selection stubs all three roles and still builds with zero warnings", () => {
  const api = setup();
  const r = Engine.buildGridPreset("shapeSwap", []);
  assert.equal(r.ok, true);
  assert.equal(r.stubbed.baseShape, true);
  assert.equal(r.stubbed.regionShape, true);
  assert.equal(r.stubbed.mask, true);
  assert.equal(api.getLayerType(r.baseShapeId), "basicShape");
  assert.equal(api.getLayerType(r.regionShapeId), "basicShape");
  // stub base = ellipse (dot), region = rectangle (square)
  assert.equal(api.getCurrentGeneratorType(r.baseShapeId, "generator"), "ellipseShape");
  assert.equal(api.getCurrentGeneratorType(r.regionShapeId, "generator"), "rectangleShape");
  assert.ok(drives(api, r.regionShapeId, r.regionDupId));
  assert.equal(api.get(r.maskId, "hidden"), true);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("a single selected shape fills one role and stubs the rest", () => {
  const api = setup();
  const only = api.create("basicShape", "Only");
  const r = Engine.buildGridPreset("shapeSwap", [only]);
  assert.equal(r.ok, true);
  // some role is satisfied by the selection; the others are stubbed
  const stubbedCount = [r.stubbed.regionShape, r.stubbed.baseShape, r.stubbed.mask].filter(Boolean).length;
  assert.equal(stubbedCount, 2);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("buildGridPreset rejects an unknown key", () => {
  setup();
  assert.throws(() => Engine.buildGridPreset("nope", []), /unknown grid preset/);
});
