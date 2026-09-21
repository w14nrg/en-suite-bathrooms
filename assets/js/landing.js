(function () {
  "use strict";

  const ADS_CONVERSIONS = Object.freeze({
    directWhatsApp: "AW-18401275072/KIa5CNT-oPAcEMDZtMZE"
  });

  function trackAdsConversion(destination) {
    if (!window.EnsuitePrivacy?.hasOptionalConsent?.()) return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", { send_to: destination });
  }

  function bindDirectWhatsAppTracking() {
    if (document.documentElement.dataset.adsWhatsAppBound) return;
    document.documentElement.dataset.adsWhatsAppBound = "true";
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a[href*="wa.me/"]');
      if (link) trackAdsConversion(ADS_CONVERSIONS.directWhatsApp);
    }, { capture: true });
  }

  function bindMobileMenu() {
    const button = document.getElementById("menuButton");
    const menu = document.getElementById("mobileMenu");
    if (!button || !menu) return;

    button.addEventListener("click", function () {
      const isOpen = menu.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    });
  }

  function addPrivacyFooterLink() {
    const bottom = document.querySelector(".footer-bottom");
    if (!bottom || bottom.querySelector("[data-privacy-link]")) return;
    const item = document.createElement("span");
    item.innerHTML = '<a data-privacy-link href="privacy-policy.html" style="color:inherit">Privacy &amp; Cookies</a>';
    bottom.appendChild(item);
  }


  function start() {
    addPrivacyFooterLink();
    bindMobileMenu();
    bindDirectWhatsAppTracking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
