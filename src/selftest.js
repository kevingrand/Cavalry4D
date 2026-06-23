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

    var modes = ["grid", "radial", "linear", "object"];
    for (var i = 0; i < modes.length; i++) {
      var c = E.createCloner(modes[i], [shape]);
      check("cloner " + modes[i], api.getLayerType(c.clonerId) === "duplicator");
    }
    var base = E.createCloner("grid", [shape]).clonerId;

    var rnd = E.addEffector("random", base, { rotation: true, position: false, scale: false }).effectorId;
    check("random effector drives cloner", drives(rnd, base));
    var pln = E.addEffector("plain", base, { position: true, rotation: false, scale: false }).effectorId;
    check("plain effector drives cloner", drives(pln, base));

    var f = E.addField("spherical", pln, base);
    check("field drives plain effector", drives(f.fieldId, pln));
    var fr = E.addField("box", rnd, base);
    check("field drives random effector", drives(fr.fieldId, rnd));

    return { passed: passed, failed: failed, warnings: E.warnings.slice(), details: details };
  };
});
