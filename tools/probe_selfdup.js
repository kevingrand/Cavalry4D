// probe_selfdup.js — does duplicating MY OWN fresh-built duplicator flip it from
// uniform to per-copy? If yes, the preset recipe is: build from scratch, then
// api.duplicate the duplicator (keep the copy, drop the original).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("selfdup.json");

const code = `
function shapes(){
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#7CB342"});
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#1E66D0"});
  return [a,b];
}
try {
  var orig = api.getActiveComp();
  var comp = api.createComp("__selfdup"); api.setActiveComp(comp);
  var s = shapes();
  var dup = api.create("duplicator","D");
  api.setGenerator(dup,"generator","sortDistribution");
  api.setGenerator(dup,"generator.input","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,"generator.mode":2,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1,"generator.input.direction":1});
  api.connect(s[0],"id",dup,"shapes"); api.connect(s[1],"id",dup,"shapes");
  var mask = api.create("basicShape","Mask"); api.setGenerator(mask,"generator","rectangleShape");
  api.set(mask,{"generator.dimensions":{x:360,y:360},"rotation":{x:0,y:0,z:45},"hidden":true});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nr = api.create("numberRange","NR");
  api.set(nr,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr,"value");
  api.connect(nr,"id",dup,"shapeId");

  // render fresh original (uniform expected)
  api.renderPNGFrame("${out('selfdup_orig.png')}",50);

  // duplicate my own duplicator, render the copy (hide original)
  var dup2 = api.duplicate(dup, true);
  api.set(dup,{"hidden":true});
  api.renderPNGFrame("${out('selfdup_copy.png')}",50);

  api.setActiveComp(orig); api.deleteLayer(comp);
  api.writeToFile("${JSON_OUT}", JSON.stringify({dup:dup, dup2:dup2},null,2), true);
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
        ["selfdup_orig.png","selfdup_copy.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
