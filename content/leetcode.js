// Isolated world on leetcode.com. If the background opened this tab for a job,
// switch the language, put the job's code in the editor, click Submit and watch
// for the verdict. Only "Accepted" is reported to the background.
(() => {
  const { callMain, showToast, isLeetCodeLabel } = globalThis.NQ;

  // LeetCode changes its DOM often; every selector the extension depends on is here.
  const SELECTORS = {
    submitButton: '[data-e2e-locator="console-submit-button"]',
    languageButton: 'button[aria-haspopup="dialog"]',
    submissionResult: '[data-e2e-locator="submission-result"]',
    description: '[data-track-load="description_content"]',
  };
  const VERDICTS = [
    "Accepted",
    "Wrong Answer",
    "Time Limit Exceeded",
    "Memory Limit Exceeded",
    "Output Limit Exceeded",
    "Runtime Error",
    "Compile Error",
  ];
  const PAGE_READY_TIMEOUT_MS = 20000;
  const LANGUAGE_SWITCH_TIMEOUT_MS = 5000;
  const VERDICT_TIMEOUT_MS = 60000;

  const isProblemPage = () => /^\/problems\/[^/]+/.test(location.pathname);

  // Resolves with the first truthy value of check(), re-evaluated on DOM changes.
  function waitFor(check, timeoutMs) {
    return new Promise((resolve, reject) => {
      const initial = check();
      if (initial) return resolve(initial);
      const observer = new MutationObserver(() => {
        const value = check();
        if (!value) return;
        cleanup();
        resolve(value);
      });
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      function cleanup() {
        observer.disconnect();
        clearTimeout(timer);
      }
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  }

  const submitButton = () => document.querySelector(SELECTORS.submitButton);

  const languageButton = () =>
    [...document.querySelectorAll(SELECTORS.languageButton)].find((b) => isLeetCodeLabel(b.textContent.trim())) ?? null;

  const currentLanguage = () => languageButton()?.textContent.trim() ?? null;

  async function selectLanguage(label) {
    if (currentLanguage() === label) return;
    const button = languageButton();
    button.click();
    const option = await waitFor(() => {
      const popover = document.getElementById(button.getAttribute("aria-controls"));
      if (!popover) return null;
      return [...popover.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === label);
    }, LANGUAGE_SWITCH_TIMEOUT_MS).catch(() => {
      throw new Error(`Language "${label}" not found in LeetCode's language menu`);
    });
    option.click();
    await waitFor(() => currentLanguage() === label, LANGUAGE_SWITCH_TIMEOUT_MS).catch(() => {
      throw new Error(`LeetCode did not switch to ${label}`);
    });
  }

  const problemDescription = () => document.querySelector(SELECTORS.description)?.innerText.trim() || "";

  // A result panel left over from an earlier submission doesn't count: the
  // verdict must come from a new result element, or the page must have moved on
  // to a new URL (LeetCode navigates to /submissions/<id>/ on submit).
  function readVerdict(staleResult, urlAtSubmit) {
    const result = document.querySelector(SELECTORS.submissionResult);
    if (!result) return null;
    if (result === staleResult && location.href === urlAtSubmit) return null;
    const text = result.textContent.trim();
    return VERDICTS.find((v) => text.startsWith(v)) ?? null;
  }

  // Clicks Submit and resolves with the verdict text.
  async function submitAndWaitForVerdict() {
    const staleResult = document.querySelector(SELECTORS.submissionResult);
    const urlAtSubmit = location.href;
    submitButton().click();
    return waitFor(() => readVerdict(staleResult, urlAtSubmit), VERDICT_TIMEOUT_MS).catch(() => {
      throw new Error(`No verdict from LeetCode within ${VERDICT_TIMEOUT_MS / 1000} s, so no quiz`);
    });
  }

  async function runJob(jobId, job) {
    await waitFor(() => submitButton() && languageButton(), PAGE_READY_TIMEOUT_MS).catch(() => {
      throw new Error("LeetCode editor did not load");
    });
    // Read now: after submitting, the description tab is replaced by the result.
    const description = problemDescription();
    await selectLanguage(job.language);
    const result = await callMain("SET_CODE", "CODE_SET", { code: job.code }, 20000);
    if (!result.ok) throw new Error(result.error || "Could not set the code");

    showToast("Submitted. Waiting for the verdict...");
    const verdict = await submitAndWaitForVerdict();
    if (verdict !== "Accepted") {
      console.info(`[neetcode-quiz] verdict: ${verdict}; no quiz`);
      return;
    }
    const reply = await chrome.runtime.sendMessage({ type: "ACCEPTED", jobId, description });
    if (!reply?.ok) throw new Error(reply?.error || "Background did not open Claude");
  }

  async function init() {
    if (!isProblemPage()) return;
    const handoff = await chrome.runtime.sendMessage({ type: "GET_JOB" });
    if (!handoff) return;
    try {
      await runJob(handoff.jobId, handoff.job);
    } catch (err) {
      showToast(err.message, { kind: "error", durationMs: 0 });
    }
  }

  init();
})();
