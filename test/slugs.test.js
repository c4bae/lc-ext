const test = require("node:test");
const assert = require("node:assert/strict");
const { SLUG_OVERRIDES, resolveLeetCodeSlug } = require("../lib/slugs.js");

test("uses looked-up slug when there is no override", () => {
  assert.equal(resolveLeetCodeSlug("two-integer-sum", "two-sum"), "two-sum");
});

test("falls back to the NeetCode slug", () => {
  assert.equal(resolveLeetCodeSlug("climbing-stairs", null), "climbing-stairs");
});

test("override wins over lookup", () => {
  SLUG_OVERRIDES["some-nc-slug"] = "override-slug";
  try {
    assert.equal(resolveLeetCodeSlug("some-nc-slug", "looked-up"), "override-slug");
  } finally {
    delete SLUG_OVERRIDES["some-nc-slug"];
  }
});
