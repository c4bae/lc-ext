// Isolated world on neetcode.io. Injects a "Submit + Quiz" button next to
// NeetCode's Submit button; on click, collects the problem and code and asks the
// background to open the problem on LeetCode.
(() => {
  const { callMain, showToast, leetcodeLabelFor, resolveLeetCodeSlug } = globalThis.NQ;

  const SELECTORS = {
    submitButton: "app-code-actions .submit-btn",
    language: "app-code-language .selected-language",
    title: "h1.problem-title",
  };
  const BUTTON_ID = "nq-submit-quiz";

  function neetcodeSlug() {
    const match = location.pathname.match(/^\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  async function onClick(button) {
    const slug = neetcodeSlug();
    const languageName = document.querySelector(SELECTORS.language)?.textContent.trim();
    const language = leetcodeLabelFor(languageName);
    if (!language) {
      showToast(`Unsupported language: ${languageName || "unknown"}`, { kind: "error" });
      return;
    }

    button.disabled = true;
    try {
      const problem = await callMain("GET_PROBLEM", "PROBLEM", { neetcodeSlug: slug });
      if (problem.error) throw new Error(problem.error);
      if (!problem.code.trim()) throw new Error("The editor is empty");

      const leetcodeSlug = resolveLeetCodeSlug(slug, problem.leetcodeSlug);
      const job = {
        title: document.querySelector(SELECTORS.title)?.textContent.trim() || leetcodeSlug,
        slug: leetcodeSlug,
        language,
        code: problem.code,
        url: `https://leetcode.com/problems/${leetcodeSlug}/`,
      };
      const reply = await chrome.runtime.sendMessage({ type: "START_JOB", job });
      if (!reply?.ok) throw new Error(reply?.error || "Background did not accept the job");
      showToast(`Opening ${leetcodeSlug} on LeetCode...`);
    } catch (err) {
      showToast(`Could not start: ${err.message}`, { kind: "error" });
    } finally {
      button.disabled = false;
    }
  }

  // NeetCode is prerendered and hydrated by Angular, which claims existing DOM
  // nodes by position. A button inserted before hydration gets claimed as
  // NeetCode's own Submit (its classes, text and click handler). Angular removes
  // a component's `ngh` attribute once it has hydrated it, so wait for that.
  const isHydrated = (el) => !el.closest("[ngh]");

  function ensureButton() {
    if (!neetcodeSlug() || document.getElementById(BUTTON_ID)) return;
    const submit = document.querySelector(SELECTORS.submitButton);
    if (!submit || !isHydrated(submit)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "button is-info";
    button.style.marginRight = "8px";
    button.textContent = "Submit + Quiz";
    button.title = "Submit this code on LeetCode and get quizzed by Claude if it's Accepted";
    button.addEventListener("click", () => onClick(button));
    submit.before(button);
  }

  // NeetCode is a single-page app: the editor toolbar is re-rendered on
  // navigation, so re-check after DOM changes and after hydration (batched per
  // animation frame).
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureButton();
    });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["ngh"] });
  ensureButton();
})();
