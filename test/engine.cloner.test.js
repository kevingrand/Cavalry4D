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
