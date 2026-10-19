// Isolated world on leetcode.com. Two entry points:
//  - The background opened this tab for a NeetCode job: switch the language,
//    put the job's code in the editor, then submit.
//  - The user clicks the injected "Submit + Quiz" button: submit the code
//    already in the editor.
// Either way, click Submit and watch for the verdict. Only "Accepted" is
// reported to the background, which opens the Claude quiz.
(() => {
  const { callMain, showToast, isLeetCodeLabel } = globalThis.NQ;

  // LeetCode changes its DOM often; every selector the extension depends on is here.
  const SELECTORS = {
    submitButton: '[data-e2e-locator="console-submit-button"]',
    languageButton: 'button[aria-haspopup="dialog"]',
    submissionResult: '[data-e2e-locator="submission-result"]',
    description: '[data-track-load="description_content"]',
    // Link in the editor panel's "You need to log in / sign up to run or
    // submit" wall. Don't match the wall's text: the same string is also in
    // the page's embedded __NEXT_DATA__ JSON.
    loginWall: '#editor a[href*="/accounts/login"]',
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
  const BUTTON_ID = "nq-submit-quiz";
  const PAGE_READY_TIMEOUT_MS = 20000;
  const LANGUAGE_SWITCH_TIMEOUT_MS = 5000;
  const VERDICT_TIMEOUT_MS = 60000;
  const CHECK_THROTTLE_MS = 100;

  const isProblemPage = () => /^\/problems\/[^/]+/.test(location.pathname);
  const problemSlug = () => location.pathname.match(/^\/problems\/([^/]+)/)[1];

  class LoggedOutError extends Error {
    constructor() {
      super("You're not logged in to LeetCode. Log in, then try again.");
    }
  }

  // Resolves with the first truthy value of check(), re-evaluated on DOM
  // changes (at most every CHECK_THROTTLE_MS). check() may throw to abort.
  function waitFor(check, timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer = null;
      let throttle = null;
      const observer = new MutationObserver(() => {
        if (!throttle) throttle = setTimeout(evaluate, CHECK_THROTTLE_MS);
      });
      function finish(settle, value) {
        observer.disconnect();
        clearTimeout(timer);
        clearTimeout(throttle);
        settle(value);
      }
      function evaluate() {
        throttle = null;
        try {
          const value = check();
          if (value) finish(resolve, value);
        } catch (err) {
          finish(reject, err);
        }
      }
      timer = setTimeout(() => finish(reject, new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      evaluate();
    });
  }

  const submitButton = () => document.querySelector(SELECTORS.submitButton);

  const languageButton = () =>
    [...document.querySelectorAll(SELECTORS.languageButton)].find((b) => isLeetCodeLabel(b.textContent.trim())) ?? null;

  const currentLanguage = () => languageButton()?.textContent.trim() ?? null;

  const isLoggedOut = () => !!document.querySelector(SELECTORS.loginWall);

  const problemDescription = () => document.querySelector(SELECTORS.description)?.innerText.trim() || "";

  const problemTitle = () => document.title.replace(/\s*-\s*LeetCode\s*$/, "").trim() || problemSlug();

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

  async function waitForEditorReady() {
    await waitFor(() => submitButton() && languageButton(), PAGE_READY_TIMEOUT_MS).catch(() => {
      throw new Error("LeetCode editor did not load");
    });
  }

  // A result panel left over from an earlier submission doesn't count: the
  // verdict must come from a new result element, or the page must have moved on
  // to a new URL (LeetCode navigates to /submissions/<id>/ on submit).
  function readVerdict(staleResult, urlAtSubmit) {
    if (isLoggedOut()) throw new LoggedOutError();
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
    showToast("Submitted. Waiting for the verdict...");
    return waitFor(() => readVerdict(staleResult, urlAtSubmit), VERDICT_TIMEOUT_MS).catch((err) => {
      if (err instanceof LoggedOutError) throw err;
      throw new Error(`No verdict from LeetCode within ${VERDICT_TIMEOUT_MS / 1000} s, so no quiz`);
    });
  }

  async function copyPromptAndOpenClaude(jobId, prompt) {
    await navigator.clipboard.writeText(prompt);
    showToast("Your solution is too long to prefill, so the quiz prompt is on your clipboard. Paste it into Claude.", {
      kind: "success",
      durationMs: 0,
    });
    chrome.runtime.sendMessage({
      type: "NOTIFY",
      message: "The quiz prompt is on your clipboard. Paste it into the new Claude chat.",
    });
    await chrome.runtime.sendMessage({ type: "OPEN_CLAUDE", jobId });
  }

  async function deliverQuiz(jobId, description) {
    const reply = await chrome.runtime.sendMessage({ type: "ACCEPTED", jobId, description });
    if (reply?.duplicate) return;
    if (!reply?.ok) throw new Error(reply?.error || "Background did not open Claude");
    if (!reply.clipboardPrompt) return; // Claude opened with the prompt prefilled
    try {
      await copyPromptAndOpenClaude(jobId, reply.clipboardPrompt);
    } catch {
      // Clipboard writes need a focused page; a click on the toast provides one.
      showToast("Your solution is too long to prefill. Copy the quiz prompt, then paste it into Claude.", {
        durationMs: 0,
        action: {
          label: "Copy prompt and open Claude",
          onClick: () =>
            copyPromptAndOpenClaude(jobId, reply.clipboardPrompt).catch((err) =>
              showToast(`Could not copy: ${err.message}`, { kind: "error" })),
        },
      });
    }
  }

  async function submitAndQuiz(jobId, description) {
    const verdict = await submitAndWaitForVerdict();
    if (verdict !== "Accepted") {
      console.info(`[neetcode-quiz] verdict: ${verdict}; no quiz`);
      return;
    }
    await deliverQuiz(jobId, description);
  }

  // Job handed over from NeetCode via the background.
  async function runHandedOffJob(jobId, job) {
    await waitForEditorReady();
    if (isLoggedOut()) throw new LoggedOutError();
    // Read now: after submitting, the description tab is replaced by the result.
    const description = problemDescription();
    await selectLanguage(job.language);
    const result = await callMain("SET_CODE", "CODE_SET", { code: job.code }, 20000);
    if (!result.ok) throw new Error(result.error || "Could not set the code");
    await submitAndQuiz(jobId, description);
  }

  // "Submit + Quiz" clicked on LeetCode: quiz on the code already in the editor.
  async function runFromLeetCode() {
    await waitForEditorReady();
    if (isLoggedOut()) throw new LoggedOutError();
    const description = problemDescription();
    const editor = await callMain("GET_CODE", "CODE");
    if (editor.error) throw new Error(editor.error);
    if (!editor.code.trim()) throw new Error("The editor is empty");
    const slug = problemSlug();
    const created = await chrome.runtime.sendMessage({
      type: "CREATE_JOB",
      job: {
        title: problemTitle(),
        slug,
        language: currentLanguage(),
        code: editor.code,
        url: `https://leetcode.com/problems/${slug}/`,
      },
    });
    if (!created?.ok) throw new Error(created?.error || "Background did not accept the job");
    await submitAndQuiz(created.jobId, description);
  }

  // One submission at a time per tab, whichever entry point started it.
  let busy = false;
  async function exclusive(task) {
    if (busy) {
      showToast("Already waiting for a verdict on this tab.");
      return;
    }
    busy = true;
    const button = document.getElementById(BUTTON_ID);
    if (button) button.disabled = true;
    try {
      await task();
    } catch (err) {
      if (err instanceof LoggedOutError) {
        chrome.runtime.sendMessage({ type: "NOTIFY", message: err.message });
      }
      showToast(err.message, { kind: "error", durationMs: 0 });
    } finally {
      busy = false;
      const current = document.getElementById(BUTTON_ID);
      if (current) current.disabled = false;
    }
  }

  function ensureButton() {
    if (!isProblemPage() || document.getElementById(BUTTON_ID)) return;
    const submit = submitButton();
    if (!submit) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    // Borrow the Submit button's classes so it matches the toolbar.
    button.className = submit.className;
    const label = document.createElement("span");
    label.className = "text-sm font-medium";
    label.textContent = "Submit + Quiz";
    button.append(label);
    button.title = "Submit and get quizzed by Claude if it's Accepted";
    button.addEventListener("click", () => exclusive(runFromLeetCode));
    // Submit sits inside a tooltip wrapper; go after the wrapper, not inside it.
    (submit.closest("[data-state]") ?? submit).after(button);
  }

  async function init() {
    // LeetCode is a single-page app: the toolbar can be re-rendered on
    // navigation, so re-check after DOM changes (batched per animation frame).
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        ensureButton();
      });
    }).observe(document.body, { childList: true, subtree: true });
    ensureButton();

    if (!isProblemPage()) return;
    const handoff = await chrome.runtime.sendMessage({ type: "GET_JOB" });
    if (handoff) exclusive(() => runHandedOffJob(handoff.jobId, handoff.job));
  }

  init();
})();
