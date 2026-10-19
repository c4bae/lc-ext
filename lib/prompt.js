// Builds the Claude quiz prompt for an Accepted job and decides how to deliver
// it: prefilled via claude.ai/new?q=, or via the clipboard when the URL would
// be too long.
(function (root) {
  const { fenceFor } = typeof module === "object" && module.exports ? require("./languages.js") : root.NQ;

  const CLAUDE_NEW_URL = "https://claude.ai/new";
  const MAX_URL_LENGTH = 8000;

  // A fence one backtick longer than the longest backtick run in the code, so
  // code containing ``` can't close the block early.
  function fenced(code, tag) {
    const longestRun = Math.max(0, ...(code.match(/`+/g) || []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${fence}${tag}\n${code.replace(/\n+$/, "")}\n${fence}`;
  }

  function buildPrompt(job, { includeDescription = true } = {}) {
    const description = includeDescription && job.description
      ? `Problem description:\n${job.description.trim()}\n\n`
      : "";
    return `I just got Accepted on a LeetCode problem and want you to quiz me on it.

Problem: ${job.title} (${job.url})
Language: ${job.language}

${description}My code:
${fenced(job.code, fenceFor(job.language))}

Run the quiz one step at a time, waiting for my reply after each:
1. Ask me to explain my approach in my own words. Don't describe it for me.
2. Ask for the time complexity, then the space complexity. Don't hint at the answers.
3. Tell me whether each is correct. If I'm wrong, explain why briefly.
4. Give a clear YES or NO on whether my solution is the most optimal known approach. If NO, name the better approach and its time/space complexity, but don't write the full code unless I ask.`;
  }

  // Returns { url, prompt, viaClipboard }. Tries the prompt with the problem
  // description, then without it; if neither fits in a URL, the full prompt
  // goes to the clipboard and Claude opens empty.
  function claudeLaunch(job) {
    const variants = job.description ? [true, false] : [false];
    for (const includeDescription of variants) {
      const prompt = buildPrompt(job, { includeDescription });
      const url = `${CLAUDE_NEW_URL}?q=${encodeURIComponent(prompt)}`;
      if (url.length <= MAX_URL_LENGTH) return { url, prompt, viaClipboard: false };
    }
    return { url: CLAUDE_NEW_URL, prompt: buildPrompt(job), viaClipboard: true };
  }

  const api = { CLAUDE_NEW_URL, MAX_URL_LENGTH, buildPrompt, claudeLaunch };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NQ = Object.assign(root.NQ || {}, api);
})(globalThis);
