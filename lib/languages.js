// NeetCode language name -> LeetCode dropdown label, plus the Markdown fence tag
// used in the Claude prompt. Entries with neetcode: null exist only on LeetCode
// (used when the quiz starts from a LeetCode page).
(function (root) {
  const LANGUAGES = [
    { neetcode: "Python", leetcode: "Python3", fence: "python" },
    { neetcode: "Java", leetcode: "Java", fence: "java" },
    { neetcode: "C++", leetcode: "C++", fence: "cpp" },
    { neetcode: "JavaScript", leetcode: "JavaScript", fence: "javascript" },
    { neetcode: "TypeScript", leetcode: "TypeScript", fence: "typescript" },
    { neetcode: "C#", leetcode: "C#", fence: "csharp" },
    { neetcode: "Go", leetcode: "Go", fence: "go" },
    { neetcode: "Kotlin", leetcode: "Kotlin", fence: "kotlin" },
    { neetcode: "Swift", leetcode: "Swift", fence: "swift" },
    { neetcode: "Rust", leetcode: "Rust", fence: "rust" },
    { neetcode: null, leetcode: "Python", fence: "python" },
    { neetcode: null, leetcode: "C", fence: "c" },
    { neetcode: null, leetcode: "Ruby", fence: "ruby" },
    { neetcode: null, leetcode: "PHP", fence: "php" },
    { neetcode: null, leetcode: "Dart", fence: "dart" },
    { neetcode: null, leetcode: "Scala", fence: "scala" },
    { neetcode: null, leetcode: "Elixir", fence: "elixir" },
    { neetcode: null, leetcode: "Erlang", fence: "erlang" },
    { neetcode: null, leetcode: "Racket", fence: "racket" },
  ];

  // Returns the LeetCode dropdown label for a NeetCode language name, or null.
  function leetcodeLabelFor(neetcodeName) {
    const entry = LANGUAGES.find((l) => l.neetcode === neetcodeName);
    return entry ? entry.leetcode : null;
  }

  function isLeetCodeLabel(label) {
    return LANGUAGES.some((l) => l.leetcode === label);
  }

  // Returns the fence tag for a LeetCode label, or "" if unknown.
  function fenceFor(leetcodeLabel) {
    const entry = LANGUAGES.find((l) => l.leetcode === leetcodeLabel);
    return entry ? entry.fence : "";
  }

  const api = { LANGUAGES, leetcodeLabelFor, isLeetCodeLabel, fenceFor };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NQ = Object.assign(root.NQ || {}, api);
})(globalThis);
