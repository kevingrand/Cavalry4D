"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeUi } = require("./mock-api.js");
require("../src/typemap.js");
const Panel = require("../src/panel.js");

function spyEngine() {
  const calls = [];
  return {
    calls,
    createCloner: (...a) => (calls.push(["createCloner", ...a]), { clonerId: "duplicator#1" }),
    addEffector: (...a) => (calls.push(["addEffector", ...a]), { effectorId: "random#1", comboIds: [] }),
    addField: (...a) => (calls.push(["addField", ...a]), { fieldId: "falloff#1", extraIds: [] }),
    setEffectorChannels: (...a) => calls.push(["setEffectorChannels", ...a])
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
