/* Live Hub visit reporter. Reports a page view and time on page to the owner's private Live Hub.
   It never changes the page and behaves identically for every visitor. */
(function () {
  try {
    var HUB = "https://live-hub.nicholas-griffith-uk.workers.dev/e/beacon";
    var store = window.localStorage;
    if (store && store.getItem("lh_optout") === "1") return;
    var consent = store ? store.getItem("ensuite_optional_cookies_v1") : null;
    var vid = "";
    if (store) {
      if (consent && consent !== "accepted") { store.removeItem("lh_vid"); }
      else {
        vid = store.getItem("lh_vid") || "";
        if (!vid) {
          var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
          for (var i = 0; i < a.length; i++) vid += ("0" + a[i].toString(16)).slice(-2);
          store.setItem("lh_vid", vid);
        }
      }
    }
    var pv = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var t0 = Date.now(), sentLeave = false;
    var send = function (data) {
      var body = JSON.stringify(data);
      if (navigator.sendBeacon) navigator.sendBeacon(HUB, body);
      else if (window.fetch) fetch(HUB, { method: "POST", body: body, keepalive: true, mode: "cors" });
    };
    send({ type: "view", vid: vid, pv: pv, path: location.pathname, search: location.search, ref: document.referrer });
    var leave = function () {
      if (sentLeave) return; sentLeave = true;
      send({ type: "leave", pv: pv, ms: Date.now() - t0 });
    };
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); });
    window.addEventListener("pagehide", leave);
  } catch (e) { /* reporting must never affect the page */ }
})();
