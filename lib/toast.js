// Small in-page notification for content scripts. Rendered in a shadow root so
// the host page's CSS cannot restyle it.
(function (root) {
  const COLORS = { info: "#2f6feb", success: "#1f883d", error: "#cf222e" };
  let host = null;

  function container() {
    if (host && host.isConnected) return host.shadowRoot.querySelector(".stack");
    host = document.createElement("div");
    host.id = "nq-toast-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .stack { position: fixed; right: 16px; top: 64px; z-index: 2147483647;
                 display: flex; flex-direction: column; gap: 8px; max-width: 360px;
                 font: 13px/1.4 system-ui, -apple-system, sans-serif; }
        .toast { background: #1c1f24; color: #f0f3f6; border-left: 4px solid;
                 border-radius: 6px; padding: 10px 12px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
        .title { font-weight: 600; margin-bottom: 2px; }
        button { margin-top: 8px; background: #f0f3f6; color: #1c1f24; border: 0;
                 border-radius: 4px; padding: 4px 10px; font: inherit; cursor: pointer; }
      </style>
      <div class="stack"></div>`;
    document.documentElement.appendChild(host);
    return shadow.querySelector(".stack");
  }

  // kind: "info" | "success" | "error". action: { label, onClick } adds a button.
  // durationMs: 0 keeps the toast until dismissed. Returns a dismiss function.
  function showToast(message, { kind = "info", durationMs = 6000, action } = {}) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.borderLeftColor = COLORS[kind] || COLORS.info;
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "NeetCode Quiz";
    const body = document.createElement("div");
    body.textContent = message;
    toast.append(title, body);

    const dismiss = () => toast.remove();
    if (action) {
      const button = document.createElement("button");
      button.textContent = action.label;
      button.addEventListener("click", () => {
        dismiss();
        action.onClick();
      });
      toast.append(button);
    }
    container().appendChild(toast);
    if (durationMs > 0) setTimeout(dismiss, durationMs);
    return dismiss;
  }

  root.NQ = Object.assign(root.NQ || {}, { showToast });
})(globalThis);
