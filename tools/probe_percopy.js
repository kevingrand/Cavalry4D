// probe_percopy.js — isolate WHAT makes isWithin->numberRange->shapeId evaluate
// PER-COPY in a duplicator (the real BLOXEL mechanism). Renders 3 variants:
//   V1 baseline: grid + 2 shapes + isWithin->shapeId, nothing else (expect uniform)
//   V2 + shapePosition.x/y driven (round<-value2<-getVector, offset 0)
//   V3 + sortDistribution generator.mode = 2
// Each -> its own PNG so we can read which one produces a true per-copy swap.
// Usage: node tools/probe_percopy.js
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("probe_percopy.json");

const code = `
function buildCore(comp, opts) {
  api.setActiveComp(comp);
  // shapeA: yellow ellipse
  var a = api.create("basicShape", "A yellow");
  api.setGenerator(a, "generator", "ellipseShape");
  api.set(a, {"generator.radius":{x:22,y:22}, "material.materialColor":"#E0A030"});
  // shapeB: red rectangle
  var b = api.create("basicShape", "B red");
  api.setGenerator(b, "generator", "rectangleShape");
  api.set(b, {"generator.dimensions":{x:44,y:44}, "material.materialColor":"#D0504A"});
  // mask: ellipse, hidden, centred
  var mask = api.create("basicShape", "Mask");
  api.setGenerator(mask, "generator", "ellipseShape");
  api.set(mask, {"generator.radius":{x:170,y:170}, "hidden":true});
  // isWithin -> numberRange -> shapeId
  var iw = api.create("isWithin", "IsWithin");
  api.set(iw, {"invert":true});
  api.connect(mask, "id", iw, "inputShape");
  var nr = api.create("numberRange", "ShapesID");
  api.set(nr, {"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw, "id", nr, "value");
  // duplicator: sortDistribution wrapping grid
  var dup = api.create("duplicator", "Dup");
  api.setGenerator(dup, "generator", "sortDistribution");
  api.setGenerator(dup, "generator.input", "gridDistribution");
  api.set(dup, {"autoId":false,"useIndex":true,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1});
  api.connect(a, "id", dup, "shapes");
  api.connect(b, "id", dup, "shapes");
  api.connect(nr, "id", dup, "shapeId");

  if (opts.shapePos) {
    var target = api.create("basicShape", "PushTarget");
    api.setGenerator(target, "generator", "rectangleShape");
    api.set(target, {"generator.dimensions":{x:420,y:420}, "hidden":true});
    var gv = api.create("getVector", "GetVector");
    api.set(gv, {"normalize":true, "strength":0});
    api.connect(target, "id", gv, "target");
    var v2 = api.create("value2", "Pos");
    api.connect(gv, "id", v2, "value");
    var rx = api.create("round", "XSteps");
    api.set(rx, {"rounding":60});
    api.connect(v2, "value.x", rx, "value");
    api.connect(rx, "id", dup, "shapePosition.x");
    var ry = api.create("round", "YSteps");
    api.set(ry, {"rounding":60});
    api.connect(v2, "value.y", ry, "value");
    api.connect(ry, "id", dup, "shapePosition.y");
  }
  if (opts.sortMode2) {
    api.set(dup, {"generator.mode":2});
  }
  return dup;
}

try {
  var orig = api.getActiveComp();
  var res = {};

  var c1 = api.createComp("__V1");
  buildCore(c1, {});
  api.renderPNGFrame("${out('percopy_v1.png')}", 50);
  res.v1 = "rendered";

  var c2 = api.createComp("__V2");
  buildCore(c2, {shapePos:true});
  api.renderPNGFrame("${out('percopy_v2.png')}", 50);
  res.v2 = "rendered";

  var c3 = api.createComp("__V3");
  buildCore(c3, {sortMode2:true});
  api.renderPNGFrame("${out('percopy_v3.png')}", 50);
  res.v3 = "rendered";

  api.setActiveComp(orig);
  api.deleteLayer(c1); api.deleteLayer(c2); api.deleteLayer(c3);
  api.writeToFile("${JSON_OUT}", JSON.stringify(res,null,2), true);
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
      try { console.log("RESULT:", fs.readFileSync(JSON_OUT.replace(/\//g,"\\"),"utf8"));
        ["percopy_v1.png","percopy_v2.png","percopy_v3.png"].forEach(function(p){
          console.log(p, fs.existsSync(out(p).replace(/\//g,"\\")));
        });
      } catch (e) { console.log("NO_FILE:", e.message); }
    }, 8000);
  }); }
);
req.setTimeout(45000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
