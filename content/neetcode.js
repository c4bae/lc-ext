// Isolated world on neetcode.io. Injects a "Submit + Quiz" button next to
// NeetCode's Submit button; on click, collects the problem and code and asks the
// background to open the problem on LeetCode.
(() => {
  const { callMain, showToast, attachTooltip, leetcodeLabelFor, resolveLeetCodeSlug } = globalThis.NQ;

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

  // Matches NeetCode's Run/Submit sizing (their rules are scoped to the Angular
  // component, so they don't reach our button), outlined in Submit's green.
  // NeetCode forces `.button { border-width: 3px !important }`; 1px border plus
  // 2px extra padding keeps the same outer size.
  const STYLE = `
    #${BUTTON_ID}.button {
      height: 2rem; padding: 0 17px; margin-left: 15px;
      font-size: 15px; font-weight: 600;
      background-color: transparent; color: rgb(0, 185, 102);
      border: 1px solid rgb(0, 185, 102); border-width: 1px !important;
    }
    #${BUTTON_ID}.button:hover:not([disabled]) { background-color: rgba(0, 185, 102, 0.12); color: rgb(0, 185, 102); }
    #${BUTTON_ID}.button:focus { color: rgb(0, 185, 102); box-shadow: none; }`;

  function ensureStyle() {
    if (document.getElementById(`${BUTTON_ID}-style`)) return;
    const style = document.createElement("style");
    style.id = `${BUTTON_ID}-style`;
    style.textContent = STYLE;
    document.head.append(style);
  }

  function ensureButton() {
    if (!neetcodeSlug() || document.getElementById(BUTTON_ID)) return;
    const submit = document.querySelector(SELECTORS.submitButton);
    if (!submit || !isHydrated(submit)) return;
    ensureStyle();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "button";
    button.textContent = "Submit + Quiz";
    attachTooltip(button, "Submits this code on LeetCode. If it's accepted, Claude quizzes you on your approach and complexity.");
    button.addEventListener("click", () => onClick(button));
    submit.after(button);
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
