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
      if (!health.ok || !data.ok || data.version !== "ws-lab-1" || !data.websocketSupported) {
        status.textContent = "The deployed Worker needs the WebSocket-lab update. Update/redeploy worker.js in Cloudflare, then retry. Health response: " + JSON.stringify(data);
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

  loadSavedConfig();
  showApiChecks();
})();