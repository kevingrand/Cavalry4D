;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Engine = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }
  // Cavalry's getInConnection/getOutConnections return "layer.attr" (e.g.
  // "random#1.id", "duplicator#2.shapeScale"); reduce to the layer id.
  function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
  var counters = {};

  var Engine = {
    warnings: [],
    resetWarnings: function () { Engine.warnings = []; },

    _nextName: function (base) {
      counters[base] = (counters[base] || 0) + 1;
      return base + " " + counters[base];
    },

    _create: function (type, niceName) {
      var id = api.create(type, niceName || type);
      if (niceName) api.rename(id, niceName);
      return id;
    },

    // connect then verify from the SOURCE side via getOutConnections — robust to
    // list / auto-indexed target slots (e.g. "falloffs") that getInConnection on
    // the named target doesn't report. Warn on silent failure.
    _wire: function (fromId, fromAttr, toId, toAttr) {
      api.connect(fromId, fromAttr, toId, toAttr);
      var outs = api.getOutConnections(fromId, fromAttr);
      for (var i = 0; i < outs.length; i++) if (layerOf(outs[i]) === toId) return true;
      Engine.warnings.push("wire failed: " + fromId + "." + fromAttr + " -> " + toId + "." + toAttr);
      return false;
    },

    createCloner: function (mode, selectionIds) {
      var spec = TM().cloners[mode];
      if (!spec) throw new Error("unknown cloner mode: " + mode);
      var clonerId = Engine._create("duplicator", Engine._nextName("Cloner"));
      api.setGenerator(clonerId, TM().paths.generatorAttr, spec.distribution);
      if (spec.configure) spec.configure(api, clonerId);
      // A Duplicator clones its CHILDREN — parent the selection in (connecting to
      // a "shapes" input does not work in Cavalry).
      if (selectionIds) {
        for (var i = 0; i < selectionIds.length; i++) {
          api.parent(selectionIds[i], clonerId);
          if (api.getParent(selectionIds[i]) !== clonerId) Engine.warnings.push("cloner: failed to parent " + selectionIds[i] + " -> " + clonerId);
        }
      }
      return { clonerId: clonerId };
    },

    _channelTargets: function (type, channels) {
      var spec = TM().effectors[type];
      var use = channels || spec.defaultChannels;
      var targets = [];
      for (var name in spec.channelAttrs) {
        if (spec.channelAttrs.hasOwnProperty(name) && use[name]) targets.push(spec.channelAttrs[name]);
      }
      return targets;
    },

    addEffector: function (type, clonerId, channels) {
      var spec = TM().effectors[type];
      if (!spec) throw new Error("unknown effector type: " + type);
      var effectorId = Engine._create(spec.layer, Engine._nextName(spec.label));
      var targets = Engine._channelTargets(type, channels);
      for (var i = 0; i < targets.length; i++) Engine._wire(effectorId, "id", clonerId, targets[i]);
      return { effectorId: effectorId, extraIds: [] };
    },

    _effectorTypeOf: function (layerType) {
      var fx = TM().effectors;
      for (var t in fx) if (fx.hasOwnProperty(t) && fx[t].layer === layerType) return t;
      return null;
    },

    setEffectorChannels: function (effectorId, clonerId, channels) {
      var type = Engine._effectorTypeOf(api.getLayerType(effectorId));
      if (!type) { Engine.warnings.push("setEffectorChannels: unknown effector " + effectorId); return; }
      var attrs = TM().effectors[type].channelAttrs;
      for (var name in attrs) {
        if (!attrs.hasOwnProperty(name)) continue;
        var target = attrs[name];
        if (channels[name]) Engine._wire(effectorId, "id", clonerId, target);
        else api.disconnectInput(clonerId, target);
      }
    },

    // A field attaches to the effector's "falloffs" list (verified live: random,
    // value and stagger all expose it, and a field there attenuates the whole
    // effector spatially). Effectors with no falloffs input (Shader/colorArray)
    // have fieldSlot null -> field is refused with a warning, no orphan left.
    // clonerId is accepted for signature stability but unused.
    addField: function (fieldType, effectorId, clonerId) {
      var fSpec = TM().fields[fieldType];
      if (!fSpec) throw new Error("unknown field type: " + fieldType);
      var fieldId = Engine._create(fSpec.layer, Engine._nextName(fSpec.label));
      if (fSpec.configure) fSpec.configure(api, fieldId);

      var eType = Engine._effectorTypeOf(api.getLayerType(effectorId));
      var slot = eType ? TM().effectors[eType].fieldSlot : null;
      if (!slot) {
        Engine.warnings.push("addField: " + (eType ? "'" + eType + "' effector does not support a Field" : "unknown effector " + effectorId) + "; field not added");
        api.deleteLayer(fieldId);
        return { fieldId: null, extraIds: [] };
      }
      Engine._wire(fieldId, "id", effectorId, slot);
      return { fieldId: fieldId, extraIds: [] };
    }
  };

  return Engine;
});
