const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, claudeLaunch, CLAUDE_NEW_URL, MAX_URL_LENGTH } = require("../lib/prompt.js");

const job = {
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  language: "Python3",
  code: "class Solution:\n    def twoSum(self, nums, target):\n        return []",
};

test("prompt contains problem, language, fenced code and quiz steps", () => {
  const prompt = buildPrompt(job);
  assert.match(prompt, /^I just got Accepted on a LeetCode problem/);
  assert.ok(prompt.includes("Problem: Two Sum (https://leetcode.com/problems/two-sum/)"));
  assert.ok(prompt.includes("Language: Python3"));
  assert.ok(prompt.includes("My code:\n```python\n" + job.code + "\n```"));
  assert.ok(prompt.includes("4. Give a clear YES or NO"));
});

test("description is included only when present and requested", () => {
  const withDesc = { ...job, description: "Given an array of integers..." };
  assert.ok(buildPrompt(withDesc).includes("Problem description:\nGiven an array of integers..."));
  assert.ok(!buildPrompt(withDesc, { includeDescription: false }).includes("Problem description"));
  assert.ok(!buildPrompt(job).includes("Problem description"));
});

test("fence is longer than any backtick run in the code", () => {
  const prompt = buildPrompt({ ...job, code: 's = "```"' });
  assert.ok(prompt.includes("````python\ns = \"```\"\n````"));
});

test("short prompt opens claude.ai/new with q prefilled", () => {
  const launch = claudeLaunch(job);
  assert.equal(launch.viaClipboard, false);
  assert.equal(launch.url, `${CLAUDE_NEW_URL}?q=${encodeURIComponent(buildPrompt(job))}`);
});

test("drops the description before falling back to the clipboard", () => {
  const description = "d".repeat(MAX_URL_LENGTH);
  const launch = claudeLaunch({ ...job, description });
  assert.equal(launch.viaClipboard, false);
  assert.ok(!decodeURIComponent(launch.url).includes(description));
  assert.ok(launch.url.length <= MAX_URL_LENGTH);
});

test("very long code falls back to the clipboard with the full prompt", () => {
  const longJob = { ...job, code: "x = 1\n".repeat(2000), description: "desc" };
  const launch = claudeLaunch(longJob);
  assert.equal(launch.viaClipboard, true);
  assert.equal(launch.url, CLAUDE_NEW_URL);
  assert.equal(launch.prompt, buildPrompt(longJob));
});
