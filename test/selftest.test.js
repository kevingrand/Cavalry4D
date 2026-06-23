"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApi, makeCavalry } = require("./mock-api.js");
require("../src/typemap.js");
require("../src/engine.js");
const selftest = require("../src/selftest.js");

test("selftest passes every recipe against the mock api with no warnings", () => {
  global.api = makeApi();
  global.cavalry = makeCavalry();
  const report = selftest();
  assert.equal(report.failed, 0, report.details.join("\n"));
  assert.equal(report.warnings.length, 0, report.warnings.join("\n"));
  assert.ok(report.passed >= 8);
});
