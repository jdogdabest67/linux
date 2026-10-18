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

// Apply CORS headers at the public Worker boundary too, rather than relying
// only on the Durable Object's response headers surviving the internal fetch.
function ensureCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "joygpt-signal-bridge",
        version: "ws-lab-1",
        websocketSupported: true
      });
    }

    if (url.pathname === "/api/socket") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ ok: false, error: "Use a WebSocket connection for /api/socket." }, 426);
      }
      const session = url.searchParams.get("session") || "";
      const role = url.searchParams.get("role") || "";
      if (session.length < 4 || session.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(session)) {
        return json({ ok: false, error: "Provide a valid session code." }, 400);
      }
      if (!["phone", "switch", "browser"].includes(role)) {
        return json({ ok: false, error: "Role must be phone, switch, or browser." }, 400);
      }
      const stub = env.SIGNAL_STORE.get(env.SIGNAL_STORE.idFromName("ws-" + session));
      // Do not wrap this response: its WebSocket upgrade must be preserved.
      return stub.fetch(request);
    }

    if (url.pathname === "/api/message" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON body." }, 400); }
      const session = typeof body.session === "string" ? body.session.trim() : "";
      const id = typeof body.id === "string" ? body.id.slice(0, 80) : "";
      const requestedFrom = typeof body.from === "string" ? body.from : "browser";
      const from = ["phone", "switch", "browser"].includes(requestedFrom) ? requestedFrom : "browser";
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 120) : "";
      if (session.length < 4 || session.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(session)) {
        return json({ ok: false, error: "Session must be 4-64 letters, numbers, underscores, or hyphens." }, 400);
      }
      const allowedCommand = text === "PING" || text === "FLASH" || /^SAY:.{1,110}$/s.test(text) || /^PRESS:(A|B|X|Y|UP|DOWN|LEFT|RIGHT|START|SELECT)$/.test(text);
      if (!id || !allowedCommand) return json({ ok: false, error: "Allowed messages: PING, FLASH, SAY:your message, or PRESS:A/B/X/Y/UP/DOWN/LEFT/RIGHT/START/SELECT." }, 400);
      const stub = env.SIGNAL_STORE.get(env.SIGNAL_STORE.idFromName("shared-test-store"));
      return ensureCors(await stub.fetch("https://signal-store.internal/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, id, from, text, at: Date.now() })
      }));
    }

    if (url.pathname === "/api/messages" && request.method === "GET") {
      const session = url.searchParams.get("session") || "";
      if (session.length < 4 || session.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(session)) {
        return json({ ok: false, error: "Provide a valid session code." }, 400);
      }
      const stub = env.SIGNAL_STORE.get(env.SIGNAL_STORE.idFromName("shared-test-store"));
      return ensureCors(await stub.fetch("https://signal-store.internal/messages?session=" + encodeURIComponent(session)));
    }

    return json({ ok: false, error: "JoyGPT signal test API. Use POST /api/message or GET /api/messages?session=..." }, 404);
  }
};

export class SignalStore {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/socket") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ ok: false, error: "WebSocket upgrade required." }, 426);
      }
      const role = url.searchParams.get("role") || "browser";
      const clientId = (url.searchParams.get("clientId") || "").slice(0, 80) || "unknown-client";
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({
        session: url.searchParams.get("session") || "",
        role,
        clientId,
        connectedAt: Date.now()
      });
      return new Response(null, { status: 101, webSocket: client });
    }
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

  webSocketMessage(ws, message) {
    const sender = ws.deserializeAttachment() || {};

    // Binary file packets use: "JGPT" + uint32 header length (big-endian)
    // + UTF-8 JSON header + raw chunk bytes. Limit every frame to 256 KiB.
    if (typeof message !== "string") {
      try {
        const bytes = message instanceof ArrayBuffer
          ? new Uint8Array(message)
          : ArrayBuffer.isView(message)
            ? new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
            : null;
        if (!bytes || bytes.byteLength < 9 || bytes.byteLength > 262144 ||
            bytes[0] !== 0x4a || bytes[1] !== 0x47 || bytes[2] !== 0x50 || bytes[3] !== 0x54) {
          throw new Error("Invalid binary packet or frame size.");
        }
        const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);
        if (headerLength < 2 || headerLength > 4096 || 8 + headerLength > bytes.byteLength) {
          throw new Error("Invalid binary packet header length.");
        }
        const headerText = new TextDecoder().decode(bytes.subarray(8, 8 + headerLength));
        const header = JSON.parse(headerText);
        if (header.type !== "packet" || header.v !== 1 ||
            typeof header.id !== "string" || header.id.length > 100 ||
            typeof header.transferId !== "string" || header.transferId.length > 100 ||
            typeof header.kind !== "string" || !["binary", "image", "audio", "video"].includes(header.kind) ||
            typeof header.name !== "string" || header.name.length > 200 ||
            typeof header.mimeType !== "string" || header.mimeType.length > 120 ||
            !Number.isInteger(header.chunkIndex) || !Number.isInteger(header.chunkCount) ||
            header.chunkCount < 1 || header.chunkCount > 1000 ||
            header.chunkIndex < 0 || header.chunkIndex >= header.chunkCount ||
            !Number.isInteger(header.size) || header.size < 0 || header.size > 10000000) {
          throw new Error("Invalid binary packet metadata.");
        }
        const receivedAt = Date.now();
        for (const peer of this.ctx.getWebSockets()) {
          try {
            const attachment = peer.deserializeAttachment() || {};
            const meta = {
              type: "packet-relay",
              header,
              fromRole: sender.role || "browser",
              fromClientId: sender.clientId || "unknown-client",
              toClientId: attachment.clientId || "unknown-client",
              serverReceivedAt: receivedAt
            };
            // The binary frame contains its own metadata header, so there is
            // no separate metadata frame to become detached from its payload.
            peer.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          } catch (_) {
            try { peer.close(1011, "Could not relay binary packet"); } catch (_) {}
          }
        }
      } catch (error) {
        try { ws.send(JSON.stringify({ type: "error", error: error.message || "Invalid binary packet." })); } catch (_) {}
      }
      return;
    }

    let payload;
    try {
      if (message.length > 16384) throw new Error("Message is too large.");
      payload = JSON.parse(message);
    } catch (_) {
      try { ws.send(JSON.stringify({ type: "error", error: "Send a valid JSON message (maximum 16 KiB) or a JoyGPT JGPT binary packet." })); } catch (_) {}
      return;
    }

    // Backward-compatible handler for the original latency probe.
    if (payload.type === "probe" && typeof payload.id === "string" &&
        typeof payload.text === "string" && payload.text.length <= 200) {
      const receivedAt = Date.now();
      const envelope = {
        type: "relay",
        id: payload.id.slice(0, 100),
        fromRole: sender.role || "browser",
        fromClientId: sender.clientId || "unknown-client",
        text: payload.text,
        clientSentAt: Number(payload.sentAt) || null,
        serverReceivedAt: receivedAt
      };
      for (const peer of this.ctx.getWebSockets()) {
        try {
          peer.send(JSON.stringify({
            ...envelope,
            toClientId: (peer.deserializeAttachment() || {}).clientId || "unknown-client",
            serverSentAt: Date.now()
          }));
        } catch (_) {
          try { peer.close(1011, "Could not relay test message"); } catch (_) {}
        }
      }
      return;
    }

    // Typed JSON envelope for text, JSON values, and small app events.
    const validKinds = ["text", "json", "event", "meta"];
    if (payload.type !== "message" || payload.v !== 1 ||
        typeof payload.id !== "string" || payload.id.length > 100 ||
        !validKinds.includes(payload.kind) ||
        !Object.prototype.hasOwnProperty.call(payload, "payload")) {
      try { ws.send(JSON.stringify({ type: "error", id: payload && payload.id, error: "Expected type=message, v=1, kind=text/json/event/meta, id, payload." })); } catch (_) {}
      return;
    }
    let payloadBytes;
    try { payloadBytes = new TextEncoder().encode(JSON.stringify(payload.payload)).byteLength; }
    catch (_) { payloadBytes = 16385; }
    if (payloadBytes > 12000) {
      try { ws.send(JSON.stringify({ type: "error", id: payload.id, error: "Typed payload exceeds 12 KiB." })); } catch (_) {}
      return;
    }
    const receivedAt = Date.now();
    const envelope = {
      type: "message-relay",
      v: 1,
      id: payload.id,
      kind: payload.kind,
      payload: payload.payload,
      fromRole: sender.role || "browser",
      fromClientId: sender.clientId || "unknown-client",
      sentAt: Number(payload.sentAt) || null,
      serverReceivedAt: receivedAt
    };
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(JSON.stringify({
          ...envelope,
          toClientId: (peer.deserializeAttachment() || {}).clientId || "unknown-client",
          serverSentAt: Date.now()
        }));
      } catch (_) {
        try { peer.close(1011, "Could not relay typed message"); } catch (_) {}
      }
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code, reason); } catch (_) {}
  }

  webSocketError(ws) {
    try { ws.close(1011, "WebSocket error"); } catch (_) {}
  }
}
