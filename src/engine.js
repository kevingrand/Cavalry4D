;(function (root, factory) {
  var mod = factory(root);
  root.MG = root.MG || {};
  root.MG.Engine = mod;
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  if (typeof require !== "undefined") { try { require("./typemap"); } catch (e) {} }

  function TM() { return root.MG.TypeMap; }
  // Cavalry's getInConnection/getOutConnections return "layer.attr" (e.g.
  // "random#1.id", "duplicator#2.shapeScale"); reduce to the layer id.
  function layerOf(s) { return s ? String(s).split(".")[0] : ""; }
  var counters = {};

  var Engine = {
    warnings: [],
    resetWarnings: function () { Engine.warnings = []; },

    _nextName: function (base) {
      counters[base] = (counters[base] || 0) + 1;
      return base + " " + counters[base];
    },

    _create: function (type, niceName) {
      var id = api.create(type, niceName || type);
      if (niceName) api.rename(id, niceName);
      return id;
    },

    // connect then verify from the SOURCE side via getOutConnections — robust to
    // list / auto-indexed target slots (e.g. "falloffs") that getInConnection on
    // the named target doesn't report. Warn on silent failure.
    // force=true overwrites an existing single-input connection. Duplicator
    // per-copy attrs (shapePosition/Rotation/Scale) reject a second input
    // otherwise, so effectors must force to claim a channel (last-wins).
    _wire: function (fromId, fromAttr, toId, toAttr, force) {
      api.connect(fromId, fromAttr, toId, toAttr, !!force);
      var outs = api.getOutConnections(fromId, fromAttr);
      for (var i = 0; i < outs.length; i++) if (layerOf(outs[i]) === toId) return true;
      Engine.warnings.push("wire failed: " + fromId + "." + fromAttr + " -> " + toId + "." + toAttr);
      return false;
    },

    createCloner: function (mode, selectionIds) {
      var spec = TM().cloners[mode];
      if (!spec) throw new Error("unknown cloner mode: " + mode);

      // Name the cloner after the first source object (e.g. "Cloner-Circle 1").
      var sourceName = (selectionIds && selectionIds.length > 0) ? api.getNiceName(selectionIds[0]) : null;
      var baseName = sourceName ? ("Cloner-" + sourceName) : "Cloner";
      var clonerId = Engine._create("duplicator", Engine._nextName(baseName));

      api.setGenerator(clonerId, TM().paths.generatorAttr, spec.distribution);

      if (selectionIds) {
        for (var i = 0; i < selectionIds.length; i++) {
          Engine._wire(selectionIds[i], "id", clonerId, "shapes");
        }
      }

      // Smart defaults: measure the source shape's bounding box and pass it to
      // configure so spacing adapts to the actual object size.
      var bb = null;
      if (selectionIds && selectionIds.length > 0 && typeof api.getBoundingBox === "function") {
        try { bb = api.getBoundingBox(selectionIds[0], false); } catch (e) {}
      }
      if (spec.configure) spec.configure(api, clonerId, bb);

      return { clonerId: clonerId };
    },

    // Compose a recognisable C4D recipe (cloner + effector [+ field]) in one
    // click. Returns all created ids so the panel can select the cloner.
    applyPreset: function (key, selectionIds) {
      var ps = TM().presets, p = null;
      for (var i = 0; i < ps.length; i++) if (ps[i].key === key) p = ps[i];
      if (!p) throw new Error("unknown preset: " + key);
      var clonerId = Engine.createCloner(p.cloner, selectionIds).clonerId;
      var effectorId = Engine.addEffector(p.effector, clonerId, p.channels).effectorId;
      var fieldId = null;
      if (p.field) fieldId = Engine.addField(p.field, effectorId, clonerId).fieldId;
      return { clonerId: clonerId, effectorId: effectorId, fieldId: fieldId };
    },

    // ---- Smart Rigs -----------------------------------------------------
    // A rig inspects the selection by layer type and builds a native multi-node
    // setup. buildRig dispatches to a per-kind builder.

    _isImageLayer: function (id) {
      var t = api.getLayerType(id);
      return t === "footageShape" || t === "imageToShapes";
    },
    _isCloneTarget: function (id) {
      if (Engine._isImageLayer(id)) return false;
      var t = api.getLayerType(id);
      // exclude cloners/effectors/fields/samplers — only real source shapes
      var exclude = { duplicator: 1, falloff: 1, random: 1, value: 1, stagger: 1,
                      colorArray: 1, noise: 1, lookAt: 1, materialSampler: 1, imageSampler: 1 };
      if (exclude[t]) return false;
      return (typeof api.isShape === "function") ? api.isShape(id) : true;
    },

    buildRig: function (key, selectionIds) {
      var spec = null, rigs = TM().rigs;
      for (var i = 0; i < rigs.length; i++) if (rigs[i].key === key) spec = rigs[i];
      if (!spec) throw new Error("unknown rig: " + key);
      if (spec.kind === "image") return Engine._buildImageCloner(spec.mode, selectionIds);
      throw new Error("rig kind not implemented: " + spec.kind);
    },

    // Image-driven cloner. mode "size" -> grid, image brightness drives shapeScale.
    // mode "density" -> scatter, image brightness drives placement probability.
    // If a footageShape is selected it's wired through a Material Sampler; with no
    // image selected an (empty) Image Sampler is created for the user to assign.
    _buildImageCloner: function (mode, selectionIds) {
      selectionIds = selectionIds || [];
      var imageSrc = null, cloneShape = null;
      for (var i = 0; i < selectionIds.length; i++) {
        var id = selectionIds[i];
        if (!imageSrc && Engine._isImageLayer(id)) imageSrc = id;
        else if (!cloneShape && Engine._isCloneTarget(id)) cloneShape = id;
      }
      // default cell shape if the user didn't select one to clone
      if (!cloneShape) {
        cloneShape = Engine._create("basicShape", Engine._nextName("Image Cell"));
        api.setGenerator(cloneShape, "generator", mode === "density" ? "ellipse" : "rectangle");
      }

      var clonerId = Engine.createCloner(mode === "density" ? "scatter" : "grid", [cloneShape]).clonerId;
      // an image needs many cells/points to read — bump the defaults
      if (mode === "density") api.set(clonerId, { "generator.count": 200 });
      else api.set(clonerId, { "generator.count": { x: 20, y: 20 } });

      var samplerId, imageUsed = false;
      if (imageSrc) {
        // Material Sampler reads a footage shape already in the scene.
        samplerId = Engine._create("materialSampler", Engine._nextName("Image Sampler"));
        Engine._wire(imageSrc, "id", samplerId, "inputShape");
        imageUsed = true;
      } else {
        // Image Sampler: user drops their image asset into its 'image' slot.
        samplerId = Engine._create("imageSampler", Engine._nextName("Image Sampler"));
      }

      if (mode === "density") {
        Engine._wire(samplerId, "id", clonerId, "generator.probability", true);
        api.set(clonerId, { "generator.useProbability": true });
      } else {
        Engine._wire(samplerId, "id", clonerId, "shapeScale", true);
      }

      return { clonerId: clonerId, samplerId: samplerId, shapeId: cloneShape, imageUsed: imageUsed };
    },

    _channelTargets: function (type, channels) {
      var spec = TM().effectors[type];
      var use = channels || spec.defaultChannels;
      var targets = [];
      for (var name in spec.channelAttrs) {
        if (spec.channelAttrs.hasOwnProperty(name) && use[name]) targets.push(spec.channelAttrs[name]);
      }
      return targets;
    },

    addEffector: function (type, clonerId, channels) {
      var spec = TM().effectors[type];
      if (!spec) throw new Error("unknown effector type: " + type);
      var effectorId = Engine._create(spec.layer, Engine._nextName(spec.label));
      // Visible default magnitude (e.g. random maximum 50, stagger maximum 45)
      // so the effect is obvious the moment it's added.
      if (spec.configure) spec.configure(api, effectorId);
      var targets = Engine._channelTargets(type, channels);
      // force=true so a new effector claims its channels even if another effector
      // already drives them (Cavalry attrs are single-input; last-wins per channel).
      for (var i = 0; i < targets.length; i++) Engine._wire(effectorId, "id", clonerId, targets[i], true);
      var extraIds = [];
      // Some effectors (Target/lookAt) need a target layer; auto-create a null
      // offset from origin and wire it in so the effect works immediately.
      if (spec.needsTarget) {
        var tgt = Engine._create(spec.targetLayer, Engine._nextName(spec.targetName));
        api.set(tgt, { "position.x": 200, "position.y": 0 });
        Engine._wire(tgt, "id", effectorId, spec.targetSlot);
        extraIds.push(tgt);
      }
      return { effectorId: effectorId, extraIds: extraIds };
    },

    // ---- Field controls -------------------------------------------------
    setFieldStrength: function (fieldId, value) {
      if (api.getLayerType(fieldId) !== "falloff") { Engine.warnings.push("setFieldStrength: " + fieldId + " is not a field"); return false; }
      api.set(fieldId, { "strength": value });
      return true;
    },
    setFieldProbability: function (fieldId, on) {
      if (api.getLayerType(fieldId) !== "falloff") { Engine.warnings.push("setFieldProbability: " + fieldId + " is not a field"); return false; }
      api.set(fieldId, { "useProbability": !!on });
      return true;
    },

    // ---- Distribution helpers -------------------------------------------

    // Find the first Input Shape feeding a cloner (its "shapes" list).
    _clonerSourceShape: function (clonerId) {
      var inAttrs = api.getInConnectedAttributes(clonerId);
      for (var i = 0; i < inAttrs.length; i++) {
        if (inAttrs[i].indexOf("shapes") === 0) {
          var src = layerOf(api.getInConnection(clonerId, inAttrs[i]));
          if (src) return src;
        }
      }
      return null;
    },

    _clonerSourceBB: function (clonerId) {
      var src = Engine._clonerSourceShape(clonerId);
      if (src && typeof api.getBoundingBox === "function") {
        try { return api.getBoundingBox(src, false); } catch (e) {}
      }
      return null;
    },

    // Swap an existing cloner's distribution, preserving its Input Shapes and
    // effectors (those connect to the duplicator's per-copy attrs, not the
    // generator). Re-applies smart spacing from the source bounding box.
    switchDistribution: function (clonerId, mode) {
      var spec = TM().cloners[mode];
      if (!spec) throw new Error("unknown cloner mode: " + mode);
      api.setGenerator(clonerId, TM().paths.generatorAttr, spec.distribution);
      var bb = Engine._clonerSourceBB(clonerId);
      if (spec.configure) spec.configure(api, clonerId, bb);
      return { clonerId: clonerId, mode: mode };
    },

    // Connect a path shape as the source of a path-distribution (Object) cloner.
    setPathShape: function (clonerId, pathShapeId) {
      if (!pathShapeId) { Engine.warnings.push("setPathShape: no path shape given"); return { ok: false }; }
      var ok = Engine._wire(pathShapeId, "id", clonerId, "generator.inputShape");
      return { ok: ok };
    },

    // ---- Effector controls ----------------------------------------------

    _muted: {},   // effectorId -> previous strength (for mute/unmute)

    setEffectorStrength: function (effectorId, value) {
      var type = Engine._effectorTypeOf(api.getLayerType(effectorId));
      var attr = type ? TM().effectors[type].strengthAttr : null;
      if (!attr) { Engine.warnings.push("setEffectorStrength: " + effectorId + " has no strength control"); return false; }
      var o = {}; o[attr] = value; api.set(effectorId, o);
      return true;
    },

    setEffectorAmount: function (effectorId, value) {
      var type = Engine._effectorTypeOf(api.getLayerType(effectorId));
      var attr = type ? TM().effectors[type].amountAttr : null;
      if (!attr) { Engine.warnings.push("setEffectorAmount: " + effectorId + " has no amount control"); return false; }
      var o = {}; o[attr] = value; api.set(effectorId, o);
      return true;
    },

    // Mute = drive strength to 0 (non-destructive, reversible); keeps all wiring.
    setEffectorMuted: function (effectorId, muted) {
      var type = Engine._effectorTypeOf(api.getLayerType(effectorId));
      var attr = type ? TM().effectors[type].strengthAttr : null;
      if (!attr) { Engine.warnings.push("setEffectorMuted: " + effectorId + " has no strength control"); return false; }
      if (muted) {
        if (!(effectorId in Engine._muted)) Engine._muted[effectorId] = api.get(effectorId, attr);
        var z = {}; z[attr] = 0; api.set(effectorId, z);
      } else {
        var prev = (effectorId in Engine._muted) ? Engine._muted[effectorId] : 100;
        var r = {}; r[attr] = prev; api.set(effectorId, r);
        delete Engine._muted[effectorId];
      }
      return true;
    },

    isEffectorMuted: function (effectorId) {
      return (effectorId in Engine._muted);
    },

    _effectorTypeOf: function (layerType) {
      var fx = TM().effectors;
      for (var t in fx) if (fx.hasOwnProperty(t) && fx[t].layer === layerType) return t;
      return null;
    },

    setEffectorChannels: function (effectorId, clonerId, channels) {
      var type = Engine._effectorTypeOf(api.getLayerType(effectorId));
      if (!type) { Engine.warnings.push("setEffectorChannels: unknown effector " + effectorId); return; }
      var attrs = TM().effectors[type].channelAttrs;
      for (var name in attrs) {
        if (!attrs.hasOwnProperty(name)) continue;
        var target = attrs[name];
        if (channels[name]) Engine._wire(effectorId, "id", clonerId, target, true);
        else api.disconnectInput(clonerId, target);
      }
    },

    // A field attaches to the effector's "falloffs" list (verified live: random,
    // value and stagger all expose it, and a field there attenuates the whole
    // effector spatially). Effectors with no falloffs input (Shader/colorArray)
    // have fieldSlot null -> field is refused with a warning, no orphan left.
    // clonerId is accepted for signature stability but unused.
    addField: function (fieldType, effectorId, clonerId) {
      var fSpec = TM().fields[fieldType];
      if (!fSpec) throw new Error("unknown field type: " + fieldType);
      var fieldId = Engine._create(fSpec.layer, Engine._nextName(fSpec.label));
      if (fSpec.configure) fSpec.configure(api, fieldId);

      var eType = Engine._effectorTypeOf(api.getLayerType(effectorId));
      var slot = eType ? TM().effectors[eType].fieldSlot : null;
      if (!slot) {
        Engine.warnings.push("addField: " + (eType ? "'" + eType + "' effector does not support a Field" : "unknown effector " + effectorId) + "; field not added");
        api.deleteLayer(fieldId);
        return { fieldId: null, extraIds: [] };
      }
      Engine._wire(fieldId, "id", effectorId, slot);
      return { fieldId: fieldId, extraIds: [] };
    },

    // ---- Text Presets: prerequisites + the Reveal-In-Shape recipe ---------

    // A layer usable as a reveal mask: a text glyph or any real shape. Exclude
    // generators/effectors/fields and the reveal rig's own utility nodes.
    _isMaskShape: function (id) {
      var t = api.getLayerType(id);
      var exclude = { duplicator: 1, falloff: 1, random: 1, value: 1, stagger: 1, colorArray: 1,
                      noise: 1, lookAt: 1, materialSampler: 1, imageSampler: 1,
                      subMesh: 1, isWithin: 1, valueArray: 1 };
      if (exclude[t]) return false;
      if (t === "textShape") return true;
      return (typeof api.isShape === "function") ? api.isShape(id) : true;
    },

    // Requirement check vocabulary. Higher spec = narrower; assigned first so a
    // textShape is claimed by "textShape" before the broad "shape" can grab it.
    _checkSpec: function (name) { return name === "textShape" ? 2 : 1; },
    _passesCheck: function (name, id) {
      if (name === "textShape") return api.getLayerType(id) === "textShape";
      if (name === "shape") return Engine._isMaskShape(id);
      return false;
    },

    // Order layer ids top-to-bottom by their position in the comp's layer stack
    // (verified live: getCompLayers index 0 is the TOP). Unknown layers sort last,
    // keeping their given order.
    _stackRank: function () {
      var stack = [];
      try { stack = api.getCompLayers(false) || []; } catch (e) {}
      if (!stack.length) { try { stack = api.getAllSceneLayers() || []; } catch (e) {} }
      var rank = {};
      for (var i = 0; i < stack.length; i++) if (!(stack[i] in rank)) rank[stack[i]] = i;
      return rank;
    },
    _byStackOrder: function (ids) {
      ids = (ids || []).slice();
      var rank = Engine._stackRank(), dec = [];
      for (var i = 0; i < ids.length; i++) dec.push({ id: ids[i], r: (ids[i] in rank) ? rank[ids[i]] : (100000 + i), i: i });
      dec.sort(function (a, b) { return (a.r - b.r) || (a.i - b.i); });
      var out = []; for (var j = 0; j < dec.length; j++) out.push(dec[j].id);
      return out;
    },

    // Stack-order assignment, bottom-up: the last single requirement = bottommost
    // layer, working upward; a `multi` requirement absorbs all remaining (top)
    // layers as an array. So [fillIn, mask] -> mask=bottom, fillIn=above it; and
    // [fills(multi), mask] -> mask=bottom, fills=everything above.
    _validateByStack: function (spec, selectionIds) {
      var reqs = (spec && spec.requires) || [];
      var pool = Engine._byStackOrder(selectionIds);   // top -> bottom
      var assigned = {};
      for (var i = reqs.length - 1; i >= 0; i--) {
        var req = reqs[i];
        if (req.multi) {
          var rest = pool; pool = [];
          assigned[req.id] = rest.length ? { status: "ok", layerIds: rest }
                                         : { status: req.stub ? "stub" : "missing", layerIds: [] };
        } else if (pool.length) {
          assigned[req.id] = { status: "ok", layerId: pool.pop() };   // bottommost remaining
        } else {
          assigned[req.id] = { status: req.stub ? "stub" : "missing", layerId: null };
        }
      }
      var out = [];
      for (var j = 0; j < reqs.length; j++) {
        var a = assigned[reqs[j].id], rec = { id: reqs[j].id, label: reqs[j].label, status: a.status };
        if ("layerIds" in a) rec.layerIds = a.layerIds; else rec.layerId = a.layerId;
        out.push(rec);
      }
      return out;
    },

    // Pure (no scene mutation): resolve each requirement of a preset spec against
    // the current selection. Returns [{ id, label, status, layerId }] in the spec's
    // declaration order. status: "ok" (a selected layer matches), "stub" (absent but
    // fabricatable), "missing" (absent and hard-required).
    //
    // assign:"stack" presets use layer-stack order once enough layers are selected
    // to fill every role; with fewer selected they fall back to the type checks
    // (so a lone shape is a mask, a lone text is a fill-in).
    validateRequires: function (spec, selectionIds) {
      selectionIds = (selectionIds || []).slice();
      var reqs = (spec && spec.requires) || [];
      var hasMulti = false;
      for (var m = 0; m < reqs.length; m++) if (reqs[m].multi) hasMulti = true;
      // Stack assignment: presets with a multi role always use it; others switch to
      // it once enough layers are selected to fill every role (otherwise the type
      // checks below decide a lone selection: a shape is a mask, a text a fill-in).
      if (spec && spec.assign === "stack" && reqs.length > 0 && (hasMulti || selectionIds.length >= reqs.length)) {
        return Engine._validateByStack(spec, selectionIds);
      }
      // Assign narrower checks first so the broad "shape" doesn't consume a textShape.
      var order = reqs.slice().sort(function (a, b) { return Engine._checkSpec(b.check) - Engine._checkSpec(a.check); });
      var consumed = {}, assigned = {};
      for (var i = 0; i < order.length; i++) {
        var req = order[i], match = null;
        for (var s = 0; s < selectionIds.length; s++) {
          var sid = selectionIds[s];
          if (consumed[sid]) continue;
          if (Engine._passesCheck(req.check, sid)) { match = sid; break; }
        }
        if (match) { consumed[match] = true; assigned[req.id] = { status: "ok", layerId: match }; }
        else assigned[req.id] = { status: req.stub ? "stub" : "missing", layerId: null };
      }
      var out = [];
      for (var r = 0; r < reqs.length; r++) {
        var a = assigned[reqs[r].id];
        out.push({ id: reqs[r].id, label: reqs[r].label, status: a.status, layerId: a.layerId });
      }
      return out;
    },

    _findRequire: function (spec, id) {
      var reqs = (spec && spec.requires) || [];
      for (var i = 0; i < reqs.length; i++) if (reqs[i].id === id) return reqs[i];
      return null;
    },

    // Resolve requirements to concrete layer ids, creating placeholder layers for
    // any absent-but-stubbable requirement. Returns the chosen layer per requirement,
    // a stubbed flag per requirement, and the ids of any hard-required missing ones.
    resolveRequires: function (spec, selectionIds) {
      var status = Engine.validateRequires(spec, selectionIds);
      var values = {}, stubbed = {}, missing = [];
      for (var i = 0; i < status.length; i++) {
        var st = status[i], req = Engine._findRequire(spec, st.id);
        if (st.status === "ok") {
          values[st.id] = (req && req.multi) ? st.layerIds : st.layerId;
          stubbed[st.id] = false;
        } else if (st.status === "stub") {
          values[st.id] = Engine._stub(req.stub);   // multi stubs (e.g. defaultCells) return an array
          stubbed[st.id] = true;
        } else missing.push(st.id);
      }
      return { values: values, stubbed: stubbed, missing: missing };
    },

    _LOREM: "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur",

    // Placeholder builders for absent requirements. The mask defaults to a big
    // glyph; the body to a paragraph of lorem ipsum the user replaces in place.
    _stub: function (name) {
      if (name === "loremText") {
        var b = Engine._create("textShape", Engine._nextName("Reveal Body Text"));
        // Repeat so there's enough copy to fill a large mask (short text can't fill
        // a big shape — that's inherent, but the stub should be generous).
        api.set(b, { "text": Engine._LOREM + " " + Engine._LOREM + " " + Engine._LOREM + " " + Engine._LOREM, "fontSize": 40 });
        return b;
      }
      if (name === "maskGlyph") {
        var m = Engine._create("textShape", Engine._nextName("Reveal Mask Shape"));
        api.set(m, { "text": "A", "fontSize": 1000 });
        return m;
      }
      if (name === "defaultCells") {
        // A few small coloured shapes to repeat. Generator names MUST carry the
        // "Shape" suffix — "ellipse" silently falls back to a polygon (verified).
        var defs = [
          { gen: "ellipseShape", color: "#E5443B" },
          { gen: "rectangleShape", color: "#34A853" },
          { gen: "starShape", color: "#4285F4" }
        ];
        var cells = [];
        for (var i = 0; i < defs.length; i++) {
          var c = Engine._create("basicShape", Engine._nextName("Fill Cell"));
          api.setGenerator(c, "generator", defs[i].gen);
          api.set(c, { "generator.radius": { x: 16, y: 16 }, "material.materialColor": defs[i].color });
          cells.push(c);
        }
        return cells;
      }
      throw new Error("unknown stub: " + name);
    },

    // Dispatch a text preset: resolve prerequisites (auto-stubbing), gate on any
    // hard-missing requirement, then build. Returns { ok:false, missing:[...] } if
    // a non-stubbable requirement is absent so the panel can prompt for it.
    buildTextPreset: function (key, selectionIds) {
      var spec = null, ps = TM().textPresets;
      for (var i = 0; i < ps.length; i++) if (ps[i].key === key) spec = ps[i];
      if (!spec) throw new Error("unknown text preset: " + key);
      var res = Engine.resolveRequires(spec, selectionIds);
      if (res.missing.length) return { ok: false, missing: res.missing };
      if (spec.kind === "revealInShape") return Engine._buildRevealInShape(res);
      if (spec.kind === "fillRepeat") return Engine._buildFillRepeat(res);
      throw new Error("text preset kind not implemented: " + spec.kind);
    },

    // Fill-in & Repeat: duplicate the fill shape(s) in a grid sized to cover the
    // mask's bounding box, then CLIP the duplicator to the mask shape (mask ->
    // duplicator.masks, an alpha clip — verified live by render) and hide the mask.
    // The result fills the mask outline with repeated shapes even from sparse input.
    _buildFillRepeat: function (res) {
      var maskId = res.values.mask;
      var fills = res.values.fills || [];

      var bb = null;
      try { bb = api.getBoundingBox(maskId, true); } catch (e) {}
      var w = (bb && bb.width) ? bb.width : 400;
      var h = (bb && bb.height) ? bb.height : 400;
      var cx = (bb && bb.centre) ? bb.centre.x : 0;
      var cy = (bb && bb.centre) ? bb.centre.y : 0;

      // cell spacing from the first fill shape's size (fallback 40)
      var cw = 40, ch = 40;
      if (fills.length) {
        try { var cbb = api.getBoundingBox(fills[0], false);
              if (cbb && cbb.width > 0) { cw = Math.ceil(cbb.width) + 10; ch = Math.ceil(cbb.height) + 10; } } catch (e) {}
      }
      var nx = Math.max(2, Math.ceil(w / cw) + 1), ny = Math.max(2, Math.ceil(h / ch) + 1);

      var cloner = Engine._create("duplicator", Engine._nextName("Fill Repeat"));
      api.setGenerator(cloner, "generator", "gridDistribution");
      for (var i = 0; i < fills.length; i++) Engine._wire(fills[i], "id", cloner, "shapes");
      api.set(cloner, {
        "generator.count": { x: nx, y: ny },
        "generator.distributionMode": 1,                 // Step: size is centre-to-centre spacing
        "generator.size": { x: cw, y: ch },
        "position": { x: cx, y: cy }                     // centre the grid on the mask
      });

      Engine._wire(maskId, "id", cloner, "masks");        // clip the grid to the mask outline
      api.set(maskId, { "hidden": true });                // mask is a stencil — don't show it

      return { ok: true, clonerId: cloner, maskId: maskId, fillIds: fills, stubbed: res.stubbed };
    },

    // Reveal-In-Shape: per-glyph opacity mask on the body text, switched on/off by
    // whether each glyph falls inside the mask shape. Recipe verified live:
    //   subMesh(per-glyph) -> deformers; isWithin(vs mask) -> valueArray[show,hide]
    //   -> subMesh.shapeOpacity. Animating the mask animates the reveal.
    // Center the body text over the mask and size its text box to the mask's
    // bounding box, so the paragraph covers the whole shape; isWithin then clips
    // it to the shape's outline. Without this the text sits at its own origin and
    // only the sliver overlapping the mask shows. Anchor verified live: a text
    // shape's position is the box's TOP-LEFT (y-up), so the centering offset is
    // {cx - w/2, cy + h/2}. Alignment 1 = centre / middle.
    _fitTextToMask: function (fillId, maskId) {
      var bb = null;
      try { bb = api.getBoundingBox(maskId, true); } catch (e) {}
      if (!bb || !bb.width || !bb.centre) return false;
      if (api.getLayerType(fillId) === "textShape") {
        api.set(fillId, {
          "autoWidth": false, "autoHeight": false,
          "textBoxSize": { x: bb.width, y: bb.height },
          "horizontalAlignment": 1, "verticalAlignment": 1,
          "position": { x: bb.centre.x - bb.width / 2, y: bb.centre.y + bb.height / 2 }
        });
      } else {
        // A non-text fill-in (any shape's mesh can be revealed): just center it.
        api.set(fillId, { "position": { x: bb.centre.x, y: bb.centre.y } });
      }
      return true;
    },

    _buildRevealInShape: function (res) {
      var maskId = res.values.mask;
      var fillId = res.values.fillIn;

      // Align + size the fill-in to the mask before masking (the missing step
      // that left earlier builds offset and unfilled).
      Engine._fitTextToMask(fillId, maskId);

      var bodyId = fillId;
      var sub = Engine._create("subMesh", Engine._nextName("Reveal Mask"));
      api.parent(sub, bodyId);
      api.set(sub, { "levels": { x: 3, y: 3 }, "levelMode": 3, "indexMode": 0, "opacityMode": 0, "useIndex": true });

      var iw = Engine._create("isWithin", Engine._nextName("Is Within"));
      api.parent(iw, sub);
      api.set(iw, { "invert": true });

      var va = Engine._create("valueArray", Engine._nextName("Reveal Opacity"));
      api.parent(va, sub);
      api.addArrayIndex(va, "array");                 // a fresh Value Array has 1 entry; grow to 2
      api.set(va, { "array.0": 100, "array.1": 0 });  // index 0 -> visible, index 1 -> hidden

      Engine._wire(maskId, "id", iw, "inputShape");
      Engine._wire(iw, "id", va, "arrayIndex");
      Engine._wire(va, "id", sub, "shapeOpacity");
      Engine._wire(sub, "id", bodyId, "deformers");   // LIST input: Cavalry auto-indexes to deformers.0

      // The mask is only a stencil for isWithin (works even when hidden, verified
      // in the source scene) — hide it so only the revealed fill-in shows.
      api.set(maskId, { "hidden": true });

      return { ok: true, bodyId: bodyId, maskId: maskId,
               subMeshId: sub, isWithinId: iw, valueArrayId: va, stubbed: res.stubbed };
    },

    // ---- Highlight Words (Add-on) ---------------------------------------
    // Recolour / bold specific words inside a text shape with native, editable
    // text behaviours. Mechanism verified live (tools/probe_highlight.js): see
    // the typemap `highlights` block for the exact attrs.

    // Treat the word as LITERAL text: escape regex metacharacters, then wrap in a
    // single capture group so indexMode 2 colours exactly that word.
    _escapeRegex: function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); },
    _capture: function (word) { return "(" + Engine._escapeRegex(word) + ")"; },

    // The target text: the first selected textShape, else a freshly-stubbed sample
    // (so the button always yields a working, visible result to customise).
    _resolveTextTarget: function (selectionIds) {
      var sel = selectionIds || [];
      for (var i = 0; i < sel.length; i++) {
        if (api.getLayerType(sel[i]) === "textShape") return { textId: sel[i], stubbed: false };
      }
      var t = Engine._create("textShape", Engine._nextName("Highlight Sample"));
      api.set(t, { "text": TM().highlights.sampleText, "fontSize": 90 });
      return { textId: t, stubbed: true };
    },

    // Colour each row's word. rows: [{ word, color }]. Empty words are skipped.
    highlightWords: function (selectionIds, rows) {
      var H = TM().highlights;
      var tgt = Engine._resolveTextTarget(selectionIds);
      var made = [];
      rows = rows || [];
      for (var i = 0; i < rows.length; i++) {
        var word = rows[i] && rows[i].word ? String(rows[i].word).replace(/^\s+|\s+$/g, "") : "";
        if (!word) continue;
        var color = (rows[i].color != null) ? rows[i].color : H.seedColors[i % H.seedColors.length];
        var atm = Engine._create(H.materialLayer, Engine._nextName("Highlight " + word));
        var o = { "regex": Engine._capture(word), "mode": H.matchMode, "indexMode": H.captureGroup };
        o[H.colorAttr] = color;
        api.set(atm, o);
        Engine._wire(atm, "id", tgt.textId, H.materialSlot);   // LIST input: auto-indexed
        made.push(atm);
      }
      return { ok: true, textId: tgt.textId, materialIds: made, stubbed: tgt.stubbed };
    },

    // Bold the same words via applyTypeface, keeping the body text's own font
    // family (only the weight changes). words: array of strings.
    boldWords: function (selectionIds, words) {
      var H = TM().highlights;
      var tgt = Engine._resolveTextTarget(selectionIds);
      var bodyFont = api.get(tgt.textId, "font") || {};
      var family = bodyFont.font || "Lato";
      var made = [];
      words = words || [];
      for (var i = 0; i < words.length; i++) {
        var word = words[i] ? String(words[i]).replace(/^\s+|\s+$/g, "") : "";
        if (!word) continue;
        var atf = Engine._create(H.typefaceLayer, Engine._nextName("Bold " + word));
        api.set(atf, {
          "regex": Engine._capture(word), "mode": H.matchMode, "indexMode": H.captureGroup,
          "font": { font: family, style: H.boldStyle }
        });
        Engine._wire(atf, "id", tgt.textId, H.styleSlot);
        made.push(atf);
      }
      return { ok: true, textId: tgt.textId, typefaceIds: made, stubbed: tgt.stubbed };
    }
  };

  return Engine;
});
