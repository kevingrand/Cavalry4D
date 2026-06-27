// probe_js_swap.js — test a TRUE per-copy shapeId swap driven by a per-copy JS
// expression (ctx.positionX/positionY). One duplicator, two shapes; each copy
// fully becomes shapeA or shapeB by its own grid position vs a circular region.
// No masking, no clipping. Renders tools/js_swap.png.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("js_swap.json");

const code = `
try {
  var orig = api.getActiveComp();
  var comp = api.createComp("__JSswap");
  api.setActiveComp(comp);

  var a = api.create("basicShape","A yellow"); api.setGenerator(a,"generator","ellipseShape");
  api.set(a,{"generator.radius":{x:22,y:22},"material.materialColor":"#E0A030"});
  var b = api.create("basicShape","B red"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:44,y:44},"material.materialColor":"#D0504A"});

  var dup = api.create("duplicator","Dup");
  api.setGenerator(dup,"generator","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,
    "generator.count":{x:8,y:8},"generator.distributionMode":1,"generator.size":{x:60,y:60}});
  api.connect(a,"id",dup,"shapes");
  api.connect(b,"id",dup,"shapes");

  // per-copy JS: shapeId = inside circle(R=170) ? 1 : 0
  var js = api.create("javaScriptUtility","SwapLogic");
  var added = api.addDynamic(js,"shapeId","double");
  var attrsAfter = api.getAttributes(js);
  api.set(js,{"script":"var R=170; var inside = (ctx.positionX*ctx.positionX + ctx.positionY*ctx.positionY) <= R*R; shapeId = inside ? 1 : 0;"});
  api.connect(js,"shapeId",dup,"shapeId");

  var info = {
    jsAttrs: attrsAfter,
    shapeIdConn: api.getInConnection(dup,"shapeId"),
    jsOut: api.getOutConnections(js,"shapeId")
  };

  api.renderPNGFrame("${out('js_swap.png')}", 50);
  api.setActiveComp(orig); api.deleteLayer(comp);
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
      try{ console.log("RESULT:", fs.readFileSync(JSON_OUT.replace(/\//g,"\\"),"utf8"));
        console.log("PNG:", fs.existsSync(out("js_swap.png").replace(/\//g,"\\"))); }
      catch(e){ console.log("NO_FILE:", e.message); }
    }, 6000);
  }); }
);
req.setTimeout(40000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
