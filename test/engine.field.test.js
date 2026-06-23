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
