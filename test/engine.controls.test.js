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
  return global.api;
}

test("switchDistribution swaps the generator and re-applies smart spacing", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "gridDistribution");

  Engine.switchDistribution(clonerId, "radial");
  assert.equal(api.getCurrentGeneratorType(clonerId, "generator"), "circleDistribution");
  assert.equal(api.get(clonerId, "generator.count"), 6);
  assert.equal(api.get(clonerId, "generator.radius"), 120);   // spacing from the still-connected shape
});

test("switchDistribution keeps the Input Shape connection intact", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  Engine.switchDistribution(clonerId, "linear");
  const outs = api.getOutConnections(shape, "id");
  assert.ok(outs.some(o => o.startsWith(clonerId + ".")), "shape still feeds the cloner after switch");
});

test("_clonerSourceShape finds the connected input shape", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  assert.equal(Engine._clonerSourceShape(clonerId), shape);
});

test("setPathShape connects a path shape to generator.inputShape", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("object", [shape]);
  const pathShape = api.create("basicShape", "Path");
  const res = Engine.setPathShape(clonerId, pathShape);
  assert.equal(res.ok, true);
  assert.equal(api.getInConnection(clonerId, "generator.inputShape"), pathShape + ".id");
});

test("setEffectorStrength writes the strength attr", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  assert.equal(Engine.setEffectorStrength(effectorId, 42), true);
  assert.equal(api.get(effectorId, "strength"), 42);
});

test("setEffectorAmount writes the amount attr (maximum for random)", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  assert.equal(api.get(effectorId, "maximum"), 50);   // visible default from configure
  Engine.setEffectorAmount(effectorId, 200);
  assert.equal(api.get(effectorId, "maximum"), 200);
});

test("plain effector amount targets 'value', step targets 'maximum'", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const plain = Engine.addEffector("plain", clonerId).effectorId;
  const step = Engine.addEffector("step", clonerId).effectorId;
  assert.equal(api.get(plain, "value"), 50);   // configure default
  assert.equal(api.get(step, "maximum"), 45);  // configure default (auto-stagger)
  Engine.setEffectorAmount(plain, 80); assert.equal(api.get(plain, "value"), 80);
  Engine.setEffectorAmount(step, 90);  assert.equal(api.get(step, "maximum"), 90);
});

test("setEffectorMuted zeroes strength and restores it on unmute", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  Engine.setEffectorStrength(effectorId, 75);
  Engine.setEffectorMuted(effectorId, true);
  assert.equal(api.get(effectorId, "strength"), 0);
  assert.equal(Engine.isEffectorMuted(effectorId), true);
  Engine.setEffectorMuted(effectorId, false);
  assert.equal(api.get(effectorId, "strength"), 75);   // restored
  assert.equal(Engine.isEffectorMuted(effectorId), false);
});

test("shader effector has no strength/amount controls (warns, no-op)", () => {
  const api = setup();
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("shader", clonerId);
  assert.equal(Engine.setEffectorStrength(effectorId, 50), false);
  assert.equal(Engine.setEffectorAmount(effectorId, 50), false);
  assert.ok(Engine.warnings.length >= 2);
});
