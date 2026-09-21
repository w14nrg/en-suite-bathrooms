(function () {
  "use strict";

  const STORAGE_KEY = "ensuite_optional_cookies_v1";
  const ADS_ID = "AW-18401275072";
  const PHONE_CONVERSION_ID = "AW-18401275072/Yr01COato_AcEMDZtMZE";

  function getChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function hasOptionalConsent() {
    return getChoice() === "accepted";
  }

  function loadGoogleAds() {
    if (!hasOptionalConsent() || document.getElementById("ensuiteGoogleAds")) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ADS_ID);
    window.gtag("config", PHONE_CONVERSION_ID, { phone_conversion_number: "0207 386 0000" });

    const script = document.createElement("script");
    script.id = "ensuiteGoogleAds";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ADS_ID);
    document.head.appendChild(script);
  }

  function setGoogleConsent(granted) {
    if (typeof window.gtag !== "function") return;
    const value = granted ? "granted" : "denied";
    window.gtag("consent", "update", {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value
    });
  }

  function clearKnownGoogleCookies() {
    const names = document.cookie.split(";").map((item) => item.split("=")[0].trim()).filter(Boolean);
    names.filter((name) => /^(_ga|_gid|_gcl_)/.test(name)).forEach((name) => {
      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
      document.cookie = name + "=; Max-Age=0; path=/; domain=.en-suite.co.uk; SameSite=Lax";
    });
  }

  function ensureStyles() {
    if (document.getElementById("privacyConsentStyles")) return;
    const style = document.createElement("style");
    style.id = "privacyConsentStyles";
    style.textContent = `
      .privacy-consent{position:fixed;left:18px;right:18px;bottom:18px;z-index:10000;max-width:760px;margin:auto;background:#171717;color:#fff;border:1px solid rgba(199,154,79,.55);border-radius:18px;box-shadow:0 18px 55px rgba(0,0,0,.28);padding:22px}
      .privacy-consent[hidden]{display:none}.privacy-consent h2{margin:0 0 8px;color:#fff;font-size:1.25rem}.privacy-consent p{margin:0;color:#d7d7d7;line-height:1.55;font-size:.94rem}
      .privacy-consent a{color:#efd9aa}.privacy-consent-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:17px}
      .privacy-consent button{border-radius:999px;padding:11px 17px;font:inherit;font-weight:700;cursor:pointer}
      .privacy-accept{background:#c79a4f;color:#171717;border:1px solid #c79a4f}.privacy-reject{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.48)}
      .privacy-settings-btn{appearance:none;border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
      @media(max-width:560px){.privacy-consent{left:10px;right:10px;bottom:10px;padding:18px}.privacy-consent-actions button{flex:1 1 100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureBanner() {
    ensureStyles();
    let banner = document.getElementById("privacyConsent");
    if (banner) return banner;

    banner = document.createElement("aside");
    banner.id = "privacyConsent";
    banner.className = "privacy-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie choices");
    banner.innerHTML = `
      <h2>Optional cookies</h2>
      <p>We use essential website technology. With your permission, we also use Google Ads conversion tracking to understand whether enquiries come from our advertising. Optional tracking stays off unless you accept it. <a href="privacy-policy.html">Privacy &amp; Cookie Policy</a></p>
      <div class="privacy-consent-actions">
        <button type="button" class="privacy-accept" data-cookie-accept>Accept optional cookies</button>
        <button type="button" class="privacy-reject" data-cookie-reject>Reject optional cookies</button>
      </div>
    `;
    document.body.appendChild(banner);

    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => saveChoice("accepted"));
    banner.querySelector("[data-cookie-reject]").addEventListener("click", () => saveChoice("rejected"));
    return banner;
  }

  function showPreferences() {
    const banner = ensureBanner();
    banner.hidden = false;
  }

  function hidePreferences() {
    const banner = document.getElementById("privacyConsent");
    if (banner) banner.hidden = true;
  }

  function saveChoice(choice) {
    try { localStorage.setItem(STORAGE_KEY, choice); } catch {}
    if (choice === "accepted") {
      loadGoogleAds();
      setGoogleConsent(true);
      window.dispatchEvent(new CustomEvent("ensuite:optional-consent-granted"));
    } else {
      setGoogleConsent(false);
      clearKnownGoogleCookies();
      window.dispatchEvent(new CustomEvent("ensuite:optional-consent-rejected"));
    }
    hidePreferences();
  }

  function addFooterSettings() {
    const bottom = document.querySelector(".footer-bottom");
    if (!bottom) return;

    if (!bottom.querySelector("[data-privacy-link]")) {
      const privacy = document.createElement("span");
      privacy.innerHTML = '<a data-privacy-link href="privacy-policy.html" style="color:inherit">Privacy &amp; Cookies</a>';
      bottom.appendChild(privacy);
    }

    if (!bottom.querySelector("[data-cookie-settings]")) {
      const settings = document.createElement("span");
      settings.innerHTML = '<button type="button" class="privacy-settings-btn" data-cookie-settings>Cookie settings</button>';
      bottom.appendChild(settings);
      settings.querySelector("[data-cookie-settings]").addEventListener("click", showPreferences);
    }
  }

  function init() {
    addFooterSettings();
    if (!getChoice() || location.hash === "#cookie-settings") showPreferences();
    else hidePreferences();
  }

  window.EnsuitePrivacy = {
    hasOptionalConsent,
    openPreferences: showPreferences,
    loadGoogleAds
  };

  if (hasOptionalConsent()) loadGoogleAds();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();