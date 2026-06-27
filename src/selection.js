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
  // Map a distribution generator type (e.g. "circleDistribution") back to the
  // friendly cloner mode ("radial"). Returns the raw type if unknown.
  function modeOfGenerator(genType) {
    if (!genType) return null;
    var cl = TM().cloners;
    for (var m in cl) if (cl.hasOwnProperty(m) && cl[m].distribution === genType) return m;
    return genType;
  }
  // shapeType is an enum int: Circle=0, Rectangle=1, Linear=2.
  function fieldTypeOf(fieldId) {
    var st = api.get(fieldId, "shapeType");
    if (api.get(fieldId, "useProbability") && st === 0) return "random";
    if (st === 2) return "linear";
    if (st === 1) return "box";
    if (st === 0) return "spherical";
    return "spherical";
  }

  var Selection = {
    describe: function (layerId) {
      if (!layerId || !api.layerExists(layerId)) return { role: "other", mode: null, effectors: [] };
      var type = api.getLayerType(layerId);

      if (type === "duplicator") {
        var mode = modeOfGenerator(api.getCurrentGeneratorType(layerId, TM().paths.generatorAttr));
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
      if (type === "falloff") return { role: "field", mode: fieldTypeOf(layerId), effectors: [] };
      return { role: "other", mode: null, effectors: [] };
    },

    // Classify a single layer into a Quick-Actions category (see
    // TM().contextActions). Concrete-type checks decide first; getSuperTypes is
    // only a coarse fallback for layers we don't recognise (its exact strings are
    // a verify-live item, so nothing critical depends on them).
    classify: function (layerId) {
      if (!layerId || !api.layerExists(layerId)) return "other";
      var type = api.getLayerType(layerId);
      if (type === "duplicator") return "cloner";
      if (effectorTypeOf(type)) return "effector";
      if (type === "falloff") return "field";
      if (type === "footageShape" || type === "imageToShapes") return "image";
      if (type === "textShape") return "text";
      if (typeof api.isShape === "function" && api.isShape(layerId)) return "shape";
      if (typeof api.getSuperTypes === "function") {
        var st = api.getSuperTypes(layerId) || [];
        for (var i = 0; i < st.length; i++) {
          var s = String(st[i]).toLowerCase();
          if (s === "shape") return "shape";
        }
      }
      return "other";
    },

    // Classify the whole selection. One layer -> its category. 2+ layers ->
    // "multiShapes" when every layer is a shape/text/image (so stack presets such
    // as Reveal/Fill apply), otherwise "multi" (only generic verbs are safe).
    classifySelection: function (selectionIds) {
      var ids = selectionIds || [];
      if (!ids.length) return { category: "none", count: 0 };
      if (ids.length === 1) return { category: Selection.classify(ids[0]), count: 1 };
      var allShapes = true;
      for (var i = 0; i < ids.length; i++) {
        var c = Selection.classify(ids[i]);
        if (c !== "shape" && c !== "text" && c !== "image") { allShapes = false; break; }
      }
      return { category: allShapes ? "multiShapes" : "multi", count: ids.length, allShapes: allShapes };
    }
  };

  return Selection;
});
