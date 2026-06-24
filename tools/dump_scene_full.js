// dump_scene_full.js — COMPLETE scene dump over the Stallion bridge: every layer
// with its type, hierarchy, generators, ALL in/out connections (exact attr paths),
// AND every attribute's VALUE. One file -> reverse-engineer offline without
// burning round-trips. Usage: node tools/dump_scene_full.js
//   -> writes tools/scene_full.json  (read it selectively; it is large)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "scene_full.json");
const OUT_FWD = OUT.replace(/\\/g, "/");
try { fs.unlinkSync(OUT); } catch (e) {}

// Runs inside Cavalry. Captures everything; guards every call so one bad attr
// can't abort the dump. Values are stored raw (objects/arrays kept) so the exact
// shape of e.g. numberRange settings, shapeId drivers, positions is preserved.
const code = [
  "try{",
  "  function safe(fn){try{return fn();}catch(e){return null;}}",
  "  var ids=api.getAllSceneLayers()||[];",
  "  var out={count:ids.length, generatedBy:'dump_scene_full', layers:[], byType:{}, duplicators:[]};",
  "  for(var i=0;i<ids.length;i++){(function(id){",
  "    var type=safe(function(){return api.getLayerType(id);});",
  "    out.byType[type]=(out.byType[type]||0)+1;",
  "    var rec={ id:id, type:type, name:safe(function(){return api.getNiceName(id);}),",
  "      parent:safe(function(){return api.getParent(id);}),",
  "      children:safe(function(){return api.getChildren(id);})||[],",
  "      hidden:safe(function(){return api.get(id,'hidden');}) };",
  "    // generators: attrId -> current generator type",
  "    var gens=safe(function(){return api.getGenerators(id);})||[];",
  "    if(gens.length){ rec.generators={}; for(var g=0;g<gens.length;g++){ (function(gn){ rec.generators[gn]=safe(function(){return api.getCurrentGeneratorType(id,gn);}); })(gens[g]); } }",
  "    // INPUT connections: attr -> 'sourceLayer.sourceAttr'",
  "    var inA=safe(function(){return api.getInConnectedAttributes(id);})||[];",
  "    rec.inputs={}; for(var a=0;a<inA.length;a++){ (function(at){ rec.inputs[at]=safe(function(){return api.getInConnection(id,at);}); })(inA[a]); }",
  "    // OUTPUT connections: attr -> ['targetLayer.targetAttr', ...]",
  "    var outA=safe(function(){return api.getOutConnectedAttributes(id);})||[];",
  "    rec.outputs={}; for(var b=0;b<outA.length;b++){ (function(at){ rec.outputs[at]=safe(function(){return api.getOutConnections(id,at);}); })(outA[b]); }",
  "    // ALL attribute VALUES (raw). Skip the noisy 'id' self-attr.",
  "    var attrs=safe(function(){return api.getAttributes(id);})||[];",
  "    rec.values={}; for(var c=0;c<attrs.length;c++){ (function(at){ if(at==='id')return; rec.values[at]=safe(function(){return api.get(id,at);}); })(attrs[c]); }",
  "    // bounding box for shapes (world space)",
  "    rec.bbox=safe(function(){return api.getBoundingBox(id,true);});",
  "    out.layers.push(rec);",
  "    if(type==='duplicator'){ out.duplicators.push({ id:id, name:rec.name, shapes:Object.keys(rec.inputs).filter(function(k){return k.indexOf('shapes')===0;}), perCopyInputs:Object.keys(rec.inputs).filter(function(k){return k.indexOf('shape')===0||k==='generator';}) }); }",
  "  })(ids[i]);}",
  "  api.writeToFile('" + OUT_FWD + "', JSON.stringify(out,null,1), true);",
  "  console.log('FULL_DUMP_OK '+ids.length);",
  "}catch(err){ api.writeToFile('" + OUT_FWD + "', JSON.stringify({error:String(err&&err.stack||err)}),true); }"
].join("\n");

const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host: "127.0.0.1", port: 8080, path: "/post", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
  function (res) { res.on("data", function () {}); res.on("end", function () {
    // big scene + per-attr get calls -> allow time to write the file
    setTimeout(function () {
      try { var s = fs.readFileSync(OUT, "utf8"); console.log("BYTES " + s.length); }
      catch (e) { console.log("NO_FILE " + e.message); }
    }, 6000);
  }); }
);
req.setTimeout(40000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code + " (is Stallion running in Cavalry?)"); });
req.write(body); req.end();
