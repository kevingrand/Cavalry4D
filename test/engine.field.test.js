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

test("addField on a non-effector layer warns and wires nothing", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  const api = global.api;
  const notEffector = api.create("basicShape", "Box");
  const res = Engine.addField("spherical", notEffector, null);
  assert.ok(res.fieldId);
  assert.deepEqual(res.extraIds, []);
  assert.ok(Engine.warnings.some(function (w) { return w.indexOf("unknown effector") >= 0; }));
  assert.equal(api.getInConnection(notEffector, "falloffs.0.id"), "");
});

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

test("a field on a Random effector with two driven channels inserts two combiners", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId, { position: true, scale: false, rotation: true });
  const api = global.api;
  const res = Engine.addField("spherical", effectorId, clonerId);
  assert.equal(res.extraIds.length, 2);                 // one combiner per driven channel
  assert.equal(api.getLayerType(res.extraIds[0]), "math");
  assert.equal(api.getLayerType(res.extraIds[1]), "math");
  assert.equal(Engine.warnings.length, 0);
});

test("a second field on the same Random effector is refused (warning, no orphan, no extra wiring)", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const api = global.api;
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId, { rotation: true, position: false, scale: false });
  const first = Engine.addField("spherical", effectorId, clonerId);
  assert.equal(first.extraIds.length, 1);                        // first field OK -> combiner
  Engine.resetWarnings();
  const layersBefore = Object.keys(api._layers).length;
  const second = Engine.addField("box", effectorId, clonerId);   // refused
  assert.equal(second.fieldId, null);
  assert.equal(second.extraIds.length, 0);
  assert.ok(Engine.warnings.some(function (w) { return w.indexOf("already") >= 0; }));
  assert.equal(Object.keys(api._layers).length, layersBefore);   // orphan falloff deleted -> net zero new layers
});
