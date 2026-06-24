"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");
const TM = global.MG.TypeMap;

function setup() { global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings(); return global.api; }
function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
function drives(api, from, to, toAttr) {
  return api.getOutConnections(from, "id").some(o => layerOf(o) === to && (!toAttr || String(o).includes(toAttr)));
}
function spec() { return TM.textPresets.find(p => p.key === "fillRepeat"); }
function statusOf(list, id) { return list.find(s => s.id === id); }

test("fillRepeat: bottom layer = mask, every layer above = fills (multi role)", () => {
  const api = setup();
  const star = api.create("basicShape", "Star");      // top
  const sq = api.create("basicShape", "Square");
  const tri = api.create("basicShape", "Triangle");
  const mask = api.create("basicShape", "Mask");      // bottom
  const v = Engine.validateRequires(spec(), [star, sq, tri, mask]);
  assert.equal(statusOf(v, "mask").status, "ok");
  assert.equal(statusOf(v, "mask").layerId, mask);
  assert.equal(statusOf(v, "fills").status, "ok");
  assert.deepEqual(statusOf(v, "fills").layerIds, [star, sq, tri]);
});

test("fillRepeat: a lone shape is the mask, fills are stubbed", () => {
  const api = setup();
  const mask = api.create("basicShape", "Mask");
  const v = Engine.validateRequires(spec(), [mask]);
  assert.equal(statusOf(v, "mask").status, "ok");
  assert.equal(statusOf(v, "mask").layerId, mask);
  assert.equal(statusOf(v, "fills").status, "stub");
});

test("buildFillRepeat clones fills in a grid, clips to the mask, hides the mask, zero warnings", () => {
  const api = setup();
  const a = api.create("basicShape", "A");        // fill (top)
  const mask = api.create("basicShape", "Mask");  // mask (bottom)
  const r = Engine.buildTextPreset("fillRepeat", [a, mask]);
  assert.equal(r.ok, true);
  assert.equal(api.getLayerType(r.clonerId), "duplicator");
  assert.equal(api.getCurrentGeneratorType(r.clonerId, "generator"), "gridDistribution");
  assert.ok(drives(api, a, r.clonerId, "shapes"), "fill -> cloner.shapes");
  assert.ok(drives(api, mask, r.clonerId, "masks"), "mask -> cloner.masks (clip)");
  assert.equal(api.get(mask, "hidden"), true);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("buildFillRepeat with empty selection stubs default cells + a mask and still builds", () => {
  const api = setup();
  const r = Engine.buildTextPreset("fillRepeat", []);
  assert.equal(r.ok, true);
  assert.equal(r.stubbed.fills, true);
  assert.equal(r.stubbed.mask, true);
  assert.ok(r.fillIds.length >= 1);
  assert.equal(api.getLayerType(r.clonerId), "duplicator");
  r.fillIds.forEach(f => assert.ok(drives(api, f, r.clonerId, "shapes")));
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});
