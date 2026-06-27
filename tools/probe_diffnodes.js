// probe_diffnodes.js — the per-copy trigger is a node SETTING on the cloned
// isWithin / numberRange that my fresh api.create doesn't match. Clone the real dup,
// trace shapeId <- numberRange <- isWithin, dump their full attrs, build fresh
// equivalents, and DIFF. The differing attribute is the answer.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const JSON_OUT = path.join(__dirname, "diffnodes.json").replace(/\\/g, "/");

const code = `
function lid(s){ return s ? String(s).split(".")[0] : ""; }
function dumpAll(id){
  var r={}; var attrs=api.getAttributes(id)||[];
  for(var i=0;i<attrs.length;i++){ var a=attrs[i];
    try{ r[a]=api.get(id,a); }catch(e){ r[a]="ERR"; }
    var c=""; try{c=api.getInConnection(id,a);}catch(e){}
    if(c) r["__conn__"+a]=c;
  }
  r["__type"]=api.getLayerType(id);
  var gens=api.getGenerators(id)||[]; for(var g=0;g<gens.length;g++){ r["__gen__"+gens[g]]=api.getCurrentGeneratorType(id,gens[g]); }
  return r;
}
function diff(real, mine){
  var keys={}; Object.keys(real).forEach(function(k){keys[k]=1;}); Object.keys(mine).forEach(function(k){keys[k]=1;});
  var d=[];
  Object.keys(keys).forEach(function(k){
    if(k.indexOf("__conn__")===0) return; // connections differ by id, skip
    var rv=JSON.stringify(real[k]), mv=JSON.stringify(mine[k]);
    if(rv!==mv) d.push({attr:k, real:real[k], mine:mine[k]});
  });
  return d;
}
try {
  var REAL="duplicator#474";
  var savedHidden=api.get(REAL,"hidden");
  var c=api.duplicate(REAL,true);
  // trace shapeId <- numberRange <- isWithin on the clone
  var nrId=lid(api.getInConnection(c,"shapeId"));
  var iwId=lid(api.getInConnection(nrId,"value"));
  var report={ cloneId:c, clonedNR:nrId, clonedIW:iwId,
               clonedNRtype:api.getLayerType(nrId), clonedIWtype:api.getLayerType(iwId) };
  var realNR=dumpAll(nrId), realIW=dumpAll(iwId);

  // build fresh equivalents the way my engine does
  var freshNR=api.create("numberRange","FreshNR");
  api.set(freshNR,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  var freshIW=api.create("isWithin","FreshIW");
  api.set(freshIW,{"invert":true});
  var mineNR=dumpAll(freshNR), mineIW=dumpAll(freshIW);

  report.numberRangeDiff=diff(realNR, mineNR);
  report.isWithinDiff=diff(realIW, mineIW);

  // cleanup
  api.set(REAL,{"hidden":savedHidden});
  if(api.layerExists(c)) api.deleteLayer(c);
  api.deleteLayer(freshNR); api.deleteLayer(freshIW);

  api.writeToFile("${JSON_OUT}", JSON.stringify(report,null,2), true);
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
    }, 5000);
  }); }
);
req.setTimeout(35000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
