"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");
const Selection = require("../src/selection.js");

function setup() {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  return global.api;
}

test("classify maps concrete layer types to Quick-Action categories", () => {
  const api = setup();
  assert.equal(Selection.classify(api.create("basicShape", "Box")), "shape");
  assert.equal(Selection.classify(api.create("textShape", "Title")), "text");
  assert.equal(Selection.classify(api.create("footageShape", "Img")), "image");
  assert.equal(Selection.classify(api.create("imageToShapes", "Img2")), "image");
  assert.equal(Selection.classify(api.create("duplicator", "Cloner")), "cloner");
  assert.equal(Selection.classify(api.create("random", "Random Effector")), "effector");
  assert.equal(Selection.classify(api.create("stagger", "Step Effector")), "effector");
  assert.equal(Selection.classify(api.create("falloff", "Field")), "field");
});

test("classify returns 'other' for an unknown, non-shape layer", () => {
  const api = setup();
  // a type the mock's isShape doesn't include and getSuperTypes doesn't bucket as Shape
  assert.equal(Selection.classify(api.create("oscillator", "Osc")), "other");
});

test("classify falls back to getSuperTypes Shape bucket", () => {
  const api = setup();
  // a 'null' isn't textShape and (in real Cavalry) isShape may vary, but getSuperTypes -> ["Shape"]
  const nul = api.create("null", "Null");
  assert.equal(Selection.classify(nul), "shape");
});

test("classify guards missing/non-existent layers", () => {
  setup();
  assert.equal(Selection.classify(null), "other");
  assert.equal(Selection.classify("nope#1"), "other");
});

test("classifySelection: empty / single / multi", () => {
  const api = setup();
  assert.deepEqual(Selection.classifySelection([]), { category: "none", count: 0 });

  const s = api.create("basicShape", "Box");
  assert.deepEqual(Selection.classifySelection([s]), { category: "shape", count: 1 });

  const t = api.create("textShape", "T");
  const allShapes = Selection.classifySelection([s, t]);
  assert.equal(allShapes.category, "multiShapes");
  assert.equal(allShapes.count, 2);

  const eff = api.create("random", "R");
  const mixed = Selection.classifySelection([s, eff]);
  assert.equal(mixed.category, "multi");      // a non-shape in the mix -> generic verbs only
  assert.equal(mixed.count, 2);
});
