// probe_clone.js — DEFINITIVE test: clone the real working duplicator#474 (with
// connections) and render it. Non-destructive: hides the original only during the
// render, then unhides it and deletes the clone. Tells us if per-copy is reproducible.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("clone.json");

const code = `
try {
  var REAL = "duplicator#474";
  if (!api.layerExists(REAL)) throw new Error("duplicator#474 missing");
  var report = { realParent: api.getParent(REAL) };

  // clone WITH input connections
  var clone = api.duplicate(REAL, true);
  report.clone = clone;
  report.cloneType = api.getLayerType(clone);
  report.cloneShapeIdConn = api.getInConnection(clone, "shapeId");
  report.cloneShapesIn = api.getInConnectedAttributes(clone);

  // hide the original (and its renderable wrapper) just for the render
  var savedHidden = api.get(REAL, "hidden");
  api.set(REAL, {"hidden": true});

  api.renderPNGFrame("${out('clone.png')}", 50);

  // restore
  api.set(REAL, {"hidden": savedHidden});
  if (api.layerExists(clone)) api.deleteLayer(clone);

  api.writeToFile("${JSON_OUT}", JSON.stringify(report, null, 2), true);
  console.log("OK");
} catch(err){ api.writeToFile("${JSON_OUT}", JSON.stringify({error:String(err&&err.stack||err)}),true); console.log("ERR "+err); }
`;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host:"127.0.0.1", port:8080, path:"/post", method:"POST",
    headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)} },
  function(res){ res.on("data",function(){}); res.on("end",function(){
    setTimeout(function(){
      try{ console.log(fs.readFileSync(JSON_OUT.replace(/\//g,"\\"),"utf8"));
        console.log("PNG:", fs.existsSync(out("clone.png").replace(/\//g,"\\"))); }
      catch(e){ console.log("NO_FILE:", e.message); }
    }, 6000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
