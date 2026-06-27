// dump_expressions.js — re-read the Duplicator.Blocs chain the RIGHT way, capturing
// what the first dump missed: per-attribute EXPRESSIONS (api.getAttributeExpression),
// enum labels (api.getAttributeDefinition / getDropdownNiceName), and animation flags.
// This is where any per-copy (index/position) logic hides — invisible to api.get +
// getInConnection. Usage: node tools/dump_expressions.js -> tools/expressions.json
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const JSON_OUT = path.join(__dirname, "expressions.json").replace(/\\/g, "/");

// the full Duplicator.Blocs driver chain (ids from scene_full.json)
const IDS = [
  "duplicator#474","getVector#38","isWithin#26","numberRange#102","numberRange#101",
  "value2#84","round#385","round#387","valueArray#68","oscillator#186",
  "basicShape#1050","basicShape#1051","basicShape#1049","basicShape#1047","basicShape#1053",
  "spring#180","spring#181"
];

const code = `
function safe(fn){try{return fn();}catch(e){return "ERR:"+e;}}
try {
  var ids = ${JSON.stringify(IDS)};
  var out = {};
  for (var i=0;i<ids.length;i++){ (function(id){
    if (!api.layerExists(id)) { out[id] = {missing:true}; return; }
    var rec = { type: safe(function(){return api.getLayerType(id);}),
                name: safe(function(){return api.getNiceName(id);}),
                expressions:{}, enums:{}, animated:[] };
    var attrs = safe(function(){return api.getAttributes(id);}) || [];
    for (var a=0;a<attrs.length;a++){ (function(at){
      // EXPRESSIONS — the thing the first dump never read
      var hasExpr = safe(function(){return api.hasAttributeExpression(id, at);});
      if (hasExpr === true) {
        rec.expressions[at] = safe(function(){return api.getAttributeExpression(id, at);});
      }
      // animation flags
      var anim = safe(function(){return api.isAnimatedAttribute(id, at);});
      if (anim === true) rec.animated.push(at);
      // enum labels: if an attr's definition has enumValues, record current value + label
      var def = safe(function(){return api.getAttributeDefinition(id, at);});
      if (def && def.enumValues) {
        var cur = safe(function(){return api.get(id, at);});
        rec.enums[at] = { value: cur, options: def.enumValues,
                          label: safe(function(){return api.getDropdownNiceName(id, at, cur);}) };
      }
    })(attrs[a]); }
    // generator types + the Sort 'Mode' enum specifically
    rec.generators = {};
    var gens = safe(function(){return api.getGenerators(id);}) || [];
    for (var g=0; g<gens.length; g++){ (function(gn){
      rec.generators[gn] = safe(function(){return api.getCurrentGeneratorType(id, gn);});
    })(gens[g]); }
    out[id] = rec;
  })(ids[i]); }
  api.writeToFile("${JSON_OUT}", JSON.stringify(out, null, 1), true);
  console.log("OK");
} catch(err){ api.writeToFile("${JSON_OUT}", JSON.stringify({error:String(err&&err.stack||err)}),true); console.log("ERR "+err); }
`;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host:"127.0.0.1", port:8080, path:"/post", method:"POST",
    headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)} },
  function(res){ res.on("data",function(){}); res.on("end",function(){
    setTimeout(function(){
      try{ console.log(fs.readFileSync(JSON_OUT.replace(/\//g,"\\"),"utf8")); }
      catch(e){ console.log("NO_FILE:", e.message); }
    }, 4000);
  }); }
);
req.setTimeout(30000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
