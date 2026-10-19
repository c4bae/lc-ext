// Job store and tab orchestration. All state lives in chrome.storage.session:
//   job:<jobId>  -> job object
//   tab:<tabId>  -> jobId waiting to be picked up by the LeetCode tab
// Job status: "pending" (LeetCode tab not yet picked it up) -> "submitting"
// -> "accepted" (quiz prompt delivered).

importScripts("../lib/languages.js", "../lib/prompt.js");

const JOB_TTL_MS = 6 * 60 * 60 * 1000;

const jobKey = (jobId) => `job:${jobId}`;
const tabKey = (tabId) => `tab:${tabId}`;

async function getItem(key) {
  return (await chrome.storage.session.get(key))[key] ?? null;
}

async function saveJob(job) {
  await chrome.storage.session.set({ [jobKey(job.jobId)]: job });
}

async function pruneOldJobs() {
  const all = await chrome.storage.session.get(null);
  const cutoff = Date.now() - JOB_TTL_MS;
  const stale = Object.keys(all).filter((k) => k.startsWith("job:") && all[k].submittedAt < cutoff);
  if (stale.length) await chrome.storage.session.remove(stale);
}

async function createJob(fields, status) {
  await pruneOldJobs();
  const job = {
    jobId: crypto.randomUUID(),
    title: fields.title,
    slug: fields.slug,
    language: fields.language,
    code: fields.code,
    url: fields.url,
    submittedAt: Date.now(),
    status,
  };
  await saveJob(job);
  return job;
}

const handlers = {
  // From neetcode.js: store the job and open the problem on LeetCode.
  async START_JOB({ job: fields }, sender) {
    const job = await createJob(fields, "pending");
    const tab = await chrome.tabs.create({
      url: job.url,
      index: sender.tab.index + 1,
      openerTabId: sender.tab.id,
    });
    await chrome.storage.session.set({ [tabKey(tab.id)]: job.jobId });
    return { ok: true, jobId: job.jobId };
  },

  // From leetcode.js on load: hand over the job opened for this tab, once.
  async GET_JOB(_message, sender) {
    const key = tabKey(sender.tab.id);
    const jobId = await getItem(key);
    if (!jobId) return null;
    await chrome.storage.session.remove(key);
    const job = await getItem(jobKey(jobId));
    if (!job || job.status !== "pending") return null;
    job.status = "submitting";
    await saveJob(job);
    return { jobId, job };
  },

  // From leetcode.js when the submission is Accepted: open the Claude quiz.
  // Only the first ACCEPTED per job counts; the result panel can re-render.
  // If the prompt is too long for a URL, reply with it instead: the page copies
  // it to the clipboard (the service worker can't) and then sends OPEN_CLAUDE.
  async ACCEPTED({ jobId, description }, sender) {
    const job = await getItem(jobKey(jobId));
    if (!job) return { ok: false, error: "Job expired" };
    if (job.status !== "submitting") return { ok: false, duplicate: true };
    job.status = "accepted";
    job.description = description || "";
    await saveJob(job);
    const launch = NQ.claudeLaunch(job);
    if (launch.viaClipboard) return { ok: true, clipboardPrompt: launch.prompt };
    await openClaude(launch.url, sender.tab);
    return { ok: true };
  },

  // From leetcode.js after copying a long prompt: open an empty Claude chat.
  async OPEN_CLAUDE({ jobId }, sender) {
    const job = await getItem(jobKey(jobId));
    if (!job || job.status !== "accepted" || job.claudeOpened) return { ok: false };
    job.claudeOpened = true;
    await saveJob(job);
    await openClaude(NQ.CLAUDE_NEW_URL, sender.tab);
    return { ok: true };
  },
};

async function openClaude(url, besideTab) {
  await chrome.tabs.create({ url, index: besideTab.index + 1, openerTabId: besideTab.id });
}

// Messages are handled one at a time so read-modify-write on a job can't
// interleave (e.g. two ACCEPTED for the same job both seeing "submitting").
let queue = Promise.resolve();
function serially(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler || !sender.tab) return false;
  serially(() => handler(message, sender)).then(sendResponse, (err) => {
    console.error(`[neetcode-quiz] ${message.type} failed:`, err);
    sendResponse({ ok: false, error: err.message });
  });
  return true; // keep the channel open for the async reply
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});
