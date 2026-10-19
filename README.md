# neetcode-quiz

A Chrome extension (Manifest V3). Click **Submit + Quiz** on a NeetCode problem and it submits your solution to LeetCode. If LeetCode returns **Accepted**, a new Claude chat opens with a prompt that quizzes you on your approach, time and space complexity, and whether your solution is the most optimal known approach.

Nothing happens on any other verdict. The Claude message is prefilled, never sent: you press Enter.

## Install

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Log in to LeetCode and Claude in the same Chrome profile.

Requires Chrome 111 or newer (MAIN-world content scripts).

## Use

- **From NeetCode:** open a problem, write your solution, click **Submit + Quiz** (next to Submit). A LeetCode tab opens, switches to your language, pastes your code and submits it.
- **From LeetCode:** click **Submit + Quiz** next to LeetCode's Submit button to submit what is in the editor.

On Accepted, Claude opens next to the LeetCode tab. If the prompt is too long to fit in a URL (about 8,000 characters), it is copied to your clipboard instead, Claude opens empty, and a notification tells you to paste.

If you are logged out of LeetCode, you get a notification and nothing is submitted.

## How it works

```
neetcode.io/problems/<slug>
  content/neetcode.js        reads title, language; injects the button
  content/neetcode-main.js   (MAIN world) reads Monaco code, looks up the LeetCode slug
        | START_JOB
background/service-worker.js stores the job in chrome.storage.session, opens LeetCode
        | GET_JOB (from the tab it opened, once)
leetcode.com/problems/<slug>
  content/leetcode.js        switches language, clicks Submit, watches the verdict
  content/leetcode-main.js   (MAIN world) sets/gets the Monaco editor value
        | ACCEPTED (first one per job only)
background/service-worker.js builds the prompt (lib/prompt.js), opens claude.ai/new?q=...
```

| Message | From | Purpose |
| --- | --- | --- |
| `START_JOB` | neetcode.js | Store job, open LeetCode tab |
| `CREATE_JOB` | leetcode.js | Store job when starting on LeetCode |
| `GET_JOB` | leetcode.js | Claim the job opened for this tab |
| `ACCEPTED` | leetcode.js | Open Claude (or return the prompt for the clipboard) |
| `OPEN_CLAUDE` | leetcode.js | Open an empty Claude chat after copying the prompt |
| `NOTIFY` | content scripts | System notification |

Isolated and MAIN-world scripts talk over `window.postMessage` with `src: "nq"` and a request id (`lib/bridge.js`).

### Things that are not obvious

- **NeetCode does not expose `window.monaco`.** It bundles Monaco with webpack, so `neetcode-main.js` gets webpack's `require` by pushing a fake chunk onto `webpackChunkangular_client`, then finds the Monaco module by searching module sources. Module ids change every NeetCode build; the search does not depend on them.
- **NeetCode slugs often differ from LeetCode's** (`two-integer-sum` vs `two-sum`). NeetCode bundles its problem list with both (`link` and `ncLink`), and `neetcode-main.js` looks the slug up there. `lib/slugs.js` holds manual overrides, which win over the lookup.
- **LeetCode's login wall text is also in `__NEXT_DATA__`**, so login is detected by the wall's link inside `#editor`, never by page text.
- **LeetCode can overwrite the editor** with the new language's template after a language switch. `leetcode-main.js` keeps setting the code until it has stayed put for several polls.

## When LeetCode or NeetCode change their DOM

Every selector is a constant at the top of its file:

- `content/leetcode.js` `SELECTORS`: Submit button, language button, submission result, description, login wall.
- `content/neetcode.js` `SELECTORS`: Submit button, selected language, title.
- `content/neetcode-main.js` `MAIN_EDITOR_SELECTOR`.

## Tests

```
npm test
```

Unit tests (Node, no dependencies) cover the language and slug mapping, prompt building and the URL/clipboard decision, and the service worker's job flow and dedup with an in-memory `chrome` API.

## Manual test checklist

- [ ] Accepted solution -> Claude opens with the prompt prefilled
- [ ] Wrong Answer / TLE -> nothing opens
- [ ] Submitting twice quickly -> Claude opens only once per Accepted result
- [ ] Python and one other language both map correctly
- [ ] Logged-out LeetCode -> notification, no hang
- [ ] A very long solution -> clipboard fallback works
