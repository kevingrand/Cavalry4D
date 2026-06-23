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
  assert.equal(api.getInConnection(clonerId, "shapePosition"), "");        // turned off
  assert.equal(api.getInConnection(clonerId, "shapeScale"), effectorId);    // turned on
  assert.equal(api.getInConnection(clonerId, "shapeRotation"), effectorId); // still on
});
