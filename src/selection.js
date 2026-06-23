;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Selection = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }
  function layerOf(s) { return s ? String(s).split(".")[0] : ""; }

  function effectorTypeOf(layerType) {
    var fx = TM().effectors;
    for (var t in fx) if (fx.hasOwnProperty(t) && fx[t].layer === layerType) return t;
    return null;
  }
  function fieldTypeOf(fieldId) {
    var st = api.get(fieldId, "shapeType");
    if (api.get(fieldId, "useProbability") && st === "Circle") return "random";
    if (st === "Linear") return "linear";
    if (st === "Rectangle") return "box";
    if (st === "Circle") return "spherical";
    return "linear";
  }

  var Selection = {
    describe: function (layerId) {
      if (!layerId || !api.layerExists(layerId)) return { role: "other", mode: null, effectors: [] };
      var type = api.getLayerType(layerId);

      if (type === "duplicator") {
        var mode = api.getCurrentGeneratorType(layerId, TM().paths.generatorAttr) || null;
        var seen = {};
        var effectors = [];
        var allAttrs = [];
        var x; for (x in TM().XFORM) if (TM().XFORM.hasOwnProperty(x)) allAttrs.push(TM().XFORM[x]);
        allAttrs.push("material.materialColor");
        for (var i = 0; i < allAttrs.length; i++) {
          var attr = allAttrs[i];
          var effId = layerOf(api.getInConnection(layerId, attr));
          if (!effId) continue;
          if (seen[effId]) { seen[effId].channels.push(attr); continue; }
          var rec = { id: effId, type: effectorTypeOf(api.getLayerType(effId)), channels: [attr], fields: [] };
          // field via the effector's falloffs.* input
          var inAttrs = api.getInConnectedAttributes(effId);
          for (var a = 0; a < inAttrs.length; a++) {
            if (inAttrs[a].indexOf("falloff") >= 0) {
              var fSrc = layerOf(api.getInConnection(effId, inAttrs[a]));
              if (fSrc) { rec.fields.push({ id: fSrc, type: fieldTypeOf(fSrc) }); break; }
            }
          }
          seen[effId] = rec;
          effectors.push(rec);
        }
        return { role: "cloner", mode: mode, effectors: effectors };
      }

      if (effectorTypeOf(type)) return { role: "effector", mode: null, effectors: [] };
      if (type === "falloff") return { role: "field", mode: null, effectors: [] };
      return { role: "other", mode: null, effectors: [] };
    }
  };

  return Selection;
});
