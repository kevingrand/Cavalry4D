// probe_scene.js — dump the live Cavalry scene graph over the Stallion bridge.
// Usage: node tools/probe_scene.js  -> writes tools/scene_dump.json and prints byte count.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "scene_dump.json");
const OUT_FWD = OUT.replace(/\\/g, "/"); // forward slashes for the in-app string literal
try { fs.unlinkSync(OUT); } catch (e) {}

const code = [
  "try{",
  "  function safe(fn){try{return fn();}catch(e){return null;}}",
  "  var ids=api.getAllSceneLayers();",
  "  var out={count:ids.length,layers:[]};",
  "  for(var i=0;i<ids.length;i++){(function(id){",
  "    var rec={id:id,type:safe(function(){return api.getLayerType(id);}),name:safe(function(){return api.getNiceName(id);}),parent:safe(function(){return api.getParent(id);})};",
  "    rec.children=safe(function(){return api.getChildren(id);});",
  "    var inA=safe(function(){return api.getInConnectedAttributes(id);})||[];",
  "    rec.inputs={};",
  "    for(var a=0;a<inA.length;a++){(function(at){rec.inputs[at]=safe(function(){return api.getInConnection(id,at);});})(inA[a]);}",
  "    var outA=safe(function(){return api.getOutConnectedAttributes(id);})||[];",
  "    rec.outputs={};",
  "    for(var b=0;b<outA.length;b++){(function(at){rec.outputs[at]=safe(function(){return api.getOutConnections(id,at);});})(outA[b]);}",
  "    var gens=safe(function(){return api.getGenerators(id);})||[];",
  "    if(gens.length){rec.generators={};for(var g=0;g<gens.length;g++){(function(gn){rec.generators[gn]=safe(function(){return api.getCurrentGeneratorType(id,gn);});})(gens[g]);}}",
  "    rec.attrs=safe(function(){return api.getAttributes(id);});",
  "    out.layers.push(rec);",
  "  })(ids[i]);}",
  "  api.writeToFile(\"" + OUT_FWD + "\",JSON.stringify(out,null,1),true);",
  "  console.log(\"DUMP_OK\");",
  "}catch(err){api.writeToFile(\"" + OUT_FWD + "\",JSON.stringify({error:String(err&&err.stack||err)}),true);}"
].join("\n");

const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host: "127.0.0.1", port: 8080, path: "/post", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
  function (res) {
    res.on("data", function () {});
    res.on("end", function () {
      setTimeout(function () {
        try { console.log("BYTES " + fs.readFileSync(OUT, "utf8").length); }
        catch (e) { console.log("NO_FILE " + e.message); }
      }, 2000);
    });
  }
);
req.setTimeout(8000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
