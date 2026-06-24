"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry, makeUi } = require("./mock-api.js");
const Engine = require("../src/engine.js");
require("../src/typemap.js");
require("../src/selection.js");
const Panel = require("../src/panel.js");

function spyEngine() {
  const calls = [];
  return {
    calls,
    createCloner: (...a) => (calls.push(["createCloner", ...a]), { clonerId: "duplicator#1" }),
    addEffector: (...a) => (calls.push(["addEffector", ...a]), { effectorId: "random#1", extraIds: [] }),
    addField: (...a) => (calls.push(["addField", ...a]), { fieldId: "falloff#1", extraIds: [] }),
    setEffectorChannels: (...a) => calls.push(["setEffectorChannels", ...a]),
    applyPreset: (...a) => (calls.push(["applyPreset", ...a]), { clonerId: "duplicator#1", effectorId: "random#1", fieldId: null }),
    switchDistribution: (...a) => (calls.push(["switchDistribution", ...a]), { clonerId: a[0], mode: a[1] }),
    setPathShape: (...a) => (calls.push(["setPathShape", ...a]), { ok: true }),
    setEffectorStrength: (...a) => (calls.push(["setEffectorStrength", ...a]), true),
    setEffectorAmount: (...a) => (calls.push(["setEffectorAmount", ...a]), true),
    setEffectorMuted: (...a) => (calls.push(["setEffectorMuted", ...a]), true),
    isEffectorMuted: () => false
  };
}

test("build creates a tagged action button for every cloner mode, effector, and field", () => {
  global.ui = makeUi();
  Panel.build(spyEngine());
  const actions = Panel._buttons.map(b => b._action).sort();
  assert.ok(actions.includes("cloner:grid"));
  assert.ok(actions.includes("cloner:object"));
  assert.ok(actions.includes("effector:random"));
  assert.ok(actions.includes("effector:shader"));
  assert.ok(actions.includes("field:spherical"));
  assert.ok(actions.includes("field:random"));
});

test("clicking a cloner button with a shape selected calls engine.createCloner", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "cloner:grid").click();
  assert.deepEqual(eng.calls[0], ["createCloner", "grid", [shape]]);
});

test("clicking an effector button with nothing selected shows a modal and does not call engine", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "effector:random").click();
  assert.equal(eng.calls.length, 0);
  assert.equal(global.ui._messages[0], "Select a Cloner first.");
});

test("clicking an effector button with a duplicator selected calls engine.addEffector", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  global.api.setSelection([clonerId]);
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "effector:random").click();
  assert.deepEqual(eng.calls[0], ["addEffector", "random", clonerId]);
});

test("clicking a field button with nothing selected shows the effector guard modal", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "field:spherical").click();
  assert.equal(eng.calls.length, 0);
  assert.equal(global.ui._messages[0], "Select an Effector first.");
});

test("clicking a field button with an effector selected calls engine.addField with the resolved cloner", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  global.api.setSelection([effectorId]);
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "field:spherical").click();
  assert.deepEqual(eng.calls[0], ["addField", "spherical", effectorId, clonerId]);
});

test("effector button resolves the cloner for a fielded Random effector", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId, { rotation: true, position: false, scale: false });
  Engine.addField("spherical", effectorId, clonerId); // field -> random.falloffs; random still drives the cloner directly
  global.api.setSelection([effectorId]);
  const eng = spyEngine();
  Panel.build(eng);
  Panel._buttons.find(b => b._action === "effector:plain").click();
  assert.deepEqual(eng.calls[0], ["addEffector", "plain", clonerId]);
  assert.equal((global.ui._messages || []).length, 0);
});

test("a field on a Shader effector shows the unsupported modal", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("shader", clonerId);
  global.api.setSelection([effectorId]);
  Panel.build(Engine);                                 // real engine so addField runs
  Panel._buttons.find(b => b._action === "field:box").click();
  assert.ok((global.ui._messages || []).some(m => m.indexOf("doesn't support") >= 0));
});

test("refresh summarizes the selected cloner and its effectors", () => {
  global.api = makeApi(); global.cavalry = makeCavalry(); global.ui = makeUi();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  Engine.addEffector("plain", clonerId);
  Panel.build(spyEngine());
  Panel.refresh([clonerId]);
  assert.match(Panel._selectionInfo.getText(), /Cloner \(grid\)/);
  assert.match(Panel._selectionInfo.getText(), /plain/);
});
