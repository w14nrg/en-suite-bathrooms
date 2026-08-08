import app from "./reliability-entry.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/push-receipt-status.json" && request.method === "GET") {
      try {
        const receipt = await env.DB.prepare(`
          SELECT received_at, tag, conversation_id
          FROM push_receipts
          ORDER BY id DESC
          LIMIT 1
        `).first();
        return Response.json({
          ok: true,
          last_receipt_at: receipt?.received_at || null,
          last_receipt_tag: receipt?.tag || null,
          last_receipt_conversation_id: receipt?.conversation_id || null
        }, { headers: { "cache-control": "no-store" } });
      } catch {
        return Response.json({
          ok: true,
          last_receipt_at: null,
          last_receipt_tag: null,
          last_receipt_conversation_id: null
        }, { headers: { "cache-control": "no-store" } });
      }
    }

    return app.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof app.scheduled === "function") return app.scheduled(event, env, ctx);
  }
};
