"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry, makeUi } = require("./mock-api.js");
const Engine = require("../src/engine.js");
require("../src/typemap.js");
require("../src/selection.js");
const Panel = require("../src/panel.js");

function boot(selection) {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  if (selection) global.api.setSelection(selection);
  Engine.resetWarnings();
}
function row() { return Panel._textPresetRows.find(r => r.key === "revealInShape"); }

test("build registers a text-preset action button", () => {
  boot();
  Panel.build(Engine);
  assert.ok(Panel._buttons.map(b => b._action).includes("text:revealInShape"));
  assert.ok(Panel._buttons.map(b => b._action).includes("text:fillRepeat"));
});

test("fill-repeat checklist lists multiple fill shapes by name", () => {
  boot();
  Panel.build(Engine);
  const star = global.api.create("basicShape", "Star");   // top -> fills
  const mask = global.api.create("basicShape", "Mask");   // bottom -> mask
  Panel.refresh([star, mask]);
  const txt = Panel._textPresetRows.find(r => r.key === "fillRepeat").label.getText();
  assert.match(txt, /✓ Fill shapes \(top layers\): Star/);
  assert.match(txt, /✓ Mask \(bottom layer\): Mask/);
});

test("requirements checklist shows stub lines (with the stack rule) when nothing is selected", () => {
  boot();
  Panel.build(Engine);
  const txt = row().label.getText();
  assert.match(txt, /Fill-in \(top layer\)/);
  assert.match(txt, /Mask \(bottom layer\)/);
  assert.match(txt, /•/);            // both will be auto-stubbed
  assert.doesNotMatch(txt, /✓/);
});

test("requirements checklist shows ✓ with named layers by stack order once inputs are selected", () => {
  boot();
  Panel.build(Engine);
  const fill = global.api.create("textShape", "MyCopy");   // created first -> topmost -> fill-in
  const mask = global.api.create("basicShape", "MyLetter");
  Panel.refresh([fill, mask]);
  const txt = row().label.getText();
  assert.match(txt, /✓ Fill-in \(top layer\): MyCopy/);
  assert.match(txt, /✓ Mask \(bottom layer\): MyLetter/);
});

test("clicking the preset with proper inputs builds the rig and shows no stub note", () => {
  boot();
  const fill = global.api.create("textShape", "Copy");
  const mask = global.api.create("basicShape", "Letter");
  global.api.setSelection([fill, mask]);
  Panel.build(Engine);
  const before = Object.keys(global.api._layers).length;
  Panel._buttons.find(b => b._action === "text:revealInShape").click();
  // built the three reveal nodes
  assert.ok(Object.keys(global.api._layers).length >= before + 3);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
  assert.equal((global.ui._messages || []).length, 0); // nothing stubbed -> no note
});

test("clicking the preset with nothing selected auto-stubs and tells the user", () => {
  boot();
  Panel.build(Engine);
  Panel._buttons.find(b => b._action === "text:revealInShape").click();
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
  const msg = (global.ui._messages || []).join(" ");
  assert.match(msg, /placeholder mask/);
  assert.match(msg, /fill-in text/);
});
