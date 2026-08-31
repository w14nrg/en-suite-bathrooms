import base from "./fixed-entry.js";

const RELIABILITY_VERSION = "2026-08-08.2";
const LOW_INFORMATION = new Set([
  "hi", "hello", "hey", "hiya", "yo", "sup", "test", "testing",
  "ok", "okay", "k", "yes", "no", "yep", "nope", "thanks", "thank you",
  "cheers", "lol", "x", "xx", "?", ".", "-"
]);

const PUSH_REPAIR_V2_JS = String.raw`(() => {
  if (window.__ENSUITE_PUSH_REPAIR_V2__) return;
  window.__ENSUITE_PUSH_REPAIR_V2__ = true;

  const VERSION = "${RELIABILITY_VERSION}";
  const ENDPOINT_KEY = "ensuite_push_endpoint";
  const ROTATION_KEY = "ensuite_push_rotation_version";
  let running = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function setUi(message, ready = false) {
    const bar = document.getElementById("pushBar");
    const text = document.getElementById("pushText");
    const button = document.getElementById("enablePushButton");
    if (text) text.textContent = message;
    if (bar) bar.classList.toggle("success", Boolean(ready));
    if (button) {
      button.disabled = false;
      button.textContent = ready ? "Test alert" : "Enable alerts";
    }
  }

  function base64UrlToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  async function getDiagnostics() {
    const response = await fetch("/api/admin/push-diagnostics", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  async function confirmDelivery(sentAt) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(1800);
      const diagnostics = await getDiagnostics();
      const receiptAt = diagnostics?.last_receipt_at ? Date.parse(diagnostics.last_receipt_at) : 0;
      if (receiptAt && receiptAt >= sentAt - 2000) return true;
    }
    return false;
  }

  async function sendTest() {
    const sentAt = Date.now();
    setUi("Sending a real test alert to this phone…", true);
    const response = await fetch("/api/admin/push-test", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" }
    });
    if (response.status === 401) {
      setUi("Sign in again to reconnect phone alerts.");
      return false;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result.sent || 0) < 1) {
      setUi("No active phone subscription was available. Tap Enable alerts to reconnect.");
      return false;
    }

    const received = await confirmDelivery(sentAt);
    if (received) {
      setUi("Phone alerts are connected and this browser received the test alert.", true);
      return true;
    }

    setUi("The server sent the alert, but this phone did not confirm receipt. Android/Chrome notifications are blocking it.");
    return false;
  }

  async function connect({ forceRotate = false, test = false } = {}) {
    if (running) return false;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setUi("This browser does not support phone alerts.");
      return false;
    }

    running = true;
    try {
      let permission = Notification.permission;
      if (permission !== "granted") {
        if (!forceRotate) {
          setUi(permission === "denied" ? "Notifications are blocked for this app/browser." : "Tap Enable alerts to allow phone notifications.");
          return false;
        }
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setUi("Notifications are not allowed on this phone/browser.");
        return false;
      }

      setUi("Checking this phone's notification connection…");
      const configResponse = await fetch("/push-config.json", { cache: "no-store", credentials: "same-origin" });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.configured || !config.vapidPublicKey) {
        setUi("Phone alerts are not configured on the server.");
        return false;
      }

      const registration = await navigator.serviceWorker.register("/push-sw.js?v=" + encodeURIComponent(VERSION), {
        scope: "/",
        updateViaCache: "none"
      });
      await registration.update().catch(() => {});
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      const needsRotation = forceRotate || localStorage.getItem(ROTATION_KEY) !== VERSION;
      if (subscription && needsRotation) {
        await subscription.unsubscribe().catch(() => false);
        subscription = null;
        localStorage.removeItem(ENDPOINT_KEY);
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey)
        });
      }

      const saveResponse = await fetch("/api/admin/push-devices", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_name: navigator.userAgent.includes("Android") ? "Nicholas Pixel" : "Nicholas device"
        })
      });
      if (saveResponse.status === 401) {
        setUi("Sign in again to reconnect phone alerts.");
        return false;
      }
      if (!saveResponse.ok) throw new Error("The phone subscription could not be saved.");

      localStorage.setItem(ENDPOINT_KEY, subscription.endpoint);
      localStorage.setItem(ROTATION_KEY, VERSION);
      setUi("Phone alerts are connected on this device.", true);

      if (needsRotation || test) await sendTest();
      return true;
    } catch (error) {
      console.error("Push reliability repair failed", error);
      setUi(error?.message || "Phone alerts need reconnecting — tap Enable alerts.");
      return false;
    } finally {
      running = false;
    }
  }

  function takeOverButton() {
    const original = document.getElementById("enablePushButton");
    if (!original || original.dataset.pushReliabilityV2 === "1") return original;
    const button = original.cloneNode(true);
    button.dataset.pushReliabilityV2 = "1";
    original.replaceWith(button);
    button.addEventListener("click", async event => {
      event.preventDefault();
      button.disabled = true;
      if (Notification.permission === "granted" && localStorage.getItem(ROTATION_KEY) === VERSION) {
        await sendTest().catch(error => setUi(error?.message || "Test alert failed."));
      } else {
        await connect({ forceRotate: true, test: true });
      }
    });
    return button;
  }

  const start = () => {
    takeOverButton();
    void connect();
  };

  window.addEventListener("pageshow", () => setTimeout(start, 200));
  window.addEventListener("online", () => void connect());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      takeOverButton();
      void connect();
    }
  });
  setTimeout(start, 350);
})();`;

const PUSH_SW_V2 = String.raw`
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    const title = data.title || "New website enquiry";
    const conversationId = data.conversation_id || "";
    const path = data.url || (conversationId ? "/inbox.html#chat=" + encodeURIComponent(conversationId) : "/inbox.html");
    const options = {
      body: data.body || "A customer has sent a message.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || ("ensuite-lead-" + Date.now()),
      renotify: true,
      silent: false,
      vibrate: [300, 120, 300, 120, 500],
      timestamp: Date.now(),
      data: { path, conversationId }
    };

    await self.registration.showNotification(title, options);

    try {
      await fetch("/api/push-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tag: options.tag,
          conversation_id: conversationId,
          title
        })
      });
    } catch {}

    try {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) client.postMessage({ type: "ensuite-push", payload: data });
    } catch {}
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId || "";
  const path = event.notification.data?.path || (conversationId ? "/inbox.html#chat=" + encodeURIComponent(conversationId) : "/inbox.html");
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = list.find(client => {
      try { return new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === "/inbox.html"; }
      catch { return false; }
    });
    if (existing) {
      existing.postMessage({ type: "ensuite-open-chat", conversationId });
      if ("navigate" in existing && existing.url !== targetUrl) await existing.navigate(targetUrl);
      if ("focus" in existing) return existing.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});

self.addEventListener("fetch", () => {});
`;

function clean(value) {
  return String(value || "").trim();
}

function normalisedLow(value) {
  return clean(value).toLowerCase().replace(/[.!?,;:]+$/g, "").trim();
}

function isLowInformation(value) {
  const text = normalisedLow(value);
  return !text || LOW_INFORMATION.has(text);
}

function isValidName(value) {
  let name = clean(value).replace(/^(?:my name is|i am|i'm|im|it is|it's)\s+/i, "").trim();
  name = name.replace(/[.!?,;:]+$/g, "").trim();
  if (isLowInformation(name)) return false;
  if (name.length < 2 || name.length > 60) return false;
  if (name.split(/\s+/).length > 4) return false;
  return /^[\p{L}][\p{L}'’ -]*$/u.test(name);
}

function isValidProject(value) {
  const text = normalisedLow(value);
  if (isLowInformation(text) || text.length < 4) return false;
  const keywords = [
    "bath", "bathroom", "shower", "en-suite", "ensuite", "cloakroom", "toilet", "wc",
    "tap", "tile", "floor", "leak", "renovat", "refurb", "replace", "install", "repair",
    "move", "basin", "sink", "radiator", "plumb", "wet room", "wetroom"
  ];
  if (keywords.some(keyword => text.includes(keyword))) return true;
  return text.length >= 8 && text.split(/\s+/).length >= 2;
}

function isValidArea(value) {
  const text = clean(value);
  if (isLowInformation(text) || text.length < 2 || text.length > 80) return false;
  const postcode = /\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][0-9]{1,2}|[A-PR-UWYZ][A-HK-Y][0-9]{1,2}|[A-PR-UWYZ][0-9][A-HJKSTUW]|[A-PR-UWYZ][A-HK-Y][0-9][ABEHMNPRVWXY])(?:\s?[0-9][ABD-HJLNP-UW-Z]{2})?)\b/i;
  if (postcode.test(text)) return true;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'’ .-]{3,80}$/.test(text);
}

function isValidBrief(value) {
  const text = normalisedLow(value);
  if (isLowInformation(text) || text.length < 6) return false;
  return text.split(/\s+/).length >= 2 || text.length >= 12;
}

function isValidTiming(value) {
  const text = normalisedLow(value);
  if (isLowInformation(text) || text.length < 3) return false;
  if (/^(asap|urgent|urgently|now|soon)$/i.test(text)) return true;
  if (/\d/.test(text)) return true;
  return /(today|tomorrow|week|month|spring|summer|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december|when available|flexible|no rush)/i.test(text);
}

function isValidContact(value) {
  const text = clean(value);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function validationError(step, body) {
  if (step === 0 && !isValidName(body)) return "Please enter your first name rather than a greeting.";
  if (step === 1 && !isValidProject(body)) return "Tell me what you are planning, for example a bathroom renovation, en-suite, shower or smaller bathroom job.";
  if (step === 2 && !isValidArea(body)) return "Please enter the property postcode or area, for example SW6 or Fulham.";
  if (step === 3 && !isValidBrief(body)) return "Please briefly describe what you would like done in the room.";
  if (step === 4 && !isValidTiming(body)) return "Please give a rough start time, for example ASAP, next month or September.";
  if (step === 5 && !isValidContact(body)) return "Please enter a valid mobile number or email address so Nicholas can contact you if the chat disconnects.";
  return "";
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = String(env.SITE_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}

function corsJson(request, env, data, status = 200) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function validatePublicMessage(request, env, url) {
  if (request.method !== "POST") return null;
  const match = url.pathname.match(/^\/api\/conversations\/([a-f0-9-]+)\/messages$/i);
  if (!match) return null;

  const token = request.headers.get("x-chat-token") || "";
  if (!token) return null;
  const conversation = await env.DB.prepare(`
    SELECT step, customer_name, mode, status
    FROM conversations
    WHERE id = ? AND public_token = ?
  `).bind(match[1], token).first();
  if (!conversation || conversation.mode !== "bot" || conversation.status === "closed") return null;

  const data = await request.clone().json().catch(() => ({}));
  const body = clean(data.body);
  const step = Number(conversation.step || 0);
  const error = validationError(step, body);
  if (!error) return null;

  return corsJson(request, env, {
    ok: false,
    validation_error: true,
    step,
    error
  }, 422);
}

async function ensureReceiptTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS push_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL,
      tag TEXT,
      conversation_id TEXT,
      title TEXT
    )
  `).run();
}

async function recordPushReceipt(request, env) {
  await ensureReceiptTable(env);
  const data = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO push_receipts (received_at, tag, conversation_id, title)
    VALUES (?, ?, ?, ?)
  `).bind(now, clean(data.tag).slice(0, 200), clean(data.conversation_id).slice(0, 120), clean(data.title).slice(0, 200)).run();
  await env.DB.prepare(`
    DELETE FROM push_receipts
    WHERE id NOT IN (SELECT id FROM push_receipts ORDER BY id DESC LIMIT 100)
  `).run();
  return Response.json({ ok: true, received_at: now }, { headers: { "cache-control": "no-store" } });
}

async function adminPushDiagnostics(request, env, ctx) {
  const checkUrl = new URL("/api/admin/push-devices", request.url);
  const authCheck = await base.fetch(new Request(checkUrl, {
    method: "GET",
    headers: request.headers
  }), env, ctx);
  if (authCheck.status === 401) return authCheck;
  if (!authCheck.ok) return authCheck;

  const devicesPayload = await authCheck.json().catch(() => ({ devices: [] }));
  const devices = devicesPayload.devices || [];
  await ensureReceiptTable(env);
  const receipt = await env.DB.prepare(`
    SELECT received_at, tag, conversation_id, title
    FROM push_receipts
    ORDER BY id DESC
    LIMIT 1
  `).first();

  return Response.json({
    ok: true,
    enabled_devices: devices.filter(device => Number(device.enabled) === 1).length,
    devices,
    last_receipt_at: receipt?.received_at || null,
    last_receipt_tag: receipt?.tag || null,
    last_receipt_conversation_id: receipt?.conversation_id || null,
    version: RELIABILITY_VERSION
  }, { headers: { "cache-control": "no-store" } });
}

function patchWidgetV2(source) {
  if (source.includes("ENSUITE_CHAT_RELIABILITY_20260808")) return source;

  source = source
    .replace('const visitPingKey = "ensuite_site_visit_ping_v1";', 'const visitPingKey = "ensuite_site_visit_ping_v2";')
    .replace('const visitPingCooldownMs = 30 * 60 * 1000;', 'const visitPingCooldownMs = 60 * 1000;')
    .replace('window.setTimeout(notifyOwnerOfVisit, 5000);', 'window.setTimeout(notifyOwnerOfVisit, 1500);')
    .replace(
      'if (document.visibilityState !== "visible" || navigator.webdriver) return;',
      '/* ENSUITE_GOOGLE_ADS_POLICY_CLEANUP_20260831 */\n    if (document.visibilityState !== "visible") return;'
    )
    .replace(
      'page_url: location.href,\n          page_title: document.title,\n          referrer: document.referrer',
      'page_url: location.origin + location.pathname,\n          page_title: document.title,\n          referrer: ""'
    )
    .replace(
      'if (!response.ok) return;\n      try { localStorage.setItem(visitPingKey, String(now)); } catch {}',
      'if (!response.ok) return;\n      const visitResult = await response.json().catch(() => ({}));\n      if (Number(visitResult.sent || 0) > 0) { try { localStorage.setItem(visitPingKey, String(now)); } catch {} }'
    )
    .replace(
      'const name = String(value || "").trim().replace(/[.!?,;:]+$/g, "");\n    return name.length >= 2 && name.length <= 60 && name.split(/\\s+/).length <= 4 && /^[\\p{L}][\\p{L}\'’ -]*$/u.test(name);',
      'const name = String(value || "").trim().replace(/[.!?,;:]+$/g, "");\n    const rejected = /^(hi|hello|hey|hiya|test|testing|ok|okay|yes|no|thanks|thank you)$/i.test(name);\n    return !rejected && name.length >= 2 && name.length <= 60 && name.split(/\\s+/).length <= 4 && /^[\\p{L}][\\p{L}\'’ -]*$/u.test(name);'
    )
    .replace(
      'if (!response.ok) throw new Error("Message failed");\n      await pollMessages();\n    } catch {\n      input.value = body;\n      showError("Your message may not have sent. Please try again or use WhatsApp.");',
      'const result = await response.json().catch(() => ({}));\n      if (!response.ok) throw new Error(result.error || "Message failed");\n      await pollMessages();\n    } catch (error) {\n      input.value = body;\n      showError(error?.message || "Your message may not have sent. Please try again or use WhatsApp.");'
    );

  const marker = "document.head.appendChild(style);";
  const reliabilityCss = String.raw`
  /* ENSUITE_CHAT_RELIABILITY_20260808 */
  style.textContent +=
    '.eb-chat-error{font-weight:700!important;padding:10px 12px!important}' +
    '.eb-chat-form textarea:focus{box-shadow:0 0 0 2px rgba(16,42,67,.22) inset!important}';
  `;
  if (source.includes(marker)) source = source.replace(marker, `${reliabilityCss}\n  ${marker}`);
  return source;
}

function patchInboxV2(source) {
  source = source.replace(/<script src="\/push-repair\.js\?v=[^"]+" defer><\/script>\s*/g, "");
  if (source.includes("/push-repair-v2.js?v=")) return source;
  const tag = `<script src="/push-repair-v2.js?v=${RELIABILITY_VERSION}" defer></script>`;
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

    if (url.pathname === "/fix-status.json") {
      return Response.json({
        ok: true,
        version: RELIABILITY_VERSION,
        chat_layout: "vertical",
        chat_validation: true,
        visit_alert_retry: true,
        push_rotation: true,
        push_receipts: true
      }, { headers: { "cache-control": "no-store", "x-ensuite-fix-version": RELIABILITY_VERSION } });
    }

    if (url.pathname === "/validation-test.json") {
      return Response.json({
        ok: true,
        version: RELIABILITY_VERSION,
        rejects_hi_as_name: Boolean(validationError(0, "hi")),
        rejects_hi_as_project: Boolean(validationError(1, "hi")),
        rejects_hi_as_area: Boolean(validationError(2, "hi")),
        rejects_hi_as_brief: Boolean(validationError(3, "hi")),
        rejects_hi_as_timing: Boolean(validationError(4, "hi")),
        rejects_hi_as_contact: Boolean(validationError(5, "hi")),
        accepts_name: !validationError(0, "Nicholas"),
        accepts_project: !validationError(1, "Bathroom renovation"),
        accepts_area: !validationError(2, "SW6"),
        accepts_brief: !validationError(3, "Replace the old bath with a shower"),
        accepts_timing: !validationError(4, "next month"),
        accepts_contact: !validationError(5, "07700 900123")
      }, { headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/push-repair-v2.js") {
      return new Response(PUSH_REPAIR_V2_JS, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "x-ensuite-fix-version": RELIABILITY_VERSION
        }
      });
    }

    if (url.pathname === "/push-sw.js") {
      return new Response(PUSH_SW_V2, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "service-worker-allowed": "/",
          "x-ensuite-fix-version": RELIABILITY_VERSION
        }
      });
    }

    if (url.pathname === "/api/push-receipt" && request.method === "POST") {
      return recordPushReceipt(request, env);
    }

    if (url.pathname === "/api/admin/push-diagnostics" && request.method === "GET") {
      return adminPushDiagnostics(request, env, ctx);
    }

    const validationResponse = await validatePublicMessage(request, env, url);
    if (validationResponse) return validationResponse;

    const response = await base.fetch(request, env, ctx);

    if (url.pathname === "/widget.js" && response.ok) {
      const body = patchWidgetV2(await response.text());
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: copyHeaders(response, {
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "x-ensuite-fix-version": RELIABILITY_VERSION
        })
      });
    }

    if ((url.pathname === "/inbox.html" || url.pathname === "/") && response.ok) {
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        const body = patchInboxV2(await response.text());
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: copyHeaders(response, {
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "x-ensuite-fix-version": RELIABILITY_VERSION
          })
        });
      }
    }

    return response;
  },

  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === "function") return base.scheduled(event, env, ctx);
  }
};
