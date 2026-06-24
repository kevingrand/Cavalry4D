// verify_shapeswap.js — live-verify the Shape Swap Grid preset end-to-end
// using the concatenated src/ directly (not the installed panel).
// Builds on stub layers, checks wiring + zero warnings, renders PNG.
// Usage: node tools/verify_shapeswap.js
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PNG_OUT = path.join(__dirname, "verify_shapeswap.png").replace(/\\/g, "/");
const JSON_OUT = path.join(__dirname, "verify_shapeswap.json").replace(/\\/g, "/");

// Read src files in dependency order
function src(name) {
  return fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
}
const srcCode = [
  src("typemap.js"), src("engine.js"), src("selection.js")
].join("\n");

const tail = `
try {
  var Engine = MG.Engine;
  Engine.resetWarnings();
  var origComp = api.getActiveComp();
  var testComp = api.createComp("__SwapVerify");
  api.setActiveComp(testComp);

  // Build with empty selection -> all roles stubbed
  var r = Engine.buildGridPreset("shapeSwap", []);

  var result = {
    ok: r.ok,
    warnings: Engine.warnings,
    baseDupType: api.getLayerType(r.baseDupId),
    regionDupType: api.getLayerType(r.regionDupId),
    maskHidden: api.get(r.maskId, "hidden"),
    baseDupGen: api.getCurrentGeneratorType(r.baseDupId, "generator"),
    regionDupGen: api.getCurrentGeneratorType(r.regionDupId, "generator"),
    regionDupInputs: api.getInConnectedAttributes(r.regionDupId),
    reordersRecorded: typeof api._reorders !== "undefined" ? api._reorders.length : "N/A",
    stubbed: r.stubbed
  };

  // Render isolated comp for visual check
  api.renderPNGFrame("${PNG_OUT}", 50);

  api.setActiveComp(origComp);
  api.deleteLayer(testComp);

  api.writeToFile("${JSON_OUT}", JSON.stringify(result, null, 2), true);
  console.log("VERIFY_OK warnings=" + Engine.warnings.length);
} catch(err) {
  api.writeToFile("${JSON_OUT}", JSON.stringify({error:String(err&&err.stack||err)}), true);
  console.log("VERIFY_ERR " + err);
}
`;

const code = srcCode + "\n" + tail;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host: "127.0.0.1", port: 8080, path: "/post", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
  function (res) { res.on("data", function () {}); res.on("end", function () {
    setTimeout(function () {
      try {
        console.log("RESULT:", fs.readFileSync(JSON_OUT.replace(/\//g, "\\"), "utf8"));
        console.log("PNG:", fs.existsSync(PNG_OUT.replace(/\//g, "\\")));
      } catch (e) { console.log("NO_FILE:", e.message); }
    }, 6000);
  }); }
);
req.setTimeout(40000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
