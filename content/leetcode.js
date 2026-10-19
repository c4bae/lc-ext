// Isolated world on leetcode.com. If the background opened this tab for a job,
// switch the language, put the job's code in the editor and click Submit.
(() => {
  const { callMain, showToast, isLeetCodeLabel } = globalThis.NQ;

  // LeetCode changes its DOM often; every selector the extension depends on is here.
  const SELECTORS = {
    submitButton: '[data-e2e-locator="console-submit-button"]',
    languageButton: 'button[aria-haspopup="dialog"]',
  };
  const PAGE_READY_TIMEOUT_MS = 20000;
  const LANGUAGE_SWITCH_TIMEOUT_MS = 5000;

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

  async function runJob(jobId, job) {
    await waitFor(() => submitButton() && languageButton(), PAGE_READY_TIMEOUT_MS).catch(() => {
      throw new Error("LeetCode editor did not load");
    });
    await selectLanguage(job.language);
    const result = await callMain("SET_CODE", "CODE_SET", { code: job.code }, 20000);
    if (!result.ok) throw new Error(result.error || "Could not set the code");
    submitButton().click();
    showToast("Submitted. Waiting for the verdict...");
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
