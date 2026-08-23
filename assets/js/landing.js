(function () {
  "use strict";

  function bindMobileMenu() {
    const button = document.getElementById("menuButton");
    const menu = document.getElementById("mobileMenu");
    if (!button || !menu) return;

    button.addEventListener("click", function () {
      const isOpen = menu.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMobileMenu, { once: true });
  } else {
    bindMobileMenu();
  }
})();
