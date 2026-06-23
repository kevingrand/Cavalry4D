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
    }
  };

  return Engine;
});
