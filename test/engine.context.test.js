"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");

function setup() {
  global.api = makeApi(); global.cavalry = makeCavalry();
  Engine.resetWarnings(); Engine._muted = {};
  return global.api;
}
function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
function drives(api, fromId, toId) {
  const o = api.getOutConnections(fromId, "id");
  return o.some(x => layerOf(x) === toId);
}

test("duplicate calls api.duplicate for each selected layer", () => {
  const api = setup();
  const a = api.create("basicShape", "A"), b = api.create("basicShape", "B");
  const res = Engine.runContextAction("duplicate", [a, b]);
  assert.equal(res.ok, true);
  assert.equal(api._duplicates.length, 2);
});

test("group creates a Group and parents the selection into it", () => {
  const api = setup();
  const a = api.create("basicShape", "A"), b = api.create("basicShape", "B");
  const res = Engine.runContextAction("group", [a, b]);
  assert.equal(api.getLayerType(res.select), "group");
  assert.equal(api.getParent(a), res.select);
  assert.equal(api.getParent(b), res.select);
});

test("precompose selects the layers and returns a comp reference", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const res = Engine.runContextAction("precompose", [a]);
  assert.equal(api.getLayerType(res.select), "compReference");
  assert.deepEqual(api._precomposed[0], [a]);
});

test("centerPivot flags the pivot on each layer", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  Engine.runContextAction("centerPivot", [a]);
  assert.equal(api.get(a, "__centrePivot"), true);
});

test("delete removes each selected layer and selects nothing", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const res = Engine.runContextAction("delete", [a]);
  assert.equal(res.select, null);
  assert.equal(api.layerExists(a), false);
});

test("cloneGrid / cloneAll make a grid duplicator wired to the shape(s)", () => {
  const api = setup();
  const a = api.create("basicShape", "A"), b = api.create("basicShape", "B");
  const r1 = Engine.runContextAction("cloneGrid", [a]);
  assert.equal(api.getLayerType(r1.select), "duplicator");
  assert.ok(drives(api, a, r1.select));
  const r2 = Engine.runContextAction("cloneAll", [a, b]);
  assert.ok(drives(api, a, r2.select) && drives(api, b, r2.select));
  assert.equal(Engine.warnings.length, 0);
});

test("scatter builds a cloner + effector via applyPreset", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const res = Engine.runContextAction("scatter", [a]);
  assert.equal(api.getLayerType(res.select), "duplicator");
});

test("addRandom/addStep/addNoise add an effector driving the selected cloner", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const { clonerId } = Engine.createCloner("grid", [a]);
  ["addRandom", "addStep", "addNoise"].forEach(key => {
    const res = Engine.runContextAction(key, [clonerId]);
    assert.equal(res.ok, true);
    assert.ok(drives(api, res.select, clonerId), key + " should drive the cloner");
  });
});

test("addRandom from an effector resolves the cloner it drives", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const { clonerId } = Engine.createCloner("grid", [a]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  const res = Engine.runContextAction("addStep", [effectorId]);   // selected an effector, not the cloner
  assert.ok(drives(api, res.select, clonerId));
});

test("addRandom with no cloner selected returns a friendly message", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const res = Engine.runContextAction("addRandom", [a]);
  assert.equal(res.ok, false);
  assert.match(res.message, /Cloner/);
});

test("addField adds a spherical field to the selected effector", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const { clonerId } = Engine.createCloner("grid", [a]);
  const { effectorId } = Engine.addEffector("plain", clonerId);
  const res = Engine.runContextAction("addField", [effectorId]);
  assert.equal(api.getLayerType(res.select), "falloff");
  assert.ok(drives(api, res.select, effectorId));
});

test("addField on a non-effector is rejected", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const res = Engine.runContextAction("addField", [a]);
  assert.equal(res.ok, false);
});

test("toggleMute flips an effector's muted state", () => {
  const api = setup();
  const a = api.create("basicShape", "A");
  const { clonerId } = Engine.createCloner("grid", [a]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  assert.equal(Engine.isEffectorMuted(effectorId), false);
  Engine.runContextAction("toggleMute", [effectorId]);
  assert.equal(Engine.isEffectorMuted(effectorId), true);
  Engine.runContextAction("toggleMute", [effectorId]);
  assert.equal(Engine.isEffectorMuted(effectorId), false);
});

test("toggleProbability flips a field's useProbability", () => {
  const api = setup();
  const f = api.create("falloff", "Field");
  Engine.runContextAction("toggleProbability", [f]);
  assert.equal(api.get(f, "useProbability"), true);
  Engine.runContextAction("toggleProbability", [f]);
  assert.equal(api.get(f, "useProbability"), false);
});

test("revealInShape routes to buildTextPreset (stubs when empty)", () => {
  const api = setup();
  const res = Engine.runContextAction("revealInShape", []);
  assert.equal(res.ok, true);
  assert.ok(res.stubbed && res.stubbed.fillIn && res.stubbed.mask);
});

test("highlightWords seeds the default rows and stubs a sample text when none selected", () => {
  const api = setup();
  const res = Engine.runContextAction("highlightWords", []);
  assert.equal(api.getLayerType(res.select), "textShape");
  assert.deepEqual(res.stubbed, { highlight: true });
});

test("imageSize/imageDensity route to buildRig", () => {
  const api = setup();
  const r1 = Engine.runContextAction("imageSize", []);
  assert.equal(api.getLayerType(r1.select), "duplicator");
  assert.equal(r1.imageUsed, false);     // no image selected -> Image Sampler stub
});

test("unknown action throws", () => {
  setup();
  assert.throws(() => Engine.runContextAction("nope", []), /unknown context action/);
});
