// verify_context.js — live-verify the SHIPPED Quick Actions: concatenate the
// real src/ modules into the running Cavalry, run a battery of
// Engine.runContextAction() keys on stub layers, confirm the wiring + zero
// warnings, confirm Selection.classify() against real layers, and PROBE the
// few api.* calls this feature newly relies on (duplicate / preCompose /
// centrePivot / getSuperTypes). Everything created is deleted at the end.
//
// Prereq: Cavalry open with the Stallion bridge listening on 127.0.0.1:8080.
// Usage: node tools/verify_context.js  -> prints + writes verify_context_dump.json
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const OUT = path.join(__dirname, "verify_context_dump.json");
const OUT_FWD = OUT.replace(/\\/g, "/");
try { fs.unlinkSync(OUT); } catch (e) {}

function read(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
const modules = ["typemap.js", "engine.js", "selection.js"].map(read).join("\n");  // no panel/entry (they build UI)

const tail = `
try {
  var G = (typeof globalThis !== "undefined") ? globalThis : this;
  function layerOf(s){return s?String(s).split(".")[0]:"";}
  function drives(from,to){var o=api.getOutConnections(from,"id")||[];for(var i=0;i<o.length;i++){if(layerOf(o[i])===to)return true;}return false;}
  function exists(name){return typeof api[name]==="function";}
  var E=G.MG.Engine, S=G.MG.Selection; E.resetWarnings();

  // snapshot so we can delete everything we create
  var before={}; var snap=api.getAllSceneLayers(); for(var s=0;s<snap.length;s++)before[snap[s]]=true;

  var out={ apiHas:{ duplicate:exists("duplicate"), preCompose:exists("preCompose"), centrePivot:exists("centrePivot"), getSuperTypes:exists("getSuperTypes") },
            classify:{}, superTypes:{}, actions:{}, warnings:[] };

  // --- classify + getSuperTypes against REAL layers (grounds the fallback) ---
  function probe(type){
    var id; try { id = api.create(type, "VC "+type); } catch(e){ return; }
    out.classify[type] = S.classify(id);
    if (exists("getSuperTypes")) { try { out.superTypes[type] = api.getSuperTypes(id); } catch(e){ out.superTypes[type]="ERR:"+e; } }
  }
  ["basicShape","textShape","duplicator","footageShape","random","stagger","falloff","null","group"].forEach(probe);

  // --- run a representative battery of Quick Actions on fresh stubs ---
  var shapeA = api.create("basicShape","VC A"), shapeB = api.create("basicShape","VC B");

  var clone = E.runContextAction("cloneGrid",[shapeA]);
  out.actions.cloneGrid = { ok:clone.ok, type:api.getLayerType(clone.select), wired:drives(shapeA, clone.select) };

  var eff = E.runContextAction("addRandom",[clone.select]);
  out.actions.addRandom = { ok:eff.ok, type:api.getLayerType(eff.select), drivesCloner:drives(eff.select, clone.select) };

  var fld = E.runContextAction("addField",[eff.select]);
  out.actions.addField = { ok:fld.ok, type:api.getLayerType(fld.select), drivesEffector:drives(fld.select, eff.select) };

  var grp = E.runContextAction("group",[shapeA, shapeB]);
  out.actions.group = { type:api.getLayerType(grp.select), parentedA:(api.getParent(shapeA)===grp.select), parentedB:(api.getParent(shapeB)===grp.select) };

  var scat = E.runContextAction("scatter",[api.create("basicShape","VC S")]);
  out.actions.scatter = { type:api.getLayerType(scat.select) };

  var dupTarget = api.create("basicShape","VC Dup");
  var dupBefore = api.getAllSceneLayers().length;
  E.runContextAction("duplicate",[dupTarget]);
  out.actions.duplicate = { layersAdded: api.getAllSceneLayers().length - dupBefore };  // expect >=1

  var rev = E.runContextAction("revealInShape",[]);   // auto-stubs fill-in + mask
  out.actions.revealInShape = { ok:rev.ok, stubbed:rev.stubbed, body:api.getLayerType(rev.select) };

  var pivotTarget = api.create("basicShape","VC Pivot");
  E.runContextAction("centerPivot",[pivotTarget]);
  out.actions.centerPivot = { ran:true };

  out.warnings = E.warnings.slice();

  // --- cleanup everything created this run ---
  var nowL=api.getAllSceneLayers(); var del=0;
  for(var k=0;k<nowL.length;k++){ if(!before[nowL[k]]){ try{ api.deleteLayer(nowL[k]); del++; }catch(e){} } }
  out.cleaned_up=del;

  api.writeToFile("${OUT_FWD}", JSON.stringify(out,null,1), true);
  console.log("VERIFY_OK warnings="+out.warnings.length);
} catch(err){ api.writeToFile("${OUT_FWD}", JSON.stringify({error:String(err&&err.stack||err)}),true); }
`;

const code = modules + "\n" + tail;
const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host: "127.0.0.1", port: 8080, path: "/post", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
  function (res) { res.on("data", function () {}); res.on("end", function () {
    setTimeout(function () { try { console.log(fs.readFileSync(OUT, "utf8")); } catch (e) { console.log("NO_FILE " + e.message); } }, 2500);
  }); }
);
req.setTimeout(12000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
