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
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  return { api: global.api, clonerId };
}

test("Random effector drives its default channels (rotation + position) and not scale", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("random", clonerId);
  assert.equal(api.getLayerType(effectorId), "random");
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), effectorId);
  assert.equal(api.getInConnection(clonerId, "shapePosition"), effectorId);
  assert.equal(api.getInConnection(clonerId, "shapeScale"), "");
});

test("explicit channels override the defaults", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("random", clonerId, { position: false, scale: true, rotation: false });
  assert.equal(api.getInConnection(clonerId, "shapeScale"), effectorId);
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), "");
  assert.equal(api.getInConnection(clonerId, "shapePosition"), "");
});

test("Plain effector uses a value behaviour wired to position by default", () => {
  const { api, clonerId } = setup();
  const { effectorId } = Engine.addEffector("plain", clonerId);
  assert.equal(api.getLayerType(effectorId), "value");
  assert.equal(api.getInConnection(clonerId, "shapePosition"), effectorId);
});
