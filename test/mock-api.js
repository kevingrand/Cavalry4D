"use strict";

function makeApi(opts) {
  opts = opts || {};
  var counters = {};
  var layers = {};
  var conns = [];
  var selection = (opts.selection || []).slice();

  function removeInput(to, toAttr) {
    for (var i = conns.length - 1; i >= 0; i--) {
      if (conns[i].to === to && conns[i].toAttr === toAttr) conns.splice(i, 1);
    }
  }

  // List inputs accept many connections (Cavalry auto-indexes shapes.0, shapes.1,
  // masks.0, deformers.0, ...); single inputs are last-wins. The mock mirrors this
  // so wiring several shapes/masks into one cloner all register.
  var LIST_INPUTS = { shapes: 1, masks: 1, deformers: 1, falloffs: 1, materialBehaviours: 1, styleBehaviours: 1 };
  function isListInput(toAttr) { return !!LIST_INPUTS[String(toAttr).split(".")[0]]; }

  var api = {
    _layers: layers,
    _conns: conns,
    create: function (type, name) {
      counters[type] = (counters[type] || 0) + 1;
      var id = type + "#" + counters[type];
      layers[id] = { type: type, name: name || id, attrs: {}, parent: null };
      return id;
    },
    deleteLayer: function (id) { delete layers[id]; },
    set: function (id, obj) {
      var l = layers[id]; if (!l) return;
      for (var k in obj) if (obj.hasOwnProperty(k)) l.attrs[k] = obj[k];
    },
    get: function (id, attr) { return layers[id] ? layers[id].attrs[attr] : undefined; },
    setGenerator: function (id, attr, type) { if (layers[id]) layers[id].attrs["__gen:" + attr] = type; },
    getCurrentGeneratorType: function (id, attr) { return layers[id] ? layers[id].attrs["__gen:" + attr] : undefined; },
    addDynamic: function (id, attr) { if (layers[id]) layers[id].attrs[attr] = layers[id].attrs[attr] || 0; },
    parent: function (child, parent) { if (layers[child]) layers[child].parent = parent; },
    // reorder(a, b) moves `a` BELOW `b` in the stack (per Cavalry docs). The mock
    // doesn't model draw order, but records calls so tests can assert direction.
    _reorders: [],
    reorder: function (a, b) { api._reorders.push([a, b]); },
    getParent: function (id) { return layers[id] ? layers[id].parent : null; },
    connect: function (from, fromAttr, to, toAttr) {
      if (!isListInput(toAttr)) removeInput(to, toAttr);   // single inputs are last-wins
      conns.push({ from: from, fromAttr: fromAttr, to: to, toAttr: toAttr });
    },
    disconnect: function (from, fromAttr, to, toAttr) {
      for (var i = conns.length - 1; i >= 0; i--) {
        if (conns[i].from === from && conns[i].fromAttr === fromAttr && conns[i].to === to && conns[i].toAttr === toAttr) conns.splice(i, 1);
      }
    },
    disconnectInput: function (id, attr) { removeInput(id, attr); },
    // Faithful to real Cavalry: returns "sourceLayer.sourceAttr" (e.g. "random#1.id"), "" if none.
    getInConnection: function (id, attr) {
      for (var i = 0; i < conns.length; i++) if (conns[i].to === id && conns[i].toAttr === attr) return conns[i].from + "." + conns[i].fromAttr;
      return "";
    },
    // Faithful to real Cavalry: returns ["targetLayer.targetAttr", ...] (e.g. ["duplicator#9.shapeScale"]).
    getOutConnections: function (id, attr) {
      var r = [];
      for (var i = 0; i < conns.length; i++) if (conns[i].from === id && (attr === undefined || conns[i].fromAttr === attr)) r.push(conns[i].to + "." + conns[i].toAttr);
      return r;
    },
    getChildren: function (id) {
      var r = []; for (var k in layers) if (layers.hasOwnProperty(k) && layers[k].parent === id) r.push(k); return r;
    },
    getInConnectedAttributes: function (id) {
      var r = []; for (var i = 0; i < conns.length; i++) if (conns[i].to === id) r.push(conns[i].toAttr); return r;
    },
    getOutConnectedAttributes: function (id) {
      var r = []; for (var i = 0; i < conns.length; i++) if (conns[i].from === id) r.push(conns[i].fromAttr); return r;
    },
    getLayerType: function (id) { return layers[id] ? layers[id].type : ""; },
    isShape: function (id) {
      var t = layers[id] ? layers[id].type : "";
      var shapes = { basicShape: 1, group: 1, textShape: 1, footageShape: 1, imageToShapes: 1, duplicator: 1, "null": 1 };
      return !!shapes[t];
    },
    getNiceName: function (id) { return layers[id] ? layers[id].name : ""; },
    rename: function (id, name) { if (layers[id]) layers[id].name = name; },
    layerExists: function (id) { return !!layers[id]; },
    getSelection: function () { return selection.slice(); },
    setSelection: function (ids) { selection = ids.slice(); },
    select: function (ids) { selection = ids.slice(); },
    getAttributes: function (id) { return layers[id] ? Object.keys(layers[id].attrs) : []; },
    getBoundingBox: function (id, worldSpace) {
      // Return a predictable 100×80 box so configure functions get a real bb in tests.
      return { x: -50, y: -40, width: 100, height: 80,
               centre: { x: 0, y: 0 }, left: -50, right: 50, top: 40, bottom: -40 };
    },
    getActiveComp: function () { return "comp#1"; },
    getFrame: function () { return 0; },
    // Stack order. In real Cavalry getCompLayers index 0 is the TOP of the stack
    // and sequentially-created layers list in creation order (first = top); the
    // mock mirrors that with insertion order.
    getCompLayers: function (isTopLevel) { return Object.keys(layers); },
    getAllSceneLayers: function () { return Object.keys(layers); },
    // List attributes (e.g. a Value Array's "array") start at 1 entry; addArrayIndex
    // grows them. Faithful enough that engine code can populate array.0/array.1.
    addArrayIndex: function (id, attr) {
      if (!layers[id]) return 0;
      var key = "__count:" + attr;
      layers[id].attrs[key] = (layers[id].attrs[key] || 1) + 1;
      return layers[id].attrs[key] - 1;
    },
    getArrayCount: function (id, attr) {
      return layers[id] ? (layers[id].attrs["__count:" + attr] || 1) : 0;
    }
  };
  return api;
}

function makeCavalry() {
  return {
    random: function (min, max) { return (min + max) / 2; },
    noise1d: function () { return 0; },
    noise2d: function () { return 0; },
    map: function (v, a, b, c, d) { return c; },
    lerp: function (a, b) { return a; },
    clamp: function (v) { return v; }
  };
}

function makeUi() {
  var widgets = [];
  function W(kind, args) { this.kind = kind; this.args = args || []; this.children = []; widgets.push(this); }
  var p = W.prototype;
  ["setToolTip","setFontSize","setTextColor","setBackgroundColor","setImage","setImageSize",
   "addStretch","addSeparator","addSpacing","setSpaceBetween","setMargins","setPlaceholder",
   "setMin","setMax","setType","setStep","setMinimumHeight","setAlignment","setSelectionMode",
   "showSearchBar","setRowsDeletable","setRowsRenamable","setRowsReorderable","clear","setDrawStroke",
   "setRange","setSize","setFixedWidth","setFixedHeight","setMaximumHeight","setEnabled","setContentsMargins","setLayout"]
    .forEach(function (m) { p[m] = function () { return this; }; });
  p.setHidden = function (s) { this.hidden = !!s; return this; };
  p.isHidden = function () { return !!this.hidden; };
  // test helper: set a value and fire onValueChanged like a real drag/select
  p.change = function (v) { this.value = v; if (typeof this.onValueChanged === "function") this.onValueChanged(); return this; };
  p.add = function () { for (var i = 0; i < arguments.length; i++) this.children.push(arguments[i]); return this; };
  p.setText = function (t) { this.text = t; return this; };
  p.getText = function () { return this.text || ""; };
  p.setValue = function (v) { this.value = v; return this; };
  p.getValue = function () { return this.value; };
  p.addEntry = function (e) { (this.entries = this.entries || []).push(e); return this; };
  p.setModel = function (m) { this.model = m; return this; };
  p.getColor = function () { return this.color || "#000000"; };
  p.setColor = function (c) { this.color = c; return this; };
  p.click = function () { if (typeof this.onClick === "function") this.onClick(); };
  p.showMessage = function (m) { (ui._messages = ui._messages || []).push(m); };
  p.showQuestion = function () { return true; };
  p.showConfirmation = function () { return true; };

  var ui = { _widgets: widgets, _messages: [] };
  ["Button","Label","Checkbox","NumericField","LineEdit","MultiLineEdit","DropDown","ColorChip","List","VLayout",
   "HLayout","FlowLayout","ScrollView","TabView","Modal","Draw","ImageButton","Container","Slider"]
    .forEach(function (kind) { ui[kind] = function () { return new W(kind, Array.prototype.slice.call(arguments)); }; });
  ui.getThemeColor = function () { return "#888888"; };
  ui.setTitle = function () {}; ui.setMinimumWidth = function () {}; ui.setMinimumHeight = function () {};
  ui.add = function () {}; ui.show = function () {}; ui.addStretch = function () {};
  ui.addCallbackObject = function (o) { ui._callbacks = o; };
  ui.scriptLocation = "/mock";
  return ui;
}

module.exports = { makeApi: makeApi, makeCavalry: makeCavalry, makeUi: makeUi };
