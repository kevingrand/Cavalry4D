// probe_indexctx.js — test the duplicator 'indexContext' attribute as the
// enabler of PER-COPY isWithin->shapeId evaluation. Reads its default + type,
// then renders the baseline swap with indexContext = 0,1,2,3.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("indexctx.json");

const code = `
function core(comp, idxCtx) {
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
  api.setGenerator(dup,"generator","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,"generator.count":{x:8,y:8},
    "generator.distributionMode":1,"generator.size":{x:60,y:60}});
  api.connect(a,"id",dup,"shapes"); api.connect(b,"id",dup,"shapes");
  api.connect(nr,"id",dup,"shapeId");
  if (idxCtx !== null) api.set(dup,{"indexContext":idxCtx});
  return dup;
}
try {
  var orig = api.getActiveComp();
  // discover default + type from a throwaway
  var t = api.create("duplicator","T");
  var rep = { defaultIndexContext: api.get(t,"indexContext"),
              attrType: api.getAttrType(t,"indexContext"),
              hasIndexContext: api.hasAttribute(t,"indexContext") };
  api.deleteLayer(t);

  var comps = [];
  [0,1,2,3].forEach(function(v){
    var c = api.createComp("__ic"+v); comps.push(c);
    core(c, v);
    api.renderPNGFrame("${out('ic_')}"+v+".png", 50);
  });
  api.setActiveComp(orig);
  comps.forEach(function(c){ api.deleteLayer(c); });
  api.writeToFile("${JSON_OUT}", JSON.stringify(rep,null,2), true);
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
        [0,1,2,3].forEach(function(v){ console.log("ic_"+v+".png", fs.existsSync(out("ic_"+v+".png").replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 9000);
  }); }
);
req.setTimeout(50000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
