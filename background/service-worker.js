// Job store and tab orchestration. All state lives in chrome.storage.session:
//   job:<jobId>  -> job object
//   tab:<tabId>  -> jobId waiting to be picked up by the LeetCode tab
// Job status: "pending" (LeetCode tab not yet picked it up) -> "submitting"
// -> "accepted" (Claude opened).

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
  async ACCEPTED({ jobId, description }, sender) {
    const job = await getItem(jobKey(jobId));
    if (!job) return { ok: false, error: "Job expired" };
    job.status = "accepted";
    job.description = description || "";
    await saveJob(job);
    const launch = NQ.claudeLaunch(job);
    await chrome.tabs.create({ url: launch.url, index: sender.tab.index + 1, openerTabId: sender.tab.id });
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler || !sender.tab) return false;
  handler(message, sender).then(sendResponse, (err) => {
    console.error(`[neetcode-quiz] ${message.type} failed:`, err);
    sendResponse({ ok: false, error: err.message });
  });
  return true; // keep the channel open for the async reply
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});
