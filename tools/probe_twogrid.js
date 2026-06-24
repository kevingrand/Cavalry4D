// probe_twogrid.js — verify the two-grid clip approach with CORRECT z-order
// (reorder(baseDup, regionDup) puts base BELOW region; region clipped to mask
// draws on top inside the mask). Renders to tools/twogrid_test.png.
// Usage: node tools/probe_twogrid.js
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PNG_OUT = path.join(__dirname, "twogrid_test.png").replace(/\\/g, "/");
const JSON_OUT = path.join(__dirname, "twogrid_result.json").replace(/\\/g, "/");

// Grid config: 7x7 of 60px cells; mask circle radius 130
const code = `
try {
  var origComp = api.getActiveComp();
  var testComp = api.createComp("__TwoGridTest");
  api.setActiveComp(testComp);

  // BASE shape: blue circle (dot)
  var baseShape = api.create("basicShape", "Base Dot (blue)");
  api.setGenerator(baseShape, "generator", "ellipseShape");
  api.set(baseShape, {"generator.radius":{x:22,y:22}, "material.materialColor":"#4169E1"});

  // REGION shape: green rectangle (square)
  var regionShape = api.create("basicShape", "Region Square (green)");
  api.setGenerator(regionShape, "generator", "rectangleShape");
  api.set(regionShape, {"generator.dimensions":{x:40,y:40}, "material.materialColor":"#228B22"});

  // MASK: circle, will be hidden
  var mask = api.create("basicShape", "Mask Circle");
  api.setGenerator(mask, "generator", "ellipseShape");
  api.set(mask, {"generator.radius":{x:130,y:130}, "hidden":true});

  // BASE grid
  var baseDup = api.create("duplicator", "Base Grid");
  api.setGenerator(baseDup, "generator", "gridDistribution");
  api.connect(baseShape, "id", baseDup, "shapes");
  api.set(baseDup, {
    "generator.count":{x:7,y:7},
    "generator.distributionMode":1,
    "generator.size":{x:60,y:60}
  });

  // REGION grid (same layout, clipped to mask)
  var regionDup = api.create("duplicator", "Region Grid");
  api.setGenerator(regionDup, "generator", "gridDistribution");
  api.connect(regionShape, "id", regionDup, "shapes");
  api.set(regionDup, {
    "generator.count":{x:7,y:7},
    "generator.distributionMode":1,
    "generator.size":{x:60,y:60}
  });
  // clip region to mask
  api.connect(mask, "id", regionDup, "masks");

  // Z-ORDER: base must be BELOW region so region cells cover base inside the mask.
  // reorder(a, b) moves a BELOW b. So put baseDup below regionDup.
  api.reorder(baseDup, regionDup);

  // Render
  api.renderPNGFrame("${PNG_OUT}", 50);

  var result = {
    ok: true,
    baseDupInputs: api.getInConnectedAttributes(baseDup),
    regionDupInputs: api.getInConnectedAttributes(regionDup),
    maskHidden: api.get(mask, "hidden"),
    regionDupMasksInput: api.getInConnection(regionDup, "masks")
  };

  api.setActiveComp(origComp);
  api.deleteLayer(testComp);

  api.writeToFile("${JSON_OUT}", JSON.stringify(result, null, 2), true);
  console.log("PROBE_OK");
} catch(err) {
  api.writeToFile("${JSON_OUT}", JSON.stringify({error:String(err&&err.stack||err)}), true);
  console.log("PROBE_ERR " + err);
}
`;

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
    }, 5000);
  }); }
);
req.setTimeout(30000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
