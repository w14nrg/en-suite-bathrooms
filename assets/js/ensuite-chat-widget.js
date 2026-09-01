/* First-party En-Suites & Bathrooms chat widget — policy-clean build 2026-08-31. */
(() => {
  if (window.__ENSUITE_CHAT_LOADED__) return;
  window.__ENSUITE_CHAT_LOADED__ = true;


  const script = document.currentScript;
  const apiBase = (script?.dataset.api || new URL(script.src).origin).replace(/\/$/, "");
  const whatsappNumber = String(script?.dataset.whatsapp || "").replace(/\D/g, "");
  const storeKey = "ensuite_live_chat_v5";
  const visitPingKey = "ensuite_site_visit_ping_v2";
  const visitPingCooldownMs = 60 * 1000;
  const state = {
    id: null,
    token: null,
    lastMessageId: 0,
    polling: null,
    sending: false,
    nameRequired: true
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (saved?.id && saved?.token) {
      state.id = saved.id;
      state.token = saved.token;
    }
  } catch {
    localStorage.removeItem(storeKey);
  }

  const style = document.createElement("style");
  style.textContent = `
    .eb-chat-launch{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:16px;background:#102a43;color:#fff;padding:12px 17px;font:700 15px/1.2 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:11px;text-align:left;max-width:min(310px,calc(100vw - 24px))}
    .eb-chat-launch-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;background:#25d366;box-shadow:0 0 0 4px rgba(37,211,102,.18)}
    .eb-chat-launch-copy{display:flex;flex-direction:column;gap:2px}.eb-chat-launch-copy strong{font-size:15px;line-height:1.2}.eb-chat-launch-copy small{font:400 11px/1.25 Arial,sans-serif;opacity:.86}
    .eb-chat-panel{position:fixed;right:18px;bottom:78px;z-index:2147483000;width:min(400px,calc(100vw - 24px));height:min(650px,calc(100vh - 106px));background:#efeae2;border:1px solid #d7dee7;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.28);display:none;overflow:hidden;font:15px/1.45 Arial,sans-serif;color:#102a43}
    .eb-chat-panel.open{display:flex;flex-direction:column}
    .eb-chat-head{background:#102a43;color:#fff;padding:13px 14px;display:flex;justify-content:space-between;align-items:center;min-height:64px}
    .eb-chat-profile{display:flex;align-items:center;gap:10px}.eb-chat-avatar{width:39px;height:39px;border-radius:50%;background:#fff;color:#102a43;display:grid;place-items:center;font-weight:800;font-size:13px}.eb-chat-head strong{display:block;font-size:15px}.eb-chat-head small{display:block;opacity:.82;font-size:12px;margin-top:1px}.eb-chat-close{background:transparent;color:#fff;border:0;font-size:26px;cursor:pointer;padding:4px 6px}
    .eb-chat-messages{flex:1;overflow:auto;padding:16px 12px;background-color:#efeae2;background-image:radial-gradient(rgba(16,42,67,.035) 1px,transparent 1px);background-size:12px 12px}
    .eb-msg{position:relative;max-width:84%;padding:8px 10px 7px;border-radius:8px;margin:0 0 8px;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 1px rgba(0,0,0,.08)}
    .eb-msg.bot,.eb-msg.system{background:#fff;border-top-left-radius:2px}
    .eb-msg.customer{background:#d9fdd3;margin-left:auto;border-top-right-radius:2px;color:#1f2933}
    .eb-msg.owner{background:#d9fdd3;border-top-left-radius:2px}
    .eb-msg.system{font-size:12px;color:#486581;text-align:center;max-width:92%;margin-left:auto;margin-right:auto;background:#fff7d6}
    .eb-quick{display:flex;flex-wrap:wrap;gap:7px;margin:4px 0 12px}.eb-quick button{border:1px solid #102a43;background:#fff;color:#102a43;border-radius:999px;padding:7px 10px;cursor:pointer;font:600 13px Arial,sans-serif}
    .eb-chat-error{padding:8px 12px;background:#fff2f2;color:#a61b1b;font-size:13px;display:none}
    .eb-name-gate{flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px;background:#efeae2}.eb-name-card{background:#fff;border-radius:14px;padding:20px;box-shadow:0 8px 28px rgba(0,0,0,.12)}.eb-name-card h3{margin:0 0 7px;font-size:20px}.eb-name-card p{margin:0 0 14px;color:#486581}.eb-name-form{display:flex;gap:8px}.eb-name-form input{flex:1;min-width:0;border:1px solid #bcccdc;border-radius:9px;padding:12px;font:15px Arial,sans-serif}.eb-name-form button{border:0;border-radius:9px;background:#102a43;color:#fff;padding:11px 14px;font-weight:700;cursor:pointer}.eb-name-help{display:block;margin-top:9px;color:#627d98;font-size:11px}.eb-chat-live-area{display:none}.eb-chat-live-area.active{display:flex}.eb-chat-messages.eb-chat-live-area.active{flex:1;overflow:auto}.eb-chat-actions.eb-chat-live-area.active{display:block}.eb-chat-form.eb-chat-live-area.active{display:flex}.eb-chat-note.eb-chat-live-area.active{display:block}
    .eb-chat-actions{padding:8px 10px 0;background:#f7f8f8}.eb-chat-whatsapp{display:none;width:100%;text-align:center;text-decoration:none;border:1px solid #25d366;color:#087b36;background:#fff;border-radius:9px;padding:9px;font:700 13px Arial,sans-serif}.eb-chat-whatsapp.show{display:block}
    .eb-chat-form{display:flex;gap:8px;padding:9px 10px;background:#f7f8f8}.eb-chat-form textarea{flex:1;resize:none;min-height:44px;max-height:104px;border:0;border-radius:22px;padding:12px 15px;font:15px Arial,sans-serif;outline:none;box-shadow:0 0 0 1px #d9e2ec inset}.eb-chat-form button{border:0;width:44px;height:44px;border-radius:50%;background:#102a43;color:#fff;font-weight:800;cursor:pointer;font-size:18px}
    .eb-chat-note{font-size:10px;color:#627d98;padding:0 12px 9px;background:#f7f8f8;text-align:center}
    @media(max-width:520px){.eb-chat-launch{right:12px;bottom:12px}.eb-chat-panel{right:6px;bottom:68px;width:calc(100vw - 12px);height:calc(100vh - 82px);border-radius:14px}}
  `;
    /* ENSUITE_CHAT_VERTICAL_FIX_20260807 */
  style.textContent +=
    '.eb-chat-messages.eb-chat-live-area.active{display:block!important;flex:1!important;overflow-y:auto!important;overflow-x:hidden!important}' +
    '.eb-chat-messages .eb-msg{display:block!important;flex:none!important;width:auto!important}' +
    '.eb-chat-messages .eb-msg.customer{margin-left:auto!important}' +
    '.eb-chat-messages .eb-quick{display:flex!important;flex-wrap:wrap!important}' +
    '.eb-chat-error{font-weight:700!important;padding:10px 12px!important}' +
    '.eb-chat-form textarea:focus{box-shadow:0 0 0 2px rgba(16,42,67,.22) inset!important}';

  document.head.appendChild(style);

  const launch = document.createElement("button");
  launch.className = "eb-chat-launch";
  launch.type = "button";
  launch.innerHTML = '<span class="eb-chat-launch-dot"></span><span class="eb-chat-launch-copy"><strong>Live chat with our team</strong><small>A bathroom specialist can join live</small></span>';
  launch.setAttribute("aria-label", "Open En-Suites & Bathrooms live chat");

  const panel = document.createElement("section");
  panel.className = "eb-chat-panel";
  panel.setAttribute("aria-label", "En-Suites & Bathrooms chat");
  panel.innerHTML = `
    <div class="eb-chat-head">
      <div class="eb-chat-profile"><div class="eb-chat-avatar">E&amp;B</div><div><strong>Live chat — En-Suites &amp; Bathrooms</strong><small class="eb-chat-status">A member of our bathroom team can join</small></div></div>
      <button class="eb-chat-close" type="button" aria-label="Close chat">×</button>
    </div>
    <div class="eb-chat-error"></div>
    <div class="eb-name-gate">
      <div class="eb-name-card">
        <h3>Start live chat</h3>
        <p>Please enter your first name so our team knows who they are speaking with.</p>
        <form class="eb-name-form"><input type="text" maxlength="60" autocomplete="given-name" placeholder="Your first name" aria-label="Your first name" required><button type="submit">Start chat</button></form>
        <small class="eb-name-help">A name is required before the live chat opens.</small>
      </div>
    </div>
    <div class="eb-chat-messages eb-chat-live-area" aria-live="polite"></div>
    <div class="eb-chat-actions eb-chat-live-area"><a class="eb-chat-whatsapp" target="_blank" rel="noopener">Continue on WhatsApp</a></div>
    <form class="eb-chat-form eb-chat-live-area"><textarea rows="1" maxlength="2000" placeholder="Type a message" aria-label="Message"></textarea><button type="submit" aria-label="Send message">➤</button></form>
    <div class="eb-chat-note eb-chat-live-area">Your message is saved and our bathroom team is alerted. Do not include card details.</div>
  `;

  document.body.append(launch, panel);
  window.setTimeout(notifyOwnerOfVisit, 1500);
  const nameGate = panel.querySelector(".eb-name-gate");
  const nameForm = panel.querySelector(".eb-name-form");
  const nameInput = nameForm.querySelector("input");
  const liveAreas = [...panel.querySelectorAll(".eb-chat-live-area")];
  const messagesEl = panel.querySelector(".eb-chat-messages");
  const form = panel.querySelector(".eb-chat-form");
  const input = form.querySelector("textarea");
  const errorEl = panel.querySelector(".eb-chat-error");
  const whatsappLink = panel.querySelector(".eb-chat-whatsapp");
  const statusText = panel.querySelector(".eb-chat-status");

  if (whatsappNumber) {
    const text = "Hi Nicholas, I was using the En-Suites & Bathrooms website chat and would like to continue here.";
    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
    whatsappLink.classList.add("show");
  }

  launch.addEventListener("click", async () => {
    panel.classList.add("open");
    launch.style.display = "none";
    try {
      if (state.id && state.token) {
        const existing = await pollMessages();
        if (existing === false) resetConversation();
      }
      setNameRequired(!(state.id && state.token) || state.nameRequired);
      if (state.id && state.token) startPolling();
      (state.nameRequired ? nameInput : input).focus();
    } catch {
      showError("The chat could not open. Please use WhatsApp or call us.");
    }
  });

  panel.querySelector(".eb-chat-close").addEventListener("click", () => {
    panel.classList.remove("open");
    launch.style.display = "flex";
    stopPolling();
  });

  nameForm.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!isValidName(name) || state.sending) {
      showError("Please enter your first name before starting the chat.");
      nameInput.focus();
      return;
    }
    state.sending = true;
    try {
      await ensureConversation();
      const response = await fetch(`${apiBase}/api/conversations/${state.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-chat-token": state.token },
        body: JSON.stringify({ body: name })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || Number(result.step) !== 1) throw new Error("Name was not accepted");
      state.nameRequired = false;
      setNameRequired(false);
      messagesEl.innerHTML = "";
      startPolling();
      await pollMessages();
      input.focus();
    } catch {
      showError("Please enter a valid first name before starting the chat.");
      nameInput.focus();
    } finally {
      state.sending = false;
    }
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || state.sending) return;
    state.sending = true;
    input.value = "";
    try {
      await ensureConversation();
      const response = await fetch(`${apiBase}/api/conversations/${state.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-chat-token": state.token },
        body: JSON.stringify({ body })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Message failed");
      await pollMessages();
    } catch (error) {
      input.value = body;
      showError(error?.message || "Your message may not have sent. Please try again or use WhatsApp.");
    } finally {
      state.sending = false;
      input.focus();
    }
  });

  async function notifyOwnerOfVisit() {
    /* ENSUITE_GOOGLE_ADS_POLICY_CLEANUP_20260831 */
    if (document.visibilityState !== "visible") return;

    const now = Date.now();
    try {
      const lastPing = Number(localStorage.getItem(visitPingKey) || 0);
      if (lastPing && now - lastPing < visitPingCooldownMs) return;
    } catch {
      // Storage may be unavailable. The backend still receives only this page-load attempt.
    }

    try {
      const response = await fetch(`${apiBase}/api/site-visit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          page_url: location.origin + location.pathname,
          page_title: document.title,
          referrer: ""
        })
      });
      if (!response.ok) return;
      const visitResult = await response.json().catch(() => ({}));
      if (Number(visitResult.sent || 0) > 0) { try { localStorage.setItem(visitPingKey, String(now)); } catch {} }
    } catch {
      // A visit alert must never interfere with the public website or chat.
    }
  }

  async function ensureConversation() {
    if (state.id && state.token) {
      const existing = await pollMessages();
      if (existing !== false) return;
      resetConversation();
    }

    const response = await fetch(`${apiBase}/api/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_url: location.origin + location.pathname, referrer: "" })
    });
    if (!response.ok) throw new Error("Could not start chat");
    const data = await response.json();
    state.id = data.conversation_id;
    state.token = data.public_token;
    state.nameRequired = true;
    localStorage.setItem(storeKey, JSON.stringify({ id: state.id, token: state.token }));
    (data.messages || []).forEach(renderMessage);
    renderQuickReplies(data.quick_replies || []);
  }

  async function pollMessages() {
    if (!state.id || !state.token) return false;
    const response = await fetch(`${apiBase}/api/conversations/${state.id}/messages?after=${state.lastMessageId}`, {
      headers: { "x-chat-token": state.token }
    });
    /* ENSUITE_CHAT_STALE_SESSION_FIX_20260819 */
    if (!response.ok) return false;
    const data = await response.json();
    state.nameRequired = Boolean(data.name_required);
    setNameRequired(state.nameRequired);
    if (statusText) {
      statusText.textContent = data.mode === "human"
        ? "Nicholas from En-Suites & Bathrooms is live"
        : (state.nameRequired ? "Enter your name to start" : "A member of our bathroom team has been alerted");
    }
    (data.messages || []).forEach(message => {
      if (!messagesEl.querySelector(`[data-message-id="${message.id}"]`)) renderMessage(message);
    });
    return true;
  }

  function renderMessage(message) {
    const div = document.createElement("div");
    div.className = `eb-msg ${message.sender}`;
    if (message.id) {
      div.dataset.messageId = String(message.id);
      state.lastMessageId = Math.max(state.lastMessageId, Number(message.id));
    }
    div.textContent = message.body;
    if (message.sender === "owner" && statusText) statusText.textContent = "Nicholas from En-Suites & Bathrooms is live";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderQuickReplies(items) {
    if (!items.length) return;
    const wrap = document.createElement("div");
    wrap.className = "eb-quick";
    items.forEach(label => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        input.value = label;
        wrap.remove();
        form.requestSubmit();
      });
      wrap.appendChild(button);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setNameRequired(required) {
    state.nameRequired = Boolean(required);
    nameGate.style.display = state.nameRequired ? "flex" : "none";
    liveAreas.forEach(area => area.classList.toggle("active", !state.nameRequired));
  }

  function resetConversation() {
    state.id = null;
    state.token = null;
    state.lastMessageId = 0;
    state.nameRequired = true;
    try { localStorage.removeItem(storeKey); } catch {}
    messagesEl.innerHTML = "";
    setNameRequired(true);
  }

  function isValidName(value) {
    const name = String(value || "").trim().replace(/[.!?,;:]+$/g, "");
    const rejected = /^(hi|hello|hey|hiya|test|testing|ok|okay|yes|no|thanks|thank you)$/i.test(name);
    return !rejected && name.length >= 2 && name.length <= 60 && name.split(/\s+/).length <= 4 && /^[\p{L}][\p{L}'’ -]*$/u.test(name);
  }

  setNameRequired(!(state.id && state.token));
  void notifyOwnerOfVisit();

  function startPolling() {
    stopPolling();
    state.polling = window.setInterval(pollMessages, 2200);
  }

  function stopPolling() {
    if (state.polling) window.clearInterval(state.polling);
    state.polling = null;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
    window.setTimeout(() => { errorEl.style.display = "none"; }, 8000);
  }
})();
