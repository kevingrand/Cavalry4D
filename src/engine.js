;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Engine = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }
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

    // connect then verify; record a warning on silent failure
    _wire: function (fromId, fromAttr, toId, toAttr) {
      api.connect(fromId, fromAttr, toId, toAttr);
      var got = api.getInConnection(toId, toAttr);
      if (got !== fromId) {
        Engine.warnings.push("wire failed: " + fromId + "." + fromAttr + " -> " + toId + "." + toAttr + " (got '" + got + "')");
        return false;
      }
      return true;
    },

    createCloner: function (mode, selectionIds) {
      var spec = TM().cloners[mode];
      if (!spec) throw new Error("unknown cloner mode: " + mode);
      var clonerId = Engine._create("duplicator", Engine._nextName("Cloner"));
      api.setGenerator(clonerId, TM().paths.generatorAttr, spec.distribution);
      if (spec.configure) spec.configure(api, clonerId);
      var src = (selectionIds && selectionIds[0]) || null;
      if (src) Engine._wire(src, "id", clonerId, TM().paths.shapeInput);
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
      return { effectorId: effectorId, comboIds: [] };
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
    }
  };

  return Engine;
});
