// probe_context.js — diagnostics for per-copy context flow.
//   R: drive Shape Id with a Random behaviour (docs: gets per-copy index) -> does
//      context flow AT ALL in my build? (expect per-copy varied shapes if yes)
//   D: isWithin->shapeId with generator.input.direction=1 (the only diff vs real)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("context.json");

const code = `
function shapes(){
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#7CB342"});
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#1E66D0"});
  return [a,b];
}
function dup(dir){
  var d = api.create("duplicator","Dup");
  api.setGenerator(d,"generator","sortDistribution");
  api.setGenerator(d,"generator.input","gridDistribution");
  api.set(d,{"autoId":false,"useIndex":true,"generator.mode":2,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1,"generator.input.direction":dir});
  return d;
}
try {
  var orig = api.getActiveComp();
  var info = {};

  // R: Random -> numberRange -> shapeId
  var cR = api.createComp("__ctxR"); api.setActiveComp(cR);
  var sR = shapes(); var dR = dup(1);
  api.connect(sR[0],"id",dR,"shapes"); api.connect(sR[1],"id",dR,"shapes");
  var rnd = api.create("random","Rnd");
  info.randomType = api.getLayerType(rnd);
  var nrR = api.create("numberRange","NR");
  api.set(nrR,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  // random commonly outputs 0..1 via 'id'; map through numberRange to shapeId
  api.connect(rnd,"id",nrR,"value");
  api.connect(nrR,"id",dR,"shapeId");
  info.shapeIdConnR = api.getInConnection(dR,"shapeId");
  api.renderPNGFrame("${out('ctx_random.png')}",50);

  // D: isWithin -> shapeId, direction=1
  var cD = api.createComp("__ctxD"); api.setActiveComp(cD);
  var sD = shapes(); var dD = dup(1);
  api.connect(sD[0],"id",dD,"shapes"); api.connect(sD[1],"id",dD,"shapes");
  var mask = api.create("basicShape","Mask"); api.setGenerator(mask,"generator","rectangleShape");
  api.set(mask,{"generator.dimensions":{x:360,y:360},"rotation":{x:0,y:0,z:45},"hidden":true});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nrD = api.create("numberRange","NR2");
  api.set(nrD,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nrD,"value");
  api.connect(nrD,"id",dD,"shapeId");
  api.renderPNGFrame("${out('ctx_dir1.png')}",50);

  api.setActiveComp(orig); api.deleteLayer(cR); api.deleteLayer(cD);
  api.writeToFile("${JSON_OUT}", JSON.stringify(info,null,2), true);
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
        ["ctx_random.png","ctx_dir1.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
