// probe_parentbeh.js — test whether driver BEHAVIOURS must be PARENTED under the
// duplicator to receive per-copy context.
//   PB1: Random + numberRange parented under dup -> shapeId (does context flow now?)
//   PB2: isWithin + numberRange parented under dup -> shapeId (mask stays outside)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("parentbeh.json");

const code = `
function shapes(){
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#7CB342"});
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#1E66D0"});
  return [a,b];
}
function dup(){
  var d = api.create("duplicator","Dup");
  api.setGenerator(d,"generator","sortDistribution");
  api.setGenerator(d,"generator.input","gridDistribution");
  api.set(d,{"autoId":false,"useIndex":true,"generator.mode":2,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1,"generator.input.direction":1});
  return d;
}
try {
  var orig = api.getActiveComp();
  // PB1: Random + numberRange parented under dup
  var c1 = api.createComp("__pb1"); api.setActiveComp(c1);
  var s1 = shapes(); var d1 = dup();
  api.connect(s1[0],"id",d1,"shapes"); api.connect(s1[1],"id",d1,"shapes");
  var rnd = api.create("random","Rnd"); api.parent(rnd, d1);
  var nr1 = api.create("numberRange","NR"); api.parent(nr1, d1);
  api.set(nr1,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(rnd,"id",nr1,"value");
  api.connect(nr1,"id",d1,"shapeId");
  api.renderPNGFrame("${out('pb_random.png')}",50);

  // PB2: isWithin + numberRange parented under dup; mask OUTSIDE
  var c2 = api.createComp("__pb2"); api.setActiveComp(c2);
  var s2 = shapes(); var d2 = dup();
  api.connect(s2[0],"id",d2,"shapes"); api.connect(s2[1],"id",d2,"shapes");
  var mask = api.create("basicShape","Mask"); api.setGenerator(mask,"generator","rectangleShape");
  api.set(mask,{"generator.dimensions":{x:360,y:360},"rotation":{x:0,y:0,z:45},"hidden":true});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true}); api.parent(iw, d2);
  api.connect(mask,"id",iw,"inputShape");
  var nr2 = api.create("numberRange","NR2"); api.parent(nr2, d2);
  api.set(nr2,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr2,"value");
  api.connect(nr2,"id",d2,"shapeId");
  api.renderPNGFrame("${out('pb_iswithin.png')}",50);

  api.setActiveComp(orig); api.deleteLayer(c1); api.deleteLayer(c2);
  api.writeToFile("${JSON_OUT}", JSON.stringify({ok:true},null,2), true);
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
        ["pb_random.png","pb_iswithin.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
