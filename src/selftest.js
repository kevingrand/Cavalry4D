;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.selftest = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); require("./engine"); } catch (e) {} }

  return function selftest() {
    var E = root.MG.Engine;
    var details = [], passed = 0, failed = 0;
    function check(label, cond) { if (cond) { passed++; } else { failed++; } details.push((cond ? "PASS " : "FAIL ") + label); }
    function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
    function drives(fromId, toId) { var o = api.getOutConnections(fromId, "id"); for (var i = 0; i < o.length; i++) if (layerOf(o[i]) === toId) return true; return false; }

    E.resetWarnings();
    var shape = api.create("basicShape", "SelftestShape");

    var TM = root.MG.TypeMap;
    var modes = ["grid", "radial", "linear", "object"];
    for (var i = 0; i < modes.length; i++) {
      var c = E.createCloner(modes[i], [shape]);
      check("cloner " + modes[i], api.getLayerType(c.clonerId) === "duplicator");
      check("cloner " + modes[i] + " shape input", drives(shape, c.clonerId));
      // distribution generator actually applied (the foundational fix)
      check("cloner " + modes[i] + " distribution",
        api.getCurrentGeneratorType(c.clonerId, "generator") === TM.cloners[modes[i]].distribution);
    }
    var base = E.createCloner("grid", [shape]).clonerId;

    var rnd = E.addEffector("random", base, { rotation: true, position: false, scale: false }).effectorId;
    check("random effector drives cloner", drives(rnd, base));
    check("random effector visible default", api.get(rnd, "maximum") === 50);
    var pln = E.addEffector("plain", base, { position: true, rotation: false, scale: false }).effectorId;
    check("plain effector drives cloner", drives(pln, base));

    var f = E.addField("spherical", pln, base);
    check("field drives plain effector", drives(f.fieldId, pln));
    var fr = E.addField("box", rnd, base);
    check("field drives random effector", drives(fr.fieldId, rnd));

    // distribution switcher: grid -> radial keeps the shape wired and applies circle gen
    var sw = E.createCloner("grid", [shape]).clonerId;
    E.switchDistribution(sw, "radial");
    check("switchDistribution applies circle", api.getCurrentGeneratorType(sw, "generator") === "circleDistribution");
    check("switchDistribution keeps shape", drives(shape, sw));

    // path shape into an object cloner
    var objc = E.createCloner("object", [shape]).clonerId;
    var pathShape = api.create("basicShape", "SelftestPath");
    E.setPathShape(objc, pathShape);
    check("setPathShape wires inputShape", layerOf(api.getInConnection(objc, "generator.inputShape")) === pathShape);

    // effector controls
    E.setEffectorStrength(rnd, 60); check("setEffectorStrength", api.get(rnd, "strength") === 60);
    E.setEffectorAmount(rnd, 120);  check("setEffectorAmount", api.get(rnd, "maximum") === 120);
    E.setEffectorMuted(rnd, true);  check("mute zeroes strength", api.get(rnd, "strength") === 0);
    E.setEffectorMuted(rnd, false); check("unmute restores strength", api.get(rnd, "strength") === 60);

    // preset composes cloner + effector + field
    var pr = E.applyPreset("pulse", [shape]);
    check("preset creates cloner", api.getLayerType(pr.clonerId) === "duplicator");
    check("preset creates effector", !!pr.effectorId && drives(pr.effectorId, pr.clonerId));
    check("preset creates field", !!pr.fieldId && drives(pr.fieldId, pr.effectorId));

    // --- sprint additions ---
    var newClones = { scatter: "randomDistribution", honeycomb: "gridDistribution", onEdges: "shapeEdgeDistribution" };
    for (var nc in newClones) if (newClones.hasOwnProperty(nc)) {
      var ncId = E.createCloner(nc, [shape]).clonerId;
      check("cloner " + nc + " distribution", api.getCurrentGeneratorType(ncId, "generator") === newClones[nc]);
    }
    var nbase = E.createCloner("grid", [shape]).clonerId;
    var nz = E.addEffector("noise", nbase).effectorId;
    check("noise effector drives cloner", drives(nz, nbase));
    check("noise visible amount", api.get(nz, "generator.maximum") === 50);
    var tg = E.addEffector("target", nbase);
    check("target effector drives cloner", drives(tg.effectorId, nbase));
    check("target auto-creates a null", tg.extraIds.length === 1 && api.getLayerType(tg.extraIds[0]) === "null");
    check("target null wired to lookAt.target", layerOf(api.getInConnection(tg.effectorId, "target")) === tg.extraIds[0]);

    // field shapeType enum fix + controls
    var fpln = E.addEffector("plain", nbase).effectorId;
    var fSph = E.addField("spherical", fpln, nbase).fieldId;
    var fBox = E.addField("box", fpln, nbase).fieldId;
    var fLin = E.addField("linear", fpln, nbase).fieldId;
    check("spherical field shapeType=0", api.get(fSph, "shapeType") === 0);
    check("box field shapeType=1", api.get(fBox, "shapeType") === 1);
    check("linear field shapeType=2", api.get(fLin, "shapeType") === 2);
    E.setFieldStrength(fSph, 40); check("setFieldStrength", api.get(fSph, "strength") === 40);
    E.setFieldProbability(fSph, true); check("setFieldProbability", api.get(fSph, "useProbability") === true);

    // reveal-in-shape text preset (subMesh + isWithin + valueArray opacity mask)
    var rvBody = api.create("textShape", "SelftestBody");
    var rvMask = api.create("basicShape", "SelftestMask");
    var rv = E.buildTextPreset("revealInShape", [rvBody, rvMask]);
    check("reveal builds a subMesh deformer", api.getLayerType(rv.subMeshId) === "subMesh");
    check("reveal mask drives isWithin", drives(rv.maskId, rv.isWithinId));
    check("reveal isWithin drives valueArray", drives(rv.isWithinId, rv.valueArrayId));
    check("reveal valueArray drives subMesh opacity", drives(rv.valueArrayId, rv.subMeshId));
    check("reveal subMesh deforms the body text", drives(rv.subMeshId, rv.bodyId));
    check("reveal hides the mask", api.get(rv.maskId, "hidden") === true);
    // empty selection auto-stubs both roles
    var rv2 = E.buildTextPreset("revealInShape", []);
    check("reveal auto-stubs fill-in + mask", rv2.stubbed.fillIn === true && rv2.stubbed.mask === true);

    // fill-in & repeat: grid duplicator of fills, clipped to a hidden mask
    var frFill = api.create("basicShape", "SelftestFill");
    var frMask = api.create("basicShape", "SelftestFillMask");
    var fr = E.buildTextPreset("fillRepeat", [frFill, frMask]);
    check("fillRepeat builds a duplicator", api.getLayerType(fr.clonerId) === "duplicator");
    check("fillRepeat clones the fill shape", drives(frFill, fr.clonerId));
    check("fillRepeat clips to the mask", drives(fr.maskId, fr.clonerId));
    check("fillRepeat hides the mask", api.get(fr.maskId, "hidden") === true);

    // highlight words add-on: applyTextMaterial colour + applyTypeface bold behaviours
    var hlText = api.create("textShape", "SelftestHL");
    var hl = E.highlightWords([hlText], [{ word: "red", color: "#EA4336" }, { word: "blue", color: "#4285F4" }]);
    check("highlight builds applyTextMaterial", api.getLayerType(hl.materialIds[0]) === "applyTextMaterial");
    check("highlight drives the text", drives(hl.materialIds[0], hlText));
    check("highlight sets capture-group regex", api.get(hl.materialIds[0], "regex") === "(red)");
    check("highlight sets the colour", api.get(hl.materialIds[0], "material.materialColor") === "#EA4336");
    var bw = E.boldWords([hlText], ["red"]);
    check("bold builds applyTypeface", api.getLayerType(bw.typefaceIds[0]) === "applyTypeface");
    check("bold drives the text", drives(bw.typefaceIds[0], hlText));
    var hl2 = E.highlightWords([], [{ word: "red", color: "#EA4336" }]);
    check("highlight auto-stubs a sample text", hl2.stubbed === true && api.getLayerType(hl2.textId) === "textShape");

    // grid fx: shape swap grid (two aligned grids, region clipped to the mask)
    var ssR = api.create("basicShape", "SelftestRegion");
    var ssB = api.create("basicShape", "SelftestBase");
    var ssM = api.create("basicShape", "SelftestSwapMask");
    var ss = E.buildGridPreset("shapeSwap", [ssR, ssB, ssM]);
    check("shapeSwap builds two duplicators", api.getLayerType(ss.baseDupId) === "duplicator" && api.getLayerType(ss.regionDupId) === "duplicator");
    check("shapeSwap clones base into base grid", drives(ssB, ss.baseDupId));
    check("shapeSwap clones region into region grid", drives(ssR, ss.regionDupId));
    check("shapeSwap clips region grid to mask", drives(ssM, ss.regionDupId));
    check("shapeSwap hides the mask", api.get(ss.maskId, "hidden") === true);
    var ss2 = E.buildGridPreset("shapeSwap", []);
    check("shapeSwap auto-stubs all three roles", ss2.stubbed.baseShape && ss2.stubbed.regionShape && ss2.stubbed.mask);

    return { passed: passed, failed: failed, warnings: E.warnings.slice(), details: details };
  };
});
