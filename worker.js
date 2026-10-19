const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
        version: "social-v1",
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

    if (["/api/register", "/api/login", "/api/me", "/api/posts", "/api/profile", "/api/follow"].includes(url.pathname) ||
        url.pathname.startsWith("/api/profile/")) {
      const stub = env.SIGNAL_STORE.get(env.SIGNAL_STORE.idFromName("jdogbrew-social-data-v1"));
      return ensureCors(await stub.fetch(new Request("https://social-store.internal" + url.pathname + url.search, request)));
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
    if (url.pathname === "/api/register" && request.method === "POST") return this.register(request);
    if (url.pathname === "/api/login" && request.method === "POST") return this.login(request);
    if (url.pathname === "/api/me" && request.method === "GET") {
      const user = await this.authUser(request);
      return user ? json({ ok: true, user: { username: user.username } }) : json({ ok: false, error: "Sign in required." }, 401);
    }
    if (url.pathname === "/api/profile" && request.method === "GET") {
      const user = await this.authUser(request);
      return user ? this.profileResponse(user.username, user.username) : json({ ok: false, error: "Sign in required." }, 401);
    }
    if (url.pathname === "/api/profile" && request.method === "POST") return this.updateProfile(request);
    if (url.pathname.startsWith("/api/profile/") && request.method === "GET") {
      const username = decodeURIComponent(url.pathname.slice("/api/profile/".length));
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json({ ok: false, error: "Invalid username." }, 400);
      const viewer = await this.authUser(request);
      return this.profileResponse(username, viewer ? viewer.username : "");
    }
    if (url.pathname === "/api/follow" && request.method === "POST") return this.followUser(request);
    if (url.pathname === "/api/posts" && request.method === "GET") {
      const posts = (await this.ctx.storage.get("social-posts")) || [];
      return json({ ok: true, posts: posts.slice(-100).reverse() });
    }
    if (url.pathname === "/api/posts" && request.method === "POST") {
      const user = await this.authUser(request);
      if (!user) return json({ ok: false, error: "Sign in required to post." }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON." }, 400); }
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 1000) return json({ ok: false, error: "Post must contain 1–1000 characters." }, 400);
      const posts = (await this.ctx.storage.get("social-posts")) || [];
      const post = { id: crypto.randomUUID(), username: user.username, content, createdAt: Date.now() };
      posts.push(post);
      await this.ctx.storage.put("social-posts", posts.slice(-1000));
      return json({ ok: true, post }, 201);
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

  async profileResponse(username, viewerUsername = "") {
    const users = (await this.ctx.storage.get("social-users")) || {};
    const key = username.toLowerCase();
    const user = users[key];
    if (!user) return json({ ok: false, error: "User not found." }, 404);
    const profiles = (await this.ctx.storage.get("social-profiles")) || {};
    const follows = (await this.ctx.storage.get("social-follows")) || {};
    const profile = profiles[key] || {};
    const followers = Object.values(follows).filter(list => list.includes(key)).length;
    const following = (follows[key] || []).length;
    const isFollowing = !!viewerUsername && (follows[viewerUsername.toLowerCase()] || []).includes(key);
    return json({ ok: true, profile: {
      username: user.username,
      displayName: profile.displayName || user.username,
      bio: profile.bio || "",
      avatar: profile.avatar || "",
      pronouns: profile.pronouns || "",
      favoriteGame: profile.favoriteGame || "",
      accent: profile.accent || "#a78bfa",
      bannerUrl: profile.bannerUrl || "",
      followers,
      following,
      isFollowing,
      isSelf: !!viewerUsername && viewerUsername.toLowerCase() === key
    }});
  }

  async updateProfile(request) {
    const user = await this.authUser(request);
    if (!user) return json({ ok: false, error: "Sign in required." }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON." }, 400); }
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    const avatar = typeof body.avatar === "string" ? body.avatar : "";
    const pronouns = typeof body.pronouns === "string" ? body.pronouns.trim() : "";
    const favoriteGame = typeof body.favoriteGame === "string" ? body.favoriteGame.trim() : "";
    const accent = typeof body.accent === "string" ? body.accent : "#a78bfa";
    const bannerUrl = typeof body.bannerUrl === "string" ? body.bannerUrl.trim() : "";
    if (displayName.length > 40) return json({ ok: false, error: "Display name must be 40 characters or fewer." }, 400);
    if (bio.length > 160) return json({ ok: false, error: "Bio must be 160 characters or fewer." }, 400);
    if (pronouns.length > 30) return json({ ok: false, error: "Pronouns must be 30 characters or fewer." }, 400);
    if (favoriteGame.length > 40) return json({ ok: false, error: "Favorite game must be 40 characters or fewer." }, 400);
    if (!["#a78bfa", "#67e8c0", "#8cc8ff", "#ff8fcf", "#ffc078"].includes(accent)) return json({ ok: false, error: "Choose one of the available profile accents." }, 400);
    if (bannerUrl && (bannerUrl.length > 450 || !(bannerUrl.startsWith("http://") || bannerUrl.startsWith("https://")))) return json({ ok: false, error: "Banner URL must start with http:// or https:// and be 450 characters or fewer." }, 400);
    if (avatar && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > 220000)) {
      return json({ ok: false, error: "Choose a PNG, JPEG, or WebP image under the profile-picture size limit." }, 400);
    }
    const key = user.username.toLowerCase();
    const profiles = (await this.ctx.storage.get("social-profiles")) || {};
    const prior = profiles[key] || {};
    profiles[key] = {
      displayName: displayName || user.username,
      bio,
      avatar: body.avatar === null ? "" : (avatar || prior.avatar || ""),
      pronouns: body.pronouns === undefined ? (prior.pronouns || "") : pronouns,
      favoriteGame: body.favoriteGame === undefined ? (prior.favoriteGame || "") : favoriteGame,
      accent: body.accent === undefined ? (prior.accent || "#a78bfa") : accent,
      bannerUrl: body.bannerUrl === undefined ? (prior.bannerUrl || "") : bannerUrl
    };
    await this.ctx.storage.put("social-profiles", profiles);
    return this.profileResponse(user.username, user.username);
  }

  async followUser(request) {
    const user = await this.authUser(request);
    if (!user) return json({ ok: false, error: "Sign in required." }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON." }, 400); }
    const target = typeof body.username === "string" ? body.username.trim() : "";
    const action = body.action;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(target) || !["follow", "unfollow"].includes(action)) {
      return json({ ok: false, error: "Invalid follow request." }, 400);
    }
    const sourceKey = user.username.toLowerCase();
    const targetKey = target.toLowerCase();
    if (sourceKey === targetKey) return json({ ok: false, error: "You can't follow yourself." }, 400);
    const users = (await this.ctx.storage.get("social-users")) || {};
    if (!users[targetKey]) return json({ ok: false, error: "User not found." }, 404);
    const follows = (await this.ctx.storage.get("social-follows")) || {};
    const list = new Set(follows[sourceKey] || []);
    if (action === "follow") list.add(targetKey); else list.delete(targetKey);
    follows[sourceKey] = Array.from(list);
    await this.ctx.storage.put("social-follows", follows);
    return this.profileResponse(target, user.username);
  }

  async hashPassword(password, salt) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, material, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
  }

  async authUser(request) {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || token.length > 200) return null;
    const sessions = (await this.ctx.storage.get("social-sessions")) || {};
    const session = sessions[token];
    if (!session || session.expiresAt < Date.now()) return null;
    const users = (await this.ctx.storage.get("social-users")) || {};
    const user = users[session.username.toLowerCase()];
    return user ? { username: user.username } : null;
  }

  async register(request) {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON." }, 400); }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json({ ok: false, error: "Username must be 3–20 letters, numbers, or underscores." }, 400);
    if (password.length < 10 || password.length > 128) return json({ ok: false, error: "Password must be 10–128 characters." }, 400);
    const users = (await this.ctx.storage.get("social-users")) || {};
    const key = username.toLowerCase();
    if (users[key]) return json({ ok: false, error: "That username is already taken." }, 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = Array.from(salt, b => b.toString(16).padStart(2, "0")).join("");
    users[key] = { username, salt: saltHex, passwordHash: await this.hashPassword(password, salt) };
    await this.ctx.storage.put("social-users", users);
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const sessions = (await this.ctx.storage.get("social-sessions")) || {};
    sessions[token] = { username, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    await this.ctx.storage.put("social-sessions", sessions);
    return json({ ok: true, token, user: { username } }, 201);
  }

  async login(request) {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "Expected JSON." }, 400); }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length > 20 || password.length > 128) return json({ ok: false, error: "Invalid username or password." }, 400);
    const users = (await this.ctx.storage.get("social-users")) || {};
    const user = users[username.toLowerCase()];
    if (!user) return json({ ok: false, error: "Invalid username or password." }, 401);
    const salt = new Uint8Array(user.salt.match(/.{2}/g).map(v => parseInt(v, 16)));
    const hash = await this.hashPassword(password, salt);
    if (hash !== user.passwordHash) return json({ ok: false, error: "Invalid username or password." }, 401);
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const sessions = (await this.ctx.storage.get("social-sessions")) || {};
    sessions[token] = { username: user.username, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    await this.ctx.storage.put("social-sessions", sessions);
    return json({ ok: true, token, user: { username: user.username } });
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
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Expected a JSON object.");
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
    const validKinds = ["text", "markdown", "json", "event", "meta", "reaction", "status"];
    if (payload.type !== "message" || payload.v !== 1 ||
        typeof payload.id !== "string" || payload.id.length > 100 ||
        !validKinds.includes(payload.kind) ||
        !Object.prototype.hasOwnProperty.call(payload, "payload")) {
      try { ws.send(JSON.stringify({ type: "error", id: payload && payload.id, error: "Expected type=message, v=1, kind=text/markdown/json/event/meta/reaction/status, id, payload." })); } catch (_) {}
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
