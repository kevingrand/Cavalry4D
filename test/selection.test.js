"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");
const Selection = require("../src/selection.js");

test("describe(cloner) reports its effectors and their fields", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); Engine.resetWarnings();
  const api = global.api;
  const shape = api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("plain", clonerId);     // value -> shapePosition
  Engine.addField("spherical", effectorId, clonerId);               // falloff -> value.falloffs.0.id

  const d = Selection.describe(clonerId);
  assert.equal(d.role, "cloner");
  assert.equal(d.effectors.length, 1);
  assert.equal(d.effectors[0].id, effectorId);
  assert.equal(d.effectors[0].type, "plain");
  assert.ok(d.effectors[0].channels.indexOf("shapePosition") >= 0);
  assert.equal(d.effectors[0].fields.length, 1);
  assert.equal(d.effectors[0].fields[0].type, "spherical");
});

test("describe(non-duplicator) returns role other/effector appropriately", () => {
  global.api = makeApi(); global.cavalry = makeCavalry();
  const api = global.api;
  const r = api.create("random", "Random Effector 1");
  assert.equal(Selection.describe(r).role, "effector");
  assert.equal(Selection.describe(api.create("ellipse", "x")).role, "other");
});
