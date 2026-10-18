(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let monitoring = false;
  let frameId = 0;

  const apiRows = [
    ["HTTPS / secure context", () => window.isSecureContext],
    ["WebUSB", () => "usb" in navigator],
    ["WebHID", () => "hid" in navigator],
    ["Web Serial", () => "serial" in navigator],
    ["Web Bluetooth", () => "bluetooth" in navigator],
    ["Gamepad API", () => typeof navigator.getGamepads === "function"]
  ];

  function showApiChecks() {
    const exposed = apiRows.filter(([, check]) => {
      try { return Boolean(check()); } catch (_) { return false; }
    }).length;

    const lines = apiRows.map(([name, check]) => {
      let available = false;
      try { available = Boolean(check()); } catch (_) {}
      return { name, available };
    });

    const container = $("apiChecks");
    container.replaceChildren();
    const pre = document.createElement("pre");
    pre.textContent = lines.map(({ name, available }) =>
      (available ? "[EXPOSED]     " : "[NOT EXPOSED] ") + name
    ).join("\n") + "\n\n" + exposed + " of " + apiRows.length +
      " capability checks exposed by this browser.";
    container.appendChild(pre);
  }

  function renderGamepads() {
    const output = $("gamepadOutput");
    if (typeof navigator.getGamepads !== "function") {
      output.textContent = "The Gamepad API is not exposed by this browser.";
      return;
    }

    let pads;
    try {
      pads = Array.from(navigator.getGamepads()).filter(Boolean);
    } catch (error) {
      output.textContent = "Could not read gamepads: " + error.name + ": " + error.message;
      return;
    }

    if (!pads.length) {
      output.textContent = "No gamepad is currently visible to this page.\n\nConnect or pair a controller to the phone, return to this tab, and press a button. A controller connected only to the Switch will not appear here.";
      return;
    }

    output.textContent = pads.map((pad) => {
      const buttons = Array.from(pad.buttons, (button, index) =>
        "B" + index + ": " + (button.pressed ? "PRESSED" : "released") +
        " (" + Number(button.value).toFixed(2) + ")"
      );
      const axes = Array.from(pad.axes, (axis, index) =>
        "Axis " + index + ": " + Number(axis).toFixed(3)
      );
      return "Controller " + pad.index + ": " + (pad.id || "unnamed controller") +
        "\nMapping: " + (pad.mapping || "unknown") +
        " | " + pad.buttons.length + " buttons | " + pad.axes.length + " axes" +
        "\n" + (buttons.join(" · ") || "No buttons reported") +
        "\n" + (axes.join(" · ") || "No axes reported");
    }).join("\n\n");
  }

  function tick() {
    if (!monitoring) return;
    renderGamepads();
    frameId = window.requestAnimationFrame(tick);
  }

  function startMonitor() {
    if (typeof navigator.getGamepads !== "function") {
      $("monitorStatus").textContent = "Cannot start: Gamepad API is not exposed.";
      renderGamepads();
      return;
    }
    monitoring = true;
    $("monitorStatus").textContent = "Monitoring live input. Keep this tab visible and press a button on a phone-connected controller.";
    window.cancelAnimationFrame(frameId);
    tick();
  }

  function stopMonitor() {
    monitoring = false;
    window.cancelAnimationFrame(frameId);
    $("monitorStatus").textContent = "Monitor stopped.";
  }


  // Signal test: requires the separate Worker backend deployed from worker.js.
  const endpointInput = $("signalEndpoint");
  const sessionInput = $("signalSession");
  const signalStatus = $("signalStatus");
  const signalOutput = $("signalOutput");

  // Remember the backend URL and session locally so the user does not need
  // to retype them every time this page is opened on the same device/browser.
  const savedConfigKey = "joygpt-signal-config-v1";
  function loadSavedConfig() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(savedConfigKey) || "null");
      if (saved && typeof saved.endpoint === "string" && !endpointInput.value.trim()) {
        endpointInput.value = saved.endpoint;
      }
      if (saved && typeof saved.session === "string") {
        sessionInput.value = saved.session;
      }
      if (saved && typeof saved.endpoint === "string" && saved.endpoint.trim()) {
        signalStatus.textContent = "Backend URL preconfigured. Ready to test.";
      }
    } catch (_) {
      // Storage may be disabled in private or restricted browser modes.
    }
  }

  function saveSignalConfig(endpoint, session) {
    try {
      window.localStorage.setItem(savedConfigKey, JSON.stringify({ endpoint, session }));
    } catch (_) {
      // The page still works if local storage is unavailable.
    }
  }

  function getSignalConfig() {
    const endpoint = endpointInput.value.trim().replace(/\/$/, "");
    const session = sessionInput.value.trim();
    if (!endpoint) throw new Error("Enter the deployed Worker URL first.");
    let parsed;
    try { parsed = new URL(endpoint); } catch (_) { throw new Error("Backend URL is not valid."); }
    if (parsed.protocol !== "https:") throw new Error("Use an HTTPS Worker URL.");
    if (!session) throw new Error("Enter the same session code on both devices.");
    saveSignalConfig(endpoint, session);
    return { endpoint, session };
  }

  async function sendSignal() {
    let config;
    try { config = getSignalConfig(); } catch (error) {
      signalStatus.textContent = error.message;
      return;
    }
    const id = "PING-" + Date.now().toString(36).toUpperCase();
    signalStatus.textContent = "Sending " + id + "…";
    try {
      const response = await fetch(config.endpoint + "/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: config.session, id, from: "browser", text: "PING" })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ("HTTP " + response.status));
      signalStatus.textContent = "Backend acknowledged " + id + ". Now check messages on the phone.";
      signalOutput.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
      signalStatus.textContent = "Send failed: " + error.message + ". Check the Worker URL, deployment, and browser network access.";
    }
  }

  async function checkSignals() {
    let config;
    try { config = getSignalConfig(); } catch (error) {
      signalStatus.textContent = error.message;
      return;
    }
    signalStatus.textContent = "Checking backend for this session…";
    try {
      const response = await fetch(config.endpoint + "/api/messages?session=" + encodeURIComponent(config.session), {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ("HTTP " + response.status));
      const messages = Array.isArray(data.messages) ? data.messages : [];
      signalStatus.textContent = messages.length
        ? "Backend returned " + messages.length + " message(s)."
        : "Backend responded, but no messages exist for this session yet.";
      signalOutput.textContent = messages.length
        ? messages.map(m => "[" + new Date(m.at).toLocaleTimeString() + "] " + m.id + " from " + m.from + ": " + m.text).join("\n")
        : JSON.stringify(data, null, 2);
    } catch (error) {
      signalStatus.textContent = "Check failed: " + error.message + ". Check the Worker URL, deployment, and browser network access.";
    }
  }

  $("sendSignal").addEventListener("click", sendSignal);
  $("checkSignals").addEventListener("click", checkSignals);


  // Remote webpage-command experiment. This can operate this page's UI only,
  // not the Switch operating system or an in-game controller.
  let commandTimer = null;
  let baselineReady = false;
  const seenCommandIds = new Set();
  let demoPressCount = 0;

  function getDeviceRole() {
    return $("deviceRole").value;
  }

  function validCommand(value) {
    const text = value.trim();
    return text === "FLASH" ||
      /^SAY:.{1,110}$/s.test(text) ||
      /^PRESS:(A|B|X|Y|UP|DOWN|LEFT|RIGHT|START|SELECT)$/.test(text);
  }

  async function sendCommand(commandOverride) {
    let config;
    try { config = getSignalConfig(); } catch (error) {
      $("commandStatus").textContent = error.message;
      return;
    }
    const command = String(commandOverride || $("commandText").value).trim();
    if (!validCommand(command)) {
      $("commandStatus").textContent = "Use SAY:your message, FLASH, or PRESS:A/B/X/Y/UP/DOWN/LEFT/RIGHT/START/SELECT.";
      return;
    }
    const id = "CMD-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    $("commandStatus").textContent = "Sending " + command + "…";
    try {
      const response = await fetch(config.endpoint + "/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: config.session, id, from: getDeviceRole(), text: command })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ("HTTP " + response.status));
      $("commandStatus").textContent = "Command sent: " + command + ". The other browser must be listening.";
      $("commandOutput").textContent = JSON.stringify(data, null, 2);
    } catch (error) {
      $("commandStatus").textContent = "Command failed: " + error.message;
    }
  }

  function runLocalDemoAction(command, message) {
    $("commandOutput").textContent = "[" + new Date(message.at).toLocaleTimeString() + "] " +
      message.from + " sent " + command;
    if (command.startsWith("SAY:")) {
      $("remoteBig").textContent = command.slice(4).trim();
      $("remoteButtonState").textContent = "Received a remote SAY command.";
      return;
    }
    if (command === "FLASH") {
      const previous = document.body.style.background;
      document.body.style.background = "#fff2a8";
      $("remoteBig").textContent = "FLASH!";
      window.setTimeout(() => { document.body.style.background = previous; }, 450);
      $("remoteButtonState").textContent = "Remote flash command received.";
      return;
    }
    if (command.startsWith("PRESS:")) {
      const buttonName = command.slice(6);
      $("remoteButtonState").textContent = "Remote PRESS:" + buttonName + " received. Activating the local webpage demo button, not a game button.";
      // This deliberately clicks only a button belonging to this webpage.
      $("demoTarget").click();
      $("remoteBig").textContent = "PRESS " + buttonName;
    }
  }

  async function pollCommands() {
    if (!commandTimer) return;
    let config;
    try { config = getSignalConfig(); } catch (error) {
      $("commandStatus").textContent = error.message;
      return;
    }
    try {
      const response = await fetch(config.endpoint + "/api/messages?session=" + encodeURIComponent(config.session), {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ("HTTP " + response.status));
      const role = getDeviceRole();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      if (!baselineReady) {
        // Mark old history as seen so stale commands do not replay on listener start.
        messages.forEach(message => seenCommandIds.add(message.id));
        baselineReady = true;
        $("commandStatus").textContent = "Listening as " + role + " · ready for new commands.";
        return;
      }
      const incoming = messages
        .filter(message => message.from !== role && !seenCommandIds.has(message.id))
        .sort((a, b) => a.at - b.at);
      for (const message of incoming) {
        seenCommandIds.add(message.id);
        if (message.text !== "PING") runLocalDemoAction(message.text, message);
      }
      $("commandStatus").textContent = "Listening as " + role + ". Last checked " + new Date().toLocaleTimeString() +
        (incoming.length ? " · received " + incoming.length + " new message(s)." : " · waiting for a command…");
    } catch (error) {
      $("commandStatus").textContent = "Listener error: " + error.message;
    }
  }

  function startCommandListener() {
    if (commandTimer) window.clearInterval(commandTimer);
    baselineReady = false;
    seenCommandIds.clear();
    commandTimer = window.setInterval(pollCommands, 1800);
    $("commandStatus").textContent = "Starting listener as " + getDeviceRole() + "…";
    pollCommands();
  }

  function stopCommandListener() {
    if (commandTimer) window.clearInterval(commandTimer);
    commandTimer = null;
    $("commandStatus").textContent = "Command listener stopped.";
  }

  $("sendCommand").addEventListener("click", () => sendCommand());
  $("listenCommands").addEventListener("click", startCommandListener);
  $("stopCommands").addEventListener("click", stopCommandListener);
  document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("click", () => {
      $("commandText").value = button.getAttribute("data-command");
      sendCommand(button.getAttribute("data-command"));
    });
  });
  $("demoTarget").addEventListener("click", () => {
    demoPressCount += 1;
    $("demoTarget").textContent = "Local demo button (" + demoPressCount + ")";
    $("remoteButtonState").textContent = "Local webpage button activated " + demoPressCount + " time(s).";
  });

  // Live WebSocket transport experiment. It tests browser-to-server and
  // browser-to-browser messaging only; it never generates controller/game input.
  let testSocket = null;
  let socketClientId = "joygpt-" + Math.random().toString(36).slice(2, 10);
  const socketPending = new Map();
  let socketMessageCount = 0;
  let socketRttSamples = [];
  let burstRunId = 0;

  function addSocketLog(line) {
    const log = $("wsTestOutput");
    const existing = log.textContent && !log.textContent.startsWith("Connect") ? log.textContent.split("\n") : [];
    existing.push(new Date().toLocaleTimeString() + "  " + line);
    log.textContent = existing.slice(-60).join("\n");
    socketMessageCount += 1;
    $("wsCount").textContent = "Messages observed: " + socketMessageCount;
  }

  async function connectWebSocketTest() {
    const status = $("wsTestStatus");
    let config;
    try { config = getSignalConfig(); } catch (error) {
      status.textContent = error.message;
      return;
    }
    if (typeof window.WebSocket !== "function") {
      status.textContent = "This browser does not expose the WebSocket constructor.";
      return;
    }
    if (testSocket) {
      try { testSocket.close(1000, "Reconnecting test"); } catch (_) {}
      testSocket = null;
    }
    status.textContent = "Checking whether the deployed Worker supports the WebSocket lab…";
    try {
      const health = await fetch(config.endpoint + "/api/health", { cache: "no-store" });
      const data = await health.json();
      if (!health.ok || !data.ok || data.version !== "ws-lab-2" || !data.websocketSupported) {
        status.textContent = "The deployed Worker needs protocol v2. Deploy the latest worker.js in Cloudflare, then retry. Health response: " + JSON.stringify(data);
        return;
      }
    } catch (error) {
      status.textContent = "Backend health check failed: " + error.message + ". The Worker may not have been redeployed yet.";
      return;
    }

    const wsUrl = config.endpoint.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:") +
      "/api/socket?session=" + encodeURIComponent(config.session) +
      "&role=" + encodeURIComponent(getDeviceRole()) +
      "&clientId=" + encodeURIComponent(socketClientId);
    status.textContent = "Opening secure WebSocket…";
    try {
      const socket = new WebSocket(wsUrl);
      testSocket = socket;
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => {
        status.textContent = "WebSocket connected as " + getDeviceRole() + ". Send typed messages or a file to the other connected page.";
        addSocketLog("CONNECTED; protocol=" + (socket.protocol || "(none)") + "; readyState=" + socket.readyState);
      });
      socket.addEventListener("message", (event) => {
        if (event.data instanceof ArrayBuffer) {
          receiveBinaryPacket(event.data);
          return;
        }
        if (typeof Blob !== "undefined" && event.data instanceof Blob) {
          event.data.arrayBuffer().then(receiveBinaryPacket).catch(error => addSocketLog("Could not read binary frame: " + error.message));
          return;
        }
        let data;
        try { data = JSON.parse(event.data); } catch (_) {
          addSocketLog("Received non-JSON text frame: " + String(event.data).slice(0, 160));
          return;
        }
        if (data.type === "error") {
          addSocketLog("SERVER ERROR: " + (data.error || "unknown"));
          return;
        }
        if (data.type === "message-relay") {
          const own = data.toClientId === socketClientId;
          addSocketLog((own ? "SERVER ECHO" : "PEER RELAY") + " [" + data.kind + "] from " +
            data.fromRole + ": " + JSON.stringify(data.payload).slice(0, 220));
          return;
        }
        if (data.type !== "relay") {
          addSocketLog("Received frame: " + JSON.stringify(data).slice(0, 250));
          return;
        }
        const isOwnEcho = data.toClientId === socketClientId;
        const sentAt = socketPending.get(data.id);
        const rttValue = isOwnEcho && sentAt ? Date.now() - sentAt : null;
        const rtt = rttValue !== null ? " · round trip " + rttValue + " ms" : "";
        if (isOwnEcho && sentAt) {
          socketPending.delete(data.id);
          socketRttSamples.push(rttValue);
          if (socketRttSamples.length > 50) socketRttSamples.shift();
          $("wsRttSummary").textContent = socketRttSamples.length
            ? "Recent echo RTT: min " + Math.min(...socketRttSamples) + " ms · avg " + Math.round(socketRttSamples.reduce((sum, n) => sum + n, 0) / socketRttSamples.length) + " ms · max " + Math.max(...socketRttSamples) + " ms (" + socketRttSamples.length + " sample(s))"
            : "No echo samples yet.";
        }
        if (isOwnEcho && data.id.startsWith("BURST-" + burstRunId + "-")) {
          const burst = window.__joygptBurst;
          if (burst && burst.runId === burstRunId) burst.received += 1;
        }
        const direction = isOwnEcho ? "SERVER ECHO" : "PEER RELAY";
        addSocketLog(direction + " from " + data.fromRole + ": " + data.text + rtt);
      });
      socket.addEventListener("error", () => {
        status.textContent = "WebSocket error. Check Worker deployment/network access; see the log for earlier clues.";
        addSocketLog("SOCKET ERROR (browser intentionally hides the detailed handshake reason).");
      });
      socket.addEventListener("close", (event) => {
        if (testSocket === socket) testSocket = null;
        status.textContent = "WebSocket closed. code=" + event.code + ", clean=" + event.wasClean + (event.reason ? ", reason=" + event.reason : "");
        addSocketLog("CLOSED code=" + event.code + " clean=" + event.wasClean);
      });
    } catch (error) {
      status.textContent = "Could not create WebSocket: " + error.name + ": " + error.message;
    }
  }

  function sendWebSocketProbe() {
    const status = $("wsTestStatus");
    if (!testSocket || testSocket.readyState !== WebSocket.OPEN) {
      status.textContent = "Connect this browser first.";
      return;
    }
    const text = $("wsTestMessage").value.trim().slice(0, 200) || "HELLO";
    const id = "WS-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    const sentAt = Date.now();
    socketPending.set(id, sentAt);
    try {
      testSocket.send(JSON.stringify({ type: "probe", id, sentAt, text }));
      addSocketLog("SENT marker: " + text);
      status.textContent = "Sent marker. Expect a server echo here and a peer relay on the other connected browser.";
    } catch (error) {
      socketPending.delete(id);
      status.textContent = "Send failed: " + error.name + ": " + error.message;
    }
  }


  // Typed JSON messages share the same WebSocket pipe as the latency probe.
  function sendTypedWebSocketMessage() {
    if (!testSocket || testSocket.readyState !== WebSocket.OPEN) {
      $("wsTestStatus").textContent = "Connect this browser first.";
      return;
    }
    const kind = $("wsTypedKind").value;
    const raw = $("wsTypedPayload").value;
    let payload;
    try {
      payload = kind === "text" ? raw : JSON.parse(raw);
    } catch (error) {
      $("wsTestStatus").textContent = "That payload is not valid JSON. Text mode accepts ordinary text.";
      return;
    }
    const id = "MSG-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    const packet = { type: "message", v: 1, id, kind, sentAt: Date.now(), payload };
    const wire = JSON.stringify(packet);
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 12000 || wire.length > 16384) {
      $("wsTestStatus").textContent = "This message is too large. Keep typed payloads below 12 KiB.";
      return;
    }
    try {
      testSocket.send(wire);
      addSocketLog("SENT [" + kind + "]: " + JSON.stringify(payload).slice(0, 220));
      $("wsTestStatus").textContent = "Sent typed " + kind + " message. Check the peer page.";
    } catch (error) {
      $("wsTestStatus").textContent = "Send failed: " + error.name + ": " + error.message;
    }
  }

  const binaryTransfers = new Map();
  const receivedObjectUrls = [];
  function receiveBinaryPacket(buffer) {
    try {
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 10 || buffer.byteLength > 262144) {
        throw new Error("Binary frame size is invalid.");
      }
      const bytes = new Uint8Array(buffer);
      if (bytes[0] !== 0x4a || bytes[1] !== 0x47 || bytes[2] !== 0x50 || bytes[3] !== 0x54) {
        throw new Error("Unknown binary packet format.");
      }
      const headerLength = new DataView(buffer).getUint32(4, false);
      if (headerLength < 2 || headerLength > 4096 || 8 + headerLength > bytes.length) {
        throw new Error("Binary packet header is invalid.");
      }
      const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)));
      if (header.type !== "packet" || header.v !== 1 || typeof header.transferId !== "string" ||
          !Number.isInteger(header.chunkIndex) || !Number.isInteger(header.chunkCount) ||
          header.chunkCount < 1 || header.chunkCount > 1000 || header.chunkIndex < 0 ||
          header.chunkIndex >= header.chunkCount || !Number.isInteger(header.size) ||
          header.size < 0 || header.size > 10000000) throw new Error("Packet metadata is invalid.");
      let transfer = binaryTransfers.get(header.transferId);
      if (!transfer) {
        transfer = { header, chunks: new Array(header.chunkCount), received: 0, bytes: 0 };
        binaryTransfers.set(header.transferId, transfer);
      }
      if (transfer.header.chunkCount !== header.chunkCount || transfer.header.size !== header.size ||
          transfer.header.name !== header.name || transfer.header.mimeType !== header.mimeType) {
        binaryTransfers.delete(header.transferId);
        throw new Error("Chunk metadata changed during transfer.");
      }
      if (!transfer.chunks[header.chunkIndex]) {
        const chunk = bytes.slice(8 + headerLength);
        transfer.chunks[header.chunkIndex] = chunk;
        transfer.received += 1;
        transfer.bytes += chunk.byteLength;
      }
      if (transfer.received !== header.chunkCount) {
        $("wsFileStatus").textContent = "Receiving " + (header.name || "file") + ": " +
          transfer.received + "/" + header.chunkCount + " chunks";
        return;
      }
      binaryTransfers.delete(header.transferId);
      if (transfer.bytes !== header.size) throw new Error("File length mismatch; the received file was discarded.");
      const blob = new Blob(transfer.chunks, { type: header.mimeType || "application/octet-stream" });
      showReceivedFile(header, blob);
      addSocketLog("RECEIVED [" + header.kind + "] " + header.name + " (" + blob.size + " bytes)");
      $("wsFileStatus").textContent = "Received " + header.name + " (" + blob.size + " bytes).";
    } catch (error) {
      addSocketLog("BINARY PACKET ERROR: " + error.message);
      $("wsFileStatus").textContent = "Binary receive error: " + error.message;
    }
  }

  function showReceivedFile(header, blob) {
    const container = $("wsReceivedFiles");
    const card = document.createElement("div");
    card.style.cssText = "border:1px solid #40566b;border-radius:10px;padding:10px;margin-top:8px;overflow-wrap:anywhere";
    const label = document.createElement("div");
    label.textContent = header.name + " · " + header.kind + " · " + blob.size + " bytes";
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    receivedObjectUrls.push(url);
    while (receivedObjectUrls.length > 10) URL.revokeObjectURL(receivedObjectUrls.shift());
    link.href = url;
    link.download = header.name || "joygpt-file.bin";
    link.textContent = "Download received file";
    link.style.display = "inline-block";
    link.style.margin = "8px 0";
    card.append(label, link);
    if (header.kind === "image" && blob.size <= 3000000) {
      const preview = document.createElement("img");
      preview.src = url;
      preview.alt = header.name || "Received image";
      preview.style.cssText = "display:block;max-width:100%;max-height:280px;border-radius:6px";
      card.append(preview);
    } else if (header.kind === "audio" || header.kind === "video") {
      const player = document.createElement(header.kind);
      player.src = url;
      player.controls = true;
      player.style.cssText = "display:block;max-width:100%;width:100%;margin-top:6px";
      card.append(player);
    }
    container.prepend(card);
    while (container.children.length > 5) container.lastElementChild.remove();
  }

  async function sendWebSocketFile() {
    if (!testSocket || testSocket.readyState !== WebSocket.OPEN) {
      $("wsFileStatus").textContent = "Connect this browser first.";
      return;
    }
    const file = $("wsFileInput").files && $("wsFileInput").files[0];
    if (!file) {
      $("wsFileStatus").textContent = "Choose a file first.";
      return;
    }
    if (file.size > 10000000) {
      $("wsFileStatus").textContent = "For this first test, files must be 10 MB or smaller.";
      return;
    }
    const kind = file.type.startsWith("image/") ? "image" :
      file.type.startsWith("audio/") ? "audio" :
      file.type.startsWith("video/") ? "video" : "binary";
    const transferId = "FILE-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    const chunkSize = 180 * 1024;
    const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));
    $("wsFileStatus").textContent = "Sending " + file.name + " in " + chunkCount + " chunk(s)…";
    try {
      for (let i = 0; i < chunkCount; i += 1) {
        while (testSocket && testSocket.readyState === WebSocket.OPEN && testSocket.bufferedAmount > 1048576) {
          await new Promise(resolve => window.setTimeout(resolve, 25));
        }
        if (!testSocket || testSocket.readyState !== WebSocket.OPEN) throw new Error("WebSocket disconnected during transfer.");
        const raw = new Uint8Array(await file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize)).arrayBuffer());
        const header = {
          type: "packet", v: 1, id: transferId + "-" + i, transferId, kind,
          name: file.name.slice(0, 200), mimeType: (file.type || "application/octet-stream").slice(0, 120),
          size: file.size, chunkIndex: i, chunkCount
        };
        const meta = new TextEncoder().encode(JSON.stringify(header));
        const packet = new Uint8Array(8 + meta.length + raw.length);
        packet.set([0x4a, 0x47, 0x50, 0x54], 0);
        new DataView(packet.buffer).setUint32(4, meta.length, false);
        packet.set(meta, 8);
        packet.set(raw, 8 + meta.length);
        testSocket.send(packet.buffer);
        if (i % 5 === 0 || i === chunkCount - 1) {
          $("wsFileStatus").textContent = "Sending " + file.name + ": " + (i + 1) + "/" + chunkCount + " chunks";
        }
        await new Promise(resolve => window.setTimeout(resolve, 4));
      }
      addSocketLog("SENT [" + kind + "] " + file.name + " (" + file.size + " bytes, " + chunkCount + " chunks)");
      $("wsFileStatus").textContent = "Sent " + file.name + ". The peer should reassemble it; this page also receives its server echo.";
    } catch (error) {
      $("wsFileStatus").textContent = "File transfer failed: " + error.message;
    }
  }

  function runWebSocketBurst() {
    const status = $("wsTestStatus");
    if (!testSocket || testSocket.readyState !== WebSocket.OPEN) {
      status.textContent = "Connect this browser first.";
      return;
    }
    const runId = ++burstRunId;
    const prefix = "BURST-" + runId + "-";
    const startedAt = Date.now();
    window.__joygptBurst = { runId, received: 0, expected: 10 };
    status.textContent = "Sending 10 small test markers 150 ms apart…";
    for (let i = 0; i < 10; i += 1) {
      window.setTimeout(() => {
        if (runId !== burstRunId || !testSocket || testSocket.readyState !== WebSocket.OPEN) return;
        const id = prefix + (i + 1);
        const sentAt = Date.now();
        socketPending.set(id, sentAt);
        try {
          testSocket.send(JSON.stringify({
            type: "probe",
            id,
            sentAt,
            text: "BURST marker " + (i + 1) + "/10"
          }));
        } catch (error) {
          socketPending.delete(id);
          addSocketLog("Burst send failed: " + error.name + ": " + error.message);
        }
      }, i * 150);
    }
    window.setTimeout(() => {
      if (runId !== burstRunId) return;
      const burst = window.__joygptBurst;
      status.textContent = "Burst finished in " + (Date.now() - startedAt) +
        " ms. Server echoes received before cutoff: " + (burst ? burst.received : 0) +
        "/10. Check the RTT summary and peer relay log.";
    }, 3500);
  }

  function disconnectWebSocketTest() {
    if (testSocket) {
      try { testSocket.close(1000, "Stopped by user"); } catch (_) {}
      testSocket = null;
    }
    $("wsTestStatus").textContent = "WebSocket test disconnected.";
  }

  $("connectWebSocketTest").addEventListener("click", connectWebSocketTest);
  $("sendWebSocketTest").addEventListener("click", sendWebSocketProbe);
  $("sendTypedWebSocketMessage").addEventListener("click", sendTypedWebSocketMessage);
  $("sendWebSocketFile").addEventListener("click", sendWebSocketFile);
  $("runWebSocketBurst").addEventListener("click", runWebSocketBurst);
  $("disconnectWebSocketTest").addEventListener("click", disconnectWebSocketTest);
  window.addEventListener("pagehide", disconnectWebSocketTest);

  // Record only ordinary DOM events visible to this page. Text-entry fields
  // are excluded so typed text/passwords are not logged or relayed.
  let eventProbeActive = false;
  const inputEventLog = [];
  const inputEventCounts = new Map();

  function renderInputEventSummary() {
    const summary = Array.from(inputEventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([label, count]) => label + " ×" + count);
    $("inputEventSummary").textContent = summary.length
      ? "Observed patterns: " + summary.join(" · ")
      : "No input patterns yet.";
  }

  function recordPageInputEvent(event) {
    if (!eventProbeActive) return;
    if (event.target && event.target.closest) {
      if (event.target.closest("#startEventProbe, #stopEventProbe, #syntheticEventProbe")) return;
      if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    }
    const target = event.target;
    const targetName = target ? ((target.tagName || "node") + (target.id ? "#" + target.id : "")) : "(no target)";
    const fields = [
      event.type,
      "target=" + targetName,
      event.key ? "key=" + JSON.stringify(event.key) : "",
      event.code ? "code=" + event.code : "",
      typeof event.button === "number" ? "button=" + event.button : "",
      typeof event.clientX === "number" ? "xy=" + event.clientX + "," + event.clientY : "",
      typeof event.repeat === "boolean" ? "repeat=" + event.repeat : "",
      event.shiftKey ? "shift" : "",
      event.ctrlKey ? "ctrl" : "",
      event.altKey ? "alt" : "",
      event.metaKey ? "meta" : "",
      "trusted=" + Boolean(event.isTrusted),
      event.defaultPrevented ? "defaultPrevented=true" : ""
    ].filter(Boolean);
    const details = fields.join(" ");
    const stamp = new Date().toLocaleTimeString() + " +" + performance.now().toFixed(1) + "ms ";
    const line = stamp + details;
    inputEventLog.push(line);
    while (inputEventLog.length > 100) inputEventLog.shift();
    const mappingLabel = event.type + (event.key ? " key=" + event.key : "") + (event.code ? " code=" + event.code : "");
    inputEventCounts.set(mappingLabel, (inputEventCounts.get(mappingLabel) || 0) + 1);
    $("inputEventOutput").textContent = inputEventLog.join("\n");
    $("inputEventCount").textContent = "Events captured: " + inputEventLog.length;
    renderInputEventSummary();

    // Optional, explicit telemetry relay to the other browser. It carries only
    // the summarized DOM event and never sends controller input to the console.
    const relayBox = $("streamInputEvents");
    if (relayBox && relayBox.checked && testSocket && testSocket.readyState === WebSocket.OPEN) {
      const text = "INPUT_EVENT " + details;
      const id = "INPUT-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      try {
        testSocket.send(JSON.stringify({ type: "probe", id, sentAt: Date.now(), text: text.slice(0, 200) }));
      } catch (error) {
        $("inputEventStatus").textContent = "Event captured locally, but relay failed: " + error.name;
      }
    }
  }

  const pageInputEventNames = ["keydown", "keyup", "click", "pointerdown", "pointerup", "gamepadconnected", "gamepaddisconnected"];
  function startEventProbe() {
    inputEventLog.length = 0;
    inputEventCounts.clear();
    eventProbeActive = true;
    pageInputEventNames.forEach(name => window.addEventListener(name, recordPageInputEvent, true));
    $("inputEventOutput").textContent = "Listening. Focus the blank page area, then try D-pad, A, B, and back/cancel.";
    $("inputEventStatus").textContent = $("streamInputEvents").checked
      ? (testSocket && testSocket.readyState === WebSocket.OPEN
          ? "Recorder active. Event telemetry is also being sent to the connected peer."
          : "Recorder active locally. Connect this page's WebSocket to relay events to the phone.")
      : "Recorder active locally. Text-entry fields are excluded.";
    $("inputEventCount").textContent = "Events captured: 0";
    renderInputEventSummary();
  }
  function stopEventProbe() {
    eventProbeActive = false;
    pageInputEventNames.forEach(name => window.removeEventListener(name, recordPageInputEvent, true));
    if ($("inputEventStatus")) $("inputEventStatus").textContent = "Recorder stopped. " + inputEventLog.length + " event(s) captured.";
  }
  function runSyntheticEventTest() {
    const probe = new KeyboardEvent("keydown", { key: "A", code: "KeyA", bubbles: true, cancelable: true });
    let trustObserved = "listener not reached";
    const readTrust = event => { if (event === probe) trustObserved = String(event.isTrusted); };
    window.addEventListener("keydown", readTrust, true);
    window.dispatchEvent(probe);
    window.removeEventListener("keydown", readTrust, true);
    $("syntheticEventStatus").textContent = "Synthetic page-only keydown observed; isTrusted=" + trustObserved +
      ". This touches only this webpage's DOM, not the Switch OS or a game.";
  }
  $("startEventProbe").addEventListener("click", startEventProbe);
  $("stopEventProbe").addEventListener("click", stopEventProbe);
  $("syntheticEventProbe").addEventListener("click", runSyntheticEventTest);
  $("copyInputEvents").addEventListener("click", () => {
    const content = inputEventLog.join("\n");
    if (!content) {
      $("inputEventStatus").textContent = "No events to copy yet.";
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(content).then(
        () => { $("inputEventStatus").textContent = "Input log copied."; },
        () => { $("inputEventStatus").textContent = "Clipboard blocked. Select the log manually to copy it."; }
      );
    } else {
      $("inputEventStatus").textContent = "Clipboard unavailable. Select the log manually to copy it.";
    }
  });
  window.addEventListener("pagehide", stopEventProbe);

  // Read-only Switch/browser environment diagnostics. No permissions are requested.
  function runSwitchTests() {
    const output = $("switchTestsOutput");
    const status = $("switchTestsStatus");
    const rows = [];
    status.textContent = "Running read-only checks…";
    const add = (label, value) => rows.push(label + ": " + String(value));
    const safe = (fn, fallback = "unavailable") => {
      try {
        const value = fn();
        return value === undefined ? "undefined" : value === null ? "null" : value;
      } catch (error) {
        return "THREW " + error.name + ": " + error.message;
      }
    };
    const yesNo = (value) => value ? "yes" : "no";

    add("Page URL origin", safe(() => location.origin));
    add("Page protocol", safe(() => location.protocol));
    add("Secure context", safe(() => yesNo(window.isSecureContext)));
    add("User agent", safe(() => navigator.userAgent));
    add("Platform", safe(() => navigator.platform));
    add("Vendor", safe(() => navigator.vendor));
    add("Language", safe(() => navigator.language));
    add("Languages", safe(() => Array.from(navigator.languages || []).join(", ") || "none reported"));
    add("Online flag", safe(() => yesNo(navigator.onLine)));
    add("Cookies enabled flag", safe(() => yesNo(navigator.cookieEnabled)));
    add("Page visibility", safe(() => document.visibilityState));
    add("Page focused", safe(() => yesNo(document.hasFocus())));
    add("Top-level page", safe(() => yesNo(window.top === window.self)));
    add("Viewport (CSS px)", safe(() => window.innerWidth + " × " + window.innerHeight));
    add("Screen (CSS px)", safe(() => screen.width + " × " + screen.height));
    add("Screen color depth", safe(() => screen.colorDepth + " bits"));
    add("Device pixel ratio", safe(() => window.devicePixelRatio));
    add("Touch points", safe(() => navigator.maxTouchPoints));
    add("Hardware concurrency", safe(() => navigator.hardwareConcurrency));
    add("Device memory hint", safe(() => navigator.deviceMemory === undefined ? "not exposed" : navigator.deviceMemory + " GB"));
    add("WebUSB exposed", safe(() => yesNo("usb" in navigator)));
    add("WebHID exposed", safe(() => yesNo("hid" in navigator)));
    add("Web Serial exposed", safe(() => yesNo("serial" in navigator)));
    add("Web Bluetooth exposed", safe(() => yesNo("bluetooth" in navigator)));
    add("Gamepad API exposed", safe(() => yesNo(typeof navigator.getGamepads === "function")));
    add("WebSocket exposed", safe(() => yesNo(typeof window.WebSocket === "function")));
    add("BroadcastChannel exposed", safe(() => yesNo(typeof window.BroadcastChannel === "function")));
    add("SharedWorker exposed", safe(() => yesNo(typeof window.SharedWorker === "function")));
    add("Service worker exposed", safe(() => yesNo("serviceWorker" in navigator)));
    add("Local storage", safe(() => {
      const key = "__joygpt_storage_probe__";
      window.localStorage.setItem(key, "ok");
      const result = window.localStorage.getItem(key) === "ok" ? "read/write works" : "write/read mismatch";
      window.localStorage.removeItem(key);
      return result;
    }));
    add("window.nx type", safe(() => typeof window.nx));
    add("window.nx.endApplet type", safe(() => window.nx == null ? "parent nx missing" : typeof window.nx.endApplet));
    add("navigator.getGamepads()", safe(() => {
      if (typeof navigator.getGamepads !== "function") return "API unavailable";
      const pads = Array.from(navigator.getGamepads()).filter(Boolean);
      return pads.length ? pads.map(p => "#" + p.index + " " + (p.id || "unnamed") + " (" + p.buttons.length + " buttons, " + p.axes.length + " axes)").join("; ") : "no gamepads visible to page";
    }));
    add("Nintendo-like global names", safe(() => {
      const names = Object.keys(window).filter(name => /nintendo|switch|applet|joycon|joy-con|\bnx\b/i.test(name));
      return names.length ? names.slice(0, 40).join(", ") : "none found in enumerable window properties";
    }));
    add("Controller/HID-like globals", safe(() => {
      const names = Object.keys(window).filter(name => /gamepad|webhid|hiddevice|usbdevice|bluetoothhid/i.test(name));
      return names.length ? names.slice(0, 40).join(", ") : "none found in enumerable window properties";
    }));

    output.textContent = rows.join("\n") + "\n\nNotes:\n- 'not exposed' does not prove the console lacks that capability; it may be hidden from webpages.\n- Global-name searches only inspect enumerable page globals.\n- No hardware permission prompts or device-control calls were made.";
    status.textContent = "Finished " + rows.length + " read-only checks. Copy the output and send it back here.";
  }

  $("runSwitchTests").addEventListener("click", () => {
    try {
      runSwitchTests();
    } catch (error) {
      $("switchTestsStatus").textContent = "Test crashed: " + (error && error.name ? error.name : "Error") + ": " + (error && error.message ? error.message : String(error));
      $("switchTestsOutput").textContent = "The test button ran, but a diagnostic threw an error.\n\n" + (error && error.stack ? error.stack : String(error));
    }
  });
  $("copySwitchTests").addEventListener("click", () => {
    const textToCopy = $("switchTestsOutput").textContent;
    if (!textToCopy || textToCopy.startsWith("Run the tests")) {
      $("switchTestsStatus").textContent = "Run the tests first.";
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(textToCopy).then(
        () => { $("switchTestsStatus").textContent = "Results copied. Paste them into the chat."; },
        () => { $("switchTestsStatus").textContent = "Copy was blocked. Select and copy the results manually."; }
      );
    } else {
      $("switchTestsStatus").textContent = "Clipboard API unavailable. Select and copy the results manually.";
    }
  });

  // Read-only probe: inspect the possible applet API without invoking it.
  function checkSwitchApi() {
    const status = $("switchApiStatus");
    const output = $("switchApiOutput");
    let nxValue;
    let endAppletValue;
    let accessError = null;
    try {
      nxValue = window.nx;
      endAppletValue = nxValue == null ? undefined : nxValue.endApplet;
    } catch (error) {
      accessError = error.name + ": " + error.message;
    }

    if (accessError) {
      status.textContent = "Could not inspect the API: " + accessError;
      output.textContent = "Property access threw an error. No API method was called.";
      return;
    }

    const hasNx = typeof nxValue !== "undefined" && nxValue !== null;
    const hasEndApplet = typeof endAppletValue === "function";
    status.textContent = hasEndApplet
      ? "A function named window.nx.endApplet is exposed. Not called."
      : "The expected close-applet function was not found. Nothing was called.";
    output.textContent = [
      "window.nx: " + (hasNx ? "present (" + typeof nxValue + ")" : "undefined"),
      "window.nx.endApplet: " + typeof endAppletValue,
      "",
      "Safety: this check only reads properties. It did not call endApplet or attempt to launch a game."
    ].join("\n");
  }

  $("checkSwitchApi").addEventListener("click", checkSwitchApi);

  $("rescan").addEventListener("click", showApiChecks);
  $("startMonitor").addEventListener("click", startMonitor);
  $("stopMonitor").addEventListener("click", stopMonitor);

  window.addEventListener("gamepadconnected", (event) => {
    $("monitorStatus").textContent = "Controller connected to the browser: " +
      (event.gamepad.id || "unnamed controller") + ".";
    if (monitoring) renderGamepads();
  });

  window.addEventListener("gamepaddisconnected", (event) => {
    $("monitorStatus").textContent = "Controller disconnected: " +
      (event.gamepad.id || "unnamed controller") + ".";
    if (monitoring) renderGamepads();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frameId);
    } else if (monitoring) {
      tick();
    }
  });


  // JoyGPT Watch: local camera preview and frame capture.
  // Frames stay in this browser unless the user manually downloads/shares them.
  let watchStream = null;
  let lastCapturedUrl = null;

  function setWatchStatus(message) {
    const node = $("watchStatus");
    if (node) node.textContent = message;
  }

  async function startWatchCamera() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setWatchStatus("Camera API unavailable here. Open this page in a modern browser over HTTPS.");
      return;
    }
    try {
      stopWatchCamera(false);
      setWatchStatus("Requesting camera permission…");
      watchStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      const video = $("watchVideo");
      video.srcObject = watchStream;
      await video.play();
      $("watchVideoWrap").hidden = false;
      $("watchCapture").disabled = false;
      $("watchStop").disabled = false;
      setWatchStatus("Camera running. Aim at the TV and tap Capture frame when useful gameplay is visible.");
    } catch (error) {
      const detail = error && error.name ? error.name : "CameraError";
      setWatchStatus("Could not start camera (" + detail + "). Check browser camera permission and try again.");
    }
  }

  function stopWatchCamera(updateStatus = true) {
    if (watchStream) {
      watchStream.getTracks().forEach(track => track.stop());
      watchStream = null;
    }
    const video = $("watchVideo");
    if (video) video.srcObject = null;
    if ($("watchVideoWrap")) $("watchVideoWrap").hidden = true;
    if ($("watchCapture")) $("watchCapture").disabled = true;
    if ($("watchStop")) $("watchStop").disabled = true;
    if (updateStatus) setWatchStatus("Camera stopped. Captured frames remain available until you leave or refresh this page.");
  }

  function captureWatchFrame() {
    const video = $("watchVideo");
    const canvas = $("watchCanvas");
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setWatchStatus("No camera frame yet. Start the camera and wait for the preview.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) {
        setWatchStatus("Frame capture failed. Try again.");
        return;
      }
      if (lastCapturedUrl) URL.revokeObjectURL(lastCapturedUrl);
      lastCapturedUrl = URL.createObjectURL(blob);
      const image = $("watchCapturedImage");
      image.src = lastCapturedUrl;
      image.hidden = false;
      $("watchDownload").href = lastCapturedUrl;
      $("watchDownload").download = "joygpt-frame-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
      $("watchDownload").hidden = false;
      $("watchFrameMeta").textContent = "Captured " + canvas.width + " × " + canvas.height + " pixels. This frame is stored locally in this page; it has not been sent to an AI.";
      setWatchStatus("Frame captured! Use Download frame to save it, then attach it in ChatGPT for gameplay hints.");
    }, "image/jpeg", 0.88);
  }

  if ($("watchStart")) $("watchStart").addEventListener("click", startWatchCamera);
  if ($("watchStop")) $("watchStop").addEventListener("click", () => stopWatchCamera());
  if ($("watchCapture")) $("watchCapture").addEventListener("click", captureWatchFrame);
  window.addEventListener("pagehide", () => stopWatchCamera(false));


  // Research bench: inspect user-selected files locally, scan a public GitHub
  // repository tree, and diagnose direct URL responses. None of these uploads files.
  const MAX_RESEARCH_FILE_BYTES = 10 * 1024 * 1024;
  let lastFileResearchReport = null;
  let lastRepoResearchReport = null;
  let lastUrlResearchReport = null;

  function hexPreview(bytes, maxBytes = 256) {
    const view = Array.from(bytes.subarray(0, maxBytes), b => b.toString(16).padStart(2, "0").toUpperCase());
    const rows = [];
    for (let i = 0; i < view.length; i += 16) {
      const row = view.slice(i, i + 16);
      const offset = i.toString(16).padStart(8, "0");
      const hex = row.join(" ").padEnd(16 * 3 - 1, " ");
      const ascii = Array.from(bytes.subarray(i, Math.min(i + 16, maxBytes)), b => b >= 32 && b <= 126 ? String.fromCharCode(b) : ".");
      rows.push(offset + "  " + hex + "  |" + ascii.join("") + "|");
    }
    return rows.join("\n") || "(empty file)";
  }

  function byteString(bytes, from, to) {
    return Array.from(bytes.subarray(from, to), b => String.fromCharCode(b)).join("");
  }

  function signatureClues(bytes) {
    const starts = (values) => values.every((value, index) => bytes[index] === value);
    const clues = [];
    const signatures = [
      { name: "PNG image", bytes: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] },
      { name: "JPEG image", bytes: [0xff,0xd8,0xff] },
      { name: "PDF document", bytes: [0x25,0x50,0x44,0x46,0x2d] },
      { name: "ZIP container (also used by some archives/packages)", bytes: [0x50,0x4b,0x03,0x04] },
      { name: "Empty ZIP/end-of-central-directory marker", bytes: [0x50,0x4b,0x05,0x06] },
      { name: "GZIP data", bytes: [0x1f,0x8b] },
      { name: "7-Zip archive", bytes: [0x37,0x7a,0xbc,0xaf,0x27,0x1c] },
      { name: "RAR archive", bytes: [0x52,0x61,0x72,0x21,0x1a,0x07] },
      { name: "SQLite database", bytes: [0x53,0x51,0x4c,0x69,0x74,0x65,0x20,0x66,0x6f,0x72,0x6d,0x61,0x74,0x20,0x33] },
      { name: "WebAssembly binary", bytes: [0x00,0x61,0x73,0x6d] },
      { name: "ELF executable/shared object", bytes: [0x7f,0x45,0x4c,0x46] },
      { name: "Windows PE executable (MZ header)", bytes: [0x4d,0x5a] },
      { name: "GIF image", bytes: [0x47,0x49,0x46,0x38] },
      { name: "RIFF container (often WAV/WEBP/AVI)", bytes: [0x52,0x49,0x46,0x46] },
      { name: "Ogg media", bytes: [0x4f,0x67,0x67,0x53] }
    ];
    for (const signature of signatures) {
      if (bytes.length >= signature.bytes.length && starts(signature.bytes)) clues.push(signature.name);
    }
    if (bytes.length >= 4 && byteString(bytes,0,4) === "Cr24") clues.push("Chromium extension/package signature");
    if (bytes.length >= 4 && bytes[0] === 0x94) {
      clues.push("Weak header clue only: byte 0x94 resembles an old-format OpenPGP secret-key packet marker; a single byte cannot confirm that format and may be a false positive.");
    }
    if (!clues.length) clues.push("No supported common file signature recognized at byte 0. The file may use a proprietary format, a wrapper/header, or an offset signature.");
    return clues;
  }

  function asciiStringClues(bytes) {
    const results = [];
    const minLength = 5;
    let start = -1;
    for (let i = 0; i <= bytes.length; i++) {
      const printable = i < bytes.length && bytes[i] >= 32 && bytes[i] <= 126;
      if (printable && start < 0) start = i;
      if ((!printable || i === bytes.length) && start >= 0) {
        const length = i - start;
        if (length >= minLength) {
          results.push({ offset: "0x" + start.toString(16).toUpperCase().padStart(8, "0"), length, text: byteString(bytes, start, Math.min(i, start + 240)) });
        }
        start = -1;
      }
    }
    return results;
  }

  function calculateEntropy(bytes) {
    if (!bytes.length) return 0;
    const freq = new Uint32Array(256);
    for (const byte of bytes) freq[byte]++;
    let entropy = 0;
    for (const count of freq) {
      if (!count) continue;
      const p = count / bytes.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  async function inspectSelectedResearchFile() {
    const status = $("fileResearchStatus");
    const output = $("fileResearchOutput");
    const file = $("researchFileInput").files && $("researchFileInput").files[0];
    if (!file) {
      status.textContent = "Choose a file first.";
      return;
    }
    if (file.size > MAX_RESEARCH_FILE_BYTES) {
      status.textContent = "File is larger than the 10 MB inspector limit. Choose a smaller file for this first pass.";
      return;
    }
    status.textContent = "Reading file locally and calculating clues…";
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const strings = asciiStringClues(bytes);
      const relevantPattern = /odyssey|mario|world|kingdom|savedata|save.?data|gameprogress|achievement|checkpoint|coin|shine|moon|scenario|forest|woods|metro|lake|sand|snow|seaside|luncheon|bowser|mushroom/i;
      const relevantStrings = strings.filter(item => relevantPattern.test(item.text));
      let sha256 = "not available in this browser context";
      try {
        if (crypto && crypto.subtle && typeof crypto.subtle.digest === "function") {
          const hash = await crypto.subtle.digest("SHA-256", buffer);
          sha256 = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
        }
      } catch (error) {
        sha256 = "Could not calculate: " + error.name + ": " + error.message;
      }
      const report = {
        tool: "JoyGPT Binary File Inspector",
        reportVersion: 1,
        inspectedAt: new Date().toISOString(),
        localOnly: true,
        file: { name: file.name, sizeBytes: file.size, reportedMimeType: file.type || "(browser supplied no MIME type)", lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null },
        sha256,
        first32BytesHex: Array.from(bytes.subarray(0, 32), b => b.toString(16).padStart(2, "0")).join(" "),
        commonSignatureClues: signatureClues(bytes),
        shannonEntropyBitsPerByte: Number(calculateEntropy(bytes).toFixed(4)),
        printableAsciiRunCount: strings.length,
        gameRelatedStringCount: relevantStrings.length,
        relevantStrings: relevantStrings.slice(0, 100),
        printableStringsSample: strings.slice(0, 80),
        hexDumpFirst256Bytes: hexPreview(bytes, 256),
        limitations: [
          "Signatures and readable strings are heuristics, not proof of file format or validity.",
          "A file may contain strings from a schema/table or game resources without being a complete save file.",
          "No file content was uploaded, modified, decrypted, or imported."
        ]
      };
      lastFileResearchReport = report;
      const lines = [
        "FILE: " + file.name,
        "SIZE: " + file.size + " bytes (" + (file.size / 1048576).toFixed(3) + " MiB)",
        "BROWSER MIME TYPE: " + (file.type || "(none reported)"),
        "LAST MODIFIED: " + (report.file.lastModified || "(not provided)"),
        "SHA-256: " + sha256,
        "",
        "COMMON SIGNATURE CLUES:",
        ...report.commonSignatureClues.map(item => "- " + item),
        "",
        "SHANNON ENTROPY: " + report.shannonEntropyBitsPerByte + " bits/byte (maximum 8; not a file-type verdict)",
        "PRINTABLE ASCII RUNS: " + strings.length,
        "GAME-RELATED STRING MATCHES: " + relevantStrings.length,
        "MATCHING STRINGS (first 100):",
        ...(relevantStrings.length ? relevantStrings.slice(0, 100).map(item => item.offset + " [" + item.length + " bytes] " + item.text) : ["(none)"]),
        "",
        "HEX / ASCII PREVIEW (first 256 bytes):",
        report.hexDumpFirst256Bytes,
        "",
        "CAUTION: strings such as GameProgressData, WorldData, or Checkpoint are evidence of related names, not proof of a valid importable save. A format-specific parser and trusted source are still needed."
      ];
      output.textContent = lines.join("\n");
      status.textContent = "Inspection complete. File stayed in this page; " + (crypto && crypto.subtle ? "SHA-256 was attempted." : "SHA-256 may be unavailable on this browser.");
    } catch (error) {
      status.textContent = "Inspection failed: " + error.name + ": " + error.message;
      output.textContent = "The browser could not read the selected file. No upload was attempted.";
    }
  }

  function copyResearchText(textValue, statusId, emptyMessage) {
    const status = $(statusId);
    if (!textValue) {
      status.textContent = emptyMessage || "No report available yet.";
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(textValue).then(
        () => { status.textContent = "Report copied to clipboard."; },
        () => { status.textContent = "Clipboard blocked. Select the report and copy it manually."; }
      );
    } else {
      status.textContent = "Clipboard API unavailable. Select the report and copy it manually.";
    }
  }

  function downloadResearchJson(report, filename, statusId) {
    if (!report) {
      $(statusId).textContent = "Run the test first; there is no report to download.";
      return;
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.textContent = "Download report";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $(statusId).textContent = "JSON report download requested.";
  }

  $("inspectResearchFile").addEventListener("click", inspectSelectedResearchFile);
  $("copyFileResearch").addEventListener("click", () => copyResearchText($("fileResearchOutput").textContent, "fileResearchStatus", "Inspect a file first."));
  $("downloadFileResearch").addEventListener("click", () => downloadResearchJson(lastFileResearchReport, "joygpt-file-report.json", "fileResearchStatus"));

  function parseGitHubRepoUrl(value) {
    let url;
    try { url = new URL(value.trim()); } catch (_) { throw new Error("Enter a full public GitHub repository URL."); }
    if (url.hostname.toLowerCase() !== "github.com" || (url.protocol !== "https:" && url.protocol !== "http:")) {
      throw new Error("For this scan, use a URL on github.com, not a raw-file URL or another host.");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) throw new Error("The URL needs an owner and repository name.");
    const owner = segments[0];
    const name = segments[1].replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("The repository URL contains unsupported characters.");
    return { owner, name, repoUrl: "https://github.com/" + owner + "/" + name };
  }

  async function scanResearchRepository() {
    const status = $("repoResearchStatus");
    const output = $("repoResearchOutput");
    const list = $("repoBinList");
    const value = $("researchRepoUrl").value.trim();
    list.replaceChildren();
    if (!value) { status.textContent = "Paste a GitHub repository URL first."; return; }
    status.textContent = "Reading public repository metadata and file tree…";
    output.textContent = "Scanning…";
    try {
      const parsed = parseGitHubRepoUrl(value);
      const metaUrl = "https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.name);
      const metaResponse = await fetch(metaUrl, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" });
      if (!metaResponse.ok) throw new Error("GitHub metadata request returned HTTP " + metaResponse.status + ". The repo may be private, missing, rate-limited, or blocked.");
      const meta = await metaResponse.json();
      const branch = meta.default_branch || "main";
      const treeUrl = "https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.name) + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1";
      const treeResponse = await fetch(treeUrl, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" });
      if (!treeResponse.ok) throw new Error("GitHub file-tree request returned HTTP " + treeResponse.status + ".");
      const treeData = await treeResponse.json();
      const tree = Array.isArray(treeData.tree) ? treeData.tree : [];
      const binFiles = tree.filter(item => item.type === "blob" && /\.bin$/i.test(item.path || ""));
      const gameBins = binFiles.filter(item => /(wood|forest|cascade|sand|lake|metro|snow|sea|lunch|bowser|moon|mushroom|kingdom|world)/i.test(item.path));
      let readmeLines = [];
      let readmeStatus = "README not found or unavailable.";
      try {
        const readmeResponse = await fetch("https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.name) + "/readme", { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" });
        if (readmeResponse.ok) {
          const readme = await readmeResponse.json();
          let decoded = "";
          if (readme.encoding === "base64" && readme.content) {
            const raw = atob(readme.content.replace(/\s/g, ""));
            const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
            decoded = new TextDecoder().decode(bytes);
          } else if (typeof readme.content === "string") decoded = readme.content;
          readmeLines = decoded.split("\n").map((line, index) => ({ line: index + 1, text: line.trim() })).filter(item => item.text && /(save.?data|odyssey|kingdom|\.bin|emulat|format|import|backup|switch|yuzu|ryujinx|parser|convert)/i.test(item.text)).slice(0, 20);
          readmeStatus = readmeLines.length ? "Matched " + readmeLines.length + " README lines about saves/formats." : "README loaded, but no save/format keywords matched.";
        } else readmeStatus = "README endpoint returned HTTP " + readmeResponse.status + ".";
      } catch (error) { readmeStatus = "README scan failed: " + error.message; }

      const files = binFiles.slice(0, 200).map(item => ({
        path: item.path, sizeBytes: Number.isFinite(item.size) ? item.size : null, sha: item.sha || null,
        githubUrl: parsed.repoUrl + "/blob/" + encodeURIComponent(branch) + "/" + item.path.split("/").map(encodeURIComponent).join("/"),
        rawUrl: "https://raw.githubusercontent.com/" + parsed.owner + "/" + parsed.name + "/" + branch.split("/").map(encodeURIComponent).join("/") + "/" + item.path.split("/").map(encodeURIComponent).join("/")
      }));
      lastRepoResearchReport = {
        tool: "JoyGPT GitHub Repository Researcher", reportVersion: 1, scannedAt: new Date().toISOString(),
        repository: { name: meta.full_name || parsed.owner + "/" + parsed.name, url: parsed.repoUrl, description: meta.description || null, defaultBranch: branch, stars: meta.stargazers_count, archived: Boolean(meta.archived), visibility: meta.private ? "private" : "public" },
        tree: { entryCount: tree.length, truncated: Boolean(treeData.truncated), binFileCount: binFiles.length, kingdomNameBinCount: gameBins.length, files },
        readme: { status: readmeStatus, matchedLines: readmeLines },
        limitations: ["The scanner lists names and metadata; it does not prove binary file contents or save compatibility.", "The scanner does not download every .bin file.", "GitHub's public API, browser CORS, rate limits, and repo size can affect results."]
      };
      const rows = files.map((file, index) => {
        const row = document.createElement("div");
        row.style.cssText = "border-top:1px solid var(--line);padding:8px 0";
        const title = document.createElement("div");
        title.textContent = (index + 1) + ". " + file.path + " (" + (file.sizeBytes === null ? "size not supplied" : file.sizeBytes.toLocaleString() + " bytes") + ")";
        title.style.fontWeight = "650";
        const github = document.createElement("a");
        github.href = file.githubUrl; github.target = "_blank"; github.rel = "noopener noreferrer"; github.textContent = "Open on GitHub";
        const raw = document.createElement("a");
        raw.href = file.rawUrl; raw.target = "_blank"; raw.rel = "noopener noreferrer"; raw.textContent = "Raw file URL";
        row.append(title, github, document.createTextNode(" · "), raw);
        list.appendChild(row);
      });
      if (!files.length) {
        const note = document.createElement("p");
        note.textContent = "No .bin files were found in the returned tree.";
        list.appendChild(note);
      }
      const lines = [
        "REPOSITORY: " + lastRepoResearchReport.repository.name,
        "URL: " + parsed.repoUrl,
        "DESCRIPTION: " + (meta.description || "(none)"),
        "DEFAULT BRANCH: " + branch,
        "ARCHIVED: " + Boolean(meta.archived),
        "STARS: " + (meta.stargazers_count ?? "(not supplied)"),
        "TREE ENTRIES RETURNED: " + tree.length + (treeData.truncated ? " (TRUNCATED BY API)" : ""),
        ".BIN FILES: " + binFiles.length + "; kingdom/world-named .bin paths: " + gameBins.length,
        "",
        "BINARY FILES (first 200):",
        ...(files.length ? files.map(file => "- " + file.path + " | " + (file.sizeBytes === null ? "size unknown" : file.sizeBytes + " bytes") + " | " + file.rawUrl) : ["(none found in tree)"]),
        "",
        "README: " + readmeStatus,
        ...readmeLines.map(item => "L" + item.line + ": " + item.text),
        "",
        "LIMIT: File names and README text cannot prove that a .bin is a valid save or that Switch 2 supports importing it."
      ];
      output.textContent = lines.join("\n");
      status.textContent = "Scan finished. Found " + binFiles.length + " .bin file(s)" + (treeData.truncated ? "; GitHub reported a truncated tree." : ".") + " Open the listed paths/Raw URLs for the next test.";
    } catch (error) {
      lastRepoResearchReport = { tool: "JoyGPT GitHub Repository Researcher", scannedAt: new Date().toISOString(), input: value, error: error.message };
      output.textContent = "SCAN FAILED\n" + error.name + ": " + error.message + "\n\nA failure here can mean browser CORS/network blocking, API rate limiting, a private/missing repository, or a request problem. It does not prove that the repository or file is invalid.";
      status.textContent = "Repository scan did not complete.";
    }
  }

  $("scanResearchRepo").addEventListener("click", scanResearchRepository);
  $("copyRepoResearch").addEventListener("click", () => copyResearchText($("repoResearchOutput").textContent, "repoResearchStatus", "Scan a repository first."));

  async function testResearchDirectUrl() {
    const status = $("urlResearchStatus");
    const output = $("urlResearchOutput");
    const value = $("researchUrl").value.trim();
    if (!value) { status.textContent = "Enter a direct file URL first."; return; }
    let url;
    try { url = new URL(value); } catch (_) { status.textContent = "Enter a complete URL including https://."; return; }
    if (!["https:", "http:"].includes(url.protocol)) { status.textContent = "Only http:// and https:// URLs are supported."; return; }
    status.textContent = "Requesting a small byte range…";
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url.href, {
        method: "GET",
        headers: { "Range": "bytes=0-511" },
        cache: "no-store",
        mode: "cors",
        redirect: "follow",
        signal: controller.signal
      });
      const elapsedMs = Math.round(performance.now() - started);
      let firstChunk = new Uint8Array(0);
      let readNote = "Response body not readable.";
      if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        try {
          const read = await reader.read();
          if (!read.done && read.value) firstChunk = read.value.slice(0, 4096);
          readNote = read.done ? "Body ended before first chunk." : "Captured first response chunk only, then cancelled reading.";
        } finally {
          try { await reader.cancel(); } catch (_) {}
        }
      } else {
        readNote = "Streaming reader unavailable; body was not read.";
      }
      const report = {
        tool: "JoyGPT Direct URL Diagnostics", reportVersion: 1, testedAt: new Date().toISOString(),
        inputUrl: url.href, finalUrl: response.url, requestMethod: "GET", requestedRange: "bytes=0-511",
        responseType: response.type, httpStatus: response.status, statusText: response.statusText,
        ok: response.ok, elapsedMs, contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"), contentRange: response.headers.get("content-range"),
        acceptRanges: response.headers.get("accept-ranges"), contentDisposition: response.headers.get("content-disposition"),
        firstChunkBytesCaptured: firstChunk.length, firstChunkHex: Array.from(firstChunk.subarray(0,128), b => b.toString(16).padStart(2,"0")).join(" "),
        firstChunkAscii: byteString(firstChunk, 0, Math.min(firstChunk.length, 256)).replace(/[^\x20-\x7e]/g, "."),
        readNote,
        interpretation: response.status === 206 ? "The server honored a byte-range request." : response.status === 200 ? "HTTP 200 response. The server may have ignored the byte range; the test cancelled body reading after the first chunk." : "HTTP response received; inspect the status and content type.",
        limitations: ["A successful fetch proves only that this page could fetch the URL; opening the link directly may behave differently.", "A CORS error does not tell the page the server's real status.", "This test does not tell us whether the Switch OS accepts the file."]
      };
      lastUrlResearchReport = report;
      output.textContent = [
        "HTTP STATUS: " + response.status + " " + response.statusText,
        "ELAPSED: " + elapsedMs + " ms",
        "FINAL URL: " + response.url,
        "RESPONSE TYPE: " + response.type,
        "CONTENT-TYPE: " + (report.contentType || "(not supplied)"),
        "CONTENT-LENGTH: " + (report.contentLength || "(not supplied)"),
        "CONTENT-RANGE: " + (report.contentRange || "(not supplied)"),
        "ACCEPT-RANGES: " + (report.acceptRanges || "(not supplied)"),
        "CONTENT-DISPOSITION: " + (report.contentDisposition || "(not supplied)"),
        "FIRST CHUNK CAPTURED: " + firstChunk.length + " bytes",
        "FIRST BYTES: " + (report.firstChunkHex || "(none)"),
        "ASCII PREVIEW: " + (report.firstChunkAscii || "(none)"),
        "READ NOTE: " + readNote,
        "",
        report.interpretation,
        "Opening this URL directly may behave differently from fetching it inside this page."
      ].join("\n");
      status.textContent = "URL request returned HTTP " + response.status + " in " + elapsedMs + " ms.";
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started);
      lastUrlResearchReport = {
        tool: "JoyGPT Direct URL Diagnostics", reportVersion: 1, testedAt: new Date().toISOString(),
        inputUrl: url.href, elapsedMs, errorName: error.name, errorMessage: error.message,
        likelyCauses: error.name === "AbortError" ? ["Request exceeded the 12-second timeout or was cancelled."] : ["CORS blocked the response from JavaScript.", "The network/browser blocked the request.", "TLS, DNS, or the remote server failed."],
        note: "When fetch rejects, browser security intentionally hides the exact network/HTTP cause. This is not proof that the file itself is corrupted."
      };
      output.textContent = [
        "FETCH FAILED AFTER " + elapsedMs + " ms",
        error.name + ": " + error.message,
        "",
        "Possible causes:",
        "- CORS blocked the response from JavaScript.",
        "- The network or browser blocked the request.",
        "- DNS, TLS, timeout, or remote server issue.",
        "",
        "A fetch failure is not the same thing as a corrupt file. The browser does not expose the exact cause in many cases."
      ].join("\n");
      status.textContent = "URL test failed. Report the error text plus the approximate time of the test.";
    } finally {
      clearTimeout(timeout);
    }
  }

  $("testResearchUrl").addEventListener("click", testResearchDirectUrl);
  $("copyUrlResearch").addEventListener("click", () => copyResearchText($("urlResearchOutput").textContent, "urlResearchStatus", "Test a URL first."));
  $("downloadUrlResearch").addEventListener("click", () => downloadResearchJson(lastUrlResearchReport, "joygpt-url-report.json", "urlResearchStatus"));


  loadSavedConfig();
  showApiChecks();
})();