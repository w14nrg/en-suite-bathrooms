const PREVIEW_ENDPOINT = "/api/product-preview-v2";
const nativeFetch = window.fetch.bind(window);

function parsedRequestUrl(input) {
  try {
    if (input instanceof Request) return new URL(input.url, window.location.href);
    return new URL(String(input), window.location.href);
  } catch {
    return null;
  }
}

function sameUrl(left, right) {
  try {
    return new URL(left, window.location.href).href === new URL(right, window.location.href).href;
  } catch {
    return String(left || "").trim() === String(right || "").trim();
  }
}

function updatePriceUi(targetUrl, data, responseOk) {
  const tileLink = document.querySelector("#tileLink");
  const productLink = document.querySelector("#productUrl");

  if (tileLink && sameUrl(tileLink.value, targetUrl)) {
    const found = document.querySelector("#tilePriceFound");
    const manual = document.querySelector("#tileManualPrice");
    const input = document.querySelector("#tilePrice");

    if (responseOk && data?.ok && Number.isFinite(Number(data.price)) && String(data.unit || "").toLowerCase() === "sqm") {
      const price = Number(data.price).toFixed(2);
      if (input) input.value = price;
      if (found) {
        found.textContent = `Price found: £${price} per m²`;
        found.hidden = false;
      }
      if (manual) manual.hidden = true;
    } else {
      if (found) found.hidden = true;
      if (manual) manual.hidden = false;
    }
  }

  if (productLink && sameUrl(productLink.value, targetUrl) && !responseOk) {
    const manual = document.querySelector("#productManualPrice");
    if (manual) manual.hidden = false;
  }
}

window.fetch = async function estimatorFetch(input, init) {
  const requestUrl = parsedRequestUrl(input);
  if (!requestUrl || !requestUrl.pathname.endsWith("/api/product-preview")) {
    return nativeFetch(input, init);
  }

  const targetUrl = requestUrl.searchParams.get("url") || "";
  requestUrl.pathname = PREVIEW_ENDPOINT;
  const response = await nativeFetch(requestUrl.toString(), init);

  response.clone().json().then((data) => {
    requestAnimationFrame(() => updatePriceUi(targetUrl, data, response.ok));
  }).catch(() => {
    requestAnimationFrame(() => updatePriceUi(targetUrl, null, false));
  });

  return response;
};

function validCompleteUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addAutomaticLinkHelp(input, wording) {
  const label = input?.closest("label");
  if (!label || label.querySelector("[data-auto-link-help]")) return;
  const note = document.createElement("small");
  note.dataset.autoLinkHelp = "";
  note.className = "automatic-link-help";
  note.textContent = wording;
  label.appendChild(note);
}

function bindAutomaticInspection(input) {
  if (!input || input.dataset.autoInspectionBound) return;
  input.dataset.autoInspectionBound = "true";
  let timer = 0;
  let lastTriggered = "";

  const inspect = () => {
    const value = input.value.trim();
    if (!validCompleteUrl(value) || value === lastTriggered) return;
    lastTriggered = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  input.addEventListener("paste", () => {
    window.clearTimeout(timer);
    lastTriggered = "";
    timer = window.setTimeout(inspect, 80);
  });

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    if (input.value.trim() !== lastTriggered) lastTriggered = "";
    if (validCompleteUrl(input.value)) timer = window.setTimeout(inspect, 650);
  });
}

function installLinkFixes() {
  const productUrl = document.querySelector("#productUrl");
  const tileLink = document.querySelector("#tileLink");
  bindAutomaticInspection(productUrl);
  bindAutomaticInspection(tileLink);
  addAutomaticLinkHelp(productUrl, "The item and displayed price are checked automatically after you paste the link.");
  addAutomaticLinkHelp(tileLink, "The price per m² is checked automatically after you paste the link.");
}

function installEstimatorStyles() {
  if (document.querySelector("#estimatorRuntimeFixStyles")) return;
  const style = document.createElement("style");
  style.id = "estimatorRuntimeFixStyles";
  style.textContent = `
    .automatic-link-help{display:block;margin-top:7px;color:#6d675d;font-size:.8rem;line-height:1.45;font-weight:500}
    #threeSurface canvas{touch-action:none!important;overscroll-behavior:contain;-webkit-user-select:none;user-select:none}
    .mobile-3d-close{display:none}
    @media (max-width:760px){
      body.mobile-3d-view{overflow:hidden!important}
      body.mobile-3d-view #threeSurface{position:fixed!important;inset:0!important;z-index:1000002!important;display:block!important;width:100vw!important;height:100dvh!important;min-height:100dvh!important;border-radius:0!important;background:#f1eee8!important;padding:0!important}
      body.mobile-3d-view #threeSurface canvas{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
      body.mobile-3d-view #threeSurface .three-help{position:absolute;z-index:3;top:calc(14px + env(safe-area-inset-top));left:14px;right:64px;margin:0;padding:10px 12px;border-radius:13px;background:rgba(255,255,255,.92);box-shadow:0 8px 28px rgba(0,0,0,.12);font-size:.8rem;line-height:1.35}
      body.mobile-3d-view .mobile-3d-close{display:grid;position:fixed;z-index:1000004;top:calc(12px + env(safe-area-inset-top));right:12px;width:44px;height:44px;place-items:center;border:0;border-radius:50%;background:#fff;color:#222;box-shadow:0 8px 26px rgba(0,0,0,.2);font-size:1.15rem}
      body.mobile-3d-view #rotate3d{z-index:4;bottom:calc(18px + env(safe-area-inset-bottom))}
    }
  `;
  document.head.appendChild(style);
}

function installMobile3D() {
  const surface = document.querySelector("#threeSurface");
  const view3d = document.querySelector('[data-view="3d"]');
  const view2d = document.querySelector('[data-view="2d"]');
  if (!surface || !view3d || !view2d || surface.dataset.mobile3dBound) return;
  surface.dataset.mobile3dBound = "true";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "mobile-3d-close";
  close.setAttribute("aria-label", "Close full-screen 3D view");
  close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  document.body.appendChild(close);

  const mobile = () => window.matchMedia("(max-width:760px)").matches;
  const open = () => {
    if (!mobile()) return;
    document.body.classList.add("mobile-3d-view");
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
  };
  const shut = () => {
    document.body.classList.remove("mobile-3d-view");
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
  };

  view3d.addEventListener("click", () => window.setTimeout(open, 30));
  view2d.addEventListener("click", shut);
  close.addEventListener("click", () => {
    view2d.click();
    shut();
  });
  window.addEventListener("resize", () => {
    if (!mobile()) shut();
  });

  const canvasObserver = new MutationObserver(() => {
    const canvas = surface.querySelector("canvas");
    if (canvas) {
      canvas.style.touchAction = "none";
      canvas.setAttribute("aria-description", "One finger turns the room. Pinch to zoom. Use two fingers to move the view.");
    }
  });
  canvasObserver.observe(surface, { childList: true, subtree: true });
}

function start() {
  installEstimatorStyles();
  installLinkFixes();
  installMobile3D();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
