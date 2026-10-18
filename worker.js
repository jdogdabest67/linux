const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (url.pathname === "/api/message" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON body." }, 400); }
      const session = typeof body.session === "string" ? body.session.trim() : "";
      const id = typeof body.id === "string" ? body.id.slice(0, 80) : "";
      const from = typeof body.from === "string" ? body.from.slice(0, 32) : "browser";
      const text = typeof body.text === "string" ? body.text.slice(0, 120) : "";
      if (session.length < 4 || session.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(session)) {
        return json({ ok: false, error: "Session must be 4-64 letters, numbers, underscores, or hyphens." }, 400);
      }
      if (!id || text !== "PING") return json({ ok: false, error: "Only short PING test messages are accepted." }, 400);
      const stub = env.SIGNAL_STORE.get(env.SIGNAL_STORE.idFromName("shared-test-store"));
      return stub.fetch("https://signal-store.internal/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, id, from, text, at: Date.now() })
      });
    }

    if (url.pathname === "/api/messages" && request.method === "GET") {
      const session = url.searchParams.get("session") || "";
      if (session.length < 4 || session.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(session)) {
        return json({ ok: false, error: "Provide a valid session code." }, 400);
      }
      const stub = env.SIGNAL_STORE.get(env.SIGNAL_STORE.idFromName("shared-test-store"));
      return stub.fetch("https://signal-store.internal/messages?session=" + encodeURIComponent(session));
    }

    return json({ ok: false, error: "JoyGPT signal test API. Use POST /api/message or GET /api/messages?session=..." }, 404);
  }
};

export class SignalStore {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/message") {
      const message = await request.json();
      const all = (await this.ctx.storage.get("messages")) || [];
      all.push(message);
      await this.ctx.storage.put("messages", all.slice(-100));
      return json({ ok: true, acknowledged: true, id: message.id, storedAt: message.at });
    }
    if (request.method === "GET" && url.pathname === "/messages") {
      const session = url.searchParams.get("session");
      const all = (await this.ctx.storage.get("messages")) || [];
      return json({ ok: true, messages: all.filter(m => m.session === session).slice(-50) });
    }
    return json({ ok: false, error: "Not found." }, 404);
  }
}
