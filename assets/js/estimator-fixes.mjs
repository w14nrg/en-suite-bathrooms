const STORAGE_KEY = "ensuites-bathrooms-planner-draft-4";
const RESPONSE_KEY = "bathroomEstimatorResponseIdV1";
const nativeFetch = window.fetch.bind(window);

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
  note.dataset.autoLinkHelp = "true";
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
    clearTimeout(timer);
    lastTriggered = "";
    timer = setTimeout(inspect, 100);
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    if (input.value.trim() !== lastTriggered) lastTriggered = "";
    if (validCompleteUrl(input.value)) timer = setTimeout(inspect, 500);
  });
}

function installLinkFixes() {
  const productUrl = document.querySelector("#productUrl");
  const tileLink = document.querySelector("#tileLink");
  bindAutomaticInspection(productUrl);
  bindAutomaticInspection(tileLink);
  addAutomaticLinkHelp(productUrl, "Paste the link — the item and displayed price will be checked automatically.");
  addAutomaticLinkHelp(tileLink, "Paste the link — the tile price per m² will be checked automatically.");
}

function installEstimatorStyles() {
  if (document.getElementById("estimatorRuntimeFixStyles")) return;
  const style = document.createElement("style");
  style.id = "estimatorRuntimeFixStyles";
  style.textContent = `
    .automatic-link-help{display:block;margin-top:7px;color:#6d675d;font-size:.8rem;line-height:1.45;font-weight:500}
    #threeSurface canvas{touch-action:none!important;overscroll-behavior:contain;-webkit-user-select:none;user-select:none}
    .mobile-3d-close{display:none}
    .estimator-ai-strip{width:min(1180px,calc(100% - 32px));margin:0 auto 22px;padding:16px 18px;border:1px solid rgba(184,145,33,.28);border-radius:18px;background:#fff;box-shadow:0 10px 32px rgba(35,29,20,.06);display:flex;align-items:center;justify-content:space-between;gap:18px}
    .estimator-ai-strip strong{display:block;font-size:1rem}.estimator-ai-strip span{display:block;color:#6a655d;font-size:.87rem;margin-top:2px}.estimator-ai-open{border:0;border-radius:999px;background:#d4af37;color:#19150e;padding:11px 17px;font-weight:800;cursor:pointer;white-space:nowrap}
    .estimator-ai-backdrop{position:fixed;inset:0;background:rgba(18,16,13,.36);z-index:1000006;opacity:0;pointer-events:none;transition:opacity .2s}.estimator-ai-backdrop.is-open{opacity:1;pointer-events:auto}
    .estimator-ai-sheet{position:fixed;z-index:1000007;right:18px;bottom:18px;width:min(390px,calc(100vw - 36px));height:min(680px,calc(100dvh - 36px));background:#fff;border:1px solid rgba(184,145,33,.3);border-radius:24px;box-shadow:0 30px 90px rgba(0,0,0,.25);display:flex;flex-direction:column;transform:translateY(calc(100% + 40px));transition:transform .24s ease;overflow:hidden}.estimator-ai-sheet.is-open{transform:translateY(0)}
    .estimator-ai-head{display:flex;align-items:center;justify-content:space-between;padding:17px 18px;border-bottom:1px solid #ebe4d8;background:#fffaf0}.estimator-ai-head strong{display:block}.estimator-ai-head small{color:#756d61}.estimator-ai-close{width:38px;height:38px;border:0;border-radius:50%;background:#fff;cursor:pointer;font-size:1.2rem}
    .estimator-ai-prompts{display:flex;gap:8px;padding:12px 14px;overflow-x:auto;border-bottom:1px solid #eee7db}.estimator-ai-prompts button{border:1px solid #d9c995;background:#fff;border-radius:999px;padding:8px 11px;white-space:nowrap;font-size:.8rem;cursor:pointer}
    .estimator-ai-log{flex:1;overflow:auto;padding:16px;background:#faf7f1;display:flex;flex-direction:column;gap:10px}.estimator-ai-bubble{max-width:88%;padding:11px 13px;border-radius:16px;line-height:1.5;font-size:.91rem;white-space:pre-wrap}.estimator-ai-bubble.ai{background:#fff;border:1px solid #e8dfd2;align-self:flex-start}.estimator-ai-bubble.user{background:#242019;color:#fff;align-self:flex-end}.estimator-ai-bubble.error{background:#fff0ed;color:#8a2e20;border:1px solid #efc6bd;align-self:flex-start}
    .estimator-ai-compose{padding:12px;border-top:1px solid #e7dfd3;background:#fff;display:grid;grid-template-columns:1fr auto;gap:9px}.estimator-ai-compose textarea{min-height:48px;max-height:120px;resize:vertical;border:1px solid #d8d0c4;border-radius:14px;padding:11px 12px;font:inherit}.estimator-ai-send{border:0;border-radius:14px;background:#d4af37;padding:0 16px;font-weight:800;cursor:pointer}
    @media(max-width:760px){
      .estimator-ai-strip{align-items:flex-start;margin-bottom:16px;padding:14px}.estimator-ai-strip span{font-size:.8rem}.estimator-ai-open{padding:10px 13px;font-size:.82rem}
      .estimator-ai-sheet{left:0;right:0;bottom:0;width:100%;height:min(72dvh,650px);border-radius:24px 24px 0 0}.estimator-ai-backdrop{bottom:0}
      body.mobile-3d-view{overflow:hidden!important}body.mobile-3d-view #threeSurface{position:fixed!important;inset:0!important;z-index:1000002!important;display:block!important;width:100vw!important;height:100dvh!important;min-height:100dvh!important;border-radius:0!important;background:#f1eee8!important;padding:0!important}body.mobile-3d-view #threeSurface canvas{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}body.mobile-3d-view #threeSurface .three-help{position:absolute;z-index:3;top:calc(14px + env(safe-area-inset-top));left:14px;right:64px;margin:0;padding:10px 12px;border-radius:13px;background:rgba(255,255,255,.92);box-shadow:0 8px 28px rgba(0,0,0,.12);font-size:.8rem;line-height:1.35}body.mobile-3d-view .mobile-3d-close{display:grid;position:fixed;z-index:1000004;top:calc(12px + env(safe-area-inset-top));right:12px;width:44px;height:44px;place-items:center;border:0;border-radius:50%;background:#fff;color:#222;box-shadow:0 8px 26px rgba(0,0,0,.2);font-size:1.15rem}body.mobile-3d-view #rotate3d{z-index:4;bottom:calc(18px + env(safe-area-inset-bottom))}
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

  const mobile = () => matchMedia("(max-width:760px)").matches;
  const shut = () => {
    document.body.classList.remove("mobile-3d-view");
    setTimeout(() => dispatchEvent(new Event("resize")), 80);
  };
  view3d.addEventListener("click", () => setTimeout(() => {
    if (mobile()) {
      document.body.classList.add("mobile-3d-view");
      dispatchEvent(new Event("resize"));
    }
  }, 30));
  view2d.addEventListener("click", shut);
  close.addEventListener("click", () => { view2d.click(); shut(); });
  addEventListener("resize", () => { if (!mobile()) shut(); });

  new MutationObserver(() => {
    const canvas = surface.querySelector("canvas");
    if (canvas) {
      canvas.style.touchAction = "none";
      canvas.setAttribute("aria-description", "One finger turns the room. Pinch to zoom. Use two fingers to move the view.");
    }
  }).observe(surface, { childList: true, subtree: true });
}

function estimatorContext() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    saved = {};
  }
  const objects = Array.isArray(saved.objects) ? saved.objects.map((item) => ({
    type: item.family,
    name: item.metadata?.productName || item.family,
    dimensions: item.dimensions,
    price: item.price,
    retailer: item.metadata?.retailer || "",
    link: item.metadata?.url || "",
    position: item.position,
  })) : [];
  return {
    source: "Website bathroom estimator",
    projectType: saved.route || "bathroom",
    room: saved.room || null,
    proposedEnSuite: saved.zone || null,
    productsAndFittings: objects,
    tiling: saved.tiling || null,
    visibleEstimate: document.querySelector("#estimateTotal")?.textContent?.trim() || "",
    warning: document.querySelector("#plannerWarning:not([hidden])")?.textContent?.trim() || "",
  };
}

function installAiAssistant() {
  if (document.querySelector("[data-estimator-ai-strip]")) return;
  const heading = document.querySelector(".planner-heading");
  if (!heading) return;

  const strip = document.createElement("section");
  strip.className = "estimator-ai-strip";
  strip.dataset.estimatorAiStrip = "true";
  strip.innerHTML = `<div><strong>Need help with your estimate?</strong><span>Ask about measurements, layout, products, tiles or what to add next.</span></div><button type="button" class="estimator-ai-open"><i class="fa-solid fa-sparkles" aria-hidden="true"></i> Ask assistant</button>`;
  heading.insertAdjacentElement("afterend", strip);

  const backdrop = document.createElement("div");
  backdrop.className = "estimator-ai-backdrop";
  const sheet = document.createElement("aside");
  sheet.className = "estimator-ai-sheet";
  sheet.setAttribute("aria-label", "Bathroom estimator assistant");
  sheet.innerHTML = `
    <div class="estimator-ai-head"><div><strong>Bathroom Assistant</strong><small>Help with this estimate</small></div><button type="button" class="estimator-ai-close" aria-label="Close assistant">×</button></div>
    <div class="estimator-ai-prompts"><button type="button" data-ai-prompt="What should I do next in this estimate?">What next?</button><button type="button" data-ai-prompt="Review my current room and fittings. What important measurements or items may be missing?">Check my plan</button><button type="button" data-ai-prompt="Review the product links and tiles I have added. Are there likely compatibility issues or missing parts?">Review products</button></div>
    <div class="estimator-ai-log" aria-live="polite"><div class="estimator-ai-bubble ai">Ask me about this room, the items you have added, tile choices or the current estimate. I will use what is already saved in the estimator.</div></div>
    <div class="estimator-ai-compose"><textarea placeholder="Ask about your estimate…" aria-label="Question for bathroom assistant"></textarea><button type="button" class="estimator-ai-send">Ask</button></div>`;
  document.body.append(backdrop, sheet);

  const log = sheet.querySelector(".estimator-ai-log");
  const input = sheet.querySelector("textarea");
  const send = sheet.querySelector(".estimator-ai-send");
  let responseId = sessionStorage.getItem(RESPONSE_KEY) || "";

  const open = () => {
    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
    setTimeout(() => input.focus(), 120);
  };
  const close = () => {
    backdrop.classList.remove("is-open");
    sheet.classList.remove("is-open");
  };
  strip.querySelector(".estimator-ai-open").addEventListener("click", open);
  sheet.querySelector(".estimator-ai-close").addEventListener("click", close);
  backdrop.addEventListener("click", close);

  const bubble = (text, type = "ai") => {
    const item = document.createElement("div");
    item.className = `estimator-ai-bubble ${type}`;
    item.textContent = text;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
    return item;
  };

  const ask = async (question) => {
    const message = String(question || input.value || "").trim();
    if (!message || send.disabled) return;
    bubble(message, "user");
    input.value = "";
    send.disabled = true;
    const waiting = bubble("Checking your estimate…", "ai");
    try {
      const response = await nativeFetch(`${AI_ENDPOINT}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, project: estimatorContext(), previousResponseId: responseId, imageDataUrl: "" }),
      });
      const data = await response.json();
      waiting.remove();
      if (!response.ok) throw new Error(data.error || "The assistant is temporarily unavailable.");
      responseId = data.responseId || responseId;
      if (responseId) sessionStorage.setItem(RESPONSE_KEY, responseId);
      bubble(data.reply || "I could not produce an answer to that question.", "ai");
    } catch (error) {
      waiting.remove();
      bubble(error.message || "The assistant is temporarily unavailable.", "error");
    } finally {
      send.disabled = false;
    }
  };

  send.addEventListener("click", () => ask());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  });
  sheet.querySelectorAll("[data-ai-prompt]").forEach((button) => button.addEventListener("click", () => ask(button.dataset.aiPrompt)));
}

function renameEstimator() {
  document.title = "Bathroom & En-Suite Cost Estimator | En-Suites & Bathrooms";
  document.querySelectorAll("a").forEach((link) => {
    if (link.pathname === "/estimator/" && /planner/i.test(link.textContent)) link.textContent = "Estimator";
  });
  const kicker = document.querySelector(".planner-heading .planner-kicker");
  if (kicker) kicker.textContent = "Bathroom & en-suite estimator";
}

function start() {
  installEstimatorStyles();
  renameEstimator();
  installLinkFixes();
  installMobile3D();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
