"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");

function setup() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  Engine._muted = {};
  const shape = global.api.create("basicShape", "Box");
  return { api: global.api, shape };
}

// ---- new cloners ----

test("scatter cloner uses randomDistribution with relax push-apart", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("scatter", [shape]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "randomDistribution");
  assert.equal(api.get(clonerId, "generator.count"), 12);
  assert.equal(api.get(clonerId, "generator.relaxMode"), true);
  assert.ok(api.get(clonerId, "generator.relaxDistance") > 0);
});

test("honeycomb cloner is a grid with a half-cell pattern offset", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("honeycomb", [shape]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "gridDistribution");
  assert.equal(api.get(clonerId, "generator.distributionMode"), 1);
  const size = api.get(clonerId, "generator.size");
  const offset = api.get(clonerId, "generator.offset");
  assert.equal(offset.x, Math.round(size.x / 2)); // brick offset = half a cell
  assert.equal(offset.y, 0);
});

test("onEdges cloner uses shapeEdgeDistribution and accepts a path shape", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("onEdges", [shape]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "shapeEdgeDistribution");
  assert.equal(api.get(clonerId, "generator.count"), 10);
  const path = api.create("basicShape", "Star");
  assert.equal(Engine.setPathShape(clonerId, path).ok, true);
  assert.equal(api.getInConnection(clonerId, "generator.inputShape"), path + ".id");
});

// ---- new effectors ----

test("noise effector drives position+rotation and has visible amount default", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("noise", clonerId);
  assert.equal(api.getLayerType(effectorId), "noise");
  // visible symmetric default
  assert.equal(api.get(effectorId, "generator.maximum"), 50);
  assert.equal(api.get(effectorId, "generator.minimum"), -50);
  // drives the cloner's position + rotation
  const outs = api.getOutConnections(effectorId, "id").map(o => o.split(".").slice(1).join("."));
  assert.ok(outs.includes("shapePosition"));
  assert.ok(outs.includes("shapeRotation"));
});

test("noise amount slider targets generator.maximum", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("noise", clonerId);
  Engine.setEffectorAmount(effectorId, 200);
  assert.equal(api.get(effectorId, "generator.maximum"), 200);
});

test("target effector auto-creates a null target and drives only rotation", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId, extraIds } = Engine.addEffector("target", clonerId);
  assert.equal(api.getLayerType(effectorId), "lookAt");
  assert.equal(extraIds.length, 1);
  const target = extraIds[0];
  assert.equal(api.getLayerType(target), "null");
  // target null wired into lookAt.target
  assert.equal(api.getInConnection(effectorId, "target"), target + ".id");
  // drives ONLY rotation
  const outs = api.getOutConnections(effectorId, "id").map(o => o.split(".").slice(1).join("."));
  assert.deepEqual(outs, ["shapeRotation"]);
});

// ---- field controls + enum fix ----

test("fields set the correct shapeType enum int", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("plain", clonerId);
  assert.equal(api.get(Engine.addField("spherical", effectorId, clonerId).fieldId, "shapeType"), 0); // Circle
  assert.equal(api.get(Engine.addField("box", effectorId, clonerId).fieldId, "shapeType"), 1);       // Rectangle
  assert.equal(api.get(Engine.addField("linear", effectorId, clonerId).fieldId, "shapeType"), 2);    // Linear
  const rnd = Engine.addField("random", effectorId, clonerId).fieldId;
  assert.equal(api.get(rnd, "shapeType"), 0);
  assert.equal(api.get(rnd, "useProbability"), true);
});

test("setFieldStrength and setFieldProbability write the field attrs", () => {
  const { api, shape } = setup();
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("plain", clonerId);
  const { fieldId } = Engine.addField("spherical", effectorId, clonerId);
  assert.equal(Engine.setFieldStrength(fieldId, 40), true);
  assert.equal(api.get(fieldId, "strength"), 40);
  assert.equal(Engine.setFieldProbability(fieldId, true), true);
  assert.equal(api.get(fieldId, "useProbability"), true);
});

test("field setters reject non-field layers", () => {
  const { api, shape } = setup();
  assert.equal(Engine.setFieldStrength(shape, 40), false);
  assert.equal(Engine.setFieldProbability(shape, true), false);
});
