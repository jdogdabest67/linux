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

  loadSavedConfig();
  showApiChecks();
})();