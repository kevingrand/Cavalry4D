// probe_diff.js — build my faithful rebuild, then DIFF every attribute + connection
// against the real duplicator#474. The attribute that differs is the per-copy trigger.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const JSON_OUT = path.join(__dirname, "diff.json").replace(/\\/g, "/");

const code = `
function dumpDup(id){
  var rec = { attrs:{}, conns:{}, gens:{} };
  var attrs = api.getAttributes(id) || [];
  for (var i=0;i<attrs.length;i++){ var at=attrs[i];
    try { rec.attrs[at] = api.get(id, at); } catch(e){ rec.attrs[at] = "ERR"; }
    var c = ""; try { c = api.getInConnection(id, at); } catch(e){}
    if (c) rec.conns[at] = c;
  }
  var gens = api.getGenerators(id)||[];
  for (var g=0;g<gens.length;g++){ try { rec.gens[gens[g]] = api.getCurrentGeneratorType(id, gens[g]); } catch(e){} }
  return rec;
}
try {
  var orig = api.getActiveComp();
  // build my faithful rebuild in a temp comp
  var comp = api.createComp("__Diff"); api.setActiveComp(comp);
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#7CB342"});
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#1E66D0"});
  var mask = api.create("basicShape","Mask"); api.setGenerator(mask,"generator","rectangleShape");
  api.set(mask,{"generator.dimensions":{x:360,y:360},"rotation":{x:0,y:0,z:45},"hidden":true});
  var iw = api.create("isWithin","IW"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nr = api.create("numberRange","NR");
  api.set(nr,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr,"value");
  var dup = api.create("duplicator","Dup");
  api.setGenerator(dup,"generator","sortDistribution");
  api.setGenerator(dup,"generator.input","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,"generator.mode":2,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1});
  api.connect(a,"id",dup,"shapes"); api.connect(b,"id",dup,"shapes");
  api.connect(nr,"id",dup,"shapeId");

  var mine = dumpDup(dup);
  var real = api.layerExists("duplicator#474") ? dumpDup("duplicator#474") : {missing:true};

  // compute attribute-value diffs
  var diffs = [];
  if (!real.missing) {
    var allKeys = {};
    Object.keys(mine.attrs).forEach(function(k){allKeys[k]=1;});
    Object.keys(real.attrs).forEach(function(k){allKeys[k]=1;});
    Object.keys(allKeys).forEach(function(k){
      var mv = JSON.stringify(mine.attrs[k]), rv = JSON.stringify(real.attrs[k]);
      var mc = mine.conns[k]?("<conn>"):"", rc = real.conns[k]?("<conn:"+real.conns[k]+">"):"";
      if (mv !== rv || (!!mine.conns[k]) !== (!!real.conns[k])) {
        diffs.push({ attr:k, mine:mine.attrs[k], real:real.attrs[k],
                     mineConn:mine.conns[k]||null, realConn:real.conns[k]||null });
      }
    });
  }
  api.setActiveComp(orig); api.deleteLayer(comp);
  api.writeToFile("${JSON_OUT}", JSON.stringify({ gensMine:mine.gens, gensReal:real.gens, diffs:diffs }, null, 1), true);
  console.log("OK diffs="+diffs.length);
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
