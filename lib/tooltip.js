// Hover tooltip for the injected buttons, branded so it's clear the button comes
// from this extension and not from the site. Rendered in a shadow root so the
// host page's CSS cannot restyle it.
(function (root) {
  const EXTENSION_NAME = "c4bae's lc ext";
  const SHOW_DELAY_MS = 300;
  const GAP_PX = 8;
  const EDGE_PX = 8;

  let host = null;

  function bubble() {
    if (host && host.isConnected) return host.shadowRoot.querySelector(".tip");
    host = document.createElement("div");
    host.id = "nq-tooltip-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .tip { position: fixed; z-index: 2147483647; max-width: 280px; padding: 8px 10px;
               background: #1c1f24; color: #f0f3f6; border-radius: 6px;
               box-shadow: 0 4px 16px rgba(0,0,0,.35); pointer-events: none;
               font: 12px/1.45 system-ui, -apple-system, sans-serif;
               opacity: 0; transition: opacity .12s; }
        .tip.visible { opacity: 1; }
        .brand { display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
                 font-weight: 600; color: #9aa4af; font-size: 11px; }
        .brand img { width: 14px; height: 14px; border-radius: 3px; }
      </style>
      <div class="tip" role="tooltip">
        <div class="brand"><img alt=""><span></span></div>
        <div class="text"></div>
      </div>`;
    shadow.querySelector(".brand img").src = chrome.runtime.getURL("icons/icon48.png");
    shadow.querySelector(".brand span").textContent = EXTENSION_NAME;
    document.documentElement.appendChild(host);
    return shadow.querySelector(".tip");
  }

  // Above the target when there is room, otherwise below; kept inside the viewport.
  function place(tip, target) {
    const r = target.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const top = r.top - GAP_PX - height >= EDGE_PX ? r.top - GAP_PX - height : r.bottom + GAP_PX;
    const centered = r.left + r.width / 2 - width / 2;
    const left = Math.min(Math.max(centered, EDGE_PX), window.innerWidth - width - EDGE_PX);
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function attachTooltip(target, text) {
    target.setAttribute("aria-description", `${EXTENSION_NAME}: ${text}`);
    let timer = null;

    const hide = () => {
      clearTimeout(timer);
      timer = null;
      if (host?.isConnected) bubble().classList.remove("visible");
    };
    const show = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!target.isConnected) return;
        const tip = bubble();
        tip.querySelector(".text").textContent = text;
        place(tip, target);
        tip.classList.add("visible");
      }, SHOW_DELAY_MS);
    };

    target.addEventListener("mouseenter", show);
    target.addEventListener("mouseleave", hide);
    target.addEventListener("focus", () => target.matches(":focus-visible") && show());
    target.addEventListener("blur", hide);
    target.addEventListener("click", hide);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
  }

  root.NQ = Object.assign(root.NQ || {}, { attachTooltip });
})(globalThis);
