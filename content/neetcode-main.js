// MAIN world on neetcode.io. NeetCode bundles Monaco with webpack and does not
// expose window.monaco, so this script reaches into the webpack module registry
// to read the editor, and to look up the LeetCode slug in NeetCode's bundled
// problem list. Answers GET_PROBLEM from content/neetcode.js.
(() => {
  const SRC = "nq";
  const MAIN_EDITOR_SELECTOR = ".my-code-editor .monaco-editor[data-uri]";

  let webpackRequire = null;
  let monaco = null;
  let problemListModuleId = null;

  function getWebpackRequire() {
    if (webpackRequire) return webpackRequire;
    const chunkKey = "webpackChunkangular_client" in window
      ? "webpackChunkangular_client"
      : Object.keys(window).find((k) => k.startsWith("webpackChunk"));
    if (!chunkKey) throw new Error("webpack runtime not found on NeetCode");
    // A chunk entry's third element is a runtime callback that webpack calls
    // with its require function.
    window[chunkKey].push([[Symbol("nq")], {}, (req) => { webpackRequire = req; }]);
    if (!webpackRequire) throw new Error("could not obtain webpack require");
    return webpackRequire;
  }

  // Module ids change on every NeetCode build, so modules are found by content.
  function findModuleIds(predicate) {
    const req = getWebpackRequire();
    return Object.keys(req.m).filter((id) => predicate(req.m[id].toString()));
  }

  function getMonaco() {
    if (monaco) return monaco;
    const req = getWebpackRequire();
    const candidates = findModuleIds((src) => src.includes("getModels") && src.includes("CancellationTokenSource"));
    for (const id of candidates) {
      const exports = req(id);
      if (exports && exports.editor && typeof exports.editor.getModels === "function") {
        monaco = exports;
        return monaco;
      }
    }
    throw new Error("Monaco module not found on NeetCode");
  }

  function readEditorCode() {
    const editorEl = document.querySelector(MAIN_EDITOR_SELECTOR);
    if (!editorEl) throw new Error("NeetCode code editor not found");
    const uri = editorEl.getAttribute("data-uri");
    const model = getMonaco().editor.getModels().find((m) => m.uri.toString() === uri);
    if (!model) throw new Error(`No Monaco model for ${uri}`);
    return model.getValue();
  }

  // The problem list is an array of flat object literals in a webpack module, e.g.
  // {problem:"Two Sum",...,link:"two-sum/",...,ncLink:"two-integer-sum/"}.
  // Returns the LeetCode slug from `link`, or null if the problem isn't listed.
  function lookupLeetCodeSlug(neetcodeSlug) {
    const req = getWebpackRequire();
    const needle = `ncLink:"${neetcodeSlug}/"`;
    if (problemListModuleId === null) {
      problemListModuleId = findModuleIds((src) => src.includes("ncLink:"))[0] ?? "";
    }
    if (!problemListModuleId) return null;
    const src = req.m[problemListModuleId].toString();
    const at = src.indexOf(needle);
    if (at < 0) return null;
    const entry = src.slice(src.lastIndexOf("{", at), src.indexOf("}", at) + 1);
    const match = entry.match(/[{,]link:"([^"]+)"/);
    return match ? match[1].replace(/\/+$/, "") : null;
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.origin !== location.origin || !data || data.src !== SRC) return;
    if (data.type !== "GET_PROBLEM") return;

    const reply = { src: SRC, type: "PROBLEM", id: data.id };
    try {
      reply.code = readEditorCode();
    } catch (err) {
      reply.error = err.message;
    }
    try {
      reply.leetcodeSlug = lookupLeetCodeSlug(data.neetcodeSlug);
    } catch (err) {
      // Slug lookup is best effort: the caller falls back to the NeetCode slug.
      console.warn("[lc-ext] slug lookup failed:", err);
      reply.leetcodeSlug = null;
    }
    window.postMessage(reply, location.origin);
  });
})();
