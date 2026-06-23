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

    E.resetWarnings();
    var shape = api.create("basicShape", "SelftestShape");

    var modes = ["grid", "radial", "linear", "object"];
    for (var i = 0; i < modes.length; i++) {
      var c = E.createCloner(modes[i], [shape]);
      check("cloner " + modes[i], api.getLayerType(c.clonerId) === "duplicator");
    }
    var base = E.createCloner("grid", [shape]).clonerId;

    var rnd = E.addEffector("random", base).effectorId;
    check("random -> rotation", api.getInConnection(base, "shapeRotation") === rnd);
    var pln = E.addEffector("plain", base).effectorId;
    check("plain -> position", api.getInConnection(base, "shapePosition") === pln);

    var f = E.addField("spherical", pln, base);
    check("field -> plain falloff slot", api.getInConnection(pln, "falloffs.0.id") === f.fieldId);

    var base2 = E.createCloner("grid", [shape]).clonerId;
    var rnd2 = E.addEffector("random", base2, { rotation: true, position: false, scale: false }).effectorId;
    var fc = E.addField("box", rnd2, base2);
    check("random combiner inserted", fc.extraIds.length === 1 && api.getLayerType(fc.extraIds[0]) === "math");

    return { passed: passed, failed: failed, warnings: E.warnings.slice(), details: details };
  };
});
