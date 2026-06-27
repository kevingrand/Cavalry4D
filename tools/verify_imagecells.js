// verify_imagecells.js — live-verify the SHIPPED engine: build both Image
// cloners with no shape selected and confirm the invented cells report the
// "Shape"-suffixed generator (ellipseShape/rectangleShape), not a polygon.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const OUT = path.join(__dirname, "verify_imagecells_dump.json");
const OUT_FWD = OUT.replace(/\\/g, "/");
try { fs.unlinkSync(OUT); } catch (e) {}

function read(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
const modules = ["typemap.js", "engine.js"].map(read).join("\n");

const tail = `
try {
  var G = (typeof globalThis !== "undefined") ? globalThis : this;
  var E=G.MG.Engine;
  var before={}; var snap=api.getAllSceneLayers(); for(var s=0;s<snap.length;s++)before[snap[s]]=true;
  function run(key){
    E.resetWarnings();
    var r=E.buildRig(key, []);           // no shape selected -> invents a cell
    return { warnings:E.warnings.slice(),
             cellType:api.getLayerType(r.shapeId),
             gen:api.getCurrentGeneratorType(r.shapeId, "generator") };
  }
  var out={ size:run("imageSize"), density:run("imageDensity") };
  var nowL=api.getAllSceneLayers(); var del=0;
  for(var k=0;k<nowL.length;k++){if(!before[nowL[k]]){try{api.deleteLayer(nowL[k]);del++;}catch(e){}}}
  out.cleaned_up=del;
  api.writeToFile("${OUT_FWD}", JSON.stringify(out,null,1), true);
  console.log("VERIFY_OK");
} catch(err){ api.writeToFile("${OUT_FWD}", JSON.stringify({error:String(err&&err.stack||err)}),true); }
`;

const code = modules + "\n" + tail;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host: "127.0.0.1", port: 8080, path: "/post", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
  function (res) { res.on("data", function () {}); res.on("end", function () {
    setTimeout(function () { try { console.log(fs.readFileSync(OUT, "utf8")); } catch (e) { console.log("NO_FILE " + e.message); } }, 2200);
  }); }
);
req.setTimeout(10000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
