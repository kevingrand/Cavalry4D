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

test("createCloner makes a duplicator and connects the selection as an Input Shape", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  assert.equal(api.getLayerType(clonerId), "duplicator");
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "gridDistribution");
  // shape must be wired to the duplicator's shapes list (Input Shapes), not just parented
  const outs = api.getOutConnections(shape, "id");
  assert.ok(outs.some(o => o.startsWith(clonerId + ".")), "shape.id drives duplicator.shapes");
  assert.equal(Engine.warnings.length, 0);
});

test("createCloner sets the right distribution per mode", () => {
  const api = setup();
  const s = api.create("basicShape", "S");
  assert.equal(api.getCurrentGeneratorType(Engine.createCloner("radial", [s]).clonerId, "generator"), "circleDistribution");
  assert.equal(api.getCurrentGeneratorType(Engine.createCloner("linear", [s]).clonerId, "generator"), "linearDistribution");
  assert.equal(api.getCurrentGeneratorType(Engine.createCloner("object", [s]).clonerId, "generator"), "pathDistribution");
});

test("createCloner names the cloner after the source shape", () => {
  const api = setup();
  const s = api.create("basicShape", "Circle");
  const { clonerId } = Engine.createCloner("grid", [s]);
  assert.ok(api.getNiceName(clonerId).includes("Circle"), "cloner name should include source shape name");
  assert.ok(api.getNiceName(clonerId).startsWith("Cloner-"), "cloner name should start with Cloner-");
});

test("createCloner falls back to numbered name when no source", () => {
  const api = setup();
  const { clonerId } = Engine.createCloner("grid", []);
  assert.match(api.getNiceName(clonerId), /^Cloner \d+$/);
});

test("createCloner sets smart spacing from source bounding box", () => {
  // mock getBoundingBox returns {width:100, height:80}
  const api = setup();
  const s = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [s]);
  const size = api.get(clonerId, "generator.size");
  // width(100) + gap(20) = 120; height(80) + gap(20) = 100
  assert.deepEqual(size, { x: 120, y: 100 });
  // must use Step mode (1) so size is the gap, not the total extent
  assert.equal(api.get(clonerId, "generator.distributionMode"), 1);
});

test("createCloner radial uses circleDistribution with scalar count and radius", () => {
  const api = setup();
  const s = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("radial", [s]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "circleDistribution");
  assert.equal(api.get(clonerId, "generator.count"), 6);        // scalar, not {x,y}
  // radius = max(120, round(6*(100+20)/(2*PI))) = max(120, 115) = 120
  assert.equal(api.get(clonerId, "generator.radius"), 120);
});

test("createCloner linear uses linearDistribution with scalar count and total length", () => {
  const api = setup();
  const s = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("linear", [s]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "linearDistribution");
  assert.equal(api.get(clonerId, "generator.count"), 5);        // scalar
  // size = total length = (100+20) * (5-1) = 480
  assert.equal(api.get(clonerId, "generator.size"), 480);
});

test("createCloner object uses pathDistribution", () => {
  const api = setup();
  const s = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("object", [s]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "pathDistribution");
  assert.equal(api.get(clonerId, "generator.count"), 10);
});
