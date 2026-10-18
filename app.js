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

  function getSignalConfig() {
    const endpoint = endpointInput.value.trim().replace(/\/$/, "");
    const session = sessionInput.value.trim();
    if (!endpoint) throw new Error("Enter the deployed Worker URL first.");
    let parsed;
    try { parsed = new URL(endpoint); } catch (_) { throw new Error("Backend URL is not valid."); }
    if (parsed.protocol !== "https:") throw new Error("Use an HTTPS Worker URL.");
    if (!session) throw new Error("Enter the same session code on both devices.");
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

  showApiChecks();
})();