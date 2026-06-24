"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const TypeMap = require("../src/typemap.js");

test("XFORM maps logical channels to duplicator per-copy attrs", () => {
  assert.deepEqual(TypeMap.XFORM, { position: "shapePosition", scale: "shapeScale", rotation: "shapeRotation" });
});

test("cloner modes map to the correct Cavalry distribution generator names", () => {
  assert.equal(TypeMap.cloners.grid.distribution, "gridDistribution");
  assert.equal(TypeMap.cloners.radial.distribution, "circleDistribution");
  assert.equal(TypeMap.cloners.linear.distribution, "linearDistribution");
  assert.equal(TypeMap.cloners.object.distribution, "pathDistribution");
  assert.equal(TypeMap.cloners.object.pathSlot, "generator.inputShape");
});

test("distributionOrder lists the switchable distributions (honeycomb shares grid)", () => {
  assert.deepEqual(TypeMap.distributionOrder, ["grid", "radial", "linear", "scatter", "onEdges", "object"]);
});

test("effectors expose strength/amount slider metadata", () => {
  assert.equal(TypeMap.effectors.random.strengthAttr, "strength");
  assert.equal(TypeMap.effectors.random.amountAttr, "maximum");
  assert.equal(TypeMap.effectors.plain.amountAttr, "value");
  assert.equal(TypeMap.effectors.step.amountAttr, "maximum");
  assert.equal(TypeMap.effectors.shader.strengthAttr, null);
  assert.ok(Array.isArray(TypeMap.effectors.random.amountRange));
});

test("effectors carry their source layer and field-slot strategy", () => {
  assert.equal(TypeMap.effectors.random.layer, "random");
  assert.equal(TypeMap.effectors.random.fieldSlot, "falloffs");      // random has a falloffs input
  assert.equal(TypeMap.effectors.plain.layer, "value");
  assert.equal(TypeMap.effectors.plain.fieldSlot, "falloffs");
  assert.equal(TypeMap.effectors.step.layer, "stagger");
  assert.equal(TypeMap.effectors.shader.layer, "colorArray");
  assert.equal(TypeMap.effectors.shader.fieldSlot, null);            // colorArray has no falloffs input
  assert.deepEqual(TypeMap.effectors.random.defaultChannels, { position: true, scale: false, rotation: true });
});

test("fields map to falloff variants", () => {
  assert.equal(TypeMap.fields.linear.layer, "falloff");
  assert.equal(TypeMap.fields.spherical.layer, "falloff");
  assert.equal(TypeMap.fields.box.layer, "falloff");
  assert.equal(TypeMap.fields.random.layer, "falloff");
});
