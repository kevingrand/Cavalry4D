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
  assert.equal(api.getInConnection(effectorId, "falloffs"), fieldId + ".id"); // connect to the falloffs list
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
  const before = Object.keys(api._layers).length;
  const res = Engine.addField("spherical", notEffector, null);
  assert.equal(res.fieldId, null);                        // refused, no orphan field
  assert.deepEqual(res.extraIds, []);
  assert.ok(Engine.warnings.some(function (w) { return w.indexOf("unknown effector") >= 0; }));
  assert.equal(Object.keys(api._layers).length, before); // no orphan left behind
});

test("a field on a Random effector connects to its falloffs (no combiner)", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId, { rotation: true, position: false, scale: false });
  const api = global.api;
  const res = Engine.addField("spherical", effectorId, clonerId);
  assert.equal(api.getLayerType(res.fieldId), "falloff");
  assert.deepEqual(res.extraIds, []);                                          // no combiner nodes
  assert.equal(api.getInConnection(effectorId, "falloffs"), res.fieldId + ".id");
  assert.equal(Engine.warnings.length, 0);
});

test("a field on a Shader effector is refused (no falloffs input), no orphan", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const api = global.api;
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("shader", clonerId);
  const layersBefore = Object.keys(api._layers).length;
  const res = Engine.addField("box", effectorId, clonerId);
  assert.equal(res.fieldId, null);
  assert.deepEqual(res.extraIds, []);
  assert.ok(Engine.warnings.some(function (w) { return w.indexOf("does not support") >= 0; }));
  assert.equal(Object.keys(api._layers).length, layersBefore);                // orphan falloff deleted
});
