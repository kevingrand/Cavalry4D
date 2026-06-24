// probe_shapeswap.js — verify the minimal ONE-duplicator shape-swap mechanism
// using sortDistribution wrapping gridDistribution + isWithin→numberRange→shapeId.
// Renders an isolated comp and writes the PNG to tools/shapeswap_test.png.
// Usage: node tools/probe_shapeswap.js   (Stallion must be open in Cavalry)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PNG_OUT = path.join(__dirname, "shapeswap_test.png").replace(/\\/g, "/");
const JSON_OUT = path.join(__dirname, "shapeswap_result.json").replace(/\\/g, "/");

const code = `
try {
  var origComp = api.getActiveComp();
  var testComp = api.createComp("__SwapTest");
  api.setActiveComp(testComp);

  // ----- shapes -----
  var shapeA = api.create("basicShape", "Shape A (blue)");
  api.setGenerator(shapeA, "generator", "rectangleShape");
  api.set(shapeA, {"generator.dimensions":{x:50,y:50}, "material.materialColor":"#4169E1"});

  var shapeB = api.create("basicShape", "Shape B (green)");
  api.setGenerator(shapeB, "generator", "rectangleShape");
  api.set(shapeB, {"generator.dimensions":{x:50,y:50}, "material.materialColor":"#228B22"});

  // ----- mask shape (circle, hidden) -----
  var mask = api.create("basicShape", "Mask Circle");
  api.setGenerator(mask, "generator", "ellipseShape");
  api.set(mask, {"generator.radius":{x:150,y:150}, "hidden":true});

  // ----- isWithin -----
  var iw = api.create("isWithin", "Is In Mask");
  api.set(iw, {"invert":true});
  api.connect(mask, "id", iw, "inputShape");

  // ----- numberRange 0->1 -----
  var nr = api.create("numberRange", "Shapes ID");
  api.set(nr, {"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw, "id", nr, "value");

  // ----- duplicator with sortDistribution wrapping gridDistribution -----
  var dup = api.create("duplicator", "Grid");
  api.setGenerator(dup, "generator", "sortDistribution");
  api.setGenerator(dup, "generator.input", "gridDistribution");
  // 8x8 grid, 60px steps
  api.set(dup, {
    "autoId": false,
    "useIndex": true,
    "generator.input.count": {x:8, y:8},
    "generator.input.size": {x:60, y:60},
    "generator.input.distributionMode": 1
  });
  api.connect(shapeA, "id", dup, "shapes");
  api.connect(shapeB, "id", dup, "shapes");
  api.connect(nr, "id", dup, "shapeId");

  // ----- render -----
  api.renderPNGFrame("${PNG_OUT}", 50);

  // ----- read back -----
  var dupInputs = api.getInConnectedAttributes(dup);
  var dupVals = {};
  ["autoId","useIndex","shapeId","generator.input.count","generator.input.size"].forEach(function(k){
    dupVals[k] = api.get(dup, k);
  });
  var result = {
    ok: true,
    genOuter: api.getCurrentGeneratorType(dup, "generator"),
    genInner: api.getCurrentGeneratorType(dup, "generator.input"),
    dupInputs: dupInputs,
    dupVals: dupVals,
    iwInputs: api.getInConnectedAttributes(iw),
    nrInputs: api.getInConnectedAttributes(nr),
    outConnections: api.getOutConnections(nr, "id")
  };

  // ----- cleanup -----
  api.setActiveComp(origComp);
  api.deleteLayer(testComp);

  api.writeToFile("${JSON_OUT}", JSON.stringify(result, null, 2), true);
  console.log("PROBE_OK");
} catch(err) {
  api.writeToFile("${JSON_OUT}", JSON.stringify({error: String(err && err.stack || err)}), true);
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
        var s = fs.readFileSync(JSON_OUT.replace(/\//g, "\\"), "utf8");
        console.log("RESULT:", s);
        var hasPng = fs.existsSync(PNG_OUT.replace(/\//g, "\\"));
        console.log("PNG written:", hasPng);
      } catch (e) { console.log("NO_FILE:", e.message); }
    }, 5000);
  }); }
);
req.setTimeout(30000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code + " (is Stallion running?)"); });
req.write(body); req.end();
