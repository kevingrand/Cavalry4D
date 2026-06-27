"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry, makeUi } = require("./mock-api.js");
const Engine = require("../src/engine.js");
require("../src/typemap.js");
require("../src/selection.js");
const Panel = require("../src/panel.js");

function setupWorld() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  Engine.resetWarnings();
  Engine._muted = {};
}
function visibleQA() {
  return Panel._qaButtons.filter(b => !b.isHidden()).map(b => b._qaKey);
}

test("Quick Actions pool is built and hidden with no selection", () => {
  setupWorld();
  Panel.build(Engine);
  assert.equal(Panel._qaButtons.length, Panel._QA_MAX);
  Panel.refresh([]);
  assert.deepEqual(visibleQA(), []);
  assert.match(Panel._qaLabel.getText(), /Select a layer/);
});

test("selecting a shape shows that category's actions in order", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  Panel.build(Engine);
  Panel.refresh([shape]);
  assert.deepEqual(visibleQA(), global.MG.TypeMap.contextActions.byCategory.shape);
  assert.match(Panel._qaLabel.getText(), /Shape/);
});

test("selecting a text layer shows text actions", () => {
  setupWorld();
  const t = global.api.create("textShape", "Title");
  global.api.setSelection([t]);
  Panel.build(Engine);
  Panel.refresh([t]);
  assert.deepEqual(visibleQA(), global.MG.TypeMap.contextActions.byCategory.text);
});

test("selecting a cloner shows cloner actions", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  global.api.setSelection([clonerId]);
  Panel.build(Engine);
  Panel.refresh([clonerId]);
  assert.deepEqual(visibleQA(), global.MG.TypeMap.contextActions.byCategory.cloner);
});

test("multi shape selection shows multiShapes actions", () => {
  setupWorld();
  const a = global.api.create("basicShape", "A");
  const b = global.api.create("basicShape", "B");
  global.api.setSelection([a, b]);
  Panel.build(Engine);
  Panel.refresh([a, b]);
  assert.deepEqual(visibleQA(), global.MG.TypeMap.contextActions.byCategory.multiShapes);
  assert.match(Panel._qaLabel.getText(), /2 layers/);
});

test("clicking a Quick Action runs it and auto-selects the result", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  Panel.build(Engine);
  Panel.refresh([shape]);
  // first shape action is cloneGrid
  const btn = Panel._qaButtons[0];
  assert.equal(btn._qaKey, "cloneGrid");
  btn.click();
  const sel = global.api.getSelection();
  assert.equal(global.api.getLayerType(sel[0]), "duplicator");   // created cloner auto-selected
});

test("a Quick Action that needs more shows a modal instead of crashing", () => {
  setupWorld();
  const eff = global.api.create("random", "Random Effector 1"); // effector with no cloner downstream
  global.api.setSelection([eff]);
  Panel.build(Engine);
  Panel.refresh([eff]);
  // effector category: toggleMute, addField, duplicate, delete — addField is fine,
  // but force the "need a cloner" path by running addRandom directly.
  Panel._runQuickAction("addRandom");
  assert.ok((global.ui._messages || []).some(m => /Cloner/.test(m)));
});

test("refreshing the pool fires no engine calls (pure UI)", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  let calls = 0;
  const spy = Object.assign(Object.create(Engine), { runContextAction: (...a) => (calls++, Engine.runContextAction(...a)) });
  Panel.build(spy);
  Panel.refresh([shape]);
  assert.equal(calls, 0);   // relabelling must not run any action
});
