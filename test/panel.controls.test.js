"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry, makeUi } = require("./mock-api.js");
const Engine = require("../src/engine.js");
require("../src/typemap.js");
require("../src/selection.js");
const Panel = require("../src/panel.js");

// Build real layers with the real Engine, then drive the panel with a spy so we
// can assert which engine method a widget interaction calls.
function spyEngine(real) {
  const calls = [];
  const wrap = (name, ret) => (...a) => (calls.push([name, ...a]), ret(...a));
  return {
    calls,
    createCloner: wrap("createCloner", (...a) => real.createCloner(...a)),
    addEffector: wrap("addEffector", (...a) => real.addEffector(...a)),
    addField: wrap("addField", (...a) => real.addField(...a)),
    applyPreset: wrap("applyPreset", () => ({ clonerId: "duplicator#9", effectorId: "random#9", fieldId: null })),
    switchDistribution: wrap("switchDistribution", (id, mode) => ({ clonerId: id, mode })),
    setPathShape: wrap("setPathShape", () => ({ ok: true })),
    setEffectorStrength: wrap("setEffectorStrength", () => true),
    setEffectorAmount: wrap("setEffectorAmount", () => true),
    setEffectorMuted: wrap("setEffectorMuted", () => true),
    isEffectorMuted: () => false,
    setFieldStrength: wrap("setFieldStrength", () => true),
    setFieldProbability: wrap("setFieldProbability", () => true),
    buildRig: wrap("buildRig", (key) => ({ clonerId: "duplicator#9", samplerId: "imageSampler#1", shapeId: "basicShape#1", imageUsed: key === "withimg" }))
  };
}

function findBtn(action) { return Panel._buttons.find(b => b._action === action); }

function setupWorld() {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  Engine.resetWarnings();
  Engine._muted = {};
}

test("panel has a preset button for every preset", () => {
  setupWorld();
  Panel.build(spyEngine(Engine));
  const TM = global.MG.TypeMap;
  TM.presets.forEach(p => assert.ok(findBtn("preset:" + p.key), "missing preset button " + p.key));
});

test("clicking a preset with a shape selected calls applyPreset and auto-selects the cloner", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  findBtn("preset:scatter").click();
  assert.deepEqual(eng.calls[0], ["applyPreset", "scatter", [shape]]);
  assert.deepEqual(global.api.getSelection(), ["duplicator#9"]); // auto-selected
});

test("clicking a cloner button auto-selects the created cloner", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  global.api.setSelection([shape]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  findBtn("cloner:grid").click();
  const sel = global.api.getSelection();
  assert.equal(sel.length, 1);
  assert.equal(global.api.getLayerType(sel[0]), "duplicator"); // the new cloner is selected
});

test("changing the distribution dropdown calls switchDistribution", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  global.api.setSelection([clonerId]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  Panel.refresh([clonerId]);
  assert.equal(Panel._distRow.isHidden(), false); // shown for a cloner
  Panel._distDD.change(1); // index 1 = radial
  assert.deepEqual(eng.calls.find(c => c[0] === "switchDistribution"), ["switchDistribution", clonerId, "radial"]);
});

test("strength slider calls setEffectorStrength; amount slider calls setEffectorAmount", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  global.api.setSelection([effectorId]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  Panel.refresh([effectorId]);
  assert.equal(Panel._strengthRow.isHidden(), false);
  assert.equal(Panel._amountRow.isHidden(), false);
  Panel._strengthSlider.change(33);
  Panel._amountSlider.change(150);
  assert.deepEqual(eng.calls.find(c => c[0] === "setEffectorStrength"), ["setEffectorStrength", effectorId, 33]);
  assert.deepEqual(eng.calls.find(c => c[0] === "setEffectorAmount"), ["setEffectorAmount", effectorId, 150]);
});

test("programmatic refresh of sliders does not fire engine calls (suspend guard)", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  global.api.setSelection([effectorId]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  Panel.refresh([effectorId]); // sets slider values internally
  assert.equal(eng.calls.filter(c => c[0] === "setEffectorStrength" || c[0] === "setEffectorAmount").length, 0);
});

test("mute button toggles setEffectorMuted and updates its label", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("random", clonerId);
  global.api.setSelection([effectorId]);
  // use REAL engine here so isEffectorMuted reflects state
  Panel.build(Engine);
  Panel.refresh([effectorId]);
  assert.equal(Panel._muteBtn.getText(), "Mute");
  Panel._muteBtn.click();
  assert.equal(Engine.isEffectorMuted(effectorId), true);
  assert.equal(Panel._muteBtn.getText(), "Unmute");
  Panel._muteBtn.click();
  assert.equal(Engine.isEffectorMuted(effectorId), false);
});

test("shader effector hides strength/amount controls", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("shader", clonerId);
  global.api.setSelection([effectorId]);
  Panel.build(Engine);
  Panel.refresh([effectorId]);
  assert.equal(Panel._strengthRow.isHidden(), true);
  assert.equal(Panel._amountRow.isHidden(), true);
});

test("pick path: arm on an object cloner, then set the path shape", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("object", [shape]);
  global.api.setSelection([clonerId]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  Panel.refresh([clonerId]);
  assert.equal(Panel._pathBtn.isHidden(), false);        // object cloner => path button shown
  assert.equal(Panel._pathBtn.getText(), "Pick Path Shape");

  Panel._pathBtn.click();                                 // arm
  assert.equal(Panel._armedPathCloner, clonerId);
  assert.equal(Panel._pathBtn.getText(), "Set Path");

  const path = global.api.create("basicShape", "Curve");  // user selects the curve
  global.api.setSelection([path]);
  Panel.refresh([path]);                                   // selection-change refresh
  assert.equal(Panel._pathBtn.isHidden(), false);          // still visible while armed

  Panel._pathBtn.click();                                  // set path
  assert.deepEqual(eng.calls.find(c => c[0] === "setPathShape"), ["setPathShape", clonerId, path]);
  assert.equal(Panel._armedPathCloner, null);
});

test("path button hidden for a grid cloner", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  global.api.setSelection([clonerId]);
  Panel.build(Engine);
  Panel.refresh([clonerId]);
  assert.equal(Panel._pathBtn.isHidden(), true);
});

test("path button shown for an On-Edges cloner too", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("onEdges", [shape]);
  global.api.setSelection([clonerId]);
  Panel.build(Engine);
  Panel.refresh([clonerId]);
  assert.equal(Panel._pathBtn.isHidden(), false);
});

test("panel has buttons for the new cloners and effectors", () => {
  setupWorld();
  Panel.build(spyEngine(Engine));
  ["cloner:scatter", "cloner:honeycomb", "cloner:onEdges", "effector:noise", "effector:target"]
    .forEach(a => assert.ok(findBtn(a), "missing button " + a));
});

test("selecting a field shows field controls and wires strength + probability", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  const { effectorId } = Engine.addEffector("plain", clonerId);
  const { fieldId } = Engine.addField("spherical", effectorId, clonerId);
  global.api.setSelection([fieldId]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  Panel.refresh([fieldId]);
  assert.equal(Panel._fieldStrengthRow.isHidden(), false);
  assert.equal(Panel._fieldProbRow.isHidden(), false);
  // effector controls hidden for a field
  assert.equal(Panel._strengthRow.isHidden(), true);
  Panel._fieldStrengthSlider.change(35);
  Panel._fieldProbCheck.change(true);
  assert.deepEqual(eng.calls.find(c => c[0] === "setFieldStrength"), ["setFieldStrength", fieldId, 35]);
  assert.deepEqual(eng.calls.find(c => c[0] === "setFieldProbability"), ["setFieldProbability", fieldId, true]);
});

test("panel has a button for each smart rig", () => {
  setupWorld();
  Panel.build(spyEngine(Engine));
  global.MG.TypeMap.rigs.forEach(r => assert.ok(findBtn("rig:" + r.key), "missing rig button " + r.key));
});

test("clicking a rig calls buildRig, auto-selects the cloner, and prompts when no image used", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Cell");
  global.api.setSelection([shape]);
  const eng = spyEngine(Engine);
  Panel.build(eng);
  findBtn("rig:imageSize").click();
  assert.deepEqual(eng.calls[0], ["buildRig", "imageSize", [shape]]);
  assert.deepEqual(global.api.getSelection(), ["duplicator#9"]);     // auto-selected
  assert.ok((global.ui._messages || []).some(m => m.indexOf("Image Sampler") >= 0)); // no-image prompt
});

test("target effector button auto-selects the new effector", () => {
  setupWorld();
  const shape = global.api.create("basicShape", "Box");
  const { clonerId } = Engine.createCloner("grid", [shape]);
  global.api.setSelection([clonerId]);
  Panel.build(Engine);          // real engine so a real lookAt + null are made
  findBtn("effector:target").click();
  const sel = global.api.getSelection();
  assert.equal(global.api.getLayerType(sel[0]), "lookAt");
});
