"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry, makeUi } = require("./mock-api.js");
const Engine = require("../src/engine.js");
require("../src/typemap.js");
require("../src/selection.js");
const Panel = require("../src/panel.js");
const TM = global.MG.TypeMap;

function boot(selection) {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  if (selection) global.api.setSelection(selection);
  Engine.resetWarnings();
  Panel.build(Engine);
}

test("build creates maxRows highlight rows, defaults shown and pre-filled", () => {
  boot();
  assert.equal(Panel._highlightRows.length, TM.highlights.maxRows);
  // first two (defaults) visible, the rest hidden
  assert.equal(Panel._highlightRows[0].cont.isHidden(), false);
  assert.equal(Panel._highlightRows[1].cont.isHidden(), false);
  assert.equal(Panel._highlightRows[2].cont.isHidden(), true);
  // pre-filled with the default word + colour
  assert.equal(Panel._highlightRows[0].edit.getText(), "red");
  assert.equal(Panel._highlightRows[0].chip.getColor(), "#EA4336");
});

test("Add Highlight reveals the next hidden row", () => {
  boot();
  assert.equal(Panel._highlightRows[2].cont.isHidden(), true);
  Panel._addHighlightBtn.onClick();
  assert.equal(Panel._highlightRows[2].cont.isHidden(), false);
  assert.equal(Panel._highlightRows[3].cont.isHidden(), true);
});

test("_collectHighlightRows returns only visible, non-empty rows", () => {
  boot();
  Panel._highlightRows[0].edit.setText("hello");
  Panel._highlightRows[1].edit.setText("");      // blanked -> skipped
  const rows = Panel._collectHighlightRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, "hello");
  assert.equal(rows[0].color, "#EA4336");
});

test("Highlight Words on a selected text builds colour behaviours with no warnings", () => {
  const before0 = (() => { global.api = makeApi(); return global.api; })();
  const text = before0.create("textShape", "Copy");
  global.api.setSelection([text]);
  global.cavalry = makeCavalry();
  global.ui = makeUi();
  Engine.resetWarnings();
  Panel.build(Engine);

  const before = Object.keys(global.api._layers).length;
  Panel._highlightBtn.onClick();
  // two default rows -> two applyTextMaterial layers
  assert.ok(Object.keys(global.api._layers).length >= before + 2);
  const types = Object.values(global.api._layers).map(l => l.type);
  assert.equal(types.filter(t => t === "applyTextMaterial").length, 2);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
  assert.equal((global.ui._messages || []).length, 0);  // text selected -> no stub note
});

test("Bold Highlights builds typeface behaviours for the same words", () => {
  boot();
  const text = global.api.create("textShape", "Copy");
  global.api.setSelection([text]);
  Panel._boldBtn.onClick();
  const types = Object.values(global.api._layers).map(l => l.type);
  assert.equal(types.filter(t => t === "applyTypeface").length, 2);
  assert.equal(Engine.warnings.length, 0, Engine.warnings.join("; "));
});

test("clicking with every row blank warns instead of building", () => {
  boot();
  Panel._highlightRows.forEach(r => r.edit.setText(""));
  Panel._highlightBtn.onClick();
  const msg = (global.ui._messages || []).join(" ");
  assert.match(msg, /at least one word/);
});
