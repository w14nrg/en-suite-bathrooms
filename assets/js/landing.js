(function () {
  "use strict";

  const ADS_CONVERSIONS = Object.freeze({
    directWhatsApp: "AW-18401275072/KIa5CNT-oPAcEMDZtMZE"
  });

  function trackAdsConversion(destination) {
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

  function start() {
    bindMobileMenu();
    bindDirectWhatsAppTracking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
