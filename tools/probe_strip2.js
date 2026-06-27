// probe_strip2.js — on a working clone of duplicator#474, strip the deformer
// (spring) to test if a per-copy DEFORMER is what establishes per-copy context for
// shapeId. Also dump the clone's FULL input list (sub-attrs included) vs a fresh
// build, to catch connections getAttributes hid.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("strip2.json");

const code = `
try {
  var REAL="duplicator#474";
  var savedHidden=api.get(REAL,"hidden");
  var c1=api.duplicate(REAL,true);
  var c2=api.duplicate(REAL,true);
  var report={ c1:c1, c2:c2, cloneInputs: api.getInConnectedAttributes(c1) };

  api.set(REAL,{"hidden":true});

  // c1 baseline (hide c2)
  api.set(c2,{"hidden":true}); api.set(c1,{"hidden":false});
  api.renderPNGFrame("${out('strip2_full.png')}",50);

  // c2: remove the deformer(s) — disconnect deformers.0 ; render
  api.disconnectInput(c2,"deformers.0");
  report.c2deformerAfter = api.getInConnection(c2,"deformers.0");
  report.c2deformersList = api.getInConnectedAttributes(c2).filter(function(a){return a.indexOf("deformers")===0;});
  api.set(c1,{"hidden":true}); api.set(c2,{"hidden":false});
  api.renderPNGFrame("${out('strip2_nodef.png')}",50);

  // restore
  api.set(REAL,{"hidden":savedHidden});
  if(api.layerExists(c1)) api.deleteLayer(c1);
  if(api.layerExists(c2)) api.deleteLayer(c2);

  api.writeToFile("${JSON_OUT}", JSON.stringify(report,null,2), true);
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
        ["strip2_full.png","strip2_nodef.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
