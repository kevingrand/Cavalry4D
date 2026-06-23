"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const TypeMap = require("../src/typemap.js");

test("XFORM maps logical channels to duplicator per-copy attrs", () => {
  assert.deepEqual(TypeMap.XFORM, { position: "shapePosition", scale: "shapeScale", rotation: "shapeRotation" });
});

test("cloner modes map to Cavalry distributions", () => {
  assert.equal(TypeMap.cloners.grid.distribution, "grid");
  assert.equal(TypeMap.cloners.radial.distribution, "circle");
  assert.equal(TypeMap.cloners.linear.distribution, "linear");
  assert.equal(TypeMap.cloners.object.distribution, "path");
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
