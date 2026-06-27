// probe_jsutil.js — discover how javaScriptUtility exposes a connectable per-copy
// output, and whether ctx.positionX/Y exist when driving a duplicator shapeId.
// No render; dumps attribute lists + connection results.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const JSON_OUT = path.join(__dirname, "jsutil.json").replace(/\\/g, "/");

const code = `
try {
  var report = {};
  var js = api.create("javaScriptUtility","JS");
  report.typeOf = api.getLayerType(js);
  report.attrsInitial = api.getAttributes(js);
  // try addDynamic variants
  var r1 = api.addDynamic(js,"outD","double");
  var r2 = api.addDynamic(js,"outI","int");
  report.addDynamicReturns = { outD:r1, outI:r2 };
  report.attrsAfterDynamic = api.getAttributes(js);
  report.hasOutD = api.hasAttribute(js,"outD");
  report.hasResult = api.hasAttribute(js,"result");
  // does it have a 'script' attr?
  report.hasScript = api.hasAttribute(js,"script");

  // Now test driving a duplicator shapeId per-copy.
  var a = api.create("basicShape","A"); api.setGenerator(a,"generator","ellipseShape");
  var b = api.create("basicShape","B"); api.setGenerator(b,"generator","rectangleShape");
  var dup = api.create("duplicator","D");
  api.setGenerator(dup,"generator","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,"generator.count":{x:4,y:4},"generator.distributionMode":1,"generator.size":{x:60,y:60}});
  api.connect(a,"id",dup,"shapes"); api.connect(b,"id",dup,"shapes");
  api.set(js,{"script":"outD = (ctx.positionX > 0) ? 1 : 0;"});
  api.connect(js,"outD",dup,"shapeId");
  report.shapeIdConn = api.getInConnection(dup,"shapeId");
  report.jsOutConns = api.getOutConnections(js,"outD");

  // also list ALL layer types containing 'java' or 'script' or 'expression' — probe creatable
  report.dupShapeIdType = api.getAttrType(dup,"shapeId");

  api.deleteLayer(js); api.deleteLayer(a); api.deleteLayer(b); api.deleteLayer(dup);
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
    }, 3500);
  }); }
);
req.setTimeout(30000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
