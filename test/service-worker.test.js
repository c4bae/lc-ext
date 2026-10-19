const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

// Loads background/service-worker.js in a sandbox with an in-memory chrome API.
function loadWorker() {
  const store = {};
  const createdTabs = [];
  const notifications = [];
  let onMessage = null;
  let nextTabId = 100;

  const chrome = {
    storage: {
      session: {
        async get(key) {
          if (key === null) return { ...store };
          return key in store ? { [key]: structuredClone(store[key]) } : {};
        },
        async set(items) {
          for (const [k, v] of Object.entries(items)) store[k] = structuredClone(v);
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete store[k];
        },
      },
    },
    tabs: {
      async create(props) {
        const tab = { id: nextTabId++, ...props };
        createdTabs.push(tab);
        return tab;
      },
      onRemoved: { addListener() {} },
    },
    runtime: {
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      getURL: (p) => `chrome-extension://test/${p}`,
    },
    notifications: {
      async create(options) {
        notifications.push(options);
      },
    },
  };

  const context = vm.createContext({ chrome, crypto, console, structuredClone });
  context.globalThis = context;
  context.importScripts = (...files) => {
    for (const f of files) {
      const file = path.join(ROOT, "background", f);
      vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    }
  };
  const swPath = path.join(ROOT, "background/service-worker.js");
  vm.runInContext(fs.readFileSync(swPath, "utf8"), context, { filename: swPath });

  // Like Chrome: if the listener doesn't return true, the sender gets undefined.
  function send(message, tab) {
    return new Promise((resolve) => {
      if (onMessage(message, { tab }, resolve) !== true) resolve(undefined);
    });
  }
  return { store, createdTabs, notifications, send };
}

const neetcodeTab = { id: 1, index: 0 };
const jobFields = {
  title: "Two Sum",
  slug: "two-sum",
  language: "Python3",
  code: "class Solution: pass",
  url: "https://leetcode.com/problems/two-sum/",
};

async function startJob(worker) {
  const reply = await worker.send({ type: "START_JOB", job: jobFields }, neetcodeTab);
  const leetcodeTab = worker.createdTabs.at(-1);
  return { reply, leetcodeTab: { id: leetcodeTab.id, index: leetcodeTab.index } };
}

test("START_JOB stores a pending job and opens the LeetCode tab", async () => {
  const worker = loadWorker();
  const { reply } = await startJob(worker);
  assert.equal(reply.ok, true);
  assert.equal(worker.createdTabs[0].url, jobFields.url);
  assert.equal(worker.createdTabs[0].openerTabId, neetcodeTab.id);
  assert.equal(worker.store[`job:${reply.jobId}`].status, "pending");
});

test("GET_JOB hands the job to the opened tab exactly once", async () => {
  const worker = loadWorker();
  const { reply, leetcodeTab } = await startJob(worker);
  const handoff = await worker.send({ type: "GET_JOB" }, leetcodeTab);
  assert.equal(handoff.jobId, reply.jobId);
  assert.equal(handoff.job.code, jobFields.code);
  assert.equal(await worker.send({ type: "GET_JOB" }, leetcodeTab), null);
});

test("GET_JOB returns null for a tab the extension didn't open", async () => {
  const worker = loadWorker();
  await startJob(worker);
  assert.equal(await worker.send({ type: "GET_JOB" }, { id: 999, index: 3 }), null);
});

test("ACCEPTED opens Claude with the prompt prefilled", async () => {
  const worker = loadWorker();
  const { reply, leetcodeTab } = await startJob(worker);
  await worker.send({ type: "GET_JOB" }, leetcodeTab);
  const accepted = await worker.send({ type: "ACCEPTED", jobId: reply.jobId, description: "desc" }, leetcodeTab);
  assert.equal(accepted.ok, true);
  const claudeTab = worker.createdTabs.at(-1);
  assert.match(claudeTab.url, /^https:\/\/claude\.ai\/new\?q=/);
  assert.ok(decodeURIComponent(claudeTab.url).includes("Problem: Two Sum"));
  assert.equal(claudeTab.openerTabId, leetcodeTab.id);
});

test("concurrent duplicate ACCEPTED messages open Claude once", async () => {
  const worker = loadWorker();
  const { reply, leetcodeTab } = await startJob(worker);
  await worker.send({ type: "GET_JOB" }, leetcodeTab);
  const tabsBefore = worker.createdTabs.length;
  const message = { type: "ACCEPTED", jobId: reply.jobId, description: "" };
  const replies = await Promise.all([worker.send(message, leetcodeTab), worker.send(message, leetcodeTab)]);
  assert.equal(worker.createdTabs.length - tabsBefore, 1);
  assert.deepEqual(replies.map((r) => r.ok).sort(), [false, true]);
  assert.ok(replies.some((r) => r.duplicate));
});

test("long prompt is returned for the clipboard, then OPEN_CLAUDE opens an empty chat once", async () => {
  const worker = loadWorker();
  const reply = await worker.send({ type: "START_JOB", job: { ...jobFields, code: "x = 1\n".repeat(2000) } }, neetcodeTab);
  const leetcodeTab = { id: worker.createdTabs.at(-1).id, index: 1 };
  await worker.send({ type: "GET_JOB" }, leetcodeTab);
  const tabsBefore = worker.createdTabs.length;

  const accepted = await worker.send({ type: "ACCEPTED", jobId: reply.jobId, description: "" }, leetcodeTab);
  assert.equal(accepted.ok, true);
  assert.ok(accepted.clipboardPrompt.includes("x = 1"));
  assert.equal(worker.createdTabs.length, tabsBefore);

  assert.equal((await worker.send({ type: "OPEN_CLAUDE", jobId: reply.jobId }, leetcodeTab)).ok, true);
  assert.equal(worker.createdTabs.at(-1).url, "https://claude.ai/new");
  assert.equal((await worker.send({ type: "OPEN_CLAUDE", jobId: reply.jobId }, leetcodeTab)).ok, false);
  assert.equal(worker.createdTabs.length, tabsBefore + 1);
});

test("CREATE_JOB starts a job from a LeetCode tab without opening a tab", async () => {
  const worker = loadWorker();
  const leetcodeTab = { id: 7, index: 2 };
  const created = await worker.send({ type: "CREATE_JOB", job: jobFields }, leetcodeTab);
  assert.equal(created.ok, true);
  assert.equal(worker.createdTabs.length, 0);
  const accepted = await worker.send({ type: "ACCEPTED", jobId: created.jobId, description: "" }, leetcodeTab);
  assert.equal(accepted.ok, true);
  assert.match(worker.createdTabs[0].url, /^https:\/\/claude\.ai\/new\?q=/);
});

test("NOTIFY shows a system notification", async () => {
  const worker = loadWorker();
  await worker.send({ type: "NOTIFY", message: "Log in to LeetCode" }, { id: 7, index: 2 });
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].message, "Log in to LeetCode");
  assert.equal(worker.notifications[0].type, "basic");
});

test("OPEN_CLAUDE is refused for a job that wasn't accepted", async () => {
  const worker = loadWorker();
  const { reply, leetcodeTab } = await startJob(worker);
  assert.equal((await worker.send({ type: "OPEN_CLAUDE", jobId: reply.jobId }, leetcodeTab)).ok, false);
});
