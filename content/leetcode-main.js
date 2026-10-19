// MAIN world on leetcode.com. LeetCode exposes window.monaco; this script reads
// and writes the code editor for content/leetcode.js.
//   SET_CODE { code } -> CODE_SET { ok, error? }
//   GET_CODE          -> CODE { code?, error? }
(() => {
  const SRC = "nq";
  const EDITOR_TIMEOUT_MS = 15000;
  const POLL_MS = 300;
  // After a language switch LeetCode loads the new template asynchronously and
  // can overwrite our code, so the value must hold for this many polls.
  const STABLE_POLLS = 3;
  const MAX_SET_ATTEMPTS = 20;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The code editor is the one whose model isn't plain text (the test case
  // editor is plain text).
  function codeEditor() {
    const editors = window.monaco?.editor?.getEditors?.() ?? [];
    return editors.find((e) => e.getModel() && e.getModel().getLanguageId() !== "plaintext") ?? null;
  }

  async function waitForEditor() {
    const deadline = Date.now() + EDITOR_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const editor = codeEditor();
      if (editor) return editor;
      await sleep(POLL_MS);
    }
    return null;
  }

  // Fallback when Monaco isn't exposed: replace the text the way a user would.
  function setCodeViaInput(code) {
    const textarea = document.querySelector(".monaco-editor textarea");
    if (!textarea) throw new Error("Code editor not found");
    textarea.focus();
    document.execCommand("selectAll");
    if (!document.execCommand("insertText", false, code)) throw new Error("insertText was rejected");
  }

  async function setCode(code) {
    const editor = await waitForEditor();
    if (!editor) {
      setCodeViaInput(code);
      return;
    }
    let stable = 0;
    for (let attempt = 0; attempt < MAX_SET_ATTEMPTS && stable < STABLE_POLLS; attempt++) {
      const model = codeEditor().getModel();
      if (model.getValue() === code) {
        stable++;
      } else {
        model.setValue(code);
        stable = 0;
      }
      await sleep(POLL_MS);
    }
    if (stable < STABLE_POLLS) throw new Error("LeetCode kept replacing the code in the editor");
  }

  async function getCode() {
    const editor = await waitForEditor();
    if (!editor) throw new Error("Monaco editor not found");
    return editor.getModel().getValue();
  }

  async function handle(data) {
    if (data.type === "SET_CODE") {
      try {
        await setCode(data.code);
        return { type: "CODE_SET", ok: true };
      } catch (err) {
        return { type: "CODE_SET", ok: false, error: err.message };
      }
    }
    if (data.type === "GET_CODE") {
      try {
        return { type: "CODE", code: await getCode() };
      } catch (err) {
        return { type: "CODE", error: err.message };
      }
    }
    return null;
  }

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (event.origin !== location.origin || !data || data.src !== SRC) return;
    const reply = await handle(data);
    if (reply) window.postMessage({ src: SRC, id: data.id, ...reply }, location.origin);
  });
})();
