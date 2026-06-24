"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
const Engine = require("../src/engine.js");
const TM = global.MG.TypeMap;

function setup() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  Engine.resetWarnings();
  return global.api;
}
function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
function drives(api, from, to) {
  return api.getOutConnections(from, "id").some(o => layerOf(o) === to);
}

// ---- highlightWords: colour behaviours on a selected text -------------------

test("highlightWords builds one applyTextMaterial per filled row, wired to the text", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  const rows = [{ word: "red", color: "#EA4336" }, { word: "blue", color: "#4285F4" }];
  const r = Engine.highlightWords([text], rows);

  assert.equal(r.ok, true);
  assert.equal(r.textId, text);
  assert.equal(r.stubbed, false);
  assert.equal(r.materialIds.length, 2);
  r.materialIds.forEach(id => assert.equal(api.getLayerType(id), "applyTextMaterial"));
  r.materialIds.forEach(id => assert.ok(drives(api, id, text), id + " -> text"));
  // both register on the text's materialBehaviours list input
  const inAttrs = api.getInConnectedAttributes(text);
  assert.equal(inAttrs.filter(a => a === "materialBehaviours").length, 2);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("highlightWords sets the verified attrs: capture-group regex, mode 0, indexMode 2, colour", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  const r = Engine.highlightWords([text], [{ word: "red", color: "#EA4336" }]);
  const atm = r.materialIds[0];
  assert.equal(api.get(atm, "regex"), "(red)");
  assert.equal(api.get(atm, "mode"), 0);
  assert.equal(api.get(atm, "indexMode"), 2);
  assert.equal(api.get(atm, "material.materialColor"), "#EA4336");
});

test("highlightWords treats the word literally: regex metacharacters are escaped", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  const r = Engine.highlightWords([text], [{ word: "a.b+c", color: "#fff" }]);
  assert.equal(api.get(r.materialIds[0], "regex"), "(a\\.b\\+c)");
});

test("highlightWords skips blank-word rows and falls back to a seed colour", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  const r = Engine.highlightWords([text], [
    { word: "  ", color: "#111" },           // blank -> skipped
    { word: "keep" }                          // no colour -> seed
  ]);
  assert.equal(r.materialIds.length, 1);
  assert.equal(api.get(r.materialIds[0], "regex"), "(keep)");
  assert.equal(api.get(r.materialIds[0], "material.materialColor"), TM.highlights.seedColors[1]);
});

test("highlightWords with no text selected stubs a sample text and still wires", () => {
  const api = setup();
  const r = Engine.highlightWords([], [{ word: "red", color: "#EA4336" }]);
  assert.equal(r.stubbed, true);
  assert.equal(api.getLayerType(r.textId), "textShape");
  assert.equal(api.get(r.textId, "text"), TM.highlights.sampleText);
  assert.ok(drives(api, r.materialIds[0], r.textId));
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("highlightWords with a non-text selection also stubs a sample (text required)", () => {
  const api = setup();
  const shape = api.create("basicShape", "Circle");
  const r = Engine.highlightWords([shape], [{ word: "red", color: "#EA4336" }]);
  assert.equal(r.stubbed, true);
  assert.notEqual(r.textId, shape);
  assert.equal(api.getLayerType(r.textId), "textShape");
});

// ---- boldWords: typeface behaviours -----------------------------------------

test("boldWords builds applyTypeface per word, wired to styleBehaviours, zero warnings", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  const r = Engine.boldWords([text], ["red", "blue"]);
  assert.equal(r.ok, true);
  assert.equal(r.typefaceIds.length, 2);
  r.typefaceIds.forEach(id => assert.equal(api.getLayerType(id), "applyTypeface"));
  r.typefaceIds.forEach(id => assert.ok(drives(api, id, text)));
  const inAttrs = api.getInConnectedAttributes(text);
  assert.equal(inAttrs.filter(a => a === "styleBehaviours").length, 2);
  assert.equal(api.get(r.typefaceIds[0], "regex"), "(red)");
  assert.equal(api.get(r.typefaceIds[0], "mode"), 0);
  assert.equal(api.get(r.typefaceIds[0], "indexMode"), 2);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("boldWords keeps the body text's own font family, only changing the weight", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  api.set(text, { "font": { font: "Inter", style: "Regular" } });
  const r = Engine.boldWords([text], ["red"]);
  assert.deepEqual(api.get(r.typefaceIds[0], "font"), { font: "Inter", style: TM.highlights.boldStyle });
});

test("boldWords skips blank words", () => {
  const api = setup();
  const text = api.create("textShape", "Body");
  const r = Engine.boldWords([text], ["", "  ", "real"]);
  assert.equal(r.typefaceIds.length, 1);
  assert.equal(api.get(r.typefaceIds[0], "regex"), "(real)");
});
