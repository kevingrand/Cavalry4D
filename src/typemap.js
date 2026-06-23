;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.TypeMap = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var XFORM = { position: "shapePosition", scale: "shapeScale", rotation: "shapeRotation" };

  // Centralized Cavalry attribute strings. Some are best-known; the in-app
  // self-test (Task 12) confirms them live. If wrong, fix here + the test.
  var paths = {
    generatorAttr: "generator",
    // Connect a falloff to a behaviour's "falloffs" LIST input; Cavalry then
    // auto-assigns it to falloffs.0.id (verified live via the Stallion bridge).
    // (Shapes go into a Duplicator by PARENTING, not by a connection.)
    fieldSlot: "falloffs"
  };

  var cloners = {
    grid:   { distribution: "grid",   label: "Grid",
      configure: function (api, id) { api.set(id, { "generator.count.x": 5, "generator.count.y": 5, "generator.size.x": 120, "generator.size.y": 120 }); } },
    radial: { distribution: "circle", label: "Radial",
      configure: function (api, id) { api.set(id, { "generator.count": 12, "generator.radius": 300 }); } },
    linear: { distribution: "linear", label: "Linear",
      configure: function (api, id) { api.set(id, { "generator.count": 10, "generator.offset.x": 120 }); } },
    object: { distribution: "path",   label: "Object", needsTarget: true,
      configure: function (api, id) { api.set(id, { "generator.count": 20 }); } }
  };

  var effectors = {
    // fieldSlot "falloffs": connect a field into the behaviour's falloffs list
    // (random/value/stagger all expose it; a field there attenuates the whole
    // effector spatially). colorArray has no falloffs input -> fieldSlot null.
    random: { layer: "random",     label: "Random Effector", channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: true, scale: false, rotation: true } },
    plain:  { layer: "value",      label: "Plain Effector",  channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: true, scale: false, rotation: false } },
    step:   { layer: "stagger",    label: "Step Effector",   channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: false, scale: false, rotation: true } },
    shader: { layer: "colorArray", label: "Shader Effector", channelAttrs: { color: "material.materialColor" }, fieldSlot: null,
              defaultChannels: { color: true } }
  };

  var fields = {
    linear:    { layer: "falloff", label: "Linear Field",    configure: function (api, id) { api.set(id, { "shapeType": "Linear" }); } },
    spherical: { layer: "falloff", label: "Spherical Field", configure: function (api, id) { api.set(id, { "shapeType": "Circle" }); } },
    box:       { layer: "falloff", label: "Box Field",       configure: function (api, id) { api.set(id, { "shapeType": "Rectangle" }); } },
    random:    { layer: "falloff", label: "Random Field",    configure: function (api, id) { api.set(id, { "shapeType": "Circle", "useProbability": true }); } }
  };

  return { XFORM: XFORM, paths: paths, cloners: cloners, effectors: effectors, fields: fields };
});
