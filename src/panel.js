;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Panel = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); require("./selection"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }
  function layerOf(s) { return s ? String(s).split(".")[0] : ""; }

  var COLORS = { clone: "#8BC34A", effector: "#9D7CD8", field: "#4A90D9", preset: "#E0934A", rig: "#3AAFA9", text: "#C77DBB" };

  var Panel = {
    _buttons: [],
    engine: null,
    _modal: null,
    _suspend: false,     // guard: programmatic widget updates must not fire engine calls

    // A hideable labelled control row. Wrapped in ui.Container because only
    // widgets support setHidden — bare layouts do not (verified live).
    _row: function (labelText, control) {
      var inner = new ui.HLayout();
      inner.add(new ui.Label(labelText));
      inner.add(control);
      var c = new ui.Container();
      c.setLayout(inner);
      return c;
    },

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
      if (d.role === "effector") {
        var outs = api.getOutConnections(selId, "id");
        for (var i = 0; i < outs.length; i++) { var L = layerOf(outs[i]); if (api.getLayerType(L) === "duplicator") return L; }
      }
      return null;
    },

    _resolveEffector: function (selId) {
      if (!selId) return null;
      var d = root.MG.Selection.describe(selId);
      if (d.role === "effector") return selId;
      return null;
    },

    // A cloner mode that distributes along a picked path/curve (Object, On Edges).
    _clonerNeedsPath: function (mode) {
      return !!(mode && TM().cloners[mode] && TM().cloners[mode].needsTarget);
    },

    _resolveField: function (selId) {
      if (!selId) return null;
      return root.MG.Selection.describe(selId).role === "field" ? selId : null;
    },

    // Re-select a layer and refresh the panel context for it.
    _selectAndRefresh: function (id) {
      if (id) api.select([id]);
      if (typeof Panel.refresh === "function") Panel.refresh(api.getSelection());
    },

    build: function (engine) {
      Panel.engine = engine;
      Panel._buttons = [];
      Panel._modal = new ui.Modal();
      var rootLayout = new ui.VLayout();
      rootLayout.setSpaceBetween(6);
      rootLayout.setMargins(6, 6, 6, 6);

      // Clone (FlowLayout so the 7 modes wrap instead of overflowing one row)
      rootLayout.addSeparator("Clone");
      var cloneRow = new ui.FlowLayout(4, 4);
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

      // Presets
      rootLayout.addSeparator("Presets");
      var prRow = new ui.HLayout();
      var presets = TM().presets;
      for (var p = 0; p < presets.length; p++) prRow.add(Panel._actionButton(presets[p].label, "preset:" + presets[p].key, COLORS.preset));
      rootLayout.add(prRow);

      // Smart Rigs
      rootLayout.addSeparator("Rigs");
      var rigRow = new ui.FlowLayout(4, 4);
      var rigs = TM().rigs;
      for (var r = 0; r < rigs.length; r++) {
        var rb = Panel._actionButton(rigs[r].label, "rig:" + rigs[r].key, COLORS.rig);
        rb.setToolTip(rigs[r].hint);
        rigRow.add(rb);
      }
      rootLayout.add(rigRow);

      // Text Presets: each declares prerequisites, so under its Build button sits
      // a live requirements checklist (re-validated on every selection change) that
      // tells the user what to prepare before clicking — and what will be stubbed.
      rootLayout.addSeparator("Text Presets");
      Panel._textPresetRows = [];
      var tps = TM().textPresets || [];
      for (var t = 0; t < tps.length; t++) {
        (function (spec) {
          var inner = new ui.VLayout();
          inner.setSpaceBetween(2);
          var btn = Panel._actionButton(spec.label, "text:" + spec.key, COLORS.text);
          btn.setToolTip(spec.hint);
          inner.add(btn);
          var reqLabel = new ui.Label("");
          inner.add(reqLabel);
          var cont = new ui.Container();
          cont.setLayout(inner);
          rootLayout.add(cont);
          Panel._textPresetRows.push({ key: spec.key, spec: spec, label: reqLabel });
        })(tps[t]);
      }

      // Add-ons: effects that aren't role-stack presets. Highlight Words recolours
      // (and optionally bolds) specific words in a text shape via native, editable
      // text behaviours. The user types a word + picks a colour per row; "Add
      // Highlight" reveals another row (up to maxRows). With no text selected a
      // sample is created so the result is always visible.
      rootLayout.addSeparator("Add-ons");
      var H = TM().highlights || { maxRows: 0, defaultRows: [], seedColors: [] };
      rootLayout.add(new ui.Label("Highlight Words: type a word + pick a colour per row, then click Highlight Words. Bold Highlights bolds the same words. No text selected = a sample is built."));

      Panel._highlightRows = [];
      var defaults = H.defaultRows || [], seeds = H.seedColors || [];
      var shown = defaults.length || 2;
      for (var hr = 0; hr < (H.maxRows || 0); hr++) {
        var rowL = new ui.HLayout();
        var le = new ui.LineEdit();
        if (typeof le.setPlaceholder === "function") le.setPlaceholder("word to highlight");
        if (defaults[hr]) le.setText(defaults[hr].word);
        var chip = new ui.ColorChip();
        var seed = defaults[hr] ? defaults[hr].color : seeds[hr % (seeds.length || 1)];
        chip.setColor(seed);   // ColorChip uses setColor/getColor (NOT setValue) — verified live
        rowL.add(le); rowL.add(chip);
        var rowC = new ui.Container();
        rowC.setLayout(rowL);
        if (typeof rowC.setHidden === "function") rowC.setHidden(hr >= shown);   // reveal first `shown` rows
        rootLayout.add(rowC);
        Panel._highlightRows.push({ edit: le, chip: chip, cont: rowC });
      }

      Panel._addHighlightBtn = new ui.Button("+ Add Highlight");
      Panel._addHighlightBtn.setToolTip("Reveal another word + colour row.");
      Panel._addHighlightBtn.onClick = function () {
        for (var i = 0; i < Panel._highlightRows.length; i++) {
          var c = Panel._highlightRows[i].cont;
          if (c && typeof c.isHidden === "function" && c.isHidden()) { c.setHidden(false); break; }
        }
      };
      rootLayout.add(Panel._addHighlightBtn);

      var hlRow = new ui.HLayout();
      Panel._highlightBtn = new ui.Button("Highlight Words");
      Panel._highlightBtn.setBackgroundColor(COLORS.text);
      Panel._highlightBtn.setToolTip("Recolour the words above in the selected text (or a sample).");
      Panel._highlightBtn.onClick = function () {
        var rows = Panel._collectHighlightRows();
        if (!rows.length) { Panel._modal.showMessage("Type at least one word (and pick a colour) in the Add-ons rows."); return; }
        var res = Panel.engine.highlightWords(api.getSelection(), rows);
        Panel._selectAndRefresh(res && res.textId);
        if (res && res.stubbed) Panel._modal.showMessage("No text selected — built a sample with your words highlighted. Replace the text with your own; the highlights follow the words you typed.");
      };
      hlRow.add(Panel._highlightBtn);

      Panel._boldBtn = new ui.Button("Bold Highlights");
      Panel._boldBtn.setBackgroundColor(COLORS.text);
      Panel._boldBtn.setToolTip("Bold the same words (optional, runs on top of Highlight Words).");
      Panel._boldBtn.onClick = function () {
        var rows = Panel._collectHighlightRows();
        if (!rows.length) { Panel._modal.showMessage("Type at least one word in the Add-ons rows to bold."); return; }
        var words = []; for (var i = 0; i < rows.length; i++) words.push(rows[i].word);
        var res = Panel.engine.boldWords(api.getSelection(), words);
        Panel._selectAndRefresh(res && res.textId);
        if (res && res.stubbed) Panel._modal.showMessage("No text selected — built a sample with your words bolded.");
      };
      hlRow.add(Panel._boldBtn);
      rootLayout.add(hlRow);

      // ---- Context section (shown/hidden per selection) ------------------
      rootLayout.addSeparator("Selection");
      Panel._selectionInfo = new ui.Label("No selection");
      rootLayout.add(Panel._selectionInfo);

      // Distribution switcher (cloner context). Context rows are wrapped in a
      // ui.Container because only widgets (not layouts) support setHidden.
      Panel._distDD = new ui.DropDown();
      var order = TM().distributionOrder;
      for (var i = 0; i < order.length; i++) Panel._distDD.addEntry(TM().cloners[order[i]].label);
      Panel._distDD.onValueChanged = function () {
        if (Panel._suspend) return;
        var sel = api.getSelection(); var cl = Panel._resolveCloner(sel[0]);
        if (!cl) return;
        var mode = TM().distributionOrder[Panel._distDD.getValue()];
        Panel.engine.switchDistribution(cl, mode);
        Panel._selectAndRefresh(cl);
      };
      Panel._distRow = Panel._row("Distribution", Panel._distDD);
      rootLayout.add(Panel._distRow);

      // Pick path shape (object-cloner context). Two-step "arm then pick" so the
      // flow survives the selection change when the user clicks the curve shape.
      Panel._armedPathCloner = null;
      Panel._pathBtn = new ui.Button("Pick Path Shape");
      Panel._pathBtn.setToolTip("Click to arm, then select the path/curve shape and click 'Set Path'.");
      Panel._pathBtn.onClick = function () {
        var sel = api.getSelection(); var first = sel[0] || null;
        if (Panel._armedPathCloner) {
          if (!first || first === Panel._armedPathCloner) { Panel._modal.showMessage("Select the path/curve shape to distribute along, then click 'Set Path'."); return; }
          Panel.engine.setPathShape(Panel._armedPathCloner, first);
          var cl = Panel._armedPathCloner; Panel._armedPathCloner = null;
          Panel._selectAndRefresh(cl);
        } else {
          var cloner = Panel._resolveCloner(first);
          if (!cloner || !Panel._clonerNeedsPath(root.MG.Selection.describe(cloner).mode)) { Panel._modal.showMessage("Select an Object or On-Edges cloner first."); return; }
          Panel._armedPathCloner = cloner;
          Panel._modal.showMessage("Now select the path/curve shape, then click 'Set Path'.");
          Panel.refresh(api.getSelection());
        }
      };
      rootLayout.add(Panel._pathBtn);

      // Effector controls (effector context)
      Panel._strengthSlider = new ui.Slider();
      Panel._strengthSlider.setRange(0, 100);
      Panel._strengthSlider.onValueChanged = function () {
        if (Panel._suspend) return;
        var eff = Panel._resolveEffector(api.getSelection()[0]);
        if (eff) Panel.engine.setEffectorStrength(eff, Panel._strengthSlider.getValue());
      };
      Panel._strengthRow = Panel._row("Strength", Panel._strengthSlider);
      rootLayout.add(Panel._strengthRow);

      Panel._amountSlider = new ui.Slider();
      Panel._amountSlider.setRange(0, 500);
      Panel._amountSlider.onValueChanged = function () {
        if (Panel._suspend) return;
        var eff = Panel._resolveEffector(api.getSelection()[0]);
        if (eff) Panel.engine.setEffectorAmount(eff, Panel._amountSlider.getValue());
      };
      Panel._amountRow = Panel._row("Amount", Panel._amountSlider);
      rootLayout.add(Panel._amountRow);

      Panel._muteBtn = new ui.Button("Mute");
      Panel._muteBtn.onClick = function () {
        var eff = Panel._resolveEffector(api.getSelection()[0]);
        if (!eff) return;
        var nowMuted = !Panel.engine.isEffectorMuted(eff);
        Panel.engine.setEffectorMuted(eff, nowMuted);
        Panel.refresh(api.getSelection());
      };
      rootLayout.add(Panel._muteBtn);

      // Field controls (field/falloff context): strength + probability toggle
      Panel._fieldStrengthSlider = new ui.Slider();
      Panel._fieldStrengthSlider.setRange(0, 100);
      Panel._fieldStrengthSlider.onValueChanged = function () {
        if (Panel._suspend) return;
        var fld = Panel._resolveField(api.getSelection()[0]);
        if (fld) Panel.engine.setFieldStrength(fld, Panel._fieldStrengthSlider.getValue());
      };
      Panel._fieldStrengthRow = Panel._row("Field Strength", Panel._fieldStrengthSlider);
      rootLayout.add(Panel._fieldStrengthRow);

      Panel._fieldProbCheck = new ui.Checkbox(false);
      Panel._fieldProbCheck.onValueChanged = function () {
        if (Panel._suspend) return;
        var fld = Panel._resolveField(api.getSelection()[0]);
        if (fld) Panel.engine.setFieldProbability(fld, Panel._fieldProbCheck.getValue());
      };
      Panel._fieldProbRow = Panel._row("Probability", Panel._fieldProbCheck);
      rootLayout.add(Panel._fieldProbRow);

      Panel._wireButtons();
      Panel._showContext(null);          // hide context controls initially
      Panel._refreshPathButton(null, null);
      Panel._refreshTextPresets((typeof api !== "undefined" && api.getSelection) ? api.getSelection() : []);
      return rootLayout;
    },

    // Live requirements checklist: re-validate each Text Preset against the current
    // selection and render one ✓ / • / ✗ line per requirement under its button.
    //   ✓ satisfied (names the layer)   • will be auto-stubbed   ✗ hard-required
    _refreshTextPresets: function (selectionIds) {
      if (!Panel._textPresetRows || !Panel.engine || typeof Panel.engine.validateRequires !== "function") return;
      for (var i = 0; i < Panel._textPresetRows.length; i++) {
        var row = Panel._textPresetRows[i];
        var v = Panel.engine.validateRequires(row.spec, selectionIds || []);
        var lines = [];
        for (var r = 0; r < v.length; r++) {
          var s = v[r];
          if (s.status === "ok") {
            var nm = s.layerIds
              ? s.layerIds.map(function (lid) { return api.getNiceName(lid); }).join(", ")
              : api.getNiceName(s.layerId);
            lines.push("✓ " + s.label + ": " + nm);
          } else if (s.status === "stub") lines.push("• " + s.label + ": will add a placeholder");
          else lines.push("✗ " + s.label + ": required");
        }
        row.label.setText(lines.join("\n"));
      }
    },

    _textPresetSpec: function (key) {
      var tps = TM().textPresets || [];
      for (var i = 0; i < tps.length; i++) if (tps[i].key === key) return tps[i];
      return null;
    },

    _findReq: function (spec, id) {
      var reqs = (spec && spec.requires) || [];
      for (var i = 0; i < reqs.length; i++) if (reqs[i].id === id) return reqs[i];
      return null;
    },

    // Gather { word, color } from each VISIBLE Highlight row that has a non-empty
    // word. Hidden (un-revealed) and blank rows are skipped.
    _collectHighlightRows: function () {
      var rows = [];
      var hr = Panel._highlightRows || [];
      for (var i = 0; i < hr.length; i++) {
        var r = hr[i];
        if (r.cont && typeof r.cont.isHidden === "function" && r.cont.isHidden()) continue;
        var word = String((r.edit && r.edit.getText) ? (r.edit.getText() || "") : "").replace(/^\s+|\s+$/g, "");
        if (!word) continue;
        var color = (r.chip && r.chip.getColor) ? r.chip.getColor() : null;
        rows.push({ word: word, color: color });
      }
      return rows;
    },

    // Toggle visibility of context controls for the given role ("cloner"|"effector"|null).
    // The path button is managed separately in refresh (it can stay visible while armed).
    _showContext: function (role, opts) {
      opts = opts || {};
      function hide(w, h) { if (w && typeof w.setHidden === "function") w.setHidden(h); }
      var isCloner = (role === "cloner");
      var isEffector = (role === "effector");
      var isField = (role === "field");
      hide(Panel._distRow, !isCloner);
      hide(Panel._strengthRow, !(isEffector && opts.hasStrength));
      hide(Panel._amountRow, !(isEffector && opts.hasAmount));
      hide(Panel._muteBtn, !(isEffector && opts.hasStrength));
      hide(Panel._fieldStrengthRow, !isField);
      hide(Panel._fieldProbRow, !isField);
    },

    // Path button: visible while armed, or when a path-based cloner is selected.
    _refreshPathButton: function (role, mode) {
      var armed = !!Panel._armedPathCloner;
      var show = armed || (role === "cloner" && Panel._clonerNeedsPath(mode));
      if (typeof Panel._pathBtn.setHidden === "function") Panel._pathBtn.setHidden(!show);
      Panel._pathBtn.setText(armed ? "Set Path" : "Pick Path Shape");
    },

    refresh: function (selectionIds) {
      Panel._refreshTextPresets(selectionIds);
      var id = selectionIds && selectionIds[0];
      if (!id) { Panel._selectionInfo.setText("No selection"); Panel._showContext(null); Panel._refreshPathButton(null, null); return; }
      var d = root.MG.Selection.describe(id);

      if (d.role === "cloner") {
        var txt = "Cloner (" + (d.mode || "?") + ") · " + d.effectors.length + " effector(s)";
        for (var i = 0; i < d.effectors.length; i++) {
          var ef = d.effectors[i];
          txt += "\n• " + (ef.type || "?") + (ef.fields.length ? " → " + ef.fields[0].type : "");
        }
        Panel._selectionInfo.setText(txt);
        Panel._showContext("cloner");
        Panel._refreshPathButton("cloner", d.mode);
        // sync the dropdown to the current distribution (without firing switch)
        var order = TM().distributionOrder, idx = order.indexOf(d.mode);
        if (idx >= 0) { Panel._suspend = true; Panel._distDD.setValue(idx); Panel._suspend = false; }
        return;
      }

      if (d.role === "effector") {
        var spec = Panel._effectorSpec(id);
        var muted = Panel.engine.isEffectorMuted(id);
        Panel._selectionInfo.setText((spec ? spec.label : "Effector") + (muted ? " (muted)" : ""));
        Panel._muteBtn.setText(muted ? "Unmute" : "Mute");
        var hasStrength = !!(spec && spec.strengthAttr);
        var hasAmount = !!(spec && spec.amountAttr);
        Panel._showContext("effector", { hasStrength: hasStrength, hasAmount: hasAmount });
        Panel._refreshPathButton("effector", null);
        Panel._suspend = true;
        if (hasStrength) Panel._strengthSlider.setValue(Number(api.get(id, spec.strengthAttr)) || 0);
        if (hasAmount) {
          var rng = spec.amountRange || [0, 500];
          Panel._amountSlider.setRange(rng[0], rng[1]);
          Panel._amountSlider.setValue(Number(api.get(id, spec.amountAttr)) || 0);
        }
        Panel._suspend = false;
        return;
      }

      if (d.role === "field") {
        Panel._selectionInfo.setText((d.mode ? d.mode : "field") + " field");
        Panel._showContext("field");
        Panel._refreshPathButton("field", null);
        Panel._suspend = true;
        Panel._fieldStrengthSlider.setValue(Number(api.get(id, "strength")) || 0);
        Panel._fieldProbCheck.setValue(!!api.get(id, "useProbability"));
        Panel._suspend = false;
        return;
      }

      Panel._selectionInfo.setText(d.role + " selected");
      Panel._showContext(null);
      Panel._refreshPathButton(null, null);
    },

    // Look up the effector spec for a selected effector layer.
    _effectorSpec: function (effectorId) {
      var lt = api.getLayerType(effectorId);
      var fx = TM().effectors;
      for (var t in fx) if (fx.hasOwnProperty(t) && fx[t].layer === lt) return fx[t];
      return null;
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
            var r = Panel.engine.createCloner(name, sel);
            Panel._selectAndRefresh(r && r.clonerId);   // auto-select the new cloner
            return;
          } else if (kind === "preset") {
            if (!first) { Panel._modal.showMessage("Select an object to clone."); return; }
            var pr = Panel.engine.applyPreset(name, sel);
            Panel._selectAndRefresh(pr && pr.clonerId);
            return;
          } else if (kind === "rig") {
            var rig = Panel.engine.buildRig(name, sel);
            Panel._selectAndRefresh(rig && rig.clonerId);
            if (rig && !rig.imageUsed) {
              Panel._modal.showMessage("No image selected — drop your image into the new Image Sampler's 'Image' slot to drive the clones.");
            }
            return;
          } else if (kind === "text") {
            var tres = Panel.engine.buildTextPreset(name, sel);
            if (tres && tres.ok === false) {
              var spec = Panel._textPresetSpec(name), msgs = [];
              for (var mi = 0; mi < tres.missing.length; mi++) {
                var rq = Panel._findReq(spec, tres.missing[mi]);
                if (rq) msgs.push(rq.missing);
              }
              Panel._modal.showMessage(msgs.join("\n") || "Missing a required input.");
              return;
            }
            Panel._selectAndRefresh(tres && (tres.bodyId || tres.clonerId));
            if (tres && tres.stubbed) {
              var notes = [];
              if (tres.stubbed.fillIn) notes.push("placeholder fill-in text");
              if (tres.stubbed.fills) notes.push("placeholder fill shapes");
              if (tres.stubbed.mask) notes.push("a placeholder mask");
              if (notes.length) Panel._modal.showMessage("Added " + notes.join(" and ") + ". Replace it with your own content, then animate the mask shape to animate the effect.");
            }
            return;
          } else if (kind === "effector") {
            var clonerId = Panel._resolveCloner(first);
            if (!clonerId) { Panel._modal.showMessage("Select a Cloner first."); return; }
            var er = Panel.engine.addEffector(name, clonerId);
            Panel._selectAndRefresh(er && er.effectorId);
            return;
          } else if (kind === "field") {
            var effId = Panel._resolveEffector(first);
            if (!effId) { Panel._modal.showMessage("Select an Effector first."); return; }
            var cloner = Panel._resolveCloner(effId);
            var added = Panel.engine.addField(name, effId, cloner);
            if (added && !added.fieldId) { Panel._modal.showMessage("Couldn't add the Field — this Effector type doesn't support Fields (e.g. Shader)."); }
          }
          if (typeof Panel.refresh === "function") Panel.refresh(api.getSelection());
        };
      });
    }
  };

  return Panel;
});
