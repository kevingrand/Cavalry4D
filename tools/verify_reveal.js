// verify_reveal.js — live-verify the SHIPPED engine: concatenate the real
// src/ modules into the running Cavalry, run Engine.buildTextPreset, check the
// wiring + zero warnings, then delete everything created.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const OUT = path.join(__dirname, "verify_reveal_dump.json");
const OUT_FWD = OUT.replace(/\\/g, "/");
try { fs.unlinkSync(OUT); } catch (e) {}

function read(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
const modules = ["typemap.js", "engine.js"].map(read).join("\n");  // no entry.js (it builds UI)

const tail = `
try {
  var G = (typeof globalThis !== "undefined") ? globalThis : this;
  function layerOf(s){return s?String(s).split(".")[0]:"";}
  function drives(from,to,attr){var o=api.getOutConnections(from,"id")||[];for(var i=0;i<o.length;i++){if(layerOf(o[i])===to&&(!attr||String(o[i]).indexOf(attr)>=0))return true;}return false;}
  var E=G.MG.Engine; E.resetWarnings();
  var before={}; var snap=api.getAllSceneLayers(); for(var s=0;s<snap.length;s++)before[snap[s]]=true;
  var r=E.buildTextPreset("revealInShape", []);      // empty selection -> auto-stub mask + body
  var out={ok:r.ok, warnings:E.warnings.slice(), stubbed:r.stubbed,
    types:{sub:api.getLayerType(r.subMeshId), iw:api.getLayerType(r.isWithinId), va:api.getLayerType(r.valueArrayId), mask:api.getLayerType(r.maskId), body:api.getLayerType(r.bodyId)},
    wires:{
      mask_to_isWithin: drives(r.maskId, r.isWithinId, "inputShape"),
      isWithin_to_valueArray: drives(r.isWithinId, r.valueArrayId, "arrayIndex"),
      valueArray_to_subMesh: drives(r.valueArrayId, r.subMeshId, "shapeOpacity"),
      subMesh_to_body: drives(r.subMeshId, r.bodyId, "deformers")
    },
    settings:{
      sub_levelMode:api.get(r.subMeshId,"levelMode"), sub_useIndex:api.get(r.subMeshId,"useIndex"),
      iw_invert:api.get(r.isWithinId,"invert"),
      va_count:api.getArrayCount(r.valueArrayId,"array"), va_a0:api.get(r.valueArrayId,"array.0"), va_a1:api.get(r.valueArrayId,"array.1")
    }
  };
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
