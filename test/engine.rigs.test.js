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
  return global.api;
}
function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
function drives(api, from, to, toAttr) {
  return api.getOutConnections(from, "id").some(o => layerOf(o) === to && (!toAttr || String(o).includes(toAttr)));
}

test("Image → Size with a footage image + shape builds a grid sampled to shapeScale", () => {
  const api = setup();
  const img = api.create("footageShape", "photo.png");
  const shape = api.create("basicShape", "Cell");
  const rig = Engine.buildRig("imageSize", [img, shape]);
  assert.equal(api.getCurrentGeneratorType(rig.clonerId, "generator"), "gridDistribution");
  assert.equal(api.getLayerType(rig.samplerId), "materialSampler");
  assert.equal(rig.imageUsed, true);
  // footage -> sampler.inputShape, sampler -> cloner.shapeScale, shape -> cloner.shapes
  assert.equal(api.getInConnection(rig.samplerId, "inputShape"), img + ".id");
  assert.ok(drives(api, rig.samplerId, rig.clonerId, "shapeScale"));
  assert.ok(drives(api, shape, rig.clonerId, "shapes"));
  assert.equal(rig.shapeId, shape); // used the selected shape, didn't invent one
});

test("Image → Density builds a scatter driven by placement probability", () => {
  const api = setup();
  const img = api.create("footageShape", "photo.png");
  const shape = api.create("basicShape", "Dot");
  const rig = Engine.buildRig("imageDensity", [img, shape]);
  assert.equal(api.getCurrentGeneratorType(rig.clonerId, "generator"), "randomDistribution");
  assert.equal(api.get(rig.clonerId, "generator.useProbability"), true);
  assert.ok(drives(api, rig.samplerId, rig.clonerId, "generator.probability"));
  assert.ok(api.get(rig.clonerId, "generator.count") >= 100); // dense enough to read an image
});

test("Image rig with no image selected creates an Image Sampler and flags imageUsed=false", () => {
  const api = setup();
  const shape = api.create("basicShape", "Cell");
  const rig = Engine.buildRig("imageSize", [shape]);
  assert.equal(api.getLayerType(rig.samplerId), "imageSampler");
  assert.equal(rig.imageUsed, false);
  assert.ok(drives(api, rig.samplerId, rig.clonerId, "shapeScale"));
});

test("Image rig with no shape selected invents a default cell shape", () => {
  const api = setup();
  const img = api.create("footageShape", "photo.png");
  const before = Object.keys(api._layers).length;
  const rig = Engine.buildRig("imageSize", [img]);
  assert.ok(Object.keys(api._layers).length > before);
  assert.equal(api.getLayerType(rig.shapeId), "basicShape");
  // Generator name MUST carry the "Shape" suffix — bare "rectangle" silently polygons.
  assert.equal(api.getCurrentGeneratorType(rig.shapeId, "generator"), "rectangleShape");
  assert.ok(drives(api, rig.shapeId, rig.clonerId, "shapes"));
});

test("Image → Density invents an ellipse cell (Shape-suffixed generator)", () => {
  const api = setup();
  const img = api.create("footageShape", "photo.png");
  const rig = Engine.buildRig("imageDensity", [img]);
  assert.equal(api.getLayerType(rig.shapeId), "basicShape");
  assert.equal(api.getCurrentGeneratorType(rig.shapeId, "generator"), "ellipseShape");
});

test("buildRig rejects an unknown rig key", () => {
  setup();
  assert.throws(() => Engine.buildRig("nope", []), /unknown rig/);
});

test("a footage layer is classified as image, not as the clone target", () => {
  const api = setup();
  const img = api.create("footageShape", "photo.png");
  assert.equal(Engine._isImageLayer(img), true);
  assert.equal(Engine._isCloneTarget(img), false);
  const shape = api.create("basicShape", "S");
  assert.equal(Engine._isCloneTarget(shape), true);
});
