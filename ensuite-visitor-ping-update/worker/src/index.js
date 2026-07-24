import webpush from "web-push";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_MESSAGE_LENGTH = 2000;
const ADMIN_COOKIE = "ensuite_admin";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (request.method === "OPTIONS") {
        return corsResponse(request, env, new Response(null, { status: 204 }));
      }

      if (pathname === "/health") {
        return json({ ok: true, service: "ensuite-whatsapp-chat", push: "web-push" });
      }

      if (pathname === "/push-config.json") {
        return json(getWebPushPublicConfig(env));
      }

      if (pathname === "/push-sw.js") {
        return new Response(buildPushServiceWorker(), {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store",
            "service-worker-allowed": "/"
          }
        });
      }

      if (pathname === "/api/site-visit" && request.method === "POST") {
        return corsResponse(request, env, await notifySiteVisit(request, env));
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

async function notifySiteVisit(request, env) {
  assertAllowedOrigin(request, env);
  const data = await safeJson(request);
  const pageUrl = cleanText(data.page_url || "", 1000);
  const pageTitle = cleanText(data.page_title || "", 200);
  const referrer = cleanText(data.referrer || "", 1000);
  const devices = await env.DB.prepare(`SELECT id, endpoint, p256dh, auth FROM push_devices WHERE enabled = 1`).all();
  const rows = devices.results || [];
  if (!rows.length) return json({ ok: true, sent: 0 });

  const pageLabel = getVisitorPageLabel(pageUrl, pageTitle);
  const sourceLabel = getVisitorSourceLabel(referrer);
  const details = sourceLabel ? `${pageLabel} · ${sourceLabel}` : `${pageLabel} · browsing now`;
  const inboxUrl = env.PUBLIC_CHAT_URL || "https://chat.en-suite.co.uk/inbox.html";
  const visitId = randomToken(8);

  let sent = 0;
  for (const device of rows) {
    const result = await sendWebPushMessage(env, device, {
      title: "New visitor on the website",
      body: `${details}. They have not started a chat yet.`,
      url: inboxUrl,
      tag: `ensuite-visitor-${visitId}`,
      kind: "site-visit"
    });
    if (result.ok) sent += 1;
    if (result.invalid) {
      await env.DB.prepare(`UPDATE push_devices SET enabled = 0, updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), device.id).run();
    }
  }

  return json({ ok: true, sent });
}

function getVisitorPageLabel(pageUrl, pageTitle) {
  try {
    const url = new URL(pageUrl);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const known = {
      "/": "Homepage",
      "/index.html": "Homepage",
      "/bathrooms.html": "Bathrooms page",
      "/en-suites.html": "En-suites page",
      "/cloakrooms.html": "Cloakrooms page",
      "/kitchens.html": "Kitchens page",
      "/general-building-work.html": "General building work page",
      "/smaller-bathroom-works.html": "Smaller bathroom works page",
      "/price-guide.html": "Price guide",
      "/contact.html": "Contact page"
    };
    if (known[path]) return known[path];
    const last = path.split("/").filter(Boolean).pop() || "Homepage";
    return last.replace(/\.html$/i, "").replace(/[-_]+/g, " ").replace(/\w/g, letter => letter.toUpperCase());
  } catch {
    const title = String(pageTitle || "").split(/[|–—]/)[0].trim();
    return title || "Website page";
  }
}

function getVisitorSourceLabel(referrer) {
  if (!referrer) return "direct visit";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (!host || host.endsWith("en-suite.co.uk")) return "browsing another page";
    if (host.includes("google.")) return "from Google";
    if (host.includes("bing.")) return "from Bing";
    if (host.includes("facebook.")) return "from Facebook";
    if (host.includes("instagram.")) return "from Instagram";
    return `from ${host}`;
  } catch {
    return "";
  }
}

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
  const availability = ownerOnline
    ? `${owner} is available and can join this chat live.`
    : `${owner} will be alerted as soon as you reply.`;
  const welcome = `Hi — you’re through to En-Suites & Bathrooms live chat. ${availability}\n\nBefore we start, what’s your first name?`;

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
    quick_replies: []
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
  const owner = env.OWNER_NAME || "Nicholas";

  if (step === 0) {
    const customerName = normaliseCustomerName(body);
    if (!customerName) {
      return {
        nextStep: 0,
        message: `Before I alert ${owner}, could I get your first name?`,
        updateSql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
        updateBindings: [now, id]
      };
    }
    return botStep(
      id,
      now,
      1,
      "customer_name",
      customerName,
      `Thanks, ${customerName}. I’m alerting ${owner} now so he can join this chat live. While I connect you, what are you planning? For example: a new en-suite, bathroom renovation, cloakroom or smaller bathroom work.`
    );
  }

  if (step === 1) {
    const projectType = normaliseProjectType(body);
    const detectedLocation = extractUkLocation(body);

    if (detectedLocation) {
      return {
        nextStep: 3,
        message: `Thanks — I’ve got the area. Briefly tell me what you would like done, or what is wrong with the current room. ${owner} can join this chat at any moment.`,
        updateSql: `
          UPDATE conversations
          SET project_type = ?, postcode = ?, step = 3, updated_at = ?
          WHERE id = ?
        `,
        updateBindings: [cleanText(projectType, 2000), cleanText(detectedLocation, 2000), now, id]
      };
    }

    return botStep(id, now, 2, "project_type", projectType, "What is the property postcode or area?");
  }
  if (step === 2) {
    return botStep(id, now, 3, "postcode", body, `Briefly tell me what you would like done, or what is wrong with the current room. ${owner} can join this chat at any moment.`);
  }
  if (step === 3) {
    return botStep(id, now, 4, "project_brief", body, "When are you hoping to start the work?");
  }
  if (step === 4) {
    return botStep(id, now, 5, "timing", body, `What is the best mobile number or email address for ${owner} to reach you if the chat disconnects?`);
  }
  if (step === 5) {
    return botStep(id, now, 6, "contact", body, `Thank you. Your enquiry is saved and ${owner} has been alerted. He can join this same live chat, so you will not need to repeat anything.`);
  }
  return {
    nextStep: step,
    message: `Thanks — I’ve added that to the enquiry. ${owner} has been alerted.`,
    updateSql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
    updateBindings: [now, id]
  };
}

function normaliseCustomerName(value) {
  let name = String(value || "").trim();
  name = name.replace(/^(?:my name is|i am|i'm|im|it is|it's)\s+/i, "").trim();
  name = name.replace(/[.!?,;:]+$/g, "").trim();
  if (name.length < 2 || name.length > 60) return "";
  if (name.split(/\s+/).length > 4) return "";
  if (!/^[\p{L}][\p{L}'’ -]*$/u.test(name)) return "";
  return name;
}

function extractUkLocation(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  // Full UK postcode first, then an outward code such as SW6 or W14.
  const fullPostcode = text.match(/\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][0-9]{1,2}|[A-PR-UWYZ][A-HK-Y][0-9]{1,2}|[A-PR-UWYZ][0-9][A-HJKSTUW]|[A-PR-UWYZ][A-HK-Y][0-9][ABEHMNPRVWXY])\s?[0-9][ABD-HJLNP-UW-Z]{2})\b/i);
  if (fullPostcode) return fullPostcode[0].toUpperCase().replace(/\s+/g, " ");

  const outwardCode = text.match(/\b[A-Z]{1,2}[0-9]{1,2}[A-Z]?\b/i);
  if (outwardCode) return outwardCode[0].toUpperCase();

  const areas = [
    "Fulham", "Hammersmith", "Kensington", "Chelsea", "Parsons Green",
    "Barons Court", "West Kensington", "Earls Court", "Shepherds Bush",
    "Putney", "Chiswick", "Acton", "Notting Hill", "Knightsbridge"
  ];
  const lower = text.toLowerCase();
  return areas.find((area) => lower.includes(area.toLowerCase())) || "";
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
    `).bind(conversationId, `${env.OWNER_NAME || "Nicholas"} has joined the chat live.`, now));
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
    `).bind(conversationId, `${env.OWNER_NAME || "Nicholas"} has joined the chat live.`).first();
    if (!prior) {
      await env.DB.prepare(`
        INSERT INTO messages (conversation_id, sender, body, created_at)
        VALUES (?, 'system', ?, ?)
      `).bind(conversationId, `${env.OWNER_NAME || "Nicholas"} has joined the chat live.`, now).run();
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
  const devices = await env.DB.prepare(`SELECT id, endpoint, p256dh, auth FROM push_devices WHERE enabled = 1`).all();
  const rows = devices.results || [];
  if (!rows.length) return 0;

  const identity = conversation.customer_name || conversation.project_type || "New visitor";
  const title = reminder ? `${identity} is still waiting` : `${identity} has started a live chat`;
  const messagePreview = cleanText(latestMessage || conversation.project_brief || "New message", 220);
  const detailParts = [identity, conversation.postcode].filter(Boolean);
  if (messagePreview && messagePreview.toLowerCase() !== String(identity).toLowerCase()) detailParts.push(messagePreview);
  const details = detailParts.join(" · ");
  const inboxBase = env.PUBLIC_CHAT_URL || "https://chat.en-suite.co.uk/inbox.html";
  const url = `${inboxBase}?chat=${encodeURIComponent(conversation.id)}`;

  let sent = 0;
  for (const device of rows) {
    const result = await sendWebPushMessage(env, device, {
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
    SELECT id, endpoint, device_name, enabled, created_at, updated_at
    FROM push_devices
    ORDER BY updated_at DESC
  `).all();
  return json({ devices: result.results || [] });
}

async function registerPushDevice(request, env) {
  const data = await safeJson(request);
  const subscription = data.subscription || {};
  const endpoint = cleanText(subscription.endpoint || "", 4096);
  const p256dh = cleanText(subscription.keys?.p256dh || "", 1024);
  const auth = cleanText(subscription.keys?.auth || "", 512);
  const deviceName = cleanText(data.device_name || "Nicholas's phone", 120);
  if (!endpoint || !p256dh || !auth) return json({ error: "Complete push subscription is required" }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO push_devices (endpoint, p256dh, auth, device_name, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      device_name = excluded.device_name,
      enabled = 1,
      updated_at = excluded.updated_at
  `).bind(endpoint, p256dh, auth, deviceName, now, now).run();
  return json({ ok: true, endpoint });
}

async function removePushDevice(request, env) {
  const data = await safeJson(request);
  const endpoint = cleanText(data.endpoint || "", 4096);
  if (!endpoint) return json({ error: "Push endpoint is required" }, 400);
  await env.DB.prepare(`UPDATE push_devices SET enabled = 0, updated_at = ? WHERE endpoint = ?`)
    .bind(new Date().toISOString(), endpoint).run();
  return json({ ok: true });
}

async function sendTestPush(env) {
  const devices = await env.DB.prepare(`
    SELECT id, endpoint, p256dh, auth
    FROM push_devices
    WHERE enabled = 1
  `).all();
  let sent = 0;
  for (const device of devices.results || []) {
    const result = await sendWebPushMessage(env, device, {
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

async function sendWebPushMessage(env, device, payload) {
  if (!webPushServerConfigured(env)) {
    return { ok: false, invalid: false, error: "Web Push is not configured" };
  }
  try {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT || "https://en-suite.co.uk",
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );
    await webpush.sendNotification(
      {
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth }
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        conversation_id: payload.conversationId
      }),
      { TTL: 1800, urgency: "high" }
    );
    return { ok: true, invalid: false };
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status || 0);
    const invalid = statusCode === 404 || statusCode === 410;
    console.error("Web Push failed", statusCode, error?.message || String(error));
    return { ok: false, invalid, error: error?.message || String(error) };
  }
}

function webPushServerConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function getWebPushPublicConfig(env) {
  return {
    vapidPublicKey: env.VAPID_PUBLIC_KEY || "",
    configured: webPushServerConfigured(env)
  };
}

function buildPushServiceWorker() {
  return `
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "New website enquiry";
  const options = {
    body: data.body || "A customer has sent a message.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "ensuite-lead",
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 500],
    data: { url: data.url || "/inbox.html" }
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) client.postMessage({ type: "ensuite-push", payload: data });
    })
  ]));
});
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
self.addEventListener("fetch", () => {});
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
