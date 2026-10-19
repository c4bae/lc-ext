const test = require("node:test");
const assert = require("node:assert/strict");
const { leetcodeLabelFor, isLeetCodeLabel, fenceFor } = require("../lib/languages.js");

test("maps NeetCode Python to LeetCode Python3", () => {
  assert.equal(leetcodeLabelFor("Python"), "Python3");
});

test("maps every NeetCode language seen in its dropdown", () => {
  const neetcode = ["Python", "Java", "C++", "JavaScript", "TypeScript", "C#", "Go", "Kotlin", "Swift", "Rust"];
  for (const name of neetcode) assert.ok(leetcodeLabelFor(name), name);
});

test("returns null for unknown NeetCode language", () => {
  assert.equal(leetcodeLabelFor("Brainfuck"), null);
});

test("LeetCode-only labels are not NeetCode names", () => {
  assert.equal(leetcodeLabelFor("Ruby"), null);
  assert.ok(isLeetCodeLabel("Ruby"));
});

test("fence tags", () => {
  assert.equal(fenceFor("Python3"), "python");
  assert.equal(fenceFor("C++"), "cpp");
  assert.equal(fenceFor("C#"), "csharp");
  assert.equal(fenceFor("Nope"), "");
});
