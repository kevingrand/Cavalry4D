// dump_layer_types.js — enumerate EVERY layer type the running Cavalry knows,
// with the facts Selection.classify() cares about: getSuperTypes(), isShape()
// and isProLayerType(). This is the authoritative source for expanding
// typemap.contextActions.byCategory beyond the types we already handle.
//
// Each type is probed by creating ONE instance inside a throwaway temp comp,
// reading its facts, then deleting the whole comp (so nothing is left behind in
// your scene). Uncreatable types are recorded with their error and skipped.
//
// Prereq: Cavalry open with the Stallion bridge listening on 127.0.0.1:8080.
// Usage: node tools/dump_layer_types.js  -> prints + writes tools/layer_types.json
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "layer_types.json");
const OUT_FWD = OUT.replace(/\\/g, "/");
try { fs.unlinkSync(OUT); } catch (e) {}

const code = `
try {
  function has(n){ return typeof api[n]==="function"; }
  function safe(fn){ try { return fn(); } catch(e){ return "ERR:"+(e&&e.message||e); } }

  var types = has("getAllLayerTypes") ? api.getAllLayerTypes(true) : [];
  // normalise to a plain array of strings
  var list = [];
  if (Object.prototype.toString.call(types)==="[object Array]") list = types.slice();
  else if (types && typeof types==="object") { for (var k in types) if (types.hasOwnProperty(k)) list.push(types[k]); }

  var orig = api.getActiveComp();
  var temp = api.createComp("__layerTypeProbe");
  api.setActiveComp(temp);

  var out = { total: list.length, types: [] };
  for (var i=0;i<list.length;i++){
    var t = list[i];
    var rec = { type: t, isPro: has("isProLayerType") ? safe(function(){return api.isProLayerType(t);}) : null };
    var id = null;
    try { id = api.create(t, "probe"); } catch(e){ rec.createError = String(e&&e.message||e); }
    if (id) {
      rec.superTypes = has("getSuperTypes") ? safe(function(){return api.getSuperTypes(id);}) : null;
      rec.isShape    = has("isShape")       ? safe(function(){return api.isShape(id);})       : null;
      rec.isTransform= has("isTransform")   ? safe(function(){return api.isTransform(id);})   : null;
    }
    out.types.push(rec);
  }

  // tear down the temp comp (removes every probe layer at once)
  api.setActiveComp(orig);
  api.deleteLayer(temp);

  api.writeToFile("${OUT_FWD}", JSON.stringify(out,null,1), true);
  console.log("DUMP_OK types="+out.total);
} catch(err){ api.writeToFile("${OUT_FWD}", JSON.stringify({error:String(err&&err.stack||err)}),true); }
`;

const body = JSON.stringify({ type: "script", code: code });
const req = http.request(
  { host: "127.0.0.1", port: 8080, path: "/post", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
  function (res) { res.on("data", function () {}); res.on("end", function () {
    setTimeout(function () {
      try {
        var txt = fs.readFileSync(OUT, "utf8");
        var data = JSON.parse(txt);
        if (data.types) {
          console.log("total types: " + data.total);
          // quick category preview from superTypes
          var buckets = {};
          data.types.forEach(function (r) {
            var key = (r.superTypes && r.superTypes.length) ? r.superTypes.join("/") : (r.createError ? "(uncreatable)" : "(none)");
            (buckets[key] = buckets[key] || []).push(r.type);
          });
          Object.keys(buckets).sort().forEach(function (k) { console.log("\\n[" + k + "] (" + buckets[k].length + ")\\n  " + buckets[k].join(", ")); });
        } else { console.log(txt); }
      } catch (e) { console.log("NO_FILE " + e.message); }
    }, 4000);
  }); }
);
req.setTimeout(30000, function () { req.destroy(); });
req.on("error", function (e) { console.log("ERR " + e.code); });
req.write(body); req.end();
