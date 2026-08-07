import app from "./index.js";

const FIX_VERSION = "2026-08-07.1";

const PUSH_REPAIR_JS = String.raw`(() => {
  if (window.__ENSUITE_PUSH_REPAIR__) return;
  window.__ENSUITE_PUSH_REPAIR__ = true;

  const ENDPOINT_KEY = "ensuite_push_endpoint";
  const LAST_REPAIR_KEY = "ensuite_push_last_repair";
  const REPAIR_COOLDOWN_MS = 60 * 1000;
  let running = false;

  function base64UrlToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  function sameKey(subscription, expected) {
    const actualBuffer = subscription?.options?.applicationServerKey;
    if (!actualBuffer) return false;
    const actual = new Uint8Array(actualBuffer);
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i += 1) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  function setUi(message, ready = false) {
    const bar = document.getElementById("pushBar");
    const text = document.getElementById("pushText");
    const button = document.getElementById("enablePushButton");
    if (text && message) text.textContent = message;
    if (ready && bar) bar.classList.add("success");
    if (ready && button) {
      button.textContent = "Test alert";
      button.dataset.pushRepairReady = "1";
    }
  }

  async function sendTest() {
    const response = await fetch("/api/admin/push-test", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" }
    });
    if (response.status === 401) {
      setUi("Sign in again to reconnect phone alerts.");
      return false;
    }
    if (!response.ok) throw new Error("Test alert failed");
    setUi("Phone alerts are connected and the test alert was sent.", true);
    return true;
  }

  async function repairPush({ force = false, test = false } = {}) {
    if (running) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    const now = Date.now();
    if (!force) {
      const last = Number(sessionStorage.getItem(LAST_REPAIR_KEY) || 0);
      if (last && now - last < REPAIR_COOLDOWN_MS) return;
    }

    running = true;
    try {
      const configResponse = await fetch("/push-config.json", { cache: "no-store", credentials: "same-origin" });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.configured || !config.vapidPublicKey) {
        setUi("Phone alerts are not configured on the server.");
        return;
      }

      const expectedKey = base64UrlToUint8Array(config.vapidPublicKey);
      const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" });
      await registration.update().catch(() => {});
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      let changed = false;

      if (subscription && !sameKey(subscription, expectedKey)) {
        await subscription.unsubscribe().catch(() => false);
        subscription = null;
        localStorage.removeItem(ENDPOINT_KEY);
        changed = true;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey
        });
        changed = true;
      }

      const response = await fetch("/api/admin/push-devices", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_name: navigator.userAgent.includes("Android") ? "Nicholas Pixel" : "Nicholas device"
        })
      });

      if (response.status === 401) {
        setUi("Sign in again to reconnect phone alerts.");
        return;
      }
      if (!response.ok) throw new Error("Push subscription could not be saved");

      localStorage.setItem(ENDPOINT_KEY, subscription.endpoint);
      sessionStorage.setItem(LAST_REPAIR_KEY, String(now));
      setUi("Phone alerts are connected on this device.", true);

      if (changed || test) await sendTest();
    } catch (error) {
      console.error("Push repair failed", error);
      setUi("Phone alerts need reconnecting — tap Enable alerts.");
    } finally {
      running = false;
    }
  }

  const enableButton = document.getElementById("enablePushButton");
  enableButton?.addEventListener("click", event => {
    if (enableButton.dataset.pushRepairReady !== "1") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendTest().catch(error => {
      console.error(error);
      setUi("Test alert failed — reconnect phone alerts.");
    });
  }, true);

  window.addEventListener("pageshow", () => setTimeout(() => void repairPush(), 250));
  window.addEventListener("online", () => void repairPush({ force: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void repairPush();
  });
  navigator.serviceWorker?.addEventListener?.("controllerchange", () => void repairPush({ force: true }));

  setTimeout(() => void repairPush(), 500);
})();`;

function patchWidget(source) {
  if (source.includes("ENSUITE_CHAT_VERTICAL_FIX_20260807")) return source;
  const marker = "document.head.appendChild(style);";
  const fix = String.raw`
  /* ENSUITE_CHAT_VERTICAL_FIX_20260807 */
  style.textContent +=
    '.eb-chat-messages.eb-chat-live-area.active{display:block!important;flex:1!important;overflow-y:auto!important;overflow-x:hidden!important}' +
    '.eb-chat-messages .eb-msg{display:block!important;flex:none!important;width:auto!important}' +
    '.eb-chat-messages .eb-msg.customer{margin-left:auto!important}' +
    '.eb-chat-messages .eb-quick{display:flex!important;flex-wrap:wrap!important}';
  `;

  if (source.includes(marker)) return source.replace(marker, `${fix}\n  ${marker}`);
  return source;
}

function patchInbox(source) {
  if (source.includes("/push-repair.js?v=")) return source;
  const tag = `<script src="/push-repair.js?v=${FIX_VERSION}" defer></script>`;
  return source.includes("</body>") ? source.replace("</body>", `${tag}\n</body>`) : `${source}\n${tag}`;
}

function copyHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  Object.entries(extra).forEach(([key, value]) => headers.set(key, value));
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/push-repair.js") {
      return new Response(PUSH_REPAIR_JS, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "x-ensuite-fix-version": FIX_VERSION
        }
      });
    }

    if (url.pathname === "/fix-status.json") {
      return Response.json({ ok: true, version: FIX_VERSION, chat_layout: "vertical", push_repair: true }, {
        headers: { "cache-control": "no-store", "x-ensuite-fix-version": FIX_VERSION }
      });
    }

    const response = await app.fetch(request, env, ctx);

    if (url.pathname === "/widget.js" && response.ok) {
      const body = patchWidget(await response.text());
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: copyHeaders(response, {
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "x-ensuite-fix-version": FIX_VERSION
        })
      });
    }

    if ((url.pathname === "/inbox.html" || url.pathname === "/") && response.ok) {
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        const body = patchInbox(await response.text());
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: copyHeaders(response, {
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "x-ensuite-fix-version": FIX_VERSION
          })
        });
      }
    }

    return response;
  },

  async scheduled(event, env, ctx) {
    if (typeof app.scheduled === "function") return app.scheduled(event, env, ctx);
  }
};
