import webpush from "web-push";

const BUNDLED_WIDGET_JS = "(() => {\n  if (window.__ENSUITE_CHAT_LOADED__) return;\n  window.__ENSUITE_CHAT_LOADED__ = true;\n\n\n  // Remove the old Tawk.to widget so only this live chat appears.\n  const hideTawk = () => {\n    try { window.Tawk_API?.hideWidget?.(); } catch {}\n    const selectors = [\n      'script[src*=\"embed.tawk.to\"]',\n      'iframe[src*=\"tawk.to\"]',\n      '#tawkchat-container',\n      '[id^=\"tawk_\"]',\n      '[id^=\"tawk-\"]',\n      '[class*=\"tawk-\"]'\n    ];\n    for (const node of document.querySelectorAll(selectors.join(','))) {\n      try { node.remove(); } catch { node.style.display = 'none'; }\n    }\n  };\n  const tawkBlockStyle = document.createElement('style');\n  tawkBlockStyle.textContent = 'iframe[src*=\"tawk.to\"],#tawkchat-container,[id^=\"tawk_\"],[id^=\"tawk-\"],[class*=\"tawk-\"]{display:none!important;visibility:hidden!important}';\n  document.head.appendChild(tawkBlockStyle);\n  hideTawk();\n  const tawkObserver = new MutationObserver(hideTawk);\n  tawkObserver.observe(document.documentElement, { childList: true, subtree: true });\n  setTimeout(hideTawk, 500);\n  setTimeout(hideTawk, 2000);\n\n  const script = document.currentScript;\n  const apiBase = (script?.dataset.api || new URL(script.src).origin).replace(/\\/$/, \"\");\n  const whatsappNumber = String(script?.dataset.whatsapp || \"\").replace(/\\D/g, \"\");\n  const storeKey = \"ensuite_live_chat_v4\";\n  const visitPingKey = \"ensuite_site_visit_ping_v1\";\n  const visitPingCooldownMs = 30 * 60 * 1000;\n  const state = {\n    id: null,\n    token: null,\n    lastMessageId: 0,\n    polling: null,\n    sending: false\n  };\n\n  try {\n    const saved = JSON.parse(localStorage.getItem(storeKey) || \"null\");\n    if (saved?.id && saved?.token) {\n      state.id = saved.id;\n      state.token = saved.token;\n    }\n  } catch {\n    localStorage.removeItem(storeKey);\n  }\n\n  const style = document.createElement(\"style\");\n  style.textContent = `\n    .eb-chat-launch{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:16px;background:#102a43;color:#fff;padding:12px 17px;font:700 15px/1.2 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:11px;text-align:left;max-width:min(310px,calc(100vw - 24px))}\n    .eb-chat-launch-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;background:#25d366;box-shadow:0 0 0 4px rgba(37,211,102,.18)}\n    .eb-chat-launch-copy{display:flex;flex-direction:column;gap:2px}.eb-chat-launch-copy strong{font-size:15px;line-height:1.2}.eb-chat-launch-copy small{font:400 11px/1.25 Arial,sans-serif;opacity:.86}\n    .eb-chat-panel{position:fixed;right:18px;bottom:78px;z-index:2147483000;width:min(400px,calc(100vw - 24px));height:min(650px,calc(100vh - 106px));background:#efeae2;border:1px solid #d7dee7;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.28);display:none;overflow:hidden;font:15px/1.45 Arial,sans-serif;color:#102a43}\n    .eb-chat-panel.open{display:flex;flex-direction:column}\n    .eb-chat-head{background:#102a43;color:#fff;padding:13px 14px;display:flex;justify-content:space-between;align-items:center;min-height:64px}\n    .eb-chat-profile{display:flex;align-items:center;gap:10px}.eb-chat-avatar{width:39px;height:39px;border-radius:50%;background:#fff;color:#102a43;display:grid;place-items:center;font-weight:800;font-size:13px}.eb-chat-head strong{display:block;font-size:15px}.eb-chat-head small{display:block;opacity:.82;font-size:12px;margin-top:1px}.eb-chat-close{background:transparent;color:#fff;border:0;font-size:26px;cursor:pointer;padding:4px 6px}\n    .eb-chat-messages{flex:1;overflow:auto;padding:16px 12px;background-color:#efeae2;background-image:radial-gradient(rgba(16,42,67,.035) 1px,transparent 1px);background-size:12px 12px}\n    .eb-msg{position:relative;max-width:84%;padding:8px 10px 7px;border-radius:8px;margin:0 0 8px;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 1px rgba(0,0,0,.08)}\n    .eb-msg.bot,.eb-msg.system{background:#fff;border-top-left-radius:2px}\n    .eb-msg.customer{background:#d9fdd3;margin-left:auto;border-top-right-radius:2px;color:#1f2933}\n    .eb-msg.owner{background:#d9fdd3;border-top-left-radius:2px}\n    .eb-msg.system{font-size:12px;color:#486581;text-align:center;max-width:92%;margin-left:auto;margin-right:auto;background:#fff7d6}\n    .eb-quick{display:flex;flex-wrap:wrap;gap:7px;margin:4px 0 12px}.eb-quick button{border:1px solid #102a43;background:#fff;color:#102a43;border-radius:999px;padding:7px 10px;cursor:pointer;font:600 13px Arial,sans-serif}\n    .eb-chat-error{padding:8px 12px;background:#fff2f2;color:#a61b1b;font-size:13px;display:none}\n    .eb-chat-actions{padding:8px 10px 0;background:#f7f8f8}.eb-chat-whatsapp{display:none;width:100%;text-align:center;text-decoration:none;border:1px solid #25d366;color:#087b36;background:#fff;border-radius:9px;padding:9px;font:700 13px Arial,sans-serif}.eb-chat-whatsapp.show{display:block}\n    .eb-chat-form{display:flex;gap:8px;padding:9px 10px;background:#f7f8f8}.eb-chat-form textarea{flex:1;resize:none;min-height:44px;max-height:104px;border:0;border-radius:22px;padding:12px 15px;font:15px Arial,sans-serif;outline:none;box-shadow:0 0 0 1px #d9e2ec inset}.eb-chat-form button{border:0;width:44px;height:44px;border-radius:50%;background:#102a43;color:#fff;font-weight:800;cursor:pointer;font-size:18px}\n    .eb-chat-note{font-size:10px;color:#627d98;padding:0 12px 9px;background:#f7f8f8;text-align:center}\n    @media(max-width:520px){.eb-chat-launch{right:12px;bottom:12px}.eb-chat-panel{right:6px;bottom:68px;width:calc(100vw - 12px);height:calc(100vh - 82px);border-radius:14px}}\n  `;\n  document.head.appendChild(style);\n\n  const launch = document.createElement(\"button\");\n  launch.className = \"eb-chat-launch\";\n  launch.type = \"button\";\n  launch.innerHTML = '<span class=\"eb-chat-launch-dot\"></span><span class=\"eb-chat-launch-copy\"><strong>Chat to a human live now</strong><small>Nicholas is alerted instantly</small></span>';\n  launch.setAttribute(\"aria-label\", \"Open En-Suites & Bathrooms live chat\");\n\n  const panel = document.createElement(\"section\");\n  panel.className = \"eb-chat-panel\";\n  panel.setAttribute(\"aria-label\", \"En-Suites & Bathrooms chat\");\n  panel.innerHTML = `\n    <div class=\"eb-chat-head\">\n      <div class=\"eb-chat-profile\"><div class=\"eb-chat-avatar\">E&amp;B</div><div><strong>Live chat \u2014 En-Suites &amp; Bathrooms</strong><small class=\"eb-chat-status\">Send a message \u00b7 Nicholas is alerted instantly</small></div></div>\n      <button class=\"eb-chat-close\" type=\"button\" aria-label=\"Close chat\">\u00d7</button>\n    </div>\n    <div class=\"eb-chat-error\"></div>\n    <div class=\"eb-chat-messages\" aria-live=\"polite\"></div>\n    <div class=\"eb-chat-actions\"><a class=\"eb-chat-whatsapp\" target=\"_blank\" rel=\"noopener\">Continue on WhatsApp</a></div>\n    <form class=\"eb-chat-form\"><textarea rows=\"1\" maxlength=\"2000\" placeholder=\"Type a message\" aria-label=\"Message\"></textarea><button type=\"submit\" aria-label=\"Send message\">\u27a4</button></form>\n    <div class=\"eb-chat-note\">Your message is saved and Nicholas is alerted. Do not include card details.</div>\n  `;\n\n  document.body.append(launch, panel);\n  window.setTimeout(notifyOwnerOfVisit, 5000);\n  const messagesEl = panel.querySelector(\".eb-chat-messages\");\n  const form = panel.querySelector(\".eb-chat-form\");\n  const input = form.querySelector(\"textarea\");\n  const errorEl = panel.querySelector(\".eb-chat-error\");\n  const whatsappLink = panel.querySelector(\".eb-chat-whatsapp\");\n  const statusText = panel.querySelector(\".eb-chat-status\");\n\n  if (whatsappNumber) {\n    const text = \"Hi Nicholas, I was using the En-Suites & Bathrooms website chat and would like to continue here.\";\n    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;\n    whatsappLink.classList.add(\"show\");\n  }\n\n  launch.addEventListener(\"click\", async () => {\n    panel.classList.add(\"open\");\n    launch.style.display = \"none\";\n    try {\n      await ensureConversation();\n      startPolling();\n      input.focus();\n    } catch {\n      showError(\"The chat could not open. Please use WhatsApp or call us.\");\n    }\n  });\n\n  panel.querySelector(\".eb-chat-close\").addEventListener(\"click\", () => {\n    panel.classList.remove(\"open\");\n    launch.style.display = \"flex\";\n    stopPolling();\n  });\n\n  input.addEventListener(\"keydown\", event => {\n    if (event.key === \"Enter\" && !event.shiftKey) {\n      event.preventDefault();\n      form.requestSubmit();\n    }\n  });\n\n  form.addEventListener(\"submit\", async event => {\n    event.preventDefault();\n    const body = input.value.trim();\n    if (!body || state.sending) return;\n    state.sending = true;\n    input.value = \"\";\n    try {\n      await ensureConversation();\n      const response = await fetch(`${apiBase}/api/conversations/${state.id}/messages`, {\n        method: \"POST\",\n        headers: { \"content-type\": \"application/json\", \"x-chat-token\": state.token },\n        body: JSON.stringify({ body })\n      });\n      if (!response.ok) throw new Error(\"Message failed\");\n      await pollMessages();\n    } catch {\n      input.value = body;\n      showError(\"Your message may not have sent. Please try again or use WhatsApp.\");\n    } finally {\n      state.sending = false;\n      input.focus();\n    }\n  });\n\n  async function notifyOwnerOfVisit() {\n    if (document.visibilityState !== \"visible\" || navigator.webdriver) return;\n\n    const now = Date.now();\n    try {\n      const lastPing = Number(localStorage.getItem(visitPingKey) || 0);\n      if (lastPing && now - lastPing < visitPingCooldownMs) return;\n    } catch {\n      // Storage may be unavailable. The backend still receives only this page-load attempt.\n    }\n\n    try {\n      const response = await fetch(`${apiBase}/api/site-visit`, {\n        method: \"POST\",\n        headers: { \"content-type\": \"application/json\" },\n        keepalive: true,\n        body: JSON.stringify({\n          page_url: location.href,\n          page_title: document.title,\n          referrer: document.referrer\n        })\n      });\n      if (!response.ok) return;\n      try { localStorage.setItem(visitPingKey, String(now)); } catch {}\n    } catch {\n      // A visit alert must never interfere with the public website or chat.\n    }\n  }\n\n  async function ensureConversation() {\n    if (state.id && state.token) {\n      const existing = await pollMessages();\n      if (existing !== false) return;\n      state.id = null;\n      state.token = null;\n      state.lastMessageId = 0;\n      localStorage.removeItem(storeKey);\n      messagesEl.innerHTML = \"\";\n    }\n\n    const response = await fetch(`${apiBase}/api/conversations`, {\n      method: \"POST\",\n      headers: { \"content-type\": \"application/json\" },\n      body: JSON.stringify({ page_url: location.href, referrer: document.referrer })\n    });\n    if (!response.ok) throw new Error(\"Could not start chat\");\n    const data = await response.json();\n    state.id = data.conversation_id;\n    state.token = data.public_token;\n    localStorage.setItem(storeKey, JSON.stringify({ id: state.id, token: state.token }));\n    (data.messages || []).forEach(renderMessage);\n    renderQuickReplies(data.quick_replies || []);\n  }\n\n  async function pollMessages() {\n    if (!state.id || !state.token) return false;\n    const response = await fetch(`${apiBase}/api/conversations/${state.id}/messages?after=${state.lastMessageId}`, {\n      headers: { \"x-chat-token\": state.token }\n    });\n    if (response.status === 404) return false;\n    if (!response.ok) return true;\n    const data = await response.json();\n    if (statusText) {\n      statusText.textContent = data.mode === \"human\"\n        ? \"Nicholas is live in this chat\"\n        : \"Nicholas has been alerted and can join live\";\n    }\n    (data.messages || []).forEach(message => {\n      if (!messagesEl.querySelector(`[data-message-id=\"${message.id}\"]`)) renderMessage(message);\n    });\n    return true;\n  }\n\n  function renderMessage(message) {\n    const div = document.createElement(\"div\");\n    div.className = `eb-msg ${message.sender}`;\n    if (message.id) {\n      div.dataset.messageId = String(message.id);\n      state.lastMessageId = Math.max(state.lastMessageId, Number(message.id));\n    }\n    div.textContent = message.body;\n    if (message.sender === \"owner\" && statusText) statusText.textContent = \"Nicholas is live in this chat\";\n    messagesEl.appendChild(div);\n    messagesEl.scrollTop = messagesEl.scrollHeight;\n  }\n\n  function renderQuickReplies(items) {\n    if (!items.length) return;\n    const wrap = document.createElement(\"div\");\n    wrap.className = \"eb-quick\";\n    items.forEach(label => {\n      const button = document.createElement(\"button\");\n      button.type = \"button\";\n      button.textContent = label;\n      button.addEventListener(\"click\", () => {\n        input.value = label;\n        wrap.remove();\n        form.requestSubmit();\n      });\n      wrap.appendChild(button);\n    });\n    messagesEl.appendChild(wrap);\n    messagesEl.scrollTop = messagesEl.scrollHeight;\n  }\n\n  function startPolling() {\n    stopPolling();\n    state.polling = window.setInterval(pollMessages, 2200);\n  }\n\n  function stopPolling() {\n    if (state.polling) window.clearInterval(state.polling);\n    state.polling = null;\n  }\n\n  function showError(message) {\n    errorEl.textContent = message;\n    errorEl.style.display = \"block\";\n    window.setTimeout(() => { errorEl.style.display = \"none\"; }, 8000);\n  }\n})();\n";
const BUNDLED_INBOX_HTML = "<!doctype html>\n<html lang=\"en-GB\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n  <meta name=\"robots\" content=\"noindex,nofollow\">\n  <meta name=\"theme-color\" content=\"#102a43\">\n  <link rel=\"manifest\" href=\"/manifest.webmanifest\">\n  <link rel=\"icon\" href=\"/icon-192.png\">\n  <title>En-Suite Leads</title>\n  <style>\n    :root{font-family:Arial,Helvetica,sans-serif;color:#1f2933;background:#dfe5e7;--navy:#102a43;--navy2:#163f5f;--green:#25d366;--chat:#efeae2;--mine:#d9fdd3;--line:#d9e2ec}*{box-sizing:border-box}body{margin:0;min-height:100vh;overflow:hidden}button,input,textarea,select{font:inherit}.hidden{display:none!important}\n    .login{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,var(--navy) 0 220px,#e9edef 220px)}.login-card{width:min(430px,100%);background:#fff;border-radius:16px;padding:28px;box-shadow:0 15px 50px rgba(0,0,0,.2)}.brand{display:flex;gap:13px;align-items:center}.brand-icon{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:800}.login h1{font-size:22px;margin:0}.login p{color:#627d98}.login input{width:100%;padding:13px;border:1px solid #bcccdc;border-radius:9px;margin:10px 0}.primary{border:0;background:var(--navy);color:#fff;padding:11px 15px;border-radius:9px;font-weight:700;cursor:pointer}.primary:disabled{opacity:.5;cursor:not-allowed}\n    .app{height:100dvh;display:grid;grid-template-columns:380px 1fr;background:#fff}.sidebar{background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;min-width:0}.side-head{background:var(--navy);color:#fff;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}.side-title{display:flex;align-items:center;gap:10px}.side-avatar{width:40px;height:40px;border-radius:50%;background:#fff;color:var(--navy);display:grid;place-items:center;font-size:12px;font-weight:800}.side-head h1{font-size:16px;margin:0}.side-head small{opacity:.82}.side-tools{display:flex;gap:6px}.icon-btn{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:8px;cursor:pointer}.push-bar{padding:10px 12px;background:#fff7d6;border-bottom:1px solid #eadfa6;font-size:13px;display:flex;align-items:center;gap:8px;justify-content:space-between}.push-bar.success{background:#e6f7ec;border-color:#b7e4c7}.push-bar button{border:0;background:var(--navy);color:#fff;border-radius:7px;padding:7px 9px;font-weight:700;cursor:pointer}.filter{padding:9px 12px;background:#fff}.filter input{width:100%;border:0;background:#f0f2f5;border-radius:9px;padding:10px 12px;outline:none}.conversation-list{overflow:auto;flex:1}.conversation{padding:12px 14px;border-top:1px solid #edf1f4;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:5px 10px}.conversation:hover,.conversation.active{background:#f0f2f5}.conversation-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.conversation-time{font-size:11px;color:#829ab1}.conversation-preview{font-size:13px;color:#627d98;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{background:#c53030;color:#fff;border-radius:999px;min-width:21px;height:21px;display:grid;place-items:center;font-size:11px;padding:0 6px}.status-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#25d366;margin-right:4px}\n    .main{display:flex;flex-direction:column;min-width:0;background:var(--chat)}.main-empty{margin:auto;text-align:center;color:#627d98;padding:30px}.main-empty img{width:90px;height:90px;border-radius:50%;opacity:.92}.chat-view{height:100%;display:flex;flex-direction:column}.main-head{background:#f0f2f5;border-bottom:1px solid #d7dee7;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px}.chat-person{display:flex;align-items:center;gap:10px;min-width:0}.chat-avatar{width:40px;height:40px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:800}.chat-title-wrap{min-width:0}.chat-title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chat-meta{font-size:12px;color:#627d98;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:58vw}.actions{display:flex;gap:7px;align-items:center}.actions button,.actions select,.whatsapp-btn{border:1px solid #bcccdc;background:#fff;color:#243b53;padding:8px 9px;border-radius:8px;cursor:pointer;text-decoration:none;font-size:13px}.actions .live{background:var(--navy);color:#fff;border-color:var(--navy)}.whatsapp-btn{background:#25d366;color:#063b1b;border-color:#20bd5a;font-weight:700}.messages{flex:1;overflow:auto;padding:18px 6%;background-color:var(--chat);background-image:radial-gradient(rgba(16,42,67,.035) 1px,transparent 1px);background-size:12px 12px}.msg-row{display:flex;margin-bottom:6px}.msg-row.customer{justify-content:flex-end}.msg{max-width:min(72%,650px);padding:8px 10px 6px;border-radius:8px;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.08);white-space:pre-wrap;word-break:break-word}.msg-row.customer .msg,.msg-row.owner .msg{background:var(--mine)}.msg-row.owner{justify-content:flex-start}.msg-row.system{justify-content:center}.msg-row.system .msg{font-size:12px;color:#486581;background:#fff7d6;text-align:center}.msg-time{display:block;font-size:10px;color:#829ab1;text-align:right;margin-top:4px}.reply{display:flex;align-items:flex-end;gap:8px;background:#f0f2f5;border-top:1px solid #d9e2ec;padding:10px 12px}.reply textarea{flex:1;resize:none;border:0;border-radius:22px;padding:12px 15px;min-height:44px;max-height:110px;outline:none}.send{border:0;width:44px;height:44px;border-radius:50%;background:var(--navy);color:#fff;font-size:18px;cursor:pointer}.mobile-back{display:none}.toast{position:fixed;top:18px;left:50%;transform:translateX(-50%);background:#102a43;color:#fff;padding:11px 16px;border-radius:9px;box-shadow:0 8px 30px rgba(0,0,0,.25);z-index:9999;max-width:90vw}.install-note{font-size:11px;opacity:.82;margin-top:2px}\n    @media(max-width:820px){body{overflow:hidden}.app{grid-template-columns:1fr}.sidebar{height:100dvh}.main{display:none;height:100dvh}.app.chat-open .sidebar{display:none}.app.chat-open .main{display:flex}.mobile-back{display:inline-grid;place-items:center;border:0;background:transparent;font-size:22px;padding:4px}.chat-meta{max-width:54vw}.actions select{display:none}.messages{padding:15px 10px}.msg{max-width:84%}.main-head{padding:8px}.actions button,.whatsapp-btn{padding:7px 8px;font-size:12px}.chat-avatar{width:36px;height:36px}.reply{padding-bottom:calc(10px + env(safe-area-inset-bottom))}}\n  </style>\n</head>\n<body>\n  <section id=\"login\" class=\"login\">\n    <div class=\"login-card\">\n      <div class=\"brand\"><div class=\"brand-icon\">E&amp;B</div><div><h1>En-Suite Leads</h1><small>Website chat inbox</small></div></div>\n      <p>Sign in to receive and answer website enquiries.</p>\n      <form id=\"loginForm\"><input id=\"password\" type=\"password\" autocomplete=\"current-password\" placeholder=\"Admin password\" required><button class=\"primary\" type=\"submit\">Sign in</button></form>\n      <p id=\"loginError\" style=\"color:#b91c1c\"></p>\n    </div>\n  </section>\n\n  <div id=\"app\" class=\"app hidden\">\n    <aside class=\"sidebar\">\n      <header class=\"side-head\">\n        <div class=\"side-title\"><div class=\"side-avatar\">E&amp;B</div><div><h1>Website enquiries</h1><small><span class=\"status-dot\"></span>Live inbox open</small><div id=\"installText\" class=\"install-note\"></div></div></div>\n        <div class=\"side-tools\"><button id=\"installButton\" class=\"icon-btn hidden\" title=\"Install app\">Install</button><button id=\"logoutButton\" class=\"icon-btn\" title=\"Log out\">Log out</button></div>\n      </header>\n      <div id=\"pushBar\" class=\"push-bar\"><span id=\"pushText\">Enable phone alerts so no lead is missed.</span><button id=\"enablePushButton\">Enable alerts</button></div>\n      <div class=\"filter\"><input id=\"filterInput\" type=\"search\" placeholder=\"Search enquiries\"></div>\n      <div id=\"conversationList\" class=\"conversation-list\"></div>\n    </aside>\n\n    <main class=\"main\">\n      <div id=\"emptyState\" class=\"main-empty\"><img src=\"/icon-192.png\" alt=\"\"><h2>Select an enquiry</h2><p>New website chats will appear here.</p></div>\n      <section id=\"chatView\" class=\"chat-view hidden\">\n        <header class=\"main-head\">\n          <div class=\"chat-person\"><button id=\"backButton\" class=\"mobile-back\" aria-label=\"Back\">\u2190</button><div class=\"chat-avatar\" id=\"chatAvatar\">?</div><div class=\"chat-title-wrap\"><div id=\"chatTitle\" class=\"chat-title\">Waiting for name</div><div id=\"chatMeta\" class=\"chat-meta\"></div></div></div>\n          <div class=\"actions\"><a id=\"customerWhatsApp\" class=\"whatsapp-btn hidden\" target=\"_blank\" rel=\"noopener\">WhatsApp</a><button id=\"takeoverButton\" class=\"live\">Take over</button><select id=\"statusSelect\"><option value=\"open\">Open</option><option value=\"survey-booked\">Survey booked</option><option value=\"quoting\">Quoting</option><option value=\"won\">Won</option><option value=\"lost\">Lost</option><option value=\"closed\">Closed</option></select></div>\n        </header>\n        <div id=\"messages\" class=\"messages\"></div>\n        <form id=\"replyForm\" class=\"reply\"><textarea id=\"replyText\" rows=\"1\" placeholder=\"Message as Nicholas\" disabled></textarea><button id=\"sendButton\" class=\"send\" type=\"submit\" disabled aria-label=\"Send\">\u27a4</button></form>\n      </section>\n    </main>\n  </div>\n  <div id=\"toast\" class=\"toast hidden\"></div>\n\n  <script>\n    const state = { selected:null, conversations:[], lastUnreadTotal:0, pushEndpoint:null, installPrompt:null, timersStarted:false };\n    const login = document.getElementById('login');\n    const app = document.getElementById('app');\n    const list = document.getElementById('conversationList');\n    const messages = document.getElementById('messages');\n    const replyText = document.getElementById('replyText');\n    const sendButton = document.getElementById('sendButton');\n    const chatView = document.getElementById('chatView');\n    const emptyState = document.getElementById('emptyState');\n    const pushBar = document.getElementById('pushBar');\n    const pushText = document.getElementById('pushText');\n    const enablePushButton = document.getElementById('enablePushButton');\n\n    window.addEventListener('beforeinstallprompt', event => {\n      event.preventDefault();\n      state.installPrompt = event;\n      document.getElementById('installButton').classList.remove('hidden');\n      document.getElementById('installText').textContent = 'Install this like an app';\n    });\n\n    window.addEventListener('appinstalled', () => {\n      document.getElementById('installButton').classList.add('hidden');\n      document.getElementById('installText').textContent = 'Installed on this device';\n      state.installPrompt = null;\n    });\n\n    document.getElementById('installButton').addEventListener('click', async () => {\n      if (!state.installPrompt) return;\n      state.installPrompt.prompt();\n      await state.installPrompt.userChoice;\n      state.installPrompt = null;\n    });\n\n    document.getElementById('loginForm').addEventListener('submit', async event => {\n      event.preventDefault();\n      const response = await fetch('/api/admin/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ password:document.getElementById('password').value }) });\n      if (!response.ok) { document.getElementById('loginError').textContent = 'Incorrect password.'; return; }\n      await showApp();\n    });\n\n    document.getElementById('logoutButton').addEventListener('click', async () => { await fetch('/api/admin/logout', { method:'POST' }); location.reload(); });\n    document.getElementById('backButton').addEventListener('click', () => app.classList.remove('chat-open'));\n    document.getElementById('filterInput').addEventListener('input', renderList);\n    enablePushButton.addEventListener('click', enablePush);\n\n    document.getElementById('takeoverButton').addEventListener('click', async () => {\n      if (!state.selected) return;\n      await fetch('/api/admin/conversations/' + state.selected + '/takeover', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ mode:'human' }) });\n      await loadConversation(state.selected, true);\n      await loadList();\n    });\n\n    document.getElementById('statusSelect').addEventListener('change', async event => {\n      if (!state.selected) return;\n      await fetch('/api/admin/conversations/' + state.selected + '/status', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ status:event.target.value }) });\n      await loadList();\n    });\n\n    replyText.addEventListener('keydown', event => {\n      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('replyForm').requestSubmit(); }\n    });\n\n    document.getElementById('replyForm').addEventListener('submit', async event => {\n      event.preventDefault();\n      const body = replyText.value.trim();\n      if (!body || !state.selected) return;\n      replyText.value = '';\n      const response = await fetch('/api/admin/conversations/' + state.selected + '/reply', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ body }) });\n      if (!response.ok) { replyText.value = body; showToast('Message did not send. Try again.'); return; }\n      await loadConversation(state.selected, true);\n      await loadList();\n    });\n\n    async function showApp() {\n      login.classList.add('hidden');\n      app.classList.remove('hidden');\n      await heartbeat();\n      await loadList();\n      await updatePushState();\n      if (!state.timersStarted) {\n        state.timersStarted = true;\n        setInterval(heartbeat, 30000);\n        setInterval(loadList, 3000);\n        setInterval(() => { if (state.selected) loadConversation(state.selected, false); }, 2200);\n      }\n      const target = new URLSearchParams(location.search).get('chat');\n      if (target) await selectConversation(target);\n    }\n\n    async function heartbeat() {\n      const response = await fetch('/api/admin/heartbeat', { method:'POST' });\n      if (response.status === 401) location.reload();\n    }\n\n    async function loadList() {\n      const response = await fetch('/api/admin/conversations');\n      if (response.status === 401) { login.classList.remove('hidden'); app.classList.add('hidden'); return; }\n      const data = await response.json();\n      state.conversations = data.conversations || [];\n      renderList();\n      const total = state.conversations.reduce((sum, conversation) => sum + Number(conversation.unread || 0), 0);\n      document.title = total ? '(' + total + ') En-Suite Leads' : 'En-Suite Leads';\n      if (total > state.lastUnreadTotal) beep();\n      state.lastUnreadTotal = total;\n    }\n\n    function renderList() {\n      const query = document.getElementById('filterInput').value.trim().toLowerCase();\n      const filtered = state.conversations.filter(conversation => JSON.stringify(conversation).toLowerCase().includes(query));\n      list.innerHTML = '';\n      filtered.forEach(conversation => {\n        const element = document.createElement('div');\n        element.className = 'conversation' + (state.selected === conversation.id ? ' active' : '');\n        const name = conversation.customer_name || 'Waiting for name';\n        const preview = conversation.project_brief || conversation.contact || 'Waiting for details';\n        element.innerHTML = '<div class=\"conversation-name\">' + escapeHtml(name) + '</div><div class=\"conversation-time\">' + escapeHtml(shortTime(conversation.updated_at)) + '</div><div class=\"conversation-preview\">' + escapeHtml([conversation.postcode, preview].filter(Boolean).join(' \u00b7 ')) + '</div>' + (conversation.unread ? '<div class=\"badge\">' + Number(conversation.unread) + '</div>' : '<div></div>');\n        element.addEventListener('click', () => selectConversation(conversation.id));\n        list.appendChild(element);\n      });\n      if (!filtered.length) list.innerHTML = '<div style=\"padding:25px;color:#627d98;text-align:center\">No enquiries found.</div>';\n    }\n\n    async function selectConversation(id) {\n      state.selected = id;\n      app.classList.add('chat-open');\n      chatView.classList.remove('hidden');\n      emptyState.classList.add('hidden');\n      replyText.disabled = false;\n      sendButton.disabled = false;\n      await fetch('/api/admin/conversations/' + id + '/acknowledge', { method:'POST' });\n      await loadConversation(id, true);\n      await loadList();\n      replyText.focus();\n    }\n\n    async function loadConversation(id, scroll) {\n      const response = await fetch('/api/admin/conversations/' + id + '/messages');\n      if (!response.ok) return;\n      const data = await response.json();\n      const conversation = data.conversation;\n      const name = conversation.customer_name || 'Waiting for name';\n      document.getElementById('chatTitle').textContent = name;\n      document.getElementById('chatAvatar').textContent = initials(name);\n      document.getElementById('chatMeta').textContent = [conversation.contact, conversation.postcode, conversation.project_type, conversation.timing].filter(Boolean).join(' \u00b7 ');\n      document.getElementById('statusSelect').value = conversation.status;\n      document.getElementById('takeoverButton').textContent = conversation.mode === 'human' ? 'You are live' : 'Take over';\n      configureCustomerWhatsApp(conversation.contact, name);\n      messages.innerHTML = '';\n      (data.messages || []).forEach(message => {\n        const row = document.createElement('div');\n        row.className = 'msg-row ' + message.sender;\n        const bubble = document.createElement('div');\n        bubble.className = 'msg';\n        const body = document.createElement('span');\n        body.textContent = message.body;\n        const time = document.createElement('span');\n        time.className = 'msg-time';\n        time.textContent = shortTime(message.created_at);\n        bubble.append(body, time);\n        row.appendChild(bubble);\n        messages.appendChild(row);\n      });\n      if (scroll) messages.scrollTop = messages.scrollHeight;\n    }\n\n    function configureCustomerWhatsApp(contact, name) {\n      const link = document.getElementById('customerWhatsApp');\n      const number = normaliseUkPhone(contact || '');\n      if (!number) { link.classList.add('hidden'); link.removeAttribute('href'); return; }\n      const text = 'Hi ' + name + ', Nicholas here from En-Suites & Bathrooms. Thanks for contacting us through the website.';\n      link.href = 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);\n      link.classList.remove('hidden');\n    }\n\n    async function updatePushState() {\n      if (!(\"Notification\" in window) || !(\"serviceWorker\" in navigator) || !(\"PushManager\" in window)) {\n        pushText.textContent = \"This browser cannot receive phone alerts.\";\n        enablePushButton.classList.add(\"hidden\");\n        return;\n      }\n      navigator.serviceWorker.addEventListener(\"message\", event => {\n        if (event.data?.type !== \"ensuite-push\") return;\n        beep();\n        showToast(event.data.payload?.title || \"New website enquiry\");\n        loadList();\n      });\n      if (Notification.permission === \"granted\" && localStorage.getItem(\"ensuite_push_endpoint\")) {\n        state.pushEndpoint = localStorage.getItem(\"ensuite_push_endpoint\");\n        pushBar.classList.add(\"success\");\n        pushText.textContent = \"Phone alerts are enabled on this device.\";\n        enablePushButton.textContent = \"Test alert\";\n        enablePushButton.onclick = testPush;\n      }\n    }\n\n    async function enablePush() {\n      try {\n        enablePushButton.disabled = true;\n        pushText.textContent = \"Connecting phone alerts\u2026\";\n        const configResponse = await fetch(\"/push-config.json\");\n        const config = await configResponse.json();\n        if (!config.configured || !config.vapidPublicKey) throw new Error(\"Phone alerts have not been configured on Cloudflare yet.\");\n        const registration = await navigator.serviceWorker.register(\"/push-sw.js\", { scope:\"/\" });\n        const permission = await Notification.requestPermission();\n        if (permission !== \"granted\") throw new Error(\"Notifications were not allowed.\");\n        let subscription = await registration.pushManager.getSubscription();\n        if (!subscription) {\n          subscription = await registration.pushManager.subscribe({\n            userVisibleOnly: true,\n            applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey)\n          });\n        }\n        const subscriptionJson = subscription.toJSON();\n        const response = await fetch(\"/api/admin/push-devices\", {\n          method:\"POST\",\n          headers:{\"content-type\":\"application/json\"},\n          body:JSON.stringify({\n            subscription: subscriptionJson,\n            device_name:navigator.userAgent.includes(\"Android\") ? \"Nicholas Pixel\" : \"Nicholas device\"\n          })\n        });\n        if (!response.ok) throw new Error(\"The phone notification subscription could not be saved.\");\n        localStorage.setItem(\"ensuite_push_endpoint\", subscription.endpoint);\n        state.pushEndpoint = subscription.endpoint;\n        pushBar.classList.add(\"success\");\n        pushText.textContent = \"Phone alerts are enabled on this device.\";\n        enablePushButton.textContent = \"Test alert\";\n        enablePushButton.onclick = testPush;\n        await testPush();\n      } catch (error) {\n        pushText.textContent = error.message || \"Could not enable alerts.\";\n        showToast(error.message || \"Could not enable alerts.\");\n      } finally {\n        enablePushButton.disabled = false;\n      }\n    }\n\n    async function testPush() {\n      enablePushButton.disabled = true;\n      const response = await fetch(\"/api/admin/push-test\", { method:\"POST\" });\n      const data = await response.json().catch(() => ({}));\n      enablePushButton.disabled = false;\n      showToast(response.ok && data.sent > 0 ? \"Test alert sent to your phone.\" : \"No active phone subscription found. Re-enable alerts.\");\n    }\n\n    function base64UrlToUint8Array(value) {\n      const padding = \"=\".repeat((4 - value.length % 4) % 4);\n      const base64 = (value + padding).replace(/-/g, \"+\").replace(/_/g, \"/\");\n      const raw = atob(base64);\n      return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));\n    }\n\n    function normaliseUkPhone(value) {\n      let digits = String(value).replace(/\\D/g, '');\n      if (digits.startsWith('00')) digits = digits.slice(2);\n      if (digits.startsWith('0') && digits.length >= 10) digits = '44' + digits.slice(1);\n      if (digits.startsWith('44') && digits.length >= 12) return digits;\n      if (digits.length >= 10 && digits.length <= 15) return digits;\n      return '';\n    }\n\n    function initials(value) { return String(value).split(/\\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || '?'; }\n    function shortTime(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; return date.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }\n    function beep() { try { const context = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 880; gain.gain.value = .18; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); setTimeout(() => { oscillator.stop(); context.close(); }, 420); } catch {} }\n    function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 4500); }\n    function escapeHtml(value) { return String(value).replace(/[&<>'\"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',\"'\":'&#39;','\"':'&quot;'}[character])); }\n\n    fetch('/api/admin/conversations').then(response => { if (response.ok) showApp(); });\n  </script>\n</body>\n</html>\n";

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

      if (pathname === "/widget.js") {
        return new Response(BUNDLED_WIDGET_JS, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
          }
        });
      }

      if (pathname === "/inbox.html") {
        return new Response(BUNDLED_INBOX_HTML, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
          }
        });
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
    return last.replace(/\.html$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
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
