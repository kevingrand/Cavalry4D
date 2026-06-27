// probe_isolate_real.js — render the REAL duplicator#474 from the open BLOXEL
// scene in isolation, to confirm the per-copy swap is self-contained in the
// captured nodes and visible at a static frame. NON-DESTRUCTIVE: saves & restores
// every top-level layer's hidden state.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("isolate_real.json");

const code = `
try {
  var KEEP = "group#917";          // ancestor of duplicator#474
  var tops = api.getCompLayers(true) || [];
  var saved = {};
  for (var i=0;i<tops.length;i++){ saved[tops[i]] = api.get(tops[i], "hidden"); }
  // hide every top-level layer except the one holding our duplicator
  for (var j=0;j<tops.length;j++){ if (tops[j] !== KEEP) api.set(tops[j], {"hidden":true}); }
  if (api.layerExists(KEEP)) api.set(KEEP, {"hidden":false});

  var frame = api.getFrame();
  api.renderPNGFrame("${out('isolate_real.png')}", 50);

  // restore
  for (var k in saved){ if (saved.hasOwnProperty(k)) api.set(k, {"hidden": saved[k]}); }

  api.writeToFile("${JSON_OUT}", JSON.stringify({ok:true, frame:frame, topCount:tops.length}, null, 2), true);
  console.log("OK");
} catch(err){
  api.writeToFile("${JSON_OUT}", JSON.stringify({error:String(err&&err.stack||err)}), true);
  console.log("ERR " + err);
}
`;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host:"127.0.0.1", port:8080, path:"/post", method:"POST",
    headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)} },
  function(res){ res.on("data",function(){}); res.on("end",function(){
    setTimeout(function(){
      try{ console.log("RESULT:", fs.readFileSync(JSON_OUT.replace(/\//g,"\\"),"utf8"));
        console.log("PNG:", fs.existsSync(out("isolate_real.png").replace(/\//g,"\\")));
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 6000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
