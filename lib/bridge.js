// Request/response over window.postMessage between an isolated-world content
// script and its MAIN-world counterpart (content/*-main.js). A reply carries the
// request's id. Messages from other origins (e.g. iframes) are ignored.
(function (root) {
  const SRC = "nq";

  function callMain(type, replyType, payload = {}, timeoutMs = 10000) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`${type}: no reply from page script within ${timeoutMs} ms`));
      }, timeoutMs);

      function onMessage(event) {
        const data = event.data;
        if (event.origin !== location.origin) return;
        if (!data || data.src !== SRC || data.id !== id || data.type !== replyType) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(data);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ src: SRC, type, id, ...payload }, location.origin);
    });
  }

  root.NQ = Object.assign(root.NQ || {}, { callMain });
})(globalThis);
