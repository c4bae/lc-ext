// NeetCode slug -> LeetCode slug. Most mismatches (e.g. two-integer-sum -> two-sum)
// are resolved at runtime from NeetCode's own bundled problem list. Add entries
// here only for problems that lookup gets wrong or cannot find.
(function (root) {
  const SLUG_OVERRIDES = {};

  // Priority: manual override, then the slug NeetCode's problem list maps to,
  // then the NeetCode slug unchanged.
  function resolveLeetCodeSlug(neetcodeSlug, lookedUpSlug) {
    return SLUG_OVERRIDES[neetcodeSlug] || lookedUpSlug || neetcodeSlug;
  }

  const api = { SLUG_OVERRIDES, resolveLeetCodeSlug };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NQ = Object.assign(root.NQ || {}, api);
})(globalThis);
