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
  const { effectorId } = Engine.addEffector("random", clonerId, { position: true, scale: false, rotation: true });
  return { api: global.api, clonerId, effectorId };
}

test("turning a channel off disconnects it; turning one on connects it", () => {
  const { api, clonerId, effectorId } = setup();
  Engine.setEffectorChannels(effectorId, clonerId, { position: false, scale: true, rotation: true });
  assert.equal(api.getInConnection(clonerId, "shapePosition"), "");                // turned off
  assert.equal(api.getInConnection(clonerId, "shapeScale"), effectorId + ".id");    // turned on
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), effectorId + ".id"); // still on
});

test("setEffectorChannels on a non-effector layer warns and wires nothing", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const api = global.api;
  const notEffector = api.create("basicShape", "Box");
  const cloner = api.create("duplicator", "Cloner");
  Engine.setEffectorChannels(notEffector, cloner, { position: true, scale: true, rotation: true });
  assert.ok(Engine.warnings.some(w => w.indexOf("unknown effector") >= 0));
  assert.equal(api.getInConnection(cloner, "shapePosition"), "");
});
