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
function gridRow() { return Panel._gridPresetRows.find(r => r.key === "shapeSwap"); }

test("build registers the Grid FX action button", () => {
  boot();
  Panel.build(Engine);
  assert.ok(Panel._buttons.map(b => b._action).includes("grid:shapeSwap"));
});

test("grid checklist shows stub lines when nothing is selected", () => {
  boot();
  Panel.build(Engine);
  const txt = gridRow().label.getText();
  assert.match(txt, /Region shape \(top\)/);
  assert.match(txt, /Base shape \(middle\)/);
  assert.match(txt, /Mask region \(bottom\)/);
  assert.match(txt, /•/);            // all three will be auto-stubbed
});

test("grid checklist shows ✓ named layers by stack order once three shapes are selected", () => {
  boot();
  Panel.build(Engine);
  const region = global.api.create("basicShape", "MyRegion");  // top
  const base = global.api.create("basicShape", "MyBase");
  const mask = global.api.create("basicShape", "MyMask");      // bottom
  Panel.refresh([region, base, mask]);
  const txt = gridRow().label.getText();
  assert.match(txt, /✓ Region shape \(top\): MyRegion/);
  assert.match(txt, /✓ Base shape \(middle\): MyBase/);
  assert.match(txt, /✓ Mask region \(bottom\): MyMask/);
});

test("clicking Shape Swap Grid with three shapes builds two grids, no stub note", () => {
  boot();
  const region = global.api.create("basicShape", "Region");
  const base = global.api.create("basicShape", "Base");
  const mask = global.api.create("basicShape", "Mask");
  global.api.setSelection([region, base, mask]);
  Panel.build(Engine);
  const before = Object.keys(global.api._layers).length;
  Panel._buttons.find(b => b._action === "grid:shapeSwap").click();
  assert.ok(Object.keys(global.api._layers).length >= before + 2);  // two duplicators
  const types = Object.values(global.api._layers).map(l => l.type);
  assert.equal(types.filter(t => t === "duplicator").length, 2);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
  assert.equal((global.ui._messages || []).length, 0);
});

test("clicking with nothing selected auto-stubs and tells the user", () => {
  boot();
  Panel.build(Engine);
  Panel._buttons.find(b => b._action === "grid:shapeSwap").click();
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
  const msg = (global.ui._messages || []).join(" ");
  assert.match(msg, /placeholder base shape/);
  assert.match(msg, /placeholder region shape/);
  assert.match(msg, /placeholder mask/);
});
