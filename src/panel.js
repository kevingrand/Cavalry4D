;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Panel = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }

  var COLORS = { clone: "#8BC34A", effector: "#9D7CD8", field: "#4A90D9" };

  var Panel = {
    _buttons: [],
    engine: null,

    _actionButton: function (label, action, color) {
      var b = new ui.Button(label);
      b.setBackgroundColor(color);
      b._action = action;
      Panel._buttons.push(b);
      return b;
    },

    build: function (engine) {
      Panel.engine = engine;
      Panel._buttons = [];
      var rootLayout = new ui.VLayout();
      rootLayout.setSpaceBetween(6);
      rootLayout.setMargins(6, 6, 6, 6);

      // Clone
      rootLayout.addSeparator("Clone");
      var cloneRow = new ui.HLayout();
      var m; for (m in TM().cloners) if (TM().cloners.hasOwnProperty(m)) cloneRow.add(Panel._actionButton(TM().cloners[m].label, "cloner:" + m, COLORS.clone));
      rootLayout.add(cloneRow);

      // Effectors
      rootLayout.addSeparator("Effectors");
      var fxRow = new ui.FlowLayout(4, 4);
      var e; for (e in TM().effectors) if (TM().effectors.hasOwnProperty(e)) fxRow.add(Panel._actionButton(TM().effectors[e].label, "effector:" + e, COLORS.effector));
      rootLayout.add(fxRow);

      // Fields
      rootLayout.addSeparator("Fields");
      var flRow = new ui.FlowLayout(4, 4);
      var f; for (f in TM().fields) if (TM().fields.hasOwnProperty(f)) flRow.add(Panel._actionButton(TM().fields[f].label, "field:" + f, COLORS.field));
      rootLayout.add(flRow);

      // Selection panel (populated in Task 12)
      rootLayout.addSeparator("Selection");
      Panel._selectionInfo = new ui.Label("No selection");
      rootLayout.add(Panel._selectionInfo);

      Panel._wireButtons();
      return rootLayout;
    },

    _wireButtons: function () { /* implemented in Task 11 */ }
  };

  return Panel;
});
