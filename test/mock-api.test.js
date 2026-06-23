"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi } = require("./mock-api.js");

test("mock api records connect and reports it via getInConnection", () => {
  const api = makeApi();
  const a = api.create("colorPlane", "A");
  const b = api.create("textShape", "B");
  api.connect(a, "id", b, "fill.color");
  assert.equal(api.getInConnection(b, "fill.color"), a);
  assert.equal(api.getLayerType(a), "colorPlane");
});

test("mock api enforces one input per attribute (last wins)", () => {
  const api = makeApi();
  const a = api.create("colorPlane", "A");
  const b = api.create("colorPlane", "B");
  const t = api.create("textShape", "T");
  api.connect(a, "id", t, "fill.color");
  api.connect(b, "id", t, "fill.color");
  assert.equal(api.getInConnection(t, "fill.color"), b);
});
