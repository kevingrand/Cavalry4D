// probe_strip.js — on a working CLONE of duplicator#474, strip pieces to find the
// minimal per-copy trigger. Renders:
//   strip_full   : clone as-is (expect per-copy diamond swap)
//   strip_nopos  : clone with shapePosition.x/y DISCONNECTED (is the position drive
//                  what makes shapeId per-copy?)
// Non-destructive: hides original + clones during renders, deletes clones, restores.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("strip.json");

const code = `
try {
  var REAL = "duplicator#474";
  var savedHidden = api.get(REAL, "hidden");
  var c1 = api.duplicate(REAL, true);
  var c2 = api.duplicate(REAL, true);
  var report = { c1:c1, c2:c2,
    c1pos_x: api.getInConnection(c1,"shapePosition.x"),
    c1id: api.getInConnection(c1,"shapeId") };

  api.set(REAL, {"hidden": true});

  // render c1 as-is (hide c2)
  api.set(c2, {"hidden": true}); api.set(c1, {"hidden": false});
  api.renderPNGFrame("${out('strip_full.png')}", 50);

  // c2: disconnect shapePosition.x/y, render (hide c1)
  api.disconnectInput(c2, "shapePosition.x");
  api.disconnectInput(c2, "shapePosition.y");
  report.c2pos_x_after = api.getInConnection(c2, "shapePosition.x");
  report.c2id_after = api.getInConnection(c2, "shapeId");
  api.set(c1, {"hidden": true}); api.set(c2, {"hidden": false});
  api.renderPNGFrame("${out('strip_nopos.png')}", 50);

  // restore
  api.set(REAL, {"hidden": savedHidden});
  if (api.layerExists(c1)) api.deleteLayer(c1);
  if (api.layerExists(c2)) api.deleteLayer(c2);

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
        ["strip_full.png","strip_nopos.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
