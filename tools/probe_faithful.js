// probe_faithful.js — faithful rebuild of Duplicator.Blocs per the live panel:
//   Distribution = Sort (Mode: Distance From Centroid), Input = Grid 8x8 60 Step
//   2 input shapes (A,B); Shape Id <- numberRange <- isWithin(invert, Mask diamond)
//   Shape Position <- round(60) <- value2 <- getVector(target=Push rect) <- oscillator
//   NO mask clip. Render at several frames to see if/when per-copy swap appears.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = (n) => path.join(__dirname, n).replace(/\\/g, "/");
const JSON_OUT = out("faithful.json");

const code = `
function build(comp) {
  api.setActiveComp(comp);
  var a = api.create("basicShape","BLOC_A"); api.setGenerator(a,"generator","rectangleShape");
  api.set(a,{"generator.dimensions":{x:46,y:46},"material.materialColor":"#E0A030"});
  var b = api.create("basicShape","BLOC_B"); api.setGenerator(b,"generator","rectangleShape");
  api.set(b,{"generator.dimensions":{x:46,y:46},"material.materialColor":"#D0504A"});

  // Mask Shape: a 360 diamond (rect rotated 45), hidden — ONLY an isWithin test shape.
  var mask = api.create("basicShape","Mask Shape"); api.setGenerator(mask,"generator","rectangleShape");
  api.set(mask,{"generator.dimensions":{x:360,y:360},"rotation":{x:0,y:0,z:45},"hidden":true});

  var iw = api.create("isWithin","IsWithin"); api.set(iw,{"invert":true});
  api.connect(mask,"id",iw,"inputShape");
  var nr = api.create("numberRange","Shapes ID");
  api.set(nr,{"min":0,"max":1,"sourceMin":0,"sourceMax":1,"clampValues":true});
  api.connect(iw,"id",nr,"value");

  // Duplicator: Sort wrapping Grid, Mode 2 = Distance From Centroid
  var dup = api.create("duplicator","Duplicator.Blocs");
  api.setGenerator(dup,"generator","sortDistribution");
  api.setGenerator(dup,"generator.input","gridDistribution");
  api.set(dup,{"autoId":false,"useIndex":true,"generator.mode":2,
    "generator.input.count":{x:8,y:8},"generator.input.size":{x:60,y:60},
    "generator.input.distributionMode":1});
  api.connect(a,"id",dup,"shapes");
  api.connect(b,"id",dup,"shapes");
  api.connect(nr,"id",dup,"shapeId");

  // Shape Position chain (the push): getVector(target) <- oscillator strength
  var push = api.create("basicShape","Push blocs"); api.setGenerator(push,"generator","rectangleShape");
  api.set(push,{"generator.dimensions":{x:420,y:420},"hidden":true});
  var osc = api.create("oscillator","Oscillator");
  api.set(osc,{"minimum":2000,"maximum":13000,"frequency":0.5,"numberOfWaves":10,
    "timeScale":0.5,"timeOffset":-1,"strengthToZero":true,"waveType":4});
  var gv = api.create("getVector","GetVector"); api.set(gv,{"normalize":true});
  api.connect(push,"id",gv,"target");
  api.connect(osc,"id",gv,"strength");
  var v2 = api.create("value2","Pos"); api.connect(gv,"id",v2,"value");
  var rx = api.create("round","XSteps"); api.set(rx,{"rounding":60}); api.connect(v2,"value.x",rx,"value");
  api.connect(rx,"id",dup,"shapePosition.x");
  var ry = api.create("round","YSteps"); api.set(ry,{"rounding":60}); api.connect(v2,"value.y",ry,"value");
  api.connect(ry,"id",dup,"shapePosition.y");
  return dup;
}
try {
  var orig = api.getActiveComp();
  var origFrame = api.getFrame();
  var comp = api.createComp("__Faithful");
  build(comp);
  var frames = [0, 5, 30, 60, 120];
  for (var i=0;i<frames.length;i++){
    api.setFrame(frames[i]);
    api.renderPNGFrame("${out('faithful_f')}"+frames[i]+".png", 50);
  }
  api.setFrame(origFrame);
  api.setActiveComp(orig);
  api.deleteLayer(comp);
  api.writeToFile("${JSON_OUT}", JSON.stringify({ok:true, frames:frames, origFrame:origFrame},null,2), true);
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
        [0,5,30,60,120].forEach(function(f){ console.log("f"+f, fs.existsSync(out("faithful_f"+f+".png").replace(/\//g,"\\"))); });
      }catch(e){ console.log("NO_FILE:", e.message); }
    }, 11000);
  }); }
);
req.setTimeout(60000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
