// probe_gen.js — is api.setGenerator the reason fresh duplicators evaluate shapeId
// uniformly? Test fresh duplicators built different ways, each with isWithin->shapeId:
//   T1: default generator (NO setGenerator call)
//   T2: setGenerator gridDistribution only (no Sort wrapper)
//   T3: setGenerator sort+grid (my usual) -- control, expect uniform
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("gen.json");

const code = `
function shapes(){
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#7CB342"});
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#1E66D0"});
  return [a,b];
}
function swap(dup){
  var mask = api.create("basicShape","Mask"); api.setGenerator(mask,"generator","rectangleShape");
  api.set(mask,{"generator.dimensions":{x:360,y:360},"rotation":{x:0,y:0,z:45},"hidden":true});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nr = api.create("numberRange","NR");
  api.set(nr,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr,"value");
  api.connect(nr,"id",dup,"shapeId");
}
try {
  var orig = api.getActiveComp();
  var info = {};

  // T1: default generator
  var c1=api.createComp("__g1"); api.setActiveComp(c1);
  var s1=shapes(); var d1=api.create("duplicator","D1");
  info.t1_defaultGen = api.getCurrentGeneratorType(d1,"generator");
  api.set(d1,{"autoId":false,"useIndex":true});
  api.connect(s1[0],"id",d1,"shapes"); api.connect(s1[1],"id",d1,"shapes");
  swap(d1);
  api.renderPNGFrame("${out('gen_t1.png')}",50);

  // T2: plain gridDistribution
  var c2=api.createComp("__g2"); api.setActiveComp(c2);
  var s2=shapes(); var d2=api.create("duplicator","D2");
  api.setGenerator(d2,"generator","gridDistribution");
  api.set(d2,{"autoId":false,"useIndex":true,"generator.count":{x:8,y:8},
    "generator.distributionMode":1,"generator.size":{x:60,y:60}});
  api.connect(s2[0],"id",d2,"shapes"); api.connect(s2[1],"id",d2,"shapes");
  swap(d2);
  api.renderPNGFrame("${out('gen_t2.png')}",50);

  api.setActiveComp(orig); api.deleteLayer(c1); api.deleteLayer(c2);
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
        ["gen_t1.png","gen_t2.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
