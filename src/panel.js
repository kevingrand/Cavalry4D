;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Panel = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); require("./selection"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }

  var COLORS = { clone: "#8BC34A", effector: "#9D7CD8", field: "#4A90D9" };

  var Panel = {
    _buttons: [],
    engine: null,
    _modal: null,

    _actionButton: function (label, action, color) {
      var b = new ui.Button(label);
      b.setBackgroundColor(color);
      b._action = action;
      Panel._buttons.push(b);
      return b;
    },

    _resolveCloner: function (selId) {
      if (!selId) return null;
      var d = root.MG.Selection.describe(selId);
      if (d.role === "cloner") return selId;
      if (d.role === "effector") return Panel._clonerFromOutputs(selId, {});
      return null;
    },

    // Walk an effector's out-connections to its duplicator, following through any
    // `math` combiner (a fielded Random effector drives the cloner via a math node).
    _clonerFromOutputs: function (layerId, seen) {
      if (seen[layerId]) return null;
      seen[layerId] = true;
      var outs = api.getOutConnections(layerId, "id");
      var i;
      for (i = 0; i < outs.length; i++) if (api.getLayerType(outs[i]) === "duplicator") return outs[i];
      for (i = 0; i < outs.length; i++) {
        if (api.getLayerType(outs[i]) === "math") {
          var c = Panel._clonerFromOutputs(outs[i], seen);
          if (c) return c;
        }
      }
      return null;
    },

    _resolveEffector: function (selId) {
      if (!selId) return null;
      var d = root.MG.Selection.describe(selId);
      if (d.role === "effector") return selId;
      return null;
    },

    build: function (engine) {
      Panel.engine = engine;
      Panel._buttons = [];
      Panel._modal = new ui.Modal();
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

    refresh: function (selectionIds) {
      var id = selectionIds && selectionIds[0];
      if (!id) { Panel._selectionInfo.setText("No selection"); return; }
      var d = root.MG.Selection.describe(id);
      if (d.role === "cloner") {
        var txt = "Cloner (" + (d.mode || "?") + ") · " + d.effectors.length + " effector(s)";
        for (var i = 0; i < d.effectors.length; i++) {
          var ef = d.effectors[i];
          txt += "\n• " + (ef.type || "?") + (ef.fields.length ? " → " + ef.fields[0].type : "");
        }
        Panel._selectionInfo.setText(txt);
      } else {
        Panel._selectionInfo.setText(d.role + " selected");
      }
    },

    _wireButtons: function () {
      Panel._buttons.forEach(function (btn) {
        var parts = btn._action.split(":");
        var kind = parts[0], name = parts[1];
        btn.onClick = function () {
          var sel = api.getSelection();
          var first = sel[0] || null;
          if (kind === "cloner") {
            if (!first) { Panel._modal.showMessage("Select an object to clone."); return; }
            Panel.engine.createCloner(name, sel);
          } else if (kind === "effector") {
            var clonerId = Panel._resolveCloner(first);
            if (!clonerId) { Panel._modal.showMessage("Select a Cloner first."); return; }
            Panel.engine.addEffector(name, clonerId);
          } else if (kind === "field") {
            var effId = Panel._resolveEffector(first);
            if (!effId) { Panel._modal.showMessage("Select an Effector first."); return; }
            var cloner = Panel._resolveCloner(effId);
            Panel.engine.addField(name, effId, cloner);
          }
          if (typeof Panel.refresh === "function") Panel.refresh(api.getSelection());
        };
      });
    }
  };

  return Panel;
});
