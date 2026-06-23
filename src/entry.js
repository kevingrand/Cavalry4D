"use strict";
// Entry point — only runs inside Cavalry (ui present, no Node module system).
if (typeof ui !== "undefined" && typeof module === "undefined") {
  var MG = (typeof globalThis !== "undefined" ? globalThis : this).MG;

  ui.setTitle("MoGraph");
  ui.setMinimumWidth(300);

  var rootLayout = MG.Panel.build(MG.Engine);
  ui.add(rootLayout);

  function Callbacks() {
    this.onSelectionChanged = function () { MG.Panel.refresh(api.getSelection()); };
  }
  ui.addCallbackObject(new Callbacks());
  MG.Panel.refresh(api.getSelection());
  ui.show();
}
