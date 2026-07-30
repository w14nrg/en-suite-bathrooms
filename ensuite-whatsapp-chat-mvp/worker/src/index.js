const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_MESSAGE_LENGTH = 2000;
const ADMIN_COOKIE = "ensuite_admin";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
let cachedGoogleToken = null;
let cachedGoogleTokenExpiresAt = 0;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (request.method === "OPTIONS") {
        return corsResponse(request, env, new Response(null, { status: 204 }));
      }

      if (pathname === "/health") {
        return json({ ok: true, service: "ensuite-whatsapp-chat", push: "firebase" });
      }

      if (pathname === "/push-config.json") {
        return json(getFirebasePublicConfig(env));
      }

      if (pathname === "/push-sw.js") {
        return new Response(buildPushServiceWorker(env), {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store",
            "service-worker-allowed": "/"
          }
        });
      }

      if (pathname === "/api/conversations" && request.method === "POST") {
        return corsResponse(request, env, await createConversation(request, env));
      }

      const customerMessagesMatch = pathname.match(/^\/api\/conversations\/([a-f0-9-]+)\/messages$/i);
      if (customerMessagesMatch) {
        const conversationId = customerMessagesMatch[1];
        if (request.method === "GET") {
          return corsResponse(request, env, await getCustomerMessages(request, env, conversationId));
        }
        if (request.method === "POST") {
          return corsResponse(request, env, await postCustomerMessage(request, env, conversationId));
        }
      }

      if (pathname === "/api/admin/login" && request.method === "POST") {
        return await adminLogin(request, env);
      }

      if (pathname === "/api/admin/logout" && request.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            ...JSON_HEADERS,
            "set-cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
          }
        });
      }

      if (pathname.startsWith("/api/admin/")) {
        const authorised = await verifyAdmin(request, env);
        if (!authorised) return json({ error: "Unauthorised" }, 401);

        if (pathname === "/api/admin/heartbeat" && request.method === "POST") {
          return await ownerHeartbeat(env);
        }
        if (pathname === "/api/admin/push-devices" && request.method === "GET") {
          return await listPushDevices(env);
        }
        if (pathname === "/api/admin/push-devices" && request.method === "POST") {
          return await registerPushDevice(request, env);
        }
        if (pathname === "/api/admin/push-devices/remove" && request.method === "POST") {
          return await removePushDevice(request, env);
        }
        if (pathname === "/api/admin/push-test" && request.method === "POST") {
          return await sendTestPush(env);
        }
        if (pathname === "/api/admin/conversations" && request.method === "GET") {
          return await listConversations(env);
        }

        const adminMessagesMatch = pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]+)\/messages$/i);
        if (adminMessagesMatch && request.method === "GET") {
          return await getAdminMessages(env, adminMessagesMatch[1]);
        }

        const replyMatch = pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]+)\/reply$/i);
        if (replyMatch && request.method === "POST") {
          return await ownerReply(request, env, replyMatch[1]);
        }

        const takeoverMatch = pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]+)\/takeover$/i);
        if (takeoverMatch && request.method === "POST") {
          return await setTakeover(request, env, takeoverMatch[1]);
        }

        const acknowledgeMatch = pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]+)\/acknowledge$/i);
        if (acknowledgeMatch && request.method === "POST") {
          return await acknowledgeConversation(env, acknowledgeMatch[1]);
        }

        const statusMatch = pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]+)\/status$/i);
        if (statusMatch && request.method === "POST") {
          return await updateConversationStatus(request, env, statusMatch[1]);
        }
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: "Server error" }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendUnreadReminders(env));
  }
};

async function createConversation(request, env) {
  assertAllowedOrigin(request, env);
  const data = await safeJson(request);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const publicToken = randomToken(32);
  const pageUrl = cleanText(data.page_url || "", 1000);
  const referrer = cleanText(data.referrer || "", 1000);
  const userAgent = cleanText(request.headers.get("user-agent") || "", 500);
  const presence = await env.DB.prepare(`SELECT last_seen_at FROM owner_presence WHERE id = 1`).first();
  const ownerOnline = presence?.last_seen_at && Date.now() - Date.parse(presence.last_seen_at) < 90000;
  const owner = env.OWNER_NAME || "Nicholas";
  const availability = ownerOnline ? `${owner} is currently available and may join the chat.` : `I can collect the details and alert ${owner} immediately.`;
  const welcome = `Hi, I’m the En-Suites & Bathrooms assistant. ${availability}\n\nWhat are you planning?`;

  await env.DB.prepare(`
    INSERT INTO conversations (
      id, public_token, created_at, updated_at, page_url, referrer, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, publicToken, now, now, pageUrl, referrer, userAgent).run();

  const messageInsert = await env.DB.prepare(`
    INSERT INTO messages (conversation_id, sender, body, created_at)
    VALUES (?, 'bot', ?, ?)
  `).bind(id, welcome, now).run();

  return json({
    conversation_id: id,
    public_token: publicToken,
    messages: [{
      id: Number(messageInsert.meta?.last_row_id || 0),
      sender: "bot",
      body: welcome,
      created_at: now
    }],
    quick_replies: ["New en-suite", "Bathroom renovation", "Cloakroom", "Smaller bathroom work", "Not sure yet"]
  }, 201);
}

async function getCustomerMessages(request, env, conversationId) {
  assertAllowedOrigin(request, env);
  const token = request.headers.get("x-chat-token") || "";
  const conversation = await getConversationByPublicToken(env, conversationId, token);
  if (!conversation) return json({ error: "Conversation not found" }, 404);

  const url = new URL(request.url);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const result = await env.DB.prepare(`
    SELECT id, sender, body, created_at
    FROM messages
    WHERE conversation_id = ? AND id > ?
    ORDER BY id ASC
    LIMIT 200
  `).bind(conversationId, after).all();

  return json({ messages: result.results || [], mode: conversation.mode, status: conversation.status });
}

async function postCustomerMessage(request, env, conversationId) {
  assertAllowedOrigin(request, env);
  const token = request.headers.get("x-chat-token") || "";
  const conversation = await getConversationByPublicToken(env, conversationId, token);
  if (!conversation) return json({ error: "Conversation not found" }, 404);
  if (conversation.status === "closed") return json({ error: "Conversation is closed" }, 409);

  const data = await safeJson(request);
  const body = cleanText(data.body || "", MAX_MESSAGE_LENGTH);
  if (!body) return json({ error: "Message is required" }, 400);

  const now = new Date().toISOString();
  const wasUnread = Number(conversation.unread || 0);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO messages (conversation_id, sender, body, created_at)
      VALUES (?, 'customer', ?, ?)
    `).bind(conversationId, body, now),
    env.DB.prepare(`
      UPDATE conversations
      SET updated_at = ?,
          last_customer_at = ?,
          first_unread_at = CASE WHEN unread = 0 THEN ? ELSE first_unread_at END,
          push_count = CASE WHEN unread = 0 THEN 0 ELSE push_count END,
          unread = unread + 1
      WHERE id = ?
    `).bind(now, now, now, conversationId)
  ]);

  let botMessage = null;
  let nextStep = Number(conversation.step || 0);
  if (conversation.mode === "bot") {
    const response = buildBotResponse(conversation, body, env);
    nextStep = response.nextStep;
    botMessage = response.message;

    await env.DB.batch([
      env.DB.prepare(response.updateSql).bind(...response.updateBindings),
      env.DB.prepare(`
        INSERT INTO messages (conversation_id, sender, body, created_at)
        VALUES (?, 'bot', ?, ?)
      `).bind(conversationId, botMessage, now)
    ]);
  }

  if (wasUnread === 0) {
    const refreshed = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(conversationId).first();
    await sendLeadAlert(env, refreshed, body, false);
  }

  return json({ ok: true, bot_message: botMessage, step: nextStep });
}

function buildBotResponse(conversation, body, env) {
  const step = Number(conversation.step || 0);
  const id = conversation.id;
  const now = new Date().toISOString();

  if (step === 0) {
    return botStep(id, now, 1, "project_type", normaliseProjectType(body), "Thanks. What is the property postcode or area?");
  }
  if (step === 1) {
    return botStep(id, now, 2, "postcode", body, "Briefly tell me what you would like done, or what is wrong with the current room.");
  }
  if (step === 2) {
    return botStep(id, now, 3, "project_brief", body, "When are you hoping to start the work?");
  }
  if (step === 3) {
    return botStep(id, now, 4, "timing", body, "What is your name?");
  }
  if (step === 4) {
    return botStep(id, now, 5, "customer_name", body, `What is the best mobile number or email address for ${env.OWNER_NAME || "Nicholas"} to reach you if the chat disconnects?`);
  }
  if (step === 5) {
    return botStep(id, now, 6, "contact", body, `Thank you. I’ve alerted ${env.OWNER_NAME || "Nicholas"} and saved the enquiry. He can join this same conversation, so you will not need to repeat anything.`);
  }
  return {
    nextStep: step,
    message: `Thanks — I’ve added that to the enquiry. ${env.OWNER_NAME || "Nicholas"} has been alerted.`,
    updateSql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
    updateBindings: [now, id]
  };
}

function botStep(id, now, nextStep, column, value, message) {
  const allowedColumns = new Set(["project_type", "postcode", "project_brief", "timing", "customer_name", "contact"]);
  if (!allowedColumns.has(column)) throw new Error("Invalid bot column");
  return {
    nextStep,
    message,
    updateSql: `UPDATE conversations SET ${column} = ?, step = ?, updated_at = ? WHERE id = ?`,
    updateBindings: [cleanText(value, 2000), nextStep, now, id]
  };
}

async function adminLogin(request, env) {
  const data = await safeJson(request);
  const supplied = String(data.password || "");
  if (!env.ADMIN_PASSWORD || !timingSafeEqual(supplied, env.ADMIN_PASSWORD)) {
    return json({ error: "Incorrect password" }, 401);
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return json({ error: "SESSION_SECRET is not configured" }, 500);
  }

  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expiry}`;
  const signature = await hmacSign(payload, env.SESSION_SECRET);
  const value = `${payload}.${signature}`;

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      ...JSON_HEADERS,
      "set-cookie": `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`
    }
  });
}

async function verifyAdmin(request, env) {
  const cookie = parseCookies(request.headers.get("cookie") || "")[ADMIN_COOKIE];
  if (!cookie || !env.SESSION_SECRET) return false;
  const [expiryText, signature] = cookie.split(".");
  const expiry = Number(expiryText);
  if (!expiry || expiry < Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = await hmacSign(expiryText, env.SESSION_SECRET);
  return timingSafeEqual(signature, expected);
}

async function ownerHeartbeat(env) {
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE owner_presence SET last_seen_at = ? WHERE id = 1`).bind(now).run();
  return json({ ok: true, last_seen_at: now });
}

async function listConversations(env) {
  const result = await env.DB.prepare(`
    SELECT id, created_at, updated_at, status, mode, step, project_type, postcode,
           project_brief, timing, customer_name, contact, page_url, unread,
           last_customer_at, last_owner_at
    FROM conversations
    ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, unread DESC, updated_at DESC
    LIMIT 100
  `).all();
  return json({ conversations: result.results || [] });
}

async function getAdminMessages(env, conversationId) {
  const conversation = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(conversationId).first();
  if (!conversation) return json({ error: "Conversation not found" }, 404);
  const result = await env.DB.prepare(`
    SELECT id, sender, body, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY id ASC
    LIMIT 500
  `).bind(conversationId).all();
  return json({ conversation, messages: result.results || [] });
}

async function ownerReply(request, env, conversationId) {
  const data = await safeJson(request);
  const body = cleanText(data.body || "", MAX_MESSAGE_LENGTH);
  if (!body) return json({ error: "Message is required" }, 400);
  const now = new Date().toISOString();
  const conversation = await env.DB.prepare(`SELECT mode FROM conversations WHERE id = ?`).bind(conversationId).first();
  if (!conversation) return json({ error: "Conversation not found" }, 404);

  const statements = [];
  if (conversation.mode !== "human") {
    statements.push(env.DB.prepare(`
      INSERT INTO messages (conversation_id, sender, body, created_at)
      VALUES (?, 'system', ?, ?)
    `).bind(conversationId, `${env.OWNER_NAME || "Nicholas"} has joined the conversation.`, now));
  }
  statements.push(
    env.DB.prepare(`
      INSERT INTO messages (conversation_id, sender, body, created_at)
      VALUES (?, 'owner', ?, ?)
    `).bind(conversationId, body, now),
    env.DB.prepare(`
      UPDATE conversations
      SET mode = 'human', updated_at = ?, last_owner_at = ?, unread = 0,
          first_unread_at = NULL, push_count = 0, last_push_at = NULL
      WHERE id = ?
    `).bind(now, now, conversationId)
  );
  await env.DB.batch(statements);

  return json({ ok: true });
}

async function setTakeover(request, env, conversationId) {
  const data = await safeJson(request);
  const mode = data.mode === "bot" ? "bot" : "human";
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE conversations
    SET mode = ?, updated_at = ?, unread = 0,
        first_unread_at = NULL, push_count = 0, last_push_at = NULL
    WHERE id = ?
  `).bind(mode, now, conversationId).run();

  if (mode === "human") {
    const prior = await env.DB.prepare(`
      SELECT id FROM messages
      WHERE conversation_id = ? AND sender = 'system' AND body = ?
      ORDER BY id DESC LIMIT 1
    `).bind(conversationId, `${env.OWNER_NAME || "Nicholas"} has joined the conversation.`).first();
    if (!prior) {
      await env.DB.prepare(`
        INSERT INTO messages (conversation_id, sender, body, created_at)
        VALUES (?, 'system', ?, ?)
      `).bind(conversationId, `${env.OWNER_NAME || "Nicholas"} has joined the conversation.`, now).run();
    }
  }

  return json({ ok: true, mode });
}

async function acknowledgeConversation(env, conversationId) {
  await env.DB.prepare(`
    UPDATE conversations
    SET unread = 0, first_unread_at = NULL, push_count = 0, last_push_at = NULL
    WHERE id = ?
  `).bind(conversationId).run();
  return json({ ok: true });
}

async function updateConversationStatus(request, env, conversationId) {
  const data = await safeJson(request);
  const allowed = new Set(["open", "survey-booked", "quoting", "won", "lost", "closed"]);
  const status = allowed.has(data.status) ? data.status : "open";
  await env.DB.prepare(`UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, new Date().toISOString(), conversationId).run();
  return json({ ok: true, status });
}

async function sendLeadAlert(env, conversation, latestMessage, reminder = false) {
  if (!conversation) return 0;
  const devices = await env.DB.prepare(`SELECT id, token FROM push_devices WHERE enabled = 1`).all();
  const rows = devices.results || [];
  if (!rows.length) return 0;

  const title = reminder ? "Website enquiry still waiting" : "New website enquiry";
  const identity = conversation.customer_name || conversation.project_type || "New visitor";
  const details = [identity, conversation.postcode, cleanText(latestMessage || conversation.project_brief || "New message", 220)]
    .filter(Boolean).join(" · ");
  const inboxBase = env.PUBLIC_CHAT_URL || "https://chat.en-suite.co.uk/inbox.html";
  const url = `${inboxBase}?chat=${encodeURIComponent(conversation.id)}`;

  let sent = 0;
  for (const device of rows) {
    const result = await sendFcmMessage(env, device.token, {
      title,
      body: details,
      url,
      tag: `ensuite-${conversation.id}`,
      conversationId: conversation.id
    });
    if (result.ok) sent += 1;
    if (result.invalid) {
      await env.DB.prepare(`UPDATE push_devices SET enabled = 0, updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), device.id).run();
    }
  }

  if (sent > 0) {
    await env.DB.prepare(`
      UPDATE conversations
      SET push_count = push_count + 1, last_push_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), conversation.id).run();
  }
  return sent;
}

async function sendUnreadReminders(env) {
  const now = Date.now();
  const result = await env.DB.prepare(`
    SELECT * FROM conversations
    WHERE unread > 0
      AND status = 'open'
      AND first_unread_at IS NOT NULL
      AND push_count IN (0, 1, 2)
    ORDER BY first_unread_at ASC
    LIMIT 50
  `).all();

  for (const conversation of result.results || []) {
    const ageMinutes = (now - Date.parse(conversation.first_unread_at)) / 60000;
    const due = (Number(conversation.push_count) === 0 && ageMinutes >= 1) ||
                (Number(conversation.push_count) === 1 && ageMinutes >= 2) ||
                (Number(conversation.push_count) === 2 && ageMinutes >= 5);
    if (!due) continue;
    await sendLeadAlert(env, conversation, conversation.project_brief || "The customer is waiting for a reply.", true);
  }
}

async function listPushDevices(env) {
  const result = await env.DB.prepare(`
    SELECT id, device_name, enabled, created_at, updated_at
    FROM push_devices
    ORDER BY updated_at DESC
  `).all();
  return json({ devices: result.results || [] });
}

async function registerPushDevice(request, env) {
  const data = await safeJson(request);
  const token = cleanText(data.token || "", 4096);
  const deviceName = cleanText(data.device_name || "Nicholas's phone", 120);
  if (!token) return json({ error: "Push token is required" }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO push_devices (token, device_name, enabled, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      device_name = excluded.device_name,
      enabled = 1,
      updated_at = excluded.updated_at
  `).bind(token, deviceName, now, now).run();
  return json({ ok: true });
}

async function removePushDevice(request, env) {
  const data = await safeJson(request);
  const token = cleanText(data.token || "", 4096);
  if (!token) return json({ error: "Push token is required" }, 400);
  await env.DB.prepare(`UPDATE push_devices SET enabled = 0, updated_at = ? WHERE token = ?`)
    .bind(new Date().toISOString(), token).run();
  return json({ ok: true });
}

async function sendTestPush(env) {
  const devices = await env.DB.prepare(`SELECT id, token FROM push_devices WHERE enabled = 1`).all();
  let sent = 0;
  for (const device of devices.results || []) {
    const result = await sendFcmMessage(env, device.token, {
      title: "En-Suite Leads test",
      body: "Phone alerts are working. Tap to open the enquiry inbox.",
      url: env.PUBLIC_CHAT_URL || "https://chat.en-suite.co.uk/inbox.html",
      tag: "ensuite-push-test",
      conversationId: "test"
    });
    if (result.ok) sent += 1;
    if (result.invalid) {
      await env.DB.prepare(`UPDATE push_devices SET enabled = 0, updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), device.id).run();
    }
  }
  return json({ ok: true, sent });
}

async function sendFcmMessage(env, token, payload) {
  if (!firebaseServerConfigured(env)) {
    return { ok: false, invalid: false, error: "Firebase server is not configured" };
  }
  try {
    const accessToken = await getGoogleAccessToken(env);
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        message: {
          token,
          data: {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag: payload.tag,
            conversation_id: payload.conversationId
          },
          webpush: {
            headers: { Urgency: "high", TTL: "1800" },
            fcm_options: { link: payload.url }
          }
        }
      })
    });
    if (response.ok) return { ok: true, invalid: false };
    const text = await response.text();
    const invalid = response.status === 404 || text.includes("UNREGISTERED") || text.includes("registration-token-not-registered");
    console.error("FCM send failed", response.status, text);
    return { ok: false, invalid, error: text };
  } catch (error) {
    console.error("FCM exception", error);
    return { ok: false, invalid: false, error: String(error) };
  }
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleTokenExpiresAt > now + 60) return cachedGoogleToken;

  const credentials = getFirebaseCredentials(env);
  if (!credentials.clientEmail || !credentials.privateKey) throw new Error("Firebase service account is not configured");
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlText(JSON.stringify({
    iss: credentials.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(String(credentials.privateKey || "").replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error(`Google token failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  cachedGoogleToken = data.access_token;
  cachedGoogleTokenExpiresAt = now + Number(data.expires_in || 3600);
  return cachedGoogleToken;
}

function firebaseServerConfigured(env) {
  const credentials = getFirebaseCredentials(env);
  return Boolean(env.FIREBASE_PROJECT_ID && credentials.clientEmail && credentials.privateKey);
}

function getFirebaseCredentials(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return { clientEmail: parsed.client_email || "", privateKey: parsed.private_key || "" };
    } catch (error) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON", error);
    }
  }
  return {
    clientEmail: env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: env.FIREBASE_PRIVATE_KEY || ""
  };
}

function getFirebasePublicConfig(env) {
  return {
    firebaseConfig: {
      apiKey: env.FIREBASE_API_KEY || "",
      authDomain: env.FIREBASE_AUTH_DOMAIN || "",
      projectId: env.FIREBASE_PROJECT_ID || "",
      storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: env.FIREBASE_APP_ID || ""
    },
    vapidKey: env.FIREBASE_VAPID_KEY || "",
    configured: Boolean(
      env.FIREBASE_API_KEY && env.FIREBASE_PROJECT_ID && env.FIREBASE_MESSAGING_SENDER_ID &&
      env.FIREBASE_APP_ID && env.FIREBASE_VAPID_KEY
    )
  };
}

function buildPushServiceWorker(env) {
  const publicConfig = getFirebasePublicConfig(env);
  return `
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");
const firebaseConfig = ${JSON.stringify(publicConfig.firebaseConfig)};
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || "New website enquiry", {
    body: data.body || "A customer has sent a message.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "ensuite-lead",
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 500],
    data: { url: data.url || "/inbox.html" }
  });
});
self.addEventListener("fetch", () => {});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/inbox.html";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ("focus" in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  }));
});
`;
}

async function getConversationByPublicToken(env, id, token) {
  if (!token) return null;
  return await env.DB.prepare(`SELECT * FROM conversations WHERE id = ? AND public_token = ?`).bind(id, token).first();
}

function assertAllowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = String(env.SITE_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new HttpError(403, "Origin not allowed");
}

function corsResponse(request, env, response) {
  const origin = request.headers.get("origin") || "";
  const allowed = String(env.SITE_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const headers = new Headers(response.headers);
  if (allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-headers", "content-type,x-chat-token");
    headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  }
  return new Response(response.body, { status: response.status, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function cleanText(value, maxLength) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
}

function normaliseProjectType(value) {
  const text = String(value).toLowerCase();
  if (text.includes("new") && text.includes("suite")) return "New en-suite";
  if (text.includes("bathroom")) return "Bathroom renovation";
  if (text.includes("cloak")) return "Cloakroom";
  if (text.includes("small") || text.includes("tap") || text.includes("toilet") || text.includes("tile")) return "Smaller bathroom work";
  return cleanText(value, 120);
}

function randomToken(bytes) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64Url(array);
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map(part => {
    const index = part.indexOf("=");
    if (index < 0) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret || ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

function pemToArrayBuffer(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function base64UrlText(value) {
  return base64Url(new TextEncoder().encode(value));
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(leftValue, rightValue) {
  const left = new TextEncoder().encode(String(leftValue));
  const right = new TextEncoder().encode(String(rightValue));
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
