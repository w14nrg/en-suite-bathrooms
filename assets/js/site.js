(function () {
  "use strict";

  const HELPER_HOST = "en-suite-bathrooms.nicholas-griffith-uk.workers.dev";
  const HELPER_SRC = `https://${HELPER_HOST}/widget.js`;
  const TAWK_PATTERN = /(?:embed\.tawk\.to|tawk\.to|Tawk_API|Tawk_LoadStart)/i;

  function blockTawk() {
    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function protectedInsertBefore(node, reference) {
      const source = node?.src || node?.textContent || "";
      if (node?.nodeName === "SCRIPT" && TAWK_PATTERN.test(source)) return node;
      return originalInsertBefore.call(this, node, reference);
    };

    const remove = () => {
      document.querySelectorAll("script, iframe").forEach((node) => {
        const source = node.src || node.textContent || "";
        if (TAWK_PATTERN.test(source)) node.remove();
      });
      try {
        delete window.Tawk_API;
        delete window.Tawk_LoadStart;
      } catch {
        window.Tawk_API = undefined;
        window.Tawk_LoadStart = undefined;
      }
    };

    const observer = new MutationObserver(remove);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    remove();
    window.setTimeout(() => {
      remove();
      observer.disconnect();
      Node.prototype.insertBefore = originalInsertBefore;
    }, 3500);
  }

  function rewritePlannerLinks() {
    document.querySelectorAll("a[href]").forEach((link) => {
      const raw = link.getAttribute("href") || "";
      let path = raw;
      try {
        path = new URL(raw, location.href).pathname;
      } catch {
        // Keep the raw value for relative-link matching.
      }
      if (!/(^|\/)planner(?:\.html)?\/?$/i.test(path)) return;
      link.setAttribute("href", "/estimator/");
      const text = link.textContent.trim();
      if (/project\s*planner/i.test(text)) link.textContent = "Bathroom Estimator";
      else if (/ai\s*bathroom\s*planner/i.test(text)) link.textContent = "Bathroom Estimator";
      else if (/ai\s*planner/i.test(text)) link.textContent = "Estimator";
      else if (/planner/i.test(text)) link.textContent = "Estimator";
      link.dataset.estimatorLinkUpdated = "true";
    });
  }

  function addEstimatorNavigation() {
    const makeLink = (className = "") => {
      const link = document.createElement("a");
      link.href = "/estimator/";
      link.textContent = "Estimator";
      link.dataset.estimatorNav = "true";
      if (className) link.className = className;
      return link;
    };

    const desktop = document.querySelector(".desktop-nav");
    if (desktop && !desktop.querySelector('[data-estimator-nav="true"]') && ![...desktop.links].some((link) => link.pathname === "/estimator/")) {
      desktop.insertBefore(makeLink(), desktop.querySelector(".nav-cta") || null);
    }

    const mobile = document.getElementById("mobileMenu");
    if (mobile && !mobile.querySelector('[data-estimator-nav="true"]') && ![...mobile.querySelectorAll("a")].some((link) => link.pathname === "/estimator/")) {
      const sample = mobile.querySelector("a");
      const link = makeLink(sample?.className || "");
      mobile.insertBefore(link, mobile.querySelector(".mobile-actions") || null);
    }
  }

  function ensureOwnHelper() {
    if ([...document.scripts].some((script) => script.src === HELPER_SRC)) return;
    const script = document.createElement("script");
    script.src = HELPER_SRC;
    script.dataset.api = `https://${HELPER_HOST}`;
    script.dataset.whatsapp = "442073860000";
    script.dataset.ensuiteOwnHelper = "true";
    script.defer = true;
    document.body.appendChild(script);
  }

  function installHelperSpacing() {
    if (document.getElementById("ensuiteHelperSpacing")) return;
    const style = document.createElement("style");
    style.id = "ensuiteHelperSpacing";
    style.textContent = `
      @media (max-width:760px){
        body{padding-bottom:calc(62px + env(safe-area-inset-bottom))}
        .mobile-bar{z-index:1000000!important}
        iframe[src*="${HELPER_HOST}"]{bottom:calc(74px + env(safe-area-inset-bottom))!important;max-height:calc(100dvh - 100px)!important}
      }
    `;
    document.head.appendChild(style);

    const position = () => {
      if (!matchMedia("(max-width:760px)").matches) return;
      const candidates = document.querySelectorAll(`iframe[src*="${HELPER_HOST}"], [data-ensuite-chat], [class*="chat" i], [id*="chat" i]`);
      candidates.forEach((candidate) => {
        if (candidate.closest?.(".mobile-bar, .estimator-ai-sheet")) return;
        let fixed = candidate;
        let node = candidate;
        while (node && node !== document.body) {
          if (getComputedStyle(node).position === "fixed") fixed = node;
          node = node.parentElement;
        }
        if (!fixed || fixed === document.body) return;
        fixed.style.setProperty("bottom", "calc(74px + env(safe-area-inset-bottom))", "important");
        fixed.style.setProperty("max-height", "calc(100dvh - 100px)", "important");
        fixed.style.setProperty("z-index", "999999", "important");
      });
    };

    new MutationObserver(position).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("resize", position);
    setTimeout(position, 700);
    setTimeout(position, 1800);
  }

  function loadEstimatorFixes() {
    if (!location.pathname.startsWith("/estimator") || document.querySelector("script[data-estimator-fixes]")) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/assets/js/estimator-fixes.mjs?v=20260731b";
    script.dataset.estimatorFixes = "true";
    document.head.appendChild(script);
  }

  function addGoogleMapAndReviews() {
    if (document.querySelector("[data-google-proof]")) return;
    const heading = [...document.querySelectorAll("h2")].find((item) => item.textContent.trim() === "287 Munster Road, Fulham");
    const section = heading?.closest("section");
    const split = section?.querySelector(".wrap.split");
    if (!split) return;

    const profileUrl = "https://share.google/QFVpxoFee1432NcWg";
    const mapUrl = "https://www.google.com/maps?q=En-Suites+%26+Bathrooms+Ltd%2C+287+Munster+Road%2C+London+SW6+6BW&output=embed";
    const style = document.createElement("style");
    style.id = "googleProofStyles";
    style.textContent = `
      .google-proof{display:block}.google-location-intro{max-width:920px;margin:0 0 clamp(24px,4vw,38px)}
      .google-location-intro h2{margin:0;font-size:clamp(1.85rem,3.6vw,3rem)}
      .google-proof-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);gap:clamp(24px,4vw,52px);align-items:stretch}
      .google-map-card,.google-reviews-panel{background:#fff;border:1px solid rgba(212,175,55,.28);border-radius:28px;overflow:hidden;box-shadow:0 20px 55px rgba(20,20,20,.08)}
      .google-map-card{position:relative;min-height:500px}.google-map-card iframe{display:block;width:100%;height:100%;min-height:500px;border:0}
      .google-map-link{position:absolute;left:18px;bottom:18px;display:inline-flex;align-items:center;gap:9px;padding:12px 17px;border-radius:999px;background:#fff;color:#202124;font-weight:700;box-shadow:0 8px 28px rgba(0,0,0,.2);text-decoration:none}
      .google-reviews-panel{padding:clamp(28px,4vw,48px);display:flex;flex-direction:column;justify-content:center;min-width:0}.google-reviews-panel h2{margin-bottom:10px}.google-reviews-intro{color:#686868;line-height:1.7;margin:0 0 24px}
      .google-review-window{overflow:hidden}.google-review-track{display:flex;transition:transform .55s ease}.google-review{min-width:100%;padding:4px 2px;display:flex}.google-review-card{width:100%;border:1px solid rgba(212,175,55,.25);border-radius:22px;background:#fbf7f0;padding:28px}
      .google-review-stars{color:#d4af37;letter-spacing:.13em;font-size:1.3rem;margin-bottom:18px}.google-review-card h3{font-family:'Playfair Display',serif;font-size:clamp(1.55rem,2.6vw,2rem);font-weight:400;margin:0 0 12px}.google-review-card p{color:#505050;line-height:1.7;margin:0}.google-review-source{display:flex;align-items:center;gap:9px;margin-top:22px;color:#444;font-size:.92rem;font-weight:700}.google-review-source i{color:#4285f4}
      .google-review-controls{display:flex;justify-content:space-between;gap:16px;margin-top:18px}.google-review-arrows,.google-review-dots{display:flex;gap:9px;align-items:center}.google-review-arrow{width:42px;height:42px;border-radius:50%;border:1px solid rgba(212,175,55,.4);background:#fff;cursor:pointer}.google-review-dot{width:10px;height:10px;border:0;border-radius:50%;background:#d7d2c8;padding:0}.google-review-dot.is-active{background:#d4af37}.google-review-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:25px}
      @media(max-width:900px){.google-proof-grid{grid-template-columns:1fr}.google-map-card,.google-map-card iframe{min-height:390px}}@media(max-width:520px){.google-map-card,.google-reviews-panel{border-radius:22px}.google-map-card,.google-map-card iframe{min-height:340px}.google-reviews-panel{padding:26px 20px}.google-review-card{padding:24px 20px}}
    `;
    document.head.appendChild(style);

    split.className = "wrap google-proof";
    split.dataset.googleProof = "true";
    split.innerHTML = `
      <div class="google-location-intro"><p class="kicker">Fulham high street</p><h2>Visit us at our high street shop at 287 Munster Road, SW6 6BW</h2></div>
      <div class="google-proof-grid">
        <div class="google-map-card"><iframe src="${mapUrl}" title="Google map showing En-Suites & Bathrooms Ltd at 287 Munster Road, Fulham" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe><a class="google-map-link" href="${profileUrl}" target="_blank" rel="noopener"><i class="fa-solid fa-location-arrow"></i> View on Google Maps</a></div>
        <div class="google-reviews-panel"><p class="kicker">Customer feedback</p><h2>5★ Google Reviews</h2><p class="google-reviews-intro">What our customers say about their completed bathrooms.</p>
          <div class="google-review-window"><div class="google-review-track" data-review-track>
            <article class="google-review"><div class="google-review-card"><div class="google-review-stars">★★★★★</div><h3>Gemma</h3><p>Great price.<br><br>Absolutely fantastic, could not recommend highly enough, delighted with our new bathroom.</p><div class="google-review-source"><i class="fa-brands fa-google"></i> Posted on Google</div></div></article>
            <article class="google-review"><div class="google-review-card"><div class="google-review-stars">★★★★★</div><h3>Jamie</h3><p>From start to finish, their service was exceptional. Their team took the time to understand my vision for a modern, functional bathroom and provided expert advice that enhanced the design while staying within my budget. The craftsmanship was impeccable, with every detail meticulously executed, from the sleek tiling to the flawless plumbing work.</p><div class="google-review-source"><i class="fa-brands fa-google"></i> Posted on Google</div></div></article>
            <article class="google-review"><div class="google-review-card"><div class="google-review-stars">★★★★★</div><h3>Chris</h3><p>I recently had a full bathroom renovation carried out and I’m really pleased with the whole experience. From the first conversation through to the finished result, everything was explained clearly and the help and guidance throughout made a big difference.<br><br>They were easy to deal with, kept everything organised, and made the process feel much less stressful than I expected. The bathroom now looks great and the workmanship is excellent. I’d happily recommend them to anyone thinking about having their bathroom done.</p><div class="google-review-source"><i class="fa-brands fa-google"></i> Posted on Google</div></div></article>
          </div></div>
          <div class="google-review-controls"><div class="google-review-arrows"><button class="google-review-arrow" type="button" data-review-prev aria-label="Previous review">‹</button><button class="google-review-arrow" type="button" data-review-next aria-label="Next review">›</button></div><div class="google-review-dots"><button class="google-review-dot is-active" data-review-dot="0" aria-label="Gemma review"></button><button class="google-review-dot" data-review-dot="1" aria-label="Jamie review"></button><button class="google-review-dot" data-review-dot="2" aria-label="Chris review"></button></div></div>
          <div class="google-review-actions"><a class="btn btn-gold" href="${profileUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-google"></i> Read our Google reviews</a><a class="btn btn-light" href="tel:+442073860000"><i class="fa-solid fa-phone"></i> Call 0207 386 0000</a></div>
        </div>
      </div>`;

    const track = split.querySelector("[data-review-track]");
    const dots = [...split.querySelectorAll("[data-review-dot]")];
    let current = 0;
    let timer;
    const show = (index) => {
      current = (index + 3) % 3;
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === current));
    };
    const start = () => {
      clearInterval(timer);
      if (!matchMedia("(prefers-reduced-motion:reduce)").matches) timer = setInterval(() => show(current + 1), 6000);
    };
    split.querySelector("[data-review-prev]").addEventListener("click", () => { show(current - 1); start(); });
    split.querySelector("[data-review-next]").addEventListener("click", () => { show(current + 1); start(); });
    dots.forEach((dot) => dot.addEventListener("click", () => { show(Number(dot.dataset.reviewDot)); start(); }));
    start();
  }

  function bindPageControls() {
    const button = document.getElementById("menuButton");
    const menu = document.getElementById("mobileMenu");
    if (button && menu && !button.dataset.menuBound) {
      button.dataset.menuBound = "true";
      button.addEventListener("click", () => {
        menu.classList.toggle("open");
        button.setAttribute("aria-expanded", String(menu.classList.contains("open")));
      });
    }

    const modal = document.getElementById("offerModal");
    const open = document.getElementById("offerOpen");
    const close = document.getElementById("offerClose");
    if (modal && open) {
      open.addEventListener("click", () => modal.classList.add("open"));
      close?.addEventListener("click", () => modal.classList.remove("open"));
      modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.remove("open"); });
    }

    const form = document.getElementById("enquiryForm");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const text = ["Hello, I would like to discuss a project.", `Name: ${data.get("name") || ""}`, `Area/postcode: ${data.get("postcode") || ""}`, `Project: ${data.get("project") || ""}`, `Budget: ${data.get("budget") || ""}`, `Details: ${data.get("details") || ""}`].join("\n");
        window.open(`https://wa.me/442073860000?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      });
    }

    const calculator = document.getElementById("rentCalculator");
    if (calculator && !calculator.dataset.bound) {
      calculator.dataset.bound = "true";
      calculator.addEventListener("submit", (event) => {
        event.preventDefault();
        const current = Number(document.getElementById("currentRent")?.value || 0);
        const ensuite = Number(document.getElementById("ensuiteRent")?.value || 0);
        const cost = Number(document.getElementById("installCost")?.value || 0);
        const monthly = Math.max(0, ensuite - current);
        const annual = monthly * 12;
        document.getElementById("calcMonthly").textContent = `£${monthly.toLocaleString()}`;
        document.getElementById("calcAnnual").textContent = `£${annual.toLocaleString()}`;
        document.getElementById("calcFive").textContent = `£${(annual * 5).toLocaleString()}`;
        document.getElementById("calcPayback").textContent = annual > 0 ? `${(cost / annual).toFixed(1)} years` : "—";
        document.getElementById("calcResults").hidden = false;
      });
    }
  }

  function start() {
    blockTawk();
    rewritePlannerLinks();
    addEstimatorNavigation();
    addGoogleMapAndReviews();
    installHelperSpacing();
    loadEstimatorFixes();
    bindPageControls();
    ensureOwnHelper();

    const observer = new MutationObserver(() => rewritePlannerLinks());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
