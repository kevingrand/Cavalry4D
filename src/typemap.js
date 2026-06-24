;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.TypeMap = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var XFORM = { position: "shapePosition", scale: "shapeScale", rotation: "shapeRotation" };

  var paths = {
    generatorAttr: "generator",
    // Connect a falloff to a behaviour's "falloffs" LIST input; Cavalry then
    // auto-assigns it to falloffs.0.id (verified live via the Stallion bridge).
    fieldSlot: "falloffs"
  };

  // Distribution generator type names + attribute shapes were verified live via
  // the Stallion bridge. CRITICAL: each distribution is a DIFFERENT generator
  // type with DIFFERENT attribute names — they are NOT modes of one grid.
  //   gridDistribution   : count {x,y} (2D), size {x,y} (2D, per-cell spacing)
  //   circleDistribution : count (scalar), radius (scalar), angle, startAngle
  //   linearDistribution : count (scalar), size (scalar, TOTAL line length), direction
  //   pathDistribution   : count (scalar), generator.inputShape (the path source)
  // All configure(api, id, bb) functions receive the source shape's bounding
  // box as `bb` ({width, height, ...}) or null when unavailable.
  var GAP = 20;
  function itemW(bb) { return (bb && bb.width  > 0) ? Math.ceil(bb.width)  + GAP : 120; }
  function itemH(bb) { return (bb && bb.height > 0) ? Math.ceil(bb.height) + GAP : 120; }

  var cloners = {
    grid: {
      distribution: "gridDistribution",
      label: "Grid",
      configure: function (api, id, bb) {
        api.set(id, {
          "generator.count": { x: 3, y: 3 },
          // distributionMode 1 = "Step": size is the center-to-center gap between
          // points (mode 0 "Fit" treats size as the total extent and overlaps copies).
          "generator.distributionMode": 1,
          "generator.size": { x: itemW(bb), y: itemH(bb) }
        });
      }
    },
    honeycomb: {
      distribution: "gridDistribution",
      label: "Honeycomb",
      configure: function (api, id, bb) {
        api.set(id, {
          "generator.count": { x: 4, y: 4 },
          "generator.distributionMode": 1,
          "generator.size": { x: itemW(bb), y: itemH(bb) },
          // Pattern Offset: shift every other row by half a cell -> brick / hex look.
          "generator.offset": { x: Math.round(itemW(bb) / 2), y: 0 }
        });
      }
    },
    radial: {
      distribution: "circleDistribution",
      label: "Radial",
      configure: function (api, id, bb) {
        var count = 6;
        // ring big enough that items don't overlap: circumference >= count*itemW
        var radius = Math.max(120, Math.round(count * itemW(bb) / (2 * Math.PI)));
        api.set(id, { "generator.count": count, "generator.radius": radius });
      }
    },
    linear: {
      distribution: "linearDistribution",
      label: "Linear",
      configure: function (api, id, bb) {
        var count = 5;
        // 'size' is the TOTAL line length; spacing between items = size/(count-1)
        api.set(id, { "generator.count": count, "generator.size": itemW(bb) * (count - 1) });
      }
    },
    scatter: {
      distribution: "randomDistribution",
      label: "Scatter",
      configure: function (api, id, bb) {
        var iw = itemW(bb), ih = itemH(bb);
        api.set(id, {
          "generator.count": 12,
          "generator.size": { x: Math.max(400, iw * 5), y: Math.max(400, ih * 5) },
          // relax pushes points apart so copies don't overlap
          "generator.relaxMode": true,
          "generator.relaxDistance": Math.round(Math.max(iw, ih) / 2)
        });
      }
    },
    onEdges: {
      distribution: "shapeEdgeDistribution",
      label: "On Edges",
      needsTarget: true,
      pathSlot: "generator.inputShape",   // connect the path/curve shape here
      configure: function (api, id) {
        api.set(id, { "generator.count": 10 });
      }
    },
    object: {
      distribution: "pathDistribution",
      label: "Object",
      needsTarget: true,
      pathSlot: "generator.inputShape",   // connect a path shape's id here
      configure: function (api, id) {
        api.set(id, { "generator.count": 10 });
      }
    }
  };

  // Ordered list for the distribution-switcher dropdown. Honeycomb is omitted —
  // it shares gridDistribution with Grid (it's Grid + a pattern offset), so the
  // switcher can't tell them apart; "Grid" covers both.
  var distributionOrder = ["grid", "radial", "linear", "scatter", "onEdges", "object"];

  // fieldSlot "falloffs": connect a field into the behaviour's falloffs list
  // (random/value/stagger all expose it; a field there attenuates the whole
  // effector spatially). colorArray has no falloffs input -> fieldSlot null.
  //
  // strengthAttr / amountAttr / amountRange power the panel sliders (#2).
  // configure() sets a VISIBLE default on creation so the effect is obvious
  // immediately (raw Cavalry defaults are tiny: random max 10, stagger max 5).
  var effectors = {
    random: { layer: "random", label: "Random Effector", channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: true, scale: false, rotation: true },
              strengthAttr: "strength", amountAttr: "maximum", amountRange: [0, 500],
              configure: function (api, id) { api.set(id, { "maximum": 50 }); } },
    plain:  { layer: "value", label: "Plain Effector", channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: true, scale: false, rotation: false },
              strengthAttr: "strength", amountAttr: "value", amountRange: [-500, 500],
              configure: function (api, id) { api.set(id, { "value": 50 }); } },
    step:   { layer: "stagger", label: "Step Effector", channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: false, scale: false, rotation: true },
              strengthAttr: "strength", amountAttr: "maximum", amountRange: [0, 360],
              configure: function (api, id) { api.set(id, { "maximum": 45 }); } },
    // Noise: organic per-copy wobble. amount maps to generator.maximum (range);
    // configure sets a symmetric visible default (raw default is only ±10).
    noise:  { layer: "noise", label: "Noise Effector", channelAttrs: XFORM, fieldSlot: paths.fieldSlot,
              defaultChannels: { position: true, scale: false, rotation: true },
              strengthAttr: "strength", amountAttr: "generator.maximum", amountRange: [0, 500],
              configure: function (api, id) { api.set(id, { "generator.minimum": -50, "generator.maximum": 50 }); } },
    // Target: every copy rotates toward a target layer (auto-created null). Only
    // drives rotation. needsTarget makes addEffector create + wire the target.
    target: { layer: "lookAt", label: "Target Effector", channelAttrs: { rotation: "shapeRotation" }, fieldSlot: paths.fieldSlot,
              defaultChannels: { rotation: true },
              strengthAttr: "strength", amountAttr: null, amountRange: null,
              needsTarget: true, targetSlot: "target", targetLayer: "null", targetName: "Target" },
    shader: { layer: "colorArray", label: "Shader Effector", channelAttrs: { color: "material.materialColor" }, fieldSlot: null,
              defaultChannels: { color: true },
              strengthAttr: null, amountAttr: null, amountRange: null }
  };

  // One-click recipes (#4). Each composes a cloner + effector (+ optional field)
  // that artists recognise from C4D. Applied to the current selection.
  var presets = [
    { key: "scatter", label: "Scatter", cloner: "grid",   effector: "random", channels: { position: true, rotation: true, scale: false }, field: null },
    { key: "cascade", label: "Cascade", cloner: "linear", effector: "step",   channels: { position: false, rotation: true, scale: false }, field: null },
    { key: "pulse",   label: "Pulse",   cloner: "radial", effector: "plain",  channels: { position: true, rotation: false, scale: false }, field: "spherical" }
  ];

  // Text Presets: build a text effect from the current selection, but unlike the
  // cloner recipes these declare their PREREQUISITES so the panel can show a live
  // requirements checklist and auto-stub what's missing.
  //   check  — a predicate name the Engine resolves against a selected layer
  //            ("textShape", "shape"). Narrower checks win when both could match.
  //   stub   — names an Engine placeholder builder for an absent (but fabricatable)
  //            requirement. A requirement with no stub is hard-required (the panel
  //            gates the build and shows `missing`).
  // The reveal mechanism (subMesh + isWithin + valueArray opacity mask) was
  // verified live via the Stallion bridge before being encoded in the Engine.
  // assign:"stack" — when 2+ layers are selected the role is decided by LAYER-STACK
  // ORDER (deterministic & visible), not by type: requirement[0] = topmost layer,
  // requirement[1] = the one below it, etc. So: top = fill-in, bottom = mask. With
  // only ONE layer selected it falls back to the type checks below (a lone shape is
  // a mask, a lone text is a fill-in). The panel renders the requirement labels as a
  // live checklist so the chosen roles are always shown.
  var textPresets = [
    { key: "revealInShape", label: "Reveal Text in Shape", kind: "revealInShape", assign: "stack",
      hint: "Roles follow the layer stack: TOP layer = fill-in (your text), the layer BELOW it = mask (e.g. a big letter). Select both (top = fill-in, bottom = mask), or select one and the other is auto-created.",
      requires: [
        { id: "fillIn", label: "Fill-in (top layer)", check: "textShape", stub: "loremText",
          missing: "Put a text layer (or any shape) on top as the fill-in." },
        { id: "mask",   label: "Mask (bottom layer)", check: "shape",     stub: "maskGlyph",
          missing: "Put a shape or letter below as the mask." }
      ] },
    // Like reveal, but the fill is REPEATED in a grid duplicator sized to the mask
    // and clipped to it — so sparse content (a few stars/squares) still fills the
    // shape. multi:true on `fills` collects every layer above the bottom mask.
    { key: "fillRepeat", label: "Fill-in & Repeat", kind: "fillRepeat", assign: "stack",
      hint: "Bottom layer = mask; EVERY layer above it = shapes duplicated in a grid to fill the mask, clipped to its outline. Put your fill shapes on top, the mask on the bottom.",
      requires: [
        { id: "fills", label: "Fill shapes (top layers)", check: "shape", stub: "defaultCells", multi: true,
          missing: "Put one or more shapes on top to repeat." },
        { id: "mask",  label: "Mask (bottom layer)",      check: "shape", stub: "maskGlyph",
          missing: "Put a shape or letter on the bottom as the mask." }
      ] }
  ];

  // Highlight Words (Add-on): recolor — and optionally bold — specific words in a
  // text shape via native, fully-editable text behaviours. Verified live via the
  // Stallion bridge (tools/probe_highlight.js):
  //   applyTextMaterial: regex "(word)" CAPTURE GROUP, mode 0, indexMode 2, and
  //     material.materialColor ACCEPTS A HEX STRING ("#EA4336" -> stored ARGB).
  //   applyTypeface:     regex "(word)", font {font,style} (default Lato/Bold);
  //     same mode/indexMode matching semantics.
  // Each behaviour's id connects to the text's LIST input — materialBehaviours
  // (colour) or styleBehaviours (typeface) — which Cavalry auto-indexes (.0/.1...).
  // matchMode 0 + captureGroup 2 = "match the regex capture group" (so "(red)"
  // colours just the word "red"). The panel renders maxRows word+colour rows;
  // defaultRows are pre-filled (and present in the auto-stub sample text) so a
  // first click immediately shows a working result to customise.
  var highlights = {
    maxRows: 5,
    materialLayer: "applyTextMaterial",
    typefaceLayer: "applyTypeface",
    colorAttr: "material.materialColor",
    materialSlot: "materialBehaviours",
    styleSlot: "styleBehaviours",
    matchMode: 0,        // mode 0 = Regex
    captureGroup: 2,     // indexMode 2 = Capture Group
    boldStyle: "Bold",   // applied with the body text's own font family
    defaultRows: [
      { word: "red",  color: "#EA4336" },
      { word: "blue", color: "#4285F4" }
    ],
    // colours seeded into rows the user reveals with "Add Highlight" (word blank)
    seedColors: ["#EA4336", "#4285F4", "#34A853", "#FBBC05", "#9C27B0"],
    // sample text built when nothing is selected — contains the default words so
    // the highlight is visible immediately.
    sampleText: "Make the red word and the blue word stand out."
  };

  // Grid FX: presets that build a grid (duplicator) effect from the selection,
  // using the SAME declarative requires/checklist/stub machinery as textPresets
  // (assign:"stack", check/stub per role). Distilled from the "BLOXEL" template.
  //
  // Shape Swap Grid: a base shape tiled in a grid everywhere, plus a second shape
  // tiled in the SAME grid but CLIPPED to a mask region (mask -> duplicator.masks,
  // the verified Fill-Repeat alpha clip) and drawn on top. Inside the region you
  // see the region shape; outside, the base shape. Move/animate the mask to move
  // the region. (The template drove a per-copy shapeId swap through ~10 helper
  // nodes computing each copy's position; the two-grid mask-clip gets the same
  // look from VERIFIED primitives and is reorder/clip-correct — confirmed by
  // isolated-comp render before encoding.)
  var gridPresets = [
    { key: "shapeSwap", label: "Shape Swap Grid", kind: "shapeSwap", assign: "stack",
      hint: "Roles follow the layer stack: TOP = region shape (shown inside the mask), MIDDLE = base shape (tiled everywhere), BOTTOM = mask (the region). Select all three, or fewer and the rest are auto-created.",
      requires: [
        { id: "regionShape", label: "Region shape (top)", check: "shape", stub: "swapCell",
          missing: "Put the shape to show inside the region on top." },
        { id: "baseShape",   label: "Base shape (middle)", check: "shape", stub: "baseDot",
          missing: "Put the shape tiled everywhere in the middle." },
        { id: "mask",        label: "Mask region (bottom)", check: "shape", stub: "regionMask",
          missing: "Put a shape as the region on the bottom." }
      ] }
  ];

  // Smart Rigs: build a tedious native-Cavalry setup from the current selection,
  // branching on what kinds of layers are selected. The build logic lives in the
  // Engine (it's imperative); this registry is the metadata for the panel.
  var rigs = [
    { key: "imageSize",    label: "Image → Size",    kind: "image", mode: "size",
      hint: "Select an image (footage in the scene) and a shape. Builds a grid sized by image brightness." },
    { key: "imageDensity", label: "Image → Density", kind: "image", mode: "density",
      hint: "Select an image and a shape. Builds a scatter where image brightness controls clone placement." }
  ];

  // shapeType is an ENUM INT (verified live): Circle=0, Rectangle=1, Linear=2,
  // Sweep=3, Shape=4. Setting it to a STRING silently leaves it at 0 — that was
  // a real bug where every field rendered as Circle.
  var SHAPE = { circle: 0, rectangle: 1, linear: 2, sweep: 3, shape: 4 };
  var fields = {
    linear:    { layer: "falloff", label: "Linear Field",    configure: function (api, id) { api.set(id, { "shapeType": SHAPE.linear }); } },
    spherical: { layer: "falloff", label: "Spherical Field", configure: function (api, id) { api.set(id, { "shapeType": SHAPE.circle }); } },
    box:       { layer: "falloff", label: "Box Field",       configure: function (api, id) { api.set(id, { "shapeType": SHAPE.rectangle }); } },
    random:    { layer: "falloff", label: "Random Field",    configure: function (api, id) { api.set(id, { "shapeType": SHAPE.circle, "useProbability": true }); } }
  };

  return { XFORM: XFORM, paths: paths, cloners: cloners, distributionOrder: distributionOrder, effectors: effectors, presets: presets, textPresets: textPresets, gridPresets: gridPresets, highlights: highlights, rigs: rigs, fields: fields };
});
