// render_real.js — render the user's ACTUAL open comp at the current frame, so I
// finally see the ground-truth effect (non-destructive: changes nothing).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const PNG = path.join(__dirname, "real_full.png").replace(/\\/g, "/");
const JSON_OUT = path.join(__dirname, "real_full.json").replace(/\\/g, "/");

const code = `
try {
  var frame = api.getFrame();
  var comp = api.getActiveComp();
  api.renderPNGFrame("${PNG}", 50);
  api.writeToFile("${JSON_OUT}", JSON.stringify({ok:true, frame:frame, comp:comp}, null, 2), true);
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
        console.log("PNG:", fs.existsSync(PNG.replace(/\//g,"\\"))); }
      catch(e){ console.log("NO_FILE:", e.message); }
    }, 5000);
  }); }
);
req.setTimeout(30000, function(){ req.destroy(); });
req.on("error", function(e){ console.log("ERR "+e.code); });
req.write(body); req.end();
