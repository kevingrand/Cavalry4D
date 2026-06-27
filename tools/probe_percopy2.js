// probe_percopy2.js — second round. Test whether a genuinely per-copy-varying
// shapePosition drive (getVector at nonzero strength) forces isWithin->shapeId
// to evaluate per-copy. Renders:
//   v2b: getVector normalize, strength 30  (small per-copy jitter)
//   v2c: getVector normalize, strength 300
//   vspring: baseline + a spring deformer on the duplicator
//   vfull: faithful rig (sort mode2 + spring + getVector strength 30)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("probe_percopy2.json");

const code = `
function core(comp) {
  api.setActiveComp(comp);
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#E0A030"});
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#D0504A"});
  var mask = api.create("basicShape","Mask"); api.setGenerator(mask,"generator","ellipseShape");
  api.set(mask,{"generator.radius":{x:170,y:170},"hidden":true});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nr = api.create("numberRange","NR");
  api.set(nr,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr,"value");
  var dup = api.create("duplicator","Dup");
  api.setGenerator(dup,"generator","sortDistribution");
  api.setGenerator(dup,"generator.input","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1});
  api.connect(a,"id",dup,"shapes"); api.connect(b,"id",dup,"shapes");
  api.connect(nr,"id",dup,"shapeId");
  return {dup:dup, mask:mask};
}
function addPos(dup, strength) {
  var target = api.create("basicShape","T"); api.setGenerator(target,"generator","rectangleShape");
  api.set(target,{"generator.dimensions":{x:420,y:420},"hidden":true});
  var gv = api.create("getVector","GV"); api.set(gv,{"normalize":true,"strength":strength});
  api.connect(target,"id",gv,"target");
  var v2 = api.create("value2","P"); api.connect(gv,"id",v2,"value");
  var rx = api.create("round","RX"); api.set(rx,{"rounding":60}); api.connect(v2,"value.x",rx,"value");
  api.connect(rx,"id",dup,"shapePosition.x");
  var ry = api.create("round","RY"); api.set(ry,{"rounding":60}); api.connect(v2,"value.y",ry,"value");
  api.connect(ry,"id",dup,"shapePosition.y");
}
function addSpring(dup) {
  var sp = api.create("spring","Spring");
  api.connect(sp,"id",dup,"deformers");
}
try {
  var orig = api.getActiveComp(); var res = {};
  var c1=api.createComp("__v2b"); var r1=core(c1); addPos(r1.dup,30); api.renderPNGFrame("${out('pp_v2b.png')}",50); res.v2b=1;
  var c2=api.createComp("__v2c"); var r2=core(c2); addPos(r2.dup,300); api.renderPNGFrame("${out('pp_v2c.png')}",50); res.v2c=1;
  var c3=api.createComp("__vspring"); var r3=core(c3); addSpring(r3.dup); api.renderPNGFrame("${out('pp_vspring.png')}",50); res.vspring=1;
  var c4=api.createComp("__vfull"); var r4=core(c4); api.set(r4.dup,{"generator.mode":2}); addSpring(r4.dup); addPos(r4.dup,30); api.renderPNGFrame("${out('pp_vfull.png')}",50); res.vfull=1;
  api.setActiveComp(orig);
  [c1,c2,c3,c4].forEach(function(c){api.deleteLayer(c);});
  api.writeToFile("${JSON_OUT}", JSON.stringify(res,null,2), true);
  console.log("OK");
} catch(err){ api.writeToFile("${JSON_OUT}", JSON.stringify({error:String(err&&err.stack||err)}),true); console.log("ERR "+err); }
`;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host:"127.0.0.1", port:8080, path:"/post", method:"POST",
    headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)} },
  function(res){ res.on("data",function(){}); res.on("end",function(){
    setTimeout(function(){
      try{ console.log("RESULT:", fs.readFileSync(JSON_OUT.replace(/\//g,"\\"),"utf8"));
        ["pp_v2b.png","pp_v2c.png","pp_vspring.png","pp_vfull.png"].forEach(function(p){
          console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 9000);
  }); }
);
req.setTimeout(50000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
