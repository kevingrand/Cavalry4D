// probe_parent.js — test whether PER-COPY isWithin->shapeId needs the duplicated
// shapes to be PARENTED under the duplicator (children), not just connected via the
// Input Shapes list. Builds variants and renders each.
//   P1: 2 shapes parented under dup (children), isWithin->shapeId
//   P2: 2 shapes via Input Shapes list + a hidden parented child probe shape
//   P3: 2 shapes via list, NO child (control == prior faithful, expect uniform)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("parent.json");

const code = `
function mk(name, gen, dims, color, hidden){
  var s = api.create("basicShape", name); api.setGenerator(s,"generator",gen);
  var o = {}; if (gen==="ellipseShape") o["generator.radius"]={x:dims,y:dims}; else o["generator.dimensions"]={x:dims,y:dims};
  if (color) o["material.materialColor"]=color; if (hidden) o["hidden"]=true;
  api.set(s,o); return s;
}
function dupCore(){
  var dup = api.create("duplicator","Dup");
  api.setGenerator(dup,"generator","sortDistribution");
  api.setGenerator(dup,"generator.input","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,"generator.mode":2,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1});
  return dup;
}
function swapWiring(dup){
  var mask = mk("Mask Shape","rectangleShape",360,null,true);
  api.set(mask,{"rotation":{x:0,y:0,z:45}});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nr = api.create("numberRange","NR");
  api.set(nr,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr,"value");
  api.connect(nr,"id",dup,"shapeId");
}
try {
  var orig = api.getActiveComp();
  // P1: shapes parented as children
  var c1 = api.createComp("__P1"); api.setActiveComp(c1);
  var d1 = dupCore();
  var a1 = mk("A","ellipseShape",22,"#7CB342",false);
  var b1 = mk("B","rectangleShape",44,"#1E66D0",false);
  api.parent(a1, d1); api.parent(b1, d1);
  swapWiring(d1);
  api.renderPNGFrame("${out('parent_p1.png')}",50);

  // P2: shapes via list + hidden parented child probe
  var c2 = api.createComp("__P2"); api.setActiveComp(c2);
  var d2 = dupCore();
  var a2 = mk("A","ellipseShape",22,"#7CB342",false);
  var b2 = mk("B","rectangleShape",44,"#1E66D0",false);
  api.connect(a2,"id",d2,"shapes"); api.connect(b2,"id",d2,"shapes");
  var child = mk("MASK1","rectangleShape",400,null,true); api.set(child,{"rotation":{x:0,y:0,z:45}});
  api.parent(child, d2);
  swapWiring(d2);
  api.renderPNGFrame("${out('parent_p2.png')}",50);

  api.setActiveComp(orig);
  api.deleteLayer(c1); api.deleteLayer(c2);
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
        ["parent_p1.png","parent_p2.png"].forEach(function(p){ console.log(p, fs.existsSync(out(p).replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 7000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
